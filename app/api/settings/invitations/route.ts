import { apiOk, handleApiError } from "@/lib/api";
import { sendInvitationEmail } from "@/lib/auth/invite-email";
import { createInvitation } from "@/lib/data/members";
import { withPermission } from "@/lib/db";
import { parseCreateInvitationInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Crea un invito (o lo reinvia) e prova a spedire l'email. Il link è sempre restituito. */
export async function POST(request: Request) {
  try {
    const input = parseCreateInvitationInput(await readJsonObject(request));
    const created = await withPermission("members:manage", (tx, ctx) => createInvitation(tx, ctx, input));

    // Fuori dalla transazione: nessuna chiamata di rete dentro tx.
    const inviteUrl = `${new URL(request.url).origin}/invito/${created.token}`;
    const emailSent = await sendInvitationEmail({ email: created.invitation.email, redirectTo: inviteUrl });

    return apiOk({ invitation: created.invitation, inviteUrl, emailSent }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
