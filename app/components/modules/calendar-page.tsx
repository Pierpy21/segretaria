"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  Plus,
  X,
  Bot,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Archive,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { DAYS_OF_WEEK, INITIAL_EVENTS, INITIAL_REMINDERS } from "@/app/data/calendar";
import { PRIORITY_COLOR, SOURCE_META } from "@/app/constants/calendar";
import {
  ALL_DAY_LABEL,
  addDays,
  addMinutesToTime,
  addMonths,
  buildMonthGrid,
  buildWeek,
  formatLongDate,
  formatMonthLabel,
  formatTimeLocal,
  formatWeekLabel,
  getVisibleRange,
  localDateTime,
  parseISODate,
  stableEventId,
  toISODate,
} from "@/app/lib/calendar-dates";
import type { ViewMode, ConnectionStatus, CalendarEventData, ReminderData, EventSource, ReminderPriority } from "@/app/types/calendar";
import type {
  ApiResult,
  CreateEventInput,
  ProviderStatus,
  SyncedEvent,
  SyncProvider,
  SyncStatusResponse,
} from "@/app/types/calendar-sync";

const PROVIDER_LABEL: Record<SyncProvider, string> = {
  google: "Google Calendar",
  apple: "Apple Calendar",
};

interface EventForm {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  description: string;
  source: EventSource;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Wrapper fetch che non lancia mai: errori di rete o JSON diventano ApiResult con success false */
async function callApi<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, init);
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { success: false, error: "Errore di rete. Riprova." };
  }
}

function toCalendarEvent(ev: SyncedEvent): CalendarEventData {
  const source: EventSource = ev.provider === "google" ? "Google Calendar" : "Apple Calendar";
  return {
    id: stableEventId(`${ev.provider}:${ev.externalId}`),
    title: ev.title || "(senza titolo)",
    date: ev.allDay ? ev.start.slice(0, 10) : toISODate(new Date(ev.start)),
    time: ev.allDay ? ALL_DAY_LABEL : formatTimeLocal(ev.start),
    endTime: ev.allDay ? undefined : formatTimeLocal(ev.end),
    color: SOURCE_META[source].dot,
    source,
    description: ev.description || "Nessuna descrizione fornita.",
    isAiGenerated: false,
    externalId: ev.externalId,
  };
}

/** "Tutto il giorno" prima degli eventi con orario */
const sortTime = (e: CalendarEventData) => (e.time === ALL_DAY_LABEL ? "" : e.time);

