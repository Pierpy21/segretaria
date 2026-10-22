// Errori applicativi neutri (nessuna dipendenza server): mappati da lib/api.ts handleApiError.

/** Input non valido → HTTP 400 con messaggio mostrabile all'utente. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Conflitto di dominio (es. utente già membro di uno studio) → HTTP 409. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** Ruolo senza il permesso richiesto → HTTP 403 FORBIDDEN. */
export class ForbiddenError extends Error {
  constructor(message = "Operazione non consentita per il tuo ruolo") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Risorsa non trovata nello studio corrente → HTTP 404. */
export class NotFoundError extends Error {
  constructor(message = "Risorsa non trovata") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Codice Postgres (es. "42501", "23505") risalendo la catena cause di Drizzle. */
/** Nome del vincolo violato (constraint_name del driver, o CONSTRAINT di RAISE), risalendo la catena cause. */
export function pgConstraintName(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth++) {
    const name = (current as { constraint_name?: unknown; constraint?: unknown }).constraint_name
      ?? (current as { constraint?: unknown }).constraint;
    if (typeof name === "string" && name) return name;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Messaggi dell'errore Postgres risalendo la catena cause di Drizzle (il messaggio del RAISE è nella cause). */
export function pgErrorMessages(err: unknown): string[] {
  const messages: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth++) {
    const message = (current as { message?: unknown }).message;
    if (typeof message === "string") messages.push(message);
    current = (current as { cause?: unknown }).cause;
  }
  return messages;
}

export function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
