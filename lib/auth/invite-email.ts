import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/** Solo il dominio, mai l'indirizzo completo, nei log. */
function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : "invalid";
}

/**
 * Invia l'email di invito tramite Supabase Auth (auth.admin.inviteUserByEmail).
 * Ritorna false senza lanciare se il client admin non è configurato, se l'utente è già
 * registrato o se la chiamata fallisce: il chiamante mostra il link da copiare.
 * Da chiamare FUORI da qualunque transazione (rete).
 */
export async function sendInvitationEmail(input: { email: string; redirectTo: string }): Promise<boolean> {
  const domain = domainOf(input.email);
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.warn("[invite] SUPABASE_SERVICE_ROLE_KEY non configurata: email non inviata");
    return false;
  }

  try {
    const { error } = await admin.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: input.redirectTo,
    });
    if (error) {
      console.warn("[invite] invio email non riuscito", { domain, status: error.status, code: error.code });
      return false;
    }
    return true;
  } catch (err) {
    console.error("[invite] errore imprevisto nell'invio email", {
      domain,
      name: err instanceof Error ? err.name : "unknown",
    });
    return false;
  }
}
