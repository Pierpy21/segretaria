import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import {
  companies,
  companyAppointmentTypes,
  companyMembers,
  companyModules,
  companyRoles,
  verticalTemplates,
  type CompanyAppointmentType,
  type CompanyRoleRow,
} from "@/drizzle/schema";
import type {
  CompanyRole,
  CreateAppointmentTypeInput,
  CreateCustomRoleInput,
  MemberSummary,
  SettingsResponse,
  UpdateAppointmentTypeInput,
  UpdateCustomRoleInput,
} from "@/app/types/api";
import type { AppointmentType, CompanyModules, CustomRole, TermKey, Terms, VerticalTemplateSummary } from "@/app/types/settings";
import type { Sector } from "@/app/types/clients";
import { DEFAULT_MODULES, MODULE_KEYS } from "@/lib/auth/permissions";
import { TERM_KEYS, resolveTerms } from "@/lib/terms";
import { NotFoundError, ValidationError, pgErrorCode } from "@/lib/errors";
import { first } from "./format";

/** Colore di default del DB per i tipi di appuntamento. */
const DEFAULT_APPOINTMENT_COLOR = "#E04A95";
const DEFAULT_APPOINTMENT_DURATION = 30;
/** Passo di posizione per i nuovi tipi (lascia spazio per inserimenti intermedi). */
const POSITION_STEP = 10;

type AppointmentTypeInsert = typeof companyAppointmentTypes.$inferInsert;

