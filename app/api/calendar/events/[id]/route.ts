import { apiOk, handleApiError } from "@/lib/api";
import { deleteAgendaEvent } from "@/lib/calendar-sync";
import { requireCompany } from "@/lib/db";
import { parseUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireCompany();
    const id = parseUuid((await params).id, "id evento");
    await deleteAgendaEvent(companyId, id);
    return apiOk(null);
  } catch (err) {
    return handleApiError(err);
  }
}
