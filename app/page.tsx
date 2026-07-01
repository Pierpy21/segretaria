"use client";

import { useState } from "react";
import Sidebar from "./components/layout/sidebar";
import Header from "./components/layout/header";
import KpiCards from "./components/kpi-cards";
import MessagingHub from "./components/messaging-hub";
import CalendarWidget from "./components/calendar-widget";
import MaintenanceBoard from "./components/maintenance-board";
import QuotesTable from "./components/quotas-table";
import PerformanceStats from "./components/performance-stats";
import MessagingPage from "./components/modules/messaging-page";
import CalendarPage from "./components/modules/calendar-page";
import QuotesPage from "./components/modules/quotes-page";
import MaintenancePage from "./components/modules/maintenance-page";
import { LayoutDashboard, MessageSquare, Calendar, Wrench, FileText, Bot, Clock3 } from "lucide-react";
import { INITIAL_QUOTES } from "@/app/data/quotes";
import { STATUS_META } from "@/app/constants/quotes";
import { INITIAL_CHAT_MESSAGES, INITIAL_CONVERSATIONS } from "@/app/data/messaging";
import { INITIAL_COLUMNS } from "@/app/data/maintenance";
import { PRIORITY_COLOR as CALENDAR_PRIORITY_COLOR } from "@/app/constants/calendar";

// ─── Data ────────────────────────────────────────────────────────────────────

const navLinks = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: MessageSquare, label: "Messaging & WhatsApp Hub", badge: 12 },
  { icon: Calendar, label: "Calendar & Reminders" },
  { icon: Wrench, label: "Maintenance & Tasks" },
  { icon: FileText, label: "Quotes & Requests", badge: 7 },
  { icon: Bot, label: "AI Config & Knowledge Base" },
];

const kpis = [
  { label: "Active Chats", value: "32", sub: "+4 since yesterday", up: true, icon: MessageSquare, accent: "#3b82f6", spark: [24, 28, 22, 30, 27, 32] },
  { label: "Scheduled Events", value: "18", sub: "This week", up: true, icon: Calendar, accent: "#0d9488", spark: [12, 15, 11, 16, 14, 18] },
  { label: "Pending Maintenance", value: "3", sub: "1 resolved today", up: false, icon: Wrench, accent: "#f59e0b", spark: [6, 4, 5, 3, 4, 3] },
  { label: "Open Quotes", value: "7", sub: "+3 this week", up: true, icon: FileText, accent: "#8b5cf6", spark: [3, 5, 4, 6, 5, 7] },
];

const chatMessages = INITIAL_CHAT_MESSAGES;
const conversations = INITIAL_CONVERSATIONS;

const pageHeadings: Record<string, { title: string; subtitle: string }> = {
  "Dashboard": { title: "Dashboard Overview", subtitle: "Wednesday, 1 July 2026 — Good morning, Carlo" },
  "Messaging & WhatsApp Hub": { title: "Messaging & WhatsApp Hub", subtitle: "Gestisci le conversazioni ricevute via Evolution API" },
  "Calendar & Reminders": { title: "Calendar & Reminders", subtitle: "Vista mensile, settimanale e giornaliera con sync Google/Apple" },
  "Quotes & Requests": { title: "Quotes & Requests", subtitle: "Gestisci preventivi e richieste di servizio da clienti" },
  "Maintenance & Tasks": { title: "Maintenance & Tasks", subtitle: "Kanban board con task generati da AI e manuali" },
};

