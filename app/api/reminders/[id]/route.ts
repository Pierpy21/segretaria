import { apiOk, handleApiError } from "@/lib/api";
import { updateReminderStatus } from "@/lib/data/reminders";
import { withCompany } from "@/lib/db";
import { parseReminderStatusPatch, parseUuid, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseUuid((await params).id, "id promemoria");
    const { status } = parseReminderStatusPatch(await readJsonObject(request));
    return apiOk(await withCompany((tx, { companyId }) => updateReminderStatus(tx, companyId, id, status)));
  } catch (err) {
    return handleApiError(err);
  }
}
