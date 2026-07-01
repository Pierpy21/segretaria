export type TaskPriority = "high" | "medium" | "low";
export type ColumnId = "todo" | "in-progress" | "done";
export type FilterSource = "all" | "ai" | "human";

export interface Task {
  id: number;
  title: string;
  priority: TaskPriority;
  ai: boolean;
  description: string;
  assignedTo?: string;
}

export interface Column {
  id: ColumnId;
  name: string;
  accent: string;
  bg: string;
  tasks: Task[];
}
