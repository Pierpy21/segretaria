"use client";

import { useState } from "react";
import { Plus, X, Bot, User, Trash2, GripVertical, Filter } from "lucide-react";
import { INITIAL_COLUMNS, PRIORITY_COLOR } from "@/app/data/maintenance";
import type { TaskPriority, ColumnId, FilterSource, Task, Column } from "@/app/types/maintenance";

let nextTaskId = 8;

// ─── Component ──────────────────────────────────────────────────────────────

export default function MaintenancePage() {
  const [columns, setColumns] = useState<Column[]>(INITIAL_COLUMNS);
  const [filterSource, setFilterSource] = useState<FilterSource>("all");
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<{ task: Task; columnId: ColumnId } | null>(null);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium" as TaskPriority, isAi: false });
  const [draggedTask, setDraggedTask] = useState<{ taskId: number; fromColId: ColumnId } | null>(null);

  function moveTask(taskId: number, fromColId: ColumnId, toColId: ColumnId) {
    const task = columns.find(c => c.id === fromColId)?.tasks.find(t => t.id === taskId);
    if (!task) return;

    setColumns(prev =>
      prev.map(col => {
        if (col.id === fromColId) {
          return { ...col, tasks: col.tasks.filter(t => t.id !== taskId) };
        }
        if (col.id === toColId) {
          return { ...col, tasks: [...col.tasks, task] };
        }
        return col;
      })
    );
    setSelectedTask(null);
  }

  function handleDragStart(taskId: number, colId: ColumnId) {
    setDraggedTask({ taskId, fromColId: colId });
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent, toColId: ColumnId) {
    e.preventDefault();
    if (draggedTask) {
      if (draggedTask.fromColId !== toColId) {
        moveTask(draggedTask.taskId, draggedTask.fromColId, toColId);
      }
      setDraggedTask(null);
    }
  }

  function deleteTask(taskId: number, colId: ColumnId) {
    setColumns(prev =>
      prev.map(col => (col.id === colId ? { ...col, tasks: col.tasks.filter(t => t.id !== taskId) } : col))
    );
    setSelectedTask(null);
  }

  function submitNewTask() {
    if (!form.title.trim()) return;
    const newTask: Task = {
      id: nextTaskId++,
      title: form.title.trim(),
      description: form.description.trim() || "Nessuna descrizione fornita.",
      priority: form.priority,
      ai: form.isAi,
      assignedTo: form.isAi ? "AI Secretary" : "Carlo",
    };
    setColumns(prev =>
      prev.map(col => (col.id === "todo" ? { ...col, tasks: [newTask, ...col.tasks] } : col))
    );
    setForm({ title: "", description: "", priority: "medium", isAi: false });
    setShowNewModal(false);
  }

  const allTasksCount = columns.reduce((sum, col) => sum + col.tasks.length, 0);
  const aiTasksCount = columns.reduce((sum, col) => sum + col.tasks.filter(t => t.ai).length, 0);
  const humanTasksCount = allTasksCount - aiTasksCount;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Maintenance & Tasks</h2>
            <p className="text-xs text-slate-500">Kanban board with AI-generated and manual tasks</p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            <Plus size={13} /> Add Task
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Total</p>
            <p className="text-lg font-bold text-slate-900">{allTasksCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">AI Tasks</p>
            <p className="text-lg font-bold text-emerald-600">{aiTasksCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Manual</p>
            <p className="text-lg font-bold text-slate-900">{humanTasksCount}</p>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2">
        {(["all", "ai", "human"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilterSource(f)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
              ${filterSource === f
                ? "bg-blue-600 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
          >
            <Filter size={12} />
            {f === "all" ? "All Tasks" : f === "ai" ? "AI Only" : "Manual Only"}
          </button>
        ))}
      </div>

      {/* Kanban board */}
      <div className="grid grid-cols-3 gap-4">
        {columns.map(col => {
          const filtered =
            filterSource === "all" ? col.tasks : filterSource === "ai" ? col.tasks.filter(t => t.ai) : col.tasks.filter(t => !t.ai);
          return (
            <div
              key={col.id}
              onDragOver={handleDragOver}
              onDrop={e => handleDrop(e, col.id)}
              className={`rounded-2xl border-2 flex flex-col overflow-hidden transition-colors ${
                draggedTask ? "border-blue-300" : "border-slate-200"
              }`}
              style={{ backgroundColor: col.bg }}
            >
              {/* Column header */}
              <div className="px-4 py-3 border-b border-slate-200 bg-white">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.accent }} />
                  <span className="text-xs font-bold text-slate-700">{col.name}</span>
                  <span
                    className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${col.accent}20`, color: col.accent }}
                  >
                    {filtered.length}
                  </span>
                </div>
              </div>

              {/* Tasks */}
              <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-[520px]">
                {filtered.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic py-2">Nessun task.</p>
                ) : (
                  filtered.map(task => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => handleDragStart(task.id, col.id)}
                      onClick={() => setSelectedTask({ task, columnId: col.id })}
                      className={`w-full bg-white rounded-xl p-3 border text-left cursor-grab active:cursor-grabbing transition-all
                        ${draggedTask?.taskId === task.id ? "opacity-50 border-blue-400" : "border-slate-200 hover:border-slate-300 hover:shadow-sm"}`}
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <GripVertical size={12} className="mt-0.5 text-slate-400 flex-shrink-0" />
                        <p className="text-[11px] font-medium text-slate-900 flex-1 leading-tight">{task.title}</p>
                      </div>
                      <div className="flex items-center justify-between ml-5">
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: `${PRIORITY_COLOR[task.priority]}18`, color: PRIORITY_COLOR[task.priority] }}
                        >
                          {task.priority}
                        </span>
                        <span className="flex items-center gap-1 text-[9px] text-slate-500">
                          {task.ai ? (
                            <>
                              <Bot size={10} className="text-emerald-600" />
                              <span className="text-emerald-600 font-semibold">AI</span>
                            </>
                          ) : (
                            <>
                              <User size={10} className="text-slate-500" />
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

      {/* Task detail panel */}
      {selectedTask && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-slate-900">{selectedTask.task.title}</h3>
                {selectedTask.task.ai && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                    <Bot size={8} /> AI Generated
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">ID: {selectedTask.task.id}</p>
            </div>
            <button onClick={() => setSelectedTask(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
              <X size={14} />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Description</p>
              <p className="text-xs text-slate-600">{selectedTask.task.description}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Priority</p>
                <span
                  className="inline-flex text-xs font-bold px-2 py-1 rounded-lg"
                  style={{ backgroundColor: `${PRIORITY_COLOR[selectedTask.task.priority]}18`, color: PRIORITY_COLOR[selectedTask.task.priority] }}
                >
                  {selectedTask.task.priority}
                </span>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Source</p>
                <p className="text-xs font-semibold text-slate-700">{selectedTask.task.ai ? "AI" : "Manual"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Assigned to</p>
                <p className="text-xs font-semibold text-slate-700">{selectedTask.task.assignedTo}</p>
              </div>
            </div>

            {/* Move task buttons */}
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Move to</p>
              <div className="grid grid-cols-3 gap-2">
                {columns.map(col => (
                  <button
                    key={col.id}
                    onClick={() => moveTask(selectedTask.task.id, selectedTask.columnId, col.id)}
                    disabled={col.id === selectedTask.columnId}
                    className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors
                      ${col.id === selectedTask.columnId
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                  >
                    {col.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Delete button */}
            <button
              onClick={() => deleteTask(selectedTask.task.id, selectedTask.columnId)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100"
            >
              <Trash2 size={12} /> Delete Task
            </button>
          </div>
        </div>
      )}

      {/* New task modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-900">Create New Task</p>
              <button onClick={() => setShowNewModal(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                <X size={15} />
              </button>
            </div>
            <div className="space-y-2.5">
              <input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Task title"
                className="w-full rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:border-blue-500"
              />
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Description (optional)"
                rows={3}
                className="w-full rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 resize-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={form.priority}
                  onChange={e => setForm({ ...form, priority: e.target.value as TaskPriority })}
                  className="rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:border-blue-500"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={form.isAi}
                    onChange={e => setForm({ ...form, isAi: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-slate-700">AI Generated</span>
                </label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setShowNewModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={submitNewTask}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700"
              >
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
