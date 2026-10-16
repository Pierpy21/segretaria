// Server-only. Parser e builder ICS (RFC 5545) minimali per VEVENT.
import { formatOffsetIso, isValidTimeZone, wallToUtcMs } from "./time";

export interface ParsedIcsEvent {
  uid: string;
  /** Valore grezzo di RECURRENCE-ID (solo per istanze di ricorrenze espanse) */
  recurrenceId?: string;
  title: string;
  description: string;
  /** ISO con offset, oppure YYYY-MM-DD se allDay */
  start: string;
  end: string;
  allDay: boolean;
}

interface RawProp {
  params: Record<string, string>;
  value: string;
}

interface ParsedTime {
  iso: string;
  utcMs: number;
  allDay: boolean;
  /** "utc" oppure nome IANA del fuso */
  zone: string;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function unfold(text: string): string[] {
  return text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}

function parseLine(line: string): { name: string; prop: RawProp } | null {
  let inQuote = false;
  let idx = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    else if (c === ":" && !inQuote) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;
  const [rawName, ...paramParts] = line.slice(0, idx).split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: rawName.toUpperCase(), prop: { params, value: line.slice(idx + 1) } };
}

export function unescapeText(value: string): string {
  return value.replace(/\\([\s\S])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Risolve un TZID (anche con prefisso "/mozilla.org/.../Europe/Rome") in un fuso IANA valido. */
function resolveZone(tzid: string): string | undefined {
  const clean = tzid.replace(/^"|"$/g, "").trim();
  if (isValidTimeZone(clean)) return clean;
  const segments = clean.split("/").filter(Boolean);
  for (let i = 1; i < segments.length; i++) {
    const candidate = segments.slice(i).join("/");
    if (isValidTimeZone(candidate)) return candidate;
  }
  return undefined;
}

function formatInZone(utcMs: number, zone: string): string {
  return zone === "utc" ? new Date(utcMs).toISOString() : formatOffsetIso(utcMs, zone);
}

function parseIcsTime(prop: RawProp, fallbackTz: string): ParsedTime | null {
  const v = prop.value.trim();
  if (prop.params.VALUE?.toUpperCase() === "DATE" || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (!m) return null;
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    return { iso, utcMs: Date.parse(`${iso}T00:00:00Z`), allDay: true, zone: "utc" };
  }

  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i.exec(v);
  if (!m) return null;
  const wall = {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6] ?? 0),
  };

  if (m[7]) {
    const utcMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
    return { iso: new Date(utcMs).toISOString(), utcMs, allDay: false, zone: "utc" };
  }

  const zone = (prop.params.TZID && resolveZone(prop.params.TZID)) || fallbackTz;
  const utcMs = wallToUtcMs(wall, zone);
  return { iso: formatOffsetIso(utcMs, zone), utcMs, allDay: false, zone };
}

/** Durata ISO 8601 (PnWnDTnHnMnS) in ms. */
function parseDurationMs(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(value.trim());
  if (!m) return null;
  const n = (x?: string) => Number(x ?? 0);
  const ms =
    n(m[2]) * 7 * DAY_MS + n(m[3]) * DAY_MS + n(m[4]) * HOUR_MS + n(m[5]) * 60_000 + n(m[6]) * 1000;
  return m[1] === "-" ? -ms : ms;
}

function finalize(props: Map<string, RawProp>, fallbackTz: string): ParsedIcsEvent | null {
  const dtStart = props.get("DTSTART");
  if (!dtStart) return null;
  if (props.get("STATUS")?.value.trim().toUpperCase() === "CANCELLED") return null;

  const start = parseIcsTime(dtStart, fallbackTz);
  if (!start) return null;

  let end: string;
  const dtEnd = props.get("DTEND");
  const endInfo = dtEnd ? parseIcsTime(dtEnd, fallbackTz) : null;
  if (endInfo) {
    end = endInfo.iso;
  } else {
    const duration = props.get("DURATION") ? parseDurationMs(props.get("DURATION")!.value) : null;
    if (start.allDay) {
      const days = duration && duration > 0 ? Math.round(duration / DAY_MS) : 1;
      end = new Date(start.utcMs + days * DAY_MS).toISOString().slice(0, 10);
    } else {
      const ms = duration && duration > 0 ? duration : HOUR_MS;
      end = formatInZone(start.utcMs + ms, start.zone);
    }
  }

  const uid = props.get("UID")?.value.trim() ?? "";
  const summary = props.get("SUMMARY");
  const description = props.get("DESCRIPTION");
  const recurrence = props.get("RECURRENCE-ID");

  return {
    uid,
    recurrenceId: recurrence?.value.trim() || undefined,
    title: summary ? unescapeText(summary.value).trim() || "(senza titolo)" : "(senza titolo)",
    description: description ? unescapeText(description.value) : "",
    start: start.iso,
    end,
    allDay: start.allDay,
  };
}

/** Estrae tutti i VEVENT (esclusi VALARM e eventi cancellati) da un calendario ICS. */
export function parseIcsEvents(ics: string, fallbackTz: string): ParsedIcsEvent[] {
  const out: ParsedIcsEvent[] = [];
  let current: Map<string, RawProp> | null = null;
  let inAlarm = false;

  for (const line of unfold(ics)) {
    if (line === "BEGIN:VEVENT") {
      current = new Map();
      inAlarm = false;
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) {
        const ev = finalize(current, fallbackTz);
        if (ev) out.push(ev);
      }
      current = null;
      continue;
    }
    if (!current) continue;
    if (line === "BEGIN:VALARM") {
      inAlarm = true;
      continue;
    }
    if (line === "END:VALARM") {
      inAlarm = false;
      continue;
    }
    if (inAlarm) continue;

    const parsed = parseLine(line);
    if (parsed && !current.has(parsed.name)) current.set(parsed.name, parsed.prop);
  }
  return out;
}

function foldLine(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74; // la riga di continuazione inizia con uno spazio
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export interface BuildIcsInput {
  uid: string;
  /** DTSTAMP in UTC, formato yyyymmddThhmmssZ */
  dtstamp: string;
  title: string;
  description: string;
  /** Orari locali compatti yyyymmddThhmmss nel fuso `tz` */
  startWall: string;
  endWall: string;
  tz: string;
}

export function buildIcsEvent(input: BuildIcsInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SegretarIA//IT",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${escapeText(input.uid)}`,
    `DTSTAMP:${input.dtstamp}`,
    `DTSTART;TZID=${input.tz}:${input.startWall}`,
    `DTEND;TZID=${input.tz}:${input.endWall}`,
    `SUMMARY:${escapeText(input.title)}`,
  ];
  if (input.description) lines.push(`DESCRIPTION:${escapeText(input.description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
