"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { apiFetch } from "@/app/lib/api-client";
import { useApiData } from "@/app/hooks/use-api-data";
import { ErrorState, SkeletonRows } from "@/app/components/ui/async-state";
import { ITEM_TYPE_FLAGS, errorMessage } from "@/app/components/modules/inventory-shared";
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  BTN_SMALL,
  SETTINGS_INPUT,
  SettingsCard,
  FormError,
} from "@/app/components/modules/settings-shared";
import type {
  CreateInventoryItemTypeInput,
  InventoryItemType,
  InventoryItemTypeFlag,
  UpdateInventoryItemTypeInput,
} from "@/app/types/api";

type Flags = Record<InventoryItemTypeFlag, boolean>;

/** Campi di un tipo in modifica o in creazione */
interface TypeDraft {
  label: string;
  flags: Flags;
}

const EMPTY_FLAGS: Flags = {
  trackLot: false,
  trackExpiry: false,
  trackSerial: false,
  consumable: false,
  fractional: false,
  sellable: false,
  requiresClientOnIssue: false,
};
const EMPTY_DRAFT: TypeDraft = { label: "", flags: EMPTY_FLAGS };

function draftOf(type: InventoryItemType): TypeDraft {
  const flags = { ...EMPTY_FLAGS };
  for (const { key } of ITEM_TYPE_FLAGS) flags[key] = type[key];
  return { label: type.label, flags };
}

/** Riepilogo leggibile dei comportamenti attivi di un tipo */
function flagSummary(type: InventoryItemType): string {
  const active = ITEM_TYPE_FLAGS.filter(f => type[f.key]).map(f => f.label);
  return active.length > 0 ? active.join(" · ") : "Nessun comportamento speciale";
}

