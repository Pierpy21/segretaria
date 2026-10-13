import { apiOk, handleApiError } from "@/lib/api";
import { buildSyncStatus } from "@/lib/calendar-sync";
import { listConnectionInfo } from "@/lib/calendar-sync/connections";
import { withCompany } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Solo lettura DB in una tx (withCompany): nessuna chiamata a Google/Apple. */
export async function GET() {
  try {
    const connections = await withCompany((tx, { companyId }) => listConnectionInfo(tx, companyId));
    return apiOk(buildSyncStatus(connections));
  } catch (err) {
    return handleApiError(err);
  }
}
