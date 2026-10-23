"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, Plus, Search } from "lucide-react";
import { useApiData } from "@/app/hooks/use-api-data";
import { useMe } from "@/app/hooks/use-me";
import { useTerms } from "@/app/hooks/use-terms";
import { can } from "@/lib/auth/permissions";
import { ErrorState, Skeleton, SkeletonRows } from "@/app/components/ui/async-state";
import InventoryItemFormModal from "@/app/components/modules/inventory-item-form";
import {
  INVENTORY_INPUT,
  categoryPath,
  formatIsoDate,
  formatQuantity,
  unitOf,
} from "@/app/components/modules/inventory-shared";
import type { InventoryCategory, InventoryItem, InventoryItemType } from "@/app/types/api";

/** Filtri della lista (la ricerca testuale è ritardata e applicata a parte) */
interface ListFilters {
  q: string;
  categoryId: string;
  itemTypeId: string;
  belowReorder: boolean;
  expiringWithinDays: number;
  includeArchived: boolean;
}

const EXPIRY_OPTIONS = [30, 60, 90];
const EMPTY_FILTERS: ListFilters = {
  q: "",
  categoryId: "",
  itemTypeId: "",
  belowReorder: false,
  expiringWithinDays: 0,
  includeArchived: false,
};

/** Query di GET /api/inventory/items: solo i filtri attivi */
function buildItemsPath(f: ListFilters): string {
  const sp = new URLSearchParams();
  if (f.q.trim()) sp.set("q", f.q.trim());
  if (f.categoryId) sp.set("categoryId", f.categoryId);
  if (f.itemTypeId) sp.set("itemTypeId", f.itemTypeId);
  if (f.belowReorder) sp.set("belowReorder", "true");
  if (f.expiringWithinDays > 0) sp.set("expiringWithinDays", String(f.expiringWithinDays));
  if (f.includeArchived) sp.set("includeArchived", "true");
  const qs = sp.toString();
  return qs ? `/api/inventory/items?${qs}` : "/api/inventory/items";
}

