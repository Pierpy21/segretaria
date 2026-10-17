"use client";

import { useState, type FormEvent } from "react";
import { Plus, X, Bot, User, Trash2, GripVertical, Filter, LoaderCircle } from "lucide-react";
import { BOARD_COLUMNS, PRIORITY_COLOR } from "@/app/constants/maintenance";
import { apiFetch } from "@/app/lib/api-client";
import { useApiData } from "@/app/hooks/use-api-data";
import { refreshBadges } from "@/app/hooks/use-sidebar-badges";
import { Skeleton, ErrorState } from "@/app/components/ui/async-state";
import AssetSelect from "@/app/components/modules/asset-select";
import type { TaskPriority, ColumnId, FilterSource } from "@/app/types/maintenance";
import type { BoardTask, CreateTaskInput, UpdateTaskInput } from "@/app/types/api";

interface NewTaskForm {
  title: string;
  description: string;
  priority: TaskPriority;
  assignedTo: string;
  assetId: string;
}

const EMPTY_FORM: NewTaskForm = { title: "", description: "", priority: "medium", assignedTo: "", assetId: "" };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Operazione non riuscita. Riprova.";
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function MaintenancePage() {
  const tasksHook = useApiData<BoardTask[]>("/api/tasks");
  const tasks = tasksHook.data ?? [];

  const [filterSource, setFilterSource] = useState<FilterSource>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [form, setForm] = useState<NewTaskForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedTask = tasks.find(t => t.id === selectedTaskId) ?? null;

  function tasksIn(columnId: ColumnId): BoardTask[] {
    return tasks.filter(t => t.columnId === columnId).sort((a, b) => a.position - b.position);
  }

  // Sposta in fondo alla colonna di destinazione (update ottimistico, rollback su errore)
  async function moveTask(task: BoardTask, columnId: ColumnId) {
    if (task.columnId === columnId) return;
    const position = tasksIn(columnId).length;
    setActionError(null);
    setSelectedTaskId(null);
    tasksHook.mutate(list => (list ?? []).map(t => (t.id === task.id ? { ...t, columnId, position } : t)));
    try {
      const body: UpdateTaskInput = { columnId, position };
      const updated = await apiFetch<BoardTask>(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      tasksHook.mutate(list => (list ?? []).map(t => (t.id === task.id ? updated : t)));
      refreshBadges();
    } catch (err) {
      tasksHook.mutate(list =>
        (list ?? []).map(t => (t.id === task.id ? { ...t, columnId: task.columnId, position: task.position } : t))
      );
      setActionError(errorMessage(err));
    }
  }

  // Eliminazione ottimistica con ripristino su errore
  async function deleteTask(task: BoardTask) {
    setActionError(null);
    setSelectedTaskId(null);
    tasksHook.mutate(list => (list ?? []).filter(t => t.id !== task.id));
    try {
      await apiFetch<null>(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
      refreshBadges();
    } catch (err) {
      tasksHook.mutate(list => [...(list ?? []), task]);
      setActionError(errorMessage(err));
    }
  }

  async function submitNewTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) {
      setFormError("Inserisci il titolo dell'attività.");
      return;
    }
    const body: CreateTaskInput = {
      title,
      description: form.description.trim() || undefined,
      priority: form.priority,
      columnId: "todo",
      assignedTo: form.assignedTo.trim() || undefined,
      assetId: form.assetId || undefined,
    };
    setFormError(null);
    setSubmitting(true);
    try {
      const created = await apiFetch<BoardTask>("/api/tasks", { method: "POST", body: JSON.stringify(body) });
      tasksHook.mutate(list => [...(list ?? []), created]);
      refreshBadges();
      setForm(EMPTY_FORM);
      setShowNewModal(false);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const allTasksCount = tasks.length;
  const aiTasksCount = tasks.filter(t => t.ai).length;
  const humanTasksCount = allTasksCount - aiTasksCount;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-surface rounded-2xl border border-line p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Attività Cliniche & Studio</h2>
            <p className="text-xs text-ink-muted">Kanban operativo: sterilizzazione, laboratorio odontotecnico, recall e forniture</p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-accent-ink bg-accent hover:bg-accent-hover transition-colors"
          >
            <Plus size={13} /> Aggiungi Attività
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase text-ink-muted mb-1">Totale</p>
            <p className="text-lg font-bold text-ink">{allTasksCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-ink-muted mb-1">Task AI</p>
            <p className="text-lg font-bold text-emerald-700">{aiTasksCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-ink-muted mb-1">Personale Studio</p>
            <p className="text-lg font-bold text-ink">{humanTasksCount}</p>
          </div>
        </div>
      </div>

      {actionError && <ErrorState message={actionError} />}

      {/* Filter bar */}
      <div className="flex gap-2">
        {(["all", "ai", "human"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilterSource(f)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
              ${filterSource === f
                ? "bg-accent text-accent-ink"
                : "bg-surface border border-line text-ink-muted hover:bg-surface-muted"
              }`}
          >
            <Filter size={12} />
            {f === "all" ? "Tutte le Attività" : f === "ai" ? "Solo AI" : "Solo Personale"}
          </button>
        ))}
      </div>

      {tasksHook.error && <ErrorState message="Impossibile caricare le attività." onRetry={tasksHook.reload} />}

      {/* Kanban board */}
      {tasksHook.loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {BOARD_COLUMNS.map(col => (
            <Skeleton key={col.id} className="h-64" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {BOARD_COLUMNS.map(meta => {
            const all = tasksIn(meta.id);
            const filtered =
              filterSource === "all" ? all : filterSource === "ai" ? all.filter(t => t.ai) : all.filter(t => !t.ai);
            return (
              <div
                key={meta.id}
                onDragOver={e => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={e => {
                  e.preventDefault();
                  const task = tasks.find(t => t.id === draggedTaskId);
                  setDraggedTaskId(null);
                  if (task) void moveTask(task, meta.id);
                }}
                className={`rounded-2xl border-2 flex flex-col overflow-hidden transition-colors ${
                  draggedTaskId ? "border-accent-soft" : "border-line"
                }`}
                style={{ backgroundColor: meta.bg }}
              >
                {/* Column header */}
                <div className="px-4 py-3 border-b border-line bg-surface">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.accent }} />
                    <span className="text-xs font-bold text-ink">{meta.name}</span>
                    <span
                      className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${meta.accent}20`, color: meta.accent }}
                    >
                      {filtered.length}
                    </span>
                  </div>
                </div>

                {/* Tasks */}
                <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-[520px]">
                  {filtered.length === 0 ? (
                    <p className="text-[10px] text-ink-muted italic py-2">Nessun task.</p>
                  ) : (
                    filtered.map(task => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => setDraggedTaskId(task.id)}
                        onDragEnd={() => setDraggedTaskId(null)}
                        onClick={() => setSelectedTaskId(task.id)}
                        className={`w-full bg-surface rounded-xl p-3 border text-left cursor-grab active:cursor-grabbing transition-all
                          ${draggedTaskId === task.id ? "opacity-50 border-accent-soft" : "border-line hover:border-line-strong hover:shadow-sm"}`}
                      >
                        <div className="flex items-start gap-2 mb-2">
                          <GripVertical size={12} className="mt-0.5 text-ink-muted flex-shrink-0" />
                          <p className="text-[11px] font-medium text-ink flex-1 leading-tight">{task.title}</p>
                        </div>
                        <div className="flex items-center justify-between ml-5">
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: `${PRIORITY_COLOR[task.priority]}18`, color: PRIORITY_COLOR[task.priority] }}
                          >
                            {task.priority}
                          </span>
                          <span className="flex items-center gap-1 text-[9px] text-ink-muted">
                            {task.ai ? (
                              <>
                                <Bot size={10} className="text-emerald-700" />
                                <span className="text-emerald-700 font-semibold">AI</span>
                              </>
                            ) : (
                              <>
                                <User size={10} className="text-ink-muted" />
                                <span>Human</span>
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Task detail panel */}
      {selectedTask && (
        <div className="bg-surface rounded-2xl border border-line p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-ink">{selectedTask.title}</h3>
                {selectedTask.ai && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800">
                    <Bot size={8} /> AI Generated
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => setSelectedTaskId(null)} className="p-1 rounded-lg text-ink-muted hover:bg-surface-muted" aria-label="Chiudi dettaglio">
              <X size={14} />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase text-ink-muted mb-1">Descrizione</p>
              <p className="text-xs text-ink-muted">{selectedTask.description || "Nessuna descrizione fornita."}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase text-ink-muted mb-1">Priorità</p>
                <span
                  className="inline-flex text-xs font-bold px-2 py-1 rounded-lg"
                  style={{ backgroundColor: `${PRIORITY_COLOR[selectedTask.priority]}18`, color: PRIORITY_COLOR[selectedTask.priority] }}
                >
                  {selectedTask.priority}
                </span>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-ink-muted mb-1">Origine</p>
                <p className="text-xs font-semibold text-ink">{selectedTask.ai ? "AI" : "Manuale"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-ink-muted mb-1">Assegnato a</p>
                <p className="text-xs font-semibold text-ink">{selectedTask.assignedTo ?? "—"}</p>
              </div>
            </div>

            {/* Move task buttons */}
            <div>
              <p className="text-[10px] font-bold uppercase text-ink-muted mb-2">Sposta in</p>
              <div className="grid grid-cols-3 gap-2">
                {BOARD_COLUMNS.map(col => (
                  <button
                    key={col.id}
                    onClick={() => void moveTask(selectedTask, col.id)}
                    disabled={col.id === selectedTask.columnId}
                    className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors
                      ${col.id === selectedTask.columnId
                        ? "bg-surface-muted text-ink-muted cursor-not-allowed"
                        : "bg-surface border border-line text-ink-muted hover:bg-surface-muted"
                      }`}
                  >
                    {col.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Delete button */}
            <button
              onClick={() => void deleteTask(selectedTask)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-800 bg-red-50 border border-red-200 hover:bg-red-100"
            >
              <Trash2 size={12} /> Elimina Attività
            </button>
          </div>
        </div>
      )}

      {/* New task modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-sidebar/40 flex items-center justify-center p-4">
          <form onSubmit={submitNewTask} className="bg-surface rounded-2xl border border-line w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-ink">Nuova Attività Studio</p>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="p-1 rounded-lg text-ink-muted hover:bg-surface-muted"
                aria-label="Chiudi"
              >
                <X size={15} />
              </button>
            </div>
            <div className="space-y-2.5">
              <input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Titolo attività (es. Test spore autoclave, Ordine compositi)"
                className="w-full rounded-xl px-3 py-2 text-sm text-ink bg-surface-muted border border-line outline-none focus:border-accent"
              />
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Descrizione e dettagli operativi (opzionale)"
                rows={3}
                className="w-full rounded-xl px-3 py-2 text-sm text-ink bg-surface-muted border border-line outline-none focus:border-accent resize-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={form.priority}
                  onChange={e => setForm({ ...form, priority: e.target.value as TaskPriority })}
                  className="rounded-xl px-3 py-2 text-sm text-ink bg-surface-muted border border-line outline-none focus:border-accent"
                >
                  <option value="high">Priorità Alta</option>
                  <option value="medium">Priorità Media</option>
                  <option value="low">Priorità Bassa</option>
                </select>
                <input
                  value={form.assignedTo}
                  onChange={e => setForm({ ...form, assignedTo: e.target.value })}
                  placeholder="Assegnato a"
                  className="rounded-xl px-3 py-2 text-sm text-ink bg-surface-muted border border-line outline-none focus:border-accent"
                />
              </div>
              <AssetSelect value={form.assetId} onChange={assetId => setForm({ ...form, assetId })} />
            </div>
            {formError && <p className="mt-3 text-xs font-semibold text-red-800">{formError}</p>}
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-ink-muted bg-surface border border-line hover:bg-surface-muted"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-accent-ink bg-accent hover:bg-accent-hover disabled:opacity-60"
              >
                {submitting && <LoaderCircle size={12} className="animate-spin" />}
                Salva Attività
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
