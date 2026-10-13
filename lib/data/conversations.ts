import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { conversations, messages, type Conversation, type Message as MessageRow } from "@/drizzle/schema";
import type { ChatListItem, Message, MessageFrom } from "@/app/types/messaging";
import type { CreateMessageInput } from "@/app/types/api";
import { getCalendarTimeZone } from "@/lib/calendar-sync/time";
import { NotFoundError } from "@/lib/errors";
import { assertUuid, first, initialsOf, relativeShort, timeInZone } from "./format";

type SenderType = MessageRow["senderType"];

const FROM_TO_DB: Record<MessageFrom, SenderType> = {
  contact: "contact",
  user: "user",
  "ai-draft": "ai_draft",
};

const FROM_FROM_DB: Record<SenderType, MessageFrom> = {
  contact: "contact",
  user: "user",
  ai_draft: "ai-draft",
};

const SNIPPET_MAX = 120;

function toChatItem(row: Conversation, now: Date): ChatListItem {
  return {
    id: row.id,
    name: row.name,
    snippet: row.snippet,
    time: relativeShort(row.lastMessageAt, now),
    unread: row.unreadCount,
    ai: row.isAi,
    initials: row.initials ?? initialsOf(row.name),
    color: row.color ?? "#64748b",
  };
}

function toMessage(row: MessageRow, tz: string): Message {
  return {
    id: row.id,
    from: FROM_FROM_DB[row.senderType],
    text: row.body,
    time: timeInZone(row.sentAt, tz),
  };
}

export async function listConversations(tx: Tx, companyId: string): Promise<ChatListItem[]> {
  const now = new Date();
  const rows = await tx
    .select()
    .from(conversations)
    .where(eq(conversations.companyId, companyId))
    .orderBy(sql`${conversations.lastMessageAt} desc nulls last`, asc(conversations.name));
  return rows.map((row) => toChatItem(row, now));
}

/**
 * Conversazione + messaggi in UNA query (LEFT JOIN): zero righe = conversazione inesistente
 * (NotFound), una riga con message null = conversazione senza messaggi.
 */
export async function listMessages(tx: Tx, companyId: string, conversationId: string): Promise<Message[]> {
  assertUuid(conversationId, "id conversazione");
  const tz = getCalendarTimeZone();
  const rows = await tx
    .select({ message: messages })
    .from(conversations)
    .leftJoin(
      messages,
      and(eq(messages.conversationId, conversations.id), eq(messages.companyId, companyId)),
    )
    .where(and(eq(conversations.id, conversationId), eq(conversations.companyId, companyId)))
    .orderBy(asc(messages.sentAt));
  if (rows.length === 0) throw new NotFoundError("Conversazione non trovata");
  return rows.flatMap((r) => (r.message ? [toMessage(r.message, tz)] : []));
}

/**
 * Salva il messaggio e aggiorna snippet/ultimo messaggio e (se dal contatto) il contatore non letti.
 * Prima l'UPDATE della conversazione (verifica appartenenza, NotFound), poi l'INSERT: 2 statement.
 */
export async function createMessage(
  tx: Tx,
  companyId: string,
  conversationId: string,
  input: CreateMessageInput,
): Promise<Message> {
  assertUuid(conversationId, "id conversazione");
  const tz = getCalendarTimeZone();
  const now = new Date();

  const updated = await tx
    .update(conversations)
    .set({
      snippet: input.text.slice(0, SNIPPET_MAX),
      lastMessageAt: now,
      updatedAt: now,
      ...(input.from === "contact" ? { unreadCount: sql`${conversations.unreadCount} + 1` } : {}),
    })
    .where(and(eq(conversations.id, conversationId), eq(conversations.companyId, companyId)))
    .returning({ id: conversations.id });
  if (updated.length === 0) throw new NotFoundError("Conversazione non trovata");

  const inserted = await tx
    .insert(messages)
    .values({
      companyId,
      conversationId,
      senderType: FROM_TO_DB[input.from],
      body: input.text,
      sentAt: now,
    })
    .returning();
  return toMessage(first(inserted, "insert messages"), tz);
}

export async function markConversationRead(tx: Tx, companyId: string, conversationId: string): Promise<void> {
  assertUuid(conversationId, "id conversazione");
  const updated = await tx
    .update(conversations)
    .set({ unreadCount: 0, updatedAt: new Date() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.companyId, companyId)))
    .returning({ id: conversations.id });
  if (updated.length === 0) throw new NotFoundError("Conversazione non trovata");
}
