// Permessi e profili per ruolo. Nessuna dipendenza server: importabile da server e client.
// Il backend autorizza sui permessi EFFETTIVI (effectivePermissions), non sul solo ruolo.
import type { CompanyRole } from "@/app/types/api";
import type { CompanyModules, ModuleKey } from "@/app/types/settings";

/** Catalogo permessi: DEVE restare identico a permission_catalog() nella migration. */
export const PERMISSIONS = [
  "clients:read", "clients:write", "sensitive:read", "sensitive:write",
  "chat:read", "chat:write",
  "calendar:read", "calendar:write",
  "reminders:read", "reminders:write",
  "tasks:read", "tasks:write",
  "quotes:read", "quotes:write",
  "payments:read", "payments:write",
  "inventory:read", "inventory:write",
  "reports:read",
  "records:manage",
  "settings:manage", "members:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Permessi assegnabili a un ruolo personalizzato (gestione studio e membri esclusa). */
export const CUSTOM_ROLE_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  (p) => p !== "settings:manage" && p !== "members:manage",
);

/** titolare = owner/admin, contabile = accountant, staff = member */
export type AccessProfile = "titolare" | "contabile" | "staff";

const MEMBER_PERMISSIONS: readonly Permission[] = [
  "clients:read", "clients:write", "sensitive:read", "sensitive:write",
  "chat:read", "chat:write",
  "calendar:read", "calendar:write",
  "reminders:read", "reminders:write",
  "tasks:read", "tasks:write",
  "quotes:read", "quotes:write",
  "payments:read", "payments:write",
  "inventory:read", "inventory:write",
  "reports:read",
];

/**
 * Permessi dei ruoli di sistema. DEVE restare allineata a system_role_permissions() nella migration.
 */
export const ROLE_PERMISSIONS: Record<CompanyRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS,
  member: MEMBER_PERMISSIONS,
  accountant: [
    "clients:read",
    "quotes:read", "quotes:write",
    "payments:read", "payments:write",
    "inventory:read",
    "reports:read",
    "records:manage",
  ],
};

/** Moduli attivabili (company_modules). Riga assente = attivo. */
export const MODULE_KEYS: readonly ModuleKey[] = [
  "agenda", "chat", "quotes", "maintenance", "sensitive_data", "assets", "ai_assistant", "inventory",
];

export const DEFAULT_MODULES: CompanyModules = {
  agenda: true,
  chat: true,
  quotes: true,
  maintenance: true,
  sensitive_data: true,
  assets: true,
  ai_assistant: true,
  inventory: true,
};

/** Modulo da cui dipende un permesso, come permission_module() in SQL. Assente = sempre attivo. */
const PERMISSION_MODULE: Partial<Record<string, ModuleKey>> = {
  calendar: "agenda",
  reminders: "agenda",
  chat: "chat",
  tasks: "maintenance",
  quotes: "quotes",
  sensitive: "sensitive_data",
  inventory: "inventory",
};

export function permissionModule(permission: Permission): ModuleKey | null {
  return PERMISSION_MODULE[permission.split(":")[0]] ?? null;
}

const CATALOG = new Set<string>(PERMISSIONS);

function isPermission(value: string): value is Permission {
  return CATALOG.has(value);
}

function moduleEnabled(permission: Permission, modules: CompanyModules): boolean {
  const m = permissionModule(permission);
  return m === null || modules[m];
}

/**
 * Permessi effettivi: quelli del ruolo personalizzato (se assegnato, filtrati al catalogo),
 * altrimenti quelli del ruolo di sistema; poi solo quelli dei moduli attivi.
 */
export function effectivePermissions(
  role: CompanyRole,
  customPermissions: readonly string[] | null | undefined,
  modules: CompanyModules,
): Permission[] {
  const base: readonly string[] = customPermissions ?? ROLE_PERMISSIONS[role];
  return base.filter((p): p is Permission => isPermission(p) && moduleEnabled(p, modules));
}

/** Controllo del permesso su una lista di permessi effettivi (es. me.permissions). */
export function can(permissions: readonly Permission[] | undefined, permission: Permission): boolean {
  return permissions?.includes(permission) ?? false;
}

/** @deprecated usare can(me.permissions, …): ruoli personalizzati e moduli cambiano i permessi. */
export function hasPermission(role: CompanyRole | null | undefined, permission: Permission): boolean {
  return role ? ROLE_PERMISSIONS[role].includes(permission) : false;
}

export function profileOf(role: CompanyRole): AccessProfile {
  if (role === "owner" || role === "admin") return "titolare";
  return role === "accountant" ? "contabile" : "staff";
}

export function homePathFor(role: CompanyRole): string {
  return role === "accountant" ? "/contabile" : "/";
}
