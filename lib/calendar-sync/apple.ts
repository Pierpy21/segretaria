// Server-only. Integrazione iCloud Calendar via CalDAV (Basic auth con password specifica per app).
// Credenziali passate da connect() e salvate cifrate in calendar_connections (nessuna env).
import "server-only";
import { randomUUID } from "node:crypto";
import type { AppleConnectInput } from "@/app/types/api";
import type { CreateEventInput, SyncedEvent } from "@/app/types/calendar-sync";
import { CalendarSyncError } from "./errors";
import { buildIcsEvent, parseIcsEvents } from "./ics";
import { deleteConnection, loadConnection, saveConnection } from "./connections";
import { formatOffsetIso, getCalendarTimeZone, normalizeLocalDateTime, parseToUtcMs, toCalDavUtc } from "./time";

const CALDAV_ROOT = "https://caldav.icloud.com/";
const TIMEOUT_MS = 20_000;
const AUTH_ERROR = "Credenziali Apple non valide (usa una password specifica per app)";

const PROPFIND_PRINCIPAL = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;

const PROPFIND_HOME_SET = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`;

const PROPFIND_CALENDARS = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/></d:prop></d:propfind>`;

/** Credenziali Apple cifrate in calendar_connections.credentials_encrypted */
export interface AppleCredentials {
  appleId: string;
  appPassword: string;
}

interface CalendarInfo {
  url: string;
  name: string;
}

interface DavResponse {
  status: number;
  text: string;
}

function credentialsHeader(creds: AppleCredentials): string {
  return `Basic ${Buffer.from(`${creds.appleId}:${creds.appPassword}`, "utf8").toString("base64")}`;
}

/** Le credenziali non devono mai partire verso host diversi da iCloud. */
function assertIcloudUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CalendarSyncError("URL CalDAV non valido", 502);
  }
  const host = parsed.hostname;
  if (parsed.protocol !== "https:" || !(host === "icloud.com" || host.endsWith(".icloud.com"))) {
    throw new CalendarSyncError("Host CalDAV non consentito", 502);
  }
}

async function davRequest(
  creds: AppleCredentials,
  url: string,
  method: string,
  body?: string,
  headers: Record<string, string> = {},
): Promise<DavResponse> {
  assertIcloudUrl(url);
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: credentialsHeader(creds),
        "Content-Type": "application/xml; charset=utf-8",
        ...headers,
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new CalendarSyncError("Impossibile contattare iCloud Calendar", 502);
  }
  if (res.status === 401) throw new CalendarSyncError(AUTH_ERROR, 401);
  return { status: res.status, text: await res.text() };
}

function assertStatus(res: DavResponse, context: string, accepted: number[]): void {
  if (!accepted.includes(res.status)) {
    throw new CalendarSyncError(`iCloud Calendar: errore durante ${context} (HTTP ${res.status})`, 502);
  }
}

// ---------- Helper XML tolleranti ai prefissi di namespace ----------

const NAMED_ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** Decodifica entità XML in un solo passaggio (evita doppie decodifiche). */
export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, ent: string) => {
    if (ent[0] === "#") {
      const n = ent[1] === "x" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    return NAMED_ENTITIES[ent] ?? match;
  });
}

/** Contenuto (non self-closing) del primo elemento con quel nome locale. */
function innerOf(xml: string, localName: string): string | undefined {
  const re = new RegExp(
    `<(?:\\w+:)?${localName}(?:\\s[^>]*[^/>])?>([\\s\\S]*?)</(?:\\w+:)?${localName}>`,
  );
  const m = re.exec(xml);
  return m ? m[1] : undefined;
}

/** Spezza una multistatus nei singoli <response>. */
function splitResponses(xml: string): string[] {
  return xml.split(/<(?:\w+:)?response(?:\s[^>]*[^/>])?>/).slice(1);
}

/** Href contenuto nella proprietà indicata (es. current-user-principal). */
function propertyHref(xml: string, property: string): string | undefined {
  const block = innerOf(xml, property);
  if (block === undefined) return undefined;
  const href = innerOf(block, "href");
  return href === undefined ? undefined : decodeXml(href).trim();
}

