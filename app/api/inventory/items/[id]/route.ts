import { apiOk, handleApiError } from "@/lib/api";
import { getInventoryItem, updateInventoryItem } from "@/lib/data/inventory";
import { withModule } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { NotFoundError } from "@/lib/errors";
import { parseInventoryItemPatch, parseUuid, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Dettaglio con lotti in giacenza e ultimi movimenti. Il cliente dei movimenti solo con clients:read. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseUuid((await params).id, "id articolo");
    const detail = await withModule("inventory", "inventory:read", (tx, { companyId, permissions }) =>
      getInventoryItem(tx, companyId, id, { withClients: can(permissions, "clients:read") }),
    );
    if (!detail) throw new NotFoundError("Articolo non trovato");
    return apiOk(detail);
  } catch (err) {
    return handleApiError(err);
  }
}

/** Modifica; `archived: true/false` archivia o ripristina (soft delete). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseUuid((await params).id, "id articolo");
    const patch = parseInventoryItemPatch(await readJsonObject(request));
    return apiOk(
      await withModule("inventory", "inventory:write", (tx, { companyId }) => updateInventoryItem(tx, companyId, id, patch)),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
