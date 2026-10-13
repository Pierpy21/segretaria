import { apiOk, handleApiError } from "@/lib/api";
import { getPatient, updatePatient } from "@/lib/data/patients";
import { withCompany } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { parsePatientCode, parsePatientPatch, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const code = parsePatientCode((await params).id);
    const patient = await withCompany((tx, { companyId }) => getPatient(tx, companyId, code));
    if (!patient) throw new NotFoundError("Paziente non trovato");
    return apiOk(patient);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const code = parsePatientCode((await params).id);
    const patch = parsePatientPatch(await readJsonObject(request));
    return apiOk(await withCompany((tx, { companyId }) => updatePatient(tx, companyId, code, patch)));
  } catch (err) {
    return handleApiError(err);
  }
}
