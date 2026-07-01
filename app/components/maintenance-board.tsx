import { Bot, User } from "lucide-react";
import type { Task, TaskPriority } from "@/app/types/maintenance";

interface KanbanColumn {
  col: string;
  accent: string;
  bg: string;
  tasks: Omit<Task, "id" | "description" | "assignedTo">[];
}

interface MaintenanceBoardProps {
  boardData: KanbanColumn[];
  priorityColor: Record<TaskPriority, string>;
}

export default function MaintenanceBoard({ boardData, priorityColor }: MaintenanceBoardProps) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden flex flex-col border border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Maintenance & Tasks</h2>
          <p className="text-xs text-slate-500">AI-generated task board</p>
        </div>
        <button className="text-xs font-semibold text-blue-500 hover:text-blue-600 transition-colors">
          + Add task
        </button>
      </div>

      {/* Board Grid */}
      <div className="flex-1 grid grid-cols-3 min-h-[220px]">
        {boardData.map(({ col, accent, bg, tasks }) => (
          <div
            key={col}
            className="p-3 flex flex-col gap-2 border-r border-slate-200 last:border-r-0 [background-color:var(--col-bg)]"
            style={{ ["--col-bg" as any]: bg }}
          >
            {/* Column Header */}
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
              <span className="text-xs font-bold text-slate-700">{col}</span>
              <span
                className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full [background-color:var(--badge-bg-soft)]"
                style={{ 
                  ["--badge-bg-soft" as any]: `${accent}20`,
                  color: accent 
                }}
              >
                {tasks.length}
              </span>
            </div>

            {/* Task Cards */}
            {tasks.map((t, i) => (
              <div
                key={i}
                className="bg-white rounded-xl p-3 cursor-pointer border border-slate-200 transition-shadow hover:shadow-sm"
              >
                <p className="text-[11px] font-medium leading-snug mb-2.5 text-slate-900">{t.title}</p>
                <div className="flex items-center justify-between">
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full [background-color:var(--prio-soft-bg)]"
                    style={{ 
                      ["--prio-soft-bg" as any]: `${priorityColor[t.priority]}18`, 
                      color: priorityColor[t.priority] 
                    }}
                  >
                    {t.priority}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-slate-400">
                    {t.ai ? (
                      <>
                        <Bot size={11} className="text-blue-500" />
                        <span className="text-blue-500">AI</span>
                      </>
                    ) : (
                      <>
                        <User size={11} className="text-slate-500" />
                        <span className="text-slate-500">Human</span>
                      </>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}