"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Clock,
  Copy,
  LoaderCircle,
  Mail,
  RotateCw,
  Trash2,
  TriangleAlert,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { apiFetch } from "@/app/lib/api-client";
import { useApiData } from "@/app/hooks/use-api-data";
import { useMe, initialsOf } from "@/app/hooks/use-me";
import { useTerms } from "@/app/hooks/use-terms";
import { ErrorState, Skeleton, SkeletonRows } from "@/app/components/ui/async-state";
import { Modal } from "@/app/components/ui/modal";
import {
  API_ERROR,
  type CompanyInvitationView,
  type CompanyRole,
  type CreateInvitationInput,
  type CreateInvitationResult,
  type MemberPatch,
  type MemberView,
  type MembersOverview,
  type RolesResponse,
} from "@/app/types/api";
import type { Terms } from "@/app/types/settings";
import { assignableRoles, invitableRoles } from "@/lib/auth/permissions";
import { roleTitle } from "@/lib/terms";
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  SETTINGS_INPUT,
  SettingsCard,
  FormError,
  FormNotice,
  formatDate,
} from "@/app/components/modules/settings-shared";

const NOTICE_MS = 6000;
const COPY_FEEDBACK_MS = 2000;
const FORBIDDEN_MESSAGE = "Non hai i permessi per questa operazione";
const GENERIC_ERROR = "Operazione non riuscita. Riprova.";

interface Notice {
  type: "success" | "error";
  text: string;
}

interface InviteState {
  opener: HTMLElement | null;
  /** Presente quando la modale mostra il risultato di un invito appena reinviato */
  initialResult?: CreateInvitationResult;
}

interface RemoveState {
  member: MemberView;
  opener: HTMLElement | null;
}

/** Messaggio italiano per l'errore di una richiesta. FORBIDDEN arriva come solo codice dal server. */
function membersErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return GENERIC_ERROR;
  if (err.message === API_ERROR.FORBIDDEN) return FORBIDDEN_MESSAGE;
  if (
    err.message.startsWith("HTTP_") ||
    err.message === API_ERROR.UNAUTHORIZED ||
    err.message === API_ERROR.NO_COMPANY
  ) {
    return GENERIC_ERROR;
  }
  return err.message;
}

/** Owner e admin condividono il titolo ("Titolare"): il suffisso li distingue nei selettori. */
function systemRoleLabel(terms: Terms, role: CompanyRole): string {
  if (role === "owner") return `${terms.ownerTitle} (proprietario)`;
  if (role === "admin") return `${terms.ownerTitle} (amministratore)`;
  return roleTitle(terms, role);
}

// ─── Link di invito con "Copia link" ────────────────────────────────────────

function CopyLinkField({ url }: { url: string }) {
  const inputId = useId();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copyState === "idle") return;
    const timer = setTimeout(() => setCopyState("idle"), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copyState]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-xs font-bold text-ink">Link di invito</label>
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          readOnly
          value={url}
          onFocus={e => e.currentTarget.select()}
          className={`${SETTINGS_INPUT} font-mono text-xs min-w-0`}
        />
        <button type="button" onClick={copyLink} className={`${BTN_SECONDARY} inline-flex items-center gap-1.5 whitespace-nowrap`}>
          {copyState === "copied" ? <CheckCircle2 size={13} /> : <Copy size={13} />}
          {copyState === "copied" ? "Copiato" : "Copia link"}
        </button>
      </div>
      {copyState === "failed" && (
        <p role="alert" className="text-xs font-semibold text-red-800">
          Copia non disponibile: seleziona il link e copialo a mano.
        </p>
      )}
    </div>
  );
}

// ─── Modale invito (form + pannello risultato) ──────────────────────────────

interface InviteMemberModalProps {
  roles: readonly CompanyRole[];
  terms: Terms;
  opener: HTMLElement | null;
  initialResult?: CreateInvitationResult;
  onCreated: () => void;
  onClose: () => void;
}

