import type { ColumnId, TaskPriority } from "@/app/types/maintenance";

export interface ColumnMeta {
  id: ColumnId;
  name: string;
  accent: string;
  bg: string;
}

/** Colonne del kanban (costanti UI: i task arrivano da /api/tasks) */
export const BOARD_COLUMNS: ColumnMeta[] = [
  { id: "todo", name: "Da Eseguire", accent: "#94a3b8", bg: "#f8fafc" },
  { id: "in-progress", name: "In Corso", accent: "#3b82f6", bg: "#eff6ff" },
  { id: "done", name: "Completati", accent: "#10b981", bg: "#f0fdf4" },
];

export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#10b981",
};
