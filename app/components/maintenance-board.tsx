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
          <h2 className="text-sm font-semibold text-slate-900">Attività Cliniche & Studio</h2>
          <p className="text-xs text-slate-500">Kanban operativo: sterilizzazione, recall e lab</p>
        </div>
        <button className="text-xs font-semibold text-blue-500 hover:text-blue-600 transition-colors">
          + Aggiungi attività
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
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: accent }} />
              <span className="text-xs font-bold text-slate-900">{col}</span>
              <span
                className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full [background-color:var(--badge-bg-soft)]"
                style={{ 
                  ["--badge-bg-soft" as any]: `${accent}25`,
                  color: accent 
                }}
              >
                {tasks.length}
              </span>
            </div>

            {/* Task Cards */}
            {tasks.map((t, i) => {
              const prioMeta = t.priority === "high" 
                ? { label: "Alta", bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" }
                : t.priority === "medium"
                ? { label: "Media", bg: "#fef3c7", text: "#92400e", border: "#fcd34d" }
                : { label: "Bassa", bg: "#dcfce7", text: "#166534", border: "#86efac" };

              return (
                <div
                  key={i}
                  className="bg-white rounded-xl p-3 cursor-pointer border border-slate-300 shadow-2xs hover:border-slate-400 hover:shadow-xs transition-all"
                >
                  <p className="text-xs font-semibold leading-snug mb-2.5 text-slate-900">{t.title}</p>
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-md border"
                      style={{ 
                        backgroundColor: prioMeta.bg,
                        color: prioMeta.text,
                        borderColor: prioMeta.border
                      }}
                    >
                      {prioMeta.label}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-medium text-slate-600">
                      {t.ai ? (
                        <>
                          <Bot size={12} className="text-blue-600" />
                          <span className="text-blue-600 font-bold">AI Studio</span>
                        </>
                      ) : (
                        <>
                          <User size={12} className="text-slate-600" />
                          <span className="text-slate-700 font-semibold">Staff</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}

          </div>
        ))}
      </div>
    </div>
  );
}