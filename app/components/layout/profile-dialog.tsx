"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { Modal } from "@/app/components/ui/modal";
import { refreshMe } from "@/app/hooks/use-me";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PERSON_NAME_MAX, normalizePersonName } from "@/lib/person-name";
import type { MeResponse } from "@/app/types/api";
import { BTN_PRIMARY, BTN_SECONDARY, SETTINGS_INPUT, FormError } from "@/app/components/modules/settings-shared";

const SAVE_ERROR = "Salvataggio non riuscito. Riprova.";

interface ProfileDialogProps {
  me: MeResponse;
  opener: HTMLElement | null;
  onClose: () => void;
}

/** Profilo dell'utente: nome e cognome modificabili (user_metadata), email in sola lettura. */
export function ProfileDialog({ me, opener, onClose }: ProfileDialogProps) {
  const firstId = useId();
  const lastId = useId();
  const emailId = useId();
  const [firstName, setFirstName] = useState(me.user.firstName ?? "");
  const [lastName, setLastName] = useState(me.user.lastName ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    const first = normalizePersonName(firstName);
    const last = normalizePersonName(lastName);
    if (!first || !last) {
      setError("Inserisci nome e cognome.");
      return;
    }
    inFlight.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const { error: authError } = await createSupabaseBrowserClient().auth.updateUser({
        data: { first_name: first, last_name: last },
      });
      if (authError) {
        setError(SAVE_ERROR);
        return;
      }
      refreshMe();
      onClose();
    } catch {
      setError(SAVE_ERROR);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Il tuo profilo" onClose={submitting ? undefined : onClose} opener={opener}>
      <form onSubmit={save} className="space-y-3.5" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={firstId} className="block text-xs font-bold text-ink mb-1">Nome</label>
            <input
              id={firstId}
              type="text"
              autoComplete="given-name"
              data-autofocus
              required
              maxLength={PERSON_NAME_MAX}
              disabled={submitting}
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              className={SETTINGS_INPUT}
            />
          </div>
          <div>
            <label htmlFor={lastId} className="block text-xs font-bold text-ink mb-1">Cognome</label>
            <input
              id={lastId}
              type="text"
              autoComplete="family-name"
              required
              maxLength={PERSON_NAME_MAX}
              disabled={submitting}
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              className={SETTINGS_INPUT}
            />
          </div>
        </div>

        <div>
          <label htmlFor={emailId} className="block text-xs font-bold text-ink mb-1">Email</label>
          <input id={emailId} type="email" readOnly value={me.user.email ?? ""} className={`${SETTINGS_INPUT} text-ink-muted`} />
        </div>

        <FormError message={error} />

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
          <button type="button" onClick={onClose} disabled={submitting} className={BTN_SECONDARY}>
            Annulla
          </button>
          <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
            {submitting && <LoaderCircle size={12} className="animate-spin" />}
            {submitting ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
