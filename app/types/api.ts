// Contratto condiviso UI ↔ API per l'integrazione con il database (Supabase + Drizzle).
// Tutte le route rispondono con ApiResult<T>. Errori comuni:
//   401 { success:false, error:"UNAUTHORIZED" }  → utente non loggato (redirect a /login)
//   409 { success:false, error:"NO_COMPANY" }    → utente senza studio (redirect a /onboarding)
// Tutti gli id delle entità sono UUID string.

import type { CalendarEventData, EventSource, ReminderData, ReminderPriority, ReminderStatus } from "./calendar";
import type { Task, ColumnId, TaskPriority } from "./maintenance";
import type { ChatListItem, Message, MessageFrom } from "./messaging";
import type { Quote, QuoteStatus } from "./quotes";
import type { Patient } from "./patients";

export type { ApiResult } from "./calendar-sync";

export const API_ERROR = { UNAUTHORIZED: "UNAUTHORIZED", NO_COMPANY: "NO_COMPANY" } as const;

// ─── Sessione & onboarding ──────────────────────────────────────────────────
// GET  /api/me                → MeResponse
// POST /api/onboarding        body OnboardingInput → MeResponse["company"]
// Login/registrazione: client Supabase lato browser (lib/supabase/client.ts),
// conferma email su GET /auth/callback?code=... → redirect "/".
export type CompanyRole = "owner" | "admin" | "member";
export interface MeResponse {
  user: { id: string; email: string | null };
  company: { id: string; name: string; slug: string; role: CompanyRole } | null;
}
export interface OnboardingInput {
  name: string;
  /** Popola lo studio con i dati demo (app/data/*) */
  seedDemo: boolean;
}

// ─── Agenda (eventi salvati su DB; quelli Google/Apple sono importati via sync) ──
// GET    /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD → CalendarEventData[]
// POST   /api/calendar/events      body CreateCalendarEventInput → CalendarEventData
//        (source Google/Apple: crea prima sul calendario esterno, poi salva su DB)
// DELETE /api/calendar/events/[id] → null (se esterno elimina anche sul provider)
// POST   /api/calendar/sync        body { from, to } → SyncResult
// GET    /api/calendar/status      → SyncStatusResponse (app/types/calendar-sync.ts)
// GET    /api/calendar/google/connect (redirect OAuth) | DELETE → disconnette
// POST   /api/calendar/apple/connect body AppleConnectInput → ProviderStatus | DELETE
export interface CreateCalendarEventInput {
  title: string;
  description?: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
  source: EventSource;
}
export interface SyncResult {
  imported: number;
  removed: number;
  errors: Partial<Record<"google" | "apple", string>>;
}
export interface AppleConnectInput {
  appleId: string;
  appPassword: string;
  calendarName?: string;
}

// ─── Promemoria ─────────────────────────────────────────────────────────────
// GET   /api/reminders → ReminderData[]
// POST  /api/reminders body { text, time: "HH:mm", priority } → ReminderData
// PATCH /api/reminders/[id] body { status } → ReminderData
export interface CreateReminderInput { text: string; time: string; priority: ReminderPriority }
export interface UpdateReminderInput { status: ReminderStatus }

// ─── Attività (kanban) ──────────────────────────────────────────────────────
// GET    /api/tasks → BoardTask[]   (le colonne/colori restano costanti UI)
// POST   /api/tasks body CreateTaskInput → BoardTask
// PATCH  /api/tasks/[id] body UpdateTaskInput → BoardTask
// DELETE /api/tasks/[id] → null
export interface BoardTask extends Task { columnId: ColumnId; position: number }
export interface CreateTaskInput {
  title: string; description?: string; priority: TaskPriority; columnId: ColumnId; assignedTo?: string;
}
export type UpdateTaskInput = Partial<CreateTaskInput & { position: number }>;

// ─── Chat ───────────────────────────────────────────────────────────────────
// GET  /api/conversations → ChatListItem[]
// GET  /api/conversations/[id]/messages → Message[]
// POST /api/conversations/[id]/messages body { from, text } → Message
// POST /api/conversations/[id]/read → null (azzera unread)
export interface CreateMessageInput { from: MessageFrom; text: string }

// ─── Preventivi ─────────────────────────────────────────────────────────────
// GET    /api/quotes → Quote[]
// POST   /api/quotes body CreateQuoteInput → Quote
// PATCH  /api/quotes/[id] body Partial<CreateQuoteInput & { status: QuoteStatus }> → Quote
// DELETE /api/quotes/[id] → null
export interface CreateQuoteInput {
  client: string; type: string; amount: number; description?: string; date?: string;
}

// ─── Pazienti ───────────────────────────────────────────────────────────────
// GET   /api/patients → Patient[]
// GET   /api/patients/[id] → Patient
// POST  /api/patients body CreatePatientInput → Patient
// PATCH /api/patients/[id] body Partial<CreatePatientInput> → Patient
export type CreatePatientInput = Omit<Patient, "id" | "age" | "initials">;
