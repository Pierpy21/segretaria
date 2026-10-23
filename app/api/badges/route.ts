import { apiOk, handleApiError } from "@/lib/api";
import { getSidebarBadges } from "@/lib/data/badges";
import type { SidebarBadges } from "@/app/types/api";
import { can, type Permission } from "@/lib/auth/permissions";
import { withCompany } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Contatore a 0 se l'utente non ha il permesso effettivo della sezione collegata. */
const BADGE_PERMISSION: Record<keyof SidebarBadges, Permission> = {
  patients: "clients:read",
  chat: "chat:read",
  calendar: "calendar:read",
  tasks: "tasks:read",
  quotes: "quotes:read",
  inventory: "inventory:read",
};

export async function GET() {
  try {
    const { badges, permissions } = await withCompany(async (tx, ctx) => ({
      badges: await getSidebarBadges(tx, ctx.companyId),
      permissions: ctx.permissions,
    }));
    const visible = Object.fromEntries(
      (Object.keys(BADGE_PERMISSION) as (keyof SidebarBadges)[]).map((k) => [
        k,
        can(permissions, BADGE_PERMISSION[k]) ? badges[k] : 0,
      ]),
    ) as unknown as SidebarBadges;
    return apiOk(visible);
  } catch (err) {
    return handleApiError(err);
  }
}
