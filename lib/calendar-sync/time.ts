// Server-only. Utility di fuso orario basate su Intl (nessuna dipendenza esterna).

export interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const DEFAULT_TZ = "Europe/Rome";
const HAS_OFFSET_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(tz: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatterCache.set(tz, formatter);
  }
  return formatter;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    getFormatter(tz);
    return true;
  } catch {
    return false;
  }
}

export function getCalendarTimeZone(): string {
  const tz = process.env.CALENDAR_TIMEZONE?.trim();
  return tz && isValidTimeZone(tz) ? tz : DEFAULT_TZ;
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

/** Componenti "a muro" di un istante UTC osservate nel fuso indicato. */
export function wallInZone(utcMs: number, tz: string): WallParts {
  const values: Record<string, number> = {};
  for (const part of getFormatter(tz).formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour % 24,
    minute: values.minute,
    second: values.second,
  };
}

function wallAsUtcMs(w: WallParts): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
}

/** Offset (ms) del fuso rispetto a UTC in un dato istante. */
function offsetMs(utcMs: number, tz: string): number {
  return wallAsUtcMs(wallInZone(utcMs, tz)) - Math.floor(utcMs / 1000) * 1000;
}

/** Converte un orario "a muro" nel fuso indicato in istante UTC (ms). */
export function wallToUtcMs(w: WallParts, tz: string): number {
  const naive = wallAsUtcMs(w);
  const first = naive - offsetMs(naive, tz);
  return naive - offsetMs(first, tz);
}

/** ISO 8601 con offset del fuso, es. 2026-10-13T09:30:00+02:00 */
export function formatOffsetIso(utcMs: number, tz: string): string {
  const w = wallInZone(utcMs, tz);
  const off = Math.round(offsetMs(utcMs, tz) / 60000);
  const abs = Math.abs(off);
  const sign = off < 0 ? "-" : "+";
  return `${formatWall(w)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** "YYYY-MM-DDTHH:mm:ss" */
export function formatWall(w: WallParts): string {
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}`;
}

function validateParts(w: WallParts): WallParts | null {
  if (w.month < 1 || w.month > 12 || w.hour > 23 || w.minute > 59 || w.second > 59) return null;
  const probe = new Date(Date.UTC(w.year, w.month - 1, w.day));
  if (probe.getUTCDate() !== w.day || w.day < 1) return null;
  return w;
}

/** Parsa "YYYY-MM-DDTHH:mm[:ss]" senza offset. */
export function parseWallParts(input: string): WallParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(input.trim());
  if (!m) return null;
  return validateParts({
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: m[6] ? Number(m[6]) : 0,
  });
}

/**
 * Normalizza un input ISO (con o senza offset) in "YYYY-MM-DDTHH:mm:ss" locale al fuso `tz`.
 * Ritorna null se non valido.
 */
export function normalizeLocalDateTime(input: string, tz: string): string | null {
  const trimmed = input.trim();
  if (HAS_OFFSET_RE.test(trimmed)) {
    const ms = Date.parse(trimmed);
    return Number.isNaN(ms) ? null : formatWall(wallInZone(ms, tz));
  }
  const w = parseWallParts(trimmed);
  return w ? formatWall(w) : null;
}

/** Istante UTC (ms) di un input "YYYY-MM-DD", "YYYY-MM-DDTHH:mm[:ss]" (locale) o con offset. */
export function parseToUtcMs(input: string, tz: string): number | null {
  let t = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) t = `${t}T00:00:00`;
  if (HAS_OFFSET_RE.test(t)) {
    const ms = Date.parse(t);
    return Number.isNaN(ms) ? null : ms;
  }
  const w = parseWallParts(t);
  return w ? wallToUtcMs(w, tz) : null;
}

/** Formato CalDAV UTC: yyyymmddThhmmssZ */
export function toCalDavUtc(utcMs: number): string {
  return new Date(utcMs).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