function InviteMemberModal({ roles, terms, opener, initialResult, onCreated, onClose }: InviteMemberModalProps) {
  const emailId = useId();
  const roleId = useId();
  const defaultRole: CompanyRole = roles.includes("member") ? "member" : (roles[0] ?? "member");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CompanyRole>(defaultRole);
  const [result, setResult] = useState<CreateInvitationResult | null>(initialResult ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Inserisci l'email della persona da invitare.");
      return;
    }
    inFlight.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const body: CreateInvitationInput = { email: cleanEmail, role };
      const created = await apiFetch<CreateInvitationResult>("/api/settings/invitations", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult(created);
      onCreated();
    } catch (err) {
      setError(membersErrorMessage(err));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Modal key="result" title="Invito creato" onClose={onClose} opener={opener}>
        <div
          role="status"
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
            result.emailSent
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}
        >
          {result.emailSent ? (
            <CheckCircle2 size={13} className="mt-px shrink-0" />
          ) : (
            <TriangleAlert size={13} className="mt-px shrink-0" />
          )}
          <span>
            {result.emailSent
              ? `Abbiamo inviato l'invito a ${result.invitation.email}.`
              : "Email non inviata automaticamente: copia il link e mandalo tu."}
          </span>
        </div>
        <CopyLinkField url={result.inviteUrl} />
        <div className="flex justify-end pt-3 border-t border-line">
          <button type="button" data-autofocus onClick={onClose} className={BTN_PRIMARY}>Fatto</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal key="form" title="Invita membro" onClose={submitting ? undefined : onClose} opener={opener}>
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        <div>
          <label htmlFor={emailId} className="block text-xs font-bold text-ink mb-1">Email</label>
          <input
            id={emailId}
            type="email"
            autoComplete="off"
            data-autofocus
            disabled={submitting}
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="nome@studio.it"
            className={SETTINGS_INPUT}
          />
        </div>
        <div>
          <label htmlFor={roleId} className="block text-xs font-bold text-ink mb-1">Ruolo</label>
          <select
            id={roleId}
            disabled={submitting}
            value={role}
            onChange={e => {
              const next = roles.find(r => r === e.target.value);
              if (next) setRole(next);
            }}
            className={SETTINGS_INPUT}
          >
            {roles.map(r => (
              <option key={r} value={r}>{systemRoleLabel(terms, r)}</option>
            ))}
          </select>
        </div>
        <FormError message={error} />
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
          <button type="button" onClick={onClose} disabled={submitting} className={BTN_SECONDARY}>
            Annulla
          </button>
          <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
            {submitting && <LoaderCircle size={12} className="animate-spin" />}
            {submitting ? "Invio in corso…" : "Crea invito"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Modale conferma rimozione ──────────────────────────────────────────────

interface RemoveMemberModalProps {
  member: MemberView;
  opener: HTMLElement | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function RemoveMemberModal({ member, opener, busy, onConfirm, onCancel }: RemoveMemberModalProps) {
  const label = member.email ?? "questo membro";
  return (
    <Modal title="Rimuovi dallo studio" role="alertdialog" onClose={busy ? undefined : onCancel} opener={opener}>
      <p className="text-xs text-ink-muted leading-relaxed">
        Vuoi rimuovere <strong className="text-ink">{label}</strong> dallo studio? Perderà l&apos;accesso ai dati
        dello studio. Potrai invitarlo di nuovo in seguito.
      </p>
      <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
        <button type="button" data-autofocus onClick={onCancel} disabled={busy} className={BTN_SECONDARY}>
          Annulla
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className={`${BTN_DANGER} inline-flex items-center gap-1.5`}>
          {busy && <LoaderCircle size={12} className="animate-spin" />}
          Rimuovi
        </button>
      </div>
    </Modal>
  );
}

// ─── Scheda ─────────────────────────────────────────────────────────────────

/** Membri dello studio e inviti in attesa (members:manage). */
export default function MembersCard() {
  const { data: me } = useMe();
  const terms = useTerms();
  const overview = useApiData<MembersOverview>("/api/settings/members");
  const rolesHook = useApiData<RolesResponse>("/api/settings/roles");
  const customRoles = rolesHook.data?.roles ?? [];
  const rolesReady = rolesHook.data !== null && !rolesHook.error;

  const actorRole: CompanyRole | null = me?.role ?? null;
  const invitable: readonly CompanyRole[] = actorRole ? invitableRoles(actorRole) : [];
  const assignable: readonly CompanyRole[] = actorRole ? assignableRoles(actorRole) : [];
  const canInvite = invitable.length > 0;

  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [inviteState, setInviteState] = useState<InviteState | null>(null);
  const [removeState, setRemoveState] = useState<RemoveState | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const data = overview.data;
  const members = data?.members ?? [];
  const invitations = data?.invitations ?? [];
  const otherMembers = members.filter(m => !m.isSelf);
  const isEmpty = data !== null && otherMembers.length === 0 && invitations.length === 0;
  const isBusy = busyKey !== null;

  /** Una mutazione alla volta; i dati vengono ricaricati sempre al termine. */
  async function runMutation<T>(key: string, action: () => Promise<T>): Promise<T | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusyKey(key);
    try {
      return await action();
    } catch (err) {
      setNotice({ type: "error", text: membersErrorMessage(err) });
      return null;
    } finally {
      inFlight.current = false;
      setBusyKey(null);
      overview.reload();
    }
  }

  function memberLabel(member: MemberView): string {
    return member.email ?? "Utente senza email";
  }

  async function changeRole(member: MemberView, role: CompanyRole) {
    const body: MemberPatch = { role };
    const updated = await runMutation(`role:${member.userId}`, () =>
      apiFetch<MemberView>(`/api/settings/members/${encodeURIComponent(member.userId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      })
    );
    if (updated) {
      // Il cambio di ruolo di sistema azzera il ruolo personalizzato (lato server)
      const dropped = member.customRoleId !== null ? " Il ruolo personalizzato è stato rimosso." : "";
      setNotice({
        type: "success",
        text: `Ruolo di ${memberLabel(member)} aggiornato a ${systemRoleLabel(terms, updated.role)}.${dropped}`,
      });
    }
  }

  async function changeCustomRole(member: MemberView, customRoleId: string | null) {
    const body: MemberPatch = { customRoleId };
    const updated = await runMutation(`custom:${member.userId}`, () =>
      apiFetch<MemberView>(`/api/settings/members/${encodeURIComponent(member.userId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      })
    );
    if (updated) {
      setNotice({
        type: "success",
        text: customRoleId
          ? `Ruolo personalizzato di ${memberLabel(member)} aggiornato.`
          : `${memberLabel(member)} usa di nuovo i permessi standard.`,
      });
    }
  }

  async function confirmRemove(member: MemberView) {
    const removed = await runMutation(`remove:${member.userId}`, () =>
      apiFetch<{ userId: string }>(`/api/settings/members/${encodeURIComponent(member.userId)}`, { method: "DELETE" })
    );
    setRemoveState(null);
    if (removed) setNotice({ type: "success", text: `${member.email ?? "Membro"} rimosso dallo studio.` });
  }

  async function revokeInvitation(inv: CompanyInvitationView) {
    const revoked = await runMutation(`revoke:${inv.id}`, () =>
      apiFetch<{ id: string }>(`/api/settings/invitations/${encodeURIComponent(inv.id)}`, { method: "DELETE" })
    );
    if (revoked) setNotice({ type: "success", text: `Invito a ${inv.email} revocato.` });
  }

  async function resendInvitation(inv: CompanyInvitationView, opener: HTMLElement | null) {
    const body: CreateInvitationInput = { email: inv.email, role: inv.role };
    const created = await runMutation(`resend:${inv.id}`, () =>
      apiFetch<CreateInvitationResult>("/api/settings/invitations", {
        method: "POST",
        body: JSON.stringify(body),
      })
    );
    if (created) setInviteState({ opener, initialResult: created });
  }

  return (
    <SettingsCard
      id="settings-members"
      title="Membri dello studio"
      description="Chi lavora nello studio e gli inviti ancora in attesa di accettazione."
      className="xl:col-span-2"
    >
      {/* Esito dell'ultima operazione: scompare da sola */}
      {notice?.type === "success" && <FormNotice message={notice.text} />}
      {notice?.type === "error" && <FormError message={notice.text} />}

      {overview.loading && !data ? (
        <SkeletonRows rows={4} className="h-12" />
      ) : overview.error && !data ? (
        <ErrorState message="Impossibile caricare i membri dello studio." onRetry={overview.reload} />
      ) : data ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-muted">
              {`${members.length} ${members.length === 1 ? "membro" : "membri"} · ${invitations.length} ${
                invitations.length === 1 ? "invito in attesa" : "inviti in attesa"
              }`}
            </p>
            {canInvite && (
              <button
                type="button"
                onClick={e => setInviteState({ opener: e.currentTarget })}
                disabled={isBusy}
                className={BTN_PRIMARY}
              >
                <UserPlus size={14} /> Invita membro
              </button>
            )}
          </div>

          {overview.error && <ErrorState message="Impossibile aggiornare i membri dello studio." onRetry={overview.reload} />}
          {rolesHook.error && (
            <ErrorState message="Impossibile caricare i ruoli personalizzati." onRetry={rolesHook.reload} />
          )}

          {isEmpty && (
            <div className="rounded-xl border border-line p-6 text-center">
              <div className="mx-auto w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mb-3">
                <UsersRound size={18} className="text-accent" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-ink">Nessun collaboratore nello studio</p>
              <p className="text-xs text-ink-muted mt-1 mb-4">
                Invita colleghi o assistenti: riceveranno un link per unirsi allo studio.
              </p>
              {canInvite && (
                <button
                  type="button"
                  onClick={e => setInviteState({ opener: e.currentTarget })}
                  disabled={isBusy}
                  className={`${BTN_PRIMARY} mx-auto`}
                >
                  <UserPlus size={14} /> Invita il primo collaboratore
                </button>
              )}
            </div>
          )}

          {/* ── Membri ── */}
          <section aria-labelledby="settings-members-list" className="rounded-xl border border-line overflow-hidden">
            <h3 id="settings-members-list" className="px-4 py-2.5 text-xs font-bold text-ink border-b border-line bg-surface-muted/50">
              Membri
            </h3>
            <ul className="divide-y divide-line">
              {members.map(m => {
                const label = memberLabel(m);
                const customLabel = customRoles.find(r => r.id === m.customRoleId)?.label ?? null;
                const canCustom = m.canManage && (m.role === "member" || m.role === "accountant");
                return (
                  <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        aria-hidden="true"
                        className="w-9 h-9 rounded-full bg-surface-muted border border-line flex items-center justify-center text-[11px] font-bold text-ink-muted flex-shrink-0"
                      >
                        {initialsOf(m.email)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-ink truncate">
                          {label}
                          {m.isSelf && (
                            <span className="ml-2 align-middle px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-accent/10 text-accent-text">
                              Tu
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-ink-muted">
                          {roleTitle(terms, m.role, customLabel)} · nello studio dal {formatDate(m.createdAt)}
                        </p>
                      </div>
                    </div>

                    {m.canManage && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          aria-label={`Ruolo di ${label}`}
                          value={m.role}
                          disabled={isBusy}
                          onChange={e => {
                            const next = assignable.find(r => r === e.target.value);
                            if (next && next !== m.role) void changeRole(m, next);
                          }}
                          className={`${SETTINGS_INPUT} py-1.5 w-auto`}
                        >
                          {assignable.map(r => (
                            <option key={r} value={r}>{systemRoleLabel(terms, r)}</option>
                          ))}
                        </select>

                        {/* Senza elenco ruoli valido il select non si mostra: "Nessuno" rimuoverebbe il ruolo */}
                        {canCustom && rolesReady && (
                          <select
                            aria-label={`Ruolo personalizzato di ${label}`}
                            value={m.customRoleId ?? ""}
                            disabled={isBusy || rolesHook.loading}
                            onChange={e => void changeCustomRole(m, e.target.value === "" ? null : e.target.value)}
                            className={`${SETTINGS_INPUT} py-1.5 w-auto`}
                          >
                            <option value="">Nessuno (permessi standard)</option>
                            {customRoles.map(r => (
                              <option key={r.id} value={r.id}>{r.label}</option>
                            ))}
                          </select>
                        )}

                        <button
                          type="button"
                          onClick={e => setRemoveState({ member: m, opener: e.currentTarget })}
                          disabled={isBusy}
                          aria-label={`Rimuovi ${label} dallo studio`}
                          className={`${BTN_DANGER} inline-flex items-center gap-1.5`}
                        >
                          {busyKey === `remove:${m.userId}` ? (
                            <LoaderCircle size={12} className="animate-spin" />
                          ) : (
                            <Trash2 size={12} />
                          )}
                          Rimuovi
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ── Inviti in attesa ── */}
          {invitations.length > 0 && (
            <section aria-labelledby="settings-invitations-list" className="rounded-xl border border-line overflow-hidden">
              <h3 id="settings-invitations-list" className="px-4 py-2.5 text-xs font-bold text-ink border-b border-line bg-surface-muted/50">
                Inviti in attesa
              </h3>
              <ul className="divide-y divide-line">
                {invitations.map(inv => {
                  const expired = inv.status === "expired";
                  return (
                    <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          aria-hidden="true"
                          className="w-9 h-9 rounded-full bg-surface-muted border border-line flex items-center justify-center text-ink-muted flex-shrink-0"
                        >
                          <Mail size={14} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-ink truncate">{inv.email}</p>
                          <p className={`text-[11px] ${expired ? "text-red-800 font-semibold" : "text-ink-muted"}`}>
                            {expired ? "Scaduto il " : "Scade il "}
                            {formatDate(inv.expiresAt)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border text-ink bg-surface-muted border-line-strong">
                          {systemRoleLabel(terms, inv.role)}
                        </span>
                        {expired ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border text-red-800 bg-red-50 border-red-200">
                            Scaduto
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 text-amber-800 bg-amber-50 border-amber-200">
                            <Clock size={10} aria-hidden="true" /> In attesa
                          </span>
                        )}

                        {inv.canManage && (
                          <>
                            <button
                              type="button"
                              onClick={e => void resendInvitation(inv, e.currentTarget)}
                              disabled={isBusy}
                              aria-label={`Reinvia invito a ${inv.email}`}
                              className={`${BTN_SECONDARY} inline-flex items-center gap-1.5`}
                            >
                              {busyKey === `resend:${inv.id}` ? (
                                <LoaderCircle size={12} className="animate-spin" />
                              ) : (
                                <RotateCw size={12} />
                              )}
                              Reinvia
                            </button>
                            <button
                              type="button"
                              onClick={() => void revokeInvitation(inv)}
                              disabled={isBusy}
                              aria-label={`Revoca invito a ${inv.email}`}
                              className={`${BTN_DANGER} inline-flex items-center gap-1.5`}
                            >
                              {busyKey === `revoke:${inv.id}` ? (
                                <LoaderCircle size={12} className="animate-spin" />
                              ) : (
                                <X size={12} />
                              )}
                              Revoca
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <Skeleton className="h-24" />
      )}

      {inviteState && (
        <InviteMemberModal
          roles={invitable}
          terms={terms}
          opener={inviteState.opener}
          initialResult={inviteState.initialResult}
          onCreated={overview.reload}
          onClose={() => setInviteState(null)}
        />
      )}

      {removeState && (
        <RemoveMemberModal
          member={removeState.member}
          opener={removeState.opener}
          busy={busyKey === `remove:${removeState.member.userId}`}
          onConfirm={() => void confirmRemove(removeState.member)}
          onCancel={() => setRemoveState(null)}
        />
      )}
    </SettingsCard>
  );
}
