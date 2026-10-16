import { apiOk, handleApiError } from "@/lib/api";
import { getPatient, updatePatient } from "@/lib/data/patients";
import { hasPermission } from "@/lib/auth/permissions";
import { withPermission } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { parsePatientCode, parsePatientPatch, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const code = parsePatientCode((await params).id);
    const patient = await withPermission("patients:read", (tx, { companyId, role }) =>
      getPatient(tx, companyId, code, hasPermission(role, "clinical:read")),
    );
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
    return apiOk(
      await withPermission("patients:write", (tx, { companyId, role }) =>
        updatePatient(tx, companyId, code, patch, hasPermission(role, "clinical:read")),
      ),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