/** Data locale YYYY-MM-DD fra `days` giorni (confrontabile con nextExpiryDate). */
function isoDateIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Elenco articoli con giacenza, filtri e creazione (inventory:write). */
export default function InventoryPage() {
  const terms = useTerms();
  const router = useRouter();
  const { data: me, loading: meLoading } = useMe();
  const canRead = can(me?.permissions, "inventory:read");
  const canWrite = can(me?.permissions, "inventory:write");

  const [filters, setFilters] = useState<ListFilters>(EMPTY_FILTERS);
  const [searchText, setSearchText] = useState("");
  const [showForm, setShowForm] = useState(false);

  // La ricerca parte dopo una breve pausa di digitazione, per non interrogare l'API a ogni tasto
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters(f => (f.q === searchText ? f : { ...f, q: searchText })), 300);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const itemsHook = useApiData<InventoryItem[]>(canRead ? buildItemsPath(filters) : null);
  const categoriesHook = useApiData<InventoryCategory[]>(canRead ? "/api/inventory/categories" : null);
  const typesHook = useApiData<InventoryItemType[]>(canRead ? "/api/inventory/item-types" : null);

  const items = itemsHook.data ?? [];
  const categories = categoriesHook.data ?? [];
  const types = (typesHook.data ?? []).filter(t => t.archivedAt === null);
  const expiryActive = filters.expiringWithinDays > 0;
  // Badge scadenza: entro il filtro attivo, altrimenti entro il primo intervallo proposto
  const today = isoDateIn(0);
  const expiryLimit = isoDateIn(expiryActive ? filters.expiringWithinDays : EXPIRY_OPTIONS[0]);

  function patch(next: Partial<ListFilters>) {
    setFilters(f => ({ ...f, ...next }));
  }

  if (meLoading) return <Skeleton className="h-16" />;
  if (!canRead) {
    return <ErrorState message="Il magazzino non è disponibile per questo studio o per il tuo ruolo." />;
  }

  return (
    <div className="space-y-4">
      {/* ── Intestazione ── */}
      <div className="bg-surface rounded-2xl border border-line px-5 py-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent-text flex items-center justify-center">
            <Boxes size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-ink">{terms.inventoryLabel}</h2>
            <p className="text-xs text-ink-muted">{terms.inventorySubtitle}</p>
          </div>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-accent-ink bg-accent hover:bg-accent-hover shadow-sm transition-colors"
          >
            <Plus size={14} /> Nuovo {terms.itemSingular.toLowerCase()}
          </button>
        )}
      </div>

      <div className="bg-surface rounded-2xl border border-line overflow-hidden shadow-2xs">
        {/* ── Filtri ── */}
        <div className="p-4 border-b border-line bg-surface-muted/50 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] gap-3 items-end">
          <div className="relative">
            <label htmlFor="inv-search" className="block text-xs font-bold text-ink mb-1">Cerca</label>
            <Search size={14} className="absolute left-3 bottom-2.5 text-ink-muted pointer-events-none" aria-hidden="true" />
            <input
              id="inv-search"
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Nome, codice (SKU)…"
              className={`${INVENTORY_INPUT} pl-8`}
            />
          </div>
          <div>
            <label htmlFor="inv-filter-category" className="block text-xs font-bold text-ink mb-1">Categoria</label>
            <select id="inv-filter-category" value={filters.categoryId} onChange={e => patch({ categoryId: e.target.value })} className={INVENTORY_INPUT}>
              <option value="">Tutte</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{categoryPath(c.id, categories)}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="inv-filter-type" className="block text-xs font-bold text-ink mb-1">Tipo</label>
            <select id="inv-filter-type" value={filters.itemTypeId} onChange={e => patch({ itemTypeId: e.target.value })} className={INVENTORY_INPUT}>
              <option value="">Tutti</option>
              {types.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="inv-filter-expiry" className="block text-xs font-bold text-ink mb-1">Scadenza</label>
            <select
              id="inv-filter-expiry"
              value={filters.expiringWithinDays}
              onChange={e => patch({ expiringWithinDays: Number(e.target.value) })}
              className={INVENTORY_INPUT}
            >
              <option value={0}>Qualsiasi</option>
              {EXPIRY_OPTIONS.map(days => (
                <option key={days} value={days}>Entro {days} giorni</option>
              ))}
            </select>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-line flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-ink">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.belowReorder}
              onChange={e => patch({ belowReorder: e.target.checked })}
              className="w-4 h-4 rounded border-line-strong accent-accent"
            />
            Solo sotto scorta
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.includeArchived}
              onChange={e => patch({ includeArchived: e.target.checked })}
              className="w-4 h-4 rounded border-line-strong accent-accent"
            />
            Mostra archiviati
          </label>
        </div>

        {/* ── Elenco ── */}
        {itemsHook.loading ? (
          <div className="p-4"><SkeletonRows rows={5} className="h-12" /></div>
        ) : itemsHook.error ? (
          <div className="p-4"><ErrorState message={`Impossibile caricare ${terms.itemPlural.toLowerCase()}.`} onRetry={itemsHook.reload} /></div>
        ) : items.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-semibold text-ink">Nessun {terms.itemSingular.toLowerCase()} trovato</p>
            <p className="text-xs text-ink-muted mt-1">
              {filters.q || filters.categoryId || filters.itemTypeId || filters.belowReorder || expiryActive
                ? "Prova a modificare i filtri."
                : canWrite ? `Aggiungi il primo ${terms.itemSingular.toLowerCase()} per iniziare.` : "Il magazzino è ancora vuoto."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-muted border-b border-line text-ink font-bold">
                <tr>
                  <th className="px-5 py-3">Codice</th>
                  <th className="px-5 py-3">{terms.itemSingular}</th>
                  <th className="px-5 py-3">Tipo</th>
                  <th className="px-5 py-3">Categoria</th>
                  <th className="px-5 py-3 text-right">Giacenza</th>
                  <th className="px-5 py-3">Stato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-accent/5 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-ink whitespace-nowrap">{item.sku}</td>
                    <td className="px-5 py-3.5">
                      <Link href={`/magazzino/${encodeURIComponent(item.id)}`} className="font-bold text-ink text-sm hover:text-accent-text">
                        {item.name}
                      </Link>
                      {item.archivedAt && <span className="ml-2 text-[10px] font-semibold text-ink-muted">archiviato</span>}
                    </td>
                    <td className="px-5 py-3.5 text-ink">{item.itemType.label}</td>
                    <td className="px-5 py-3.5 text-ink-muted">{categoryPath(item.categoryId, categories)}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-ink whitespace-nowrap">
                      {formatQuantity(item.stock)} <span className="font-semibold text-ink-muted">{unitOf(item)}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {item.belowReorder && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-800 border border-red-200">Sotto scorta</span>
                        )}
                        {item.nextExpiryDate && item.nextExpiryDate < today && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-800 border border-red-200">
                            Scaduto il {formatIsoDate(item.nextExpiryDate)}
                          </span>
                        )}
                        {item.nextExpiryDate && item.nextExpiryDate >= today && item.nextExpiryDate <= expiryLimit && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                            Scade il {formatIsoDate(item.nextExpiryDate)}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <InventoryItemFormModal
          onClose={() => setShowForm(false)}
          onSaved={item => router.push(`/magazzino/${encodeURIComponent(item.id)}`)}
        />
      )}
    </div>
  );
}
