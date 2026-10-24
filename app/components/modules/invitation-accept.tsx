"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogOut } from "lucide-react";
import { apiFetch } from "@/app/lib/api-client";
import { useApiData } from "@/app/hooks/use-api-data";
import { ErrorState, Skeleton } from "@/app/components/ui/async-state";
import { formatDate } from "@/app/components/modules/settings-shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { refreshMe, useMe } from "@/app/hooks/use-me";
import { normalizePersonName, PERSON_NAME_MAX } from "@/lib/person-name";
import { roleTitle, DEFAULT_TERMS } from "@/lib/terms";
import { API_ERROR } from "@/app/types/api";
import type { AcceptInvitationResult, InvitationPreview } from "@/app/types/api";

const MIN_PASSWORD_LENGTH = 8;
const NOT_FOUND_MESSAGE = "Invito non valido o scaduto";
const INPUT_CLASS =
  "w-full rounded-xl px-3 py-2 text-sm bg-surface border border-line-strong text-ink placeholder:text-ink-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60";
const BTN_PRIMARY =
  "w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-accent-ink bg-accent hover:bg-accent-hover shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
const BTN_SECONDARY =
  "w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-ink bg-surface-muted border border-line-strong hover:bg-line transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

interface InvitationAcceptProps {
  token: string;
}

/** Messaggio italiano per l'errore di accettazione. FORBIDDEN arriva come solo codice dal server. */
function acceptErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Operazione non riuscita. Riprova.";
  if (err.message === API_ERROR.FORBIDDEN) return "Questo invito è destinato a un altro indirizzo email";
  if (err.message.startsWith("HTTP_") || err.message === API_ERROR.UNAUTHORIZED) {
    return "Operazione non riuscita. Riprova.";
  }
  return err.message;
}

/** Contenitore centrato coerente con login e onboarding */
function Card({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-line p-6 shadow-sm">{children}</div>
    </main>
  );
}

