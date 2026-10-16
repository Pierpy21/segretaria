import type { NextRequest } from "next/server";
import { apiOk, handleApiError } from "@/lib/api";
import { createAgendaEvent } from "@/lib/calendar-sync";
import { getCalendarTimeZone } from "@/lib/calendar-sync/time";
import { listEvents } from "@/lib/data/calendar";
import { requirePermission, withPermission } from "@/lib/db";
import { parseCalendarEventInput, parseDayRange, readJsonObject } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    return apiOk(
      await withPermission("calendar:read", (tx, { companyId }) => {
        const range = parseDayRange(sp.get("from"), sp.get("to"), getCalendarTimeZone());
        return listEvents(tx, companyId, range.from, range.to);
      }),
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const { companyId } = await requirePermission("calendar:write");
    const input = parseCalendarEventInput(await readJsonObject(request));
    return apiOk(await createAgendaEvent(companyId, input), 201);
  } catch (err) {
    return handleApiError(err);
  }
}
