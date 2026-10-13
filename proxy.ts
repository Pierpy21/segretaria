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
 * e guardia di accesso alle sole pagine. Le route /api/* non fanno alcuna
 * chiamata auth qui: verificano già con getUser() (lib/db.ts) e rispondono
 * 401 UNAUTHORIZED (contratto app/types/api.ts).
 * Per le pagine la decisione usa getUser() (chiamata GoTrue, che rinfresca anche i cookie).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.next({ request });
  }
  const isPublic = isPublicPath(pathname);

  let env: ReturnType<typeof getSupabaseEnv> | null = null;
  try {
    env = getSupabaseEnv();
  } catch (err) {
    console.error("[proxy] Supabase non configurato:", err instanceof Error ? err.message : err);
  }
  // Senza configurazione: le pagine protette vanno al login. Mai 500 non gestito.
  if (!env) {
    return isPublic ? NextResponse.next({ request }) : NextResponse.redirect(new URL("/login", request.url));
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

  // getUser() interroga Supabase Auth (revoca immediata) e rinfresca i cookie di sessione.
  let isAuthenticated = false;
  try {
    const { data, error } = await supabase.auth.getUser();
    isAuthenticated = !error && !!data?.user;
  } catch (err) {
    console.error("[proxy] verifica sessione fallita:", err instanceof Error ? err.message : err);
  }

  if (isAuthenticated || isPublic) {
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
