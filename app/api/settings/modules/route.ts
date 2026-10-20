import { apiOk, handleApiError } from "@/lib/api";
import { updateModules } from "@/lib/data/settings";
import { withPermission } from "@/lib/db";
import { parseModulesPatch, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Attiva/disattiva moduli. Un modulo spento spegne anche i permessi collegati (anche in RLS). */
export async function PATCH(request: Request) {
  try {
    const patch = parseModulesPatch(await readJsonObject(request));
    return apiOk(
      await withPermission("settings:manage", (tx, { companyId }) => updateModules(tx, companyId, patch)),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
