"use client";

import { useState } from "react";
import {
  Calendar,
  Plus,
  X,
  Bot,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Archive,
} from "lucide-react";
import { MONTH_LABEL, DAYS_OF_WEEK, MONTH_GRID, INITIAL_EVENTS, INITIAL_REMINDERS } from "@/app/data/calendar";
import { PRIORITY_COLOR, SOURCE_META } from "@/app/constants/calendar";
import type { ViewMode, ConnectionStatus, CalendarEventData, ReminderData, EventSource, ReminderPriority } from "@/app/types/calendar";

let nextEventId = INITIAL_EVENTS.length + 1;

// ─── Component ──────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>("Month");
  const [events, setEvents] = useState<CalendarEventData[]>(INITIAL_EVENTS);
  const [reminders, setReminders] = useState<ReminderData[]>(INITIAL_REMINDERS);
  const [selectedDateNum, setSelectedDateNum] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventData | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<ConnectionStatus>("connected");
  const [appleStatus, setAppleStatus] = useState<ConnectionStatus>("disconnected");

  const [form, setForm] = useState({
    title: "",
    time: "",
    dateNum: "1",
    description: "",
    source: "Manual" as EventSource,
  });

  function eventsFor(dateNum: number) {
    return events.filter(e => e.dateNum === dateNum).sort((a, b) => a.time.localeCompare(b.time));
  }

  function openDay(dateNum: number) {
    setSelectedDateNum(dateNum);
    setView("Day");
  }

  function toggleConnection(service: "google" | "apple") {
    const status = service === "google" ? googleStatus : appleStatus;
    const setStatus = service === "google" ? setGoogleStatus : setAppleStatus;
    if (status === "syncing") return;
    if (status === "connected") {
      setStatus("disconnected");
      return;
    }
    setStatus("syncing");
    setTimeout(() => setStatus("connected"), 1400);
  }

  function toggleReminder(id: number) {
    setReminders(prev =>
      prev.map(r => (r.id === id ? { ...r, status: r.status === "active" ? "resolved" : "active" } : r))
    );
  }

  function archiveReminder(id: number) {
    setReminders(prev => prev.map(r => (r.id === id ? { ...r, status: "archived" } : r)));
  }

  function submitNewEvent() {
    if (!form.title.trim() || !form.time.trim()) return;
    const dateNum = Math.min(31, Math.max(1, Number(form.dateNum) || 1));
    const meta = SOURCE_META[form.source];
    setEvents(prev => [
      ...prev,
      {
        id: nextEventId++,
        title: form.title.trim(),
        time: form.time.trim(),
        dateNum,
        color: meta.dot,
        source: form.source,
        description: form.description.trim() || "Nessuna descrizione fornita.",
        isAiGenerated: false,
      },
    ]);
    setForm({ title: "", time: "", dateNum: "1", description: "", source: "Manual" });
    setShowAddModal(false);
  }

  const SelectedSourceIcon = selectedEvent ? SOURCE_META[selectedEvent.source].icon : null;
  const activeReminders = reminders.filter(r => r.status === "active");
  const resolvedReminders = reminders.filter(r => r.status === "resolved");
  const priorityGroups: { priority: ReminderPriority; items: ReminderData[] }[] = (
    ["high", "medium", "low"] as ReminderPriority[]
  ).map(priority => ({ priority, items: activeReminders.filter(r => r.priority === priority) }));

  return (
    <div className="grid grid-cols-[1fr_320px] gap-4 items-start">
      {/* ── Main column ── */}
      <div className="space-y-4 min-w-0">
        {/* Calendar card */}
        <div className="bg-white rounded-2xl overflow-hidden flex flex-col border border-slate-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Calendar & Reminders</h2>
              <p className="text-xs text-slate-500">{MONTH_LABEL}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
                {(["Month", "Week", "Day"] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors
                      ${view === v ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                <Plus size={13} /> Add Event
              </button>
            </div>
          </div>

          {/* Month view */}
          {view === "Month" && (
            <div>
              <div className="grid grid-cols-7 border-b border-slate-100">
                {DAYS_OF_WEEK.map(d => (
                  <div key={d} className="py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {MONTH_GRID.map((cell, i) => {
                  const cellEvents = cell.inMonth ? eventsFor(cell.dateNum) : [];
                  return (
                    <button
                      key={i}
                      onClick={() => cell.inMonth && openDay(cell.dateNum)}
                      disabled={!cell.inMonth}
                      className={`min-h-[92px] p-1.5 flex flex-col gap-1 border-b border-r border-slate-100 text-left
                        ${!cell.inMonth ? "bg-slate-50/60 cursor-default" : "hover:bg-slate-50 cursor-pointer"}`}
                    >
                      <span
                        className={`text-[11px] font-bold w-6 h-6 rounded-full flex items-center justify-center
                          ${cell.isToday ? "bg-blue-600 text-white" : cell.inMonth ? "text-slate-700" : "text-slate-300"}`}
                      >
                        {cell.dateNum}
                      </span>
                      <div className="flex flex-col gap-1">
                        {cellEvents.slice(0, 2).map(ev => (
                          <span
                            key={ev.id}
                            onClick={e => { e.stopPropagation(); setSelectedEvent(ev); }}
                            className={`text-[9px] leading-tight px-1 py-0.5 rounded truncate font-semibold
                              ${ev.isAiGenerated ? "ring-1 ring-inset ring-emerald-300" : ""}`}
                            style={{ backgroundColor: `${ev.color}1a`, color: ev.color }}
                          >
                            {ev.time} {ev.title}
                          </span>
                        ))}
                        {cellEvents.length > 2 && (
                          <span className="text-[9px] font-semibold text-slate-400">+{cellEvents.length - 2} more</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Week view */}
          {view === "Week" && (
            <div className="grid grid-cols-7">
              {MONTH_GRID.slice(0, 7).map((cell, i) => (
                <div key={i} className="p-2.5 flex flex-col gap-1.5 border-r border-slate-100 last:border-r-0 min-h-[220px]">
                  <div className="text-center mb-1">
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${cell.isToday ? "text-blue-600" : "text-slate-400"}`}>
                      {DAYS_OF_WEEK[i]}
                    </p>
                    <button
                      onClick={() => openDay(cell.dateNum)}
                      className={`text-sm font-bold mt-0.5 w-7 h-7 rounded-full flex items-center justify-center mx-auto
                        ${cell.isToday ? "bg-blue-600 text-white" : "bg-transparent text-slate-700 hover:bg-slate-100"}`}
                    >
                      {cell.dateNum}
                    </button>
                  </div>
                  {eventsFor(cell.dateNum).map(ev => (
                    <EventChip key={ev.id} event={ev} onClick={() => setSelectedEvent(ev)} />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Day view */}
          {view === "Day" && (
            <div className="p-5 space-y-2.5">
              <p className="text-xs font-semibold text-slate-500 mb-2">
                {DAYS_OF_WEEK[MONTH_GRID.findIndex(c => c.inMonth && c.dateNum === selectedDateNum) % 7]}, {MONTH_LABEL.replace("July", "Jul")} {selectedDateNum}
              </p>
              {eventsFor(selectedDateNum).length === 0 && (
                <p className="text-xs text-slate-400 italic">Nessun evento in agenda per questo giorno.</p>
              )}
              {eventsFor(selectedDateNum).map(ev => (
                <EventChip key={ev.id} event={ev} onClick={() => setSelectedEvent(ev)} expanded />
              ))}
            </div>
          )}
        </div>

        {/* Selected event detail */}
        {selectedEvent && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: selectedEvent.color }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <p className="text-sm font-semibold text-slate-900">{selectedEvent.title}</p>
                {selectedEvent.isAiGenerated && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                    <Bot size={8} /> AI Scheduled
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1">
                {SelectedSourceIcon && <SelectedSourceIcon size={11} />} {selectedEvent.time} · {selectedEvent.source}
              </p>
              <p className="text-xs text-slate-600">{selectedEvent.description}</p>
            </div>
            <button onClick={() => setSelectedEvent(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 flex-shrink-0">
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Sidebar column ── */}
      <div className="space-y-4">
        {/* Sync status */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-700 mb-3">Calendar Sync</p>
          <div className="space-y-2">
            <SyncRow label="Google Calendar" status={googleStatus} onClick={() => toggleConnection("google")} />
            <SyncRow label="Apple Calendar" status={appleStatus} onClick={() => toggleConnection("apple")} />
          </div>
        </div>

        {/* Reminders */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-700 mb-3">System Reminders & Maintenance Alarms</p>
          <div className="space-y-3">
            {priorityGroups.map(group => group.items.length > 0 && (
              <div key={group.priority}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: PRIORITY_COLOR[group.priority] }}>
                  {group.priority} · {group.items.length}
                </p>
                <div className="space-y-1.5">
                  {group.items.map(r => (
                    <div key={r.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => toggleReminder(r.id)}
                        className="w-3.5 h-3.5 rounded border-slate-300 flex-shrink-0"
                      />
                      <span className="text-xs flex-1 truncate text-slate-700">{r.text}</span>
                      <span className="text-[10px] font-semibold flex-shrink-0 text-slate-400">{r.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {activeReminders.length === 0 && (
              <p className="text-xs text-slate-400 italic">Nessun avviso attivo.</p>
            )}
          </div>

          {resolvedReminders.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Resolved today · {resolvedReminders.length}
              </p>
              <div className="space-y-1.5">
                {resolvedReminders.map(r => (
                  <div key={r.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked
                      onChange={() => toggleReminder(r.id)}
                      className="w-3.5 h-3.5 rounded border-slate-300 flex-shrink-0"
                    />
                    <span className="text-xs flex-1 truncate text-slate-400 line-through">{r.text}</span>
                    <button onClick={() => archiveReminder(r.id)} className="p-1 rounded-md text-slate-400 hover:bg-slate-100 flex-shrink-0" title="Archive">
                      <Archive size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Add Event modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-900">Add Event</p>
              <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                <X size={15} />
              </button>
            </div>
            <div className="space-y-2.5">
              <input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Titolo evento"
                className="w-full rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:border-blue-500"
              />
              <div className="flex gap-2">
                <input
                  value={form.time}
                  onChange={e => setForm({ ...form, time: e.target.value })}
                  placeholder="Orario (es. 14:30)"
                  className="flex-1 rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:border-blue-500"
                />
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={form.dateNum}
                  onChange={e => setForm({ ...form, dateNum: e.target.value })}
                  placeholder="Giorno"
                  className="w-20 rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:border-blue-500"
                />
              </div>
              <select
                value={form.source}
                onChange={e => setForm({ ...form, source: e.target.value as EventSource })}
                className="w-full rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:border-blue-500"
              >
                <option value="Manual">Manual</option>
                <option value="Google Calendar">Google Calendar</option>
                <option value="Apple Calendar">Apple Calendar</option>
              </select>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Descrizione (opzionale)"
                rows={3}
                className="w-full rounded-xl px-3 py-2 text-sm bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={submitNewEvent}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700"
              >
                Add Event
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function EventChip({ event, onClick, expanded }: { event: CalendarEventData; onClick: () => void; expanded?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg px-2 py-1.5 border-l-[2.5px] transition-colors hover:brightness-95
        ${event.isAiGenerated ? "ring-1 ring-inset ring-emerald-200" : ""}`}
      style={{ backgroundColor: `${event.color}14`, borderColor: event.color }}
    >
      <div className="flex items-center gap-1">
        <p className="font-semibold text-[10px]" style={{ color: event.color }}>{event.time}</p>
        {event.isAiGenerated && (
          <span className="flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
            <Bot size={7} /> AI
          </span>
        )}
      </div>
      <p className="text-[11px] leading-tight mt-0.5 text-slate-700">{event.title}</p>
      {expanded && <p className="text-[10px] leading-snug mt-1 text-slate-500">{event.description}</p>}
    </button>
  );
}

function SyncRow({ label, status, onClick }: { label: string; status: ConnectionStatus; onClick: () => void }) {
  const meta =
    status === "connected"
      ? { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", text: "Connected" }
      : status === "syncing"
      ? { icon: RefreshCw, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", text: "Syncing…" }
      : { icon: XCircle, color: "text-slate-400", bg: "bg-slate-50 border-slate-200", text: "Disconnected" };
  const Icon = meta.icon;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-colors ${meta.bg} hover:brightness-95`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Calendar size={13} className="text-slate-500 flex-shrink-0" />
        <span className="text-xs font-semibold text-slate-800 truncate">{label}</span>
      </div>
      <span className={`flex items-center gap-1 text-[10px] font-bold flex-shrink-0 ${meta.color}`}>
        <Icon size={11} className={status === "syncing" ? "animate-spin" : ""} />
        {meta.text}
      </span>
    </button>
  );
}
