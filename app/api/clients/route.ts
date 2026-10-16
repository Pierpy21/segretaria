import { apiOk, handleApiError } from "@/lib/api";
import { createClient, listClients } from "@/lib/data/clients";
import { hasPermission } from "@/lib/auth/permissions";
import { withPermission } from "@/lib/db";
import { parseCreateClientInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiOk(
      await withPermission("clients:read", (tx, { companyId, role }) =>
        listClients(tx, companyId, hasPermission(role, "clinical:read")),
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
      await withPermission("clients:write", (tx, { companyId, role }) =>
        createClient(tx, companyId, input, hasPermission(role, "clinical:read")),
      ),
      201,
    );
  } catch (err) {
    return handleApiError(err);
  }
}
