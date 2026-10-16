import { apiOk, handleApiError } from "@/lib/api";
import { getSidebarBadges } from "@/lib/data/badges";
import type { SidebarBadges } from "@/app/types/api";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { withCompany } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Contatore a 0 se il ruolo non ha il permesso della sezione collegata. */
const BADGE_PERMISSION: Record<keyof SidebarBadges, Permission> = {
  patients: "patients:read",
  chat: "chat:read",
  calendar: "calendar:read",
  tasks: "tasks:read",
  quotes: "quotes:read",
};

export async function GET() {
  try {
    const { badges, role } = await withCompany(async (tx, { companyId, role }) => ({
      badges: await getSidebarBadges(tx, companyId),
      role,
    }));
    const visible = Object.fromEntries(
      (Object.keys(BADGE_PERMISSION) as (keyof SidebarBadges)[]).map((k) => [
        k,
        hasPermission(role, BADGE_PERMISSION[k]) ? badges[k] : 0,
      ]),
    ) as unknown as SidebarBadges;
    return apiOk(visible);
  } catch (err) {
    return handleApiError(err);
  }
}