function emptyForm(date: string): EventForm {
  return { title: "", date, startTime: "09:00", endTime: "10:00", description: "", source: "Manual" };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>("Month");
  const [selectedDate, setSelectedDate] = useState(() => toISODate(new Date()));
  const [localEvents, setLocalEvents] = useState<CalendarEventData[]>(INITIAL_EVENTS);
  const [syncedEvents, setSyncedEvents] = useState<CalendarEventData[]>([]);
  const [reminders, setReminders] = useState<ReminderData[]>(INITIAL_REMINDERS);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventData | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [eventErrors, setEventErrors] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Partial<Record<SyncProvider, boolean>>>({});
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [form, setForm] = useState<EventForm>(() => emptyForm(toISODate(new Date())));
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const nextLocalId = useRef(Math.max(...INITIAL_EVENTS.map(e => e.id)) + 1);

  // Intervallo visibile: cambia solo quando cambia la vista o la data di riferimento (stringhe → deps stabili)
  const { from, to } = getVisibleRange(view, selectedDate);

  // Stato provider
  useEffect(() => {
    let cancelled = false;
    callApi<SyncStatusResponse>("/api/calendar/status").then(res => {
      if (cancelled) return;
      if (res.success) {
        setSyncStatus(res.data);
        setStatusError(null);
      } else {
        setStatusError(res.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Eventi del range visibile
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- stato di caricamento legato alla fetch esterna
    setLoadingEvents(true);
    callApi<{ events: SyncedEvent[]; errors: Partial<Record<SyncProvider, string>> }>(
      `/api/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    ).then(res => {
      if (cancelled) return;
      if (res.success) {
        setSyncedEvents(res.data.events.map(toCalendarEvent));
        setEventErrors(
          Object.entries(res.data.errors).map(([p, msg]) => `${PROVIDER_LABEL[p as SyncProvider]}: ${msg}`)
        );
      } else {
        setEventErrors([res.error]);
      }
      setLoadingEvents(false);
    });
    return () => {
      cancelled = true;
    };
  }, [from, to, reloadKey]);

  const allEvents = useMemo(() => [...localEvents, ...syncedEvents], [localEvents, syncedEvents]);

  function eventsFor(date: string) {
    return allEvents.filter(e => e.date === date).sort((a, b) => sortTime(a).localeCompare(sortTime(b)));
  }

  const selectedDay = parseISODate(selectedDate);
  const monthCells = buildMonthGrid(selectedDay.getFullYear(), selectedDay.getMonth());
  const weekCells = useMemo(() => buildWeek(selectedDate), [selectedDate]);

  const headerLabel =
    view === "Month" ? formatMonthLabel(selectedDate) : view === "Week" ? formatWeekLabel(selectedDate) : formatLongDate(selectedDate);

  const googleStatus = syncStatus?.google;
  const appleStatus = syncStatus?.apple;
  const googleConnected = googleStatus?.connected ?? false;
  const appleConnected = appleStatus?.connected ?? false;

  function shiftDate(dir: -1 | 1) {
    setSelectedDate(prev => (view === "Month" ? addMonths(prev, dir) : addDays(prev, view === "Week" ? 7 * dir : dir)));
  }

  function openDay(date: string) {
    setSelectedDate(date);
    setView("Day");
  }

  function refresh() {
    setReloadKey(k => k + 1);
  }

  function clearErrors() {
    setActionError(null);
    setEventErrors([]);
    setStatusError(null);
  }

  function setProviderBusy(provider: SyncProvider, value: boolean) {
    setBusy(prev => ({ ...prev, [provider]: value }));
  }

  async function connectApple() {
    setActionError(null);
    setProviderBusy("apple", true);
    const res = await callApi<ProviderStatus>("/api/calendar/apple/connect", { method: "POST" });
    setProviderBusy("apple", false);
    if (!res.success) {
      setActionError(`Apple Calendar: ${res.error}`);
      return;
    }
    setSyncStatus(prev => (prev ? { ...prev, apple: res.data } : prev));
    refresh();
  }

  async function disconnectProvider(provider: SyncProvider) {
    const label = PROVIDER_LABEL[provider];
    if (!window.confirm(`Disconnettere ${label}? Gli eventi sincronizzati non saranno più mostrati.`)) return;
    setActionError(null);
    setProviderBusy(provider, true);
    const res = await callApi<null>(`/api/calendar/${provider}/connect`, { method: "DELETE" });
    setProviderBusy(provider, false);
    if (!res.success) {
      setActionError(`${label}: ${res.error}`);
      return;
    }
    refresh();
  }

  function handleProviderClick(provider: SyncProvider) {
    const st = provider === "google" ? googleStatus : appleStatus;
    if (!st?.configured || busy[provider]) return;
    if (st.connected) {
      void disconnectProvider(provider);
      return;
    }
    if (provider === "google") {
      window.location.href = "/api/calendar/google/connect";
      return;
    }
    void connectApple();
  }

  async function deleteSyncedEvent(ev: CalendarEventData) {
    if (!ev.externalId) return;
    const provider: SyncProvider = ev.source === "Google Calendar" ? "google" : "apple";
    if (!window.confirm(`Eliminare "${ev.title}" da ${PROVIDER_LABEL[provider]}?`)) return;
    setActionError(null);
    setDeleting(true);
    const res = await callApi<null>(
      `/api/calendar/events?provider=${provider}&id=${encodeURIComponent(ev.externalId)}`,
      { method: "DELETE" }
    );
    setDeleting(false);
    if (!res.success) {
      setActionError(res.error);
      return;
    }
    setSyncedEvents(prev => prev.filter(e => e.id !== ev.id));
    setSelectedEvent(null);
  }

  function toggleReminder(id: number) {
    setReminders(prev =>
      prev.map(r => (r.id === id ? { ...r, status: r.status === "active" ? "resolved" : "active" } : r))
    );
  }

  function archiveReminder(id: number) {
    setReminders(prev => prev.map(r => (r.id === id ? { ...r, status: "archived" } : r)));
  }

  function openAddModal() {
    setForm(emptyForm(selectedDate));
    setFormError(null);
    setShowAddModal(true);
  }

  function closeAddModal() {
    setShowAddModal(false);
    setFormError(null);
  }

  async function submitNewEvent() {
    const title = form.title.trim();
    if (!title || !form.date || !form.startTime || !form.endTime) {
      setFormError("Compila titolo, data e orari.");
      return;
    }
    if (form.endTime <= form.startTime) {
      setFormError("L'orario di fine deve essere successivo all'inizio.");
      return;
    }

    const description = form.description.trim();

    if (form.source === "Manual") {
      const id = nextLocalId.current++;
      setLocalEvents(prev => [
        ...prev,
        {
          id,
          title,
          date: form.date,
          time: form.startTime,
          endTime: form.endTime,
          color: SOURCE_META.Manual.dot,
          source: "Manual",
          description: description || "Nessuna descrizione fornita.",
          isAiGenerated: false,
        },
      ]);
      closeAddModal();
      return;
    }

    const provider: SyncProvider = form.source === "Google Calendar" ? "google" : "apple";
    const body: CreateEventInput = {
      provider,
      title,
      description,
      start: localDateTime(form.date, form.startTime),
      end: localDateTime(form.date, form.endTime),
    };

    setFormError(null);
    setSubmitting(true);
    const res = await callApi<SyncedEvent>("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(false);

    if (!res.success) {
      setFormError(res.error);
      return;
    }
    const created = toCalendarEvent(res.data);
    setSyncedEvents(prev => [...prev.filter(e => e.id !== created.id), created]);
    closeAddModal();
  }

  const activeReminders = reminders.filter(r => r.status === "active");
  const resolvedReminders = reminders.filter(r => r.status === "resolved");
  const priorityGroups: { priority: ReminderPriority; items: ReminderData[] }[] = (
    ["high", "medium", "low"] as ReminderPriority[]
  ).map(priority => ({ priority, items: activeReminders.filter(r => r.priority === priority) }));

  const hasErrors = Boolean(actionError || statusError || eventErrors.length > 0);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 items-start">
      {/* ── Main column ── */}
      <div className="space-y-4 min-w-0">
        {hasErrors && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <div className="space-y-0.5 min-w-0">
              {actionError && <p>{actionError}</p>}
              {statusError && <p>Stato calendari: {statusError}</p>}
              {eventErrors.map(msg => (
                <p key={msg}>{msg}</p>
              ))}
            </div>
            <button onClick={clearErrors} className="p-0.5 rounded text-red-400 hover:text-red-700 flex-shrink-0" title="Chiudi">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Calendar card */}
        <div className="bg-white rounded-2xl overflow-hidden flex flex-col border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Agenda & Appuntamenti Studio</h2>
              <p className="text-xs text-slate-500">
                {headerLabel} — Planning Poltrone Odontoiatriche
                {loadingEvents && <span className="ml-2 text-[10px] text-slate-400">Aggiornamento…</span>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => shiftDate(-1)}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                  title="Precedente"
                  aria-label="Precedente"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setSelectedDate(toISODate(new Date()))}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Oggi
                </button>
                <button
                  onClick={() => shiftDate(1)}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                  title="Successivo"
                  aria-label="Successivo"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
              <div className="flex gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
                {([["Month", "Mese"], ["Week", "Settimana"], ["Day", "Giorno"]] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setView(v as ViewMode)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors
                      ${view === v ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={openAddModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                <Plus size={13} /> Nuovo Appuntamento
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
                {monthCells.map(cell => {
                  const cellEvents = cell.inMonth ? eventsFor(cell.date) : [];
                  return (
                    <button
                      key={cell.date}
                      onClick={() => cell.inMonth && openDay(cell.date)}
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
              {weekCells.map((cell, i) => (
                <div key={cell.date} className="p-2.5 flex flex-col gap-1.5 border-r border-slate-100 last:border-r-0 min-h-[220px]">
                  <div className="text-center mb-1">
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${cell.isToday ? "text-blue-600" : "text-slate-400"}`}>
                      {DAYS_OF_WEEK[i]}
                    </p>
                    <button
                      onClick={() => openDay(cell.date)}
                      className={`text-sm font-bold mt-0.5 w-7 h-7 rounded-full flex items-center justify-center mx-auto
                        ${cell.isToday ? "bg-blue-600 text-white" : "bg-transparent text-slate-700 hover:bg-slate-100"}`}
                    >
                      {cell.dateNum}
                    </button>
                  </div>
                  {eventsFor(cell.date).map(ev => (
                    <EventChip key={ev.id} event={ev} onClick={() => setSelectedEvent(ev)} />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Day view */}
          {view === "Day" && (
            <div className="p-5 space-y-2.5">
              <p className="text-xs font-semibold text-slate-500 mb-2">{formatLongDate(selectedDate)}</p>
              {eventsFor(selectedDate).length === 0 && (
                <p className="text-xs text-slate-400 italic">Nessun evento in agenda per questo giorno.</p>
              )}
              {eventsFor(selectedDate).map(ev => (
                <EventChip key={ev.id} event={ev} onClick={() => setSelectedEvent(ev)} expanded />
              ))}
            </div>
          )}
        </div>

        {/* Selected event detail */}
        {selectedEvent && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: selectedEvent.color }} />
            <EventDetail
              event={selectedEvent}
              deleting={deleting}
              onDelete={() => deleteSyncedEvent(selectedEvent)}
            />
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
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-slate-700">Calendar Sync</p>
            <button
              onClick={refresh}
              disabled={loadingEvents}
              className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-slate-900 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={11} className={loadingEvents ? "animate-spin" : ""} /> Sincronizza ora
            </button>
          </div>
          <div className="space-y-2">
            <SyncRow
              label="Google Calendar"
              provider={googleStatus}
              loadingStatus={!syncStatus && !statusError}
              busy={Boolean(busy.google)}
              onClick={() => handleProviderClick("google")}
            />
            <SyncRow
              label="Apple Calendar"
              provider={appleStatus}
              loadingStatus={!syncStatus && !statusError}
              busy={Boolean(busy.apple)}
              onClick={() => handleProviderClick("apple")}
            />
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

      {/* ── Add Event modal (Nuovo Appuntamento) ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border-2 border-slate-300 w-full max-w-sm p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200">
              <p className="text-base font-bold text-slate-900">Nuovo Appuntamento Studio</p>
              <button
                onClick={closeAddModal}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                title="Chiudi"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Paziente & Prestazione</label>
                <input
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="Es. Elena Rossi — Urgenza dolore o Igiene"
                  className="w-full rounded-xl px-3 py-2 text-sm bg-white border border-slate-300 text-slate-900 placeholder:text-slate-500 font-semibold outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Data</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                  className="w-full rounded-xl px-3 py-2 text-sm bg-white border border-slate-300 text-slate-900 font-semibold outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Inizio</label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={e => {
                      const startTime = e.target.value;
                      setForm({
                        ...form,
                        startTime,
                        endTime: startTime >= form.endTime ? addMinutesToTime(startTime, 60) : form.endTime,
                      });
                    }}
                    className="w-full rounded-xl px-3 py-2 text-sm bg-white border border-slate-300 text-slate-900 font-semibold outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Fine</label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={e => setForm({ ...form, endTime: e.target.value })}
                    className="w-full rounded-xl px-3 py-2 text-sm bg-white border border-slate-300 text-slate-900 font-semibold outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Poltrona / Sincronizzazione</label>
                <select
                  value={form.source}
                  onChange={e => setForm({ ...form, source: e.target.value as EventSource })}
                  className="w-full rounded-xl px-3 py-2 text-sm bg-white border border-slate-300 text-slate-900 font-bold outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 cursor-pointer"
                >
                  <option value="Manual" className="text-slate-900 font-semibold">Poltrona Studio (Manuale)</option>
                  <option value="Google Calendar" disabled={!googleConnected} className="text-slate-900 font-semibold">
                    Google Calendar Studio{googleConnected ? "" : " (non connesso)"}
                  </option>
                  <option value="Apple Calendar" disabled={!appleConnected} className="text-slate-900 font-semibold">
                    Apple Calendar{appleConnected ? "" : " (non connesso)"}
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Note Cliniche & Materiali</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Dettagli poltrona, anestetico, cartella clinica (opzionale)"
                  rows={3}
                  className="w-full rounded-xl px-3 py-2 text-sm bg-white border border-slate-300 text-slate-900 placeholder:text-slate-500 font-medium outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 resize-none"
                />
              </div>
            </div>

            {formError && <p className="mt-3 text-xs font-semibold text-red-600">{formError}</p>}

            <div className="flex items-center justify-end gap-2.5 mt-5 pt-3 border-t border-slate-200">
              <button
                onClick={closeAddModal}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 border border-slate-300 hover:bg-slate-200 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={submitNewEvent}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Salvataggio…" : "Fissa Appuntamento"}
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

function EventDetail({ event, deleting, onDelete }: { event: CalendarEventData; deleting: boolean; onDelete: () => void }) {
  const SourceIcon = SOURCE_META[event.source].icon;
  const isSynced = Boolean(event.externalId);
  const timeLabel = event.endTime ? `${event.time}–${event.endTime}` : event.time;
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-0.5">
        <p className="text-sm font-semibold text-slate-900">{event.title}</p>
        {event.isAiGenerated && (
          <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
            <Bot size={8} /> AI Scheduled
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1">
        <SourceIcon size={11} /> {formatLongDate(event.date)} · {timeLabel} · {event.source}
      </p>
      <p className="text-xs text-slate-600">{event.description}</p>
      {isSynced && (
        <button
          onClick={onDelete}
          disabled={deleting}
          className="mt-2.5 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-60"
        >
          <Trash2 size={11} /> {deleting ? "Eliminazione…" : "Elimina dal calendario"}
        </button>
      )}
    </div>
  );
}

function SyncRow({
  label,
  provider,
  loadingStatus,
  busy,
  onClick,
}: {
  label: string;
  provider: ProviderStatus | undefined;
  loadingStatus: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const rowStatus: ConnectionStatus = busy ? "syncing" : provider?.connected ? "connected" : "disconnected";
  const notConfigured = !loadingStatus && provider !== undefined && !provider.configured;
  const disabled = loadingStatus || notConfigured || busy;

  const meta = loadingStatus
    ? { icon: RefreshCw, color: "text-slate-400", bg: "bg-slate-50 border-slate-200", text: "Verifica…" }
    : notConfigured
    ? { icon: XCircle, color: "text-slate-400", bg: "bg-slate-50 border-slate-200", text: "Non configurato" }
    : rowStatus === "connected"
    ? { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", text: "Sincronizzato" }
    : rowStatus === "syncing"
    ? { icon: RefreshCw, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", text: "In corso…" }
    : { icon: XCircle, color: "text-slate-400", bg: "bg-slate-50 border-slate-200", text: "Non connesso" };
  const Icon = meta.icon;

  const lastSync = provider?.lastSync
    ? new Date(provider.lastSync).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="space-y-1">
      <button
        onClick={onClick}
        disabled={disabled}
        title={notConfigured ? "Credenziali mancanti: vedi .env.example" : undefined}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-colors ${meta.bg}
          ${disabled ? "cursor-default" : "hover:brightness-95"}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Calendar size={13} className="text-slate-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-slate-800 truncate">{label}</span>
        </div>
        <span className={`flex items-center gap-1 text-[10px] font-bold flex-shrink-0 ${meta.color}`}>
          <Icon size={11} className={rowStatus === "syncing" ? "animate-spin" : ""} />
          {meta.text}
        </span>
      </button>
      {notConfigured && (
        <p className="text-[10px] text-slate-400 px-1">Configura le variabili in .env.example</p>
      )}
      {rowStatus === "connected" && (provider?.account || lastSync) && (
        <p className="text-[10px] text-slate-500 px-1 truncate">
          {provider?.account}
          {provider?.account && lastSync && " · "}
          {lastSync && `ultimo sync ${lastSync}`}
        </p>
      )}
      {provider?.error && <p className="text-[10px] text-red-600 px-1">{provider.error}</p>}
    </div>
  );
}
