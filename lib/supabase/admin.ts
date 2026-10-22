import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase con chiave service_role (bypassa RLS e gestisce l'Auth admin).
 * SOLO SERVER: SUPABASE_SERVICE_ROLE_KEY non deve mai avere il prefisso NEXT_PUBLIC_.
 * Ritorna null se la chiave non è configurata: il chiamante degrada senza errore.
 * Nessuna sessione persistita: il client non conserva token tra le richieste.
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
