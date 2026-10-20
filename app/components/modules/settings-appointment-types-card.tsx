"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { apiFetch } from "@/app/lib/api-client";
import type { AppointmentType } from "@/app/types/settings";
import type { CreateAppointmentTypeInput, SettingsResponse, UpdateAppointmentTypeInput } from "@/app/types/api";
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  BTN_SMALL,
  SETTINGS_INPUT,
  SettingsCard,
  FormError,
  errorMessage,
  type SettingsUpdater,
} from "@/app/components/modules/settings-shared";

/** Campi di un tipo di appuntamento in modifica (numeri come stringa, per gli input) */
interface TypeDraft {
  label: string;
  color: string;
  durationMinutes: string;
}

const DEFAULT_COLOR = "#0d9488";
const EMPTY_DRAFT: TypeDraft = { label: "", color: DEFAULT_COLOR, durationMinutes: "30" };
const MIN_DURATION = 5;
const MAX_DURATION = 480;

/** Valida il draft: restituisce il payload oppure il messaggio d'errore */
function parseDraft(draft: TypeDraft): { label: string; color: string; durationMinutes: number } | string {
  const label = draft.label.trim();
  if (!label) return "Inserisci il nome del tipo di appuntamento.";
  const duration = Number(draft.durationMinutes);
  if (!Number.isInteger(duration) || duration < MIN_DURATION || duration > MAX_DURATION) {
    return `La durata deve essere un numero intero di minuti tra ${MIN_DURATION} e ${MAX_DURATION}.`;
  }
  return { label, color: draft.color, durationMinutes: duration };
}

interface AppointmentTypesCardProps {
  settings: SettingsResponse;
  onChange: SettingsUpdater;
}

