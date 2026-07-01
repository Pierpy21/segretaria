import type { Column, TaskPriority } from "@/app/types/maintenance";

export const INITIAL_COLUMNS: Column[] = [
  {
    id: "todo",
    name: "To Do",
    accent: "#94a3b8",
    bg: "#f8fafc",
    tasks: [
      { id: 1, title: "Follow up: Marco plumbing request", priority: "high", ai: true, description: "Call Marco to confirm his availability for the emergency repair.", assignedTo: "AI Secretary" },
      { id: 2, title: "Send invoice reminder — Client #47", priority: "medium", ai: false, description: "Send follow-up invoice to Roberto Conti for the June electrical job.", assignedTo: "Carlo" },
      { id: 3, title: "Schedule annual boiler inspection", priority: "low", ai: true, description: "Book annual compliance check for Rossi family boiler (due date: Jul 15).", assignedTo: "AI Secretary" },
    ],
  },
  {
    id: "in-progress",
    name: "In Progress",
    accent: "#3b82f6",
    bg: "#eff6ff",
    tasks: [
      { id: 4, title: "Prepare quote — bathroom renovation", priority: "high", ai: false, description: "Detailed cost breakdown for Greco's bathroom renovation project.", assignedTo: "Carlo" },
      { id: 5, title: "Coordinate electrician — Via Roma 14", priority: "medium", ai: true, description: "Confirm technician arrival time with Vitali apartment residents.", assignedTo: "AI Secretary" },
    ],
  },
  {
    id: "done",
    name: "Done",
    accent: "#10b981",
    bg: "#f0fdf4",
    tasks: [
      { id: 6, title: "Book appointment: Bianchi — Jul 2", priority: "low", ai: true, description: "Appointment confirmed and sent to client via WhatsApp.", assignedTo: "AI Secretary" },
      { id: 7, title: "Confirm: Ferrarese family visit", priority: "low", ai: true, description: "Follow-up confirmation sent, client acknowledged.", assignedTo: "AI Secretary" },
    ],
  },
];

export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#10b981",
};
