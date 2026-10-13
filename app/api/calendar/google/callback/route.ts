import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/lib/calendar-sync/google";
import { CalendarSyncError } from "@/lib/calendar-sync/errors";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "g_oauth_state";

function statesMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  let result: "google-ok" | "google-error" = "google-ok";

  try {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const expected = request.cookies.get(STATE_COOKIE)?.value;

    if (searchParams.get("error") || !code || !state || !expected || !statesMatch(state, expected)) {
      throw new CalendarSyncError("Autorizzazione Google non valida o annullata", 400);
    }
    await exchangeCode(code);
  } catch (err) {
    result = "google-error";
    if (!(err instanceof CalendarSyncError)) console.error("[calendar-sync] google callback", err);
    else console.error("[calendar-sync] google callback:", err.message);
  }

  const response = NextResponse.redirect(new URL(`/?module=calendar&sync=${result}`, origin), 302);
  response.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/api/calendar/google",
    maxAge: 0,
  });
  return response;
}
