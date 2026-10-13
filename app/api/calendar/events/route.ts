import type { NextRequest } from "next/server";
import { apiFail, apiOk, toApiFailure } from "@/lib/calendar-sync/http";
import { createEvent, deleteEvent, listAllEvents } from "@/lib/calendar-sync";
import { getCalendarTimeZone } from "@/lib/calendar-sync/time";
import { parseCreateEventInput, parseEventId, parseProvider, parseRange } from "@/lib/calendar-sync/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const range = parseRange(sp.get("from"), sp.get("to"), getCalendarTimeZone());
    if (!range.ok) return apiFail(range.error, 400);
    return apiOk(await listAllEvents(range.value.fromMs, range.value.toMs));
  } catch (err) {
    return toApiFailure(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiFail("Corpo JSON non valido", 400);
    }
    const parsed = parseCreateEventInput(body, getCalendarTimeZone());
    if (!parsed.ok) return apiFail(parsed.error, 400);
    return apiOk(await createEvent(parsed.value), 201);
  } catch (err) {
    return toApiFailure(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const provider = parseProvider(sp.get("provider"));
    if (!provider.ok) return apiFail(provider.error, 400);
    const id = parseEventId(sp.get("id"));
    if (!id.ok) return apiFail(id.error, 400);
    await deleteEvent(provider.value, id.value);
    return apiOk(null);
  } catch (err) {
    return toApiFailure(err);
  }
}
