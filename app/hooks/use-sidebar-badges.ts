"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/app/lib/api-client";
import type { SidebarBadges } from "@/app/types/api";

const REFRESH_EVENT = "badges:refresh";
const POLL_INTERVAL_MS = 60_000;

/** Richiede il ricaricamento dei badge della sidebar (da chiamare dopo le mutazioni). */
export function refreshBadges(): void {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

/**
 * Carica GET /api/badges al mount, ogni 60s, al ritorno della finestra in primo piano,
 * su evento "badges:refresh" e quando cambia `key` (es. modulo attivo).
 * In caso di errore mantiene gli ultimi valori (null se mai caricati).
 */
export function useSidebarBadges(key?: string): SidebarBadges | null {
  const [badges, setBadges] = useState<SidebarBadges | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      apiFetch<SidebarBadges>("/api/badges").then(
        data => {
          if (!cancelled) setBadges(data);
        },
        () => {
          /* errore: si mantengono gli ultimi valori */
        }
      );
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") load();
    };

    load();
    const interval = window.setInterval(load, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", load);
    window.addEventListener(REFRESH_EVENT, load);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", load);
      window.removeEventListener(REFRESH_EVENT, load);
    };
  }, [key]);

  return badges;
}
