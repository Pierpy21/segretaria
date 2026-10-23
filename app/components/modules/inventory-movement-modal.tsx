"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, X } from "lucide-react";
import { apiFetch } from "@/app/lib/api-client";
import { useApiData } from "@/app/hooks/use-api-data";
import { useMe } from "@/app/hooks/use-me";
import { useTerms } from "@/app/hooks/use-terms";
import { refreshBadges } from "@/app/hooks/use-sidebar-badges";
import { can } from "@/lib/auth/permissions";
import { ErrorState, Skeleton } from "@/app/components/ui/async-state";
import {
  INVENTORY_INPUT,
  MOVEMENT_LABEL,
  errorMessage,
  formatIsoDate,
  formatQuantity,
  lotLabelOf,
  unitOf,
} from "@/app/components/modules/inventory-shared";
import type {
  ClientResponse,
  CreateInventoryMovementInput,
  InventoryItem,
  InventoryMovement,
  InventoryMovementType,
  InventoryStockLot,
} from "@/app/types/api";

interface InventoryMovementModalProps {
  item: InventoryItem;
  /** Lotti in giacenza (dalla scheda): per le uscite si sceglie tra questi */
  lots: InventoryStockLot[];
  onClose: () => void;
  onSaved: (movement: InventoryMovement) => void;
}

const MOVEMENT_TYPES: InventoryMovementType[] = ["carico", "scarico", "rettifica", "reso"];

/** Lotto + scadenza scelti insieme (in uscita) */
function lotKeyOf(lot: InventoryStockLot): string {
  return `${lot.lot ?? ""}|${lot.expiryDate ?? ""}`;
}

