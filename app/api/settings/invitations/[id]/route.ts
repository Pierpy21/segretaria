import { apiOk, handleApiError } from "@/lib/api";
import { revokeInvitation } from "@/lib/data/members";
import { withPermission } from "@/lib/db";
import { parseUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Revoca un invito non ancora accettato (non si cancella: revoked_at). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseUuid((await params).id, "Identificativo invito");
    return apiOk(await withPermission("members:manage", (tx, ctx) => revokeInvitation(tx, ctx, id)));
  } catch (err) {
    return handleApiError(err);
  }
}
