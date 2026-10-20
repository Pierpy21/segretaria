import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import {
  clientClinical,
  clientFieldDefinitions,
  clients,
  type ClientClinicalRow,
  type ClientFieldDefinitionRow,
  type ClientRow,
  type NewClientClinicalRow,
  type NewClientRow,
} from "@/drizzle/schema";
import type { ClientAttributes, ClientFieldDefinition, FieldEntity } from "@/app/types/clients";
import type { ClientResponse, ClinicalClientKey, CreateClientInput } from "@/app/types/api";
import { getCalendarTimeZone } from "@/lib/calendar-sync/time";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { validateAttributes } from "@/lib/validation";
import { ageFrom, formatItalianLong, initialsOf, parseDateInput } from "./format";

const MAX_CODE_ATTEMPTS = 5;

/** Campi sensibili del cliente (ex clinici): vivono in client_clinical. */
const SENSITIVE_CLIENT_KEYS: readonly ClinicalClientKey[] = [
  "recommendation",
  "previousVisit",
  "treatments",
];

/** Permessi sui dati sensibili del richiedente (sensitive:read / sensitive:write). */
export interface SensitiveAccess {
  read: boolean;
  write: boolean;
}

type SensitiveFields = Omit<NewClientClinicalRow, "clientId" | "companyId" | "attributes" | "createdAt" | "updatedAt">;

const EMPTY_SENSITIVE = {
  recommendation: "",
  previousVisit: {},
  treatments: [],
} as unknown as Required<SensitiveFields>;

/**
 * I dati sensibili stanno in client_clinical (RLS: sensitive:read / sensitive:write).
 * `sensitiveRead` = il richiedente ha sensitive:read: solo allora i campi sensibili sono inclusi
 * (anche gli attributi sensibili, uniti a quelli non sensibili).
 */
function toClient(
  row: ClientRow,
  sensitiveRow: ClientClinicalRow | null,
  now: Date,
  tz: string,
  sensitiveRead: boolean,
): ClientResponse {
  const view: ClientResponse = {
    id: row.code,
    name: row.name,
    gender: row.gender,
    avatar: row.avatar,
    initials: initialsOf(row.name),
    dateOfBirth: formatItalianLong(row.dateOfBirth),
    age: ageFrom(row.dateOfBirth, now, tz),
    phone: row.phone,
    email: row.email,
    address: row.address,
    fiscalCode: row.fiscalCode,
    clientType: row.clientType,
    attributes: row.attributes,
    insurance: row.insurance,
  };
  if (sensitiveRead) {
    const s = sensitiveRow ?? EMPTY_SENSITIVE;
    view.attributes = { ...row.attributes, ...sensitiveRow?.attributes };
    view.recommendation = s.recommendation;
    view.previousVisit = s.previousVisit;
    view.treatments = s.treatments;
  }
  return view;
}

function toDefinition(row: ClientFieldDefinitionRow): ClientFieldDefinition {
  return {
    clientType: row.clientType,
    key: row.key,
    label: row.label,
    type: row.type,
    options: row.options,
    required: row.required,
    position: row.position,
    sensitive: row.sensitive,
  };
}

/**
 * Definizioni dei campi dello studio, ordinate per position.
 * `sensitiveRead` = sensitive:read: senza, le definizioni sensibili sono escluse.
 * `entity` = 'client' (default) per i campi cliente, 'asset' per i campi dei beni (clientType = asset_type).
 */
export async function listFieldDefinitions(
  tx: Tx,
  companyId: string,
  clientType: string | undefined,
  sensitiveRead: boolean,
  entity: FieldEntity = "client",
): Promise<ClientFieldDefinition[]> {
  const conds: SQL[] = [
    eq(clientFieldDefinitions.companyId, companyId),
    eq(clientFieldDefinitions.entity, entity),
  ];
  if (clientType) conds.push(eq(clientFieldDefinitions.clientType, clientType));
  if (!sensitiveRead) conds.push(eq(clientFieldDefinitions.sensitive, false));
  const rows = await tx
    .select()
    .from(clientFieldDefinitions)
    .where(and(...conds))
    .orderBy(asc(clientFieldDefinitions.clientType), asc(clientFieldDefinitions.position));
  return rows.map(toDefinition);
}

/**
 * Valida gli attributi con le definizioni del tipo cliente (tutte, anche le sensibili)
 * e li separa: sensitive → client_clinical.attributes, altri → clients.attributes.
 * Nessun controllo di permesso qui: lo fa il chiamante.
 */
