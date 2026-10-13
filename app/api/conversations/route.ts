import { apiOk, handleApiError } from "@/lib/api";
import { listConversations } from "@/lib/data/conversations";
import { withCompany } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiOk(await withCompany((tx, { companyId }) => listConversations(tx, companyId)));
  } catch (err) {
    return handleApiError(err);
  }
}
