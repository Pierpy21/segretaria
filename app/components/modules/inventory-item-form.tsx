"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, X } from "lucide-react";
import { apiFetch } from "@/app/lib/api-client";
import { useApiData } from "@/app/hooks/use-api-data";
import { useTerms } from "@/app/hooks/use-terms";
import { ErrorState, Skeleton } from "@/app/components/ui/async-state";
import ClientAttributesForm from "@/app/components/modules/client-attributes-form";
import InventoryTyreCatalog from "@/app/components/modules/inventory-tyre-catalog";
import {
  INVENTORY_INPUT,
  categoryPath,
  errorMessage,
} from "@/app/components/modules/inventory-shared";
import { hasTyreSizeFields, tyreAttributesFor, tyreItemName } from "@/app/constants/tyre-catalog";
import type {
  ClientAttributes,
  ClientFieldDefinition,
  CreateInventoryItemInput,
  InventoryCategory,
  InventoryItem,
  InventoryItemType,
  TyreCatalogEntry,
  UpdateInventoryItemInput,
} from "@/app/types/api";

/** Campi del form come stringhe (input); la conversione avviene al salvataggio */
interface ItemDraft {
  sku: string;
  name: string;
  itemTypeId: string;
  categoryId: string;
  unit: string;
  issueUnit: string;
  conversionFactor: string;
  reorderLevel: string;
  reorderQty: string;
  purchasePrice: string;
  salePrice: string;
  vatRate: string;
  attributes: ClientAttributes;
  note: string;
}

const EMPTY_DRAFT: ItemDraft = {
  sku: "",
  name: "",
  itemTypeId: "",
  categoryId: "",
  unit: "pz",
  issueUnit: "",
  conversionFactor: "1",
  reorderLevel: "",
  reorderQty: "",
  purchasePrice: "",
  salePrice: "",
  vatRate: "",
  attributes: {},
  note: "",
};

function draftOf(item: InventoryItem): ItemDraft {
  const text = (value: number | null) => (value === null ? "" : String(value));
  return {
    sku: item.sku,
    name: item.name,
    itemTypeId: item.itemTypeId,
    categoryId: item.categoryId ?? "",
    unit: item.unit,
    issueUnit: item.issueUnit ?? "",
    conversionFactor: String(item.conversionFactor),
    reorderLevel: text(item.reorderLevel),
    reorderQty: text(item.reorderQty),
    purchasePrice: text(item.purchasePrice),
    salePrice: text(item.salePrice),
    vatRate: text(item.vatRate),
    attributes: { ...item.attributes },
    note: item.note ?? "",
  };
}

/** "" → null; testo numerico → numero (NaN se non valido) */
function toNumber(value: string): number | null {
  const text = value.trim().replace(",", ".");
  if (text === "") return null;
  return Number(text);
}

function isInvalid(value: number | null): boolean {
  return value !== null && !Number.isFinite(value);
}

/** Controlli lato client; il backend resta la fonte di verità (suoi messaggi già in italiano) */
function validate(d: ItemDraft, type: InventoryItemType | null): string | null {
  if (!d.sku.trim()) return "Inserisci il codice (SKU).";
  if (!d.name.trim()) return "Inserisci il nome dell'articolo.";
  if (!type) return "Seleziona il tipo di articolo.";
  if (type.fractional) {
    if (!d.issueUnit.trim()) return "Inserisci l'unità di scarico.";
    const factor = toNumber(d.conversionFactor);
    if (factor === null || !Number.isFinite(factor) || factor <= 0) {
      return "Il fattore di conversione deve essere maggiore di zero.";
    }
  }
  if (type.sellable) {
    const price = toNumber(d.salePrice);
    if (price === null || !Number.isFinite(price) || price < 0) return "Inserisci il prezzo di vendita.";
    const vat = toNumber(d.vatRate);
    if (vat === null || !Number.isFinite(vat) || vat < 0 || vat > 100) return "Inserisci un'IVA tra 0 e 100.";
  }
  const numeric: [string, string][] = [
    ["Prezzo d'acquisto", d.purchasePrice],
    ["Scorta minima", d.reorderLevel],
    ["Quantità di riordino", d.reorderQty],
  ];
  for (const [label, raw] of numeric) {
    const value = toNumber(raw);
    if (isInvalid(value) || (value !== null && value < 0)) return `${label}: inserisci un numero positivo.`;
  }
  return null;
}

