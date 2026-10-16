import { apiOk, handleApiError } from "@/lib/api";
import { syncCompanyCalendars } from "@/lib/calendar-sync";
import { getCalendarTimeZone } from "@/lib/calendar-sync/time";
import { requirePermission } from "@/lib/db";
import { parseDayRange, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { companyId } = await requirePermission("calendar:write");
    const body = await readJsonObject(request);
    const range = parseDayRange(body.from, body.to, getCalendarTimeZone());
    return apiOk(await syncCompanyCalendars(companyId, range.from, range.to));
  } catch (err) {
    return handleApiError(err);
  }
}
