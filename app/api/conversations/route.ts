import { apiOk, handleApiError } from "@/lib/api";
import { listConversations } from "@/lib/data/conversations";
import { withPermission } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiOk(await withPermission("chat:read", (tx, { companyId }) => listConversations(tx, companyId)));
  } catch (err) {
    return handleApiError(err);
  }
}
