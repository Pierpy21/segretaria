// Server-only. Integrazione Google Calendar (OAuth 2.0 authorization code + REST v3).
// Client id/secret restano in env; token per azienda in calendar_connections (cifrati).
import "server-only";
import type { CreateEventInput, SyncedEvent } from "@/app/types/calendar-sync";
import { CalendarSyncError } from "./errors";
import { deleteConnection, loadConnection, saveConnection, updateCredentials } from "./connections";
import { getCalendarTimeZone, normalizeLocalDateTime } from "./time";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API_BASE = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.events openid email";
const DEFAULT_REDIRECT_URI = "http://localhost:3000/api/calendar/google/callback";
const REFRESH_MARGIN_MS = 60_000;
const TIMEOUT_MS = 15_000;
const MAX_PAGES = 10;
const SESSION_EXPIRED = "Sessione Google scaduta, ricollega l'account";

/** Credenziali Google cifrate in calendar_connections.credentials_encrypted */
export interface GoogleCredentials {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms di scadenza dell'access token */
  expiresAt: number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GoogleEventItem {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function requireConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = env("GOOGLE_CLIENT_ID");
  const clientSecret = env("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new CalendarSyncError(
      "Google Calendar non configurato: imposta GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET",
      400,
    );
  }
  return {
    clientId,
    clientSecret,
    redirectUri: env("GOOGLE_REDIRECT_URI") ?? DEFAULT_REDIRECT_URI,
  };
}

