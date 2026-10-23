import { apiOk, handleApiError } from "@/lib/api";
import { isInvitationTokenFormat } from "@/lib/auth/invitation-token";
import { previewInvitation } from "@/lib/data/members";
import { withUser } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** Anteprima dell'invito. Richiede solo la sessione (nessuno studio). */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const token = (await params).token;
    if (!isInvitationTokenFormat(token)) throw new NotFoundError("Invito non valido o scaduto");
    return apiOk(await withUser((tx) => previewInvitation(tx, token)));
  } catch (err) {
    return handleApiError(err);
  }
}
