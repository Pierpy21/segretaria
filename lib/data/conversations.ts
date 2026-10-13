import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { withUser, type Tx } from "@/lib/db";
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

export async function listConversations(companyId: string): Promise<ChatListItem[]> {
  const now = new Date();
  const rows = await withUser((tx) =>
    tx
      .select()
      .from(conversations)
      .where(eq(conversations.companyId, companyId))
      .orderBy(sql`${conversations.lastMessageAt} desc nulls last`, asc(conversations.name))
  );
  return rows.map((row) => toChatItem(row, now));
}

/** Verifica che la conversazione appartenga allo studio (altrimenti NotFound). */
async function assertConversation(tx: Tx, companyId: string, conversationId: string): Promise<void> {
  const rows = await tx
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.companyId, companyId)))
    .limit(1);
  if (!rows[0]) throw new NotFoundError("Conversazione non trovata");
}

export async function listMessages(companyId: string, conversationId: string): Promise<Message[]> {
  assertUuid(conversationId, "id conversazione");
  const tz = getCalendarTimeZone();
  return withUser(async (tx) => {
    await assertConversation(tx, companyId, conversationId);
    const rows = await tx
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.companyId, companyId)))
      .orderBy(asc(messages.sentAt));
    return rows.map((row) => toMessage(row, tz));
  });
}

/** Salva il messaggio, aggiorna snippet/ultimo messaggio e (se dal contatto) il contatore non letti. */
export async function createMessage(
  companyId: string,
  conversationId: string,
  input: CreateMessageInput,
): Promise<Message> {
  assertUuid(conversationId, "id conversazione");
  const tz = getCalendarTimeZone();
  const now = new Date();

  return withUser(async (tx) => {
    await assertConversation(tx, companyId, conversationId);

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

    await tx
      .update(conversations)
      .set({
        snippet: input.text.slice(0, SNIPPET_MAX),
        lastMessageAt: now,
        updatedAt: now,
        ...(input.from === "contact" ? { unreadCount: sql`${conversations.unreadCount} + 1` } : {}),
      })
      .where(eq(conversations.id, conversationId));

    return toMessage(first(inserted, "insert messages"), tz);
  });
}

export async function markConversationRead(companyId: string, conversationId: string): Promise<void> {
  assertUuid(conversationId, "id conversazione");
  await withUser(async (tx) => {
    const updated = await tx
      .update(conversations)
      .set({ unreadCount: 0, updatedAt: new Date() })
      .where(and(eq(conversations.id, conversationId), eq(conversations.companyId, companyId)))
      .returning({ id: conversations.id });
    if (updated.length === 0) throw new NotFoundError("Conversazione non trovata");
  });
}
