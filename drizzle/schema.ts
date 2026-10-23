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
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";
import type {
  ClientAttributes,
  ClientFieldType,
  FieldEntity,
  InsuranceCardData,
  PreviousVisitNote,
  Sector,
  TreatmentHistoryItem,
} from "@/app/types/clients";
import type { ModuleKey, Terms } from "@/app/types/settings";

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
    sector: text("sector").$type<Sector>().notNull().default("generico"),
    /** Versione del preset (vertical_templates) applicata allo studio */
    templateVersion: integer("template_version"),
    /** Terminologia dello studio (copiata dal preset, personalizzabile) */
    terms: jsonb("terms").$type<Partial<Terms>>().notNull().default({}),
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
    /** Ruolo personalizzato (company_roles), solo per member/accountant. FK composita nella migration */
    customRoleId: uuid("custom_role_id"),
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
// company_invitations — inviti a un membro. Il token in chiaro non è mai salvato:
// token_hash = sha256 hex (lib/auth/invitation-token.ts). Nessuna policy DELETE.
// --------------------------------------------------------------------------
export const companyInvitations = pgTable(
  "company_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedBy: uuid("invited_by").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '7 days'`),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by").references(() => authUsers.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    unique("company_invitations_token_hash_key").on(table.tokenHash),
    uniqueIndex("company_invitations_pending_uniq")
      .on(table.companyId, table.email)
      .where(sql`${table.acceptedAt} is null and ${table.revokedAt} is null`),
    index("company_invitations_company_id_idx").on(table.companyId),
    check("company_invitations_role_check", sql`${table.role} in ('admin', 'member', 'accountant')`),
    check(
      "company_invitations_email_check",
      sql`${table.email} = lower(${table.email}) and char_length(${table.email}) <= 254`
    ),
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
    /** Bene del cliente collegato (FK composita + ON DELETE SET NULL nella migration) */
    assetId: uuid("asset_id"),
    /** Tipo di appuntamento dello studio (FK composita + ON DELETE SET NULL nella migration) */
    appointmentTypeId: uuid("appointment_type_id"),
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("calendar_events_id_company_id_key").on(table.id, table.companyId),
    index("idx_calendar_events_company").on(table.companyId),
    index("idx_calendar_events_asset").on(table.companyId, table.assetId),
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
    /** Bene del cliente collegato (nullable) */
    assetId: uuid("asset_id"),
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("tasks_id_company_id_key").on(table.id, table.companyId),
    index("idx_tasks_company").on(table.companyId),
    index("idx_tasks_column").on(table.companyId, table.columnId),
    index("idx_tasks_asset").on(table.companyId, table.assetId),
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
    /** Bene del cliente collegato (nullable) */
    assetId: uuid("asset_id"),
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_quotes_company").on(table.companyId),
    index("idx_quotes_status").on(table.companyId, table.status),
    index("idx_quotes_asset").on(table.companyId, table.assetId),
    index("quotes_created_by_idx").on(table.createdBy),
  ]
);

// --------------------------------------------------------------------------
// clients — from Client (id applicativo = code, es. "PT-2026-0142")
// --------------------------------------------------------------------------
export const clients = pgTable(
  "clients",
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
    clientType: text("client_type").notNull().default("generico"),
    /** Campi personalizzati NON sensibili (i sensibili stanno in client_clinical.attributes) */
    attributes: jsonb("attributes").$type<ClientAttributes>().notNull().default({}),
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    customMetadata: jsonb("custom_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("clients_company_id_code_key").on(table.companyId, table.code),
    unique("clients_id_company_id_key").on(table.id, table.companyId),
    index("idx_clients_created_by").on(table.createdBy),
    check("clients_gender_check", sql`${table.gender} in ('F', 'M')`),
    check("clients_attributes_object", sql`jsonb_typeof(${table.attributes}) = 'object'`),
  ]
);

