import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ============================================================================
// ENUM TYPES
// Mapped 1:1 from PostgreSQL enums in init_saas_core.sql
// ============================================================================

export const eventSourceEnum = pgEnum("event_source", [
  "google_calendar",
  "apple_calendar",
  "manual",
  "ai_secretary",
]);

export const reminderPriorityEnum = pgEnum("reminder_priority", [
  "high",
  "medium",
  "low",
]);

export const reminderStatusEnum = pgEnum("reminder_status", [
  "active",
  "resolved",
  "archived",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "high",
  "medium",
  "low",
]);

export const taskColumnEnum = pgEnum("task_column", [
  "todo",
  "in_progress",
  "done",
]);

export const messageFromEnum = pgEnum("message_from", [
  "contact",
  "user",
  "ai_draft",
]);

export const quoteStatusEnum = pgEnum("quote_status", [
  "pending_ai",
  "quote_sent",
  "approved",
  "declined",
]);

// ============================================================================
// TABLES
// ============================================================================

// --------------------------------------------------------------------------
// companies — tenant root, referenced by every other table
// --------------------------------------------------------------------------
export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  customMetadata: jsonb("custom_metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// --------------------------------------------------------------------------
// company_members — maps auth.users → company (N:M)
// --------------------------------------------------------------------------
export const companyMembers = pgTable(
  "company_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull().default("member"),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("company_members_company_user_idx").on(
      table.companyId,
      table.userId
    ),
    index("idx_company_members_user").on(table.userId),
    index("idx_company_members_company").on(table.companyId),
  ]
);

// --------------------------------------------------------------------------
// calendar_events — from CalendarEventData
// --------------------------------------------------------------------------
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
    eventDate: date("event_date").notNull(),
    color: text("color"),
    source: eventSourceEnum("source").notNull().default("manual"),
    description: text("description").notNull().default(""),
    isAiGenerated: boolean("is_ai_generated").notNull().default(false),
    createdBy: uuid("created_by"),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_calendar_events_company").on(table.companyId),
    index("idx_calendar_events_date").on(table.companyId, table.eventDate),
  ]
);

// --------------------------------------------------------------------------
// reminders — from ReminderData
// --------------------------------------------------------------------------
export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
    priority: reminderPriorityEnum("priority").notNull().default("medium"),
    status: reminderStatusEnum("status").notNull().default("active"),
    createdBy: uuid("created_by"),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_reminders_company").on(table.companyId),
    index("idx_reminders_status").on(table.companyId, table.status),
  ]
);

// --------------------------------------------------------------------------
// tasks — from Task + Column context
// --------------------------------------------------------------------------
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    isAi: boolean("is_ai").notNull().default(false),
    description: text("description").notNull().default(""),
    assignedTo: uuid("assigned_to"),
    columnId: taskColumnEnum("column_id").notNull().default("todo"),
    position: integer("position").notNull().default(0),
    createdBy: uuid("created_by"),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_tasks_company").on(table.companyId),
    index("idx_tasks_column").on(table.companyId, table.columnId),
  ]
);

// --------------------------------------------------------------------------
// conversations — from ChatListItem
// --------------------------------------------------------------------------
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    snippet: text("snippet").notNull().default(""),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    unreadCount: integer("unread_count").notNull().default(0),
    isAi: boolean("is_ai").notNull().default(false),
    initials: text("initials"),
    color: text("color"),
    createdBy: uuid("created_by"),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_conversations_company").on(table.companyId),
  ]
);

// --------------------------------------------------------------------------
// messages — from Message
// --------------------------------------------------------------------------
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderType: messageFromEnum("sender_type").notNull(),
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_messages_company").on(table.companyId),
    index("idx_messages_conversation").on(table.conversationId),
    index("idx_messages_conv_sent_at").on(table.conversationId, table.sentAt),
  ]
);

// --------------------------------------------------------------------------
// quotes — from Quote
// --------------------------------------------------------------------------
export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    client: text("client").notNull(),
    quoteType: text("quote_type").notNull().default(""),
    quoteDate: date("quote_date").notNull().defaultNow(),
    status: quoteStatusEnum("status").notNull().default("pending_ai"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
    description: text("description").notNull().default(""),
    isAiGenerated: boolean("is_ai_generated").notNull().default(false),
    createdBy: uuid("created_by"),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_quotes_company").on(table.companyId),
    index("idx_quotes_status").on(table.companyId, table.status),
  ]
);

// ============================================================================
// TYPE EXPORTS — Use these instead of supabase.ts types
// ============================================================================
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

export type CompanyMember = typeof companyMembers.$inferSelect;
export type NewCompanyMember = typeof companyMembers.$inferInsert;

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type NewCalendarEvent = typeof calendarEvents.$inferInsert;

export type Reminder = typeof reminders.$inferSelect;
export type NewReminder = typeof reminders.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Quote = typeof quotes.$inferSelect;
export type NewQuote = typeof quotes.$inferInsert;
