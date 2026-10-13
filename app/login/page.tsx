"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogIn, UserPlus } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "login" | "register";

const MIN_PASSWORD_LENGTH = 8;

/** Traduce gli errori Supabase Auth più comuni in italiano */
function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email o password non corrette.";
  if (m.includes("email not confirmed")) return "Conferma prima l'indirizzo email dal link ricevuto.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Esiste già un account con questa email.";
  if (m.includes("password should be at least")) return `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`;
  if (m.includes("invalid email") || m.includes("unable to validate email")) return "Indirizzo email non valido.";
  if (m.includes("rate limit") || m.includes("too many")) return "Troppi tentativi. Attendi qualche minuto e riprova.";
  return "Operazione non riuscita. Riprova.";
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  function goHome() {
    router.replace("/");
    router.refresh();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError("Inserisci email e password.");
      return;
    }
    if (mode === "register" && password.length < MIN_PASSWORD_LENGTH) {
      setError(`La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`);
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (authError) {
          setError(authErrorMessage(authError.message));
          return;
        }
        goHome();
        return;
      }

      const { data, error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (authError) {
        setError(authErrorMessage(authError.message));
        return;
      }
      if (data.session) {
        goHome();
        return;
      }
      setInfo("Registrazione completata. Controlla la mail e apri il link di conferma per accedere.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operazione non riuscita. Riprova.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-xl px-3 py-2 text-sm bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600";

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="mb-5">
          <h1 className="text-base font-bold text-slate-900">SegretarIA Dental</h1>
          <p className="text-xs text-slate-500">Accedi alla gestione del tuo studio odontoiatrico</p>
        </div>

        <div role="tablist" className="grid grid-cols-2 gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1 mb-5">
          {(["login", "register"] as const).map(m => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                ${mode === m ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              {m === "login" ? "Accedi" : "Registrati"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
          <div>
            <label htmlFor="email" className="block text-xs font-bold text-slate-800 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nome@studio.it"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-bold text-slate-800 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === "register" ? `Almeno ${MIN_PASSWORD_LENGTH} caratteri` : "••••••••"}
              className={inputClass}
            />
          </div>

          {error && (
            <p role="alert" className="text-xs font-semibold text-red-600">
              {error}
            </p>
          )}
          {info && (
            <p role="status" className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <LoaderCircle size={13} className="animate-spin" />
            ) : mode === "login" ? (
              <LogIn size={13} />
            ) : (
              <UserPlus size={13} />
            )}
            {submitting ? "Attendere…" : mode === "login" ? "Accedi" : "Crea account"}
          </button>
        </form>
      </div>
    </main>
  );
}
