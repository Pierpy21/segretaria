import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

// Percorsi accessibili senza sessione (match per prefisso).
const PUBLIC_PATHS = ["/login", "/auth/"];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/api/calendar/google/callback") return true;
  return PUBLIC_PATHS.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p));
}

/**
 * Refresh della sessione Supabase (pattern updateSession di @supabase/ssr)
 * e guardia di accesso alle pagine. Le route /api/* non vengono reindirizzate:
 * rispondono da sole con 401 UNAUTHORIZED (contratto app/types/api.ts).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const isPublic = isPublicPath(pathname);

  let env: ReturnType<typeof getSupabaseEnv> | null = null;
  try {
    env = getSupabaseEnv();
  } catch (err) {
    console.error("[proxy] Supabase non configurato:", err instanceof Error ? err.message : err);
  }
  // Senza configurazione: le API rispondono da sole (JSON via handleApiError),
  // le pagine protette vanno al login. Mai 500 non gestito.
  if (!env) {
    return isApi || isPublic ? NextResponse.next({ request }) : NextResponse.redirect(new URL("/login", request.url));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getClaims() valida la firma del JWT e aggiorna la sessione se necessario.
  let isAuthenticated = false;
  try {
    const { data } = await supabase.auth.getClaims();
    isAuthenticated = !!data?.claims;
  } catch (err) {
    console.error("[proxy] verifica sessione fallita:", err instanceof Error ? err.message : err);
  }

  if (isAuthenticated || isPublic || isApi) {
    return response;
  }

  const redirect = NextResponse.redirect(new URL("/login", request.url));
  // Preserva eventuali cookie di sessione ripuliti/aggiornati da Supabase.
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
