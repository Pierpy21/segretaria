import { apiOk, handleApiError } from "@/lib/api";
import { createPatient, listPatients } from "@/lib/data/patients";
import { hasPermission } from "@/lib/auth/permissions";
import { withPermission } from "@/lib/db";
import { parseCreatePatient, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiOk(
      await withPermission("patients:read", (tx, { companyId, role }) =>
        listPatients(tx, companyId, hasPermission(role, "clinical:read")),
      ),
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const input = parseCreatePatient(await readJsonObject(request));
    return apiOk(
      await withPermission("patients:write", (tx, { companyId, role }) =>
        createPatient(tx, companyId, input, hasPermission(role, "clinical:read")),
      ),
      201,
    );
  } catch (err) {
    return handleApiError(err);
  }
}
