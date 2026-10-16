import type { CalendarEventData, ReminderData } from "@/app/types/calendar";
import { toISODate } from "@/app/lib/calendar-dates";

export const DAYS_OF_WEEK = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/** Giorno (1-31) del mese corrente come YYYY-MM-DD, clampato all'ultimo giorno del mese */
function currentMonthDate(day: number): string {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return toISODate(new Date(now.getFullYear(), now.getMonth(), Math.min(day, last)));
}

// Eventi demo locali (Manual / AI Secretary). Gli eventi Google/Apple arrivano dalle API reali.
export const INITIAL_EVENTS: CalendarEventData[] = [
  { id: "1", title: "Urgenza dolore — Rossi E.", time: "09:30", date: currentMonthDate(1), color: "#ef4444", source: "AI Secretary", description: "Slot emergenza odontoiatrica prenotato dall'AI tramite WhatsApp (Poltrona 1).", isAiGenerated: true },
  { id: "2", title: "Igiene & Detartrasi — Dott.ssa Alunni", time: "11:00", date: currentMonthDate(1), color: "#0d9488", source: "Manual", description: "Seduta di igiene professionale e profilassi, paziente Ferrari.", isAiGenerated: false },
  { id: "4", title: "Prima Visita + Ortopanoramica", time: "16:30", date: currentMonthDate(1), color: "#8b5cf6", source: "AI Secretary", description: "Nuovo paziente prenotato tramite form online / WhatsApp.", isAiGenerated: true },
  { id: "5", title: "Terapia Canalare 4.6 — Mancini", time: "10:00", date: currentMonthDate(2), color: "#f59e0b", source: "Manual", description: "Seconda seduta devitalizzazione molare inferiore.", isAiGenerated: false },
  { id: "6", title: "Controllo Invisalign — Moretti", time: "11:30", date: currentMonthDate(2), color: "#10b981", source: "AI Secretary", description: "Check progressi allineatori e consegna set mascherine 6-10.", isAiGenerated: true },
  { id: "8", title: "Sbiancamento Dentale Led — Vitali", time: "15:00", date: currentMonthDate(8), color: "#10b981", source: "AI Secretary", description: "Ciclo di sbiancamento dentale alla poltrona pre-matrimonio.", isAiGenerated: true },
  { id: "9", title: "Manutenzione & Test Autoclavi Classe B", time: "08:30", date: currentMonthDate(14), color: "#8b5cf6", source: "Manual", description: "Verifica periodica cicli sterilizzazione e sostituzione filtri acqua osmotizzata.", isAiGenerated: false },
  { id: "10", title: "Chirurgia Rigenerativa — Marchetti", time: "15:30", date: currentMonthDate(21), color: "#ef4444", source: "Manual", description: "Rialzo di seno mascellare e innesto biomateriale per riabilitazione All-on-4.", isAiGenerated: false },
];

export const INITIAL_REMINDERS: ReminderData[] = [
  { id: "1", text: "Test biologico spore autoclave (Ciclo sterilizzazione #42)", time: "08:15", priority: "high", status: "active" },
  { id: "2", text: "Recall WhatsApp: contattare Elena Rossi per verifica dolore post-cura", time: "10:00", priority: "high", status: "active" },
  { id: "3", text: "Ritiro dima chirurgica guidata dal laboratorio odontotecnico", time: "12:00", priority: "medium", status: "active" },
  { id: "4", text: "Invio promemoria richiamo igiene semestrale a 15 pazienti", time: "15:30", priority: "medium", status: "active" },
  { id: "5", text: "Sincronizzazione agenda Google Calendar studio", time: "09:00", priority: "low", status: "resolved" },
  { id: "6", text: "Archiviazione consensi informati e cartelle cliniche firmate", time: "18:00", priority: "low", status: "active" },
];
