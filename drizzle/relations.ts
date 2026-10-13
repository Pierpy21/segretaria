import { relations } from "drizzle-orm";
import {
  companies,
  companyMembers,
  calendarEvents,
  calendarConnections,
  reminders,
  tasks,
  conversations,
  messages,
  quotes,
  patients,
} from "./schema";

// ============================================================================
// RELATIONS
// Explicit relation definitions for Drizzle's relational query builder.
// These enable: db.query.companies.findMany({ with: { members: true } })
// ============================================================================

// --------------------------------------------------------------------------
// companies has many of everything
// --------------------------------------------------------------------------
export const companiesRelations = relations(companies, ({ many }) => ({
  members: many(companyMembers),
  calendarEvents: many(calendarEvents),
  calendarConnections: many(calendarConnections),
  reminders: many(reminders),
  tasks: many(tasks),
  conversations: many(conversations),
  messages: many(messages),
  quotes: many(quotes),
  patients: many(patients),
}));

// --------------------------------------------------------------------------
// company_members belongs to company
// --------------------------------------------------------------------------
export const companyMembersRelations = relations(companyMembers, ({ one }) => ({
  company: one(companies, {
    fields: [companyMembers.companyId],
    references: [companies.id],
  }),
}));

// --------------------------------------------------------------------------
// calendar_events belongs to company
// --------------------------------------------------------------------------
export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  company: one(companies, {
    fields: [calendarEvents.companyId],
    references: [companies.id],
  }),
}));

// --------------------------------------------------------------------------
// calendar_connections belongs to company
// --------------------------------------------------------------------------
export const calendarConnectionsRelations = relations(calendarConnections, ({ one }) => ({
  company: one(companies, {
    fields: [calendarConnections.companyId],
    references: [companies.id],
  }),
}));

// --------------------------------------------------------------------------
// reminders belongs to company
// --------------------------------------------------------------------------
export const remindersRelations = relations(reminders, ({ one }) => ({
  company: one(companies, {
    fields: [reminders.companyId],
    references: [companies.id],
  }),
}));

// --------------------------------------------------------------------------
// tasks belongs to company
// --------------------------------------------------------------------------
export const tasksRelations = relations(tasks, ({ one }) => ({
  company: one(companies, {
    fields: [tasks.companyId],
    references: [companies.id],
  }),
}));

// --------------------------------------------------------------------------
// conversations belongs to company, has many messages
// --------------------------------------------------------------------------
export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [conversations.companyId],
      references: [companies.id],
    }),
    messages: many(messages),
  })
);

// --------------------------------------------------------------------------
// messages belongs to company + conversation
// --------------------------------------------------------------------------
export const messagesRelations = relations(messages, ({ one }) => ({
  company: one(companies, {
    fields: [messages.companyId],
    references: [companies.id],
  }),
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

// --------------------------------------------------------------------------
// quotes belongs to company
// --------------------------------------------------------------------------
export const quotesRelations = relations(quotes, ({ one }) => ({
  company: one(companies, {
    fields: [quotes.companyId],
    references: [companies.id],
  }),
}));

// --------------------------------------------------------------------------
// patients belongs to company
// --------------------------------------------------------------------------
export const patientsRelations = relations(patients, ({ one }) => ({
  company: one(companies, {
    fields: [patients.companyId],
    references: [companies.id],
  }),
}));
