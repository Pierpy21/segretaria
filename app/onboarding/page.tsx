"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { apiFetch } from "@/app/lib/api-client";
import type { MeResponse, OnboardingInput, Sector } from "@/app/types/api";
import { Skeleton } from "@/app/components/ui/async-state";
import { SECTOR_OPTIONS, SECTORS } from "@/app/constants/sectors";

export default function OnboardingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState("");
  const [sector, setSector] = useState<Sector>("generico");
  const [seedDemo, setSeedDemo] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Se lo studio esiste già, non serve l'onboarding
  useEffect(() => {
    let cancelled = false;
    apiFetch<MeResponse>("/api/me")
      .then(me => {
        if (cancelled) return;
        if (me.company) {
          router.replace("/");
          return;
        }
        setChecking(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Errore sconosciuto.");
        setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const studioName = name.trim();
    if (!studioName) {
      setError("Inserisci il nome dello studio.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const body: OnboardingInput = { name: studioName, seedDemo, sector };
      await apiFetch("/api/onboarding", { method: "POST", body: JSON.stringify(body) });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operazione non riuscita. Riprova.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-line p-6 shadow-sm">
        {checking ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : (
          <>
            <div className="mb-5">
              <h1 className="text-base font-bold text-ink">Configura il tuo studio</h1>
              <p className="text-xs text-ink-muted">Serve un solo passaggio prima di iniziare.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
              <div>
                <label htmlFor="studio-name" className="block text-xs font-bold text-ink mb-1">
                  Nome dello studio
                </label>
                <input
                  id="studio-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={SECTORS[sector].namePlaceholder}
                  className="w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong text-ink placeholder:text-ink-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>

              <div>
                <label htmlFor="studio-sector" className="block text-xs font-bold text-ink mb-1">
                  Settore
                </label>
                <select
                  id="studio-sector"
                  value={sector}
                  onChange={e => setSector(e.target.value as Sector)}
                  className="w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                >
                  {SECTOR_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <label className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-line cursor-pointer hover:bg-surface-muted">
                <input
                  type="checkbox"
                  checked={seedDemo}
                  onChange={e => setSeedDemo(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-line-strong accent-accent"
                />
                <span>
                  <span className="block text-xs font-semibold text-ink">Carica dati demo</span>
                  <span className="block text-[11px] text-ink-muted">Clienti, appuntamenti, chat e preventivi di esempio.</span>
                </span>
              </label>

              {error && (
                <p role="alert" className="text-xs font-semibold text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-accent-ink bg-accent hover:bg-accent-hover shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting && <LoaderCircle size={13} className="animate-spin" />}
                {submitting ? "Creazione in corso…" : "Crea studio"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
