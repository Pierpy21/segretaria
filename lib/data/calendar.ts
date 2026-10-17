import "server-only";
import { and, asc, eq, gt, lt, notInArray, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { calendarEvents, type CalendarEvent, type NewCalendarEvent } from "@/drizzle/schema";
import type { CalendarEventData, EventSource } from "@/app/types/calendar";
import type { CreateCalendarEventInput } from "@/app/types/api";
import type { SyncedEvent, SyncProvider } from "@/app/types/calendar-sync";
import { ALL_DAY_LABEL } from "@/app/lib/calendar-dates";
import { getCalendarTimeZone, parseToUtcMs } from "@/lib/calendar-sync/time";
import { ValidationError } from "@/lib/errors";
import { assertUuid, chunk, dateInZone, first, instantOf, timeInZone } from "./format";

const DAY_MS = 86_400_000;
const DEFAULT_DURATION_MS = 3_600_000;
const UPSERT_CHUNK = 1000;

export const SOURCE_TO_DB: Record<EventSource, CalendarEvent["source"]> = {
  "Google Calendar": "google_calendar",
  "Apple Calendar": "apple_calendar",
  Manual: "manual",
  "AI Secretary": "ai_secretary",
};

const SOURCE_FROM_DB: Record<CalendarEvent["source"], EventSource> = {
  google_calendar: "Google Calendar",
  apple_calendar: "Apple Calendar",
  manual: "Manual",
  ai_secretary: "AI Secretary",
};

/** Colore di default quando la riga non ne ha uno proprio */
const DEFAULT_COLOR: Record<CalendarEvent["source"], string> = {
  google_calendar: "#4285f4",
  apple_calendar: "#64748b",
  manual: "#0d9488",
  ai_secretary: "#8b5cf6",
};

/** Riferimento a un evento sul calendario esterno */
export interface ExternalRef {
  provider: SyncProvider;
  externalId: string;
}

function toEventData(row: CalendarEvent, tz: string): CalendarEventData {
  return {
    id: row.id,
    title: row.title,
    date: dateInZone(row.startAt, tz),
    time: row.allDay ? ALL_DAY_LABEL : timeInZone(row.startAt, tz),
    endTime: row.allDay ? undefined : timeInZone(row.endAt, tz),
    color: row.color ?? DEFAULT_COLOR[row.source],
    source: SOURCE_FROM_DB[row.source],
    description: row.description,
    isAiGenerated: row.isAiGenerated,
    externalId: row.externalId ?? undefined,
    assetId: row.assetId,
  };
}

/** Intervallo [from, to) in istanti UTC → eventi che si sovrappongono all'intervallo, ordinati per inizio. */
export async function listEvents(tx: Tx, companyId: string, from: Date, to: Date): Promise<CalendarEventData[]> {
  const tz = getCalendarTimeZone();
  const rows = await tx
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.companyId, companyId),
        lt(calendarEvents.startAt, to),
        gt(calendarEvents.endAt, from),
      ),
    )
    .orderBy(asc(calendarEvents.startAt));
  return rows.map((row) => toEventData(row, tz));
}

/** Converte data + orari locali (fuso CALENDAR_TIMEZONE) in istanti; la fine deve seguire l'inizio. */
export function resolveAgendaRange(
  date: string,
  startTime: string,
  endTime: string,
  tz: string,
): { startAt: Date; endAt: Date } {
  const startAt = instantOf(date, startTime, tz);
  const endAt = instantOf(date, endTime, tz);
  if (endAt.getTime() <= startAt.getTime()) {
    throw new ValidationError("L'orario di fine deve essere successivo all'inizio");
  }
  return { startAt, endAt };
}

/**
 * Salva un evento. Con `external` la riga è collegata al calendario remoto
 * (il provider va creato prima dal chiamante, vedi lib/calendar-sync).
 */
export async function createEvent(
  tx: Tx,
  companyId: string,
  input: CreateCalendarEventInput,
  external?: ExternalRef,
): Promise<CalendarEventData> {
  const tz = getCalendarTimeZone();
  const { startAt, endAt } = resolveAgendaRange(input.date, input.startTime, input.endTime, tz);

  if (!external && (input.source === "Google Calendar" || input.source === "Apple Calendar")) {
    throw new ValidationError("Gli eventi Google/Apple vanno creati tramite il collegamento del calendario");
  }

  const source: CalendarEvent["source"] = external
    ? external.provider === "google" ? "google_calendar" : "apple_calendar"
    : SOURCE_TO_DB[input.source];

  const inserted = await tx
    .insert(calendarEvents)
    .values({
      companyId,
      title: input.title,
      description: input.description ?? "",
      startAt,
      endAt,
      allDay: false,
      source,
      isAiGenerated: input.source === "AI Secretary",
      externalProvider: external?.provider ?? null,
      externalId: external?.externalId ?? null,
      // Il bene è già verificato da lib/calendar-sync (assertAssetInCompany) prima del provider remoto.
      assetId: input.assetId ?? null,
    })
    .returning();
  return toEventData(first(inserted, "insert calendar_events"), tz);
}

