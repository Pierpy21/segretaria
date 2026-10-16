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
import type { ClientAttributes, ClientFieldDefinition } from "@/app/types/clients";
import type { ClientResponse, ClinicalClientKey, CreateClientInput } from "@/app/types/api";
import { getCalendarTimeZone } from "@/lib/calendar-sync/time";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { validateAttributes } from "@/lib/validation";
import { ageFrom, formatItalianLong, initialsOf, parseDateInput } from "./format";

const MAX_CODE_ATTEMPTS = 5;

const CLINICAL_KEYS: readonly ClinicalClientKey[] = [
  "recommendation",
  "previousVisit",
  "selectedTooth",
  "xrayFindings",
  "treatments",
];

type ClinicalFields = Omit<NewClientClinicalRow, "clientId" | "companyId" | "attributes" | "createdAt" | "updatedAt">;

const EMPTY_CLINICAL = {
  recommendation: "",
  previousVisit: {},
  selectedTooth: {},
  xrayFindings: [],
  treatments: [],
} as unknown as Required<ClinicalFields>;

/**
 * I dati clinici stanno in client_clinical (RLS: negati ad accountant).
 * `clinical` = il ruolo ha clinical:read: solo allora la tabella è letta e i campi inclusi
 * (anche gli attributi sensibili, uniti a quelli non sensibili).
 */