export default function InvitationAccept({ token }: InvitationAcceptProps) {
  const router = useRouter();
  const invite = useApiData<InvitationPreview>(`/api/invitations/${encodeURIComponent(token)}`);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Accettazione riuscita ma password non impostata: l'utente può comunque entrare nello studio
  const [acceptedHome, setAcceptedHome] = useState<string | null>(null);
  const inFlight = useRef(false);
  // Nome e cognome: precompilati da /api/me; la bozza vince quando l'utente modifica il campo
  const { data: me } = useMe();
  const [firstNameDraft, setFirstNameDraft] = useState<string | null>(null);
  const [lastNameDraft, setLastNameDraft] = useState<string | null>(null);
  const firstName = firstNameDraft ?? me?.user.firstName ?? "";
  const lastName = lastNameDraft ?? me?.user.lastName ?? "";

  // ── Stato di caricamento / errori dell'anteprima ──
  if (invite.loading) {
    return (
      <Card>
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      </Card>
    );
  }

  if (invite.error === NOT_FOUND_MESSAGE) {
    return (
      <Card>
        <h1 className="text-base font-bold text-ink">Invito non valido</h1>
        <p className="text-xs text-ink-muted mt-1">
          Il link non è valido o è stato già utilizzato. Chiedi allo studio di inviartene uno nuovo.
        </p>
      </Card>
    );
  }

  if (invite.error) {
    return (
      <Card>
        <ErrorState message="Impossibile caricare l'invito." onRetry={invite.reload} />
      </Card>
    );
  }

  const preview = invite.data;
  if (!preview) return null;

  const roleName = roleTitle(DEFAULT_TERMS, preview.role);

  if (preview.status !== "pending") {
    const text: Record<Exclude<typeof preview.status, "pending">, { title: string; body: string }> = {
      accepted: {
        title: "Invito già accettato",
        body: "Questo invito è già stato accettato.",
      },
      revoked: {
        title: "Invito revocato",
        body: "Questo invito non è più valido. Chiedi allo studio di inviartene uno nuovo.",
      },
      expired: {
        title: "Invito scaduto",
        body: "Questo invito è scaduto. Chiedi allo studio di inviartene uno nuovo.",
      },
    };
    const message = text[preview.status];
    return (
      <Card>
        <h1 className="text-base font-bold text-ink">{message.title}</h1>
        <p className="text-xs text-ink-muted mt-1 mb-4">{message.body}</p>
        <Link href="/" className={`${BTN_SECONDARY} block text-center`}>Vai allo studio</Link>
      </Card>
    );
  }

  if (!preview.emailMatches) {
    async function switchAccount() {
      setSigningOut(true);
      try {
        await createSupabaseBrowserClient().auth.signOut();
      } finally {
        window.location.href = `/login?next=${encodeURIComponent(`/invito/${token}`)}`;
      }
    }

    return (
      <Card>
        <h1 className="text-base font-bold text-ink">Questo invito è per {preview.email}</h1>
        <p className="text-xs text-ink-muted mt-1 mb-4">
          Hai effettuato l&apos;accesso con un altro indirizzo email. Esci e accedi con l&apos;account corretto per
          unirti allo studio.
        </p>
        <button type="button" onClick={switchAccount} disabled={signingOut} className={BTN_SECONDARY}>
          {signingOut ? <LoaderCircle size={13} className="animate-spin" /> : <LogOut size={13} />}
          Esci e accedi con un altro account
        </button>
      </Card>
    );
  }

  async function accept(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    const first = normalizePersonName(firstName);
    const last = normalizePersonName(lastName);
    if (!first || !last) {
      setError("Inserisci nome e cognome.");
      return;
    }
    if (password && password.length < MIN_PASSWORD_LENGTH) {
      setError(`La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`);
      return;
    }
    inFlight.current = true;
    setError(null);
    setSubmitting(true);
    try {
      // Prima l'accettazione: se fallisce (es. 409) la password dell'account resta invariata.
      const result = await apiFetch<AcceptInvitationResult>(
        `/api/invitations/${encodeURIComponent(token)}/accept`,
        { method: "POST" }
      );
      // Poi nome, cognome e (se inserita) password in un'unica chiamata
      const { error: authError } = await createSupabaseBrowserClient().auth.updateUser({
        data: { first_name: first, last_name: last },
        ...(password ? { password } : {}),
      });
      if (authError) {
        setAcceptedHome(result.homePath);
        setError(
          "Sei entrato nello studio, ma non è stato possibile salvare il profilo. Potrai completarlo dal tuo profilo."
        );
        router.refresh();
        return;
      }
      refreshMe();
      router.replace(result.homePath);
      router.refresh();
    } catch (err) {
      setError(acceptErrorMessage(err));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="mb-5">
        <h1 className="text-base font-bold text-ink">Unisciti a {preview.companyName} come {roleName}</h1>
        <p className="text-xs text-ink-muted mt-1">
          Invito per {preview.email} · scade il {formatDate(preview.expiresAt)}
        </p>
      </div>

      <form onSubmit={accept} className="space-y-3.5" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="invite-first-name" className="block text-xs font-bold text-ink mb-1">Nome</label>
            <input
              id="invite-first-name"
              type="text"
              autoComplete="given-name"
              required
              maxLength={PERSON_NAME_MAX}
              disabled={submitting}
              value={firstName}
              onChange={e => setFirstNameDraft(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="invite-last-name" className="block text-xs font-bold text-ink mb-1">Cognome</label>
            <input
              id="invite-last-name"
              type="text"
              autoComplete="family-name"
              required
              maxLength={PERSON_NAME_MAX}
              disabled={submitting}
              value={lastName}
              onChange={e => setLastNameDraft(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div>
          <label htmlFor="invite-password" className="block text-xs font-bold text-ink mb-1">
            Imposta una password – necessaria se è il tuo primo accesso
          </label>
          <input
            id="invite-password"
            type="password"
            autoComplete="new-password"
            disabled={submitting}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={`Almeno ${MIN_PASSWORD_LENGTH} caratteri (facoltativa)`}
            className={INPUT_CLASS}
          />
          <p className="text-[11px] text-ink-muted mt-1">Lasciala vuota se hai già un account.</p>
        </div>

        {error && <p role="alert" className="text-xs font-semibold text-red-800">{error}</p>}

        {acceptedHome ? (
          <Link href={acceptedHome} className={`${BTN_PRIMARY} block text-center`}>Vai allo studio</Link>
        ) : (
          <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
            {submitting && <LoaderCircle size={13} className="animate-spin" />}
            {submitting ? "Accettazione in corso…" : "Accetta invito"}
          </button>
        )}
      </form>
    </Card>
  );
}