/** Tipi di articolo: flag di comportamento, creazione, modifica e archiviazione (settings:manage). */
export default function InventoryItemTypesCard() {
  const typesHook = useApiData<InventoryItemType[]>("/api/inventory/item-types");
  const { mutate } = typesHook;
  const types = typesHook.data ?? [];
  const active = types.filter(t => t.archivedAt === null);
  const archived = types.filter(t => t.archivedAt !== null);

  const [newDraft, setNewDraft] = useState<TypeDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TypeDraft>(EMPTY_DRAFT);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function replaceType(next: InventoryItemType) {
    mutate(list => (list ? list.map(t => (t.id === next.id ? next : t)) : list));
  }

  function validLabel(draft: TypeDraft): string | null {
    return draft.label.trim() ? null : "Inserisci il nome del tipo di articolo.";
  }

  async function createType(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem = validLabel(newDraft);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const body: CreateInventoryItemTypeInput = { label: newDraft.label.trim(), ...newDraft.flags };
      const created = await apiFetch<InventoryItemType>("/api/inventory/item-types", {
        method: "POST",
        body: JSON.stringify(body),
      });
      mutate(list => [...(list ?? []), created]);
      setNewDraft(EMPTY_DRAFT);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  function startEdit(type: InventoryItemType) {
    setError(null);
    setEditingId(type.id);
    setEditDraft(draftOf(type));
  }

  async function saveEdit(e: FormEvent<HTMLFormElement>, type: InventoryItemType) {
    e.preventDefault();
    const problem = validLabel(editDraft);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusyId(type.id);
    try {
      const body: UpdateInventoryItemTypeInput = { label: editDraft.label.trim(), ...editDraft.flags };
      const updated = await apiFetch<InventoryItemType>(`/api/inventory/item-types/${encodeURIComponent(type.id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      replaceType(updated);
      setEditingId(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  /** Archivia o ripristina: il tipo resta sugli articoli già creati */
  async function setArchived(type: InventoryItemType, archived: boolean) {
    setError(null);
    setBusyId(type.id);
    try {
      const body: UpdateInventoryItemTypeInput = { archived };
      const updated = await apiFetch<InventoryItemType>(`/api/inventory/item-types/${encodeURIComponent(type.id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      replaceType(updated);
      if (editingId === type.id) setEditingId(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function renderRow(type: InventoryItemType) {
    const isArchived = type.archivedAt !== null;
    const busy = busyId === type.id;

    if (editingId === type.id) {
      return (
        <li key={type.id} className="py-3">
          <form onSubmit={e => void saveEdit(e, type)} className="space-y-3" noValidate>
            <FlagFields draft={editDraft} onChange={setEditDraft} idPrefix={`edit-${type.id}`} />
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setEditingId(null)} className={BTN_SECONDARY}>Annulla</button>
              <button type="submit" disabled={busy} className={BTN_PRIMARY}>
                {busy && <LoaderCircle size={12} className="animate-spin" />}
                Salva
              </button>
            </div>
          </form>
        </li>
      );
    }

    return (
      <li key={type.id} className="py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-xs font-bold truncate ${isArchived ? "text-ink-muted line-through" : "text-ink"}`}>{type.label}</p>
          <p className="text-[11px] text-ink-muted">
            {flagSummary(type)}{isArchived && " · archiviato"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isArchived ? (
            <button type="button" onClick={() => void setArchived(type, false)} disabled={busy} className={BTN_SMALL}>
              {busy ? "…" : "Ripristina"}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => startEdit(type)} disabled={busy} className={BTN_SMALL}>Modifica</button>
              <button type="button" onClick={() => void setArchived(type, true)} disabled={busy} className={BTN_DANGER}>
                {busy ? "…" : "Archivia"}
              </button>
            </>
          )}
        </div>
      </li>
    );
  }

  return (
    <SettingsCard
      id="settings-inventory-types"
      title="Tipi di articolo"
      description="Definiscono cosa tracciare per gli articoli (lotti, scadenze, matricole) e come si usano (scorta, vendita, frazionamento). Archiviando, il tipo resta sugli articoli già creati."
    >
      {typesHook.loading ? (
        <SkeletonRows rows={3} className="h-12" />
      ) : typesHook.error ? (
        <ErrorState message="Impossibile caricare i tipi di articolo." onRetry={typesHook.reload} />
      ) : (
        <>
          <div className="mb-2">
            <FormError message={error} />
          </div>

          {active.length === 0 && <p className="text-xs text-ink-muted mb-3">Nessun tipo di articolo attivo.</p>}

          <ul className="divide-y divide-line">{active.map(renderRow)}</ul>

          {archived.length > 0 && (
            <div className="mt-4 pt-3 border-t border-line">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1">Archiviati</p>
              <ul className="divide-y divide-line">{archived.map(renderRow)}</ul>
            </div>
          )}

          <form onSubmit={createType} className="mt-4 pt-4 border-t border-line space-y-3" noValidate>
            <p className="text-xs font-bold text-ink">Nuovo tipo</p>
            <FlagFields draft={newDraft} onChange={setNewDraft} idPrefix="new-inventory-type" />
            <div className="flex justify-end">
              <button type="submit" disabled={creating} className={BTN_PRIMARY}>
                {creating && <LoaderCircle size={12} className="animate-spin" />}
                <Plus size={12} /> Aggiungi tipo
              </button>
            </div>
          </form>
        </>
      )}
    </SettingsCard>
  );
}

/** Nome e flag di comportamento del tipo: condivisi tra creazione e modifica */
function FlagFields({
  draft,
  onChange,
  idPrefix,
}: {
  draft: TypeDraft;
  onChange: (next: TypeDraft) => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${idPrefix}-label`} className="block text-xs font-bold text-ink mb-1">Nome</label>
        <input
          id={`${idPrefix}-label`}
          type="text"
          value={draft.label}
          onChange={e => onChange({ ...draft, label: e.target.value })}
          placeholder="Es. Farmaco"
          className={`${SETTINGS_INPUT} sm:max-w-sm`}
        />
      </div>
      <fieldset>
        <legend className="text-xs font-bold text-ink mb-2">Comportamento</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
          {ITEM_TYPE_FLAGS.map(flag => {
            const id = `${idPrefix}-${flag.key}`;
            return (
              <div key={flag.key} className="flex items-start gap-2">
                <input
                  id={id}
                  type="checkbox"
                  checked={draft.flags[flag.key]}
                  onChange={e => onChange({ ...draft, flags: { ...draft.flags, [flag.key]: e.target.checked } })}
                  className="mt-0.5 w-3.5 h-3.5 rounded border-line-strong accent-accent"
                />
                <label htmlFor={id} className="text-xs text-ink cursor-pointer">
                  <span className="font-semibold">{flag.label}</span>
                  <span className="block text-[11px] text-ink-muted leading-snug">{flag.hint}</span>
                </label>
              </div>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
