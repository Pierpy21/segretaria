import { apiOk, handleApiError } from "@/lib/api";
import { createMessage, listMessages } from "@/lib/data/conversations";
import { withPermission } from "@/lib/db";
import { parseMessageInput, parseUuid, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseUuid((await params).id, "id conversazione");
    return apiOk(await withPermission("chat:read", (tx, { companyId }) => listMessages(tx, companyId, id)));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseUuid((await params).id, "id conversazione");
    const input = parseMessageInput(await readJsonObject(request));
    return apiOk(
      await withPermission("chat:write", (tx, { companyId }) => createMessage(tx, companyId, id, input)),
      201,
    );
  } catch (err) {
    return handleApiError(err);
  }
}
