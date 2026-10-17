import type { NextRequest } from "next/server";
import { apiOk, handleApiError } from "@/lib/api";
import { listCompanyAssets } from "@/lib/data/assets";
import { withPermission } from "@/lib/db";
import { parseClientCode } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Beni attivi dello studio (ordinati per cliente e nome); `?clientId=PT-…` filtra su un cliente. */
export async function GET(request: NextRequest) {
  try {
    const raw = request.nextUrl.searchParams.get("clientId");
    const clientCode = raw === null || raw === "" ? undefined : parseClientCode(raw);
    return apiOk(
      await withPermission("clients:read", (tx, { companyId }) => listCompanyAssets(tx, companyId, clientCode)),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
