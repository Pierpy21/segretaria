import type { CalendarEventData, ReminderData, MonthCell } from "@/app/types/calendar";

export const MONTH_LABEL = "July 2026";

export const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const MONTH_GRID: MonthCell[] = [
  { dateNum: 29, inMonth: false, isToday: false },
  { dateNum: 30, inMonth: false, isToday: false },
  { dateNum: 1, inMonth: true, isToday: true },
  { dateNum: 2, inMonth: true, isToday: false },
  { dateNum: 3, inMonth: true, isToday: false },
  { dateNum: 4, inMonth: true, isToday: false },
  { dateNum: 5, inMonth: true, isToday: false },
  { dateNum: 6, inMonth: true, isToday: false },
  { dateNum: 7, inMonth: true, isToday: false },
  { dateNum: 8, inMonth: true, isToday: false },
  { dateNum: 9, inMonth: true, isToday: false },
  { dateNum: 10, inMonth: true, isToday: false },
  { dateNum: 11, inMonth: true, isToday: false },
  { dateNum: 12, inMonth: true, isToday: false },
  { dateNum: 13, inMonth: true, isToday: false },
  { dateNum: 14, inMonth: true, isToday: false },
  { dateNum: 15, inMonth: true, isToday: false },
  { dateNum: 16, inMonth: true, isToday: false },
  { dateNum: 17, inMonth: true, isToday: false },
  { dateNum: 18, inMonth: true, isToday: false },
  { dateNum: 19, inMonth: true, isToday: false },
  { dateNum: 20, inMonth: true, isToday: false },
  { dateNum: 21, inMonth: true, isToday: false },
  { dateNum: 22, inMonth: true, isToday: false },
  { dateNum: 23, inMonth: true, isToday: false },
  { dateNum: 24, inMonth: true, isToday: false },
  { dateNum: 25, inMonth: true, isToday: false },
  { dateNum: 26, inMonth: true, isToday: false },
  { dateNum: 27, inMonth: true, isToday: false },
  { dateNum: 28, inMonth: true, isToday: false },
  { dateNum: 29, inMonth: true, isToday: false },
  { dateNum: 30, inMonth: true, isToday: false },
  { dateNum: 31, inMonth: true, isToday: false },
  { dateNum: 1, inMonth: false, isToday: false },
  { dateNum: 2, inMonth: false, isToday: false },
];

export const INITIAL_EVENTS: CalendarEventData[] = [
  { id: 1, title: "Urgenza dolore — Rossi E.", time: "09:30", dateNum: 1, color: "#ef4444", source: "AI Secretary", description: "Slot emergenza odontoiatrica prenotato dall'AI tramite WhatsApp (Poltrona 1).", isAiGenerated: true },
  { id: 2, title: "Igiene & Detartrasi — Dott.ssa Alunni", time: "11:00", dateNum: 1, color: "#0d9488", source: "Manual", description: "Seduta di igiene professionale e profilassi, paziente Ferrari.", isAiGenerated: false },
  { id: 3, title: "Impianto Singolo 3.6 — Ferrero R.", time: "14:30", dateNum: 1, color: "#3b82f6", source: "Google Calendar", description: "Intervento chirurgico implantare Straumann con Dott. Renzi.", isAiGenerated: false },
  { id: 4, title: "Prima Visita + Ortopanoramica", time: "16:30", dateNum: 1, color: "#8b5cf6", source: "AI Secretary", description: "Nuovo paziente prenotato tramite form online / WhatsApp.", isAiGenerated: true },
  { id: 5, title: "Terapia Canalare 4.6 — Mancini", time: "10:00", dateNum: 2, color: "#f59e0b", source: "Manual", description: "Seconda seduta devitalizzazione molare inferiore.", isAiGenerated: false },
  { id: 6, title: "Controllo Invisalign — Moretti", time: "11:30", dateNum: 2, color: "#10b981", source: "AI Secretary", description: "Check progressi allineatori e consegna set mascherine 6-10.", isAiGenerated: true },
  { id: 7, title: "Consegna Corona Zirconia — Lab", time: "09:00", dateNum: 6, color: "#3b82f6", source: "Google Calendar", description: "Ritiro manufatto protesico dal laboratorio odontotecnico e prova in poltrona.", isAiGenerated: false },
  { id: 8, title: "Sbiancamento Dentale Led — Vitali", time: "15:00", dateNum: 8, color: "#10b981", source: "AI Secretary", description: "Ciclo di sbiancamento dentale alla poltrona pre-matrimonio.", isAiGenerated: true },
  { id: 9, title: "Manutenzione & Test Autoclavi Classe B", time: "08:30", dateNum: 14, color: "#8b5cf6", source: "Manual", description: "Verifica periodica cicli sterilizzazione e sostituzione filtri acqua osmotizzata.", isAiGenerated: false },
  { id: 10, title: "Chirurgia Rigenerativa — Marchetti", time: "15:30", dateNum: 21, color: "#ef4444", source: "Manual", description: "Rialzo di seno mascellare e innesto biomateriale per riabilitazione All-on-4.", isAiGenerated: false },
];

export const INITIAL_REMINDERS: ReminderData[] = [
  { id: 1, text: "Test biologico spore autoclave (Ciclo sterilizzazione #42)", time: "08:15", priority: "high", status: "active" },
  { id: 2, text: "Recall WhatsApp: contattare Elena Rossi per verifica dolore post-cura", time: "10:00", priority: "high", status: "active" },
  { id: 3, text: "Ritiro dima chirurgica guidata dal laboratorio odontotecnico", time: "12:00", priority: "medium", status: "active" },
  { id: 4, text: "Invio promemoria richiamo igiene semestrale a 15 pazienti", time: "15:30", priority: "medium", status: "active" },
  { id: 5, text: "Sincronizzazione agenda Google Calendar studio", time: "09:00", priority: "low", status: "resolved" },
  { id: 6, text: "Archiviazione consensi informati e cartelle cliniche firmate", time: "18:00", priority: "low", status: "active" },
];

