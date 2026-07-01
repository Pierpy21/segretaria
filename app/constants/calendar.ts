import { Calendar, Cloud, Clock, Bot } from "lucide-react";
import type { EventSource, ReminderPriority } from "@/app/types/calendar";

export const PRIORITY_COLOR: Record<ReminderPriority, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#10b981",
};

export const SOURCE_META: Record<EventSource, { icon: typeof Calendar; dot: string }> = {
  "Google Calendar": { icon: Calendar, dot: "#3b82f6" },
  "Apple Calendar": { icon: Cloud, dot: "#1e293b" },
  "Manual": { icon: Clock, dot: "#64748b" },
  "AI Secretary": { icon: Bot, dot: "#10b981" },
};
