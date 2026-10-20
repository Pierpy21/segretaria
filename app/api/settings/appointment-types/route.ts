import { apiOk, handleApiError } from "@/lib/api";
import { createAppointmentType } from "@/lib/data/settings";
import { withPermission } from "@/lib/db";
import { parseAppointmentTypeInput, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = parseAppointmentTypeInput(await readJsonObject(request));
    return apiOk(
      await withPermission("settings:manage", (tx, { companyId }) => createAppointmentType(tx, companyId, input)),
      201,
    );
  } catch (err) {
    return handleApiError(err);
  }
}
