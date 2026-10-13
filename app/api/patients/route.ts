import { apiOk, handleApiError } from "@/lib/api";
import { createPatient, listPatients } from "@/lib/data/patients";
import { withCompany } from "@/lib/db";
import { parseCreatePatient, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiOk(await withCompany((tx, { companyId }) => listPatients(tx, companyId)));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const input = parseCreatePatient(await readJsonObject(request));
    return apiOk(await withCompany((tx, { companyId }) => createPatient(tx, companyId, input)), 201);
  } catch (err) {
    return handleApiError(err);
  }
}
