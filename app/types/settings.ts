// Configurazione dello studio per settore (Fase B): preset, moduli, terminologia, ruoli.
// Fonte dati: vertical_templates, companies.terms, company_modules, company_roles,
// company_appointment_types (supabase/migrations/20261020120000_vertical_templates.sql).

/** Moduli attivabili per studio (company_modules.module). */
export type ModuleKey = "agenda" | "chat" | "quotes" | "maintenance" | "sensitive_data" | "assets" | "ai_assistant" | "inventory";

/** Stato dei moduli: chiave assente = attivo. */
export type CompanyModules = Record<ModuleKey, boolean>;

/** Dizionario di etichette dello studio (companies.terms, copiato dal preset del settore). */
export interface Terms {
  clientSingular: string;
  clientPlural: string;
  quoteSingular: string;
  quotePlural: string;
  ownerTitle: string;
  memberTitle: string;
  accountantTitle: string;
  sensitiveData: string;
  tasksLabel: string;
  clientsSubtitle: string;
  chatSubtitle: string;
  agendaSubtitle: string;
  tasksSubtitle: string;
  quotesSubtitle: string;
  statusPendingAi: string;
  statusSent: string;
  statusApproved: string;
  statusDeclined: string;
  inventoryLabel: string;
  itemSingular: string;
  itemPlural: string;
  inventorySubtitle: string;
}

export type TermKey = keyof Terms;

/** Tipo di appuntamento dello studio (company_appointment_types). */
export interface AppointmentType {
  id: string;
  key: string;
  label: string;
  color: string;
  durationMinutes: number;
  position: number;
  archivedAt: string | null;
}

/** Ruolo personalizzato (company_roles): permessi scelti dal catalogo. */
export interface CustomRole {
  id: string;
  key: string;
  label: string;
  permissions: string[];
}

/** Preset di settore (vertical_templates, ultima versione). */
export interface VerticalTemplateSummary {
  key: string;
  version: number;
  label: string;
  description: string;
}
