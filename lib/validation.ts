// Validazione manuale degli input delle route (nessuna libreria esterna).
// Ogni funzione lancia ValidationError con messaggio in italiano: la UI lo mostra così com'è.
import { randomUUID } from "node:crypto";
import type {
  ApplyTemplateInput,
  AppleConnectInput,
  CreateAppointmentTypeInput,
  CreateAssetInput,
  CreateCalendarEventInput,
  CreateClientInput,
  CreateCustomRoleInput,
  CreateInvitationInput,
  CreateMessageInput,
  CreateQuoteInput,
  CreateReminderInput,
  CreateTaskInput,
  MemberPatch,
  OnboardingInput,
  UpdateAppointmentTypeInput,
  UpdateAssetInput,
  UpdateCustomRoleInput,
  UpdateReminderInput,
  UpdateTaskInput,
} from "@/app/types/api";
import type { CompanyModules, ModuleKey, TermKey } from "@/app/types/settings";
import { COMPANY_ROLES, CUSTOM_ROLE_PERMISSIONS, MODULE_KEYS, type Permission } from "@/lib/auth/permissions";
import { TERM_KEYS } from "@/lib/terms";
import type { EventSource, ReminderPriority, ReminderStatus } from "@/app/types/calendar";
import type { ColumnId, TaskPriority } from "@/app/types/maintenance";
import type { MessageFrom } from "@/app/types/messaging";
import type {
  ClientAttributes,
  ClientFieldDefinition,
  FieldEntity,
  InsuranceCardData,
  PreviousVisitNote,
  Sector,
  TreatmentHistoryItem,
} from "@/app/types/clients";
import type { QuoteStatus } from "@/app/types/quotes";
import { parseToUtcMs } from "@/lib/calendar-sync/time";
import { parseDateInput } from "@/lib/data/format";
import { ValidationError } from "@/lib/errors";

export type JsonObject = Record<string, unknown>;

const DAY_MS = 86_400_000;
export const MAX_RANGE_DAYS = 400;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9-]{1,31}$/;
/** Tipo bene = client_type delle definizioni entity='asset' (stesso formato delle chiavi). */
const ASSET_TYPE_RE = /^[a-z][a-z0-9_]{0,62}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
/** Chiave stabile di tipi di appuntamento e ruoli (come i CHECK SQL). */
const KEY_RE = /^[a-z][a-z0-9_]{0,62}$/;
const TERM_KEY_SET = new Set<string>(TERM_KEYS);
const MODULE_KEY_SET = new Set<string>(MODULE_KEYS);

// ─── Enum del contratto (app/types/*) ───────────────────────────────────────
export const EVENT_SOURCES = ["Google Calendar", "Apple Calendar", "Manual", "AI Secretary"] as const satisfies readonly EventSource[];
export const REMINDER_PRIORITIES = ["high", "medium", "low"] as const satisfies readonly ReminderPriority[];
export const REMINDER_STATUSES = ["active", "resolved", "archived"] as const satisfies readonly ReminderStatus[];
export const TASK_PRIORITIES = ["high", "medium", "low"] as const satisfies readonly TaskPriority[];
export const COLUMN_IDS = ["todo", "in-progress", "done"] as const satisfies readonly ColumnId[];
export const MESSAGE_FROM = ["contact", "user", "ai-draft"] as const satisfies readonly MessageFrom[];
/** Il client può inviare solo messaggi dello studio: "contact" arriva dal canale WhatsApp/web. */
export const CLIENT_MESSAGE_FROM = ["user", "ai-draft"] as const satisfies readonly MessageFrom[];
export const QUOTE_STATUSES = ["pending_ai", "quote_sent", "approved", "declined"] as const satisfies readonly QuoteStatus[];
export const GENDERS = ["F", "M"] as const;
export const SECTORS = [
  "dentale", "medico", "commercialista", "legale", "estetico", "generico",
] as const satisfies readonly Sector[];
const TREATMENT_STATUSES = ["Completato", "Pianificato", "In corso"] as const satisfies readonly TreatmentHistoryItem["status"][];