function eventsUrl(calendarId: string): string {
  return `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
}

export function isGoogleConfigured(): boolean {
  return !!(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));
}

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = requireConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new CalendarSyncError("Impossibile contattare Google (token endpoint)", 502);
  }
  const json = (await res.json().catch(() => null)) as TokenResponse | null;
  if (!res.ok || !json) {
    if (json?.error === "invalid_grant") throw new CalendarSyncError(SESSION_EXPIRED, 401);
    throw new CalendarSyncError(
      `Errore token Google (HTTP ${res.status}): ${json?.error_description ?? json?.error ?? "risposta non valida"}`,
      502,
    );
  }
  return json;
}

/** Ricava l'email dal payload dell'id_token (base64url, senza verifica di firma: il token arriva via TLS dal token endpoint). */
function emailFromIdToken(idToken: string, clientId: string): string | undefined {
  const segment = idToken.split(".")[1];
  if (!segment) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as {
      email?: unknown;
      aud?: unknown;
      iss?: unknown;
    };
    const issOk = payload.iss === "accounts.google.com" || payload.iss === "https://accounts.google.com";
    if (!issOk || payload.aud !== clientId) return undefined;
    return typeof payload.email === "string" ? payload.email : undefined;
  } catch {
    return undefined;
  }
}

/** Scambia il codice OAuth con i token e salva la connessione dell'azienda. */
export async function connectWithCode(companyId: string, code: string): Promise<void> {
  const { clientId, clientSecret, redirectUri } = requireConfig();
  const tok = await postToken({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  if (tok.scope && !tok.scope.includes("auth/calendar.events")) {
    throw new CalendarSyncError("Permesso di gestione calendario Google non concesso", 403);
  }

  const current = await loadConnection<GoogleCredentials>(companyId, "google");
  const refreshToken = tok.refresh_token ?? current?.credentials.refreshToken;
  if (!tok.access_token || !refreshToken) {
    throw new CalendarSyncError(
      "Google non ha restituito un refresh token: revoca l'accesso su myaccount.google.com e riprova",
      502,
    );
  }

  const account = tok.id_token ? emailFromIdToken(tok.id_token, clientId) : undefined;
  const credentials: GoogleCredentials = {
    accessToken: tok.access_token,
    refreshToken,
    expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
  };

  await saveConnection(companyId, "google", {
    account: account ?? current?.account ?? null,
    calendarId: env("GOOGLE_CALENDAR_ID") ?? "primary",
    calendarName: null,
    credentials,
  });
}

interface GoogleSession {
  accessToken: string;
  calendarId: string;
}

/** Access token valido + calendario della connessione; rinnova il token se scaduto. */
async function googleSession(companyId: string): Promise<GoogleSession> {
  const conn = await loadConnection<GoogleCredentials>(companyId, "google");
  if (!conn) throw new CalendarSyncError("Google Calendar non collegato", 409);

  const calendarId = conn.calendarId ?? "primary";
  const cred = conn.credentials;
  if (cred.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return { accessToken: cred.accessToken, calendarId };
  }

  const { clientId, clientSecret } = requireConfig();
  let tok: TokenResponse;
  try {
    tok = await postToken({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: cred.refreshToken,
      grant_type: "refresh_token",
    });
  } catch (err) {
    // Refresh token revocato o scaduto: il collegamento non è più utilizzabile.
    if (err instanceof CalendarSyncError && err.status === 401) {
      await deleteConnection(companyId, "google");
    }
    throw err;
  }
  if (!tok.access_token) {
    await deleteConnection(companyId, "google");
    throw new CalendarSyncError(SESSION_EXPIRED, 401);
  }

  const refreshed: GoogleCredentials = {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? cred.refreshToken,
    expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
  };
  await updateCredentials(companyId, "google", refreshed);
  return { accessToken: refreshed.accessToken, calendarId };
}

async function googleApi(
  session: GoogleSession,
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401) throw new CalendarSyncError(SESSION_EXPIRED, 401);
  return res;
}

async function errorMessage(res: Response, context: string): Promise<string> {
  const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return `Google Calendar: errore durante ${context} (HTTP ${res.status})${json?.error?.message ? `: ${json.error.message}` : ""}`;
}

function toSyncedEvent(item: GoogleEventItem): SyncedEvent | null {
  if (!item.id || item.status === "cancelled") return null;
  const allDay = !item.start?.dateTime && !!item.start?.date;
  const start = item.start?.dateTime ?? item.start?.date;
  if (!start) return null;
  return {
    externalId: item.id,
    provider: "google",
    title: item.summary?.trim() || "(senza titolo)",
    description: item.description ?? "",
    start,
    end: item.end?.dateTime ?? item.end?.date ?? start,
    allDay,
  };
}

/** Elenca gli eventi nell'intervallo [fromISO, toISO) (ISO 8601 con offset o Z). */
export async function listEvents(companyId: string, fromISO: string, toISO: string): Promise<SyncedEvent[]> {
  const session = await googleSession(companyId);
  const events: SyncedEvent[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      timeMin: new Date(fromISO).toISOString(),
      timeMax: new Date(toISO).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await googleApi(session, `${eventsUrl(session.calendarId)}?${params.toString()}`);
    if (!res.ok) throw new CalendarSyncError(await errorMessage(res, "lettura eventi"), 502);

    const body = (await res.json()) as { items?: GoogleEventItem[]; nextPageToken?: string };
    for (const item of body.items ?? []) {
      const ev = toSyncedEvent(item);
      if (ev) events.push(ev);
    }
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return events;
}

/** Crea un evento nel calendario Google collegato, nel fuso CALENDAR_TIMEZONE. */
export async function createEvent(companyId: string, input: CreateEventInput): Promise<SyncedEvent> {
  const tz = getCalendarTimeZone();
  const start = normalizeLocalDateTime(input.start, tz);
  const end = normalizeLocalDateTime(input.end, tz);
  if (!start || !end) throw new CalendarSyncError("Data di inizio o fine non valida", 400);

  const session = await googleSession(companyId);
  const res = await googleApi(session, eventsUrl(session.calendarId), {
    method: "POST",
    body: {
      summary: input.title,
      description: input.description ?? "",
      start: { dateTime: start, timeZone: tz },
      end: { dateTime: end, timeZone: tz },
    },
  });
  if (!res.ok) throw new CalendarSyncError(await errorMessage(res, "creazione evento"), 502);

  const ev = toSyncedEvent((await res.json()) as GoogleEventItem);
  if (!ev) throw new CalendarSyncError("Risposta Google non valida alla creazione evento", 502);
  return ev;
}

/** Elimina un evento (410/404 considerati già eliminati). */
export async function deleteEvent(companyId: string, externalId: string): Promise<void> {
  const session = await googleSession(companyId);
  const res = await googleApi(session, `${eventsUrl(session.calendarId)}/${encodeURIComponent(externalId)}`, {
    method: "DELETE",
  });
  if (res.ok || res.status === 404 || res.status === 410) return;
  throw new CalendarSyncError(await errorMessage(res, "eliminazione evento"), 502);
}

/** Revoca il token presso Google (errori ignorati) e rimuove la connessione. */
export async function disconnect(companyId: string): Promise<void> {
  const conn = await loadConnection<GoogleCredentials>(companyId, "google");
  if (conn?.credentials.refreshToken) {
    try {
      await fetch(`${REVOKE_URL}?token=${encodeURIComponent(conn.credentials.refreshToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // ignorato: la connessione locale viene comunque rimossa
    }
  }
  await deleteConnection(companyId, "google");
}
