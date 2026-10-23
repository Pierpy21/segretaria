import { apiOk, handleApiError } from "@/lib/api";
import { isInvitationTokenFormat } from "@/lib/auth/invitation-token";
import { acceptInvitation } from "@/lib/data/members";
import { withUser } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** Accetta l'invito per l'utente corrente: diventa membro dello studio con il ruolo invitato. */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const token = (await params).token;
    if (!isInvitationTokenFormat(token)) throw new NotFoundError("Invito non valido o scaduto");
    return apiOk(await withUser((tx) => acceptInvitation(tx, token)));
  } catch (err) {
    return handleApiError(err);
  }
}
