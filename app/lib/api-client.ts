import { API_ERROR, type ApiResult } from "@/app/types/api";

/** /login con next = pagina corrente, così dopo l'accesso si torna dove si era (salvo già su /login) */
function loginUrlFromHere(): string {
  const { pathname, search } = window.location;
  if (pathname === "/login") return "/login";
  return `/login?next=${encodeURIComponent(`${pathname}${search}`)}`;
}

/**
 * Chiama un endpoint /api/* e restituisce direttamente data.
 * - 401 UNAUTHORIZED → redirect /login
 * - 409 NO_COMPANY   → redirect /onboarding
 * - altri errori     → throw Error(messaggio)
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, cache: "no-store" });
  } catch {
    throw new Error("Errore di rete. Riprova.");
  }

  let payload: ApiResult<T> | null;
  try {
    payload = (await res.json()) as ApiResult<T>;
  } catch {
    payload = null;
  }

  if (payload && payload.success) return payload.data;

  const code = payload && !payload.success ? payload.error : `HTTP_${res.status}`;

  if (res.status === 401 || code === API_ERROR.UNAUTHORIZED) {
    window.location.href = loginUrlFromHere();
  } else if (code === API_ERROR.NO_COMPANY) {
    window.location.href = "/onboarding";
  }

  throw new Error(code);
}
