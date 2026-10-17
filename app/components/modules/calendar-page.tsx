"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  LoaderCircle,
} from "lucide-react";
import { DAYS_OF_WEEK, PRIORITY_COLOR, SOURCE_META } from "@/app/constants/calendar";
import {
  ALL_DAY_LABEL,
  addDays,
  addMinutesToTime,
  addMonths,
  buildMonthGrid,
  buildWeek,
  formatLongDate,
  formatMonthLabel,
  formatWeekLabel,
  getVisibleRange,
  parseISODate,
  toISODate,
} from "@/app/lib/calendar-dates";
import { apiFetch } from "@/app/lib/api-client";
import { useApiData } from "@/app/hooks/use-api-data";
import { refreshBadges } from "@/app/hooks/use-sidebar-badges";
import { Skeleton, SkeletonRows, ErrorState } from "@/app/components/ui/async-state";
import AssetSelect from "@/app/components/modules/asset-select";
import type { ViewMode, CalendarEventData, ReminderData, ReminderPriority, ReminderStatus, EventSource } from "@/app/types/calendar";
import type { SyncProvider, ProviderStatus, SyncStatusResponse } from "@/app/types/calendar-sync";
import type {
  CreateCalendarEventInput,
  AppleConnectInput,
  SyncResult,
  UpdateReminderInput,
} from "@/app/types/api";

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
  assetId: string;
}

interface AppleForm {
  appleId: string;
  appPassword: string;
  calendarName: string;
}

const EMPTY_APPLE_FORM: AppleForm = { appleId: "", appPassword: "", calendarName: "" };

// ─── Helpers ────────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Operazione non riuscita. Riprova.";
}

/** "Tutto il giorno" prima degli eventi con orario */
const sortTime = (e: CalendarEventData) => (e.time === ALL_DAY_LABEL ? "" : e.time);

