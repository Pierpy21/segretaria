// ============================================================================
// SCHEMA DRIZZLE — SOLO TIPI E QUERY.
// La fonte di verità dello schema è supabase/migrations/*.sql (applicate con
// la Supabase CLI). Questo file deve restare allineato alle migration: NON
// usare drizzle-kit generate/push. `pnpm db:check` valida solo la configurazione.
// ============================================================================
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
  index,
  unique,
  uniqueIndex,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";
import type { InsuranceCardData, PreviousVisitNote, SelectedToothData, TreatmentHistoryItem, XRayFinding } from "@/app/types/patients";

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
export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("companies_slug_key").on(table.slug)]
);

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
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("company_members_company_id_user_id_key").on(table.companyId, table.userId),
    index("idx_company_members_user").on(table.userId),
    index("idx_company_members_company").on(table.companyId),
    index("company_members_user_company_role_idx").on(table.userId, table.companyId, table.role),
  ]
);

// --------------------------------------------------------------------------
// calendar_events — from CalendarEventData (manuali + importati via sync)
// --------------------------------------------------------------------------
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    color: text("color"),
    source: eventSourceEnum("source").notNull().default("manual"),
    description: text("description").notNull().default(""),
    isAiGenerated: boolean("is_ai_generated").notNull().default(false),
    externalProvider: text("external_provider", { enum: ["google", "apple"] }),
    externalId: text("external_id"),
    externalEtag: text("external_etag"),
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_calendar_events_company").on(table.companyId),
    index("idx_calendar_events_start").on(table.companyId, table.startAt),
    index("calendar_events_created_by_idx").on(table.createdBy),
    uniqueIndex("calendar_events_external_uniq")
      .on(table.companyId, table.externalProvider, table.externalId)
      .where(sql`${table.externalId} is not null`),
    check(
      "calendar_events_external_provider_check",
      sql`${table.externalProvider} in ('google', 'apple')`
    ),
    check(
      "calendar_events_external_ref_chk",
      sql`(${table.externalProvider} is null) = (${table.externalId} is null)`
    ),
    check("calendar_events_end_after_start_chk", sql`${table.endAt} >= ${table.startAt}`),
  ]
);

// --------------------------------------------------------------------------
// calendar_connections — collegamento Google/Apple per azienda (credenziali cifrate)
// --------------------------------------------------------------------------
export const calendarConnections = pgTable(
  "calendar_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["google", "apple"] }).notNull(),
    account: text("account"),
    /** Google calendar id oppure URL CalDAV */
    calendarId: text("calendar_id"),
    calendarName: text("calendar_name"),
    /** Payload AES-256-GCM (lib/calendar-sync/crypto.ts) */
    credentialsEncrypted: text("credentials_encrypted").notNull(),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("calendar_connections_company_id_provider_key").on(table.companyId, table.provider),
    check("calendar_connections_provider_check", sql`${table.provider} in ('google', 'apple')`),
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
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_reminders_company").on(table.companyId),
    index("idx_reminders_status").on(table.companyId, table.status),
    index("reminders_created_by_idx").on(table.createdBy),
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
    /** UUID membro (nullable). L'assegnatario testuale della UI vive in custom_metadata.assignedTo */
    assignedTo: uuid("assigned_to"),
    columnId: taskColumnEnum("column_id").notNull().default("todo"),
    position: integer("position").notNull().default(0),
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_tasks_company").on(table.companyId),
    index("idx_tasks_column").on(table.companyId, table.columnId),
    index("tasks_created_by_idx").on(table.createdBy),
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
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_conversations_company").on(table.companyId),
    index("conversations_created_by_idx").on(table.createdBy),
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
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_messages_company").on(table.companyId),
    index("idx_messages_conversation").on(table.conversationId),
    index("idx_messages_conv_sent_at").on(table.conversationId, table.sentAt),
    index("messages_created_by_idx").on(table.createdBy),
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
    quoteDate: date("quote_date", { mode: "string" }).notNull().defaultNow(),
    status: quoteStatusEnum("status").notNull().default("pending_ai"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
    description: text("description").notNull().default(""),
    isAiGenerated: boolean("is_ai_generated").notNull().default(false),
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_quotes_company").on(table.companyId),
    index("idx_quotes_status").on(table.companyId, table.status),
    index("quotes_created_by_idx").on(table.createdBy),
  ]
);

// --------------------------------------------------------------------------
// patients — from Patient (id applicativo = code, es. "PT-2026-0142")
// --------------------------------------------------------------------------
export const patients = pgTable(
  "patients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    gender: text("gender", { enum: ["F", "M"] }).notNull(),
    avatar: text("avatar").notNull().default(""),
    dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    address: text("address").notNull().default(""),
    fiscalCode: text("fiscal_code").notNull().default(""),
    insurance: jsonb("insurance").$type<InsuranceCardData>().notNull().default({} as InsuranceCardData),
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("patients_company_id_code_key").on(table.companyId, table.code),
    unique("patients_id_company_id_key").on(table.id, table.companyId),
    index("idx_patients_created_by").on(table.createdBy),
    check("patients_gender_check", sql`${table.gender} in ('F', 'M')`),
  ]
);

// --------------------------------------------------------------------------
// patient_clinical — dati clinici (RLS: negati al ruolo accountant)
// --------------------------------------------------------------------------
export const patientClinical = pgTable(
  "patient_clinical",
  {
    patientId: uuid("patient_id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    recommendation: text("recommendation").notNull().default(""),
    previousVisit: jsonb("previous_visit").$type<PreviousVisitNote>().notNull().default({} as PreviousVisitNote),
    selectedTooth: jsonb("selected_tooth").$type<SelectedToothData>().notNull().default({} as SelectedToothData),
    xrayFindings: jsonb("xray_findings").$type<XRayFinding[]>().notNull().default([] as XRayFinding[]),
    treatments: jsonb("treatments").$type<TreatmentHistoryItem[]>().notNull().default([] as TreatmentHistoryItem[]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "patient_clinical_patient_fkey",
      columns: [table.patientId, table.companyId],
      foreignColumns: [patients.id, patients.companyId],
    }).onDelete("cascade"),
    index("idx_patient_clinical_company").on(table.companyId),
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

export type CalendarConnection = typeof calendarConnections.$inferSelect;
export type NewCalendarConnection = typeof calendarConnections.$inferInsert;

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

/** Riga DB dei pazienti (il tipo UI è `Patient` in app/types/patients.ts) */
export type PatientRow = typeof patients.$inferSelect;
export type NewPatientRow = typeof patients.$inferInsert;
export type PatientClinicalRow = typeof patientClinical.$inferSelect;
export type NewPatientClinicalRow = typeof patientClinical.$inferInsert;
