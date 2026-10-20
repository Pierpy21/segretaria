import { apiOk, handleApiError } from "@/lib/api";
import { updateTerms } from "@/lib/data/settings";
import { withPermission } from "@/lib/db";
import { parseTermsPatch, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Etichette dello studio: chiavi note; "" o null ripristina il default. Ritorna le etichette risolte. */
export async function PATCH(request: Request) {
  try {
    const patch = parseTermsPatch(await readJsonObject(request));
    return apiOk(
      await withPermission("settings:manage", (tx, { companyId }) => updateTerms(tx, companyId, patch)),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