// --------------------------------------------------------------------------
// client_assets — beni del cliente (veicoli, animali, immobili…). N per cliente.
// Attributi validati con client_field_definitions (entity = 'asset', client_type = asset_type).
// --------------------------------------------------------------------------
export const clientAssets = pgTable(
  "client_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    assetType: text("asset_type").notNull(),
    name: text("name").notNull(),
    /** Targa, microchip, matricola… */
    identifier: text("identifier"),
    attributes: jsonb("attributes").$type<ClientAttributes>().notNull().default({}),
    note: text("note"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("client_assets_id_company_id_key").on(table.id, table.companyId),
    foreignKey({
      name: "client_assets_client_fkey",
      columns: [table.clientId, table.companyId],
      foreignColumns: [clients.id, clients.companyId],
    }).onDelete("cascade"),
    index("idx_client_assets_client").on(table.companyId, table.clientId),
    index("idx_client_assets_identifier").on(table.companyId, table.identifier),
    index("idx_client_assets_created_by").on(table.createdBy),
    check("client_assets_attributes_object", sql`jsonb_typeof(${table.attributes}) = 'object'`),
    check("client_assets_type_format", sql`${table.assetType} ~ '^[a-z][a-z0-9_]{0,62}$'`),
  ]
);

// --------------------------------------------------------------------------
// client_clinical — dati clinici (RLS: negati al ruolo accountant)
// --------------------------------------------------------------------------
export const clientClinical = pgTable(
  "client_clinical",
  {
    clientId: uuid("client_id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    recommendation: text("recommendation").notNull().default(""),
    previousVisit: jsonb("previous_visit").$type<PreviousVisitNote>().notNull().default({} as PreviousVisitNote),
    treatments: jsonb("treatments").$type<TreatmentHistoryItem[]>().notNull().default([] as TreatmentHistoryItem[]),
    /** Valori dei campi con sensitive = true */
    attributes: jsonb("attributes").$type<ClientAttributes>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "client_clinical_client_fkey",
      columns: [table.clientId, table.companyId],
      foreignColumns: [clients.id, clients.companyId],
    }).onDelete("cascade"),
    index("idx_client_clinical_company").on(table.companyId),
    check("client_clinical_attributes_object", sql`jsonb_typeof(${table.attributes}) = 'object'`),
  ]
);

// --------------------------------------------------------------------------
// client_field_definitions — campi personalizzati per company + tipo cliente
// --------------------------------------------------------------------------
export const clientFieldDefinitions = pgTable(
  "client_field_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** 'client' → clientType = settore; 'asset' → asset_type; 'item' → chiave del tipo articolo */
    entity: text("entity").$type<FieldEntity>().notNull().default("client"),
    clientType: text("client_type").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type").$type<ClientFieldType>().notNull(),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    required: boolean("required").notNull().default(false),
    position: integer("position").notNull().default(0),
    sensitive: boolean("sensitive").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("client_field_definitions_key_unique").on(table.companyId, table.entity, table.clientType, table.key),
    index("idx_client_field_definitions_company").on(table.companyId, table.entity, table.clientType, table.position),
    check("client_field_definitions_entity_check", sql`${table.entity} in ('client', 'asset', 'item')`),
    check("client_field_definitions_type_check", sql`${table.type} in ('text', 'number', 'date', 'select', 'bool')`),
    check("client_field_definitions_key_format", sql`${table.key} ~ '^[a-z][a-z0-9_]{0,62}$'`),
    check("client_field_definitions_options_array", sql`jsonb_typeof(${table.options}) = 'array'`),
  ]
);

// --------------------------------------------------------------------------
// vertical_templates — preset versionati per settore (catalogo globale, sola lettura)
// --------------------------------------------------------------------------
export interface VerticalTemplatePayload {
  terms: Terms;
  modules: Record<ModuleKey, boolean>;
  appointment_types: { key: string; label: string; color: string; duration_minutes: number; position: number }[];
  fields: {
    entity: FieldEntity; client_type: string; key: string; label: string; type: ClientFieldType;
    options: string[]; required: boolean; position: number; sensitive: boolean;
  }[];
  /** Dalla v2 (20261023120000_inventory.sql) */
  item_types?: {
    key: string; label: string; track_lot: boolean; track_expiry: boolean; track_serial: boolean;
    consumable: boolean; fractional: boolean; sellable: boolean; requires_client_on_issue: boolean; position: number;
  }[];
}