/** Tipi di appuntamento dello studio: aggiunta, modifica inline, archivia e ripristina. */
export default function AppointmentTypesCard({ settings, onChange }: AppointmentTypesCardProps) {
  const [newDraft, setNewDraft] = useState<TypeDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TypeDraft>(EMPTY_DRAFT);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = settings.appointmentTypes.filter(a => a.archivedAt === null);
  const archived = settings.appointmentTypes.filter(a => a.archivedAt !== null);

  /** Sostituisce un tipo nella copia locale */
  function replaceType(next: AppointmentType) {
    onChange(s => ({
      ...s,
      appointmentTypes: s.appointmentTypes.map(a => (a.id === next.id ? next : a)),
    }));
  }

  async function createType(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = parseDraft(newDraft);
    if (typeof parsed === "string") {
      setError(parsed);
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const body: CreateAppointmentTypeInput = parsed;
      const created = await apiFetch<AppointmentType>("/api/settings/appointment-types", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onChange(s => ({ ...s, appointmentTypes: [...s.appointmentTypes, created] }));
      setNewDraft(EMPTY_DRAFT);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  function startEdit(type: AppointmentType) {
    setError(null);
    setEditingId(type.id);
    setEditDraft({ label: type.label, color: type.color, durationMinutes: String(type.durationMinutes) });
  }

  async function saveEdit(e: FormEvent<HTMLFormElement>, type: AppointmentType) {
    e.preventDefault();
    const parsed = parseDraft(editDraft);
    if (typeof parsed === "string") {
      setError(parsed);
      return;
    }
    setError(null);
    setBusyId(type.id);
    try {
      const body: UpdateAppointmentTypeInput = parsed;
      const updated = await apiFetch<AppointmentType>(`/api/settings/appointment-types/${encodeURIComponent(type.id)}`, {
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

  // Archiviazione: DELETE non elimina, la riga resta con archivedAt valorizzato
  async function archiveType(type: AppointmentType) {
    setError(null);
    setBusyId(type.id);
    try {
      await apiFetch<null>(`/api/settings/appointment-types/${encodeURIComponent(type.id)}`, { method: "DELETE" });
      replaceType({ ...type, archivedAt: new Date().toISOString() });
      if (editingId === type.id) setEditingId(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function restoreType(type: AppointmentType) {
    setError(null);
    setBusyId(type.id);
    try {
      const body: UpdateAppointmentTypeInput = { archived: false };
      const restored = await apiFetch<AppointmentType>(`/api/settings/appointment-types/${encodeURIComponent(type.id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      replaceType(restored);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function renderRow(type: AppointmentType) {
    const isArchived = type.archivedAt !== null;
    const busy = busyId === type.id;

    if (editingId === type.id) {
      return (
        <li key={type.id} className="py-3">
          <form onSubmit={e => void saveEdit(e, type)} className="space-y-3" noValidate>
            <TypeFields draft={editDraft} onChange={setEditDraft} idPrefix={`edit-${type.id}`} />
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
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: type.color }} aria-hidden="true" />
          <div className="min-w-0">
            <p className={`text-xs font-bold truncate ${isArchived ? "text-ink-muted line-through" : "text-ink"}`}>{type.label}</p>
            <p className="text-[11px] text-ink-muted">
              {type.durationMinutes} min{isArchived && " · archiviato"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isArchived ? (
            <button type="button" onClick={() => void restoreType(type)} disabled={busy} className={BTN_SMALL}>
              {busy ? "…" : "Ripristina"}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => startEdit(type)} disabled={busy} className={BTN_SMALL}>
                Modifica
              </button>
              <button type="button" onClick={() => void archiveType(type)} disabled={busy} className={BTN_DANGER}>
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
      id="settings-appointment-types"
      title="Tipi di appuntamento"
      description="Tipi usati in agenda: impostano colore e durata predefinita. Archiviando, il tipo resta negli appuntamenti già creati."
    >
      <div className="mb-2">
        <FormError message={error} />
      </div>

      {active.length === 0 && <p className="text-xs text-ink-muted mb-3">Nessun tipo di appuntamento attivo.</p>}

      <ul className="divide-y divide-line">{active.map(renderRow)}</ul>

      {archived.length > 0 && (
        <div className="mt-4 pt-3 border-t border-line">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1">Archiviati</p>
          <ul className="divide-y divide-line">{archived.map(renderRow)}</ul>
        </div>
      )}

      <form onSubmit={createType} className="mt-4 pt-4 border-t border-line space-y-3" noValidate>
        <p className="text-xs font-bold text-ink">Nuovo tipo</p>
        <TypeFields draft={newDraft} onChange={setNewDraft} idPrefix="new-type" />
        <div className="flex justify-end">
          <button type="submit" disabled={creating} className={BTN_PRIMARY}>
            {creating && <LoaderCircle size={12} className="animate-spin" />}
            Aggiungi tipo
          </button>
        </div>
      </form>
    </SettingsCard>
  );
}

/** Campi condivisi tra creazione e modifica: nome, colore e durata */
function TypeFields({
  draft,
  onChange,
  idPrefix,
}: {
  draft: TypeDraft;
  onChange: (next: TypeDraft) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_120px] gap-3 items-end">
      <div>
        <label htmlFor={`${idPrefix}-label`} className="block text-xs font-bold text-ink mb-1">Nome</label>
        <input
          id={`${idPrefix}-label`}
          type="text"
          value={draft.label}
          onChange={e => onChange({ ...draft, label: e.target.value })}
          placeholder="Es. Controllo"
          className={SETTINGS_INPUT}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-color`} className="block text-xs font-bold text-ink mb-1">Colore</label>
        <input
          id={`${idPrefix}-color`}
          type="color"
          value={draft.color}
          onChange={e => onChange({ ...draft, color: e.target.value })}
          className="h-[38px] w-14 rounded-xl border border-line-strong bg-surface cursor-pointer p-1"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-duration`} className="block text-xs font-bold text-ink mb-1">Durata (min)</label>
        <input
          id={`${idPrefix}-duration`}
          type="number"
          inputMode="numeric"
          min={MIN_DURATION}
          max={MAX_DURATION}
          step={5}
          value={draft.durationMinutes}
          onChange={e => onChange({ ...draft, durationMinutes: e.target.value })}
          className={SETTINGS_INPUT}
        />
      </div>
    </div>
  );
}
