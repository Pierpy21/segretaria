import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { apiOk, handleApiError } from "@/lib/api";
import { disconnectProvider, googleAuthUrl } from "@/lib/calendar-sync";
import { NoCompanyError, UnauthorizedError, requireCompany } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "g_oauth_state";
const STATE_COOKIE_PATH = "/api/calendar/google";
const STATE_TTL_SECONDS = 600;

/** Navigazione OAuth: nessun JSON, solo redirect. */
export async function GET(request: Request) {
  try {
    await requireCompany();
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.redirect(new URL("/login", request.url), 302);
    if (err instanceof NoCompanyError) return NextResponse.redirect(new URL("/onboarding", request.url), 302);
    console.error("[calendar-sync] google connect", err);
    return NextResponse.redirect(new URL("/?module=calendar&sync=google-error", request.url), 302);
  }

  try {
    const state = randomBytes(32).toString("base64url");
    const response = NextResponse.redirect(googleAuthUrl(state), 302);
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: STATE_COOKIE_PATH,
      maxAge: STATE_TTL_SECONDS,
    });
    return response;
  } catch (err) {
    // Es. credenziali Google non configurate: torna alla UI con l'esito, non con JSON.
    console.error("[calendar-sync] google connect", err);
    return NextResponse.redirect(new URL("/?module=calendar&sync=google-error", request.url), 302);
  }
}

export async function DELETE() {
  try {
    const { companyId } = await requireCompany();
    await disconnectProvider(companyId, "google");
    return apiOk(null);
  } catch (err) {
    return handleApiError(err);
  }
}
