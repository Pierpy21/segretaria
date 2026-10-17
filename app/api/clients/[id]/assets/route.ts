import type { NextRequest } from "next/server";
import { apiOk, handleApiError } from "@/lib/api";
import { createClientAsset, listClientAssets } from "@/lib/data/assets";
import { withPermission } from "@/lib/db";
import { parseAssetInput, parseClientCode, parseFlagParam, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Beni del cliente; `?includeArchived=true` include gli archiviati. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const code = parseClientCode((await params).id);
    const includeArchived = parseFlagParam(request.nextUrl.searchParams.get("includeArchived"), "includeArchived");
    return apiOk(
      await withPermission("clients:read", (tx, { companyId }) =>
        listClientAssets(tx, companyId, code, includeArchived),
      ),
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const code = parseClientCode((await params).id);
    const input = parseAssetInput(await readJsonObject(request));
    return apiOk(
      await withPermission("clients:write", (tx, { companyId }) =>
        createClientAsset(tx, companyId, code, input),
      ),
      201,
    );
  } catch (err) {
    return handleApiError(err);
  }
}
