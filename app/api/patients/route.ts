import { apiOk, handleApiError } from "@/lib/api";
import { createPatient, listPatients } from "@/lib/data/patients";
import { requireCompany } from "@/lib/db";
import { parseCreatePatient, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { companyId } = await requireCompany();
    return apiOk(await listPatients(companyId));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const { companyId } = await requireCompany();
    const input = parseCreatePatient(await readJsonObject(request));
    return apiOk(await createPatient(companyId, input), 201);
  } catch (err) {
    return handleApiError(err);
  }
}