export const verticalTemplates = pgTable(
  "vertical_templates",
  {
    key: text("key").notNull(),
    version: integer("version").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull().default(""),
    payload: jsonb("payload").$type<VerticalTemplatePayload>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.key, table.version] })]
);

// --------------------------------------------------------------------------
// company_modules — moduli attivabili per studio (riga assente = attivo)
// --------------------------------------------------------------------------
export const companyModules = pgTable(
  "company_modules",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    module: text("module").$type<ModuleKey>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.companyId, table.module] })]
);

// --------------------------------------------------------------------------
// company_roles — ruoli personalizzati composti da permessi del catalogo
// --------------------------------------------------------------------------
export const companyRoles = pgTable(
  "company_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    permissions: text("permissions").array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("company_roles_key_unique").on(table.companyId, table.key),
    unique("company_roles_id_company_id_key").on(table.id, table.companyId),
    index("idx_company_roles_company").on(table.companyId),
  ]
);

// --------------------------------------------------------------------------
// company_appointment_types — tipi di appuntamento dello studio (dal preset)
// --------------------------------------------------------------------------
export const companyAppointmentTypes = pgTable(
  "company_appointment_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    color: text("color").notNull().default("#E04A95"),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    position: integer("position").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("company_appointment_types_key_unique").on(table.companyId, table.key),
    unique("company_appointment_types_id_company_id_key").on(table.id, table.companyId),
    index("idx_company_appointment_types_company").on(table.companyId, table.position),
  ]
);

// ============================================================================
// MAGAZZINO (20261023120000_inventory.sql)
// La giacenza nasce dai movimenti: inventory_stock è scritta solo dal trigger,
// inventory_movements è append-only (solo SELECT/INSERT).
// ============================================================================
export type InventoryMovementType = "carico" | "scarico" | "rettifica" | "reso";

// --------------------------------------------------------------------------
// inventory_item_types — tipi di articolo per studio; il comportamento sta nei flag
// --------------------------------------------------------------------------
export const inventoryItemTypes = pgTable(
  "inventory_item_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    /** Etichetta del lotto in UI (es. "DOT"); NULL = "Lotto" */
    lotLabel: text("lot_label"),
    trackLot: boolean("track_lot").notNull().default(false),
    trackExpiry: boolean("track_expiry").notNull().default(false),
    trackSerial: boolean("track_serial").notNull().default(false),
    /** false = bene durevole: non va a scorta minima */
    consumable: boolean("consumable").notNull().default(true),
    /** true = carico in unit, scarico in issue_unit */
    fractional: boolean("fractional").notNull().default(false),
    /** true = prezzo di vendita e IVA obbligatori */
    sellable: boolean("sellable").notNull().default(false),
    requiresClientOnIssue: boolean("requires_client_on_issue").notNull().default(false),
    position: integer("position").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("inventory_item_types_key_unique").on(table.companyId, table.key),
    unique("inventory_item_types_id_company_id_key").on(table.id, table.companyId),
    index("idx_inventory_item_types_company").on(table.companyId, table.position),
    check("inventory_item_types_key_format", sql`${table.key} ~ '^[a-z][a-z0-9_]{0,62}$'`),
    check("inventory_item_types_label_length", sql`char_length(${table.label}) BETWEEN 1 AND 80`),
    check(
      "inventory_item_types_lot_label_length",
      sql`${table.lotLabel} IS NULL OR char_length(${table.lotLabel}) BETWEEN 1 AND 40`
    ),
  ]
);

