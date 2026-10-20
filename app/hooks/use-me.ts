"use client";

import { useEffect } from "react";
import { useApiData } from "@/app/hooks/use-api-data";
import type { MeResponse } from "@/app/types/api";
import { roleTitle } from "@/lib/terms";

const REFRESH_EVENT = "me:refresh";

/** Ricarica GET /api/me in tutti i componenti che usano useMe (dopo modifiche a moduli, terminologia, settore). */
export function refreshMe(): void {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

/** Dati della sessione corrente (GET /api/me), condivisi tra header, sidebar e pagine. */
export function useMe() {
  const hook = useApiData<MeResponse>("/api/me");
  const { reload } = hook;
  useEffect(() => {
    window.addEventListener(REFRESH_EVENT, reload);
    return () => window.removeEventListener(REFRESH_EVENT, reload);
  }, [reload]);
  return hook;
}

/** Titolo del ruolo nello studio corrente (titolare, collaboratore o ruolo personalizzato). */
export function roleLabel(me: MeResponse | null | undefined): string | null {
  if (!me?.company) return null;
  return me.roleTitle ?? roleTitle(me.terms, me.company.role);
}

export function initialsOf(text: string | null | undefined): string {
  if (!text) return "?";
  const parts = text.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}
