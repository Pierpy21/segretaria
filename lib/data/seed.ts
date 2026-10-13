import "server-only";
import {
  calendarEvents,
  conversations,
  messages,
  patients,
  quotes,
  reminders,
  tasks,
  type NewCalendarEvent,
  type NewConversation,
  type NewMessage,
  type NewPatientRow,
  type NewQuote,
  type NewReminder,
  type NewTask,
} from "@/drizzle/schema";
import type { Tx } from "@/lib/db";
import { INITIAL_EVENTS, INITIAL_REMINDERS } from "@/app/data/calendar";
import { INITIAL_COLUMNS } from "@/app/data/maintenance";
import { INITIAL_CHAT_MESSAGES, INITIAL_CONVERSATIONS } from "@/app/data/messaging";
import { INITIAL_QUOTES } from "@/app/data/quotes";
import { INITIAL_PATIENTS } from "@/app/data/patients";
import { ValidationError } from "@/lib/errors";
import { SOURCE_TO_DB } from "./calendar";
import { dateInZone, instantOf, parseDateInput, parseEuro } from "./format";

const ONE_HOUR_MS = 3_600_000;

function requireDate(value: string, label: string): string {
  const parsed = parseDateInput(value);
  if (!parsed) throw new ValidationError(`Data demo non valida (${label}): ${value}`);
  return parsed;
}

/**
 * Popola uno studio appena creato con i dati demo (app/data/*).
 * Eseguito nella stessa transazione di create_company: all-or-nothing.
 */
export async function seedDemoData(tx: Tx, companyId: string, tz: string): Promise<void> {
  const now = new Date();
  const today = dateInZone(now, tz);

  const eventRows: NewCalendarEvent[] = INITIAL_EVENTS.map((e) => {
    const startAt = instantOf(e.date, e.time, tz);
    return {
      companyId,
      title: e.title,
      description: e.description,
      startAt,
      endAt: new Date(startAt.getTime() + ONE_HOUR_MS),
      allDay: false,
      color: e.color,
      source: SOURCE_TO_DB[e.source],
      isAiGenerated: e.isAiGenerated,
    };
  });
  await tx.insert(calendarEvents).values(eventRows);

  const reminderRows: NewReminder[] = INITIAL_REMINDERS.map((r) => ({
    companyId,
    text: r.text,
    remindAt: instantOf(today, r.time, tz),
    priority: r.priority,
    status: r.status,
  }));
  await tx.insert(reminders).values(reminderRows);

  const taskRows: NewTask[] = INITIAL_COLUMNS.flatMap((col) =>
    col.tasks.map((t, position): NewTask => ({
      companyId,
      title: t.title,
      description: t.description,
      priority: t.priority,
      isAi: t.ai,
      columnId: col.id === "in-progress" ? "in_progress" : col.id === "done" ? "done" : "todo",
      position,
      customMetadata: t.assignedTo ? { assignedTo: t.assignedTo } : {},
    }))
  );
  await tx.insert(tasks).values(taskRows);

  for (const chat of INITIAL_CHAT_MESSAGES) {
    const [conversation] = await tx
      .insert(conversations)
      .values({
        companyId,
        name: chat.name,
        snippet: chat.snippet,
        lastMessageAt: now,
        unreadCount: chat.unread,
        isAi: chat.ai,
        initials: chat.initials,
        color: chat.color,
      } satisfies NewConversation)
      .returning({ id: conversations.id });
    if (!conversation) throw new Error("Seed: conversazione non creata");

    // Lo storico mock è indicizzato per l'id della chat (stringa)
    const history = INITIAL_CONVERSATIONS[chat.id] ?? [];
    const messageRows: NewMessage[] = history.map((m) => ({
      companyId,
      conversationId: conversation.id,
      senderType: m.from === "ai-draft" ? "ai_draft" : m.from,
      body: m.text,
      sentAt: instantOf(today, m.time, tz),
    }));
    if (messageRows.length > 0) await tx.insert(messages).values(messageRows);
  }

  const quoteRows: NewQuote[] = INITIAL_QUOTES.map((q) => ({
    companyId,
    client: q.client,
    quoteType: q.type,
    quoteDate: requireDate(q.date, "preventivo"),
    status: q.status,
    amount: parseEuro(q.amount).toFixed(2),
    description: q.description,
    isAiGenerated: q.isAiGenerated,
  }));
  await tx.insert(quotes).values(quoteRows);

  const patientRows: NewPatientRow[] = INITIAL_PATIENTS.map((p) => ({
    companyId,
    code: p.id,
    name: p.name,
    gender: p.gender,
    avatar: p.avatar,
    dateOfBirth: requireDate(p.dateOfBirth, "paziente"),
    phone: p.phone,
    email: p.email,
    address: p.address,
    fiscalCode: p.fiscalCode,
    recommendation: p.recommendation,
    insurance: p.insurance,
    previousVisit: p.previousVisit,
    selectedTooth: p.selectedTooth,
    xrayFindings: p.xrayFindings,
    treatments: p.treatments,
  }));
  await tx.insert(patients).values(patientRows);
}
