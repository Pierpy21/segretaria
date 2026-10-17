export type ViewMode = "Month" | "Week" | "Day";
export type ConnectionStatus = "connected" | "disconnected" | "syncing";
export type EventSource = "Google Calendar" | "Apple Calendar" | "Manual" | "AI Secretary";
export type ReminderPriority = "high" | "medium" | "low";
export type ReminderStatus = "active" | "resolved" | "archived";

export interface CalendarEvent {
  title: string;
  time: string;
  color: string;
}

export interface WeekDay {
  day: string;
  date: string;
  today: boolean;
  events: CalendarEvent[];
}

export interface ReminderItem {
  text: string;
  time: string;
  priority: ReminderPriority;
}

export interface CalendarEventData {
  /** UUID della riga su DB */
  id: string;
  title: string;
  /** Data YYYY-MM-DD */
  date: string;
  /** "HH:mm" oppure "Tutto il giorno" */
  time: string;
  endTime?: string;
  color: string;
  source: EventSource;
  description: string;
  isAiGenerated: boolean;
  /** ID esterno (Google event id / CalDAV href) per eventi sincronizzati */
  externalId?: string;
  /** Bene del cliente collegato */
  assetId?: string | null;
}

export interface ReminderData {
  id: string;
  text: string;
  time: string;
  priority: ReminderPriority;
  status: ReminderStatus;
}

export interface MonthCell {
  /** Data YYYY-MM-DD */
  date: string;
  dateNum: number;
  inMonth: boolean;
  isToday: boolean;
}

