"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { apiFetch } from "@/app/lib/api-client";
import { useApiData } from "@/app/hooks/use-api-data";
import { ErrorState, SkeletonRows } from "@/app/components/ui/async-state";
import { categoryPath, errorMessage, INVENTORY_INPUT } from "@/app/components/modules/inventory-shared";
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  BTN_SMALL,
  SettingsCard,
  FormError,
} from "@/app/components/modules/settings-shared";
import type {
  CreateInventoryCategoryInput,
  InventoryCategory,
  UpdateInventoryCategoryInput,
} from "@/app/types/api";

/** Valore del select "categoria padre": vuoto = radice */
const ROOT = "";

/** Nome e categoria padre di una categoria in creazione o modifica */
interface CategoryDraft {
  name: string;
  parentId: string;
}

/**
 * Categorie del magazzino (nome e padre). Visibile con inventory:write.
 * Eliminando una categoria, le sottocategorie e gli articoli restano senza padre/categoria.
 */
export default function InventoryCategoriesCard() {
  const categoriesHook = useApiData<InventoryCategory[]>("/api/inventory/categories");
  const { mutate } = categoriesHook;
  const categories = categoriesHook.data ?? [];

  const [newDraft, setNewDraft] = useState<CategoryDraft>({ name: "", parentId: ROOT });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<CategoryDraft>({ name: "", parentId: ROOT });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function replaceCategory(next: InventoryCategory) {
    mutate(list => (list ? list.map(c => (c.id === next.id ? next : c)) : list));
  }

  /** Il padre non può essere la categoria stessa */
  function parentOptions(excludeId: string | null): InventoryCategory[] {
    return categories.filter(c => c.id !== excludeId);
  }

  async function createCategory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newDraft.name.trim()) {
      setError("Inserisci il nome della categoria.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const body: CreateInventoryCategoryInput = { name: newDraft.name.trim() };
      if (newDraft.parentId !== ROOT) body.parentId = newDraft.parentId;
      const created = await apiFetch<InventoryCategory>("/api/inventory/categories", {
        method: "POST",
        body: JSON.stringify(body),
      });
      mutate(list => [...(list ?? []), created]);
      setNewDraft({ name: "", parentId: ROOT });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  function startEdit(category: InventoryCategory) {
    setError(null);
    setEditingId(category.id);
    setEditDraft({ name: category.name, parentId: category.parentId ?? ROOT });
  }

  async function saveEdit(e: FormEvent<HTMLFormElement>, category: InventoryCategory) {
    e.preventDefault();
    if (!editDraft.name.trim()) {
      setError("Inserisci il nome della categoria.");
      return;
    }
    setError(null);
    setBusyId(category.id);
    try {
      // parentId null = porta a livello radice
      const body: UpdateInventoryCategoryInput = {
        name: editDraft.name.trim(),
        parentId: editDraft.parentId === ROOT ? null : editDraft.parentId,
      };
      const updated = await apiFetch<InventoryCategory>(`/api/inventory/categories/${encodeURIComponent(category.id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      replaceCategory(updated);
      setEditingId(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteCategory(category: InventoryCategory) {
    if (!window.confirm(`Eliminare la categoria "${category.name}"? Gli articoli e le sottocategorie restano senza categoria.`)) return;
    setError(null);
    setBusyId(category.id);
    try {
      await apiFetch<null>(`/api/inventory/categories/${encodeURIComponent(category.id)}`, { method: "DELETE" });
      mutate(list =>
        (list ?? [])
          .filter(c => c.id !== category.id)
          .map(c => (c.parentId === category.id ? { ...c, parentId: null } : c))
      );
      if (editingId === category.id) setEditingId(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function renderRow(category: InventoryCategory) {
    const busy = busyId === category.id;

    if (editingId === category.id) {
      const selectId = `edit-cat-parent-${category.id}`;
      return (
        <li key={category.id} className="py-3">
          <form onSubmit={e => void saveEdit(e, category)} className="space-y-3" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={`edit-cat-name-${category.id}`} className="block text-xs font-bold text-ink mb-1">Nome</label>
                <input
                  id={`edit-cat-name-${category.id}`}
                  type="text"
                  value={editDraft.name}
                  onChange={e => setEditDraft({ ...editDraft, name: e.target.value })}
                  className={INVENTORY_INPUT}
                />
              </div>
              <div>
                <label htmlFor={selectId} className="block text-xs font-bold text-ink mb-1">Categoria padre</label>
                <select id={selectId} value={editDraft.parentId} onChange={e => setEditDraft({ ...editDraft, parentId: e.target.value })} className={INVENTORY_INPUT}>
                  <option value={ROOT}>Nessuna (radice)</option>
                  {parentOptions(category.id).map(c => (
                    <option key={c.id} value={c.id}>{categoryPath(c.id, categories)}</option>
                  ))}
                </select>
              </div>
            </div>
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
      <li key={category.id} className="py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-ink truncate">{category.name}</p>
          <p className="text-[11px] text-ink-muted truncate">{categoryPath(category.id, categories)}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button type="button" onClick={() => startEdit(category)} disabled={busy} className={BTN_SMALL}>Modifica</button>
          <button type="button" onClick={() => void deleteCategory(category)} disabled={busy} className={BTN_DANGER}>
            {busy ? "…" : "Elimina"}
          </button>
        </div>
      </li>
    );
  }

  return (
    <SettingsCard
      id="settings-inventory-categories"
      title="Categorie del magazzino"
      description="Raggruppano gli articoli. Una categoria può avere una categoria padre per creare una gerarchia."
    >
      {categoriesHook.loading ? (
        <SkeletonRows rows={3} className="h-12" />
      ) : categoriesHook.error ? (
        <ErrorState message="Impossibile caricare le categorie." onRetry={categoriesHook.reload} />
      ) : (
        <>
          <div className="mb-2">
            <FormError message={error} />
          </div>

          {categories.length === 0 && <p className="text-xs text-ink-muted mb-3">Nessuna categoria.</p>}

          <ul className="divide-y divide-line">{categories.map(renderRow)}</ul>

          <form onSubmit={createCategory} className="mt-4 pt-4 border-t border-line space-y-3" noValidate>
            <p className="text-xs font-bold text-ink">Nuova categoria</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="new-cat-name" className="block text-xs font-bold text-ink mb-1">Nome</label>
                <input
                  id="new-cat-name"
                  type="text"
                  value={newDraft.name}
                  onChange={e => setNewDraft({ ...newDraft, name: e.target.value })}
                  placeholder="Es. Cancelleria"
                  className={INVENTORY_INPUT}
                />
              </div>
              <div>
                <label htmlFor="new-cat-parent" className="block text-xs font-bold text-ink mb-1">Categoria padre</label>
                <select id="new-cat-parent" value={newDraft.parentId} onChange={e => setNewDraft({ ...newDraft, parentId: e.target.value })} className={INVENTORY_INPUT}>
                  <option value={ROOT}>Nessuna (radice)</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{categoryPath(c.id, categories)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={creating} className={BTN_PRIMARY}>
                {creating && <LoaderCircle size={12} className="animate-spin" />}
                <Plus size={12} /> Aggiungi categoria
              </button>
            </div>
          </form>
        </>
      )}
    </SettingsCard>
  );
}