function emptyForm(date: string): EventForm {
  return { title: "", date, startTime: "09:00", endTime: "10:00", description: "", source: "Manual", assetId: "" };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>("Month");
  const [selectedDate, setSelectedDate] = useState(() => toISODate(new Date()));
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState<EventForm>(() => emptyForm(toISODate(new Date())));
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [providerBusy, setProviderBusy] = useState<Partial<Record<SyncProvider, boolean>>>({});

  const [showAppleModal, setShowAppleModal] = useState(false);
  const [appleForm, setAppleForm] = useState<AppleForm>(EMPTY_APPLE_FORM);
  const [appleError, setAppleError] = useState<string | null>(null);
  const [appleSubmitting, setAppleSubmitting] = useState(false);

  // Intervallo visibile [from, to) in YYYY-MM-DD
  const { from, to } = getVisibleRange(view, selectedDate);

  const statusHook = useApiData<SyncStatusResponse>("/api/calendar/status");
  const eventsHook = useApiData<CalendarEventData[]>(`/api/calendar/events?from=${from}&to=${to}`);
  const remindersHook = useApiData<ReminderData[]>("/api/reminders");

  const { reload: reloadStatus, mutate: mutateStatus } = statusHook;
  const { reload: reloadEvents, mutate: mutateEvents } = eventsHook;
  const { mutate: mutateReminders } = remindersHook;

  const events = eventsHook.data ?? [];
  const reminders = remindersHook.data ?? [];
  const selectedEvent = events.find(e => e.id === selectedEventId) ?? null;

  const googleStatus: ProviderStatus | undefined = statusHook.data?.google;
  const appleStatus: ProviderStatus | undefined = statusHook.data?.apple;
  const googleConnected = googleStatus?.connected ?? false;
  const appleConnected = appleStatus?.connected ?? false;
  const anyConnected = googleConnected || appleConnected;

  // Sincronizzazione con i calendari esterni (POST /api/calendar/sync, poi ricarica eventi)
  const syncNow = useCallback(async () => {
    setSyncing(true);
    setActionError(null);
    try {
      const result = await apiFetch<SyncResult>("/api/calendar/sync", {
        method: "POST",
        body: JSON.stringify({ from, to }),
      });
      const msgs: string[] = [];
      for (const [provider, msg] of Object.entries(result.errors)) {
        if (msg) msgs.push(`${PROVIDER_LABEL[provider as SyncProvider]}: ${msg}`);
      }
      setSyncErrors(msgs);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSyncing(false);
      reloadEvents();
      refreshBadges();
    }
  }, [from, to, reloadEvents]);

  // Sync automatica all'apertura, una sola volta, se almeno un provider è connesso
  const autoSynced = useRef(false);
  useEffect(() => {
    if (!anyConnected || autoSynced.current) return;
    autoSynced.current = true;
    void syncNow();
  }, [anyConnected, syncNow]);

  const allDayFirst = (a: CalendarEventData, b: CalendarEventData) => sortTime(a).localeCompare(sortTime(b));

  function eventsFor(date: string) {
    return events.filter(e => e.date === date).sort(allDayFirst);
  }

  const selectedDay = parseISODate(selectedDate);
  const monthCells = buildMonthGrid(selectedDay.getFullYear(), selectedDay.getMonth());
  const weekCells = useMemo(() => buildWeek(selectedDate), [selectedDate]);

  const headerLabel =
    view === "Month" ? formatMonthLabel(selectedDate) : view === "Week" ? formatWeekLabel(selectedDate) : formatLongDate(selectedDate);

  const todayISO = toISODate(new Date());
  const isTodayVisible = from <= todayISO && todayISO < to;

  function goToToday() {
    if (!isTodayVisible) setSelectedDate(todayISO);
  }

  function shiftDate(dir: -1 | 1) {
    setSelectedDate(prev => (view === "Month" ? addMonths(prev, dir) : addDays(prev, view === "Week" ? 7 * dir : dir)));
  }

  function openDay(date: string) {
    setSelectedDate(date);
    setView("Day");
  }

  function clearErrors() {
    setActionError(null);
    setSyncErrors([]);
  }

  // ── Provider ──

  function setBusy(provider: SyncProvider, value: boolean) {
    setProviderBusy(prev => ({ ...prev, [provider]: value }));
  }

  async function disconnectProvider(provider: SyncProvider) {
    const label = PROVIDER_LABEL[provider];
    if (!window.confirm(`Disconnettere ${label}? Gli eventi sincronizzati non saranno più mostrati.`)) return;
    setActionError(null);
    setBusy(provider, true);
    try {
      await apiFetch<null>(`/api/calendar/${provider}/connect`, { method: "DELETE" });
      reloadStatus();
      reloadEvents();
    } catch (err) {
      setActionError(`${label}: ${errorMessage(err)}`);
    } finally {
      setBusy(provider, false);
    }
  }

  function handleProviderClick(provider: SyncProvider) {
    const st = provider === "google" ? googleStatus : appleStatus;
    if (!st?.configured || providerBusy[provider]) return;
    if (st.connected) {
      void disconnectProvider(provider);
      return;
    }
    if (provider === "google") {
      // Redirect OAuth: non passa da apiFetch
      window.location.href = "/api/calendar/google/connect";
      return;
    }
    setAppleError(null);
    setShowAppleModal(true);
  }

  async function submitApple(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const appleId = appleForm.appleId.trim();
    if (!appleId || !appleForm.appPassword) {
      setAppleError("Inserisci Apple ID e password specifica per app.");
      return;
    }
    const body: AppleConnectInput = {
      appleId,
      appPassword: appleForm.appPassword,
      calendarName: appleForm.calendarName.trim() || undefined,
    };
    setAppleError(null);
    setAppleSubmitting(true);
    try {
      const status = await apiFetch<ProviderStatus>("/api/calendar/apple/connect", {
        method: "POST",
        body: JSON.stringify(body),
      });
      mutateStatus(prev => (prev ? { ...prev, apple: status } : prev));
      setShowAppleModal(false);
      setAppleForm(EMPTY_APPLE_FORM);
      reloadStatus();
      void syncNow();
    } catch (err) {
      setAppleError(errorMessage(err));
    } finally {
      setAppleSubmitting(false);
    }
  }

  // ── Eventi ──

  async function deleteEvent(ev: CalendarEventData) {
    const question = ev.externalId
      ? `Eliminare "${ev.title}" anche da ${ev.source}?`
      : `Eliminare "${ev.title}"?`;
    if (!window.confirm(question)) return;
    setActionError(null);
    setDeleting(true);
    try {
      await apiFetch<null>(`/api/calendar/events/${encodeURIComponent(ev.id)}`, { method: "DELETE" });
      mutateEvents(prev => (prev ?? []).filter(e => e.id !== ev.id));
      setSelectedEventId(null);
      refreshBadges();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setDeleting(false);
    }
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

    const body: CreateCalendarEventInput = {
      title,
      description: form.description.trim() || undefined,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      source: form.source,
      assetId: form.assetId || undefined,
    };

    setFormError(null);
    setSubmitting(true);
    try {
      const created = await apiFetch<CalendarEventData>("/api/calendar/events", {
        method: "POST",
        body: JSON.stringify(body),
      });
      mutateEvents(prev => [...(prev ?? []).filter(e => e.id !== created.id), created]);
      refreshBadges();
      closeAddModal();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Promemoria (optimistic + rollback) ──

  async function updateReminder(r: ReminderData, status: ReminderStatus) {
    const body: UpdateReminderInput = { status };
    mutateReminders(list => (list ?? []).map(x => (x.id === r.id ? { ...x, status } : x)));
    try {
      const updated = await apiFetch<ReminderData>(`/api/reminders/${encodeURIComponent(r.id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      mutateReminders(list => (list ?? []).map(x => (x.id === r.id ? updated : x)));
    } catch (err) {
      mutateReminders(list => (list ?? []).map(x => (x.id === r.id ? { ...x, status: r.status } : x)));
      setActionError(errorMessage(err));
    }
  }

  const activeReminders = reminders.filter(r => r.status === "active");
  const resolvedReminders = reminders.filter(r => r.status === "resolved");
  const priorityGroups: { priority: ReminderPriority; items: ReminderData[] }[] = (
    ["high", "medium", "low"] as ReminderPriority[]
  ).map(priority => ({ priority, items: activeReminders.filter(r => r.priority === priority) }));

  const bannerMessages: string[] = [
    ...(actionError ? [actionError] : []),
    ...(statusHook.error ? [`Stato calendari: ${statusHook.error}`] : []),
    ...syncErrors,
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 items-start">
      {/* ── Main column ── */}
      <div className="space-y-4 min-w-0">
        {bannerMessages.length > 0 && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <div className="space-y-0.5 min-w-0">
              {bannerMessages.map(msg => (
                <p key={msg}>{msg}</p>
              ))}
            </div>
            <button onClick={clearErrors} className="p-0.5 rounded text-red-800 hover:text-red-950 flex-shrink-0" title="Chiudi" aria-label="Chiudi">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Calendar card */}
        <div className="bg-surface rounded-2xl overflow-hidden flex flex-col border border-line">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-line">
            <div>
              <h2 className="text-sm font-semibold text-ink">Agenda & Appuntamenti Studio</h2>
              <p className="text-xs text-ink-muted">
                Planning Poltrone Odontoiatriche
                {(eventsHook.loading || syncing) && <span className="ml-2 text-[10px] text-ink-muted">Aggiornamento…</span>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => shiftDate(-1)}
                  className="p-1.5 rounded-lg border border-line text-ink-muted hover:bg-surface-muted transition-colors"
                  title="Precedente"
                  aria-label="Precedente"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={goToToday}
                  title="Torna a oggi"
                  aria-label="Torna a oggi"
                  className={`min-w-[13rem] sm:min-w-[15rem] whitespace-nowrap text-center px-2 py-1 rounded-lg text-sm font-semibold text-ink transition-colors
                    ${isTodayVisible ? "cursor-default" : "cursor-pointer hover:bg-surface-muted"}`}
                >
                  {headerLabel}
                </button>
                <button
                  onClick={() => shiftDate(1)}
                  className="p-1.5 rounded-lg border border-line text-ink-muted hover:bg-surface-muted transition-colors"
                  title="Successivo"
                  aria-label="Successivo"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
              <div className="flex gap-1 bg-surface-muted border border-line rounded-lg p-1">
                {([["Month", "Mese"], ["Week", "Settimana"], ["Day", "Giorno"]] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setView(v as ViewMode)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors
                      ${view === v ? "bg-accent text-accent-ink" : "text-ink-muted hover:bg-line"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={openAddModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-accent-ink bg-accent hover:bg-accent-hover transition-colors"
              >
                <Plus size={13} /> Nuovo Appuntamento
              </button>
            </div>
          </div>

          {eventsHook.loading ? (
            <div className="p-4">
              <Skeleton className="h-80" />
            </div>
          ) : (
            <>
              {/* Month view */}
              {view === "Month" && (
                <div>
                  <div className="grid grid-cols-7 border-b border-line">
                    {DAYS_OF_WEEK.map(d => (
                      <div key={d} className="py-2 text-center text-[10px] font-bold uppercase tracking-wider text-ink-muted">
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
                          className={`min-h-[92px] p-1.5 flex flex-col gap-1 border-b border-r border-line text-left
                            ${!cell.inMonth ? "bg-surface-muted/60 cursor-default" : "hover:bg-surface-muted cursor-pointer"}`}
                        >
                          <span
                            className={`text-[11px] font-bold w-6 h-6 rounded-full flex items-center justify-center
                              ${cell.isToday ? "bg-accent text-accent-ink" : cell.inMonth ? "text-ink" : "text-ink-muted/50"}`}
                          >
                            {cell.dateNum}
                          </span>
                          <div className="flex flex-col gap-1">
                            {cellEvents.slice(0, 2).map(ev => (
                              <span
                                key={ev.id}
                                onClick={e => { e.stopPropagation(); setSelectedEventId(ev.id); }}
                                className={`text-[9px] leading-tight px-1 py-0.5 rounded truncate font-semibold
                                  ${ev.isAiGenerated ? "ring-1 ring-inset ring-emerald-300" : ""}`}
                                style={{ backgroundColor: `${ev.color}1a`, color: ev.color }}
                              >
                                {ev.time} {ev.title}
                              </span>
                            ))}
                            {cellEvents.length > 2 && (
                              <span className="text-[9px] font-semibold text-ink-muted">+{cellEvents.length - 2} more</span>
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
                    <div key={cell.date} className="p-2.5 flex flex-col gap-1.5 border-r border-line last:border-r-0 min-h-[220px]">
                      <div className="text-center mb-1">
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${cell.isToday ? "text-accent-text" : "text-ink-muted"}`}>
                          {DAYS_OF_WEEK[i]}
                        </p>
                        <button
                          onClick={() => openDay(cell.date)}
                          className={`text-sm font-bold mt-0.5 w-7 h-7 rounded-full flex items-center justify-center mx-auto
                            ${cell.isToday ? "bg-accent text-accent-ink" : "bg-transparent text-ink hover:bg-surface-muted"}`}
                        >
                          {cell.dateNum}
                        </button>
                      </div>
                      {eventsFor(cell.date).map(ev => (
                        <EventChip key={ev.id} event={ev} onClick={() => setSelectedEventId(ev.id)} />
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* Day view */}
              {view === "Day" && (
                <div className="p-5 space-y-2.5">
                  <p className="text-xs font-semibold text-ink-muted mb-2">{formatLongDate(selectedDate)}</p>
                  {eventsFor(selectedDate).length === 0 && (
                    <p className="text-xs text-ink-muted italic">Nessun evento in agenda per questo giorno.</p>
                  )}
                  {eventsFor(selectedDate).map(ev => (
                    <EventChip key={ev.id} event={ev} onClick={() => setSelectedEventId(ev.id)} expanded />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {eventsHook.error && <ErrorState message="Impossibile caricare gli eventi." onRetry={reloadEvents} />}

        {/* Selected event detail */}
        {selectedEvent && (
          <div className="bg-surface rounded-2xl border border-line p-4 flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: selectedEvent.color }} />
            <EventDetail event={selectedEvent} deleting={deleting} onDelete={() => deleteEvent(selectedEvent)} />
            <button
              onClick={() => setSelectedEventId(null)}
              className="p-1 rounded-lg text-ink-muted hover:bg-surface-muted flex-shrink-0"
              aria-label="Chiudi dettaglio"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Sidebar column ── */}
      <div className="space-y-4">
        {/* Sync status */}
        <div className="bg-surface rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-ink">Calendar Sync</p>
            <button
              onClick={() => void syncNow()}
              disabled={syncing || !anyConnected}
              className="flex items-center gap-1 text-[10px] font-semibold text-ink-muted hover:text-ink disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={11} className={syncing ? "animate-spin" : ""} /> Sincronizza ora
            </button>
          </div>
          <div className="space-y-2">
            <SyncRow
              label="Google Calendar"
              provider={googleStatus}
              loadingStatus={statusHook.loading}
              busy={Boolean(providerBusy.google)}
              onClick={() => handleProviderClick("google")}
            />
            <SyncRow
              label="Apple Calendar"
              provider={appleStatus}
              loadingStatus={statusHook.loading}
              busy={Boolean(providerBusy.apple)}
              onClick={() => handleProviderClick("apple")}
            />
          </div>
          {statusHook.error && <p className="mt-2 text-[10px] text-red-800">{statusHook.error}</p>}
        </div>

        {/* Reminders */}
        <div className="bg-surface rounded-2xl border border-line p-4">
          <p className="text-xs font-bold text-ink mb-3">System Reminders & Maintenance Alarms</p>

          {remindersHook.loading ? (
            <SkeletonRows rows={3} className="h-7" />
          ) : remindersHook.error ? (
            <ErrorState message="Impossibile caricare i promemoria." onRetry={remindersHook.reload} />
          ) : (
            <>
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
                            onChange={() => void updateReminder(r, "resolved")}
                            className="w-3.5 h-3.5 rounded border-line-strong flex-shrink-0 accent-accent"
                            aria-label={`Segna come risolto: ${r.text}`}
                          />
                          <span className="text-xs flex-1 truncate text-ink">{r.text}</span>
                          <span className="text-[10px] font-semibold flex-shrink-0 text-ink-muted">{r.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {activeReminders.length === 0 && (
                  <p className="text-xs text-ink-muted italic">Nessun avviso attivo.</p>
                )}
              </div>

              {resolvedReminders.length > 0 && (
                <div className="mt-3 pt-3 border-t border-line">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">
                    Resolved today · {resolvedReminders.length}
                  </p>
                  <div className="space-y-1.5">
                    {resolvedReminders.map(r => (
                      <div key={r.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked
                          onChange={() => void updateReminder(r, "active")}
                          className="w-3.5 h-3.5 rounded border-line-strong flex-shrink-0 accent-accent"
                          aria-label={`Riapri: ${r.text}`}
                        />
                        <span className="text-xs flex-1 truncate text-ink-muted line-through">{r.text}</span>
                        <button
                          onClick={() => void updateReminder(r, "archived")}
                          className="p-1 rounded-md text-ink-muted hover:bg-surface-muted flex-shrink-0"
                          title="Archivia"
                          aria-label="Archivia"
                        >
                          <Archive size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Add Event modal (Nuovo Appuntamento) ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-sidebar/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl border-2 border-line-strong w-full max-w-sm p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-line">
              <p className="text-base font-bold text-ink">Nuovo Appuntamento Studio</p>
              <button
                onClick={closeAddModal}
                className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors"
                title="Chiudi"
                aria-label="Chiudi"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-ink mb-1">Paziente & Prestazione</label>
                <input
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="Es. Elena Rossi — Urgenza dolore o Igiene"
                  className="w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong text-ink placeholder:text-ink-muted font-semibold outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">Data</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                  className="w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong text-ink font-semibold outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">Inizio</label>
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
                    className="w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong text-ink font-semibold outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">Fine</label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={e => setForm({ ...form, endTime: e.target.value })}
                    className="w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong text-ink font-semibold outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">Poltrona / Sincronizzazione</label>
                <select
                  value={form.source}
                  onChange={e => setForm({ ...form, source: e.target.value as EventSource })}
                  className="w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong text-ink font-bold outline-none focus:border-accent focus:ring-1 focus:ring-accent cursor-pointer"
                >
                  <option value="Manual" className="text-ink font-semibold">Poltrona Studio (Manuale)</option>
                  <option value="Google Calendar" disabled={!googleConnected} className="text-ink font-semibold">
                    Google Calendar Studio{googleConnected ? "" : " (non connesso)"}
                  </option>
                  <option value="Apple Calendar" disabled={!appleConnected} className="text-ink font-semibold">
                    Apple Calendar{appleConnected ? "" : " (non connesso)"}
                  </option>
                </select>
              </div>

              <AssetSelect value={form.assetId} onChange={assetId => setForm({ ...form, assetId })} />

              <div>
                <label className="block text-xs font-bold text-ink mb-1">Note Cliniche & Materiali</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Dettagli poltrona, anestetico, cartella clinica (opzionale)"
                  rows={3}
                  className="w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong text-ink placeholder:text-ink-muted font-medium outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none"
                />
              </div>
            </div>

            {formError && <p className="mt-3 text-xs font-semibold text-red-800">{formError}</p>}

            <div className="flex items-center justify-end gap-2.5 mt-5 pt-3 border-t border-line">
              <button
                onClick={closeAddModal}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-ink bg-surface-muted border border-line-strong hover:bg-line transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={() => void submitNewEvent()}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-accent-ink bg-accent hover:bg-accent-hover shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Salvataggio…" : "Fissa Appuntamento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Apple connect modal ── */}
      {showAppleModal && (
        <div className="fixed inset-0 z-50 bg-sidebar/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={submitApple}
            className="bg-surface rounded-2xl border-2 border-line-strong w-full max-w-sm p-5 shadow-2xl space-y-3.5"
          >
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <p className="text-base font-bold text-ink">Collega Apple Calendar</p>
              <button
                type="button"
                onClick={() => setShowAppleModal(false)}
                className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors"
                aria-label="Chiudi"
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <label htmlFor="apple-id" className="block text-xs font-bold text-ink mb-1">Apple ID</label>
              <input
                id="apple-id"
                type="email"
                autoComplete="username"
                value={appleForm.appleId}
                onChange={e => setAppleForm({ ...appleForm, appleId: e.target.value })}
                placeholder="nome@icloud.com"
                className="w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong text-ink placeholder:text-ink-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>

            <div>
              <label htmlFor="apple-password" className="block text-xs font-bold text-ink mb-1">Password specifica per app</label>
              <input
                id="apple-password"
                type="password"
                autoComplete="off"
                value={appleForm.appPassword}
                onChange={e => setAppleForm({ ...appleForm, appPassword: e.target.value })}
                placeholder="xxxx-xxxx-xxxx-xxxx"
                className="w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong text-ink placeholder:text-ink-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <p className="mt-1 text-[11px] text-ink-muted">
                Non è la password del tuo Apple ID: generala su{" "}
                <a href="https://account.apple.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-text underline">
                  account.apple.com
                </a>
                .
              </p>
            </div>

            <div>
              <label htmlFor="apple-calendar" className="block text-xs font-bold text-ink mb-1">Nome calendario (opzionale)</label>
              <input
                id="apple-calendar"
                type="text"
                value={appleForm.calendarName}
                onChange={e => setAppleForm({ ...appleForm, calendarName: e.target.value })}
                placeholder="Es. Studio"
                className="w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong text-ink placeholder:text-ink-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>

            {appleError && <p className="text-xs font-semibold text-red-800">{appleError}</p>}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setShowAppleModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-ink bg-surface-muted border border-line-strong hover:bg-line transition-colors"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={appleSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-accent-ink bg-accent hover:bg-accent-hover shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {appleSubmitting && <LoaderCircle size={12} className="animate-spin" />}
                {appleSubmitting ? "Collegamento…" : "Collega"}
              </button>
            </div>
          </form>
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
          <span className="flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded-full bg-emerald-50 text-emerald-800">
            <Bot size={7} /> AI
          </span>
        )}
      </div>
      <p className="text-[11px] leading-tight mt-0.5 text-ink">{event.title}</p>
      {expanded && <p className="text-[10px] leading-snug mt-1 text-ink-muted">{event.description}</p>}
    </button>
  );
}

function EventDetail({ event, deleting, onDelete }: { event: CalendarEventData; deleting: boolean; onDelete: () => void }) {
  const SourceIcon = SOURCE_META[event.source].icon;
  const timeLabel = event.endTime ? `${event.time}–${event.endTime}` : event.time;
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-0.5">
        <p className="text-sm font-semibold text-ink">{event.title}</p>
        {event.isAiGenerated && (
          <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800">
            <Bot size={8} /> AI Scheduled
          </span>
        )}
      </div>
      <p className="text-xs text-ink-muted mb-1.5 flex items-center gap-1">
        <SourceIcon size={11} /> {formatLongDate(event.date)} · {timeLabel} · {event.source}
      </p>
      <p className="text-xs text-ink-muted">{event.description}</p>
      <button
        onClick={onDelete}
        disabled={deleting}
        className="mt-2.5 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-red-800 border border-red-200 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-60"
      >
        <Trash2 size={11} /> {deleting ? "Eliminazione…" : "Elimina appuntamento"}
      </button>
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
  const rowStatus: "connected" | "disconnected" | "syncing" = busy ? "syncing" : provider?.connected ? "connected" : "disconnected";
  const notConfigured = !loadingStatus && provider !== undefined && !provider.configured;
  const disabled = loadingStatus || notConfigured || busy;

  const meta = loadingStatus
    ? { icon: RefreshCw, color: "text-ink-muted", bg: "bg-surface-muted border-line", text: "Verifica…" }
    : notConfigured
    ? { icon: XCircle, color: "text-ink-muted", bg: "bg-surface-muted border-line", text: "Non configurato" }
    : rowStatus === "connected"
    ? { icon: CheckCircle2, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", text: "Sincronizzato" }
    : rowStatus === "syncing"
    ? { icon: RefreshCw, color: "text-amber-800", bg: "bg-amber-50 border-amber-200", text: "In corso…" }
    : { icon: XCircle, color: "text-ink-muted", bg: "bg-surface-muted border-line", text: "Non connesso" };
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
          <Calendar size={13} className="text-ink-muted flex-shrink-0" />
          <span className="text-xs font-semibold text-ink truncate">{label}</span>
        </div>
        <span className={`flex items-center gap-1 text-[10px] font-bold flex-shrink-0 ${meta.color}`}>
          <Icon size={11} className={rowStatus === "syncing" ? "animate-spin" : ""} />
          {meta.text}
        </span>
      </button>
      {notConfigured && (
        <p className="text-[10px] text-ink-muted px-1">Configura le variabili in .env.example</p>
      )}
      {rowStatus === "connected" && (provider?.account || lastSync || provider?.calendarName) && (
        <p className="text-[10px] text-ink-muted px-1 truncate">
          {provider?.account}
          {provider?.calendarName && ` · ${provider.calendarName}`}
          {provider?.account && lastSync && " · "}
          {lastSync && `ultimo sync ${lastSync}`}
        </p>
      )}
      {provider?.error && <p className="text-[10px] text-red-800 px-1">{provider.error}</p>}
    </div>
  );
}
