import { apiOk, handleApiError } from "@/lib/api";
import { getSidebarBadges } from "@/lib/data/badges";
import { withCompany } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiOk(await withCompany((tx, { companyId }) => getSidebarBadges(tx, companyId)));
  } catch (err) {
    return handleApiError(err);
  }
}
