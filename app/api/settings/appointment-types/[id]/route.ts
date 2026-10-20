import { apiOk, handleApiError } from "@/lib/api";
import { archiveAppointmentType, updateAppointmentType } from "@/lib/data/settings";
import { withPermission } from "@/lib/db";
import { parseAppointmentTypePatch, parseUuid, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseUuid((await params).id, "id tipo di appuntamento");
    const patch = parseAppointmentTypePatch(await readJsonObject(request));
    return apiOk(
      await withPermission("settings:manage", (tx, { companyId }) => updateAppointmentType(tx, companyId, id, patch)),
    );
  } catch (err) {
    return handleApiError(err);
  }
}

/** Archivia il tipo (soft delete): gli appuntamenti esistenti lo mantengono. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseUuid((await params).id, "id tipo di appuntamento");
    await withPermission("settings:manage", (tx, { companyId }) => archiveAppointmentType(tx, companyId, id));
    return apiOk(null);
  } catch (err) {
    return handleApiError(err);
  }
}
