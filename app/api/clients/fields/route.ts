import { apiOk, handleApiError } from "@/lib/api";
import { listFieldDefinitions } from "@/lib/data/clients";
import { can } from "@/lib/auth/permissions";
import { withCompany, withPermission } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { parseAssetTypeParam, parseClientTypeParam, parseEntityParam, parseItemTypeParam } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Definizioni dei campi. `?entity=client` (default): `?type=dentale` filtra per settore;
 * sensibili solo con sensitive:read. `?entity=asset`: `?type=veicolo` filtra per tipo bene,
 * senza `type` restituisce tutte le definizioni dei beni (solo non sensibili).
 * `?entity=item`: `?type=<chiave tipo articolo>` filtra per tipo articolo (inventory:read o settings:manage).
 */
export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams;
    const entity = parseEntityParam(sp.get("entity"));
    if (entity === "item") {
      const itemType = parseItemTypeParam(sp.get("type"));
      return apiOk(
        await withCompany(async (tx, { companyId, permissions }) => {
          if (!can(permissions, "inventory:read") && !can(permissions, "settings:manage")) throw new ForbiddenError();
          return listFieldDefinitions(tx, companyId, itemType, false, "item");
        }),
      );
    }
    if (entity === "asset") {
      const assetType = parseAssetTypeParam(sp.get("type"));
      return apiOk(
        await withPermission("clients:read", (tx, { companyId }) =>
          listFieldDefinitions(tx, companyId, assetType, false, "asset"),
        ),
      );
    }
    const type = parseClientTypeParam(sp.get("type"));
    return apiOk(
      await withPermission("clients:read", (tx, { companyId, permissions }) =>
        listFieldDefinitions(tx, companyId, type, can(permissions, "sensitive:read")),
      ),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
