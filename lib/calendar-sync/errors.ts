// Server-only. Errore applicativo con status HTTP suggerito per la route.
export class CalendarSyncError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "CalendarSyncError";
    this.status = status;
  }
}
