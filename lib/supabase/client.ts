import { createBrowserClient } from "@supabase/ssr";

/** Client Supabase per il browser (login, registrazione, logout). Non usare lato server. */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY mancanti.");
  }
  return createBrowserClient(url, anonKey);
}
