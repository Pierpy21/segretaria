// Server-only. Helper per risposte ApiResult<T> uniformi nelle route handler.
import { NextResponse } from "next/server";
import type { ApiResult } from "@/app/types/calendar-sync";
import { CalendarSyncError } from "./errors";

export function apiOk<T>(data: T, status = 200): NextResponse<ApiResult<T>> {
  return NextResponse.json<ApiResult<T>>({ success: true, data }, { status });
}

export function apiFail(error: string, status = 400): NextResponse<ApiResult<never>> {
  return NextResponse.json<ApiResult<never>>({ success: false, error }, { status });
}

/** Converte qualsiasi eccezione in risposta ApiResult senza esporre dettagli interni. */
export function toApiFailure(err: unknown): NextResponse<ApiResult<never>> {
  if (err instanceof CalendarSyncError) return apiFail(err.message, err.status);
  console.error("[calendar-sync]", err);
  return apiFail("Errore interno durante la sincronizzazione del calendario", 500);
}
