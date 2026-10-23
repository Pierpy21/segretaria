import { apiOk, handleApiError } from "@/lib/api";
import { recordInventoryMovement } from "@/lib/data/inventory";
import { withModule } from "@/lib/db";
import { parseInventoryMovementInput, parseUuid, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Registra carico, scarico, rettifica o reso. Quantità sempre positiva: il segno lo applica il backend. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const itemId = parseUuid((await params).id, "id articolo");
    const input = parseInventoryMovementInput(await readJsonObject(request));
    return apiOk(
      await withModule("inventory", "inventory:write", (tx, { companyId }) =>
        recordInventoryMovement(tx, companyId, itemId, input),
      ),
      201,
    );
  } catch (err) {
    return handleApiError(err);
  }
}
