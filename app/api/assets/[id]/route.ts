import { apiOk, handleApiError } from "@/lib/api";
import { archiveClientAsset, getClientAsset, updateClientAsset } from "@/lib/data/assets";
import { withPermission } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { parseAssetPatch, parseUuid, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseUuid((await params).id, "id bene");
    const asset = await withPermission("clients:read", (tx, { companyId }) => getClientAsset(tx, companyId, id));
    if (!asset) throw new NotFoundError("Bene non trovato");
    return apiOk(asset);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseUuid((await params).id, "id bene");
    const patch = parseAssetPatch(await readJsonObject(request));
    return apiOk(
      await withPermission("clients:write", (tx, { companyId }) => updateClientAsset(tx, companyId, id, patch)),
    );
  } catch (err) {
    return handleApiError(err);
  }
}

/** Archivia il bene (soft delete). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseUuid((await params).id, "id bene");
    const archived = await withPermission("clients:write", (tx, { companyId }) =>
      archiveClientAsset(tx, companyId, id),
    );
    if (!archived) throw new NotFoundError("Bene non trovato");
    return apiOk(null);
  } catch (err) {
    return handleApiError(err);
  }
}