async function splitAttributes(
  tx: Tx,
  companyId: string,
  clientType: string,
  raw: ClientAttributes | undefined,
  partial: boolean,
): Promise<{ pub: ClientAttributes; sens: ClientAttributes }> {
  const defs = await listFieldDefinitions(tx, companyId, clientType, true);
  const values = validateAttributes(raw ?? {}, defs, partial);
  const sensitiveKeys = new Set(defs.filter((d) => d.sensitive).map((d) => d.key));
  const pub: ClientAttributes = {};
  const sens: ClientAttributes = {};
  for (const [key, v] of Object.entries(values)) {
    if (sensitiveKeys.has(key)) sens[key] = v;
    else pub[key] = v;
  }
  return { pub, sens };
}

/** Il input contiene dati sensibili (attributi o campi sensibili con contenuto)? */
function hasSensitiveData(input: CreateClientInput, sens: ClientAttributes): boolean {
  return Object.keys(sens).length > 0
    || (input.recommendation ?? "").trim() !== ""
    || Object.values(input.previousVisit).some((v) => v !== "")
    || input.treatments.length > 0;
}

function parseBirthDate(input: string): string {
  const parsed = parseDateInput(input);
  if (!parsed) throw new ValidationError("Data di nascita non valida (es. 14 giugno 1995 o 1995-06-14)");
  return parsed;
}

function assertName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Nome obbligatorio");
  return trimmed;
}

/** Codice applicativo "PT-AAAA-NNNN" (unicità garantita da UNIQUE(company_id, code) + retry). */
function newClientCode(now: Date): string {
  const seq = String(randomInt(0, 10_000)).padStart(4, "0");
  return `PT-${now.getFullYear()}-${seq}`;
}

export async function listClients(tx: Tx, companyId: string, sensitiveRead: boolean): Promise<ClientResponse[]> {
  const now = new Date();
  const tz = getCalendarTimeZone();
  const where = eq(clients.companyId, companyId);
  if (!sensitiveRead) {
    const rows = await tx.select().from(clients).where(where).orderBy(asc(clients.name));
    return rows.map((row) => toClient(row, null, now, tz, false));
  }
  const rows = await tx
    .select({ client: clients, sensitive: clientClinical })
    .from(clients)
    .leftJoin(clientClinical, eq(clientClinical.clientId, clients.id))
    .where(where)
    .orderBy(asc(clients.name));
  return rows.map((r) => toClient(r.client, r.sensitive, now, tz, true));
}