// ─── Mapping ────────────────────────────────────────────────────────────────
function toAppointmentType(row: CompanyAppointmentType): AppointmentType {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    color: row.color,
    durationMinutes: row.durationMinutes,
    position: row.position,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

function toCustomRole(row: CompanyRoleRow): CustomRole {
  return { id: row.id, key: row.key, label: row.label, permissions: row.permissions };
}

/** Riga di get_company_members (colonne SQL). */
interface MemberSqlRow {
  user_id: string;
  email: string;
  role: string;
  custom_role_id: string | null;
  created_at: Date | string;
}

function toMember(row: MemberSqlRow): MemberSummary {
  return {
    userId: row.user_id,
    email: row.email,
    role: row.role as CompanyRole,
    customRoleId: row.custom_role_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// ─── Chiavi ─────────────────────────────────────────────────────────────────
/**
 * Chiave stabile (formato CHECK SQL) dalla label: minuscole ASCII, "_" come separatore.
 * Label senza caratteri utili → suffisso casuale.
 */
export function keyFromLabel(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
  if (!base) return `t_${randomBytes(3).toString("hex")}`;
  return /^[a-z]/.test(base) ? base : `t_${base}`;
}

// ─── Impostazioni ───────────────────────────────────────────────────────────
/** Moduli dello studio: riga assente = attivo. */
export async function listModules(tx: Tx, companyId: string): Promise<CompanyModules> {
  const rows = await tx
    .select({ module: companyModules.module, enabled: companyModules.enabled })
    .from(companyModules)
    .where(eq(companyModules.companyId, companyId));
  const out: CompanyModules = { ...DEFAULT_MODULES };
  for (const r of rows) out[r.module] = r.enabled;
  return out;
}

/** Ultima versione di ogni preset di settore. */
async function listTemplates(tx: Tx): Promise<VerticalTemplateSummary[]> {
  const rows = await tx
    .select({
      key: verticalTemplates.key,
      version: verticalTemplates.version,
      label: verticalTemplates.label,
      description: verticalTemplates.description,
    })
    .from(verticalTemplates)
    .orderBy(asc(verticalTemplates.key), desc(verticalTemplates.version));
  const latest = new Map<string, VerticalTemplateSummary>();
  for (const r of rows) if (!latest.has(r.key)) latest.set(r.key, r);
  return [...latest.values()];
}

/** Impostazioni complete dello studio (GET /api/settings). */
export async function getSettings(tx: Tx, companyId: string): Promise<SettingsResponse> {
  const [company] = await tx
    .select({ sector: companies.sector, templateVersion: companies.templateVersion, terms: companies.terms })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) throw new NotFoundError("Studio non trovato");

  const modules = await listModules(tx, companyId);
  const appointmentTypes = await listAppointmentTypes(tx, companyId, true);
  const templates = await listTemplates(tx);
  return {
    sector: company.sector as Sector,
    templateVersion: company.templateVersion,
    terms: resolveTerms(company.terms),
    termOverrides: company.terms,
    modules,
    appointmentTypes,
    templates,
  };
}

/**
 * Applica un preset di settore allo studio (apply_vertical_template, SECURITY INVOKER:
 * il DB richiede settings:manage). Campi, moduli e tipi già presenti non vengono sovrascritti.
 */
export async function applyTemplate(tx: Tx, companyId: string, sector: Sector, keepTerms: boolean): Promise<number> {
  const rows = (await tx.execute(
    sql`select public.apply_vertical_template(${companyId}, ${sector}, ${keepTerms}) as version`,
  )) as unknown as Array<{ version: number }>;
  const version = Number(rows[0]?.version);
  if (!Number.isInteger(version)) throw new Error("apply_vertical_template non ha restituito una versione");
  return version;
}

/**
 * Aggiorna le etichette: il valore `null` rimuove la chiave (torna il default del preset/generico).
 * Ritorna le etichette risolte.
 */
export async function updateTerms(
  tx: Tx,
  companyId: string,
  patch: Partial<Record<TermKey, string | null>>,
): Promise<Terms> {
  const [company] = await tx
    .select({ terms: companies.terms })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) throw new NotFoundError("Studio non trovato");

  const next: Partial<Terms> = { ...company.terms };
  for (const key of TERM_KEYS) {
    const v = patch[key];
    if (v === undefined) continue;
    if (v === null) delete next[key];
    else next[key] = v;
  }
  await tx.update(companies).set({ terms: next }).where(eq(companies.id, companyId));
  return resolveTerms(next);
}

/** Upsert dei moduli indicati (gli altri restano invariati). Ritorna lo stato completo. */
export async function updateModules(
  tx: Tx,
  companyId: string,
  patch: Partial<CompanyModules>,
): Promise<CompanyModules> {
  const rows: { companyId: string; module: (typeof MODULE_KEYS)[number]; enabled: boolean }[] = [];
  for (const moduleKey of MODULE_KEYS) {
    const enabled = patch[moduleKey];
    if (enabled !== undefined) rows.push({ companyId, module: moduleKey, enabled });
  }
  if (rows.length > 0) {
    await tx
      .insert(companyModules)
      .values(rows)
      .onConflictDoUpdate({
        target: [companyModules.companyId, companyModules.module],
        set: { enabled: sql`excluded.enabled`, updatedAt: sql`now()` },
      });
  }
  return listModules(tx, companyId);
}

// ─── Tipi di appuntamento ───────────────────────────────────────────────────
/** Tipi dello studio ordinati per position. `includeArchived`: anche gli archiviati. */
export async function listAppointmentTypes(
  tx: Tx,
  companyId: string,
  includeArchived: boolean,
): Promise<AppointmentType[]> {
  const rows = await tx
    .select()
    .from(companyAppointmentTypes)
    .where(
      and(
        eq(companyAppointmentTypes.companyId, companyId),
        includeArchived ? undefined : isNull(companyAppointmentTypes.archivedAt),
      ),
    )
    .orderBy(asc(companyAppointmentTypes.position), asc(companyAppointmentTypes.label));
  return rows.map(toAppointmentType);
}

/**
 * Verifica che il tipo appartenga allo studio e non sia archiviato (agenda).
 * Ritorna id e colore del tipo per il calendario.
 */
export async function resolveActiveAppointmentType(
  tx: Tx,
  companyId: string,
  id: string,
): Promise<{ id: string; color: string }> {
  const [row] = await tx
    .select({ id: companyAppointmentTypes.id, color: companyAppointmentTypes.color })
    .from(companyAppointmentTypes)
    .where(
      and(
        eq(companyAppointmentTypes.id, id),
        eq(companyAppointmentTypes.companyId, companyId),
        isNull(companyAppointmentTypes.archivedAt),
      ),
    )
    .limit(1);
  if (!row) throw new ValidationError("Tipo di appuntamento non valido o archiviato");
  return row;
}

export async function createAppointmentType(
  tx: Tx,
  companyId: string,
  input: CreateAppointmentTypeInput,
): Promise<AppointmentType> {
  // position calcolata in SQL: Drizzle accetta SQL nei valori di insert.
  const values = {
    companyId,
    key: input.key ?? keyFromLabel(input.label),
    label: input.label,
    color: input.color ?? DEFAULT_APPOINTMENT_COLOR,
    durationMinutes: input.durationMinutes ?? DEFAULT_APPOINTMENT_DURATION,
    // Dopo l'ultimo tipo (archiviati inclusi, per non riusare posizioni).
    position: sql`(select coalesce(max(${companyAppointmentTypes.position}), 0) + ${POSITION_STEP} from ${companyAppointmentTypes} where ${companyAppointmentTypes.companyId} = ${companyId})`,
  };
  const inserted = await tx.insert(companyAppointmentTypes).values(values).returning();
  return toAppointmentType(first(inserted, "insert company_appointment_types"));
}

export async function updateAppointmentType(
  tx: Tx,
  companyId: string,
  id: string,
  patch: UpdateAppointmentTypeInput,
): Promise<AppointmentType> {
  const set: Partial<AppointmentTypeInsert> = { updatedAt: new Date() };
  if (patch.label !== undefined) set.label = patch.label;
  if (patch.color !== undefined) set.color = patch.color;
  if (patch.durationMinutes !== undefined) set.durationMinutes = patch.durationMinutes;
  if (patch.position !== undefined) set.position = patch.position;
  if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null;

  const updated = await tx
    .update(companyAppointmentTypes)
    .set(set)
    .where(and(eq(companyAppointmentTypes.id, id), eq(companyAppointmentTypes.companyId, companyId)))
    .returning();
  const row = updated[0];
  if (!row) throw new NotFoundError("Tipo di appuntamento non trovato");
  return toAppointmentType(row);
}

/** Archivia (non elimina): gli eventi già collegati mantengono il riferimento. */
export async function archiveAppointmentType(tx: Tx, companyId: string, id: string): Promise<void> {
  const archived = await tx
    .update(companyAppointmentTypes)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(companyAppointmentTypes.id, id),
        eq(companyAppointmentTypes.companyId, companyId),
        isNull(companyAppointmentTypes.archivedAt),
      ),
    )
    .returning({ id: companyAppointmentTypes.id });
  if (archived.length === 0) throw new NotFoundError("Tipo di appuntamento non trovato o già archiviato");
}

