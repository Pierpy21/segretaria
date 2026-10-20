"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { apiFetch } from "@/app/lib/api-client";
import { refreshMe } from "@/app/hooks/use-me";
import { SECTORS } from "@/app/constants/sectors";
import type { ApplyTemplateInput, Sector, SettingsResponse } from "@/app/types/api";
import {
  BTN_PRIMARY,
  SETTINGS_INPUT,
  SettingsCard,
  FormError,
  FormNotice,
  errorMessage,
  type SettingsUpdater,
} from "@/app/components/modules/settings-shared";

interface SectorCardProps {
  settings: SettingsResponse;
  onChange: SettingsUpdater;
}

/** Settore attuale, versione del preset e applicazione di un preset (aggiunte, nulla cancellato). */
export default function SectorCard({ settings, onChange }: SectorCardProps) {
  const [templateKey, setTemplateKey] = useState<string>(settings.sector);
  const [keepTerms, setKeepTerms] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sectorLabel = SECTORS[settings.sector]?.label ?? settings.sector;
  const selected = settings.templates.find(tpl => tpl.key === templateKey) ?? null;
  const applied = settings.templates.find(tpl => tpl.key === settings.sector) ?? null;
  const outdated = applied !== null && settings.templateVersion !== applied.version;

  async function applyTemplate() {
    if (!selected) return;
    const message = [
      `Applicare il preset "${selected.label}"?`,
      "",
      "Vengono aggiunti campi, tipi di appuntamento e moduli mancanti. Non viene cancellato nulla.",
      keepTerms
        ? "Le etichette personalizzate restano invariate."
        : "Le etichette personalizzate vengono sostituite da quelle del preset.",
    ].join("\n");
    if (!window.confirm(message)) return;

    const body: ApplyTemplateInput = { sector: selected.key as Sector, keepTerms };
    setApplying(true);
    setError(null);
    setNotice(null);
    try {
      const next = await apiFetch<SettingsResponse>("/api/settings/template", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onChange(() => next);
      refreshMe();
      setNotice(`Preset "${selected.label}" applicato.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setApplying(false);
    }
  }

  return (
    <SettingsCard id="settings-sector" title="Settore" description="Preset di settore: campi, tipi di appuntamento e moduli di partenza.">
      <dl className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-0.5">Settore attuale</dt>
          <dd className="text-sm font-bold text-ink">{sectorLabel}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-0.5">Versione preset</dt>
          <dd className="text-sm font-bold text-ink">
            {settings.templateVersion !== null ? `v${settings.templateVersion}` : "Mai applicato"}
          </dd>
          {outdated && applied && (
            <dd className="text-[11px] font-semibold text-amber-800 mt-0.5">Disponibile la v{applied.version}</dd>
          )}
        </div>
      </dl>

      <div className="space-y-3">
        <div>
          <label htmlFor="settings-template" className="block text-xs font-bold text-ink mb-1">Preset da applicare</label>
          <select
            id="settings-template"
            value={templateKey}
            onChange={e => setTemplateKey(e.target.value)}
            className={SETTINGS_INPUT}
          >
            {settings.templates.map(tpl => (
              <option key={tpl.key} value={tpl.key}>
                {tpl.label} (v{tpl.version})
              </option>
            ))}
          </select>
          {selected && <p className="mt-1 text-[11px] text-ink-muted leading-snug">{selected.description}</p>}
        </div>

        <label className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-line cursor-pointer hover:bg-surface-muted">
          <input
            type="checkbox"
            checked={keepTerms}
            onChange={e => setKeepTerms(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-line-strong accent-accent"
          />
          <span>
            <span className="block text-xs font-semibold text-ink">Mantieni le etichette personalizzate</span>
            <span className="block text-[11px] text-ink-muted">Le etichette cambiate nella sezione Terminologia restano sopra il preset.</span>
          </span>
        </label>

        <FormError message={error} />
        <FormNotice message={notice} />

        <div className="flex justify-end">
          <button type="button" onClick={() => void applyTemplate()} disabled={!selected || applying} className={BTN_PRIMARY}>
            {applying && <LoaderCircle size={12} className="animate-spin" />}
            {applying ? "Applicazione…" : "Applica preset"}
          </button>
        </div>
      </div>
    </SettingsCard>
  );
}
