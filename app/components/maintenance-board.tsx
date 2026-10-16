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

export default function MaintenanceBoard({ boardData }: MaintenanceBoardProps) {
  return (
    <div className="bg-surface rounded-2xl overflow-hidden flex flex-col border border-line">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink">Attività Cliniche & Studio</h2>
          <p className="text-xs text-ink-muted">Kanban operativo: sterilizzazione, recall e lab</p>
        </div>
        <button className="text-xs font-semibold text-accent-text hover:text-ink transition-colors">
          + Aggiungi attività
        </button>
      </div>


      {/* Board Grid */}
      <div className="flex-1 grid grid-cols-3 min-h-[220px]">
        {boardData.map(({ col, accent, bg, tasks }) => (
          <div
            key={col}
            className="p-3 flex flex-col gap-2 border-r border-line last:border-r-0 [background-color:var(--col-bg)]"
            style={{ ["--col-bg" as string]: bg }}
          >
            {/* Column Header */}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: accent }} />
              <span className="text-xs font-bold text-ink">{col}</span>
              <span
                className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full [background-color:var(--badge-bg-soft)]"
                style={{
                  ["--badge-bg-soft" as string]: `${accent}25`,
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
                  className="bg-surface rounded-xl p-3 cursor-pointer border border-line-strong shadow-2xs hover:border-ink-muted hover:shadow-xs transition-all"
                >
                  <p className="text-xs font-semibold leading-snug mb-2.5 text-ink">{t.title}</p>
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
                    <span className="flex items-center gap-1 text-[10px] font-medium text-ink-muted">
                      {t.ai ? (
                        <>
                          <Bot size={12} className="text-accent-text" />
                          <span className="text-accent-text font-bold">AI Studio</span>
                        </>
                      ) : (
                        <>
                          <User size={12} className="text-ink-muted" />
                          <span className="text-ink font-semibold">Staff</span>
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
