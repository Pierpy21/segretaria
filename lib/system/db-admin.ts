import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/drizzle/schema";
import * as relations from "@/drizzle/relations";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

// Configuration for postgres-js
// PORT NOTE: For deployed Supabase environments using the connection pooler (port 6543, Transaction mode),
// `prepare: false` is absolutely required to avoid "prepared statement already exists" errors.
// For serverless runtimes, `max: 1` prevents exhausting the connection pool.
const client = postgres(connectionString, {
  prepare: false, // Mandatory for transaction-mode pooling (port 6543)
  max: 1,         // Serverless safety limit
  idle_timeout: 20,
  connect_timeout: 10,
});

// Create Drizzle ORM instance with schema + relations (SUPERUSER ACCESS)
// This bypasses Row Level Security. Only use for system operations (webhooks, cron jobs, etc).
export const adminDb = drizzle(client, {
  schema: { ...schema, ...relations },
});

export type Tx = Parameters<Parameters<typeof adminDb.transaction>[0]>[0];
