// Drizzle Kit è usato SOLO per tipi/query (schema in drizzle/) e per `db:studio`.
// Lo schema reale del database è gestito esclusivamente da supabase/migrations/*.sql:
// NON usare drizzle-kit generate/push/migrate (nessuno script per questi comandi).
// `pnpm db:check` valida solo questa configurazione.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Definizioni TypeScript allineate alle migration Supabase
  schema: ["./drizzle/schema.ts", "./drizzle/relations.ts"],

  // Non usata: le migration non sono generate da drizzle-kit
  out: "./drizzle/migrations",

  dialect: "postgresql",

  // Usata solo da drizzle-kit studio/check (pooler Supabase, porta 6543)
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },

  verbose: true,
  strict: true,
});
