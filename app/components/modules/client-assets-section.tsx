"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { apiFetch } from "@/app/lib/api-client";
import { useApiData } from "@/app/hooks/use-api-data";
import { Skeleton, ErrorState } from "@/app/components/ui/async-state";
import ClientAttributesForm, { INPUT_CLASS } from "@/app/components/modules/client-attributes-form";
import { assetTypeLabel } from "@/app/constants/assets";
import type { ClientAsset, ClientAttributes, ClientFieldDefinition } from "@/app/types/api";

interface AssetDraft {
  name: string;
  identifier: string;
  note: string;
  attributes: ClientAttributes;
}

type Editor = { mode: "create"; assetType: string } | { mode: "edit"; asset: ClientAsset };

const EMPTY_DRAFT: AssetDraft = { name: "", identifier: "", note: "", attributes: {} };

const BUTTON_CLASS = "px-2.5 py-1 rounded-lg text-[11px] font-bold text-accent-text bg-accent/10 hover:bg-accent/20 transition-colors";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Operazione non riuscita. Riprova.";
}

export interface ClientAssetsSectionProps {
  /** Codice cliente (es. "PT-2026-0142") */
  clientId: string;
  canWrite: boolean;
  /** Campi sensibili dei beni: modificabili solo con sensitive:write */
  canWriteSensitive: boolean;
}

