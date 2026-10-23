"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { apiFetch } from "@/app/lib/api-client";
import { refreshMe } from "@/app/hooks/use-me";
import { TERM_KEYS } from "@/lib/terms";
import type { TermKey, Terms } from "@/app/types/settings";
import type { SettingsResponse } from "@/app/types/api";
import {
  BTN_PRIMARY,
  SETTINGS_INPUT,
  SettingsCard,
  FormError,
  FormNotice,
  errorMessage,
  type SettingsUpdater,
} from "@/app/components/modules/settings-shared";

interface TermField {
  key: TermKey;
  label: string;
}

interface TermGroup {
  title: string;
  fields: TermField[];
}

const TERM_GROUPS: TermGroup[] = [
  {
    title: "Nomi",
    fields: [
      { key: "clientSingular", label: "Cliente (singolare)" },
      { key: "clientPlural", label: "Clienti (plurale)" },
      { key: "quoteSingular", label: "Preventivo (singolare)" },
      { key: "quotePlural", label: "Preventivi (plurale)" },
      { key: "tasksLabel", label: "Attività" },
      { key: "sensitiveData", label: "Dati sensibili" },
    ],
  },
  {
    title: "Ruoli",
    fields: [
      { key: "ownerTitle", label: "Titolo del titolare" },
      { key: "memberTitle", label: "Titolo del collaboratore" },
      { key: "accountantTitle", label: "Titolo dell'assistente contabile" },
    ],
  },
  {
    title: "Sottotitoli delle pagine",
    fields: [
      { key: "clientsSubtitle", label: "Clienti" },
      { key: "chatSubtitle", label: "Chat" },
      { key: "agendaSubtitle", label: "Agenda" },
      { key: "tasksSubtitle", label: "Attività" },
      { key: "quotesSubtitle", label: "Preventivi" },
      { key: "inventorySubtitle", label: "Magazzino" },
    ],
  },
  {
    title: "Magazzino",
    fields: [
      { key: "inventoryLabel", label: "Nome della sezione" },
      { key: "itemSingular", label: "Articolo (singolare)" },
      { key: "itemPlural", label: "Articoli (plurale)" },
    ],
  },
  {
    title: "Stati dei preventivi",
    fields: [
      { key: "statusPendingAi", label: "Bozza generata dall'AI" },
      { key: "statusSent", label: "Inviato" },
      { key: "statusApproved", label: "Accettato" },
      { key: "statusDeclined", label: "Non accettato" },
    ],
  },
];

const ALL_FIELDS: TermField[] = TERM_GROUPS.flatMap(group => group.fields);
const LABEL_BY_KEY = Object.fromEntries(ALL_FIELDS.map(f => [f.key, f.label])) as Record<TermKey, string>;

interface TermsCardProps {
  settings: SettingsResponse;
  onChange: SettingsUpdater;
}

/**
 * Etichette dello studio. Campo vuoto = valore del preset (default). Si salvano solo le chiavi cambiate.
 */
export default function TermsCard({ settings, onChange }: TermsCardProps) {
  const [draft, setDraft] = useState<Partial<Terms>>(() => ({ ...settings.termOverrides }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const original = (key: TermKey) => (settings.termOverrides[key] ?? "").trim();
  const changed = TERM_KEYS.filter(key => (draft[key] ?? "").trim() !== original(key));

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (changed.length === 0) {
      setNotice("Nessuna modifica da salvare.");
      return;
    }
    const body: Partial<Terms> = {};
    for (const key of changed) body[key] = (draft[key] ?? "").trim();

    setSaving(true);
    try {
      const terms = await apiFetch<Terms>("/api/settings/terms", { method: "PATCH", body: JSON.stringify(body) });
      const overrides: Partial<Terms> = {};
      for (const key of TERM_KEYS) {
        const value = (draft[key] ?? "").trim();
        if (value) overrides[key] = value;
      }
      setDraft(overrides);
      onChange(s => ({ ...s, terms, termOverrides: overrides }));
      refreshMe();
      setNotice("Terminologia salvata.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      id="settings-terms"
      title="Terminologia"
      description="Come lo studio chiama clienti, preventivi, ruoli e stati. Lascia vuoto per usare il valore del preset."
    >
      <form onSubmit={save} className="space-y-5" noValidate>
        {TERM_GROUPS.map(group => (
          <fieldset key={group.title} className="space-y-3">
            <legend className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2">{group.title}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {group.fields.map(field => {
                const id = `term-${field.key}`;
                return (
                  <div key={field.key}>
                    <label htmlFor={id} className="block text-xs font-bold text-ink mb-1">{LABEL_BY_KEY[field.key]}</label>
                    <input
                      id={id}
                      type="text"
                      value={draft[field.key] ?? ""}
                      onChange={e => setDraft(d => ({ ...d, [field.key]: e.target.value }))}
                      placeholder={settings.terms[field.key]}
                      className={SETTINGS_INPUT}
                    />
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}

        <FormError message={error} />
        <FormNotice message={notice} />

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-ink-muted">
            {changed.length > 0 ? `${changed.length} modifiche da salvare` : "Nessuna modifica"}
          </p>
          <button type="submit" disabled={saving || changed.length === 0} className={BTN_PRIMARY}>
            {saving && <LoaderCircle size={12} className="animate-spin" />}
            {saving ? "Salvataggio…" : "Salva terminologia"}
          </button>
        </div>
      </form>
    </SettingsCard>
  );
}
