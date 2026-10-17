import { apiOk, handleApiError } from "@/lib/api";
import { listFieldDefinitions } from "@/lib/data/clients";
import { hasPermission } from "@/lib/auth/permissions";
import { withPermission } from "@/lib/db";
import { parseAssetTypeParam, parseClientTypeParam, parseEntityParam } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Definizioni dei campi. `?entity=client` (default): `?type=dentale` filtra per settore;
 * sensibili solo con clinical:read. `?entity=asset`: `?type=veicolo` filtra per tipo bene,
 * senza `type` restituisce tutte le definizioni dei beni (solo non sensibili).
 */
export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams;
    const entity = parseEntityParam(sp.get("entity"));
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
      await withPermission("clients:read", (tx, { companyId, role }) =>
        listFieldDefinitions(tx, companyId, type, hasPermission(role, "clinical:read")),
      ),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
