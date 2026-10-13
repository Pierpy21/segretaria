import "server-only";
import { NextResponse } from "next/server";
import { API_ERROR, type ApiResult } from "@/app/types/api";
import { CalendarSyncError } from "@/lib/calendar-sync/errors";
import { NoCompanyError, UnauthorizedError } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError, pgErrorCode } from "@/lib/errors";

/** Risposta di successo: { success: true, data } */
export function apiOk<T>(data: T, status = 200): NextResponse<ApiResult<T>> {
  return NextResponse.json<ApiResult<T>>({ success: true, data }, { status });
}

/** Risposta di errore: { success: false, error } */
export function apiFail(error: string, status = 400): NextResponse<ApiResult<never>> {
  return NextResponse.json<ApiResult<never>>({ success: false, error }, { status });
}

/**
 * Converte qualsiasi eccezione in ApiResult. Non espone dettagli interni:
 * il messaggio reale finisce solo nei log del server.
 */
export function handleApiError(err: unknown): NextResponse<ApiResult<never>> {
  if (err instanceof UnauthorizedError) return apiFail(API_ERROR.UNAUTHORIZED, 401);
  if (err instanceof NoCompanyError) return apiFail(API_ERROR.NO_COMPANY, 409);
  if (err instanceof ValidationError) return apiFail(err.message, 400);
  if (err instanceof NotFoundError) return apiFail(err.message, 404);
  if (err instanceof ConflictError) return apiFail(err.message, 409);
  if (err instanceof CalendarSyncError) return apiFail(err.message, err.status);

  const code = pgErrorCode(err);
  if (code === "42501") {
    console.warn("[api] permesso negato dal database", code);
    return apiFail("Operazione non consentita", 403);
  }
  if (code === "23505") {
    return apiFail("Operazione in conflitto con un dato esistente", 409);
  }

  console.error("[api] errore interno", err);
  return apiFail("Errore interno del server", 500);
}