/** Registra carico, scarico, rettifica o reso. Campi mostrati in base ai flag del tipo. */
export default function InventoryMovementModal({ item, lots, onClose, onSaved }: InventoryMovementModalProps) {
  const terms = useTerms();
  const { data: me } = useMe();
  const type = item.itemType;
  const unit = unitOf(item);
  const lotLabel = lotLabelOf(type);
  const canReadClients = can(me?.permissions, "clients:read");

  const [movementType, setMovementType] = useState<InventoryMovementType>("carico");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [quantity, setQuantity] = useState("1");
  const [inLoadUnit, setInLoadUnit] = useState(false);
  const [lotKey, setLotKey] = useState("");
  const [lot, setLot] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [serial, setSerial] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [clientId, setClientId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isOutgoing = movementType === "scarico" || (movementType === "rettifica" && direction === "out");
  const pickFromLots = isOutgoing && (type.trackLot || type.trackExpiry);
  const needsClient = movementType === "scarico" && type.requiresClientOnIssue;
  // Elenco clienti solo se serve e se l'utente può leggerli; altrimenti codice cliente a mano
  const clientsHook = useApiData<ClientResponse[]>(needsClient && canReadClients ? "/api/clients" : null);
  const clients = clientsHook.data ?? [];
  const selectedLot = lots.find(l => lotKeyOf(l) === lotKey) ?? null;

  function changeMovementType(next: InventoryMovementType) {
    setMovementType(next);
    setLotKey("");
    setClientId("");
    if (next !== "carico") setUnitCost("");
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsedQty = type.trackSerial ? 1 : Number(quantity.trim().replace(",", "."));
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      setFormError("La quantità deve essere maggiore di zero.");
      return;
    }
    if (type.trackSerial && !serial.trim()) {
      setFormError("Inserisci la matricola.");
      return;
    }
    if (pickFromLots && lots.length > 0 && !selectedLot) {
      setFormError(`Seleziona il ${lotLabel.toLowerCase()} da scaricare.`);
      return;
    }
    if (needsClient && !clientId.trim()) {
      setFormError("Seleziona il cliente per lo scarico.");
      return;
    }

    const body: CreateInventoryMovementInput = { movementType, quantity: parsedQty };
    if (movementType === "rettifica") body.direction = direction;
    if (type.fractional && inLoadUnit) body.inLoadUnit = true;
    if (type.trackLot) {
      const value = pickFromLots ? selectedLot?.lot : lot.trim();
      if (value) body.lot = value;
    }
    if (type.trackExpiry) {
      const value = pickFromLots ? selectedLot?.expiryDate : expiryDate;
      if (value) body.expiryDate = value;
    }
    if (type.trackSerial) body.serial = serial.trim();
    if (movementType === "carico" && unitCost.trim()) body.unitCost = Number(unitCost.trim().replace(",", "."));
    if (needsClient) body.clientId = clientId.trim();
    if (reason.trim()) body.reason = reason.trim();

    setFormError(null);
    setSaving(true);
    try {
      const movement = await apiFetch<InventoryMovement>(`/api/inventory/items/${encodeURIComponent(item.id)}/movements`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      refreshBadges();
      onSaved(movement);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-sidebar/40 flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-movement-title"
        noValidate
        className="bg-surface rounded-2xl border border-line w-full max-w-md p-5 space-y-3.5 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-2 border-b border-line">
          <div className="min-w-0">
            <p id="inventory-movement-title" className="text-sm font-bold text-ink">Registra movimento</p>
            <p className="text-[11px] text-ink-muted truncate">{item.name} · giacenza {formatQuantity(item.stock)} {unit}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-ink-muted hover:bg-surface-muted" aria-label="Chiudi">
            <X size={15} />
          </button>
        </div>

        <div>
          <label htmlFor="mv-type" className="block text-xs font-bold text-ink mb-1">Tipo di movimento</label>
          <select id="mv-type" value={movementType} onChange={e => changeMovementType(e.target.value as InventoryMovementType)} className={INVENTORY_INPUT}>
            {MOVEMENT_TYPES.map(t => (
              <option key={t} value={t}>{MOVEMENT_LABEL[t]}</option>
            ))}
          </select>
        </div>

        {movementType === "rettifica" && (
          <fieldset>
            <legend className="block text-xs font-bold text-ink mb-1">Direzione</legend>
            <div className="flex gap-4 text-xs text-ink">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="mv-direction" checked={direction === "in"} onChange={() => setDirection("in")} className="accent-accent" />
                Aumenta giacenza (+)
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="mv-direction" checked={direction === "out"} onChange={() => { setDirection("out"); setLotKey(""); }} className="accent-accent" />
                Diminuisci giacenza (−)
              </label>
            </div>
          </fieldset>
        )}

        <div>
          <label htmlFor="mv-qty" className="block text-xs font-bold text-ink mb-1">
            Quantità ({inLoadUnit ? item.unit : unit})
          </label>
          <input
            id="mv-qty"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={type.trackSerial ? "1" : quantity}
            disabled={type.trackSerial}
            onChange={e => setQuantity(e.target.value)}
            className={INVENTORY_INPUT}
          />
          {type.trackSerial && <p className="mt-1 text-[11px] text-ink-muted">Con matricola la quantità è sempre 1.</p>}
        </div>

        {type.fractional && (
          <label className="flex items-center gap-2 text-xs font-bold text-ink cursor-pointer">
            <input type="checkbox" checked={inLoadUnit} onChange={e => setInLoadUnit(e.target.checked)} className="w-4 h-4 rounded border-line-strong accent-accent" />
            Quantità in unità di carico ({item.unit}, 1 = {item.conversionFactor} {unit})
          </label>
        )}

        {type.trackSerial && (
          <div>
            <label htmlFor="mv-serial" className="block text-xs font-bold text-ink mb-1">Matricola</label>
            <input id="mv-serial" value={serial} onChange={e => setSerial(e.target.value)} className={INVENTORY_INPUT} />
          </div>
        )}

        {pickFromLots && (
          <div>
            <label htmlFor="mv-lot-pick" className="block text-xs font-bold text-ink mb-1">{lotLabel} da scaricare</label>
            {lots.length === 0 ? (
              <p className="text-xs text-ink-muted">Nessun {lotLabel.toLowerCase()} in giacenza.</p>
            ) : (
              <select id="mv-lot-pick" value={lotKey} onChange={e => setLotKey(e.target.value)} className={INVENTORY_INPUT}>
                <option value="">Seleziona…</option>
                {lots.map(l => (
                  <option key={lotKeyOf(l)} value={lotKeyOf(l)}>
                    {l.lot ?? `senza ${lotLabel.toLowerCase()}`}
                    {type.trackExpiry ? ` · scad. ${formatIsoDate(l.expiryDate)}` : ""}
                    {` · ${formatQuantity(l.quantity)} ${unit}`}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {!isOutgoing && (type.trackLot || type.trackExpiry) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {type.trackLot && (
              <div>
                <label htmlFor="mv-lot" className="block text-xs font-bold text-ink mb-1">{lotLabel}</label>
                <input id="mv-lot" value={lot} onChange={e => setLot(e.target.value)} className={INVENTORY_INPUT} />
              </div>
            )}
            {type.trackExpiry && (
              <div>
                <label htmlFor="mv-expiry" className="block text-xs font-bold text-ink mb-1">Scadenza</label>
                <input id="mv-expiry" type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className={INVENTORY_INPUT} />
              </div>
            )}
          </div>
        )}

        {movementType === "carico" && (
          <div>
            <label htmlFor="mv-cost" className="block text-xs font-bold text-ink mb-1">Costo unitario (facoltativo)</label>
            <input id="mv-cost" type="number" inputMode="decimal" min="0" step="any" value={unitCost} onChange={e => setUnitCost(e.target.value)} className={INVENTORY_INPUT} />
          </div>
        )}

        {needsClient && (
          <div>
            <label htmlFor="mv-client" className="block text-xs font-bold text-ink mb-1">{terms.clientSingular} <span aria-hidden="true" className="text-red-700">*</span></label>
            {canReadClients ? (
              clientsHook.loading ? (
                <Skeleton className="h-9" />
              ) : clientsHook.error ? (
                <ErrorState message={`Impossibile caricare i ${terms.clientPlural.toLowerCase()}.`} onRetry={clientsHook.reload} />
              ) : (
                <select id="mv-client" value={clientId} onChange={e => setClientId(e.target.value)} className={INVENTORY_INPUT}>
                  <option value="">Seleziona…</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                  ))}
                </select>
              )
            ) : (
              <input id="mv-client" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Codice cliente" className={INVENTORY_INPUT} />
            )}
          </div>
        )}

        <div>
          <label htmlFor="mv-reason" className="block text-xs font-bold text-ink mb-1">Motivo (facoltativo)</label>
          <input id="mv-reason" value={reason} onChange={e => setReason(e.target.value)} className={INVENTORY_INPUT} />
        </div>

        {formError && <p role="alert" className="text-xs font-semibold text-red-800">{formError}</p>}

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
          <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl text-xs font-bold text-ink bg-surface-muted border border-line-strong hover:bg-line">
            Annulla
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-accent-ink bg-accent hover:bg-accent-hover shadow-sm disabled:opacity-60"
          >
            {saving && <LoaderCircle size={12} className="animate-spin" />}
            Registra
          </button>
        </div>
      </form>
    </div>
  );
}
