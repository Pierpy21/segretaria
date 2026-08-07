import "server-only";
import { sql } from "drizzle-orm";
import { adminDb, type Tx } from "./db-admin";

export type { Tx };

export type VerifiedClaims = {
  sub: string;
  role: "authenticated";
  email?: string;
};

/**
 * Esegue il callback in una transazione con RLS attivo.
 * I claims devono provenire da una sessione verificata server-side.
 * Non chiamare direttamente dal codice applicativo: usare withUser().
 */
export async function withRLS<T>(
  claims: VerifiedClaims,
  cb: (tx: Tx) => Promise<T>
): Promise<T> {
  return adminDb.transaction(async (tx) => {
    await tx.execute(sql`set local role authenticated`);
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`
    );
    await tx.execute(sql`set local statement_timeout = '10s'`);
    return cb(tx);
  });
}
