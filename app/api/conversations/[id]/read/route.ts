import { apiOk, handleApiError } from "@/lib/api";
import { markConversationRead } from "@/lib/data/conversations";
import { withPermission } from "@/lib/db";
import { parseUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseUuid((await params).id, "id conversazione");
    await withPermission("chat:write", (tx, { companyId }) => markConversationRead(tx, companyId, id));
    return apiOk(null);
  } catch (err) {
    return handleApiError(err);
  }
}
