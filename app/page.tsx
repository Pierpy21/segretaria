"use client";

import { useEffect, useState } from "react";
import Sidebar from "./components/layout/sidebar";
import Header from "./components/layout/header";
import DashboardPage from "./components/modules/dashboard-page";
import MessagingPage from "./components/modules/messaging-page";
import CalendarPage from "./components/modules/calendar-page";
import QuotesPage from "./components/modules/quotes-page";
import MaintenancePage from "./components/modules/maintenance-page";
import PatientsPage from "./components/modules/patients-page";
import { LayoutDashboard, MessageSquare, Calendar, Wrench, FileText, Bot, Clock3, Users, X } from "lucide-react";

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

const pageHeadings: Record<string, { title: string; subtitle: string }> = {
  "Dashboard": { title: "Studio Dentistico Dott. Scognamiglio", subtitle: "Mercoledì, 1 Luglio 2026 — Benvenuto, Dott. Giovanni Scognamiglio" },
  "Pazienti": { title: "Elenco & Cartelle Cliniche Pazienti", subtitle: "Anagrafica studio, storico prestazioni e schede cliniche con radiografie" },
  "Chat": { title: "Chat & Comunicazioni Pazienti", subtitle: "Triage urgenze odontoiatriche, recall semestrali e messaggistica WhatsApp" },
  "Agenda & Appuntamenti": { title: "Agenda & Appuntamenti", subtitle: "Planning poltrone cliniche, igiene e chirurgia sincronizzato con Google/Apple" },
  "Piani di Cura & Preventivi": { title: "Piani di Cura & Preventivi", subtitle: "Preventivi clinici, piani di trattamento 3D e accettazione pazienti" },
  "Attività Cliniche & Studio": { title: "Attività Cliniche & Studio", subtitle: "Kanban operativo: sterilizzazione, laboratorio odontotecnico e ordini forniture" },
};

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
  const [syncNotice, setSyncNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const { title, subtitle } = pageHeadings[activeNav] ?? { title: activeNav, subtitle: "Presto disponibile" };

  // Ritorno da OAuth / deep link: ?module=calendar&sync=google-ok|google-error
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const moduleParam = params.get("module");
    const sync = params.get("sync");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizzazione con URL (deep link/OAuth)
    if (moduleParam === "calendar") setActiveNav("Agenda & Appuntamenti");
    if (sync === "google-ok") setSyncNotice({ type: "success", text: "Google Calendar collegato con successo." });
    else if (sync === "google-error") setSyncNotice({ type: "error", text: "Connessione a Google Calendar non riuscita. Riprova." });
    if (moduleParam || sync) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (!syncNotice) return;
    const timer = setTimeout(() => setSyncNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [syncNotice]);

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

          {/* Sync notice (ritorno OAuth) */}
          {syncNotice && (
            <div
              role="status"
              className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border text-xs font-semibold
                ${syncNotice.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}
            >
              <span>{syncNotice.text}</span>
              <button onClick={() => setSyncNotice(null)} className="p-0.5 opacity-60 hover:opacity-100" title="Chiudi" aria-label="Chiudi">
                <X size={12} />
              </button>
            </div>
          )}

          {/* Page Heading */}
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">{title}</h1>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>

          {activeNav === "Dashboard" ? (
            <DashboardPage onNavigate={setActiveNav} />
          ) : activeNav === "Pazienti" ? (
            <PatientsPage />
          ) : activeNav === "Chat" ? (
            <MessagingPage />
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
