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
  clients,
  clientClinical,
  clientFieldDefinitions,
  serviceCatalog,
  serviceRequests,
  workOrders,
  workOrderEvents,
  clientAccounts,
  customerNotifications,
  clientDocuments,
  recallLog,
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
  clients: many(clients),
  clientFieldDefinitions: many(clientFieldDefinitions),
  serviceCatalog: many(serviceCatalog),
  serviceRequests: many(serviceRequests),
  workOrders: many(workOrders),
  clientAccounts: many(clientAccounts),
  customerNotifications: many(customerNotifications),
  clientDocuments: many(clientDocuments),
  recallLog: many(recallLog),
}));

// --------------------------------------------------------------------------
// client_field_definitions belongs to company
// --------------------------------------------------------------------------
export const clientFieldDefinitionsRelations = relations(clientFieldDefinitions, ({ one }) => ({
  company: one(companies, {
    fields: [clientFieldDefinitions.companyId],
    references: [companies.id],
  }),
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
// clients belongs to company, has the new client-facing records
// --------------------------------------------------------------------------
export const clientsRelations = relations(clients, ({ one, many }) => ({
  company: one(companies, {
    fields: [clients.companyId],
    references: [companies.id],
  }),
  clinical: one(clientClinical),
  serviceRequests: many(serviceRequests),
  workOrders: many(workOrders),
  accounts: many(clientAccounts),
  notifications: many(customerNotifications),
  documents: many(clientDocuments),
  recalls: many(recallLog),
}));

// --------------------------------------------------------------------------
// Moduli lavori / richieste / portale / richiami: ciascuna tabella appartiene a company
// e (dove c'è client_id) a client. Le FK composite sono in drizzle/schema.ts.
// --------------------------------------------------------------------------
export const serviceCatalogRelations = relations(serviceCatalog, ({ one }) => ({
  company: one(companies, {
    fields: [serviceCatalog.companyId],
    references: [companies.id],
  }),
}));

export const serviceRequestsRelations = relations(serviceRequests, ({ one }) => ({
  company: one(companies, {
    fields: [serviceRequests.companyId],
    references: [companies.id],
  }),
  client: one(clients, {
    fields: [serviceRequests.clientId, serviceRequests.companyId],
    references: [clients.id, clients.companyId],
  }),
}));

export const workOrdersRelations = relations(workOrders, ({ one, many }) => ({
  company: one(companies, {
    fields: [workOrders.companyId],
    references: [companies.id],
  }),
  client: one(clients, {
    fields: [workOrders.clientId, workOrders.companyId],
    references: [clients.id, clients.companyId],
  }),
  events: many(workOrderEvents),
}));

export const workOrderEventsRelations = relations(workOrderEvents, ({ one }) => ({
  company: one(companies, {
    fields: [workOrderEvents.companyId],
    references: [companies.id],
  }),
  workOrder: one(workOrders, {
    fields: [workOrderEvents.workOrderId, workOrderEvents.companyId],
    references: [workOrders.id, workOrders.companyId],
  }),
}));

export const clientAccountsRelations = relations(clientAccounts, ({ one }) => ({
  company: one(companies, {
    fields: [clientAccounts.companyId],
    references: [companies.id],
  }),
  client: one(clients, {
    fields: [clientAccounts.clientId, clientAccounts.companyId],
    references: [clients.id, clients.companyId],
  }),
}));

export const customerNotificationsRelations = relations(customerNotifications, ({ one }) => ({
  company: one(companies, {
    fields: [customerNotifications.companyId],
    references: [companies.id],
  }),
  client: one(clients, {
    fields: [customerNotifications.clientId, customerNotifications.companyId],
    references: [clients.id, clients.companyId],
  }),
}));

export const clientDocumentsRelations = relations(clientDocuments, ({ one }) => ({
  company: one(companies, {
    fields: [clientDocuments.companyId],
    references: [companies.id],
  }),
  client: one(clients, {
    fields: [clientDocuments.clientId, clientDocuments.companyId],
    references: [clients.id, clients.companyId],
  }),
}));

export const recallLogRelations = relations(recallLog, ({ one }) => ({
  company: one(companies, {
    fields: [recallLog.companyId],
    references: [companies.id],
  }),
  client: one(clients, {
    fields: [recallLog.clientId, recallLog.companyId],
    references: [clients.id, clients.companyId],
  }),
}));

// --------------------------------------------------------------------------
// client_clinical belongs to client (1:1)
// --------------------------------------------------------------------------
export const clientClinicalRelations = relations(clientClinical, ({ one }) => ({
  client: one(clients, {
    fields: [clientClinical.clientId],
    references: [clients.id],
  }),
}));
