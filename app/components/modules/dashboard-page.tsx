"use client";

import { useState, type ReactNode } from "react";
import { MessageSquare, Calendar, Wrench, FileText, type LucideIcon } from "lucide-react";
import KpiCards from "@/app/components/kpi-cards";
import MessagingHub from "@/app/components/messaging-hub";
import CalendarWidget from "@/app/components/calendar-widget";
import MaintenanceBoard from "@/app/components/maintenance-board";
import QuotesTable from "@/app/components/quotas-table";
import PerformanceStats from "@/app/components/performance-stats";
import { Skeleton, ErrorState } from "@/app/components/ui/async-state";
import { DAYS_OF_WEEK } from "@/app/constants/calendar";
import { BOARD_COLUMNS, PRIORITY_COLOR } from "@/app/constants/maintenance";
import { STATUS_META } from "@/app/constants/quotes";
import { useApiData } from "@/app/hooks/use-api-data";
import { ALL_DAY_LABEL, addDays, formatWeekLabel, getVisibleRange, parseISODate, toISODate } from "@/app/lib/calendar-dates";
import { formatEuro, parseAmount } from "@/app/lib/amount";
import type { CalendarEventData, ReminderData, WeekDay, ReminderItem } from "@/app/types/calendar";
import type { ChatListItem } from "@/app/types/messaging";
import type { Quote } from "@/app/types/quotes";
import type { BoardTask } from "@/app/types/api";

interface KpiItem {
  label: string;
  value: string;
  sub: string;
  up: boolean;
  icon: LucideIcon;
  accent: string;
  spark: number[];
}

interface DashboardPageProps {
  onNavigate: (label: string) => void;
}

/** Sparkline decorativa che termina con il valore reale */
function sparkFor(n: number): number[] {
  return [Math.max(0, n - 5), Math.max(0, n - 3), Math.max(0, n - 4), Math.max(0, n - 2), Math.max(0, n - 1), n];
}

const byPosition = (a: BoardTask, b: BoardTask) => a.position - b.position;
const byTime = (a: CalendarEventData, b: CalendarEventData) =>
  (a.time === ALL_DAY_LABEL ? "" : a.time).localeCompare(b.time === ALL_DAY_LABEL ? "" : b.time);

