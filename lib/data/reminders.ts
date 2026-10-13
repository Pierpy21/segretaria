import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { reminders, type Reminder } from "@/drizzle/schema";
import type { ReminderData, ReminderStatus } from "@/app/types/calendar";
import type { CreateReminderInput } from "@/app/types/api";
import { getCalendarTimeZone } from "@/lib/calendar-sync/time";
import { NotFoundError } from "@/lib/errors";
import { assertUuid, dateInZone, first, instantOf, timeInZone } from "./format";

function toReminderData(row: Reminder, tz: string): ReminderData {
  return {
    id: row.id,
    text: row.text,
    time: timeInZone(row.remindAt, tz),
    priority: row.priority,
    status: row.status,
  };
}

export async function listReminders(companyId: string): Promise<ReminderData[]> {
  const tz = getCalendarTimeZone();
  const rows = await withUser((tx) =>
    tx
      .select()
      .from(reminders)
      .where(eq(reminders.companyId, companyId))
      .orderBy(asc(reminders.remindAt))
  );
  return rows.map((row) => toReminderData(row, tz));
}

/** Il promemoria UI ha solo "HH:mm": viene salvato sulla data odierna nel fuso CALENDAR_TIMEZONE. */
export async function createReminder(companyId: string, input: CreateReminderInput): Promise<ReminderData> {
  const tz = getCalendarTimeZone();
  const today = dateInZone(new Date(), tz);
  const remindAt = instantOf(today, input.time, tz);

  const row = await withUser(async (tx) => {
    const inserted = await tx
      .insert(reminders)
      .values({ companyId, text: input.text, remindAt, priority: input.priority })
      .returning();
    return first(inserted, "insert reminders");
  });
  return toReminderData(row, tz);
}

export async function updateReminderStatus(
  companyId: string,
  id: string,
  status: ReminderStatus,
): Promise<ReminderData> {
  assertUuid(id, "id promemoria");
  const tz = getCalendarTimeZone();
  const rows = await withUser((tx) =>
    tx
      .update(reminders)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(reminders.id, id), eq(reminders.companyId, companyId)))
      .returning()
  );
  const row = rows[0];
  if (!row) throw new NotFoundError("Promemoria non trovato");
  return toReminderData(row, tz);
}
