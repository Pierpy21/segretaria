// Permessi e profili per ruolo. Nessuna dipendenza server: importabile da server e client.
import type { CompanyRole } from "@/app/types/api";

export type Permission =
  | "patients:read" | "patients:write" | "clinical:read"
  | "chat:read" | "chat:write"
  | "calendar:read" | "calendar:write"
  | "reminders:read" | "reminders:write"
  | "tasks:read" | "tasks:write"
  | "quotes:read" | "quotes:write"
  | "payments:read" | "payments:write"
  | "reports:read"
  | "settings:manage" | "members:manage";

/** dottore = owner/admin, contabile = accountant, staff = member */
export type AccessProfile = "dottore" | "contabile" | "staff";

const STAFF: Permission[] = [
  "patients:read", "patients:write", "clinical:read",
  "chat:read", "chat:write",
  "calendar:read", "calendar:write",
  "reminders:read", "reminders:write",
  "tasks:read", "tasks:write",
  "quotes:read", "quotes:write",
  "payments:read", "payments:write",
  "reports:read",
];

export const ROLE_PERMISSIONS: Record<CompanyRole, readonly Permission[]> = {
  owner: [...STAFF, "settings:manage", "members:manage"],
  admin: [...STAFF, "settings:manage", "members:manage"],
  member: STAFF,
  accountant: [
    "patients:read",
    "quotes:read", "quotes:write",
    "payments:read", "payments:write",
    "reports:read",
  ],
};

export function hasPermission(role: CompanyRole | null | undefined, permission: Permission): boolean {
  return role ? ROLE_PERMISSIONS[role].includes(permission) : false;
}

export function profileOf(role: CompanyRole): AccessProfile {
  if (role === "owner" || role === "admin") return "dottore";
  return role === "accountant" ? "contabile" : "staff";
}

export function homePathFor(role: CompanyRole): string {
  return role === "accountant" ? "/contabile" : "/";
}
