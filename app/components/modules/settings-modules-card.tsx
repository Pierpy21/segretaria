"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { apiFetch } from "@/app/lib/api-client";
import { refreshMe } from "@/app/hooks/use-me";
import { useTerms } from "@/app/hooks/use-terms";
import { MODULE_KEYS } from "@/lib/auth/permissions";
import type { CompanyModules, ModuleKey, Terms } from "@/app/types/settings";
import type { SettingsResponse } from "@/app/types/api";
import { FormError, SettingsCard, errorMessage, type SettingsUpdater } from "@/app/components/modules/settings-shared";

interface ModulesCardProps {
  settings: SettingsResponse;
  onChange: SettingsUpdater;
}

/** Etichette e descrizioni dei moduli (le etichette dei termini arrivano dallo studio). */
function moduleCopy(t: Terms): Record<ModuleKey, { label: string; description: string }> {
  return {
    agenda: { label: "Agenda & promemoria", description: "Appuntamenti, sincronizzazione con Google/Apple e promemoria." },
    chat: { label: "Chat", description: "Conversazioni e messaggi con i clienti." },
    quotes: { label: t.quotePlural, description: "Preventivi e relativa accettazione." },
    maintenance: { label: t.tasksLabel, description: "Kanban delle attività operative." },
    sensitive_data: { label: t.sensitiveData, description: "Campi riservati dei clienti, visibili solo con il permesso dedicato." },
    assets: { label: "Beni dei clienti", description: "Veicoli, animali, immobili o altri beni collegati ai clienti." },
    ai_assistant: { label: "Assistente AI", description: "Bozze automatiche e risposte suggerite." },
    inventory: { label: "Magazzino", description: "Articoli, giacenze, lotti e scadenze." },
  };
}

/** Moduli attivi dello studio. Il salvataggio è immediato; la sidebar si aggiorna subito. */
export default function ModulesCard({ settings, onChange }: ModulesCardProps) {
  const terms = useTerms();
  const copy = moduleCopy(terms);
  const [busy, setBusy] = useState<Partial<Record<ModuleKey, boolean>>>({});
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: ModuleKey, enabled: boolean) {
    setError(null);
    setBusy(b => ({ ...b, [key]: true }));
    // Aggiornamento ottimistico: in caso di errore si ripristina il valore precedente
    onChange(s => ({ ...s, modules: { ...s.modules, [key]: enabled } }));
    try {
      const modules = await apiFetch<CompanyModules>("/api/settings/modules", {
        method: "PATCH",
        body: JSON.stringify({ [key]: enabled }),
      });
      onChange(s => ({ ...s, modules }));
      refreshMe();
    } catch (err) {
      onChange(s => ({ ...s, modules: { ...s.modules, [key]: !enabled } }));
      setError(`${copy[key].label}: ${errorMessage(err)}`);
    } finally {
      setBusy(b => ({ ...b, [key]: false }));
    }
  }

  return (
    <SettingsCard id="settings-modules" title="Moduli" description="Le funzioni attive nel menu. Un modulo spento nasconde anche i relativi permessi.">
      <ul className="divide-y divide-line">
        {MODULE_KEYS.map(key => {
          const labelId = `module-${key}-label`;
          const isBusy = busy[key] === true;
          return (
            <li key={key} className="py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p id={labelId} className="text-xs font-bold text-ink">{copy[key].label}</p>
                <p className="text-[11px] text-ink-muted leading-snug">{copy[key].description}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isBusy && <LoaderCircle size={12} className="animate-spin text-ink-muted" aria-hidden="true" />}
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={settings.modules[key]}
                    disabled={isBusy}
                    aria-labelledby={labelId}
                    onChange={e => void toggle(key, e.target.checked)}
                    className="sr-only peer"
                  />
                  <span
                    aria-hidden="true"
                    className="relative w-9 h-5 rounded-full bg-line-strong transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-disabled:opacity-60 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-surface after:transition-transform after:content-[''] peer-checked:after:translate-x-4"
                  />
                </label>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-2">
        <FormError message={error} />
      </div>
    </SettingsCard>
  );
}
