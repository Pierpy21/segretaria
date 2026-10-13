import "server-only";
import { sql } from "drizzle-orm";
import { getAdminDb, type Tx } from "./db-admin";

export type { Tx };

export type VerifiedClaims = {
  sub: string;
  role: "authenticated";
  email?: string;
};

/**
 * Esegue il callback in una transazione con RLS attivo.
 * I claims devono provenire da una sessione verificata server-side.
 * Non chiamare direttamente dal codice applicativo: usare withUser() / withCompany().
 *
 * Il setup è UN solo round-trip: set_config(name, value, true) equivale a SET LOCAL
 * (scope transazione). set_config('role', ...) è lo stesso meccanismo di SET LOCAL ROLE
 * usato da PostgREST. Il valore dei claims è un parametro ($1), quindi nessun escape manuale.
 */
export async function withRLS<T>(
  claims: VerifiedClaims,
  cb: (tx: Tx) => Promise<T>
): Promise<T> {
  return getAdminDb().transaction(async (tx) => {
    await tx.execute(sql`select
      set_config('role', 'authenticated', true),
      set_config('request.jwt.claims', ${JSON.stringify(claims)}, true),
      set_config('statement_timeout', '10000', true)`);
    return cb(tx);
  });
}
