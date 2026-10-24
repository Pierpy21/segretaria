// Nome e cognome dell'utente (Supabase user_metadata). Client-safe: nessun import server.

export const PERSON_NAME_MAX = 60;

/** Stringa → trim, spazi interni collassati, max 60 caratteri (per code point). Vuota o non stringa → null. */
export function normalizePersonName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = Array.from(v.trim().replace(/\s+/g, " ")).slice(0, PERSON_NAME_MAX).join("").trim();
  return t.length > 0 ? t : null;
}

/** "Mario Rossi" dal nome e dal cognome; null se mancano entrambi. */
export function fullNameOf(user: { firstName: string | null; lastName: string | null }): string | null {
  const parts = [user.firstName, user.lastName].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(" ") : null;
}
