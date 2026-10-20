import { apiOk, handleApiError } from "@/lib/api";
import { getSettings } from "@/lib/data/settings";
import { withPermission } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Impostazioni dello studio: terminologia, moduli, tipi di appuntamento, preset disponibili. */
export async function GET() {
  try {
    return apiOk(
      await withPermission("settings:manage", (tx, { companyId }) => getSettings(tx, companyId)),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