/** Mostra skeleton / errore / contenuto per un widget */
function Gate({
  loading,
  error,
  onRetry,
  children,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (loading) return <Skeleton className="h-72" />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  return <>{children}</>;
}

export default function DashboardPage({ onNavigate }: DashboardPageProps) {
  const [today] = useState(() => toISODate(new Date()));
  const week = getVisibleRange("Week", today);

  const chatsHook = useApiData<ChatListItem[]>("/api/conversations");
  const weekHook = useApiData<CalendarEventData[]>(`/api/calendar/events?from=${week.from}&to=${week.to}`);
  const remindersHook = useApiData<ReminderData[]>("/api/reminders");
  const tasksHook = useApiData<BoardTask[]>("/api/tasks");
  const quotesHook = useApiData<Quote[]>("/api/quotes");

  const chats = chatsHook.data ?? [];
  const weekEvents = weekHook.data ?? [];
  const reminders = remindersHook.data ?? [];
  const tasks = tasksHook.data ?? [];
  const quotes = quotesHook.data ?? [];

  // ── KPI calcolati dai dati reali ──
  const unreadTotal = chats.reduce((sum, c) => sum + c.unread, 0);
  const openTasks = tasks.filter(t => t.columnId !== "done");
  const highOpenTasks = openTasks.filter(t => t.priority === "high").length;
  const doneTasks = tasks.length - openTasks.length;
  const openQuotes = quotes.filter(q => q.status === "pending_ai" || q.status === "quote_sent");
  const openQuotesTotal = openQuotes.reduce((sum, q) => sum + (parseAmount(q.amount) ?? 0), 0);

  const kpis: KpiItem[] = [
    {
      label: "Pazienti in Chat",
      value: chatsHook.loading || chatsHook.error ? "—" : String(chats.length),
      sub: `${unreadTotal} messaggi non letti`,
      up: true,
      icon: MessageSquare,
      accent: "#3b82f6",
      spark: sparkFor(chats.length),
    },
    {
      label: "Appuntamenti Poltrona",
      value: weekHook.loading || weekHook.error ? "—" : String(weekEvents.length),
      sub: "Questa settimana",
      up: true,
      icon: Calendar,
      accent: "#0d9488",
      spark: sparkFor(weekEvents.length),
    },
    {
      label: "Sterilizzazione & Task",
      value: tasksHook.loading || tasksHook.error ? "—" : String(openTasks.length),
      sub: `${highOpenTasks} ad alta priorità · ${doneTasks} completati`,
      up: highOpenTasks === 0,
      icon: Wrench,
      accent: "#f59e0b",
      spark: sparkFor(openTasks.length),
    },
    {
      label: "Piani di Cura Aperti",
      value: quotesHook.loading || quotesHook.error ? "—" : String(openQuotes.length),
      sub: `${formatEuro(openQuotesTotal)} in accettazione`,
      up: true,
      icon: FileText,
      accent: "#8b5cf6",
      spark: sparkFor(openQuotes.length),
    },
  ];

  // ── Widget data ──
  const weekDays: WeekDay[] = Array.from({ length: 5 }, (_, i) => {
    const date = addDays(week.from, i);
    return {
      day: DAYS_OF_WEEK[i],
      date: String(parseISODate(date).getDate()),
      today: date === today,
      events: weekEvents
        .filter(e => e.date === date)
        .sort(byTime)
        .map(e => ({ title: e.title, time: e.time, color: e.color })),
    };
  });

  const todayReminders: ReminderItem[] = reminders
    .filter(r => r.status === "active")
    .map(r => ({ text: r.text, time: r.time, priority: r.priority }));

  const kanban = BOARD_COLUMNS.map(col => ({
    col: col.name,
    accent: col.accent,
    bg: col.bg,
    tasks: tasks
      .filter(t => t.columnId === col.id)
      .sort(byPosition)
      .map(({ title, priority, ai }) => ({ title, priority, ai })),
  }));

  const statusMap = Object.fromEntries(
    Object.entries(STATUS_META).map(([key, val]) => [key, { label: val.label, bg: val.bg, text: val.text }])
  );

  return (
    <>
      <KpiCards data={kpis} />

      {/* ── ROW 2: MESSAGING + CALENDAR ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Gate loading={chatsHook.loading} error={chatsHook.error} onRetry={chatsHook.reload}>
          <MessagingHub chats={chats} />
        </Gate>
        <Gate loading={weekHook.loading || remindersHook.loading} error={weekHook.error ?? remindersHook.error} onRetry={() => { weekHook.reload(); remindersHook.reload(); }}>
          <CalendarWidget
            weekDays={weekDays}
            weekLabel={formatWeekLabel(today)}
            reminders={todayReminders}
            priorityColor={PRIORITY_COLOR}
          />
        </Gate>
      </div>

      {/* ── ROW 3: KANBAN + QUOTES ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Gate loading={tasksHook.loading} error={tasksHook.error} onRetry={tasksHook.reload}>
          <MaintenanceBoard boardData={kanban} priorityColor={PRIORITY_COLOR} />
        </Gate>
        <Gate loading={quotesHook.loading} error={quotesHook.error} onRetry={quotesHook.reload}>
          <QuotesTable
            data={quotes.slice(0, 5)}
            statusMap={statusMap}
            onView={() => onNavigate("Piani di Cura & Preventivi")}
            onEdit={() => onNavigate("Piani di Cura & Preventivi")}
          />
        </Gate>
      </div>

      {/* ── ROW 4: AI PERFORMANCE ── */}
      <PerformanceStats />
    </>
  );
}
