// Validazione del parametro `next` dopo login/conferma (client-safe: nessuna dipendenza server).
// Accetta solo percorsi interni ("/...") o URL assoluti con lo stesso origin; tutto il resto → "/".

const FALLBACK = "/";
const PLACEHOLDER_BASE = "http://next.invalid";
const MAX_LENGTH = 2048;
// Caratteri di controllo, spazi e backslash: il browser li normalizza e può trasformare
// "/\t/host" in un URL protocol-relative.
const UNSAFE_CHARS_RE = /[\u0000- \u007f\\]/;

/**
 * Restituisce pathname + search del target sicuro, oppure "/".
 * @param raw valore del parametro `next` (es. searchParams.get("next"))
 * @param origin origin della richiesta corrente (necessario per gli URL assoluti)
 */
export function safeNextPath(raw: string | null | undefined, origin?: string): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_LENGTH) return FALLBACK;
  if (UNSAFE_CHARS_RE.test(raw)) return FALLBACK;

  let target: URL;
  try {
    if (raw.startsWith("/")) {
      if (raw.startsWith("//")) return FALLBACK;
      target = new URL(raw, PLACEHOLDER_BASE);
    } else {
      if (!origin) return FALLBACK;
      target = new URL(raw);
      if (target.origin !== new URL(origin).origin) return FALLBACK;
    }
  } catch {
    return FALLBACK;
  }

  const { pathname, search } = target;
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return FALLBACK;
  return `${pathname}${search}`;
}
