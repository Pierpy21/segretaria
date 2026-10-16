import "server-only";
import { and, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { calendarEvents, clients, conversations, quotes, tasks } from "@/drizzle/schema";
import type { SidebarBadges } from "@/app/types/api";
import { getCalendarTimeZone, wallInZone, wallToUtcMs } from "@/lib/calendar-sync/time";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Postgres restituisce count/sum come bigint (string) o numeric: normalizza a number. */
function toCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Istanti UTC [inizio, fine) della giornata odierna nel fuso indicato. */
function todayBoundsUtc(nowMs: number, tz: string): { start: number; end: number } {
  const { year, month, day } = wallInZone(nowMs, tz);
  const start = wallToUtcMs({ year, month, day, hour: 0, minute: 0, second: 0 }, tz);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const end = wallToUtcMs(
    {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    tz
  );
  return { start, end };
}

/**
 * Contatori per la sidebar in UNA sola query: sottoselect scalari, nessuna riga caricata.
 * Il round-trip è unico; la tx è quella di withCompany.
 */
export async function getSidebarBadges(tx: Tx, companyId: string): Promise<SidebarBadges> {
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const sevenDaysAgo = new Date(nowMs - SEVEN_DAYS_MS);
  const { start, end } = todayBoundsUtc(nowMs, getCalendarTimeZone());
  const todayStart = new Date(start);
  const todayEnd = new Date(end);

  const calendarCond = and(
    eq(calendarEvents.companyId, companyId),
    or(
      // Eventi a orario: solo quelli non ancora iniziati, entro fine giornata.
      and(
        eq(calendarEvents.allDay, false),
        gte(calendarEvents.startAt, now),
        lt(calendarEvents.startAt, todayEnd)
      ),
      // Eventi di giornata intera: quelli con inizio nella giornata odierna.
      and(
        eq(calendarEvents.allDay, true),
        gte(calendarEvents.startAt, todayStart),
        lt(calendarEvents.startAt, todayEnd)
      )
    )
  );

  const [row] = await tx.execute<{
    patients: unknown;
    chat: unknown;
    calendar: unknown;
    tasks: unknown;
    quotes: unknown;
  }>(sql`select
      (select count(*) from ${clients} where ${and(
        eq(clients.companyId, companyId),
        gte(clients.createdAt, sevenDaysAgo)
      )}) as patients,
      (select coalesce(sum(${conversations.unreadCount}), 0) from ${conversations} where ${eq(
        conversations.companyId,
        companyId
      )}) as chat,
      (select count(*) from ${calendarEvents} where ${calendarCond}) as calendar,
      (select count(*) from ${tasks} where ${and(
        eq(tasks.companyId, companyId),
        eq(tasks.priority, "high"),
        inArray(tasks.columnId, ["todo", "in_progress"])
      )}) as tasks,
      (select count(*) from ${quotes} where ${and(
        eq(quotes.companyId, companyId),
        eq(quotes.status, "pending_ai")
      )}) as quotes`);

  return {
    patients: toCount(row?.patients),
    chat: toCount(row?.chat),
    calendar: toCount(row?.calendar),
    tasks: toCount(row?.tasks),
    quotes: toCount(row?.quotes),
  };
}
