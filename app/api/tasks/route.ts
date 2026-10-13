import { apiOk, handleApiError } from "@/lib/api";
import { createTask, listTasks } from "@/lib/data/tasks";
import { requireCompany } from "@/lib/db";
import { parseTaskInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { companyId } = await requireCompany();
    return apiOk(await listTasks(companyId));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const { companyId } = await requireCompany();
    const input = parseTaskInput(await readJsonObject(request));
    return apiOk(await createTask(companyId, input), 201);
  } catch (err) {
    return handleApiError(err);
  }
}
