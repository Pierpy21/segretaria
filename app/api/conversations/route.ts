import { apiOk, handleApiError } from "@/lib/api";
import { listConversations } from "@/lib/data/conversations";
import { requireCompany } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { companyId } = await requireCompany();
    return apiOk(await listConversations(companyId));
  } catch (err) {
    return handleApiError(err);
  }
}
