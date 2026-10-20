import { apiOk, handleApiError } from "@/lib/api";
import { createClient, listClients } from "@/lib/data/clients";
import { can } from "@/lib/auth/permissions";
import { withPermission } from "@/lib/db";
import { parseCreateClientInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiOk(
      await withPermission("clients:read", (tx, { companyId, permissions }) =>
        listClients(tx, companyId, can(permissions, "sensitive:read")),
      ),
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const input = parseCreateClientInput(await readJsonObject(request));
    return apiOk(
      await withPermission("clients:write", (tx, { companyId, permissions }) =>
        createClient(tx, companyId, input, {
          read: can(permissions, "sensitive:read"),
          write: can(permissions, "sensitive:write"),
        }),
      ),
      201,
    );
  } catch (err) {
    return handleApiError(err);
  }
}
