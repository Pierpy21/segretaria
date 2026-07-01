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
import { LayoutDashboard, MessageSquare, Calendar, Wrench, FileText, Bot } from "lucide-react";

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

const chatMessages = [
  { id: 1, name: "Marco Rossi", snippet: "Ho bisogno di un idraulico urgente...", time: "2m", unread: 3, ai: true, initials: "MR", color: "#3b82f6" },
  { id: 2, name: "Giulia Ferrari", snippet: "Quando è disponibile per giovedì?", time: "15m", unread: 1, ai: true, initials: "GF", color: "#0d9488" },
  { id: 3, name: "Luca Esposito", snippet: "Grazie per il preventivo ricevuto!", time: "1h", unread: 0, ai: false, initials: "LE", color: "#8b5cf6" },
  { id: 4, name: "Sofia Romano", snippet: "Posso fissare un appuntamento per...", time: "2h", unread: 0, ai: false, initials: "SR", color: "#f59e0b" },
  { id: 5, name: "Andrea Marino", snippet: "Conferma appuntamento domani alle 9", time: "3h", unread: 0, ai: true, initials: "AM", color: "#ef4444" },
];

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

const kanban = [
  {
    col: "To Do", accent: "#94a3b8", bg: "#f8fafc",
    tasks: [
      { title: "Follow up: Marco plumbing request", priority: "high", ai: true },
      { title: "Send invoice reminder — Client #47", priority: "medium", ai: false },
      { title: "Schedule annual boiler inspection", priority: "low", ai: true },
    ],
  },
  {
    col: "In Progress", accent: "#3b82f6", bg: "#eff6ff",
    tasks: [
      { title: "Prepare quote — bathroom renovation", priority: "high", ai: false },
      { title: "Coordinate electrician — Via Roma 14", priority: "medium", ai: true },
    ],
  },
  {
    col: "Done", accent: "#10b981", bg: "#f0fdf4",
    tasks: [
      { title: "Book appointment: Bianchi — Jul 2", priority: "low", ai: true },
      { title: "Confirm: Ferrarese family visit", priority: "low", ai: true },
    ],
  },
];

const quotes = [
  { id: "Q-001", client: "Anna Bianchi", type: "Plumber", date: "Jul 1, 2026", status: "pending_ai", amount: "€280" },
  { id: "Q-002", client: "Roberto Conti", type: "Electrician", date: "Jun 30, 2026", status: "quote_sent", amount: "€450" },
  { id: "Q-003", client: "Maria Greco", type: "Carpenter", date: "Jun 29, 2026", status: "approved", amount: "€1,200" },
  { id: "Q-004", client: "Paolo Mancini", type: "Plumber", date: "Jun 28, 2026", status: "pending_ai", amount: "€160" },
  { id: "Q-005", client: "Elena Vitali", type: "Painter", date: "Jun 27, 2026", status: "quote_sent", amount: "€820" },
];

const statusMap: Record<string, { label: string; bg: string; text: string }> = {
  pending_ai: { label: "Pending AI Review", bg: "#fef9c3", text: "#854d0e" },
  quote_sent: { label: "Quote Sent", bg: "#dbeafe", text: "#1e40af" },
  approved: { label: "Approved", bg: "#dcfce7", text: "#166534" },
};

const priorityColor: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#10b981",
};

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeNav, setActiveNav] = useState("Dashboard");

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
            <h1 className="text-lg font-bold text-slate-900">Dashboard Overview</h1>
            <p className="text-xs text-slate-500">Wednesday, 1 July 2026 — Good morning, Carlo</p>
          </div>

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
            <QuotesTable data={quotes} statusMap={statusMap} />
          </div>

          {/* ── ROW 4: AI PERFORMANCE ── */}
          <PerformanceStats />

          {/* Bottom Spacer */}
          <div className="h-2" />
        </main>
      </div>
    </div>
  );
}