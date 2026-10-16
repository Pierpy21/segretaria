import { apiOk, handleApiError } from "@/lib/api";
import { listFieldDefinitions } from "@/lib/data/clients";
import { hasPermission } from "@/lib/auth/permissions";
import { withPermission } from "@/lib/db";
import { parseClientTypeParam } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Definizioni dei campi; `?type=dentale` filtra per tipo cliente. Sensibili solo con clinical:read. */
export async function GET(request: Request) {
  try {
    const type = parseClientTypeParam(new URL(request.url).searchParams.get("type"));
    return apiOk(
      await withPermission("clients:read", (tx, { companyId, role }) =>
        listFieldDefinitions(tx, companyId, type, hasPermission(role, "clinical:read")),
      ),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
