import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";

/**
 * Client Supabase per Server Components, Route Handlers e Server Actions.
 * Creare un client per ogni richiesta: non condividerlo tra richieste.
 * Il refresh della sessione è gestito da proxy.ts; setAll qui può fallire
 * in un Server Component ed è ignorato intenzionalmente.
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Chiamato da un Server Component: il refresh lo fa proxy.ts.
        }
      },
    },
  });
}
