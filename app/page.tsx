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
import PatientsPage from "./components/modules/patients-page";
import { LayoutDashboard, MessageSquare, Calendar, Wrench, FileText, Bot, Clock3, Users } from "lucide-react";
import { INITIAL_QUOTES } from "@/app/data/quotes";
import { STATUS_META } from "@/app/constants/quotes";
import { INITIAL_CHAT_MESSAGES, INITIAL_CONVERSATIONS } from "@/app/data/messaging";
import { INITIAL_COLUMNS } from "@/app/data/maintenance";
import { PRIORITY_COLOR as CALENDAR_PRIORITY_COLOR } from "@/app/constants/calendar";

// ─── Data ────────────────────────────────────────────────────────────────────

const navLinks = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: Users, label: "Pazienti", badge: 4 },
  { icon: MessageSquare, label: "Chat", badge: 5 },
  { icon: Calendar, label: "Agenda & Appuntamenti" },
  { icon: Wrench, label: "Attività Cliniche & Studio" },
  { icon: FileText, label: "Piani di Cura & Preventivi", badge: 7 },
  { icon: Bot, label: "Assistente AI & Protocolli" },
];

const kpis = [
  { label: "Pazienti in Chat", value: "38", sub: "+6 nuovi contatti oggi", up: true, icon: MessageSquare, accent: "#3b82f6", spark: [24, 28, 22, 30, 27, 38] },
  { label: "Appuntamenti Poltrona", value: "24", sub: "Questa settimana", up: true, icon: Calendar, accent: "#0d9488", spark: [14, 18, 16, 20, 19, 24] },
  { label: "Sterilizzazione & Task", value: "3", sub: "Tutti i cicli autoclave ok", up: false, icon: Wrench, accent: "#f59e0b", spark: [5, 4, 3, 2, 4, 3] },
  { label: "Piani di Cura Aperti", value: "7", sub: "€16.400 in accettazione", up: true, icon: FileText, accent: "#8b5cf6", spark: [3, 5, 4, 6, 5, 7] },
];

const chatMessages = INITIAL_CHAT_MESSAGES;
const conversations = INITIAL_CONVERSATIONS;

const pageHeadings: Record<string, { title: string; subtitle: string }> = {
  "Dashboard": { title: "Studio Dentistico Dott. Scognamiglio", subtitle: "Mercoledì, 1 Luglio 2026 — Benvenuto, Dott. Giovanni Scognamiglio" },
  "Pazienti": { title: "Elenco & Cartelle Cliniche Pazienti", subtitle: "Anagrafica studio, storico prestazioni e schede cliniche con radiografie" },
  "Chat": { title: "Chat & Comunicazioni Pazienti", subtitle: "Triage urgenze odontoiatriche, recall semestrali e messaggistica WhatsApp" },
  "Agenda & Appuntamenti": { title: "Agenda & Appuntamenti", subtitle: "Planning poltrone cliniche, igiene e chirurgia sincronizzato con Google/Apple" },
  "Piani di Cura & Preventivi": { title: "Piani di Cura & Preventivi", subtitle: "Preventivi clinici, piani di trattamento 3D e accettazione pazienti" },
  "Attività Cliniche & Studio": { title: "Attività Cliniche & Studio", subtitle: "Kanban operativo: sterilizzazione, laboratorio odontotecnico e ordini forniture" },
};



const weekDays = [
  {
    day: "Lun", date: "29", today: false,
    events: [
      { title: "Igiene orale — Rossi E.", time: "09:00", color: "#0d9488" },
      { title: "Consulenza All-on-4 — Greco", time: "14:30", color: "#3b82f6" },
    ],
  },
  {
    day: "Mar", date: "30", today: false,
    events: [{ title: "Controllo Invisalign — Ferrari", time: "10:00", color: "#8b5cf6" }],
  },
  {
    day: "Mer", date: "1", today: true,
    events: [
      { title: "Urgenza dolore — Rossi E.", time: "09:30", color: "#ef4444" },
      { title: "Chirurgia Implantare — Ferrero", time: "14:30", color: "#3b82f6" },
    ],
  },
  {
    day: "Gio", date: "2", today: false,
    events: [{ title: "Terapia Canalare 4.6 — Mancini", time: "10:00", color: "#f59e0b" }],
  },
  {
    day: "Ven", date: "3", today: false,
    events: [
      { title: "Briefing clinico studio", time: "09:00", color: "#8b5cf6" },
      { title: "Sbiancamento Led — Vitali", time: "15:00", color: "#0d9488" },
    ],
  },
];

const reminders = [
  { text: "Test biologico spore autoclave (Ciclo sterilizzazione #42)", time: "08:15", priority: "high" as const },
  { text: "Recall WhatsApp decorso post-operatorio Elena Rossi", time: "10:00", priority: "high" as const },
  { text: "Ritiro dima chirurgica guidata dal laboratorio", time: "12:00", priority: "medium" as const },
  { text: "Promemoria igiene semestrale inviato a 15 pazienti", time: "15:30", priority: "medium" as const },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { title, subtitle } = pageHeadings[activeNav] ?? { title: activeNav, subtitle: "Presto disponibile" };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">

      {/* ══ SIDEBAR ══ */}
      <Sidebar 
        navLinks={navLinks} 
        activeNav={activeNav} 
        setActiveNav={setActiveNav} 
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* ══ MAIN CONTAINER ══ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── HEADER ── */}
        <Header onMenuClick={() => setMobileMenuOpen(true)} />

        {/* ── CONTENT AREA ── */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">

          {/* Page Heading */}
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">{title}</h1>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>

          {activeNav === "Dashboard" ? (
            <>
              {/* ── KPI CARDS ── */}
              <KpiCards data={kpis} />

              {/* ── ROW 2: MESSAGING + CALENDAR ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <MessagingHub chats={chatMessages} />
                <CalendarWidget weekDays={weekDays} reminders={reminders} priorityColor={priorityColor} />
              </div>

              {/* ── ROW 3: KANBAN + QUOTES ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <MaintenanceBoard boardData={kanban} priorityColor={priorityColor} />
                <QuotesTable 
                  data={quotes} 
                  statusMap={statusMap} 
                  onView={() => setActiveNav("Piani di Cura & Preventivi")} 
                  onEdit={() => setActiveNav("Piani di Cura & Preventivi")}
                />
              </div>

              {/* ── ROW 4: AI PERFORMANCE ── */}
              <PerformanceStats />
            </>
          ) : activeNav === "Pazienti" ? (
            <PatientsPage />
          ) : activeNav === "Chat" ? (
            <MessagingPage chats={chatMessages} conversations={conversations} />
          ) : activeNav === "Agenda & Appuntamenti" ? (
            <CalendarPage />
          ) : activeNav === "Piani di Cura & Preventivi" ? (
            <QuotesPage />
          ) : activeNav === "Attività Cliniche & Studio" ? (
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