function toClient(
  row: ClientRow,
  clinicalRow: ClientClinicalRow | null,
  now: Date,
  tz: string,
  clinical: boolean,
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
  if (clinical) {
    const c = clinicalRow ?? EMPTY_CLINICAL;
    view.attributes = { ...row.attributes, ...clinicalRow?.attributes };
    view.recommendation = c.recommendation;
    view.previousVisit = c.previousVisit;
    view.selectedTooth = c.selectedTooth;
    view.xrayFindings = c.xrayFindings;
    view.treatments = c.treatments;
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
 * `clinical` = il ruolo ha clinical:read: senza, le definizioni sensibili sono escluse.
 */
export async function listFieldDefinitions(
  tx: Tx,
  companyId: string,
  clientType: string | undefined,
  clinical: boolean,
): Promise<ClientFieldDefinition[]> {
  const conds: SQL[] = [eq(clientFieldDefinitions.companyId, companyId)];
  if (clientType) conds.push(eq(clientFieldDefinitions.clientType, clientType));
  if (!clinical) conds.push(eq(clientFieldDefinitions.sensitive, false));
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
 * Chiavi sensibili senza clinical:read → ForbiddenError.
 */
async function splitAttributes(
  tx: Tx,
  companyId: string,
  clientType: string,
  raw: ClientAttributes | undefined,
  clinical: boolean,
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
  if (!clinical && Object.keys(sens).length > 0) {
    throw new ForbiddenError("Campi clinici non consentiti per il tuo ruolo");
  }
  return { pub, sens };
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

export async function listClients(tx: Tx, companyId: string, clinical: boolean): Promise<ClientResponse[]> {
  const now = new Date();
  const tz = getCalendarTimeZone();
  const where = eq(clients.companyId, companyId);
  if (!clinical) {
    const rows = await tx.select().from(clients).where(where).orderBy(asc(clients.name));
    return rows.map((row) => toClient(row, null, now, tz, false));
  }
  const rows = await tx
    .select({ client: clients, clinical: clientClinical })
    .from(clients)
    .leftJoin(clientClinical, eq(clientClinical.clientId, clients.id))
    .where(where)
    .orderBy(asc(clients.name));
  return rows.map((r) => toClient(r.client, r.clinical, now, tz, true));
}

/** `code` è l'id applicativo del cliente (es. "PT-2026-0142"). */
export async function getClient(
  tx: Tx,
  companyId: string,
  code: string,
  clinical: boolean,
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
  return toClient(row, clinical ? await getClinicalRow(tx, row.id) : null, now, tz, clinical);
}

async function getClinicalRow(tx: Tx, clientId: string): Promise<ClientClinicalRow | null> {
  const rows = await tx
    .select()
    .from(clientClinical)
    .where(eq(clientClinical.clientId, clientId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Il retry sul codice casuale usa ON CONFLICT DO NOTHING (non un errore 23505):
 * un errore abortirebbe la transazione, il DO NOTHING no. Stessa tx, nessun round-trip extra.
 */
export async function createClient(
  tx: Tx,
  companyId: string,
  input: CreateClientInput,
  clinical: boolean,
): Promise<ClientResponse> {
  // Creare un cliente comporta sempre dati clinici (anche vuoti): richiede clinical:read.
  if (!clinical) throw new ForbiddenError("Creazione cliente non consentita per il tuo ruolo");
  const now = new Date();
  const tz = getCalendarTimeZone();
  const { pub, sens } = await splitAttributes(tx, companyId, input.clientType, input.attributes, clinical, false);
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
  const clinicalValues: ClinicalFields & { attributes: ClientAttributes } = {
    recommendation: input.recommendation ?? "",
    previousVisit: input.previousVisit,
    selectedTooth: input.selectedTooth,
    xrayFindings: input.xrayFindings,
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
      const [clinicalRow] = await tx
        .insert(clientClinical)
        .values({ ...clinicalValues, clientId: row.id, companyId })
        .returning();
      return toClient(row, clinicalRow, now, tz, clinical);
    }
  }
  throw new ConflictError("Impossibile generare un codice cliente univoco, riprova");
}

/** Gli attributi del patch sono uniti (non sostituiti): chiave a `null` = svuotata. */
export async function updateClient(
  tx: Tx,
  companyId: string,
  code: string,
  patch: Partial<CreateClientInput>,
  clinical: boolean,
): Promise<ClientResponse> {
  if (!clinical && CLINICAL_KEYS.some((k) => patch[k] !== undefined)) {
    throw new ForbiddenError("Modifica dei dati clinici non consentita per il tuo ruolo");
  }
  const now = new Date();
  const tz = getCalendarTimeZone();

  const [current] = await tx
    .select({ clientType: clients.clientType })
    .from(clients)
    .where(and(eq(clients.companyId, companyId), eq(clients.code, code)))
    .limit(1);
  if (!current) throw new NotFoundError("Cliente non trovato");
  const { pub, sens } = await splitAttributes(tx, companyId, current.clientType, patch.attributes, clinical, true);

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

  const clinicalSet: ClinicalFields = {};
  if (patch.recommendation !== undefined) clinicalSet.recommendation = patch.recommendation;
  if (patch.previousVisit !== undefined) clinicalSet.previousVisit = patch.previousVisit;
  if (patch.selectedTooth !== undefined) clinicalSet.selectedTooth = patch.selectedTooth;
  if (patch.xrayFindings !== undefined) clinicalSet.xrayFindings = patch.xrayFindings;
  if (patch.treatments !== undefined) clinicalSet.treatments = patch.treatments;

  const updated = await tx
    .update(clients)
    .set(set)
    .where(and(eq(clients.companyId, companyId), eq(clients.code, code)))
    .returning();
  const row = updated[0];
  if (!row) throw new NotFoundError("Cliente non trovato");
  if (!clinical) return toClient(row, null, now, tz, false);

  // Upsert: un cliente senza riga clinica (es. inserito fuori dall'app) la ottiene qui.
  const hasSens = Object.keys(sens).length > 0;
  const hasClinical = Object.keys(clinicalSet).length > 0 || hasSens;
  const clinicalRow = hasClinical
    ? (
        await tx
          .insert(clientClinical)
          .values({ ...clinicalSet, attributes: sens, clientId: row.id, companyId })
          .onConflictDoUpdate({
            target: clientClinical.clientId,
            set: {
              ...clinicalSet,
              ...(hasSens ? { attributes: sql`${clientClinical.attributes} || ${JSON.stringify(sens)}::jsonb` } : {}),
              updatedAt: now,
            },
          })
          .returning()
      )[0]
    : await getClinicalRow(tx, row.id);
  return toClient(row, clinicalRow, now, tz, true);
}
