import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { apiOk, apiFail, toApiFailure } from "@/lib/calendar-sync/http";
import { buildAuthUrl, disconnect, isGoogleConfigured } from "@/lib/calendar-sync/google";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "g_oauth_state";

export async function GET() {
  try {
    if (!isGoogleConfigured()) {
      return apiFail("Google Calendar non configurato: imposta GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET", 400);
    }
    const state = randomBytes(32).toString("base64url");
    const response = NextResponse.redirect(buildAuthUrl(state), 302);
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/calendar/google",
      maxAge: 600,
    });
    return response;
  } catch (err) {
    return toApiFailure(err);
  }
}

export async function DELETE() {
  try {
    await disconnect();
    return apiOk(null);
  } catch (err) {
    return toApiFailure(err);
  }
}
