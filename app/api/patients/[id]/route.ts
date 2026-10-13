import { apiOk, handleApiError } from "@/lib/api";
import { getPatient, updatePatient } from "@/lib/data/patients";
import { requireCompany } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { parsePatientCode, parsePatientPatch, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireCompany();
    const code = parsePatientCode((await params).id);
    const patient = await getPatient(companyId, code);
    if (!patient) throw new NotFoundError("Paziente non trovato");
    return apiOk(patient);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireCompany();
    const code = parsePatientCode((await params).id);
    const patch = parsePatientPatch(await readJsonObject(request));
    return apiOk(await updatePatient(companyId, code, patch));
  } catch (err) {
    return handleApiError(err);
  }
}
