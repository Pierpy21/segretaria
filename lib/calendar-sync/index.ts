// Server-only. Orchestrazione dei provider di sincronizzazione calendario (per azienda).
import "server-only";
import type { AppleConnectInput, CreateCalendarEventInput, SyncResult } from "@/app/types/api";
import type { CalendarEventData, EventSource } from "@/app/types/calendar";
import type { CreateEventInput, ProviderStatus, SyncProvider, SyncStatusResponse } from "@/app/types/calendar-sync";
import * as apple from "./apple";
import { CalendarSyncError } from "./errors";
import { findConnectionInfo, listConnectionInfo, markSynced } from "./connections";
import * as google from "./google";
import { getCalendarTimeZone } from "./time";
import {
  createEvent as createAgendaRow,
  deleteEvent as deleteAgendaRow,
  getEventRef,
  resolveAgendaRange,
  upsertExternalEvents,
} from "@/lib/data/calendar";
import { NotFoundError } from "@/lib/errors";

export { CalendarSyncError } from "./errors";

const PROVIDER_LABEL: Record<SyncProvider, string> = {
  google: "Google Calendar",
  apple: "Apple Calendar",
};

export async function getSyncStatus(companyId: string): Promise<SyncStatusResponse> {
  const connections = await listConnectionInfo(companyId);
  const g = connections.find((c) => c.provider === "google");
  const a = connections.find((c) => c.provider === "apple");

  return {
    google: {
      configured: google.isGoogleConfigured(),
      connected: !!g,
      account: g?.account ?? undefined,
      lastSync: g?.lastSyncAt?.toISOString(),
    },
    apple: {
      configured: true,
      connected: !!a,
      account: a?.account ?? undefined,
      calendarName: a?.calendarName ?? undefined,
      lastSync: a?.lastSyncAt?.toISOString(),
    },
  };
}

/** URL di autorizzazione Google; `state` è generato e verificato dalla route. */
export function googleAuthUrl(state: string): string {
  return google.buildAuthUrl(state);
}

export async function connectGoogle(companyId: string, code: string): Promise<ProviderStatus> {
  await google.connectWithCode(companyId, code);
  return (await getSyncStatus(companyId)).google;
}

export async function connectApple(companyId: string, input: AppleConnectInput): Promise<ProviderStatus> {
  await apple.connect(companyId, input);
  return (await getSyncStatus(companyId)).apple;
}

export async function disconnectProvider(companyId: string, provider: SyncProvider): Promise<void> {
  if (provider === "google") await google.disconnect(companyId);
  else await apple.disconnect(companyId);
}

function providerOfSource(source: EventSource): SyncProvider | null {
  if (source === "Google Calendar") return "google";
  if (source === "Apple Calendar") return "apple";
  return null;
}

async function requireConnected(companyId: string, provider: SyncProvider): Promise<void> {
  const info = await findConnectionInfo(companyId, provider);
  if (!info) throw new CalendarSyncError(`${PROVIDER_LABEL[provider]} non collegato`, 409);
}

/**
 * Crea un evento nell'agenda. Per le sorgenti Google/Apple crea prima l'evento
 * sul calendario remoto, poi salva la riga collegata (external_provider/external_id).
 */
export async function createAgendaEvent(
  companyId: string,
  input: CreateCalendarEventInput,
): Promise<CalendarEventData> {
  const provider = providerOfSource(input.source);
  if (!provider) return createAgendaRow(companyId, input);

  // Validazione prima di toccare il provider remoto
  resolveAgendaRange(input.date, input.startTime, input.endTime, getCalendarTimeZone());
  await requireConnected(companyId, provider);

  const remoteInput: CreateEventInput = {
    provider,
    title: input.title,
    description: input.description,
    start: `${input.date}T${input.startTime}:00`,
    end: `${input.date}T${input.endTime}:00`,
  };
  const remote =
    provider === "google"
      ? await google.createEvent(companyId, remoteInput)
      : await apple.createEvent(companyId, remoteInput);

  return createAgendaRow(companyId, input, { provider, externalId: remote.externalId });
}

/** Elimina l'evento; se è collegato a un provider attivo, elimina anche sul calendario remoto. */
export async function deleteAgendaEvent(companyId: string, id: string): Promise<void> {
  const ref = await getEventRef(companyId, id);
  if (!ref) throw new NotFoundError("Evento non trovato");

  const external = ref.external;
  if (external && (await findConnectionInfo(companyId, external.provider))) {
    if (external.provider === "google") await google.deleteEvent(companyId, external.externalId);
    else await apple.deleteEvent(companyId, external.externalId);
  }

  const deleted = await deleteAgendaRow(companyId, id);
  if (!deleted) throw new NotFoundError("Evento non trovato");
}

function errorToMessage(err: unknown): string {
  if (err instanceof CalendarSyncError) return err.message;
  console.error("[calendar-sync] errore provider", err);
  return "Errore imprevisto durante la sincronizzazione";
}

/**
 * Importa gli eventi dei provider collegati nell'intervallo [from, to) e
 * aggiorna lastSync. Un errore di un provider non blocca gli altri e non
 * elimina i suoi eventi (la rimozione avviene solo con una lista valida).
 */
export async function syncCompanyCalendars(companyId: string, from: Date, to: Date): Promise<SyncResult> {
  const connections = await listConnectionInfo(companyId);
  const result: SyncResult = { imported: 0, removed: 0, errors: {} };
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  for (const { provider } of connections) {
    try {
      const events =
        provider === "google"
          ? await google.listEvents(companyId, fromIso, toIso)
          : await apple.listEvents(companyId, fromIso, toIso);
      const counts = await upsertExternalEvents(companyId, provider, events, from, to);
      result.imported += counts.imported;
      result.removed += counts.removed;
      await markSynced(companyId, provider, new Date());
    } catch (err) {
      result.errors[provider] = errorToMessage(err);
    }
  }
  return result;
}