/** Riferimento esterno di un evento (null se locale). Null se non esiste nello studio. */
export async function getEventRef(
  tx: Tx,
  companyId: string,
  id: string,
): Promise<{ external: ExternalRef | null } | null> {
  assertUuid(id, "id evento");
  const rows = await tx
    .select({
      externalProvider: calendarEvents.externalProvider,
      externalId: calendarEvents.externalId,
    })
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.companyId, companyId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    external:
      row.externalProvider && row.externalId
        ? { provider: row.externalProvider, externalId: row.externalId }
        : null,
  };
}

/** Elimina un evento locale/salvato. Ritorna false se non esiste nello studio. */
export async function deleteEvent(tx: Tx, companyId: string, id: string): Promise<boolean> {
  assertUuid(id, "id evento");
  const deleted = await tx
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.companyId, companyId)))
    .returning({ id: calendarEvents.id });
  return deleted.length > 0;
}

/**
 * Converte un evento esterno in riga DB. Date all-day ("YYYY-MM-DD") interpretate
 * a mezzanotte del fuso CALENDAR_TIMEZONE. Null se la data di inizio non è valida.
 */
function toExternalRow(
  e: SyncedEvent,
  companyId: string,
  provider: SyncProvider,
  tz: string,
): NewCalendarEvent | null {
  const startMs = parseToUtcMs(e.start, tz);
  if (startMs === null) return null;
  const endParsed = parseToUtcMs(e.end, tz);

  let endMs = endParsed ?? startMs + DEFAULT_DURATION_MS;
  if (e.allDay) {
    if (endMs <= startMs) endMs = startMs + DAY_MS;
  } else if (endMs < startMs) {
    endMs = startMs;
  }

  return {
    companyId,
    title: e.title || "(senza titolo)",
    description: e.description,
    startAt: new Date(startMs),
    endAt: new Date(endMs),
    allDay: e.allDay,
    source: provider === "google" ? "google_calendar" : "apple_calendar",
    isAiGenerated: false,
    externalProvider: provider,
    externalId: e.externalId,
  };
}

/**
 * Upsert degli eventi di un provider su (company_id, external_provider, external_id)
 * ed eliminazione di quelli del provider nell'intervallo non più presenti.
 * Chiamare solo con una lista completa e valida (mai in caso di errore del provider).
 */
export async function upsertExternalEvents(
  tx: Tx,
  companyId: string,
  provider: SyncProvider,
  events: SyncedEvent[],
  from: Date,
  to: Date,
): Promise<{ imported: number; removed: number }> {
  const tz = getCalendarTimeZone();

  // Deduplica per externalId: ON CONFLICT non può toccare la stessa riga due volte.
  const byExternalId = new Map<string, NewCalendarEvent>();
  for (const e of events) {
    if (e.provider !== provider) continue;
    const row = toExternalRow(e, companyId, provider, tz);
    if (row) byExternalId.set(e.externalId, row);
  }

  const values = [...byExternalId.values()];
  const keepIds = [...byExternalId.keys()];
  const inRange = and(
    eq(calendarEvents.companyId, companyId),
    eq(calendarEvents.externalProvider, provider),
    lt(calendarEvents.startAt, to),
    gt(calendarEvents.endAt, from),
  );

  // Un INSERT ... ON CONFLICT per blocco (1000 righe ≈ 14k parametri, sotto il limite di 65535).
  for (const block of chunk(values, UPSERT_CHUNK)) {
    await tx
      .insert(calendarEvents)
      .values(block)
      .onConflictDoUpdate({
        target: [calendarEvents.companyId, calendarEvents.externalProvider, calendarEvents.externalId],
        targetWhere: sql`${calendarEvents.externalId} is not null`,
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          startAt: sql`excluded.start_at`,
          endAt: sql`excluded.end_at`,
          allDay: sql`excluded.all_day`,
          source: sql`excluded.source`,
          updatedAt: sql`now()`,
        },
      });
  }

  const removed = await tx
    .delete(calendarEvents)
    .where(keepIds.length > 0 ? and(inRange, notInArray(calendarEvents.externalId, keepIds)) : inRange)
    .returning({ id: calendarEvents.id });

  return { imported: values.length, removed: removed.length };
}
