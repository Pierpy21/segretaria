"use client";

import { useCallback, useRef, useState } from "react";
import { apiFetch } from "@/app/lib/api-client";
import { useApiData } from "@/app/hooks/use-api-data";
import type { TyreCatalogEntry, TyreCatalogQuery, TyreCatalogResponse } from "@/app/types/api";

const CATALOG_PATH = "/api/inventory/catalog/tyres";

/**
 * Catalogo EPREL pneumatici: disponibilità verificata al mount (senza parametri),
 * poi ricerca per misura. Un errore di ricerca resta in searchError e non blocca il form.
 */
export function useTyreCatalog() {
  const availability = useApiData<TyreCatalogResponse>(CATALOG_PATH);
  const [results, setResults] = useState<TyreCatalogEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Scarta le risposte di ricerche superate da una più recente
  const latestSearch = useRef(0);

  const search = useCallback(async (query: TyreCatalogQuery) => {
    const searchId = ++latestSearch.current;
    const params = new URLSearchParams({
      width: String(query.width),
      ratio: String(query.ratio),
      rim: String(query.rim),
    });
    if (query.brand) params.set("brand", query.brand);

    setSearching(true);
    setSearchError(null);
    try {
      const response = await apiFetch<TyreCatalogResponse>(`${CATALOG_PATH}?${params.toString()}`);
      if (searchId !== latestSearch.current) return;
      setResults(response.results);
    } catch (err) {
      if (searchId !== latestSearch.current) return;
      setResults(null);
      setSearchError(err instanceof Error ? err.message : "Ricerca non riuscita. Riprova.");
    } finally {
      if (searchId === latestSearch.current) setSearching(false);
    }
  }, []);

  return {
    /** Verifica della disponibilità in corso */
    checking: availability.loading,
    /** Catalogo configurato sul server (false anche se la verifica è fallita) */
    available: availability.data?.catalogAvailable === true,
    availabilityError: availability.error,
    /** null = nessuna ricerca ancora fatta */
    results,
    searching,
    searchError,
    search,
  };
}
