// Conversioni puramente funzionali tra DB e formati UI (date/ore/valuta in italiano).
import { parseToUtcMs, wallInZone } from "@/lib/calendar-sync/time";
import { ValidationError } from "@/lib/errors";

const MONTHS_LONG = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];
const MONTHS_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id UUID validato prima della query (evita errori 22P02 del DB → 500). */
export function assertUuid(value: string, label = "id"): string {
  if (!UUID_RE.test(value)) throw new ValidationError(`${label} non valido`);
  return value;
}

/** Primo elemento di un risultato: lancia se assente (INSERT/UPDATE ... RETURNING). */
export function first<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (!row) throw new Error(`Nessuna riga restituita: ${what}`);
  return row;
}

/** Divide in blocchi (limite parametri del driver Postgres). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Istante → "HH:mm" nel fuso indicato */
export function timeInZone(instant: Date, tz: string): string {
  const w = wallInZone(instant.getTime(), tz);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

/** Istante → "YYYY-MM-DD" nel fuso indicato */
export function dateInZone(instant: Date, tz: string): string {
  const w = wallInZone(instant.getTime(), tz);
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`;
}

/** Data "YYYY-MM-DD" + ora "HH:mm" (fuso indicato) → istante */
export function instantOf(date: string, time: string, tz: string): Date {
  const ms = parseToUtcMs(`${date}T${time}:00`, tz);
  if (ms === null) throw new ValidationError("Data od ora non valida");
  return new Date(ms);
}

/** Data ISO valida ("YYYY-MM-DD") oppure "d Mese yyyy" in italiano (anche abbreviato). */
export function parseDateInput(input: string): string | null {
  const s = input.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return isValidYmd(+iso[1], +iso[2], +iso[3]) ? s : null;

  const it = /^(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})$/.exec(s);
  if (!it) return null;
  const key = it[2].slice(0, 3).toLowerCase();
  const month = [...MONTHS_SHORT].map((m) => m.toLowerCase()).indexOf(key) + 1;
  if (month === 0) return null;
  const y = +it[3];
  const d = +it[1];
  return isValidYmd(y, month, d) ? `${pad(y, 4)}-${pad(month)}-${pad(d)}` : null;
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCDate() === d && probe.getUTCMonth() === m - 1;
}

/** "1995-06-14" → "14 giugno 1995" (come toLocaleDateString it-IT lato UI) */
export function formatItalianLong(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

/** "2026-07-01" → "1 Lug 2026" */
export function formatItalianShort(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** 1234.5 → "€1.234,50" (nessun decimale se intero, come nei mock "€1.450") */
export function formatEuro(amount: number): string {
  return `€${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(amount)}`;
}

/** "€1.234" / "€1.234,50" → 1234 / 1234.5 (NaN se non valido) */
export function parseEuro(value: string): number {
  return Number(value.replace(/[€\s.]/g, "").replace(",", "."));
}

/** Età in anni compiuti alla data "oggi" nel fuso indicato */
export function ageFrom(isoBirthDate: string, now: Date, tz: string): number {
  const [by, bm, bd] = isoBirthDate.split("-").map(Number);
  const w = wallInZone(now.getTime(), tz);
  let age = w.year - by;
  if (w.month < bm || (w.month === bm && w.day < bd)) age -= 1;
  return age;
}

/** "Elena Rossi" → "ER" */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

/** Istante → "2m" / "1h" / "3g" (come nei mock della chat) */
export function relativeShort(instant: Date | null, now: Date): string {
  if (!instant) return "";
  const diffMin = Math.max(0, Math.floor((now.getTime() - instant.getTime()) / 60_000));
  if (diffMin < 1) return "ora";
  if (diffMin < 60) return `${diffMin}m`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}g`;
}

/** Slug URL-friendly da un nome (ASCII, minuscolo) */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "studio";
}
