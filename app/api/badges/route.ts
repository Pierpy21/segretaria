import { apiOk, handleApiError } from "@/lib/api";
import { getSidebarBadges } from "@/lib/data/badges";
import { requireCompany } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { companyId } = await requireCompany();
    return apiOk(await getSidebarBadges(companyId));
  } catch (err) {
    return handleApiError(err);
  }
}
