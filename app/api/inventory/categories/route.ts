import { apiOk, handleApiError } from "@/lib/api";
import { createInventoryCategory, listInventoryCategories } from "@/lib/data/inventory";
import { withModule } from "@/lib/db";
import { parseInventoryCategoryInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return apiOk(
      await withModule("inventory", "inventory:read", (tx, { companyId }) => listInventoryCategories(tx, companyId)),
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const input = parseInventoryCategoryInput(await readJsonObject(request));
    return apiOk(
      await withModule("inventory", "inventory:write", (tx, { companyId }) =>
        createInventoryCategory(tx, companyId, input),
      ),
      201,
    );
  } catch (err) {
    return handleApiError(err);
  }
}
