import { apiOk, handleApiError } from "@/lib/api";
import { createTask, listTasks } from "@/lib/data/tasks";
import { withCompany } from "@/lib/db";
import { parseTaskInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiOk(await withCompany((tx, { companyId }) => listTasks(tx, companyId)));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const input = parseTaskInput(await readJsonObject(request));
    return apiOk(await withCompany((tx, { companyId }) => createTask(tx, companyId, input)), 201);
  } catch (err) {
    return handleApiError(err);
  }
}
