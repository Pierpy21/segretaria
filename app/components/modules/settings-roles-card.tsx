"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { apiFetch } from "@/app/lib/api-client";
import { useApiData } from "@/app/hooks/use-api-data";
import { useTerms } from "@/app/hooks/use-terms";
import { ErrorState, SkeletonRows } from "@/app/components/ui/async-state";
import { CUSTOM_ROLE_PERMISSIONS, permissionModule, type Permission } from "@/lib/auth/permissions";
import type { RolesResponse, CreateCustomRoleInput, UpdateCustomRoleInput } from "@/app/types/api";
import type { CompanyModules, CustomRole, Terms } from "@/app/types/settings";
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  BTN_SMALL,
  SETTINGS_INPUT,
  SettingsCard,
  FormError,
  errorMessage,
} from "@/app/components/modules/settings-shared";

/** Gruppi del catalogo permessi, per prefisso (es. "clients" per clients:read/write) */
const PERMISSION_GROUPS: { prefix: string; label: (t: Terms) => string }[] = [
  { prefix: "clients", label: t => t.clientPlural },
  { prefix: "sensitive", label: t => t.sensitiveData },
  { prefix: "chat", label: () => "Chat" },
  { prefix: "calendar", label: () => "Agenda" },
  { prefix: "reminders", label: () => "Promemoria" },
  { prefix: "tasks", label: t => t.tasksLabel },
  { prefix: "quotes", label: t => t.quotePlural },
  { prefix: "payments", label: () => "Pagamenti" },
  { prefix: "reports", label: () => "Report" },
  { prefix: "records", label: () => "Modifica record di altri" },
];

const ACTION_LABEL: Record<string, string> = { read: "Lettura", write: "Scrittura", manage: "Gestione" };

type Editor = { mode: "create" } | { mode: "edit"; role: CustomRole };

/** Sostituisce o aggiunge un ruolo nella lista */
function withRole(data: RolesResponse | null, role: CustomRole): RolesResponse | null {
  if (!data) return data;
  const exists = data.roles.some(r => r.id === role.id);
  return {
    ...data,
    roles: exists ? data.roles.map(r => (r.id === role.id ? role : r)) : [...data.roles, role],
  };
}

/** Rimuove un ruolo: i suoi membri tornano al ruolo di sistema */
function withoutRole(data: RolesResponse | null, roleId: string): RolesResponse | null {
  if (!data) return data;
  return {
    roles: data.roles.filter(r => r.id !== roleId),
    members: data.members.map(m => (m.customRoleId === roleId ? { ...m, customRoleId: null } : m)),
  };
}

interface RolesCardProps {
  modules: CompanyModules;
}

