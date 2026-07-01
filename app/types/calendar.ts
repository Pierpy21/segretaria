export type ViewMode = "Month" | "Week" | "Day";
export type ConnectionStatus = "connected" | "disconnected" | "syncing";
export type EventSource = "Google Calendar" | "Apple Calendar" | "Manual" | "AI Secretary";
export type ReminderPriority = "high" | "medium" | "low";
export type ReminderStatus = "active" | "resolved" | "archived";

export interface CalendarEventData {
  id: number;
  title: string;
  time: string;
  dateNum: number;
  color: string;
  source: EventSource;
  description: string;
  isAiGenerated: boolean;
}

export interface ReminderData {
  id: number;
  text: string;
  time: string;
  priority: ReminderPriority;
  status: ReminderStatus;
}

export interface MonthCell {
  dateNum: number;
  inMonth: boolean;
  isToday: boolean;
}