/** `code` è l'id applicativo del cliente (es. "PT-2026-0142"). */
export async function getClient(
  tx: Tx,
  companyId: string,
  code: string,
  sensitiveRead: boolean,
): Promise<ClientResponse | null> {
  const now = new Date();
  const tz = getCalendarTimeZone();
  const rows = await tx
    .select()
    .from(clients)
    .where(and(eq(clients.companyId, companyId), eq(clients.code, code)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return toClient(row, sensitiveRead ? await getSensitiveRow(tx, row.id) : null, now, tz, sensitiveRead);
}

async function getSensitiveRow(tx: Tx, clientId: string): Promise<ClientClinicalRow | null> {
  const rows = await tx
    .select()
    .from(clientClinical)
    .where(eq(clientClinical.clientId, clientId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Crea il cliente. Senza sensitive:write nasce senza riga client_clinical; con dati sensibili
 * nel corpo (attributi o campi con contenuto) serve sensitive:write → ForbiddenError.
 * Il retry sul codice casuale usa ON CONFLICT DO NOTHING (non un errore 23505):
 * un errore abortirebbe la transazione, il DO NOTHING no. Stessa tx, nessun round-trip extra.
 */
export async function createClient(
  tx: Tx,
  companyId: string,
  input: CreateClientInput,
  access: SensitiveAccess,
): Promise<ClientResponse> {
  const now = new Date();
  const tz = getCalendarTimeZone();
  const { pub, sens } = await splitAttributes(tx, companyId, input.clientType, input.attributes, false);
  if (!access.write && hasSensitiveData(input, sens)) {
    throw new ForbiddenError("Dati sensibili non consentiti per il tuo ruolo");
  }
  const values = {
    companyId,
    clientType: input.clientType,
    attributes: pub,
    name: assertName(input.name),
    gender: input.gender,
    avatar: input.avatar ?? "",
    dateOfBirth: parseBirthDate(input.dateOfBirth),
    phone: input.phone ?? "",
    email: input.email ?? "",
    address: input.address ?? "",
    fiscalCode: input.fiscalCode ?? "",
    insurance: input.insurance,
  };
  const sensitiveValues: SensitiveFields & { attributes: ClientAttributes } = {
    recommendation: input.recommendation ?? "",
    previousVisit: input.previousVisit,
    treatments: input.treatments,
    attributes: sens,
  };

  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const inserted = await tx
      .insert(clients)
      .values({ ...values, code: newClientCode(now) })
      .onConflictDoNothing()
      .returning();
    const row = inserted[0];
    if (row) {
      let sensitiveRow: ClientClinicalRow | null = null;
      if (access.write) {
        const [created] = await tx
          .insert(clientClinical)
          .values({ ...sensitiveValues, clientId: row.id, companyId })
          .returning();
        sensitiveRow = created ?? null;
      }
      return toClient(row, sensitiveRow, now, tz, access.read);
    }
  }
  throw new ConflictError("Impossibile generare un codice cliente univoco, riprova");
}

/**
 * Gli attributi del patch sono uniti (non sostituiti): chiave a `null` = svuotata.
 * Campi sensibili e attributi sensibili richiedono sensitive:write.
 */
export async function updateClient(
  tx: Tx,
  companyId: string,
  code: string,
  patch: Partial<CreateClientInput>,
  access: SensitiveAccess,
): Promise<ClientResponse> {
  if (!access.write && SENSITIVE_CLIENT_KEYS.some((k) => patch[k] !== undefined)) {
    throw new ForbiddenError("Modifica dei dati sensibili non consentita per il tuo ruolo");
  }
  const now = new Date();
  const tz = getCalendarTimeZone();

  const [current] = await tx
    .select({ clientType: clients.clientType })
    .from(clients)
    .where(and(eq(clients.companyId, companyId), eq(clients.code, code)))
    .limit(1);
  if (!current) throw new NotFoundError("Cliente non trovato");
  const { pub, sens } = await splitAttributes(tx, companyId, current.clientType, patch.attributes, true);
  if (!access.write && Object.keys(sens).length > 0) {
    throw new ForbiddenError("Attributi sensibili non consentiti per il tuo ruolo");
  }

  const set: Omit<Partial<NewClientRow>, "attributes"> & { attributes?: ClientAttributes | SQL } = { updatedAt: now };
  if (patch.name !== undefined) set.name = assertName(patch.name);
  if (patch.gender !== undefined) set.gender = patch.gender;
  if (patch.avatar !== undefined) set.avatar = patch.avatar;
  if (patch.dateOfBirth !== undefined) set.dateOfBirth = parseBirthDate(patch.dateOfBirth);
  if (patch.phone !== undefined) set.phone = patch.phone;
  if (patch.email !== undefined) set.email = patch.email;
  if (patch.address !== undefined) set.address = patch.address;
  if (patch.fiscalCode !== undefined) set.fiscalCode = patch.fiscalCode;
  if (patch.insurance !== undefined) set.insurance = patch.insurance;
  if (Object.keys(pub).length > 0) {
    set.attributes = sql`${clients.attributes} || ${JSON.stringify(pub)}::jsonb`;
  }

  const sensitiveSet: SensitiveFields = {};
  if (patch.recommendation !== undefined) sensitiveSet.recommendation = patch.recommendation;
  if (patch.previousVisit !== undefined) sensitiveSet.previousVisit = patch.previousVisit;
  if (patch.treatments !== undefined) sensitiveSet.treatments = patch.treatments;

  const updated = await tx
    .update(clients)
    .set(set)
    .where(and(eq(clients.companyId, companyId), eq(clients.code, code)))
    .returning();
  const row = updated[0];
  if (!row) throw new NotFoundError("Cliente non trovato");

  // Senza sensitive:write nessuna scrittura su client_clinical: solo lettura (se consentita).
  if (!access.write) {
    return toClient(row, access.read ? await getSensitiveRow(tx, row.id) : null, now, tz, access.read);
  }

  // Upsert: un cliente senza riga sensibile (es. inserito fuori dall'app) la ottiene qui.
  const hasSens = Object.keys(sens).length > 0;
  const hasSensitive = Object.keys(sensitiveSet).length > 0 || hasSens;
  let sensitiveRow: ClientClinicalRow | null;
  if (hasSensitive) {
    const [upserted] = await tx
      .insert(clientClinical)
      .values({ ...sensitiveSet, attributes: sens, clientId: row.id, companyId })
      .onConflictDoUpdate({
        target: clientClinical.clientId,
        set: {
          ...sensitiveSet,
          ...(hasSens ? { attributes: sql`${clientClinical.attributes} || ${JSON.stringify(sens)}::jsonb` } : {}),
          updatedAt: now,
        },
      })
      .returning();
    sensitiveRow = upserted ?? null;
  } else {
    sensitiveRow = access.read ? await getSensitiveRow(tx, row.id) : null;
  }
  return toClient(row, sensitiveRow, now, tz, access.read);
}