/** Beni del cliente raggruppati per tipo. Non si mostra se lo studio non ha campi per i beni. */
export default function ClientAssetsSection({ clientId, canWrite, canWriteSensitive }: ClientAssetsSectionProps) {
  const fieldsHook = useApiData<ClientFieldDefinition[]>("/api/clients/fields?entity=asset");
  const assetsHook = useApiData<ClientAsset[]>(`/api/clients/${encodeURIComponent(clientId)}/assets`);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [draft, setDraft] = useState<AssetDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = fieldsHook.data ?? [];
  const assets = assetsHook.data ?? [];
  // Tipi bene = clientType distinti delle definizioni, nell'ordine di comparsa
  const assetTypes = [...new Set(fields.map(f => f.clientType))];
  const editingType = editor === null ? null : editor.mode === "create" ? editor.assetType : editor.asset.assetType;

  function openCreate(assetType: string) {
    setDraft(EMPTY_DRAFT);
    setError(null);
    setEditor({ mode: "create", assetType });
  }

  function openEdit(asset: ClientAsset) {
    setDraft({ name: asset.name, identifier: asset.identifier ?? "", note: asset.note ?? "", attributes: { ...asset.attributes } });
    setError(null);
    setEditor({ mode: "edit", asset });
  }

  function closeEditor() {
    setEditor(null);
    setError(null);
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editor) return;
    const name = draft.name.trim();
    if (!name) {
      setError("Inserisci il nome del bene.");
      return;
    }
    const identifier = draft.identifier.trim();
    const note = draft.note.trim();
    setError(null);
    setSaving(true);
    try {
      if (editor.mode === "create") {
        const created = await apiFetch<ClientAsset>(`/api/clients/${encodeURIComponent(clientId)}/assets`, {
          method: "POST",
          body: JSON.stringify({
            assetType: editor.assetType,
            name,
            identifier: identifier || undefined,
            note: note || undefined,
            attributes: draft.attributes,
          }),
        });
        assetsHook.mutate(list => [...(list ?? []), created]);
      } else {
        const updated = await apiFetch<ClientAsset>(`/api/assets/${encodeURIComponent(editor.asset.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ name, identifier: identifier || null, note: note || null, attributes: draft.attributes }),
        });
        assetsHook.mutate(list => (list ?? []).map(a => (a.id === updated.id ? updated : a)));
      }
      closeEditor();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function archive(asset: ClientAsset) {
    if (!window.confirm(`Archiviare "${asset.name}"?`)) return;
    setError(null);
    try {
      await apiFetch<null>(`/api/assets/${encodeURIComponent(asset.id)}`, { method: "DELETE" });
      assetsHook.mutate(list => (list ?? []).filter(a => a.id !== asset.id));
      if (editor?.mode === "edit" && editor.asset.id === asset.id) closeEditor();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  // Campi del tipo bene in modifica/creazione (stesso form per crea e modifica)
  const editorForm = editor !== null && editingType !== null ? (
    <form onSubmit={save} className="mt-2 pt-3 border-t border-line space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="asset-name" className="block text-xs font-bold text-ink mb-1">Nome</label>
          <input
            id="asset-name"
            value={draft.name}
            onChange={e => setDraft({ ...draft, name: e.target.value })}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="asset-identifier" className="block text-xs font-bold text-ink mb-1">Identificativo</label>
          <input
            id="asset-identifier"
            value={draft.identifier}
            onChange={e => setDraft({ ...draft, identifier: e.target.value })}
            placeholder="Es. targa, microchip, matricola"
            className={INPUT_CLASS}
          />
        </div>
      </div>
      <div>
        <label htmlFor="asset-note" className="block text-xs font-bold text-ink mb-1">Note</label>
        <textarea
          id="asset-note"
          value={draft.note}
          onChange={e => setDraft({ ...draft, note: e.target.value })}
          rows={2}
          className={`${INPUT_CLASS} resize-none`}
        />
      </div>
      <ClientAttributesForm
        entity="asset"
        clientType={editingType}
        canEditSensitive={canWriteSensitive}
        values={draft.attributes}
        onChange={(key, value) => setDraft(d => ({ ...d, attributes: { ...d.attributes, [key]: value } }))}
      />
      {error && <p role="alert" className="text-xs font-semibold text-red-800">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={closeEditor}
          className="px-3 py-1.5 rounded-lg text-xs font-bold text-ink bg-surface-muted border border-line-strong hover:bg-line"
        >
          Annulla
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-accent-ink bg-accent hover:bg-accent-hover disabled:opacity-60"
        >
          {saving && <LoaderCircle size={12} className="animate-spin" />}
          Salva
        </button>
      </div>
    </form>
  ) : null;

  // Il caricamento delle definizioni, il caso "nessun campo" e l'errore non mostrano la sezione
  if (fieldsHook.loading || fieldsHook.error || fields.length === 0) return null;

  return (
    <div className="bg-surface rounded-2xl border border-line p-4 shadow-2xs">
      <h4 className="text-xs font-bold text-ink mb-3">Beni</h4>

      {assetsHook.error && <ErrorState message="Impossibile caricare i beni del cliente." onRetry={assetsHook.reload} />}
      {assetsHook.loading && <Skeleton className="h-16" />}

      {!assetsHook.loading && !assetsHook.error && assetTypes.map(assetType => {
        const items = assets.filter(a => a.assetType === assetType);
        return (
          <div key={assetType} className="mb-4 last:mb-0">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">{assetTypeLabel(assetType, true)}</p>
              {canWrite && editor === null && (
                <button onClick={() => openCreate(assetType)} className={BUTTON_CLASS}>
                  Aggiungi
                </button>
              )}
            </div>

            {items.length === 0 && (
              <p className="text-xs text-ink-muted">Nessun {assetTypeLabel(assetType).toLowerCase()} registrato.</p>
            )}

            <ul className="divide-y divide-line">
              {items.map(asset =>
                editor?.mode === "edit" && editor.asset.id === asset.id ? (
                  <li key={asset.id} className="py-2">{editorForm}</li>
                ) : (
                  <li key={asset.id} className="py-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-ink">{asset.name}</p>
                      {asset.identifier && <p className="text-[11px] font-semibold text-ink-muted">{asset.identifier}</p>}
                      {asset.note && <p className="text-[11px] text-ink-muted leading-snug">{asset.note}</p>}
                    </div>
                    {canWrite && editor === null && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => openEdit(asset)} className={BUTTON_CLASS}>
                          Modifica
                        </button>
                        <button
                          onClick={() => void archive(asset)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-red-800 bg-red-50 border border-red-200 hover:bg-red-100"
                        >
                          Archivia
                        </button>
                      </div>
                    )}
                  </li>
                )
              )}
            </ul>

            {editor?.mode === "create" && editor.assetType === assetType && editorForm}
          </div>
        );
      })}
    </div>
  );
}
