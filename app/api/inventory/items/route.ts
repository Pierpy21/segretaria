import type { NextRequest } from "next/server";
import { apiOk, handleApiError } from "@/lib/api";
import { createInventoryItem, listInventoryItems } from "@/lib/data/inventory";
import { withModule } from "@/lib/db";
import { parseInventoryItemFilters, parseInventoryItemInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Articoli con giacenza totale. Filtri in query: q, categoryId, itemTypeId, belowReorder, expiringWithinDays, includeArchived. */
export async function GET(request: NextRequest) {
  try {
    const filters = parseInventoryItemFilters(request.nextUrl.searchParams);
    return apiOk(
      await withModule("inventory", "inventory:read", (tx, { companyId }) => listInventoryItems(tx, companyId, filters)),
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const input = parseInventoryItemInput(await readJsonObject(request));
    return apiOk(
      await withModule("inventory", "inventory:write", (tx, { companyId }) => createInventoryItem(tx, companyId, input)),
      201,
    );
  } catch (err) {
    return handleApiError(err);
  }
}