function calendarDataOf(response: string): string | undefined {
  const raw = innerOf(response, "calendar-data");
  if (raw === undefined) return undefined;
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  return cdata ? cdata[1] : decodeXml(raw);
}

function safeDecodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function parseCalendars(xml: string, baseUrl: string): CalendarInfo[] {
  const out: CalendarInfo[] = [];
  for (const response of splitResponses(xml)) {
    const rawHref = innerOf(response, "href");
    if (!rawHref) continue;

    const resourceType = innerOf(response, "resourcetype");
    if (!resourceType || !/<(?:\w+:)?calendar(?:\s[^>]*)?\/?>/.test(resourceType)) continue;

    const components = innerOf(response, "supported-calendar-component-set");
    if (components !== undefined && !/<(?:\w+:)?comp\s[^>]*?name\s*=\s*["']VEVENT["']/i.test(components)) {
      continue;
    }

    const absolute = new URL(decodeXml(rawHref).trim(), baseUrl).href;
    const url = absolute.endsWith("/") ? absolute : `${absolute}/`;
    const displayName = innerOf(response, "displayname");
    const name = displayName ? decodeXml(displayName).trim() : "";
    const lastSegment = url.split("/").filter(Boolean).pop() ?? "calendario";
    out.push({ url, name: name || safeDecodeSegment(lastSegment) });
  }
  return out;
}

// ---------- Scoperta calendario ----------

/** Scopre principal, home set e calendario di eventi con le credenziali fornite. */
async function discoverCalendar(creds: AppleCredentials, calendarName?: string): Promise<CalendarInfo> {
  const root = await davRequest(creds, CALDAV_ROOT, "PROPFIND", PROPFIND_PRINCIPAL, { Depth: "0" });
  assertStatus(root, "ricerca account", [200, 207]);
  const principalHref = propertyHref(root.text, "current-user-principal");
  if (!principalHref) throw new CalendarSyncError("iCloud Calendar: principal CalDAV non trovato", 502);
  const principalUrl = new URL(principalHref, CALDAV_ROOT).href;

  const principal = await davRequest(creds, principalUrl, "PROPFIND", PROPFIND_HOME_SET, { Depth: "0" });
  assertStatus(principal, "ricerca calendar-home-set", [200, 207]);
  const homeHref = propertyHref(principal.text, "calendar-home-set");
  if (!homeHref) throw new CalendarSyncError("iCloud Calendar: calendar-home-set non trovato", 502);
  const homeUrl = new URL(homeHref, principalUrl).href;

  const listing = await davRequest(creds, homeUrl, "PROPFIND", PROPFIND_CALENDARS, { Depth: "1" });
  assertStatus(listing, "elenco calendari", [200, 207]);
  const calendars = parseCalendars(listing.text, homeUrl);
  if (calendars.length === 0) {
    throw new CalendarSyncError("Nessun calendario di eventi trovato su iCloud", 404);
  }

  const wanted = calendarName?.trim() || undefined;
  const chosen = wanted ? calendars.find((c) => c.name === wanted) : calendars[0];
  if (!chosen) throw new CalendarSyncError(`Calendario iCloud "${wanted}" non trovato`, 404);
  return chosen;
}

// ---------- API pubblica ----------

interface AppleSession {
  creds: AppleCredentials;
  calendarUrl: string;
}

async function appleSession(companyId: string): Promise<AppleSession> {
  const conn = await loadConnection<AppleCredentials>(companyId, "apple");
  if (!conn?.calendarId) throw new CalendarSyncError("Apple Calendar non collegato", 409);
  return { creds: conn.credentials, calendarUrl: conn.calendarId };
}

/** Verifica le credenziali, sceglie il calendario e salva la connessione cifrata. */
export async function connect(companyId: string, input: AppleConnectInput): Promise<void> {
  const appleId = input.appleId.trim();
  const appPassword = input.appPassword.trim();
  if (!appleId || !appPassword) {
    throw new CalendarSyncError("Apple ID e password specifica per app sono obbligatori", 400);
  }
  const creds: AppleCredentials = { appleId, appPassword };
  const calendar = await discoverCalendar(creds, input.calendarName);

  await saveConnection(companyId, "apple", {
    account: appleId,
    calendarId: calendar.url,
    calendarName: calendar.name,
    credentials: creds,
  });
}

/** Elenca gli eventi nell'intervallo tramite REPORT calendar-query con expand. */
export async function listEvents(companyId: string, fromISO: string, toISO: string): Promise<SyncedEvent[]> {
  const { creds, calendarUrl } = await appleSession(companyId);
  const tz = getCalendarTimeZone();
  const start = toCalDavUtc(Date.parse(fromISO));
  const end = toCalDavUtc(Date.parse(toISO));

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
<d:prop><d:getetag/><c:calendar-data><c:expand start="${start}" end="${end}"/></c:calendar-data></d:prop>
<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${start}" end="${end}"/></c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`;

  const res = await davRequest(creds, calendarUrl, "REPORT", body, { Depth: "1" });
  assertStatus(res, "lettura eventi", [200, 207]);

  const events: SyncedEvent[] = [];
  for (const response of splitResponses(res.text)) {
    const rawHref = innerOf(response, "href");
    const ics = calendarDataOf(response);
    if (!rawHref || !ics) continue;
    const href = new URL(decodeXml(rawHref).trim(), calendarUrl).href;

    for (const ev of parseIcsEvents(ics, tz)) {
      events.push({
        externalId: ev.recurrenceId ? `${href}#${ev.recurrenceId}` : href,
        provider: "apple",
        title: ev.title,
        description: ev.description,
        start: ev.start,
        end: ev.end,
        allDay: ev.allDay,
      });
    }
  }
  return events;
}

/** Crea un evento (PUT di un .ics nuovo, If-None-Match: *). */
export async function createEvent(companyId: string, input: CreateEventInput): Promise<SyncedEvent> {
  const { creds, calendarUrl } = await appleSession(companyId);
  const tz = getCalendarTimeZone();
  const start = normalizeLocalDateTime(input.start, tz);
  const end = normalizeLocalDateTime(input.end, tz);
  const startMs = start ? parseToUtcMs(start, tz) : null;
  const endMs = end ? parseToUtcMs(end, tz) : null;
  if (!start || !end || startMs === null || endMs === null || endMs <= startMs) {
    throw new CalendarSyncError("Intervallo date evento non valido", 400);
  }

  const uid = randomUUID();
  const url = `${calendarUrl}${uid}.ics`;
  const description = input.description ?? "";
  const ics = buildIcsEvent({
    uid,
    dtstamp: toCalDavUtc(Date.now()),
    title: input.title,
    description,
    startWall: start.replace(/[-:]/g, ""),
    endWall: end.replace(/[-:]/g, ""),
    tz,
  });

  const res = await davRequest(creds, url, "PUT", ics, {
    "Content-Type": "text/calendar; charset=utf-8",
    "If-None-Match": "*",
  });
  assertStatus(res, "creazione evento", [200, 201, 204]);

  return {
    externalId: url,
    provider: "apple",
    title: input.title,
    description,
    start: formatOffsetIso(startMs, tz),
    end: formatOffsetIso(endMs, tz),
    allDay: false,
  };
}

/** Elimina la risorsa CalDAV. Accetta solo href dentro il calendario collegato. */
export async function deleteEvent(companyId: string, externalId: string): Promise<void> {
  const { creds, calendarUrl } = await appleSession(companyId);
  const href = externalId.split("#")[0];
  if (!href.startsWith(calendarUrl) || href.length <= calendarUrl.length) {
    throw new CalendarSyncError("Evento non appartenente al calendario iCloud collegato", 400);
  }
  const res = await davRequest(creds, href, "DELETE");
  if ((res.status >= 200 && res.status < 300) || res.status === 404 || res.status === 410) return;
  assertStatus(res, "eliminazione evento", []);
}

/** Rimuove la connessione Apple (le credenziali sono cancellate dal DB). */
export async function disconnect(companyId: string): Promise<void> {
  await deleteConnection(companyId, "apple");
}
