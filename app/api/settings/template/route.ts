import { apiOk, handleApiError } from "@/lib/api";
import { applyTemplate, getSettings } from "@/lib/data/settings";
import { withPermission } from "@/lib/db";
import { parseApplyTemplateInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Applica il preset di un settore allo studio (campi, moduli, tipi di appuntamento, terminologia).
 * Idempotente sui campi/tipi/moduli già presenti. Ritorna le impostazioni aggiornate.
 */
export async function POST(request: Request) {
  try {
    const input = parseApplyTemplateInput(await readJsonObject(request));
    return apiOk(
      await withPermission("settings:manage", async (tx, { companyId }) => {
        await applyTemplate(tx, companyId, input.sector, input.keepTerms ?? false);
        return getSettings(tx, companyId);
      }),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
