// Contratto condiviso tra API (/api/calendar/*) e UI per la sincronizzazione reale dei calendari.

export type SyncProvider = "google" | "apple";

export interface ProviderStatus {
  /** Credenziali/env presenti lato server */
  configured: boolean;
  /** Token/connessione validi e salvati */
  connected: boolean;
  /** Email Google o Apple ID, se disponibile */
  account?: string;
  /** Nome del calendario remoto in uso */
  calendarName?: string;
  /** ISO dell'ultima sincronizzazione riuscita */
  lastSync?: string;
  error?: string;
}

export interface SyncStatusResponse {
  google: ProviderStatus;
  apple: ProviderStatus;
}

/** Evento normalizzato proveniente da un calendario esterno */
export interface SyncedEvent {
  /** ID evento Google oppure href CalDAV (Apple) */
  externalId: string;
  provider: SyncProvider;
  title: string;
  description: string;
  /** ISO 8601 con offset, oppure YYYY-MM-DD se allDay */
  start: string;
  end: string;
  allDay: boolean;
}

export interface CreateEventInput {
  provider: SyncProvider;
  title: string;
  description?: string;
  /** ISO 8601 locale, es. "2026-10-13T09:30:00" (fuso CALENDAR_TIMEZONE) */
  start: string;
  end: string;
}

export type ApiResult<T> = { success: true; data: T } | { success: false; error: string };
