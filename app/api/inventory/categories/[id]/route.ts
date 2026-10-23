import { apiOk, handleApiError } from "@/lib/api";
import { deleteInventoryCategory, updateInventoryCategory } from "@/lib/data/inventory";
import { withModule } from "@/lib/db";
import { parseInventoryCategoryPatch, parseUuid, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseUuid((await params).id, "id categoria");
    const patch = parseInventoryCategoryPatch(await readJsonObject(request));
    return apiOk(
      await withModule("inventory", "inventory:write", (tx, { companyId }) =>
        updateInventoryCategory(tx, companyId, id, patch),
      ),
    );
  } catch (err) {
    return handleApiError(err);
  }
}

/** Elimina la categoria: sottocategorie e articoli restano senza padre/categoria. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseUuid((await params).id, "id categoria");
    await withModule("inventory", "inventory:write", (tx, { companyId }) =>
      deleteInventoryCategory(tx, companyId, id),
    );
    return apiOk(null);
  } catch (err) {
    return handleApiError(err);
  }
}