// --------------------------------------------------------------------------
// inventory_categories — solo organizzazione/filtri, parent facoltativo
// --------------------------------------------------------------------------
export const inventoryCategories = pgTable(
  "inventory_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    parentId: uuid("parent_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("inventory_categories_id_company_id_key").on(table.id, table.companyId),
    // ON DELETE SET NULL (parent_id) nella migration (drizzle non modella la colonna).
    foreignKey({
      name: "inventory_categories_parent_fkey",
      columns: [table.parentId, table.companyId],
      foreignColumns: [table.id, table.companyId],
    }),
    index("idx_inventory_categories_company").on(table.companyId, table.name),
    index("idx_inventory_categories_parent").on(table.parentId).where(sql`${table.parentId} IS NOT NULL`),
    check("inventory_categories_not_self_parent", sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`),
    check("inventory_categories_name_length", sql`char_length(${table.name}) BETWEEN 1 AND 80`),
  ]
);

// --------------------------------------------------------------------------
// inventory_items — anagrafica articoli (nessuna quantità).
// reorder_level/reorder_qty nell'unità di scarico; conversion_factor = unità di
// scarico per 1 unità di carico (1 e issue_unit NULL se il tipo non è frazionabile).
// --------------------------------------------------------------------------
export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    itemTypeId: uuid("item_type_id").notNull(),
    categoryId: uuid("category_id"),
    unit: text("unit").notNull().default("pz"),
    issueUnit: text("issue_unit"),
    conversionFactor: numeric("conversion_factor", { precision: 14, scale: 4 }).notNull().default("1"),
    reorderLevel: numeric("reorder_level", { precision: 14, scale: 3 }),
    reorderQty: numeric("reorder_qty", { precision: 14, scale: 3 }),
    purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }),
    salePrice: numeric("sale_price", { precision: 12, scale: 2 }),
    vatRate: numeric("vat_rate", { precision: 5, scale: 2 }),
    /** Validati con client_field_definitions (entity = 'item', client_type = chiave del tipo) */
    attributes: jsonb("attributes").$type<ClientAttributes>().notNull().default({}),
    note: text("note"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("inventory_items_sku_unique").on(table.companyId, table.sku),
    unique("inventory_items_id_company_id_key").on(table.id, table.companyId),
    foreignKey({
      name: "inventory_items_type_fkey",
      columns: [table.itemTypeId, table.companyId],
      foreignColumns: [inventoryItemTypes.id, inventoryItemTypes.companyId],
    }),
    // ON DELETE SET NULL (category_id) nella migration.
    foreignKey({
      name: "inventory_items_category_fkey",
      columns: [table.categoryId, table.companyId],
      foreignColumns: [inventoryCategories.id, inventoryCategories.companyId],
    }),
    index("idx_inventory_items_company").on(table.companyId, table.name),
    index("idx_inventory_items_type").on(table.companyId, table.itemTypeId),
    index("idx_inventory_items_category").on(table.companyId, table.categoryId),
    index("idx_inventory_items_created_by").on(table.createdBy),
    check("inventory_items_conversion_positive", sql`${table.conversionFactor} > 0`),
    check("inventory_items_vat_range", sql`${table.vatRate} IS NULL OR ${table.vatRate} BETWEEN 0 AND 100`),
    check("inventory_items_attributes_object", sql`jsonb_typeof(${table.attributes}) = 'object'`),
  ]
);

// --------------------------------------------------------------------------
// inventory_movements — registro append-only. quantity nell'unità di scarico:
// carico/reso > 0, scarico < 0, rettifica ≠ 0. Validato dal trigger secondo i flag.
// --------------------------------------------------------------------------
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull(),
    movementType: text("movement_type").$type<InventoryMovementType>().notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    lot: text("lot"),
    expiryDate: date("expiry_date"),
    serial: text("serial"),
    unitCost: numeric("unit_cost", { precision: 12, scale: 4 }),
    clientId: uuid("client_id"),
    appointmentId: uuid("appointment_id"),
    taskId: uuid("task_id"),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "inventory_movements_item_fkey",
      columns: [table.itemId, table.companyId],
      foreignColumns: [inventoryItems.id, inventoryItems.companyId],
    }),
    // ON DELETE SET NULL (colonna) per cliente, appuntamento e task nella migration.
    foreignKey({
      name: "inventory_movements_client_fkey",
      columns: [table.clientId, table.companyId],
      foreignColumns: [clients.id, clients.companyId],
    }),
    foreignKey({
      name: "inventory_movements_appointment_fkey",
      columns: [table.appointmentId, table.companyId],
      foreignColumns: [calendarEvents.id, calendarEvents.companyId],
    }),
    foreignKey({
      name: "inventory_movements_task_fkey",
      columns: [table.taskId, table.companyId],
      foreignColumns: [tasks.id, tasks.companyId],
    }),
    index("idx_inventory_movements_item").on(table.companyId, table.itemId, table.createdAt.desc()),
    index("idx_inventory_movements_serial").on(table.itemId, table.serial).where(sql`${table.serial} IS NOT NULL`),
    index("idx_inventory_movements_client").on(table.clientId).where(sql`${table.clientId} IS NOT NULL`),
    index("idx_inventory_movements_appointment").on(table.appointmentId).where(sql`${table.appointmentId} IS NOT NULL`),
    index("idx_inventory_movements_task").on(table.taskId).where(sql`${table.taskId} IS NOT NULL`),
    index("idx_inventory_movements_created_by").on(table.createdBy),
    check("inventory_movements_type_check", sql`${table.movementType} IN ('carico', 'scarico', 'rettifica', 'reso')`),
    check(
      "inventory_movements_sign_check",
      sql`(${table.movementType} IN ('carico', 'reso') AND ${table.quantity} > 0)
        OR (${table.movementType} = 'scarico' AND ${table.quantity} < 0)
        OR (${table.movementType} = 'rettifica' AND ${table.quantity} <> 0)`,
    ),
  ]
);

// --------------------------------------------------------------------------
// inventory_stock — giacenza per articolo + lotto + scadenza (solo lettura per gli utenti)
// --------------------------------------------------------------------------
export const inventoryStock = pgTable(
  "inventory_stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull(),
    lot: text("lot"),
    expiryDate: date("expiry_date"),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "inventory_stock_item_fkey",
      columns: [table.itemId, table.companyId],
      foreignColumns: [inventoryItems.id, inventoryItems.companyId],
    }).onDelete("cascade"),
    unique("inventory_stock_key_unique").on(table.companyId, table.itemId, table.lot, table.expiryDate).nullsNotDistinct(),
    index("idx_inventory_stock_item").on(table.companyId, table.itemId),
    index("idx_inventory_stock_expiry")
      .on(table.companyId, table.expiryDate)
      .where(sql`${table.expiryDate} IS NOT NULL AND ${table.quantity} > 0`),
    check("inventory_stock_nonneg", sql`${table.quantity} >= 0`),
  ]
);

// ============================================================================
// TYPE EXPORTS — Use these instead of supabase.ts types
// ============================================================================
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

export type CompanyMember = typeof companyMembers.$inferSelect;
export type NewCompanyMember = typeof companyMembers.$inferInsert;

export type CompanyInvitation = typeof companyInvitations.$inferSelect;
export type NewCompanyInvitation = typeof companyInvitations.$inferInsert;

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

/** Riga DB dei clienti (il tipo UI è `Client` in app/types/clients.ts) */
export type ClientRow = typeof clients.$inferSelect;
export type NewClientRow = typeof clients.$inferInsert;
export type ClientAssetRow = typeof clientAssets.$inferSelect;
export type NewClientAssetRow = typeof clientAssets.$inferInsert;
export type ClientClinicalRow = typeof clientClinical.$inferSelect;
export type NewClientClinicalRow = typeof clientClinical.$inferInsert;
export type ClientFieldDefinitionRow = typeof clientFieldDefinitions.$inferSelect;
export type NewClientFieldDefinitionRow = typeof clientFieldDefinitions.$inferInsert;

export type CompanyModule = typeof companyModules.$inferSelect;
export type CompanyRoleRow = typeof companyRoles.$inferSelect;
export type CompanyAppointmentType = typeof companyAppointmentTypes.$inferSelect;
export type VerticalTemplate = typeof verticalTemplates.$inferSelect;

export type InventoryItemTypeRow = typeof inventoryItemTypes.$inferSelect;
export type NewInventoryItemTypeRow = typeof inventoryItemTypes.$inferInsert;
export type InventoryCategoryRow = typeof inventoryCategories.$inferSelect;
export type NewInventoryCategoryRow = typeof inventoryCategories.$inferInsert;
export type InventoryItemRow = typeof inventoryItems.$inferSelect;
export type NewInventoryItemRow = typeof inventoryItems.$inferInsert;
export type InventoryMovementRow = typeof inventoryMovements.$inferSelect;
export type NewInventoryMovementRow = typeof inventoryMovements.$inferInsert;
export type InventoryStockRow = typeof inventoryStock.$inferSelect;