/** Corpo comune: i campi non applicabili al tipo diventano null (svuotati in modifica) */
function toUpdateBody(d: ItemDraft, type: InventoryItemType): UpdateInventoryItemInput {
  return {
    sku: d.sku.trim(),
    name: d.name.trim(),
    itemTypeId: type.id,
    categoryId: d.categoryId || null,
    unit: d.unit.trim() || "pz",
    issueUnit: type.fractional ? d.issueUnit.trim() : null,
    conversionFactor: type.fractional ? (toNumber(d.conversionFactor) ?? 1) : 1,
    reorderLevel: type.consumable ? toNumber(d.reorderLevel) : null,
    reorderQty: type.consumable ? toNumber(d.reorderQty) : null,
    purchasePrice: toNumber(d.purchasePrice),
    salePrice: type.sellable ? toNumber(d.salePrice) : null,
    vatRate: type.sellable ? toNumber(d.vatRate) : null,
    attributes: d.attributes,
    note: d.note.trim() || null,
  };
}

/** In creazione i campi non applicabili vengono omessi (il backend li rifiuta o li ignora) */
function toCreateBody(d: ItemDraft, type: InventoryItemType): CreateInventoryItemInput {
  const body: CreateInventoryItemInput = {
    sku: d.sku.trim(),
    name: d.name.trim(),
    itemTypeId: type.id,
    unit: d.unit.trim() || "pz",
    attributes: d.attributes,
  };
  if (d.categoryId) body.categoryId = d.categoryId;
  if (d.note.trim()) body.note = d.note.trim();
  const purchasePrice = toNumber(d.purchasePrice);
  if (purchasePrice !== null) body.purchasePrice = purchasePrice;
  if (type.fractional) {
    body.issueUnit = d.issueUnit.trim();
    body.conversionFactor = toNumber(d.conversionFactor) ?? 1;
  }
  if (type.consumable) {
    const level = toNumber(d.reorderLevel);
    const qty = toNumber(d.reorderQty);
    if (level !== null) body.reorderLevel = level;
    if (qty !== null) body.reorderQty = qty;
  }
  if (type.sellable) {
    body.salePrice = toNumber(d.salePrice) ?? 0;
    body.vatRate = toNumber(d.vatRate) ?? 0;
  }
  return body;
}

interface InventoryItemFormProps {
  /** Articolo in modifica; assente = nuovo articolo */
  item?: InventoryItem;
  /** Con movimenti registrati il tipo non si cambia */
  hasMovements?: boolean;
  onClose: () => void;
  onSaved: (item: InventoryItem) => void;
}

