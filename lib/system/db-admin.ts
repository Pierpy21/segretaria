import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/drizzle/schema";
import * as relations from "@/drizzle/relations";

const fullSchema = { ...schema, ...relations };

export type AdminDb = PostgresJsDatabase<typeof fullSchema>;
export type Tx = Parameters<Parameters<AdminDb["transaction"]>[0]>[0];

const DEFAULT_POOL_MAX = 10;
const MAX_POOL_MAX = 50;
/** Secondi: le connessioni inattive restano aperte per evitare l'apertura (~690 ms) a ogni richiesta. */
const IDLE_TIMEOUT_S = 300;
const CONNECT_TIMEOUT_S = 10;

const globalForDb = globalThis as unknown as { __segretariaDb?: AdminDb };
let instance: AdminDb | undefined;

/** DB_POOL_MAX: intero 1..50, default 10. Valori non validi → default. */
function parsePoolMax(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_POOL_MAX;
  return Math.min(n, MAX_POOL_MAX);
}

/**
 * Connessione SUPERUSER (bypassa RLS). Usare solo tramite withRLS/withUser/withCompany,
 * mai direttamente dal codice applicativo.
 *
 * Inizializzazione lazy: l'errore si genera solo al primo utilizzo se manca
 * DATABASE_URL, così il build e le route che non toccano il DB non falliscono.
 * DATABASE_URL: pooler Supabase in transaction mode (porta 6543).
 * In dev il client è salvato su globalThis per non aprire pool multipli ad ogni hot-reload.
 */
export function getAdminDb(): AdminDb {
  if (instance) return instance;

  const isProd = process.env.NODE_ENV === "production";
  if (!isProd && globalForDb.__segretariaDb) {
    instance = globalForDb.__segretariaDb;
    return instance;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL non impostata: vedi .env.example");
  }

  // prepare: false obbligatorio con il pooler in transaction mode (6543).
  // max: limite di connessioni per istanza (le richieste in parallelo non si accodano più su una sola).
  const client = postgres(url, {
    prepare: false,
    max: parsePoolMax(process.env.DB_POOL_MAX),
    idle_timeout: IDLE_TIMEOUT_S,
    connect_timeout: CONNECT_TIMEOUT_S,
  });

  instance = drizzle(client, { schema: fullSchema });
  if (!isProd) globalForDb.__segretariaDb = instance;
  return instance;
}
