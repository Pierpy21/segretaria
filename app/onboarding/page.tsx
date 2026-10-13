"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { apiFetch } from "@/app/lib/api-client";
import type { MeResponse, OnboardingInput } from "@/app/types/api";
import { Skeleton } from "@/app/components/ui/async-state";

export default function OnboardingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState("");
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
      const body: OnboardingInput = { name: studioName, seedDemo };
      await apiFetch("/api/onboarding", { method: "POST", body: JSON.stringify(body) });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operazione non riuscita. Riprova.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        {checking ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : (
          <>
            <div className="mb-5">
              <h1 className="text-base font-bold text-slate-900">Configura il tuo studio</h1>
              <p className="text-xs text-slate-500">Serve un solo passaggio prima di iniziare.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
              <div>
                <label htmlFor="studio-name" className="block text-xs font-bold text-slate-800 mb-1">
                  Nome dello studio
                </label>
                <input
                  id="studio-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Es. Studio Dentistico Dott. Rossi"
                  className="w-full rounded-xl px-3 py-2 text-sm bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <label className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={seedDemo}
                  onChange={e => setSeedDemo(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300"
                />
                <span>
                  <span className="block text-xs font-semibold text-slate-800">Carica dati demo</span>
                  <span className="block text-[11px] text-slate-500">Pazienti, appuntamenti, chat e preventivi di esempio.</span>
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
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
