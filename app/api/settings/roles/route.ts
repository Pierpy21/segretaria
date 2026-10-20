import { apiOk, handleApiError } from "@/lib/api";
import { createCustomRole, listCustomRoles, listMembers } from "@/lib/data/settings";
import { withPermission } from "@/lib/db";
import { parseCustomRoleInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Ruoli personalizzati e membri dello studio (con email). */
export async function GET() {
  try {
    return apiOk(
      await withPermission("members:manage", async (tx, { companyId }) => ({
        roles: await listCustomRoles(tx, companyId),
        members: await listMembers(tx, companyId),
      })),
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const input = parseCustomRoleInput(await readJsonObject(request));
    return apiOk(
      await withPermission("members:manage", (tx, { companyId }) => createCustomRole(tx, companyId, input)),
      201,
    );
  } catch (err) {
    return handleApiError(err);
  }
}
