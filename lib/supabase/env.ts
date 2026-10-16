// Variabili pubbliche Supabase (sicure lato client). Validazione runtime esplicita:
// i riferimenti devono restare letterali affinché Next le inlinei nel bundle client.
export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL non impostata: vedi .env.example");
  if (!anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY non impostata: vedi .env.example");

  return { url, anonKey };
}
