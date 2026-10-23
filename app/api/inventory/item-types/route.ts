import { apiOk, handleApiError } from "@/lib/api";
import { can } from "@/lib/auth/permissions";
import { createInventoryItemType, listInventoryItemTypes } from "@/lib/data/inventory";
import { withCompany, withPermission } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { parseInventoryItemTypeInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Tipi di articolo (anche archiviati). Leggibili con inventory:read oppure settings:manage;
 * senza modulo come route di settings, così la configurazione è disponibile prima di attivarlo.
 */
export async function GET() {
  try {
    const types = await withCompany(async (tx, { companyId, permissions }) => {
      if (!can(permissions, "inventory:read") && !can(permissions, "settings:manage")) throw new ForbiddenError();
      return listInventoryItemTypes(tx, companyId);
    });
    return apiOk(types);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const input = parseInventoryItemTypeInput(await readJsonObject(request));
    return apiOk(
      await withPermission("settings:manage", (tx, { companyId }) => createInventoryItemType(tx, companyId, input)),
      201,
    );
  } catch (err) {
    return handleApiError(err);
  }
}