/** Ruoli personalizzati (permessi dal catalogo). I membri si gestiscono nella scheda "Membri dello studio". Visibile con members:manage. */
export default function RolesCard({ modules }: RolesCardProps) {
  const terms = useTerms();
  const rolesHook = useApiData<RolesResponse>("/api/settings/roles");
  const { mutate: mutateRoles, reload: reloadRoles } = rolesHook;
  const roles = rolesHook.data?.roles ?? [];
  const members = rolesHook.data?.members ?? [];

  const [editor, setEditor] = useState<Editor | null>(null);
  const [label, setLabel] = useState("");
  const [perms, setPerms] = useState<Permission[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const groups = PERMISSION_GROUPS
    .map(g => ({ prefix: g.prefix, label: g.label(terms), permissions: CUSTOM_ROLE_PERMISSIONS.filter(p => p.startsWith(`${g.prefix}:`)) }))
    .filter(g => g.permissions.length > 0);

  /** Un permesso di un modulo spento non ha effetto finché il modulo è disattivato */
  function moduleOff(permission: Permission): boolean {
    const key = permissionModule(permission);
    return key !== null && modules[key] === false;
  }

  function openCreate() {
    setEditor({ mode: "create" });
    setLabel("");
    setPerms([]);
    setFormError(null);
  }

  function openEdit(role: CustomRole) {
    setEditor({ mode: "edit", role });
    setLabel(role.label);
    setPerms(CUSTOM_ROLE_PERMISSIONS.filter(p => role.permissions.includes(p)));
    setFormError(null);
  }

  function closeEditor() {
    setEditor(null);
    setFormError(null);
  }

  function togglePermission(permission: Permission, checked: boolean) {
    setPerms(prev => (checked ? [...prev.filter(p => p !== permission), permission] : prev.filter(p => p !== permission)));
  }

  async function saveRole(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editor) return;
    const name = label.trim();
    if (!name) {
      setFormError("Inserisci il nome del ruolo.");
      return;
    }
    if (perms.length === 0) {
      setFormError("Seleziona almeno un permesso.");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      if (editor.mode === "edit") {
        const body: UpdateCustomRoleInput = { label: name, permissions: perms };
        const updated = await apiFetch<CustomRole>(`/api/settings/roles/${encodeURIComponent(editor.role.id)}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        mutateRoles(d => withRole(d, updated));
      } else {
        const body: CreateCustomRoleInput = { label: name, permissions: perms };
        const created = await apiFetch<CustomRole>("/api/settings/roles", {
          method: "POST",
          body: JSON.stringify(body),
        });
        mutateRoles(d => withRole(d, created));
      }
      closeEditor();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(role: CustomRole) {
    if (!window.confirm(`Eliminare il ruolo "${role.label}"? I suoi membri tornano ai permessi standard.`)) return;
    setListError(null);
    try {
      await apiFetch<null>(`/api/settings/roles/${encodeURIComponent(role.id)}`, { method: "DELETE" });
      mutateRoles(d => withoutRole(d, role.id));
      if (editor?.mode === "edit" && editor.role.id === role.id) closeEditor();
    } catch (err) {
      setListError(errorMessage(err));
    }
  }

  const editorForm = editor && (
    <form onSubmit={saveRole} className="mb-5 p-4 rounded-xl border border-line-strong bg-surface-muted/50 space-y-4" noValidate>
      <p className="text-xs font-bold text-ink">
        {editor.mode === "edit" ? `Modifica ruolo "${editor.role.label}"` : "Nuovo ruolo personalizzato"}
      </p>

      <div>
        <label htmlFor="role-label" className="block text-xs font-bold text-ink mb-1">Nome del ruolo</label>
        <input
          id="role-label"
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Es. Segreteria"
          className={`${SETTINGS_INPUT} sm:max-w-sm`}
        />
      </div>

      <fieldset>
        <legend className="text-xs font-bold text-ink mb-2">Permessi</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {groups.map(group => (
            <div key={group.prefix} className="rounded-xl border border-line bg-surface p-3">
              <p className="text-xs font-bold text-ink mb-1.5">{group.label}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {group.permissions.map(permission => {
                  const action = permission.split(":")[1] ?? permission;
                  const id = `perm-${permission.replace(":", "-")}`;
                  return (
                    <label key={permission} htmlFor={id} className="flex items-center gap-1.5 text-xs text-ink cursor-pointer">
                      <input
                        id={id}
                        type="checkbox"
                        checked={perms.includes(permission)}
                        onChange={e => togglePermission(permission, e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-line-strong accent-accent"
                      />
                      {ACTION_LABEL[action] ?? action}
                      {moduleOff(permission) && <span className="text-[10px] font-semibold text-amber-800">(modulo spento)</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <FormError message={formError} />

      <div className="flex justify-end gap-2">
        <button type="button" onClick={closeEditor} className={BTN_SECONDARY}>Annulla</button>
        <button type="submit" disabled={saving} className={BTN_PRIMARY}>
          {saving && <LoaderCircle size={12} className="animate-spin" />}
          Salva ruolo
        </button>
      </div>
    </form>
  );

  return (
    <SettingsCard
      id="settings-roles"
      title="Ruoli personalizzati"
      description="Un ruolo personalizzato sostituisce i permessi standard del ruolo di sistema del membro."
      className="xl:col-span-2"
    >
      {rolesHook.loading ? (
        <SkeletonRows rows={3} className="h-12" />
      ) : rolesHook.error ? (
        <ErrorState message="Impossibile caricare i ruoli personalizzati." onRetry={reloadRoles} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-bold text-ink">Ruoli personalizzati</p>
            <button type="button" onClick={openCreate} disabled={editor?.mode === "create"} className={BTN_PRIMARY}>
              <Plus size={13} /> Nuovo ruolo
            </button>
          </div>

          {editorForm}

          <FormError message={listError} />

          {roles.length === 0 ? (
            <p className="text-xs text-ink-muted">Nessun ruolo personalizzato: ogni membro usa i permessi standard del proprio ruolo.</p>
          ) : (
            <ul className="divide-y divide-line">
              {roles.map(role => {
                const count = members.filter(m => m.customRoleId === role.id).length;
                return (
                  <li key={role.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-ink truncate">{role.label}</p>
                      <p className="text-[11px] text-ink-muted">
                        {role.permissions.length} permessi · {count} {count === 1 ? "membro" : "membri"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button type="button" onClick={() => openEdit(role)} className={BTN_SMALL}>Modifica</button>
                      <button type="button" onClick={() => void deleteRole(role)} className={BTN_DANGER}>Elimina</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </SettingsCard>
  );
}
