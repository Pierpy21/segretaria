import { apiOk, handleApiError } from "@/lib/api";
import { createTask, listTasks } from "@/lib/data/tasks";
import { withPermission } from "@/lib/db";
import { parseTaskInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiOk(await withPermission("tasks:read", (tx, { companyId }) => listTasks(tx, companyId)));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const input = parseTaskInput(await readJsonObject(request));
    return apiOk(await withPermission("tasks:write", (tx, { companyId }) => createTask(tx, companyId, input)), 201);
  } catch (err) {
    return handleApiError(err);
  }
}
