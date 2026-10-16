import { apiOk, handleApiError } from "@/lib/api";
import { getClient, updateClient } from "@/lib/data/clients";
import { hasPermission } from "@/lib/auth/permissions";
import { withPermission } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { parseClientCode, parseUpdateClientInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const code = parseClientCode((await params).id);
    const client = await withPermission("clients:read", (tx, { companyId, role }) =>
      getClient(tx, companyId, code, hasPermission(role, "clinical:read")),
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
      await withPermission("clients:write", (tx, { companyId, role }) =>
        updateClient(tx, companyId, code, patch, hasPermission(role, "clinical:read")),
      ),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
