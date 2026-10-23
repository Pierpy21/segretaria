"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus, Archive, RotateCcw } from "lucide-react";
import { apiFetch } from "@/app/lib/api-client";
import { useApiData } from "@/app/hooks/use-api-data";
import { useMe } from "@/app/hooks/use-me";
import { useTerms } from "@/app/hooks/use-terms";
import { refreshBadges } from "@/app/hooks/use-sidebar-badges";
import { can } from "@/lib/auth/permissions";
import { ErrorState, Skeleton } from "@/app/components/ui/async-state";
import ClientAttributesForm from "@/app/components/modules/client-attributes-form";
import InventoryItemFormModal from "@/app/components/modules/inventory-item-form";
import InventoryMovementModal from "@/app/components/modules/inventory-movement-modal";
import {
  MOVEMENT_LABEL,
  categoryPath,
  errorMessage,
  formatDateTime,
  formatIsoDate,
  formatQuantity,
  unitOf,
} from "@/app/components/modules/inventory-shared";
import type { InventoryCategory, InventoryItem, InventoryItemDetail } from "@/app/types/api";

const BTN_PRIMARY =
  "flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-accent-ink bg-accent hover:bg-accent-hover shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
const BTN_SECONDARY =
  "flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-ink bg-surface-muted border border-line-strong hover:bg-line transition-colors disabled:opacity-60";

/** Riga di dato: etichetta e valore */
function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-line last:border-0">
      <dt className="text-[11px] font-semibold text-ink-muted">{label}</dt>
      <dd className="text-xs font-bold text-ink text-right">{value}</dd>
    </div>
  );
}

interface InventoryItemPageProps {
  id: string;
}

