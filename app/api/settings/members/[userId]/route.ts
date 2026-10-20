import { apiOk, handleApiError } from "@/lib/api";
import { assignCustomRole } from "@/lib/data/settings";
import { withPermission } from "@/lib/db";
import { parseMemberPatch, parseUuid, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Assegna (o rimuove con null) il ruolo personalizzato a un membro. */
export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const userId = parseUuid((await params).userId, "id utente");
    const { customRoleId } = parseMemberPatch(await readJsonObject(request));
    return apiOk(
      await withPermission("members:manage", (tx, { companyId }) =>
        assignCustomRole(tx, companyId, userId, customRoleId),
      ),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
