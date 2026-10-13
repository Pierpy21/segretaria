import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/drizzle/schema";
import * as relations from "@/drizzle/relations";

const fullSchema = { ...schema, ...relations };

export type AdminDb = PostgresJsDatabase<typeof fullSchema>;
export type Tx = Parameters<Parameters<AdminDb["transaction"]>[0]>[0];

let instance: AdminDb | undefined;

/**
 * Connessione SUPERUSER (bypassa RLS). Usare solo tramite withRLS/withUser,
 * mai direttamente dal codice applicativo.
 *
 * Inizializzazione lazy: l'errore si genera solo al primo utilizzo se manca
 * DATABASE_URL, così il build e le route che non toccano il DB non falliscono.
 * DATABASE_URL: pooler Supabase in transaction mode (porta 6543).
 */
export function getAdminDb(): AdminDb {
  if (instance) return instance;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL non impostata: vedi .env.example");
  }

  // prepare: false obbligatorio con il pooler in transaction mode (6543).
  // max: 1 limita le connessioni per istanza serverless.
  const client = postgres(url, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  instance = drizzle(client, { schema: fullSchema });
  return instance;
}