/** Scheda di un articolo: dati, lotti in giacenza, storico movimenti e azioni (inventory:write). */
export default function InventoryItemPage({ id }: InventoryItemPageProps) {
  const terms = useTerms();
  const { data: me, loading: meLoading } = useMe();
  const canRead = can(me?.permissions, "inventory:read");
  const canWrite = can(me?.permissions, "inventory:write");
  const canReadClients = can(me?.permissions, "clients:read");

  const detailHook = useApiData<InventoryItemDetail>(
    canRead ? `/api/inventory/items/${encodeURIComponent(id)}` : null
  );
  const categoriesHook = useApiData<InventoryCategory[]>(canRead ? "/api/inventory/categories" : null);
  const item = detailHook.data;
  const categories = categoriesHook.data ?? [];

  const [editOpen, setEditOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (meLoading) return <Skeleton className="h-72" />;
  if (!me?.company) return null;
  if (!canRead) return <ErrorState message="Non hai accesso al magazzino." />;
  if (detailHook.loading) return <Skeleton className="h-72" />;
  if (detailHook.error || !item) {
    return <ErrorState message="Impossibile caricare l'articolo." onRetry={detailHook.reload} />;
  }

  const unit = unitOf(item);
  const movements = item.movements ?? [];
  const lots = item.lots ?? [];
  const hasMovements = movements.length > 0 || item.stock !== 0;

  async function toggleArchived(target: InventoryItemDetail) {
    const next = target.archivedAt === null;
    if (next && !window.confirm(`Archiviare "${target.name}"? Non sarà più usato per nuovi movimenti.`)) return;
    setArchiving(true);
    setActionError(null);
    try {
      await apiFetch<InventoryItem>(`/api/inventory/items/${encodeURIComponent(target.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ archived: next }),
      });
      detailHook.reload();
      refreshBadges();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setArchiving(false);
    }
  }

  function afterChange() {
    detailHook.reload();
    refreshBadges();
  }

  return (
    <div className="space-y-4">
      {/* ── Intestazione ── */}
      <div className="bg-surface rounded-2xl border border-line px-5 py-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="min-w-0 space-y-2">
          <Link
            href="/magazzino"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold text-ink bg-surface-muted hover:bg-line border border-line-strong"
          >
            <ArrowLeft size={14} /> Torna a {terms.inventoryLabel}
          </Link>
          <div>
            <h2 className="text-base font-bold text-ink flex flex-wrap items-center gap-2">
              {item.name}
              {item.archivedAt && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-surface-muted text-ink-muted border border-line-strong">Archiviato</span>
              )}
            </h2>
            <p className="text-xs text-ink-muted">
              {item.sku} · {item.itemType.label} · {categoryPath(item.categoryId, categories)}
            </p>
          </div>
        </div>

        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMovementOpen(true)}
              disabled={item.archivedAt !== null}
              title={item.archivedAt ? "Ripristina l'articolo per registrare movimenti" : undefined}
              className={BTN_PRIMARY}
            >
              <Plus size={13} /> Registra movimento
            </button>
            <button type="button" onClick={() => setEditOpen(true)} className={BTN_SECONDARY}>
              <Pencil size={13} /> Modifica
            </button>
            <button type="button" onClick={() => void toggleArchived(item)} disabled={archiving} className={BTN_SECONDARY}>
              {item.archivedAt ? <RotateCcw size={13} /> : <Archive size={13} />}
              {item.archivedAt ? "Ripristina" : "Archivia"}
            </button>
          </div>
        )}
      </div>

      {actionError && <p role="alert" className="text-xs font-semibold text-red-800">{actionError}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-start">
        {/* ── Colonna sinistra: dati e campi personalizzati ── */}
        <div className="space-y-3.5">
          <div className="bg-surface rounded-2xl border border-line p-4 shadow-2xs">
            <div className="mb-3 rounded-xl bg-accent/10 border border-accent-soft px-3 py-3">
              <p className="text-[11px] font-semibold text-ink-muted">Giacenza</p>
              <p className="text-xl font-bold text-ink">
                {formatQuantity(item.stock)} <span className="text-sm font-semibold text-ink-muted">{unit}</span>
              </p>
              {item.itemType.fractional && (
                <p className="text-[11px] text-ink-muted mt-0.5">1 {item.unit} = {formatQuantity(item.conversionFactor)} {unit}</p>
              )}
              {item.belowReorder && (
                <span className="inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-800 border border-red-200">
                  Sotto scorta
                </span>
              )}
            </div>

            <dl>
              <DataRow label="Unità di carico" value={item.unit} />
              {item.itemType.fractional && <DataRow label="Unità di scarico" value={item.issueUnit ?? "—"} />}
              {item.itemType.consumable && (
                <>
                  <DataRow label="Scorta minima" value={item.reorderLevel === null ? "—" : formatQuantity(item.reorderLevel)} />
                  <DataRow label="Quantità di riordino" value={item.reorderQty === null ? "—" : formatQuantity(item.reorderQty)} />
                </>
              )}
              <DataRow label="Prezzo d'acquisto" value={item.purchasePrice === null ? "—" : `€ ${item.purchasePrice.toFixed(2)}`} />
              {item.itemType.sellable && (
                <>
                  <DataRow label="Prezzo di vendita" value={item.salePrice === null ? "—" : `€ ${item.salePrice.toFixed(2)}`} />
                  <DataRow label="IVA" value={item.vatRate === null ? "—" : `${item.vatRate}%`} />
                </>
              )}
            </dl>

            {item.note && <p className="mt-3 text-xs text-ink-muted leading-relaxed whitespace-pre-line">{item.note}</p>}
          </div>

          <div className="bg-surface rounded-2xl border border-line p-4 shadow-2xs">
            <h3 className="text-xs font-bold text-ink mb-3">Campi personalizzati</h3>
            <ClientAttributesForm clientType={item.itemType.key} entity="item" values={item.attributes} onChange={() => undefined} readOnly />
          </div>
        </div>

        {/* ── Colonna destra: lotti e movimenti ── */}
        <div className="space-y-4 min-w-0">
          <div className="bg-surface rounded-2xl border border-line shadow-2xs overflow-hidden">
            <div className="px-4 py-3 border-b border-line bg-surface-muted/50">
              <h3 className="text-xs font-bold text-ink">Lotti in giacenza</h3>
            </div>
            {lots.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-ink-muted">Nessuna giacenza registrata.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-muted border-b border-line text-ink font-bold">
                    <tr>
                      {item.itemType.trackLot && <th className="px-4 py-2.5">Lotto</th>}
                      {item.itemType.trackExpiry && <th className="px-4 py-2.5">Scadenza</th>}
                      <th className="px-4 py-2.5 text-right">Quantità</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {lots.map(l => (
                      <tr key={`${l.lot ?? ""}|${l.expiryDate ?? ""}`}>
                        {item.itemType.trackLot && <td className="px-4 py-2.5 font-semibold text-ink">{l.lot ?? "—"}</td>}
                        {item.itemType.trackExpiry && <td className="px-4 py-2.5 text-ink">{formatIsoDate(l.expiryDate)}</td>}
                        <td className="px-4 py-2.5 text-right font-bold text-ink">{formatQuantity(l.quantity)} {unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-surface rounded-2xl border border-line shadow-2xs overflow-hidden">
            <div className="px-4 py-3 border-b border-line bg-surface-muted/50">
              <h3 className="text-xs font-bold text-ink">Storico movimenti</h3>
            </div>
            {movements.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-ink-muted">
                {canReadClients ? "Nessun movimento registrato." : "Nessun movimento visibile con i tuoi permessi."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-muted border-b border-line text-ink font-bold">
                    <tr>
                      <th className="px-4 py-2.5">Data</th>
                      <th className="px-4 py-2.5">Tipo</th>
                      <th className="px-4 py-2.5 text-right">Quantità</th>
                      <th className="px-4 py-2.5">Lotto / scadenza / matricola</th>
                      <th className="px-4 py-2.5">{terms.clientSingular}</th>
                      <th className="px-4 py-2.5">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {movements.map(m => (
                      <tr key={m.id} className="hover:bg-surface-muted/70 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-ink">{formatDateTime(m.createdAt)}</td>
                        <td className="px-4 py-3 font-semibold text-ink">{MOVEMENT_LABEL[m.movementType]}</td>
                        <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${m.quantity < 0 ? "text-red-800" : "text-emerald-800"}`}>
                          {m.quantity > 0 ? "+" : ""}{formatQuantity(m.quantity)} {unit}
                        </td>
                        <td className="px-4 py-3 text-ink-muted">
                          {[m.lot, m.expiryDate ? formatIsoDate(m.expiryDate) : null, m.serial].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="px-4 py-3 text-ink-muted">{m.clientName ?? m.clientId ?? "—"}</td>
                        <td className="px-4 py-3 text-ink-muted">{m.reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {movementOpen && (
        <InventoryMovementModal
          item={item}
          lots={lots}
          onClose={() => setMovementOpen(false)}
          onSaved={() => {
            setMovementOpen(false);
            afterChange();
          }}
        />
      )}

      {editOpen && (
        <InventoryItemFormModal
          item={item}
          hasMovements={hasMovements}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            afterChange();
          }}
        />
      )}
    </div>
  );
}
