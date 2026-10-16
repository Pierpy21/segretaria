import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { patients, type NewPatientRow, type PatientRow } from "@/drizzle/schema";
import type { CreatePatientInput, ClinicalPatientKey, PatientResponse } from "@/app/types/api";
import { getCalendarTimeZone } from "@/lib/calendar-sync/time";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { ageFrom, formatItalianLong, initialsOf, parseDateInput } from "./format";

const MAX_CODE_ATTEMPTS = 5;

const CLINICAL_KEYS: readonly ClinicalPatientKey[] = [
  "recommendation",
  "previousVisit",
  "selectedTooth",
  "xrayFindings",
  "treatments",
];

/** `clinical` = il ruolo ha clinical:read: solo allora i campi clinici sono inclusi. */
function toPatient(row: PatientRow, now: Date, tz: string, clinical: boolean): PatientResponse {
  const view: PatientResponse = {
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
    insurance: row.insurance,
  };
  if (clinical) {
    view.recommendation = row.recommendation;
    view.previousVisit = row.previousVisit;
    view.selectedTooth = row.selectedTooth;
    view.xrayFindings = row.xrayFindings;
    view.treatments = row.treatments;
  }
  return view;
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
function newPatientCode(now: Date): string {
  const seq = String(randomInt(0, 10_000)).padStart(4, "0");
  return `PT-${now.getFullYear()}-${seq}`;
}

export async function listPatients(tx: Tx, companyId: string, clinical: boolean): Promise<PatientResponse[]> {
  const now = new Date();
  const tz = getCalendarTimeZone();
  const rows = await tx
    .select()
    .from(patients)
    .where(eq(patients.companyId, companyId))
    .orderBy(asc(patients.name));
  return rows.map((row) => toPatient(row, now, tz, clinical));
}

/** `code` è l'id applicativo del paziente (es. "PT-2026-0142"). */
export async function getPatient(
  tx: Tx,
  companyId: string,
  code: string,
  clinical: boolean,
): Promise<PatientResponse | null> {
  const now = new Date();
  const tz = getCalendarTimeZone();
  const rows = await tx
    .select()
    .from(patients)
    .where(and(eq(patients.companyId, companyId), eq(patients.code, code)))
    .limit(1);
  const row = rows[0];
  return row ? toPatient(row, now, tz, clinical) : null;
}

/**
 * Il retry sul codice casuale usa ON CONFLICT DO NOTHING (non un errore 23505):
 * un errore abortirebbe la transazione, il DO NOTHING no. Stessa tx, nessun round-trip extra.
 */
export async function createPatient(
  tx: Tx,
  companyId: string,
  input: CreatePatientInput,
  clinical: boolean,
): Promise<PatientResponse> {
  // Creare un paziente comporta sempre dati clinici (anche vuoti): richiede clinical:read.
  if (!clinical) throw new ForbiddenError("Creazione paziente non consentita per il tuo ruolo");
  const now = new Date();
  const tz = getCalendarTimeZone();
  const values = {
    companyId,
    name: assertName(input.name),
    gender: input.gender,
    avatar: input.avatar ?? "",
    dateOfBirth: parseBirthDate(input.dateOfBirth),
    phone: input.phone ?? "",
    email: input.email ?? "",
    address: input.address ?? "",
    fiscalCode: input.fiscalCode ?? "",
    recommendation: input.recommendation ?? "",
    insurance: input.insurance,
    previousVisit: input.previousVisit,
    selectedTooth: input.selectedTooth,
    xrayFindings: input.xrayFindings,
    treatments: input.treatments,
  };

  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const inserted = await tx
      .insert(patients)
      .values({ ...values, code: newPatientCode(now) })
      .onConflictDoNothing()
      .returning();
    const row = inserted[0];
    if (row) return toPatient(row, now, tz, clinical);
  }
  throw new ConflictError("Impossibile generare un codice paziente univoco, riprova");
}

export async function updatePatient(
  tx: Tx,
  companyId: string,
  code: string,
  patch: Partial<CreatePatientInput>,
  clinical: boolean,
): Promise<PatientResponse> {
  if (!clinical && CLINICAL_KEYS.some((k) => patch[k] !== undefined)) {
    throw new ForbiddenError("Modifica dei dati clinici non consentita per il tuo ruolo");
  }
  const now = new Date();
  const tz = getCalendarTimeZone();

  const set: Partial<NewPatientRow> = { updatedAt: now };
  if (patch.name !== undefined) set.name = assertName(patch.name);
  if (patch.gender !== undefined) set.gender = patch.gender;
  if (patch.avatar !== undefined) set.avatar = patch.avatar;
  if (patch.dateOfBirth !== undefined) set.dateOfBirth = parseBirthDate(patch.dateOfBirth);
  if (patch.phone !== undefined) set.phone = patch.phone;
  if (patch.email !== undefined) set.email = patch.email;
  if (patch.address !== undefined) set.address = patch.address;
  if (patch.fiscalCode !== undefined) set.fiscalCode = patch.fiscalCode;
  if (patch.recommendation !== undefined) set.recommendation = patch.recommendation;
  if (patch.insurance !== undefined) set.insurance = patch.insurance;
  if (patch.previousVisit !== undefined) set.previousVisit = patch.previousVisit;
  if (patch.selectedTooth !== undefined) set.selectedTooth = patch.selectedTooth;
  if (patch.xrayFindings !== undefined) set.xrayFindings = patch.xrayFindings;
  if (patch.treatments !== undefined) set.treatments = patch.treatments;

  const updated = await tx
    .update(patients)
    .set(set)
    .where(and(eq(patients.companyId, companyId), eq(patients.code, code)))
    .returning();
  const row = updated[0];
  if (!row) throw new NotFoundError("Paziente non trovato");
  return toPatient(row, now, tz, clinical);
}