const weekDays = [
  {
    day: "Mon", date: "29", today: false,
    events: [
      { title: "Boiler check — Rossi", time: "09:00", color: "#3b82f6" },
      { title: "Quote call — Greco", time: "14:30", color: "#0d9488" },
    ],
  },
  {
    day: "Tue", date: "30", today: false,
    events: [{ title: "Electrician — Via Roma", time: "10:00", color: "#8b5cf6" }],
  },
  {
    day: "Wed", date: "1", today: true,
    events: [
      { title: "Maintenance visit", time: "09:30", color: "#f59e0b" },
      { title: "Client meeting", time: "15:00", color: "#3b82f6" },
    ],
  },
  {
    day: "Thu", date: "2", today: false,
    events: [{ title: "Bianchi — Plumbing", time: "11:00", color: "#3b82f6" }],
  },
  {
    day: "Fri", date: "3", today: false,
    events: [
      { title: "Team sync", time: "09:00", color: "#8b5cf6" },
      { title: "Conti follow-up", time: "13:00", color: "#0d9488" },
    ],
  },
];

const reminders = [
  { text: "Call back Marco Rossi — plumbing quote", time: "10:00", priority: "high" },
  { text: "Send invoice to Roberto Conti", time: "12:00", priority: "medium" },
  { text: "Annual boiler inspection reminder", time: "15:30", priority: "low" },
];

const kanban = INITIAL_COLUMNS.map(col => ({
  col: col.name,
  accent: col.accent,
  bg: col.bg,
  tasks: col.tasks.map(({ title, priority, ai }) => ({ title, priority, ai })),
}));

const quotes = INITIAL_QUOTES.slice(0, 5);
const statusMap = Object.fromEntries(
  Object.entries(STATUS_META).map(([key, val]) => [key, { label: val.label, bg: val.bg, text: val.text }])
);

const priorityColor = CALENDAR_PRIORITY_COLOR;

// ─── App ─────────────────────────────────────────────────────────────────────

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex-1 h-[calc(100vh-190px)] bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center gap-3">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-50">
        <Clock3 size={20} className="text-blue-500" />
      </div>
      <p className="text-sm font-semibold text-slate-900">{label}</p>
      <p className="text-xs text-slate-500">Presto disponibile</p>
    </div>
  );
}

export default function App() {
  const [activeNav, setActiveNav] = useState("Dashboard");
  const { title, subtitle } = pageHeadings[activeNav] ?? { title: activeNav, subtitle: "Presto disponibile" };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">

      {/* ══ SIDEBAR ══ */}
      <Sidebar navLinks={navLinks} activeNav={activeNav} setActiveNav={setActiveNav} />

      {/* ══ MAIN CONTAINER ══ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── HEADER ── */}
        <Header />

        {/* ── CONTENT AREA ── */}
        <main className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Page Heading */}
          <div>
            <h1 className="text-lg font-bold text-slate-900">{title}</h1>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>

          {activeNav === "Dashboard" ? (
            <>
              {/* ── KPI CARDS ── */}
              <KpiCards data={kpis} />

              {/* ── ROW 2: MESSAGING + CALENDAR ── */}
              <div className="grid grid-cols-2 gap-4">
                <MessagingHub chats={chatMessages} />
                <CalendarWidget weekDays={weekDays} reminders={reminders} priorityColor={priorityColor} />
              </div>

              {/* ── ROW 3: KANBAN + QUOTES ── */}
              <div className="grid grid-cols-2 gap-4">
                <MaintenanceBoard boardData={kanban} priorityColor={priorityColor} />
                <QuotesTable 
  data={quotes} 
  statusMap={statusMap} 
  onView={() => setActiveNav("Quotes & Requests")} 
  onEdit={() => setActiveNav("Quotes & Requests")}
/></div>

              {/* ── ROW 4: AI PERFORMANCE ── */}
              <PerformanceStats />
            </>
          ) : activeNav === "Messaging & WhatsApp Hub" ? (
            <MessagingPage chats={chatMessages} conversations={conversations} />
          ) : activeNav === "Calendar & Reminders" ? (
            <CalendarPage />
          ) : activeNav === "Quotes & Requests" ? (
            <QuotesPage />
          ) : activeNav === "Maintenance & Tasks" ? (
            <MaintenancePage />
          ) : (
            <ComingSoon label={activeNav} />
          )}

          {/* Bottom Spacer */}
          <div className="h-2" />
        </main>
      </div>
    </div>
  );
}