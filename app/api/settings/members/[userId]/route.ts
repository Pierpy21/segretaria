import { apiOk, handleApiError } from "@/lib/api";
import { removeMember, updateMember } from "@/lib/data/members";
import { withPermission } from "@/lib/db";
import { parseMemberPatch, parseUuid, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Cambia ruolo di sistema e/o ruolo personalizzato di un membro (mai se stessi). */
export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const userId = parseUuid((await params).userId, "id utente");
    const patch = parseMemberPatch(await readJsonObject(request));
    return apiOk(await withPermission("members:manage", (tx, ctx) => updateMember(tx, ctx, userId, patch)));
  } catch (err) {
    return handleApiError(err);
  }
}

/** Rimuove un membro dallo studio (mai se stessi). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const userId = parseUuid((await params).userId, "id utente");
    return apiOk(await withPermission("members:manage", (tx, ctx) => removeMember(tx, ctx, userId)));
  } catch (err) {
    return handleApiError(err);
  }
}
