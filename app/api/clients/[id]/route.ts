import { apiOk, handleApiError } from "@/lib/api";
import { getClient, updateClient } from "@/lib/data/clients";
import { can } from "@/lib/auth/permissions";
import { withPermission } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { parseClientCode, parseUpdateClientInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const code = parseClientCode((await params).id);
    const client = await withPermission("clients:read", (tx, { companyId, permissions }) =>
      getClient(tx, companyId, code, can(permissions, "sensitive:read")),
    );
    if (!client) throw new NotFoundError("Cliente non trovato");
    return apiOk(client);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const code = parseClientCode((await params).id);
    const patch = parseUpdateClientInput(await readJsonObject(request));
    return apiOk(
      await withPermission("clients:write", (tx, { companyId, permissions }) =>
        updateClient(tx, companyId, code, patch, {
          read: can(permissions, "sensitive:read"),
          write: can(permissions, "sensitive:write"),
        }),
      ),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