/** Crea o modifica un articolo. I campi dipendono dai flag del tipo selezionato. */
export default function InventoryItemFormModal({ item, hasMovements = false, onClose, onSaved }: InventoryItemFormProps) {
  const terms = useTerms();
  const isEdit = item !== undefined;
  const [draft, setDraft] = useState<ItemDraft>(() => (item ? draftOf(item) : EMPTY_DRAFT));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const typesHook = useApiData<InventoryItemType[]>("/api/inventory/item-types");
  const categoriesHook = useApiData<InventoryCategory[]>("/api/inventory/categories");
  const types = typesHook.data ?? [];
  const categories = categoriesHook.data ?? [];
  // Tipi archiviati: solo quello già assegnato all'articolo resta selezionabile
  const selectableTypes = types.filter(t => t.archivedAt === null || t.id === draft.itemTypeId);
  const selectedType = types.find(t => t.id === draft.itemTypeId) ?? item?.itemType ?? null;
  const typeLocked = isEdit && hasMovements;
  // Campi del tipo: decidono se mostrare il catalogo (solo nuovo articolo, tipo con campi di misura)
  const typeFieldsHook = useApiData<ClientFieldDefinition[]>(
    !isEdit && selectedType ? `/api/clients/fields?entity=item&type=${encodeURIComponent(selectedType.key)}` : null
  );
  const typeFieldKeys = (typeFieldsHook.data ?? []).map(f => f.key);
  const showTyreCatalog = !isEdit && !!selectedType && !typeFieldsHook.loading && hasTyreSizeFields(typeFieldKeys);

  function set<K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) {
    setDraft(d => ({ ...d, [key]: value }));
  }

  /** Dal catalogo: nome e campi del tipo presenti nella scheda; restano modificabili */
  function applyTyreEntry(entry: TyreCatalogEntry) {
    setDraft(d => ({
      ...d,
      name: tyreItemName(entry),
      attributes: { ...d.attributes, ...tyreAttributesFor(entry, typeFieldKeys) },
    }));
  }

  function changeType(typeId: string) {
    // Gli attributi dipendono dal tipo: si ripartono da zero
    setDraft(d => ({ ...d, itemTypeId: typeId, attributes: {} }));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const error = validate(draft, selectedType);
    if (error || !selectedType) {
      setFormError(error ?? "Seleziona il tipo di articolo.");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      let saved: InventoryItem;
      if (item) {
        const body = toUpdateBody(draft, selectedType);
        if (selectedType.id === item.itemTypeId) delete body.itemTypeId;
        saved = await apiFetch<InventoryItem>(`/api/inventory/items/${encodeURIComponent(item.id)}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        saved = await apiFetch<InventoryItem>("/api/inventory/items", {
          method: "POST",
          body: JSON.stringify(toCreateBody(draft, selectedType)),
        });
      }
      onSaved(saved);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const loadingLookups = typesHook.loading || categoriesHook.loading;
  const lookupError = typesHook.error || categoriesHook.error;

  return (
    <div className="fixed inset-0 z-50 bg-sidebar/40 flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-item-form-title"
        noValidate
        className="bg-surface rounded-2xl border border-line w-full max-w-lg p-5 space-y-3.5 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-2 border-b border-line">
          <p id="inventory-item-form-title" className="text-sm font-bold text-ink">
            {isEdit ? `Modifica ${terms.itemSingular.toLowerCase()}` : `Nuovo ${terms.itemSingular.toLowerCase()}`}
          </p>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-ink-muted hover:bg-surface-muted" aria-label="Chiudi">
            <X size={15} />
          </button>
        </div>

        {loadingLookups && <Skeleton className="h-40" />}
        {!loadingLookups && lookupError && (
          <ErrorState message="Impossibile caricare tipi e categorie." onRetry={() => { typesHook.reload(); categoriesHook.reload(); }} />
        )}

        {!loadingLookups && !lookupError && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="inv-sku" className="block text-xs font-bold text-ink mb-1">Codice (SKU) <span aria-hidden="true" className="text-red-700">*</span></label>
                <input id="inv-sku" value={draft.sku} onChange={e => set("sku", e.target.value)} className={INVENTORY_INPUT} />
              </div>
              <div>
                <label htmlFor="inv-name" className="block text-xs font-bold text-ink mb-1">Nome <span aria-hidden="true" className="text-red-700">*</span></label>
                <input id="inv-name" value={draft.name} onChange={e => set("name", e.target.value)} className={INVENTORY_INPUT} />
              </div>
              <div>
                <label htmlFor="inv-type" className="block text-xs font-bold text-ink mb-1">Tipo <span aria-hidden="true" className="text-red-700">*</span></label>
                <select
                  id="inv-type"
                  value={draft.itemTypeId}
                  disabled={typeLocked}
                  onChange={e => changeType(e.target.value)}
                  className={INVENTORY_INPUT}
                >
                  <option value="">Seleziona…</option>
                  {selectableTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.label}{t.archivedAt ? " (archiviato)" : ""}</option>
                  ))}
                </select>
                {typeLocked && <p className="mt-1 text-[11px] text-ink-muted">Il tipo non si cambia dopo i primi movimenti.</p>}
              </div>
              <div>
                <label htmlFor="inv-category" className="block text-xs font-bold text-ink mb-1">Categoria</label>
                <select id="inv-category" value={draft.categoryId} onChange={e => set("categoryId", e.target.value)} className={INVENTORY_INPUT}>
                  <option value="">Nessuna</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{categoryPath(c.id, categories)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="inv-unit" className="block text-xs font-bold text-ink mb-1">Unità di carico</label>
                <input id="inv-unit" value={draft.unit} onChange={e => set("unit", e.target.value)} placeholder="Es. confezione" className={INVENTORY_INPUT} />
              </div>

              {selectedType?.fractional && (
                <>
                  <div>
                    <label htmlFor="inv-issue-unit" className="block text-xs font-bold text-ink mb-1">Unità di scarico <span aria-hidden="true" className="text-red-700">*</span></label>
                    <input id="inv-issue-unit" value={draft.issueUnit} onChange={e => set("issueUnit", e.target.value)} placeholder="Es. pz" className={INVENTORY_INPUT} />
                  </div>
                  <div>
                    <label htmlFor="inv-factor" className="block text-xs font-bold text-ink mb-1">Fattore di conversione <span aria-hidden="true" className="text-red-700">*</span></label>
                    <input
                      id="inv-factor"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={draft.conversionFactor}
                      onChange={e => set("conversionFactor", e.target.value)}
                      className={INVENTORY_INPUT}
                    />
                    <p className="mt-1 text-[11px] text-ink-muted">
                      1 {draft.unit || "unità di carico"} = {draft.conversionFactor || "?"} {draft.issueUnit || "unità di scarico"}
                    </p>
                  </div>
                </>
              )}

              {selectedType?.consumable && (
                <>
                  <div>
                    <label htmlFor="inv-reorder-level" className="block text-xs font-bold text-ink mb-1">Scorta minima</label>
                    <input id="inv-reorder-level" type="number" inputMode="decimal" min="0" step="any" value={draft.reorderLevel} onChange={e => set("reorderLevel", e.target.value)} className={INVENTORY_INPUT} />
                  </div>
                  <div>
                    <label htmlFor="inv-reorder-qty" className="block text-xs font-bold text-ink mb-1">Quantità di riordino</label>
                    <input id="inv-reorder-qty" type="number" inputMode="decimal" min="0" step="any" value={draft.reorderQty} onChange={e => set("reorderQty", e.target.value)} className={INVENTORY_INPUT} />
                  </div>
                </>
              )}

              <div>
                <label htmlFor="inv-purchase" className="block text-xs font-bold text-ink mb-1">Prezzo d&apos;acquisto</label>
                <input id="inv-purchase" type="number" inputMode="decimal" min="0" step="any" value={draft.purchasePrice} onChange={e => set("purchasePrice", e.target.value)} className={INVENTORY_INPUT} />
              </div>

              {selectedType?.sellable && (
                <>
                  <div>
                    <label htmlFor="inv-sale" className="block text-xs font-bold text-ink mb-1">Prezzo di vendita <span aria-hidden="true" className="text-red-700">*</span></label>
                    <input id="inv-sale" type="number" inputMode="decimal" min="0" step="any" value={draft.salePrice} onChange={e => set("salePrice", e.target.value)} className={INVENTORY_INPUT} />
                  </div>
                  <div>
                    <label htmlFor="inv-vat" className="block text-xs font-bold text-ink mb-1">IVA (%) <span aria-hidden="true" className="text-red-700">*</span></label>
                    <input id="inv-vat" type="number" inputMode="decimal" min="0" max="100" step="any" value={draft.vatRate} onChange={e => set("vatRate", e.target.value)} className={INVENTORY_INPUT} />
                  </div>
                </>
              )}
            </div>

            <div>
              <label htmlFor="inv-note" className="block text-xs font-bold text-ink mb-1">Note</label>
              <textarea id="inv-note" rows={2} value={draft.note} onChange={e => set("note", e.target.value)} className={INVENTORY_INPUT} />
            </div>

            {showTyreCatalog && <InventoryTyreCatalog onSelect={applyTyreEntry} />}

            {selectedType && (
              <fieldset className="pt-3 border-t border-line">
                <legend className="text-xs font-bold text-ink mb-2">Campi personalizzati</legend>
                <ClientAttributesForm
                  key={selectedType.key}
                  clientType={selectedType.key}
                  entity="item"
                  values={draft.attributes}
                  onChange={(key, value) => setDraft(d => ({ ...d, attributes: { ...d.attributes, [key]: value } }))}
                />
              </fieldset>
            )}
          </>
        )}

        {formError && <p role="alert" className="text-xs font-semibold text-red-800">{formError}</p>}

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
          <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl text-xs font-bold text-ink bg-surface-muted border border-line-strong hover:bg-line">
            Annulla
          </button>
          <button
            type="submit"
            disabled={saving || loadingLookups || !!lookupError}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-accent-ink bg-accent hover:bg-accent-hover shadow-sm disabled:opacity-60"
          >
            {saving && <LoaderCircle size={12} className="animate-spin" />}
            Salva {terms.itemSingular.toLowerCase()}
          </button>
        </div>
      </form>
    </div>
  );
}