// ─── Primitivi ──────────────────────────────────────────────────────────────
function isBlank(v: unknown): boolean {
  return v === undefined || v === null;
}

/** Corpo JSON che deve essere un oggetto. */
export async function readJsonObject(request: Request): Promise<JsonObject> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Corpo della richiesta non valido (JSON atteso)");
  }
  return asRecord(body, "Il corpo della richiesta");
}

function asRecord(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${label} non valido`);
  }
  return value as JsonObject;
}

function asOptionalRecord(value: unknown, label: string): JsonObject {
  return isBlank(value) ? {} : asRecord(value, label);
}

function asArray(value: unknown, label: string, max = 200): unknown[] {
  if (isBlank(value)) return [];
  if (!Array.isArray(value)) throw new ValidationError(`${label} non valido (lista attesa)`);
  if (value.length > max) throw new ValidationError(`${label}: massimo ${max} elementi`);
  return value;
}

/** Stringa obbligatoria, trimmata, non vuota e con lunghezza massima. */
export function reqString(obj: JsonObject, key: string, label: string, max: number): string {
  const v = obj[key];
  if (typeof v !== "string" || !v.trim()) throw new ValidationError(`${label} obbligatorio`);
  const t = v.trim();
  if (t.length > max) throw new ValidationError(`${label}: massimo ${max} caratteri`);
  return t;
}

/** Stringa opzionale (assente/null → undefined), trimmata. */
export function optString(obj: JsonObject, key: string, label: string, max: number): string | undefined {
  const v = obj[key];
  if (isBlank(v)) return undefined;
  if (typeof v !== "string") throw new ValidationError(`${label} non valido`);
  const t = v.trim();
  if (t.length > max) throw new ValidationError(`${label}: massimo ${max} caratteri`);
  return t;
}

export function reqEnum<T extends string>(obj: JsonObject, key: string, allowed: readonly T[], label: string): T {
  const v = obj[key];
  if (typeof v === "string" && allowed.some((a) => a === v)) return v as T;
  throw new ValidationError(`${label} non valido`);
}

export function optEnum<T extends string>(obj: JsonObject, key: string, allowed: readonly T[], label: string): T | undefined {
  return isBlank(obj[key]) ? undefined : reqEnum(obj, key, allowed, label);
}

export function reqNumber(
  obj: JsonObject,
  key: string,
  label: string,
  opts: { min?: number; max?: number; integer?: boolean } = {},
): number {
  const v = obj[key];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ValidationError(`${label} non valido`);
  if (opts.integer && !Number.isInteger(v)) throw new ValidationError(`${label} deve essere un numero intero`);
  if ((opts.min !== undefined && v < opts.min) || (opts.max !== undefined && v > opts.max)) {
    throw new ValidationError(`${label} fuori dai limiti consentiti`);
  }
  return v;
}

export function optBoolean(obj: JsonObject, key: string, label: string, fallback: boolean): boolean {
  const v = obj[key];
  if (isBlank(v)) return fallback;
  if (typeof v !== "boolean") throw new ValidationError(`${label} non valido`);
  return v;
}

/** "HH:mm" */
export function reqTime(obj: JsonObject, key: string, label: string): string {
  const v = obj[key];
  if (typeof v !== "string" || !TIME_RE.test(v.trim())) throw new ValidationError(`${label} non valido (formato HH:mm)`);
  return v.trim();
}

/** "YYYY-MM-DD" reale (es. non 2026-02-30). */
export function parseIsoDate(value: unknown, label: string): string {
  if (isBlank(value) || value === "") throw new ValidationError(`${label} obbligatoria`);
  if (typeof value !== "string") throw new ValidationError(`${label} non valida (formato YYYY-MM-DD)`);
  const s = value.trim();
  const m = ISO_DATE_RE.exec(s);
  if (!m) throw new ValidationError(`${label} non valida (formato YYYY-MM-DD)`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    throw new ValidationError(`${label} non valida (formato YYYY-MM-DD)`);
  }
  return s;
}

/**
 * Intervallo [from, to) di giorni YYYY-MM-DD (to esclusivo), interpretato
 * come mezzanotte nel fuso CALENDAR_TIMEZONE.
 */
export function parseDayRange(from: unknown, to: unknown, tz: string): { from: Date; to: Date } {
  const fromDay = parseIsoDate(from, "Data iniziale 'from'");
  const toDay = parseIsoDate(to, "Data finale 'to'");
  const fromMs = parseToUtcMs(fromDay, tz);
  const toMs = parseToUtcMs(toDay, tz);
  if (fromMs === null || toMs === null) throw new ValidationError("Intervallo di date non valido");
  if (toMs <= fromMs) throw new ValidationError("'to' deve essere successivo a 'from'");
  if (toMs - fromMs > MAX_RANGE_DAYS * DAY_MS) {
    throw new ValidationError(`Intervallo massimo di ${MAX_RANGE_DAYS} giorni`);
  }
  return { from: new Date(fromMs), to: new Date(toMs) };
}

/** Id UUID di un path param: 400 prima di arrivare al database. */
export function parseUuid(value: string, label: string): string {
  if (!UUID_RE.test(value)) throw new ValidationError(`${label} non valido`);
  return value;
}

/** Codice cliente applicativo, es. "PT-2026-0142". */
export function parseClientCode(value: string): string {
  if (!CLIENT_CODE_RE.test(value)) throw new ValidationError("Codice cliente non valido");
  return value;
}

/** Query booleana ("true"/"false"); assente → false. */
export function parseFlagParam(value: string | null, label: string): boolean {
  if (value === null || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new ValidationError(`${label} non valido`);
}

/** Tipo cliente opzionale (query `type`): deve essere un settore noto. */
export function parseClientTypeParam(value: string | null): Sector | undefined {
  if (value === null || value === "") return undefined;
  if (!(SECTORS as readonly string[]).includes(value)) throw new ValidationError("Tipo cliente non valido");
  return value as Sector;
}

/** Entità delle definizioni (query `entity`): default 'client'. */
export function parseEntityParam(value: string | null): FieldEntity {
  if (value === null || value === "" || value === "client") return "client";
  if (value === "asset") return "asset";
  throw new ValidationError("Entità non valida");
}

/** Tipo bene opzionale (query `type` con entity=asset): formato chiave, non settore. */
export function parseAssetTypeParam(value: string | null): string | undefined {
  if (value === null || value === "") return undefined;
  if (!ASSET_TYPE_RE.test(value)) throw new ValidationError("Tipo bene non valido");
  return value;
}

// ─── Sessione & agenda ──────────────────────────────────────────────────────
export function parseOnboardingInput(body: JsonObject): OnboardingInput {
  return {
    name: reqString(body, "name", "Nome dello studio", 120),
    seedDemo: optBoolean(body, "seedDemo", "Dati demo", false),
    sector: optEnum(body, "sector", SECTORS, "Settore") ?? "generico",
  };
}

/** Bene collegato alla creazione (facoltativo). */
function optAssetId(obj: JsonObject): string | undefined {
  if (isBlank(obj.assetId)) return undefined;
  return parseAssetIdValue(obj.assetId);
}

/** Bene collegato in patch: undefined = invariato, null = scollega. */
function patchAssetId(obj: JsonObject): string | null | undefined {
  if (obj.assetId === undefined) return undefined;
  return obj.assetId === null ? null : parseAssetIdValue(obj.assetId);
}

function parseAssetIdValue(v: unknown): string {
  if (typeof v !== "string" || !UUID_RE.test(v)) throw new ValidationError("Bene non valido");
  return v;
}

/** UUID opzionale di un campo del body (assente/null → undefined). */
function optUuid(obj: JsonObject, key: string, label: string): string | undefined {
  if (isBlank(obj[key])) return undefined;
  const v = obj[key];
  if (typeof v !== "string" || !UUID_RE.test(v)) throw new ValidationError(`${label} non valido`);
  return v;
}

/** Colore #RRGGBB. */
function parseColorValue(v: unknown): string {
  if (typeof v !== "string" || !COLOR_RE.test(v)) throw new ValidationError("Colore non valido (formato #RRGGBB)");
  return v;
}

function optColor(obj: JsonObject, key: string): string | undefined {
  return isBlank(obj[key]) ? undefined : parseColorValue(obj[key]);
}

export function parseCalendarEventInput(body: JsonObject): CreateCalendarEventInput {
  return {
    title: reqString(body, "title", "Titolo", 300),
    description: optString(body, "description", "Descrizione", 5000),
    date: parseIsoDate(body.date, "Data"),
    startTime: reqTime(body, "startTime", "Orario di inizio"),
    endTime: reqTime(body, "endTime", "Orario di fine"),
    source: reqEnum(body, "source", EVENT_SOURCES, "Origine evento"),
    assetId: optAssetId(body),
    appointmentTypeId: optUuid(body, "appointmentTypeId", "Tipo di appuntamento"),
    color: optColor(body, "color"),
  };
}

export function parseAppleConnectInput(body: JsonObject): AppleConnectInput {
  const appleId = reqString(body, "appleId", "Apple ID", 320);
  if (!EMAIL_RE.test(appleId)) throw new ValidationError("Apple ID non valido (indirizzo email atteso)");
  return {
    appleId,
    appPassword: reqString(body, "appPassword", "Password specifica per app", 200),
    calendarName: optString(body, "calendarName", "Nome calendario", 200),
  };
}

// ─── Promemoria ─────────────────────────────────────────────────────────────
export function parseReminderInput(body: JsonObject): CreateReminderInput {
  return {
    text: reqString(body, "text", "Testo del promemoria", 500),
    time: reqTime(body, "time", "Orario"),
    priority: reqEnum(body, "priority", REMINDER_PRIORITIES, "Priorità"),
  };
}

export function parseReminderStatusPatch(body: JsonObject): UpdateReminderInput {
  return { status: reqEnum(body, "status", REMINDER_STATUSES, "Stato") };
}

// ─── Attività ───────────────────────────────────────────────────────────────
export function parseTaskInput(body: JsonObject): CreateTaskInput {
  return {
    title: reqString(body, "title", "Titolo", 200),
    description: optString(body, "description", "Descrizione", 5000),
    priority: reqEnum(body, "priority", TASK_PRIORITIES, "Priorità"),
    columnId: reqEnum(body, "columnId", COLUMN_IDS, "Colonna"),
    assignedTo: optString(body, "assignedTo", "Assegnatario", 120),
    assetId: optAssetId(body),
  };
}

export function parseTaskPatch(body: JsonObject): UpdateTaskInput {
  const out: UpdateTaskInput = {};
  if (body.title !== undefined) out.title = reqString(body, "title", "Titolo", 200);
  if (body.description !== undefined) out.description = optString(body, "description", "Descrizione", 5000) ?? "";
  if (body.priority !== undefined) out.priority = reqEnum(body, "priority", TASK_PRIORITIES, "Priorità");
  if (body.columnId !== undefined) out.columnId = reqEnum(body, "columnId", COLUMN_IDS, "Colonna");
  if (body.assignedTo !== undefined) out.assignedTo = optString(body, "assignedTo", "Assegnatario", 120) ?? "";
  if (body.position !== undefined) out.position = reqNumber(body, "position", "Posizione", { min: 0, integer: true });
  if (body.assetId !== undefined) out.assetId = patchAssetId(body);
  if (Object.keys(out).length === 0) throw new ValidationError("Nessun campo da aggiornare");
  return out;
}

// ─── Chat ───────────────────────────────────────────────────────────────────
export function parseMessageInput(body: JsonObject): CreateMessageInput {
  return {
    from: reqEnum(body, "from", CLIENT_MESSAGE_FROM, "Mittente"),
    text: reqString(body, "text", "Testo del messaggio", 4000),
  };
}

// ─── Preventivi ─────────────────────────────────────────────────────────────
const MAX_AMOUNT = 1_000_000_000;

function optQuoteDate(body: JsonObject): string | undefined {
  const v = body.date;
  if (isBlank(v)) return undefined;
  if (typeof v !== "string" || !parseDateInput(v)) {
    throw new ValidationError("Data preventivo non valida (es. 1 Lug 2026 o 2026-07-01)");
  }
  return v.trim();
}

export function parseQuoteInput(body: JsonObject): CreateQuoteInput {
  return {
    client: reqString(body, "client", "Paziente", 200),
    type: reqString(body, "type", "Prestazione", 100),
    amount: reqNumber(body, "amount", "Importo", { min: 0, max: MAX_AMOUNT }),
    description: optString(body, "description", "Descrizione", 2000),
    date: optQuoteDate(body),
    assetId: optAssetId(body),
  };
}

export function parseQuotePatch(
  body: JsonObject,
): Partial<Omit<CreateQuoteInput, "assetId">> & { status?: QuoteStatus; assetId?: string | null } {
  const out: Partial<Omit<CreateQuoteInput, "assetId">> & { status?: QuoteStatus; assetId?: string | null } = {};
  if (body.client !== undefined) out.client = reqString(body, "client", "Paziente", 200);
  if (body.type !== undefined) out.type = reqString(body, "type", "Prestazione", 100);
  if (body.amount !== undefined) out.amount = reqNumber(body, "amount", "Importo", { min: 0, max: MAX_AMOUNT });
  if (body.description !== undefined) out.description = optString(body, "description", "Descrizione", 2000) ?? "";
  if (body.date !== undefined) out.date = optQuoteDate(body);
  if (body.status !== undefined) out.status = reqEnum(body, "status", QUOTE_STATUSES, "Stato");
  if (body.assetId !== undefined) out.assetId = patchAssetId(body);
  if (Object.keys(out).length === 0) throw new ValidationError("Nessun campo da aggiornare");
  return out;
}

// ─── Clienti ────────────────────────────────────────────────────────────────
function optEmail(obj: JsonObject, key: string): string | undefined {
  const v = optString(obj, key, "Email", 320);
  if (v && !EMAIL_RE.test(v)) throw new ValidationError("Email non valida");
  return v;
}

function parseBirthDate(obj: JsonObject, key: string): string {
  const v = obj[key];
  if (typeof v !== "string" || !v.trim()) throw new ValidationError("Data di nascita obbligatoria");
  if (!parseDateInput(v)) throw new ValidationError("Data di nascita non valida (es. 14 giugno 1995 o 1995-06-14)");
  return v.trim();
}

/** Oggetti annidati: solo campi stringa noti; mancanti → "". */
function pickStrings<K extends string>(value: unknown, label: string, keys: readonly K[], max = 2000): Record<K, string> {
  const o = asOptionalRecord(value, label);
  const out = {} as Record<K, string>;
  for (const key of keys) {
    const v = o[key];
    if (isBlank(v)) {
      out[key] = "";
      continue;
    }
    if (typeof v !== "string") throw new ValidationError(`${label}: campo "${key}" non valido`);
    if (v.length > max) throw new ValidationError(`${label}: campo "${key}" troppo lungo`);
    out[key] = v.trim();
  }
  return out;
}

function parseInsurance(v: unknown): InsuranceCardData {
  return pickStrings(v, "Assicurazione", ["provider", "policyNumber", "type", "expiration"]);
}

function parsePreviousVisit(v: unknown): PreviousVisitNote {
  return pickStrings(v, "Ultima visita", ["date", "doctor", "summary", "details"]);
}

function parseTreatments(v: unknown): TreatmentHistoryItem[] {
  return asArray(v, "Storico trattamenti").map((item, i) => {
    const label = `Trattamento ${i + 1}`;
    const o = asRecord(item, label);
    const s = pickStrings(o, label, ["id", "date", "treatment", "tooth", "doctor", "cost"], 500);
    return {
      ...s,
      id: s.id || randomUUID(),
      status: reqEnum(o, "status", TREATMENT_STATUSES, `${label}: stato`),
    };
  });
}

/** Campi del cliente. `required` = creazione (campi obbligatori e default per gli annidati). */
function clientFields(body: JsonObject, required: boolean): Partial<CreateClientInput> {
  const out: Partial<CreateClientInput> = {};
  // Il tipo cliente si sceglie in creazione e non cambia (gli attributi dipendono da lui).
  if (required) out.clientType = optEnum(body, "clientType", SECTORS, "Tipo cliente") ?? "generico";
  // Forma validata in lib/data/clients (per definizione del settore), qui solo tipo oggetto.
  if (required || body.attributes !== undefined) {
    out.attributes = asOptionalRecord(body.attributes, "Attributi") as ClientAttributes;
  }
  if (required || body.name !== undefined) out.name = reqString(body, "name", "Nome", 200);
  if (required || body.gender !== undefined) out.gender = reqEnum(body, "gender", GENDERS, "Sesso");
  if (required || body.dateOfBirth !== undefined) out.dateOfBirth = parseBirthDate(body, "dateOfBirth");
  if (body.avatar !== undefined) out.avatar = optString(body, "avatar", "Avatar", 500) ?? "";
  if (body.phone !== undefined) out.phone = optString(body, "phone", "Telefono", 50) ?? "";
  if (body.email !== undefined) out.email = optEmail(body, "email") ?? "";
  if (body.address !== undefined) out.address = optString(body, "address", "Indirizzo", 300) ?? "";
  if (body.fiscalCode !== undefined) {
    out.fiscalCode = (optString(body, "fiscalCode", "Codice fiscale", 32) ?? "").toUpperCase();
  }
  if (body.recommendation !== undefined) {
    out.recommendation = optString(body, "recommendation", "Segnalazione", 300) ?? "";
  }
  if (required || body.insurance !== undefined) out.insurance = parseInsurance(body.insurance);
  if (required || body.previousVisit !== undefined) out.previousVisit = parsePreviousVisit(body.previousVisit);
  if (required || body.treatments !== undefined) out.treatments = parseTreatments(body.treatments);
  return out;
}

export function parseCreateClientInput(body: JsonObject): CreateClientInput {
  // Con required=true tutti i campi obbligatori sono presenti nel risultato.
  return clientFields(body, true) as CreateClientInput;
}

export function parseUpdateClientInput(body: JsonObject): Partial<CreateClientInput> {
  const out = clientFields(body, false);
  if (Object.keys(out).length === 0) throw new ValidationError("Nessun campo da aggiornare");
  return out;
}

// ─── Beni del cliente (client_assets) ───────────────────────────────────────
export function parseAssetInput(body: JsonObject): CreateAssetInput {
  const assetType = reqString(body, "assetType", "Tipo bene", 63);
  if (!ASSET_TYPE_RE.test(assetType)) throw new ValidationError("Tipo bene non valido");
  return {
    assetType,
    name: reqString(body, "name", "Nome del bene", 200),
    identifier: optString(body, "identifier", "Identificativo", 100),
    note: optString(body, "note", "Note", 2000),
    attributes: asOptionalRecord(body.attributes, "Attributi") as ClientAttributes,
  };
}

/** Il tipo del bene non è modificabile; `null` su identifier/note li svuota. */
export function parseAssetPatch(body: JsonObject): UpdateAssetInput {
  if (body.assetType !== undefined) throw new ValidationError("Il tipo del bene non è modificabile");
  const out: UpdateAssetInput = {};
  if (body.name !== undefined) out.name = reqString(body, "name", "Nome del bene", 200);
  if (body.identifier !== undefined) out.identifier = optString(body, "identifier", "Identificativo", 100) || null;
  if (body.note !== undefined) out.note = optString(body, "note", "Note", 2000) || null;
  if (body.attributes !== undefined) out.attributes = asOptionalRecord(body.attributes, "Attributi") as ClientAttributes;
  if (Object.keys(out).length === 0) throw new ValidationError("Nessun campo da aggiornare");
  return out;
}

// ─── Impostazioni dello studio ──────────────────────────────────────────────
/** Chiave stabile (tipi di appuntamento, ruoli): formato dei CHECK SQL. */
function optKey(obj: JsonObject, label: string): string | undefined {
  const v = optString(obj, "key", label, 63);
  if (v !== undefined && !KEY_RE.test(v)) throw new ValidationError(`${label} non valida (minuscole, cifre e _)`);
  return v;
}

/** Etichette: chiavi note; stringa vuota o null = rimuovi (torna il default del settore). */
export function parseTermsPatch(body: JsonObject): Partial<Record<TermKey, string | null>> {
  const out: Partial<Record<TermKey, string | null>> = {};
  for (const [key, v] of Object.entries(body)) {
    if (!TERM_KEY_SET.has(key)) throw new ValidationError(`Etichetta "${key}" non prevista`);
    const term = key as TermKey;
    if (v === null) {
      out[term] = null;
      continue;
    }
    if (typeof v !== "string") throw new ValidationError(`Etichetta "${key}" non valida`);
    const t = v.trim();
    if (t.length > 80) throw new ValidationError(`Etichetta "${key}": massimo 80 caratteri`);
    out[term] = t || null;
  }
  if (Object.keys(out).length === 0) throw new ValidationError("Nessuna etichetta da aggiornare");
  return out;
}

/** Moduli: solo chiavi note, valori booleani. */
export function parseModulesPatch(body: JsonObject): Partial<CompanyModules> {
  const out: Partial<CompanyModules> = {};
  for (const [key, v] of Object.entries(body)) {
    if (!MODULE_KEY_SET.has(key)) throw new ValidationError(`Modulo "${key}" non previsto`);
    if (typeof v !== "boolean") throw new ValidationError(`Modulo "${key}" non valido (booleano atteso)`);
    out[key as ModuleKey] = v;
  }
  if (Object.keys(out).length === 0) throw new ValidationError("Nessun modulo da aggiornare");
  return out;
}

export function parseApplyTemplateInput(body: JsonObject): ApplyTemplateInput {
  return {
    sector: reqEnum(body, "sector", SECTORS, "Settore"),
    keepTerms: optBoolean(body, "keepTerms", "Mantieni etichette", false),
  };
}

export function parseAppointmentTypeInput(body: JsonObject): CreateAppointmentTypeInput {
  return {
    label: reqString(body, "label", "Etichetta", 60),
    color: optColor(body, "color"),
    durationMinutes: isBlank(body.durationMinutes)
      ? undefined
      : reqNumber(body, "durationMinutes", "Durata", { min: 5, max: 600, integer: true }),
    key: optKey(body, "Chiave"),
  };
}

export function parseAppointmentTypePatch(body: JsonObject): UpdateAppointmentTypeInput {
  const out: UpdateAppointmentTypeInput = {};
  if (body.label !== undefined) out.label = reqString(body, "label", "Etichetta", 60);
  if (body.color !== undefined) out.color = parseColorValue(body.color);
  if (body.durationMinutes !== undefined) {
    out.durationMinutes = reqNumber(body, "durationMinutes", "Durata", { min: 5, max: 600, integer: true });
  }
  if (body.position !== undefined) out.position = reqNumber(body, "position", "Posizione", { min: 0, max: 100_000, integer: true });
  if (body.archived !== undefined) out.archived = optBoolean(body, "archived", "Archiviato", false);
  if (Object.keys(out).length === 0) throw new ValidationError("Nessun campo da aggiornare");
  return out;
}

/** Permessi di un ruolo personalizzato: solo CUSTOM_ROLE_PERMISSIONS, almeno uno, senza duplicati. */
function parseRolePermissions(value: unknown): Permission[] {
  const list = asArray(value, "Permessi", CUSTOM_ROLE_PERMISSIONS.length);
  const allowed = new Set<string>(CUSTOM_ROLE_PERMISSIONS);
  const out = new Set<Permission>();
  for (const p of list) {
    if (typeof p !== "string" || !allowed.has(p)) throw new ValidationError(`Permesso non assegnabile: ${String(p)}`);
    out.add(p as Permission);
  }
  if (out.size === 0) throw new ValidationError("Il ruolo deve avere almeno un permesso");
  return [...out];
}

export function parseCustomRoleInput(body: JsonObject): CreateCustomRoleInput {
  return {
    label: reqString(body, "label", "Nome del ruolo", 60),
    permissions: parseRolePermissions(body.permissions),
    key: optKey(body, "Chiave"),
  };
}

export function parseCustomRolePatch(body: JsonObject): UpdateCustomRoleInput {
  const out: UpdateCustomRoleInput = {};
  if (body.label !== undefined) out.label = reqString(body, "label", "Nome del ruolo", 60);
  if (body.permissions !== undefined) out.permissions = parseRolePermissions(body.permissions);
  if (Object.keys(out).length === 0) throw new ValidationError("Nessun campo da aggiornare");
  return out;
}

/** Assegnazione del ruolo personalizzato a un membro: null = torna al ruolo di sistema. */
/** PATCH membro: role e/o customRoleId (null = rimuovi il ruolo personalizzato). Almeno uno dei due. */
export function parseMemberPatch(body: JsonObject): MemberPatch {
  const role = optEnum(body, "role", COMPANY_ROLES, "Ruolo");
  const hasCustomRole = body.customRoleId !== undefined;
  if (role === undefined && !hasCustomRole) {
    throw new ValidationError("Indica il ruolo o il ruolo personalizzato da assegnare");
  }
  const patch: MemberPatch = {};
  if (role !== undefined) patch.role = role;
  if (hasCustomRole) patch.customRoleId = optUuid(body, "customRoleId", "Ruolo personalizzato") ?? null;
  return patch;
}

// ─── Inviti dello studio ────────────────────────────────────────────────────
/** Email dell'invito: trim, minuscole, formato e lunghezza. Il ruolo è validato contro i permessi dell'attore in lib/data/members.ts. */
export function parseCreateInvitationInput(body: JsonObject): CreateInvitationInput {
  const email = reqString(body, "email", "Email", 254).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new ValidationError("Email non valida");
  return { email, role: reqEnum(body, "role", COMPANY_ROLES, "Ruolo") };
}

// ─── Attributi personalizzati (definizioni in client_field_definitions) ─────
export type AttributeDefinition = Pick<ClientFieldDefinition, "key" | "label" | "type" | "options" | "required">;

function normalizeAttribute(def: AttributeDefinition, v: unknown): ClientAttributes[string] {
  if (isBlank(v) || v === "") return null;
  const label = def.label;
  switch (def.type) {
    case "text":
      if (typeof v !== "string") throw new ValidationError(`${label} non valido`);
      if (v.length > 2000) throw new ValidationError(`${label}: massimo 2000 caratteri`);
      return v.trim() || null;
    case "number":
      if (typeof v !== "number" || !Number.isFinite(v)) throw new ValidationError(`${label} non valido`);
      return v;
    case "date":
      return parseIsoDate(v, label);
    case "select":
      if (typeof v !== "string" || !def.options.includes(v)) throw new ValidationError(`${label} non valido`);
      return v;
    case "bool":
      if (typeof v !== "boolean") throw new ValidationError(`${label} non valido`);
      return v;
  }
}

/**
 * Valida gli attributi contro le definizioni (chiavi note, tipo, select, required).
 * `partial`: in update si controlla solo ciò che arriva (niente required sulle chiavi assenti).
 * Restituisce i valori normalizzati; i campi `bool` obbligatori devono essere `true` (consenso).
 */
export function validateAttributes(
  input: JsonObject,
  definitions: readonly AttributeDefinition[],
  partial = false,
): ClientAttributes {
  const byKey = new Map(definitions.map((d) => [d.key, d]));
  const out: ClientAttributes = {};
  for (const [key, v] of Object.entries(input)) {
    const def = byKey.get(key);
    if (!def) throw new ValidationError(`Campo "${key}" non previsto per questo tipo di cliente`);
    out[key] = normalizeAttribute(def, v);
  }
  if (!partial) {
    for (const def of definitions) {
      if (!def.required) continue;
      const v = out[def.key];
      const missing = def.type === "bool" ? v !== true : v === undefined || v === null;
      if (missing) throw new ValidationError(`${def.label} obbligatorio`);
    }
  }
  return out;
}
