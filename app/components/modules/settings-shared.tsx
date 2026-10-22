"use client";

import type { ReactNode } from "react";
import type { SettingsResponse } from "@/app/types/api";

/** Aggiorna la copia locale di GET /api/settings (la pagina la tiene in useApiData) */
export type SettingsUpdater = (update: (prev: SettingsResponse) => SettingsResponse) => void;

/** Classi condivise dalle schede di Impostazioni */
export const SETTINGS_INPUT =
  "w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong text-ink placeholder:text-ink-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60";
export const BTN_PRIMARY =
  "flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-accent-ink bg-accent hover:bg-accent-hover shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
export const BTN_SECONDARY =
  "px-3 py-1.5 rounded-lg text-xs font-bold text-ink bg-surface-muted border border-line-strong hover:bg-line transition-colors disabled:opacity-60";
export const BTN_SMALL =
  "px-2.5 py-1 rounded-lg text-[11px] font-bold text-accent-text bg-accent/10 hover:bg-accent/20 transition-colors disabled:opacity-60";
export const BTN_DANGER =
  "px-2.5 py-1 rounded-lg text-[11px] font-bold text-red-800 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-60";

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Operazione non riuscita. Riprova.";
}

/** ISO → "14 giugno 2026" (solo client: nessun mismatch di idratazione) */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

/** Scheda di una sezione delle impostazioni */
export function SettingsCard({
  id,
  title,
  description,
  className = "",
  children,
}: {
  id: string;
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={`bg-surface rounded-2xl border border-line p-4 sm:p-5 shadow-2xs ${className}`}>
      <div className="mb-4">
        <h2 id={id} className="text-sm font-bold text-ink">{title}</h2>
        {description && <p className="text-xs text-ink-muted mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Messaggio di errore di un form */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="text-xs font-semibold text-red-800">{message}</p>;
}

/** Messaggio di esito (conferma) non bloccante */
export function FormNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="status" className="text-xs font-semibold text-emerald-700">{message}</p>;
}
