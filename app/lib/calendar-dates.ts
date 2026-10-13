// Utilità date per l'Agenda. Client-safe: nessuna dipendenza server.
import type { MonthCell, ViewMode } from "@/app/types/calendar";

export const ALL_DAY_LABEL = "Tutto il giorno";

const pad = (n: number) => String(n).padStart(2, "0");

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Data locale → "YYYY-MM-DD" */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" → Date a mezzanotte locale */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Sposta di n mesi mantenendo il giorno, clampato all'ultimo giorno del mese destinazione */
export function addMonths(iso: string, n: number): string {
  const d = parseISODate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

/** Lunedì della settimana che contiene la data */
export function startOfWeek(iso: string): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISODate(d);
}

/** Griglia mese lunedì-domenica (multipli di 7 celle, con giorni adiacenti) */
export function buildMonthGrid(year: number, month: number, todayISO = toISODate(new Date())): MonthCell[] {
  const last = new Date(year, month + 1, 0);
  const cursor = parseISODate(startOfWeek(toISODate(new Date(year, month, 1))));
  const cells: MonthCell[] = [];
  while (cursor <= last || cells.length % 7 !== 0) {
    const date = toISODate(cursor);
    cells.push({
      date,
      dateNum: cursor.getDate(),
      inMonth: cursor.getMonth() === month,
      isToday: date === todayISO,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

/** 7 celle (lun-dom) della settimana che contiene la data */
export function buildWeek(iso: string, todayISO = toISODate(new Date())): MonthCell[] {
  const monday = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, dateNum: parseISODate(date).getDate(), inMonth: true, isToday: date === todayISO };
  });
}

/** Intervallo YYYY-MM-DD [from, to) (to esclusivo) da passare all'API per la vista corrente */
export function getVisibleRange(view: ViewMode, iso: string): { from: string; to: string } {
  const d = parseISODate(iso);
  let start: Date;
  let end: Date;
  if (view === "Week") {
    start = parseISODate(startOfWeek(iso));
    end = parseISODate(addDays(toISODate(start), 7));
  } else if (view === "Day") {
    start = d;
    end = parseISODate(addDays(iso, 1));
  } else {
    start = new Date(d.getFullYear(), d.getMonth(), 1);
    end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return { from: toISODate(start), to: toISODate(end) };
}

/** "Ottobre 2026" */
export function formatMonthLabel(iso: string): string {
  return capitalize(new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(parseISODate(iso)));
}

/** "Martedì 13 ottobre 2026" */
export function formatLongDate(iso: string): string {
  return capitalize(
    new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
      parseISODate(iso)
    )
  );
}

/** "12 ott – 18 ott 2026" */
export function formatWeekLabel(iso: string): string {
  const start = parseISODate(startOfWeek(iso));
  const end = parseISODate(addDays(toISODate(start), 6));
  const fmt = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });
  return `${fmt.format(start)} – ${fmt.format(end)} ${end.getFullYear()}`;
}

/** ISO con offset → "HH:mm" in ora locale */
export function formatTimeLocal(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "HH:mm" + minuti, clampato a 23:59 */
export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Data + ora → "YYYY-MM-DDTHH:mm:00" (ora locale, senza offset) */
export function localDateTime(date: string, time: string): string {
  return `${date}T${time}:00`;
}
