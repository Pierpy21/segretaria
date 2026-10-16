import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import {
  patientClinical,
  patients,
  type NewPatientClinicalRow,
  type NewPatientRow,
  type PatientClinicalRow,
  type PatientRow,
} from "@/drizzle/schema";
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

type ClinicalFields = Omit<NewPatientClinicalRow, "patientId" | "companyId" | "createdAt" | "updatedAt">;

const EMPTY_CLINICAL = {
  recommendation: "",
  previousVisit: {},
  selectedTooth: {},
  xrayFindings: [],
  treatments: [],
} as unknown as Required<ClinicalFields>;

/**
 * I dati clinici stanno in patient_clinical (RLS: negati ad accountant).
 * `clinical` = il ruolo ha clinical:read: solo allora la tabella è letta e i campi inclusi.
 */
function toPatient(
  row: PatientRow,
  clinicalRow: PatientClinicalRow | null,
  now: Date,
  tz: string,
  clinical: boolean,
): PatientResponse {
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
    const c = clinicalRow ?? EMPTY_CLINICAL;
    view.recommendation = c.recommendation;
    view.previousVisit = c.previousVisit;
    view.selectedTooth = c.selectedTooth;
    view.xrayFindings = c.xrayFindings;
    view.treatments = c.treatments;
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
  const where = eq(patients.companyId, companyId);
  if (!clinical) {
    const rows = await tx.select().from(patients).where(where).orderBy(asc(patients.name));
    return rows.map((row) => toPatient(row, null, now, tz, false));
  }
  const rows = await tx
    .select({ patient: patients, clinical: patientClinical })
    .from(patients)
    .leftJoin(patientClinical, eq(patientClinical.patientId, patients.id))
    .where(where)
    .orderBy(asc(patients.name));
  return rows.map((r) => toPatient(r.patient, r.clinical, now, tz, true));
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
  if (!row) return null;
  return toPatient(row, clinical ? await getClinicalRow(tx, row.id) : null, now, tz, clinical);
}

async function getClinicalRow(tx: Tx, patientId: string): Promise<PatientClinicalRow | null> {
  const rows = await tx
    .select()
    .from(patientClinical)
    .where(eq(patientClinical.patientId, patientId))
    .limit(1);
  return rows[0] ?? null;
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
    insurance: input.insurance,
  };
  const clinicalValues: ClinicalFields = {
    recommendation: input.recommendation ?? "",
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
    if (row) {
      const [clinicalRow] = await tx
        .insert(patientClinical)
        .values({ ...clinicalValues, patientId: row.id, companyId })
        .returning();
      return toPatient(row, clinicalRow, now, tz, clinical);
    }
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
  if (patch.insurance !== undefined) set.insurance = patch.insurance;

  const clinicalSet: ClinicalFields = {};
  if (patch.recommendation !== undefined) clinicalSet.recommendation = patch.recommendation;
  if (patch.previousVisit !== undefined) clinicalSet.previousVisit = patch.previousVisit;
  if (patch.selectedTooth !== undefined) clinicalSet.selectedTooth = patch.selectedTooth;
  if (patch.xrayFindings !== undefined) clinicalSet.xrayFindings = patch.xrayFindings;
  if (patch.treatments !== undefined) clinicalSet.treatments = patch.treatments;

  const updated = await tx
    .update(patients)
    .set(set)
    .where(and(eq(patients.companyId, companyId), eq(patients.code, code)))
    .returning();
  const row = updated[0];
  if (!row) throw new NotFoundError("Paziente non trovato");
  if (!clinical) return toPatient(row, null, now, tz, false);

  // Upsert: un paziente senza riga clinica (es. inserito fuori dall'app) la ottiene qui.
  const clinicalRow = Object.keys(clinicalSet).length
    ? (
        await tx
          .insert(patientClinical)
          .values({ ...clinicalSet, patientId: row.id, companyId })
          .onConflictDoUpdate({ target: patientClinical.patientId, set: { ...clinicalSet, updatedAt: now } })
          .returning()
      )[0]
    : await getClinicalRow(tx, row.id);
  return toPatient(row, clinicalRow, now, tz, true);
}
