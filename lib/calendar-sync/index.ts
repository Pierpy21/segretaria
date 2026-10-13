// Server-only. Orchestrazione dei provider di sincronizzazione calendario.
import type {
  CreateEventInput,
  ProviderStatus,
  SyncProvider,
  SyncStatusResponse,
  SyncedEvent,
} from "@/app/types/calendar-sync";
import * as apple from "./apple";
import { CalendarSyncError } from "./errors";
import * as google from "./google";
import { readStore, updateStore } from "./store";

export { CalendarSyncError } from "./errors";

export async function getStatus(): Promise<SyncStatusResponse> {
  const store = await readStore();
  const g = store.google;
  const a = store.apple;

  const googleStatus: ProviderStatus = {
    configured: google.isGoogleConfigured(),
    connected: !!g,
    account: g?.account,
    lastSync: g?.lastSync,
  };
  const appleStatus: ProviderStatus = {
    configured: apple.isAppleConfigured(),
    connected: !!a?.calendarUrl,
    account: a?.calendarUrl ? apple.getAppleId() : undefined,
    calendarName: a?.calendarUrl ? a.calendarName : undefined,
    lastSync: a?.lastSync,
  };
  return { google: googleStatus, apple: appleStatus };
}

/** Stato dopo il collegamento Apple (discover già salvato nello store). */
export async function connectApple(): Promise<ProviderStatus> {
  await apple.discover();
  return (await getStatus()).apple;
}

export async function disconnectProvider(provider: SyncProvider): Promise<void> {
  if (provider === "google") await google.disconnect();
  else await apple.disconnect();
}

function errorToMessage(err: unknown): string {
  if (err instanceof CalendarSyncError) return err.message;
  console.error("[calendar-sync] provider error", err);
  return "Errore imprevisto durante la sincronizzazione";
}

/** Unisce gli eventi di tutti i provider collegati; un errore di un provider non blocca gli altri. */
export async function listAllEvents(
  fromMs: number,
  toMs: number,
): Promise<{ events: SyncedEvent[]; errors: Partial<Record<SyncProvider, string>> }> {
  const store = await readStore();
  const from = new Date(fromMs).toISOString();
  const to = new Date(toMs).toISOString();

  const tasks: Array<{ provider: SyncProvider; run: Promise<SyncedEvent[]> }> = [];
  if (store.google) tasks.push({ provider: "google", run: google.listEvents(from, to) });
  if (store.apple?.calendarUrl) tasks.push({ provider: "apple", run: apple.listEvents(from, to) });

  const settled = await Promise.allSettled(tasks.map((t) => t.run));

  const events: SyncedEvent[] = [];
  const errors: Partial<Record<SyncProvider, string>> = {};
  const synced: SyncProvider[] = [];

  settled.forEach((result, i) => {
    const { provider } = tasks[i];
    if (result.status === "fulfilled") {
      events.push(...result.value);
      synced.push(provider);
    } else {
      errors[provider] = errorToMessage(result.reason);
    }
  });

  if (synced.length > 0) {
    const now = new Date().toISOString();
    await updateStore((s) => ({
      ...s,
      google: s.google && synced.includes("google") ? { ...s.google, lastSync: now } : s.google,
      apple: s.apple && synced.includes("apple") ? { ...s.apple, lastSync: now } : s.apple,
    }));
  }

  events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return { events, errors };
}

async function assertConnected(provider: SyncProvider): Promise<void> {
  const store = await readStore();
  const connected = provider === "google" ? !!store.google : !!store.apple?.calendarUrl;
  if (!connected) {
    throw new CalendarSyncError(
      provider === "google" ? "Google Calendar non collegato" : "Apple Calendar non collegato",
      409,
    );
  }
}

export async function createEvent(input: CreateEventInput): Promise<SyncedEvent> {
  await assertConnected(input.provider);
  return input.provider === "google" ? google.createEvent(input) : apple.createEvent(input);
}

export async function deleteEvent(provider: SyncProvider, externalId: string): Promise<void> {
  await assertConnected(provider);
  if (provider === "google") await google.deleteEvent(externalId);
  else await apple.deleteEvent(externalId);
}
