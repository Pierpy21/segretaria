import { apiOk, handleApiError } from "@/lib/api";
import { deleteCustomRole, updateCustomRole } from "@/lib/data/settings";
import { withPermission } from "@/lib/db";
import { parseCustomRolePatch, parseUuid, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseUuid((await params).id, "id ruolo");
    const patch = parseCustomRolePatch(await readJsonObject(request));
    return apiOk(
      await withPermission("members:manage", (tx, { companyId }) => updateCustomRole(tx, companyId, id, patch)),
    );
  } catch (err) {
    return handleApiError(err);
  }
}

/** Elimina il ruolo; i membri che lo avevano tornano al ruolo di sistema. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseUuid((await params).id, "id ruolo");
    await withPermission("members:manage", (tx, { companyId }) => deleteCustomRole(tx, companyId, id));
    return apiOk(null);
  } catch (err) {
    return handleApiError(err);
  }
}
