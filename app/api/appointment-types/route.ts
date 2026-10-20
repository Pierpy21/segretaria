import { apiOk, handleApiError } from "@/lib/api";
import { listAppointmentTypes } from "@/lib/data/settings";
import { withPermission } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Tipi di appuntamento attivi dello studio (per il selettore dell'agenda). */
export async function GET() {
  try {
    return apiOk(
      await withPermission("calendar:read", (tx, { companyId }) => listAppointmentTypes(tx, companyId, false)),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
