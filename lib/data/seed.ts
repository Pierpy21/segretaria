import "server-only";
import { randomUUID } from "node:crypto";
import {
  calendarEvents,
  clientClinical,
  clients,
  conversations,
  messages,
  quotes,
  reminders,
  tasks,
  type NewCalendarEvent,
  type NewClientRow,
  type NewConversation,
  type NewMessage,
  type NewQuote,
  type NewReminder,
  type NewTask,
} from "@/drizzle/schema";
import type { Tx } from "@/lib/db";
import type { ClientAttributes, Sector } from "@/app/types/clients";
import { INITIAL_EVENTS, INITIAL_REMINDERS } from "@/app/data/calendar";
import { INITIAL_COLUMNS } from "@/app/data/maintenance";
import { INITIAL_CHAT_MESSAGES, INITIAL_CONVERSATIONS } from "@/app/data/messaging";
import { INITIAL_QUOTES } from "@/app/data/quotes";
import { INITIAL_PATIENTS } from "@/app/data/clients";
import { ValidationError } from "@/lib/errors";
import { SOURCE_TO_DB } from "./calendar";
import { dateInZone, instantOf, parseDateInput, parseEuro } from "./format";

const ONE_HOUR_MS = 3_600_000;

/** Attributi demo per settore: chiavi allineate a seed_client_field_defaults (sensitive → clinical). */
const DEMO_ATTRIBUTES: Record<Sector, { public: ClientAttributes; clinical: ClientAttributes }> = {
  dentale: {
    public: { referral_source: "Passaparola", privacy_consent: true },
    clinical: { allergies: "Nessuna nota", anticoagulants: false },
  },
  estetico: {
    public: { referral_source: "Web", skin_type: "Mista", privacy_consent: true },
    clinical: { allergies: "Nessuna nota" },
  },
  generico: {
    public: { referral_source: "Social", privacy_consent: true, notes: "" },
    clinical: {},
  },
};

function requireDate(value: string, label: string): string {
  const parsed = parseDateInput(value);
  if (!parsed) throw new ValidationError(`Data demo non valida (${label}): ${value}`);
  return parsed;
}

/**
 * Popola uno studio appena creato con i dati demo (app/data/*).
 * Eseguito nella stessa transazione di create_company: all-or-nothing.
 */
export async function seedDemoData(tx: Tx, companyId: string, tz: string, sector: Sector): Promise<void> {
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

  // Conversazioni e messaggi in 2 INSERT totali: gli id sono generati lato app,
  // così i messaggi possono referenziare le conversazioni senza RETURNING.
  const conversationRows: NewConversation[] = [];
  const messageRows: NewMessage[] = [];
  for (const chat of INITIAL_CHAT_MESSAGES) {
    const conversationId = randomUUID();
    conversationRows.push({
      id: conversationId,
      companyId,
      name: chat.name,
      snippet: chat.snippet,
      lastMessageAt: now,
      unreadCount: chat.unread,
      isAi: chat.ai,
      initials: chat.initials,
      color: chat.color,
    });

    // Lo storico mock è indicizzato per l'id della chat (stringa)
    const history = INITIAL_CONVERSATIONS[chat.id] ?? [];
    for (const m of history) {
      messageRows.push({
        companyId,
        conversationId,
        senderType: m.from === "ai-draft" ? "ai_draft" : m.from,
        body: m.text,
        sentAt: instantOf(today, m.time, tz),
      });
    }
  }
  if (conversationRows.length > 0) await tx.insert(conversations).values(conversationRows);
  if (messageRows.length > 0) await tx.insert(messages).values(messageRows);

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

  const demo = DEMO_ATTRIBUTES[sector];
  const clientRows: NewClientRow[] = INITIAL_PATIENTS.map((p) => ({
    companyId,
    code: p.id,
    name: p.name,
    gender: p.gender,
    avatar: p.avatar,
    dateOfBirth: requireDate(p.dateOfBirth, "cliente"),
    phone: p.phone,
    email: p.email,
    address: p.address,
    fiscalCode: p.fiscalCode,
    insurance: p.insurance,
    clientType: sector,
    attributes: demo.public,
  }));
  const inserted = await tx
    .insert(clients)
    .values(clientRows)
    .returning({ id: clients.id, code: clients.code });
  const idByCode = new Map(inserted.map((r) => [r.code, r.id]));
  await tx.insert(clientClinical).values(
    INITIAL_PATIENTS.map((p) => ({
      clientId: idByCode.get(p.id)!,
      companyId,
      recommendation: p.recommendation,
      previousVisit: p.previousVisit,
      selectedTooth: p.selectedTooth,
      xrayFindings: p.xrayFindings,
      treatments: p.treatments,
      attributes: demo.clinical,
    })),
  );
}
