"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/app/lib/api-client";

interface ApiDataState<T> {
  /** Path a cui si riferiscono data/error: evita di mostrare dati di un'altra risorsa */
  key: string | null;
  data: T | null;
  error: string | null;
  loaded: boolean;
}

/**
 * Carica una risorsa GET al mount e ad ogni cambio di path.
 * `mutate` applica aggiornamenti locali (ottimistici); `reload` rifà la fetch.
 */
export function useApiData<T>(path: string | null) {
  const [state, setState] = useState<ApiDataState<T>>({ key: null, data: null, error: null, loaded: false });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    apiFetch<T>(path).then(
      data => {
        if (!cancelled) setState({ key: path, data, error: null, loaded: true });
      },
      (err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Errore sconosciuto.";
        setState(prev => ({ key: path, data: prev.key === path ? prev.data : null, error: message, loaded: true }));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion(v => v + 1), []);

  const mutate = useCallback(
    (updater: (prev: T | null) => T | null) => setState(prev => ({ ...prev, data: updater(prev.data) })),
    []
  );

  const current = path !== null && state.key === path;

  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: path !== null && !(current && state.loaded),
    reload,
    mutate,
  };
}