// ─── Ruoli personalizzati ───────────────────────────────────────────────────
export async function listCustomRoles(tx: Tx, companyId: string): Promise<CustomRole[]> {
  const rows = await tx
    .select()
    .from(companyRoles)
    .where(eq(companyRoles.companyId, companyId))
    .orderBy(asc(companyRoles.label));
  return rows.map(toCustomRole);
}

export async function createCustomRole(tx: Tx, companyId: string, input: CreateCustomRoleInput): Promise<CustomRole> {
  const inserted = await tx
    .insert(companyRoles)
    .values({
      companyId,
      key: input.key ?? keyFromLabel(input.label),
      label: input.label,
      permissions: input.permissions,
    })
    .returning();
  return toCustomRole(first(inserted, "insert company_roles"));
}

export async function updateCustomRole(
  tx: Tx,
  companyId: string,
  id: string,
  patch: UpdateCustomRoleInput,
): Promise<CustomRole> {
  const set: { label?: string; permissions?: string[]; updatedAt: Date } = { updatedAt: new Date() };
  if (patch.label !== undefined) set.label = patch.label;
  if (patch.permissions !== undefined) set.permissions = patch.permissions;
  const updated = await tx
    .update(companyRoles)
    .set(set)
    .where(and(eq(companyRoles.id, id), eq(companyRoles.companyId, companyId)))
    .returning();
  const row = updated[0];
  if (!row) throw new NotFoundError("Ruolo non trovato");
  return toCustomRole(row);
}

/** Elimina il ruolo: i membri che lo avevano tornano al ruolo di sistema (FK ON DELETE SET NULL). */
export async function deleteCustomRole(tx: Tx, companyId: string, id: string): Promise<void> {
  const deleted = await tx
    .delete(companyRoles)
    .where(and(eq(companyRoles.id, id), eq(companyRoles.companyId, companyId)))
    .returning({ id: companyRoles.id });
  if (deleted.length === 0) throw new NotFoundError("Ruolo non trovato");
}

/** Membri dello studio con email (get_company_members, richiede members:manage). */
export async function listMembers(tx: Tx, companyId: string): Promise<MemberSummary[]> {
  const rows = (await tx.execute(
    sql`select * from public.get_company_members(${companyId})`,
  )) as unknown as MemberSqlRow[];
  return rows.map(toMember);
}

/**
 * Assegna (o rimuove con null) il ruolo personalizzato a un membro.
 * Titolari e amministratori non ne hanno: il DB lo blocca con 23514, mappato a ValidationError.
 */
export async function assignCustomRole(
  tx: Tx,
  companyId: string,
  userId: string,
  customRoleId: string | null,
): Promise<MemberSummary> {
  const [member] = await tx
    .select({ role: companyMembers.role })
    .from(companyMembers)
    .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, userId)))
    .limit(1);
  if (!member) throw new NotFoundError("Membro non trovato");
  if (customRoleId && (member.role === "owner" || member.role === "admin")) {
    throw new ValidationError("Titolari e amministratori hanno sempre tutti i permessi: nessun ruolo personalizzato");
  }

  try {
    await tx
      .update(companyMembers)
      .set({ customRoleId, updatedAt: new Date() })
      .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, userId)));
  } catch (err) {
    const code = pgErrorCode(err);
    if (code === "23514") throw new ValidationError("Ruolo non assegnabile a questo membro");
    if (code === "23503") throw new ValidationError("Ruolo personalizzato non trovato per questo studio");
    throw err;
  }

  const updated = (await listMembers(tx, companyId)).find((m) => m.userId === userId);
  if (!updated) throw new NotFoundError("Membro non trovato");
  return updated;
}
