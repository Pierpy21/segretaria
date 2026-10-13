import "server-only";
import { and, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { calendarEvents, conversations, patients, quotes, tasks } from "@/drizzle/schema";
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

/** Contatori per la sidebar. Una sola transazione RLS, sole aggregazioni (nessuna riga caricata). */
export async function getSidebarBadges(companyId: string): Promise<SidebarBadges> {
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const sevenDaysAgo = new Date(nowMs - SEVEN_DAYS_MS);
  const { start, end } = todayBoundsUtc(nowMs, getCalendarTimeZone());
  const todayStart = new Date(start);
  const todayEnd = new Date(end);

  return withUser(async (tx) => {
    // Sequenziali: una sola connessione di transazione, niente query concorrenti.
    const patientRows = await tx
      .select({ value: sql<number>`count(*)` })
      .from(patients)
      .where(and(eq(patients.companyId, companyId), gte(patients.createdAt, sevenDaysAgo)));

    const chatRows = await tx
      .select({ value: sql<number>`coalesce(sum(${conversations.unreadCount}), 0)` })
      .from(conversations)
      .where(eq(conversations.companyId, companyId));

    const calendarRows = await tx
      .select({ value: sql<number>`count(*)` })
      .from(calendarEvents)
      .where(
        and(
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
        )
      );

    const taskRows = await tx
      .select({ value: sql<number>`count(*)` })
      .from(tasks)
      .where(
        and(
          eq(tasks.companyId, companyId),
          eq(tasks.priority, "high"),
          inArray(tasks.columnId, ["todo", "in_progress"])
        )
      );

    const quoteRows = await tx
      .select({ value: sql<number>`count(*)` })
      .from(quotes)
      .where(and(eq(quotes.companyId, companyId), eq(quotes.status, "pending_ai")));

    return {
      patients: toCount(patientRows[0]?.value),
      chat: toCount(chatRows[0]?.value),
      calendar: toCount(calendarRows[0]?.value),
      tasks: toCount(taskRows[0]?.value),
      quotes: toCount(quoteRows[0]?.value),
    };
  });
}
