// Server-only. Validazione manuale degli input (nessuna libreria esterna).
import type { CreateEventInput, SyncProvider } from "@/app/types/calendar-sync";
import { normalizeLocalDateTime, parseToUtcMs } from "./time";

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_RANGE_MS = 400 * 86_400_000;
const MAX_TITLE = 300;
const MAX_DESCRIPTION = 5000;
const MAX_EVENT_ID = 2048;

export function parseProvider(value: unknown): Validated<SyncProvider> {
  if (value === "google" || value === "apple") return { ok: true, value };
  return { ok: false, error: "Provider non valido (atteso 'google' o 'apple')" };
}

export function parseRange(
  from: string | null,
  to: string | null,
  tz: string,
): Validated<{ fromMs: number; toMs: number }> {
  if (!from || !to) return { ok: false, error: "Parametri 'from' e 'to' obbligatori" };
  const fromMs = parseToUtcMs(from, tz);
  const toMs = parseToUtcMs(to, tz);
  if (fromMs === null || toMs === null) return { ok: false, error: "Data 'from' o 'to' non valida (ISO 8601)" };
  if (toMs <= fromMs) return { ok: false, error: "'to' deve essere successivo a 'from'" };
  if (toMs - fromMs > MAX_RANGE_MS) return { ok: false, error: "Intervallo massimo di 400 giorni" };
  return { ok: true, value: { fromMs, toMs } };
}

export function parseEventId(value: string | null): Validated<string> {
  const id = value?.trim();
  if (!id) return { ok: false, error: "Parametro 'id' obbligatorio" };
  if (id.length > MAX_EVENT_ID || /[\u0000-\u001f\u007f]/.test(id)) {
    return { ok: false, error: "Parametro 'id' non valido" };
  }
  return { ok: true, value: id };
}

export function parseCreateEventInput(body: unknown, tz: string): Validated<CreateEventInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Il corpo deve essere un oggetto JSON" };
  }
  const b = body as Record<string, unknown>;

  const provider = parseProvider(b.provider);
  if (!provider.ok) return provider;

  if (typeof b.title !== "string" || !b.title.trim()) {
    return { ok: false, error: "Titolo obbligatorio" };
  }
  if (b.title.trim().length > MAX_TITLE) return { ok: false, error: `Titolo troppo lungo (max ${MAX_TITLE})` };

  let description = "";
  if (b.description !== undefined && b.description !== null) {
    if (typeof b.description !== "string") return { ok: false, error: "Descrizione non valida" };
    if (b.description.length > MAX_DESCRIPTION) {
      return { ok: false, error: `Descrizione troppo lunga (max ${MAX_DESCRIPTION})` };
    }
    description = b.description;
  }

  if (typeof b.start !== "string" || typeof b.end !== "string") {
    return { ok: false, error: "Inizio e fine obbligatori (ISO 8601)" };
  }
  const start = normalizeLocalDateTime(b.start, tz);
  const end = normalizeLocalDateTime(b.end, tz);
  if (!start || !end) return { ok: false, error: "Data di inizio o fine non valida (ISO 8601)" };

  const startMs = parseToUtcMs(start, tz);
  const endMs = parseToUtcMs(end, tz);
  if (startMs === null || endMs === null || endMs <= startMs) {
    return { ok: false, error: "La fine deve essere successiva all'inizio" };
  }

  return {
    ok: true,
    value: { provider: provider.value, title: b.title.trim(), description, start, end },
  };
}
