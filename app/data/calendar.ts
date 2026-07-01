import type { CalendarEventData, ReminderData, MonthCell } from "@/app/types/calendar";

export const MONTH_LABEL = "July 2026";

export const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const MONTH_GRID: MonthCell[] = [
  { dateNum: 29, inMonth: false, isToday: false },
  { dateNum: 30, inMonth: false, isToday: false },
  { dateNum: 1, inMonth: true, isToday: true },
  { dateNum: 2, inMonth: true, isToday: false },
  { dateNum: 3, inMonth: true, isToday: false },
  { dateNum: 4, inMonth: true, isToday: false },
  { dateNum: 5, inMonth: true, isToday: false },
  { dateNum: 6, inMonth: true, isToday: false },
  { dateNum: 7, inMonth: true, isToday: false },
  { dateNum: 8, inMonth: true, isToday: false },
  { dateNum: 9, inMonth: true, isToday: false },
  { dateNum: 10, inMonth: true, isToday: false },
  { dateNum: 11, inMonth: true, isToday: false },
  { dateNum: 12, inMonth: true, isToday: false },
  { dateNum: 13, inMonth: true, isToday: false },
  { dateNum: 14, inMonth: true, isToday: false },
  { dateNum: 15, inMonth: true, isToday: false },
  { dateNum: 16, inMonth: true, isToday: false },
  { dateNum: 17, inMonth: true, isToday: false },
  { dateNum: 18, inMonth: true, isToday: false },
  { dateNum: 19, inMonth: true, isToday: false },
  { dateNum: 20, inMonth: true, isToday: false },
  { dateNum: 21, inMonth: true, isToday: false },
  { dateNum: 22, inMonth: true, isToday: false },
  { dateNum: 23, inMonth: true, isToday: false },
  { dateNum: 24, inMonth: true, isToday: false },
  { dateNum: 25, inMonth: true, isToday: false },
  { dateNum: 26, inMonth: true, isToday: false },
  { dateNum: 27, inMonth: true, isToday: false },
  { dateNum: 28, inMonth: true, isToday: false },
  { dateNum: 29, inMonth: true, isToday: false },
  { dateNum: 30, inMonth: true, isToday: false },
  { dateNum: 31, inMonth: true, isToday: false },
  { dateNum: 1, inMonth: false, isToday: false },
  { dateNum: 2, inMonth: false, isToday: false },
];

export const INITIAL_EVENTS: CalendarEventData[] = [
  { id: 1, title: "Boiler check — Rossi", time: "09:00", dateNum: 1, color: "#3b82f6", source: "Google Calendar", description: "On-site boiler inspection requested via WhatsApp.", isAiGenerated: false },
  { id: 2, title: "Client meeting", time: "15:00", dateNum: 1, color: "#8b5cf6", source: "Manual", description: "Quarterly review with Conti family.", isAiGenerated: false },
  { id: 3, title: "Bianchi — Plumbing", time: "11:00", dateNum: 2, color: "#10b981", source: "AI Secretary", description: "Auto-scheduled by SegretarIA after WhatsApp confirmation from Bianchi.", isAiGenerated: true },
  { id: 4, title: "Team sync", time: "09:00", dateNum: 3, color: "#8b5cf6", source: "Apple Calendar", description: "Weekly internal alignment call.", isAiGenerated: false },
  { id: 5, title: "Conti follow-up", time: "13:00", dateNum: 3, color: "#10b981", source: "AI Secretary", description: "Follow-up quote reminder sent automatically, awaiting client reply.", isAiGenerated: true },
  { id: 6, title: "Electrician — Via Roma", time: "10:00", dateNum: 6, color: "#3b82f6", source: "Google Calendar", description: "Rewiring job, third floor apartment.", isAiGenerated: false },
  { id: 7, title: "Quote call — Greco", time: "14:30", dateNum: 8, color: "#10b981", source: "AI Secretary", description: "Call auto-booked by the AI agent to discuss the carpentry quote.", isAiGenerated: true },
  { id: 8, title: "Annual boiler inspection", time: "09:30", dateNum: 14, color: "#f59e0b", source: "Manual", description: "Recurring compliance inspection, manually scheduled.", isAiGenerated: false },
  { id: 9, title: "Painter — Vitali", time: "16:00", dateNum: 21, color: "#10b981", source: "AI Secretary", description: "Appointment confirmed automatically after quote approval.", isAiGenerated: true },
];

export const INITIAL_REMINDERS: ReminderData[] = [
  { id: 1, text: "Boiler pressure sensor offline — Via Roma 12", time: "08:15", priority: "high", status: "active" },
  { id: 2, text: "Call back Marco Rossi — plumbing quote", time: "10:00", priority: "high", status: "active" },
  { id: 3, text: "Send invoice reminder — Client #47", time: "12:00", priority: "medium", status: "active" },
  { id: 4, text: "Annual boiler inspection due in 3 days", time: "15:30", priority: "medium", status: "active" },
  { id: 5, text: "Renew Google Calendar sync token", time: "09:00", priority: "low", status: "resolved" },
  { id: 6, text: "Archive completed maintenance ticket #212", time: "—", priority: "low", status: "active" },
];
