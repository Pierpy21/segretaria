// Server-only. Persistenza delle connessioni calendario (tabella calendar_connections, RLS owner/admin).
// Sostituisce lo store JSON su file. Le credenziali sono cifrate in crypto.ts.
import "server-only";
import { and, eq } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { calendarConnections, type CalendarConnection } from "@/drizzle/schema";
import type { SyncProvider } from "@/app/types/calendar-sync";
import { decryptSecret, encryptSecret } from "./crypto";

/** Metadati non segreti di una connessione */
export interface ConnectionInfo {
  provider: SyncProvider;
  account: string | null;
  /** Google: calendar id. Apple: URL CalDAV del calendario */
  calendarId: string | null;
  calendarName: string | null;
  lastSyncAt: Date | null;
}

export interface StoredConnection<C> extends ConnectionInfo {
  /** Credenziali decifrate: il chiamante conosce il tipo del provider */
  credentials: C;
}

export interface ConnectionInput {
  account: string | null;
  calendarId: string | null;
  calendarName: string | null;
  credentials: unknown;
}

function toInfo(row: CalendarConnection): ConnectionInfo {
  return {
    provider: row.provider,
    account: row.account,
    calendarId: row.calendarId,
    calendarName: row.calendarName,
    lastSyncAt: row.lastSyncAt,
  };
}

export async function listConnectionInfo(companyId: string): Promise<ConnectionInfo[]> {
  const rows = await withUser((tx) =>
    tx.select().from(calendarConnections).where(eq(calendarConnections.companyId, companyId))
  );
  return rows.map(toInfo);
}

export async function findConnectionInfo(
  companyId: string,
  provider: SyncProvider
): Promise<ConnectionInfo | null> {
  const rows = await withUser((tx) =>
    tx
      .select()
      .from(calendarConnections)
      .where(and(eq(calendarConnections.companyId, companyId), eq(calendarConnections.provider, provider)))
      .limit(1)
  );
  return rows[0] ? toInfo(rows[0]) : null;
}

export async function loadConnection<C>(
  companyId: string,
  provider: SyncProvider
): Promise<StoredConnection<C> | null> {
  const rows = await withUser((tx) =>
    tx
      .select()
      .from(calendarConnections)
      .where(and(eq(calendarConnections.companyId, companyId), eq(calendarConnections.provider, provider)))
      .limit(1)
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...toInfo(row),
    credentials: JSON.parse(decryptSecret(row.credentialsEncrypted)) as C,
  };
}

/** Crea o sostituisce la connessione del provider (reset di lastSyncAt). */
export async function saveConnection(
  companyId: string,
  provider: SyncProvider,
  input: ConnectionInput
): Promise<void> {
  const encrypted = encryptSecret(JSON.stringify(input.credentials));
  await withUser(async (tx) => {
    await tx
      .insert(calendarConnections)
      .values({
        companyId,
        provider,
        account: input.account,
        calendarId: input.calendarId,
        calendarName: input.calendarName,
        credentialsEncrypted: encrypted,
      })
      .onConflictDoUpdate({
        target: [calendarConnections.companyId, calendarConnections.provider],
        set: {
          account: input.account,
          calendarId: input.calendarId,
          calendarName: input.calendarName,
          credentialsEncrypted: encrypted,
          lastSyncAt: null,
          updatedAt: new Date(),
        },
      });
  });
}

/** Aggiorna solo le credenziali (es. rotazione access token Google). */
export async function updateCredentials(
  companyId: string,
  provider: SyncProvider,
  credentials: unknown
): Promise<void> {
  const encrypted = encryptSecret(JSON.stringify(credentials));
  await withUser(async (tx) => {
    await tx
      .update(calendarConnections)
      .set({ credentialsEncrypted: encrypted, updatedAt: new Date() })
      .where(and(eq(calendarConnections.companyId, companyId), eq(calendarConnections.provider, provider)));
  });
}

export async function markSynced(companyId: string, provider: SyncProvider, at: Date): Promise<void> {
  await withUser(async (tx) => {
    await tx
      .update(calendarConnections)
      .set({ lastSyncAt: at, updatedAt: new Date() })
      .where(and(eq(calendarConnections.companyId, companyId), eq(calendarConnections.provider, provider)));
  });
}

export async function deleteConnection(companyId: string, provider: SyncProvider): Promise<void> {
  await withUser(async (tx) => {
    await tx
      .delete(calendarConnections)
      .where(and(eq(calendarConnections.companyId, companyId), eq(calendarConnections.provider, provider)));
  });
}
