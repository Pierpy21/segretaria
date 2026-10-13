import { apiOk, handleApiError } from "@/lib/api";
import { getSyncStatus } from "@/lib/calendar-sync";
import { requireCompany } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { companyId } = await requireCompany();
    return apiOk(await getSyncStatus(companyId));
  } catch (err) {
    return handleApiError(err);
  }
}
