import { apiOk, handleApiError } from "@/lib/api";
import { deleteTask, updateTask } from "@/lib/data/tasks";
import { requireCompany } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { parseTaskPatch, parseUuid, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireCompany();
    const id = parseUuid((await params).id, "id attività");
    const patch = parseTaskPatch(await readJsonObject(request));
    return apiOk(await updateTask(companyId, id, patch));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireCompany();
    const id = parseUuid((await params).id, "id attività");
    if (!(await deleteTask(companyId, id))) throw new NotFoundError("Attività non trovata");
    return apiOk(null);
  } catch (err) {
    return handleApiError(err);
  }
}
