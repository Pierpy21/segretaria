"use client";

import { useState, type KeyboardEvent } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { useTyreCatalog } from "@/app/hooks/use-tyre-catalog";
import { INVENTORY_INPUT } from "@/app/components/modules/inventory-shared";
import { tyreLoadLabel, tyreNoiseLabel, tyreSizeLabel } from "@/app/constants/tyre-catalog";
import type { TyreCatalogEntry, TyreCatalogQuery } from "@/app/types/api";

interface InventoryTyreCatalogProps {
  /** Scheda scelta: il form precompila nome e campi */
  onSelect: (entry: TyreCatalogEntry) => void;
}

/** Misura digitata → query per la route (stessi limiti del backend), altrimenti messaggio */
function parseQuery(width: string, ratio: string, rim: string, brand: string): { query: TyreCatalogQuery } | { error: string } {
  const w = Number(width.trim());
  const r = Number(ratio.trim());
  const d = Number(rim.trim().replace(",", "."));
  if (!Number.isInteger(w) || w < 100 || w > 400) return { error: "Inserisci una larghezza tra 100 e 400 mm." };
  if (!Number.isInteger(r) || r < 20 || r > 100) return { error: "Inserisci una serie tra 20 e 100." };
  if (!Number.isInteger(d * 2) || d < 10 || d > 26) return { error: "Inserisci un diametro tra 10 e 26 pollici (anche .5)." };
  const brandText = brand.trim();
  if (brandText.length > 60) return { error: "La marca può avere al massimo 60 caratteri." };
  return { query: { width: w, ratio: r, rim: d, brand: brandText || undefined } };
}

const BTN_SEARCH =
  "flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-accent-ink bg-accent hover:bg-accent-hover shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

/** Ricerca nel catalogo EPREL per misura; la selezione di un risultato passa al form. Solo se il tipo ha i campi di misura. */
export default function InventoryTyreCatalog({ onSelect }: InventoryTyreCatalogProps) {
  const catalog = useTyreCatalog();
  const [width, setWidth] = useState("");
  const [ratio, setRatio] = useState("");
  const [rim, setRim] = useState("");
  const [brand, setBrand] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);

  function runSearch() {
    const parsed = parseQuery(width, ratio, rim, brand);
    if ("error" in parsed) {
      setInputError(parsed.error);
      return;
    }
    setInputError(null);
    void catalog.search(parsed.query);
  }

  // Invio nei campi: niente submit del form principale (il blocco è dentro un form)
  function onEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    runSearch();
  }

  const section = "rounded-xl border border-line p-3 space-y-3";

  if (catalog.checking) {
    return (
      <section aria-labelledby="inv-tyre-catalog-title" className={section}>
        <p id="inv-tyre-catalog-title" className="text-xs font-bold text-ink">Cerca nel catalogo EPREL</p>
        <p role="status" className="text-[11px] text-ink-muted">Verifica del catalogo in corso…</p>
      </section>
    );
  }

  if (!catalog.available) {
    return (
      <section aria-labelledby="inv-tyre-catalog-title" className={section}>
        <p id="inv-tyre-catalog-title" className="sr-only">Catalogo EPREL</p>
        <p className="text-[11px] text-ink-muted">
          {catalog.availabilityError
            ? "Catalogo EPREL non raggiungibile: inserisci i dati a mano."
            : "Catalogo EPREL non configurato: inserisci i dati a mano."}
        </p>
      </section>
    );
  }

  const results = catalog.results;

  return (
    <section aria-labelledby="inv-tyre-catalog-title" className={section}>
      <div>
        <p id="inv-tyre-catalog-title" className="text-xs font-bold text-ink">Cerca nel catalogo EPREL</p>
        <p className="text-[11px] text-ink-muted">Seleziona un risultato per precompilare nome e campi.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div>
          <label htmlFor="tyre-width" className="block text-xs font-bold text-ink mb-1">Larghezza (mm)</label>
          <input id="tyre-width" type="text" inputMode="numeric" placeholder="205" value={width} onChange={e => setWidth(e.target.value)} onKeyDown={onEnter} className={INVENTORY_INPUT} />
        </div>
        <div>
          <label htmlFor="tyre-ratio" className="block text-xs font-bold text-ink mb-1">Serie (%)</label>
          <input id="tyre-ratio" type="text" inputMode="numeric" placeholder="55" value={ratio} onChange={e => setRatio(e.target.value)} onKeyDown={onEnter} className={INVENTORY_INPUT} />
        </div>
        <div>
          <label htmlFor="tyre-rim" className="block text-xs font-bold text-ink mb-1">Diametro (pollici)</label>
          <input id="tyre-rim" type="text" inputMode="decimal" placeholder="16" value={rim} onChange={e => setRim(e.target.value)} onKeyDown={onEnter} className={INVENTORY_INPUT} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="tyre-brand" className="block text-xs font-bold text-ink mb-1">Marca (facoltativa)</label>
          <input id="tyre-brand" type="text" placeholder="Michelin" value={brand} onChange={e => setBrand(e.target.value)} onKeyDown={onEnter} className={INVENTORY_INPUT} />
        </div>
      </div>

      {inputError && <p role="alert" className="text-xs font-semibold text-red-800">{inputError}</p>}

      <div className="flex justify-end">
        <button type="button" onClick={runSearch} disabled={catalog.searching} className={BTN_SEARCH}>
          {catalog.searching ? <LoaderCircle size={12} className="animate-spin" /> : <Search size={12} />}
          Cerca nel catalogo EPREL
        </button>
      </div>

      <div aria-live="polite" className="space-y-2">
        {catalog.searching && <p className="text-xs text-ink-muted">Ricerca in corso…</p>}
        {catalog.searchError && <p role="alert" className="text-xs font-semibold text-red-800">{catalog.searchError}</p>}

        {!catalog.searching && results !== null && results.length === 0 && (
          <p className="text-xs text-ink-muted">Nessun pneumatico trovato per questa misura.</p>
        )}

        {!catalog.searching && results !== null && results.length > 0 && (
          <>
            <p className="text-[11px] text-ink-muted">{results.length} risultati · la stagione va scelta a mano.</p>
            <ul className="max-h-64 overflow-y-auto divide-y divide-line rounded-xl border border-line">
              {results.map((entry, index) => (
                <li key={`${entry.registrationNumber ?? "scheda"}-${index}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(entry)}
                    className="w-full text-left px-3 py-2.5 hover:bg-surface-muted transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  >
                    <p className="text-xs font-bold text-ink">
                      {[entry.brand, entry.commercialName].filter(Boolean).join(" ") || "Senza nome"}
                    </p>
                    <p className="text-[11px] text-ink">
                      {[tyreSizeLabel(entry), tyreLoadLabel(entry)].filter(Boolean).join(" ")}
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      Consumo {entry.fuelClass ?? "—"} · Bagnato {entry.wetGripClass ?? "—"} · Rumore {tyreNoiseLabel(entry) ?? "—"}
                    </p>
                    {(entry.snow || entry.ice || entry.registrationNumber) && (
                      <p className="text-[11px] text-ink-muted">
                        {[entry.snow && "Neve (3PMSF)", entry.ice && "Ghiaccio", entry.registrationNumber && `EPREL ${entry.registrationNumber}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
