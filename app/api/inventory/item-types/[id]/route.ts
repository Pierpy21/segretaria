import { apiOk, handleApiError } from "@/lib/api";
import { deleteInventoryItemType, updateInventoryItemType } from "@/lib/data/inventory";
import { withPermission } from "@/lib/db";
import { parseInventoryItemTypePatch, parseUuid, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseUuid((await params).id, "id tipo di articolo");
    const patch = parseInventoryItemTypePatch(await readJsonObject(request));
    return apiOk(
      await withPermission("settings:manage", (tx, { companyId }) => updateInventoryItemType(tx, companyId, id, patch)),
    );
  } catch (err) {
    return handleApiError(err);
  }
}

/** Elimina se nessun articolo usa il tipo, altrimenti lo archivia. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseUuid((await params).id, "id tipo di articolo");
    await withPermission("settings:manage", (tx, { companyId }) => deleteInventoryItemType(tx, companyId, id));
    return apiOk(null);
  } catch (err) {
    return handleApiError(err);
  }
}
