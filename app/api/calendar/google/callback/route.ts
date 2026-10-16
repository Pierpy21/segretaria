import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { connectGoogle } from "@/lib/calendar-sync";
import { NoCompanyError, UnauthorizedError, requirePermission } from "@/lib/db";
import { ValidationError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "g_oauth_state";
const STATE_COOKIE_PATH = "/api/calendar/google";

function statesMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function backToCalendar(request: NextRequest, result: "google-ok" | "google-error"): NextResponse {
  return NextResponse.redirect(new URL(`/?module=calendar&sync=${result}`, request.url), 302);
}

export async function GET(request: NextRequest) {
  let companyId: string;
  try {
    ({ companyId } = await requirePermission("settings:manage"));
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.redirect(new URL("/login", request.url), 302);
    if (err instanceof NoCompanyError) return NextResponse.redirect(new URL("/onboarding", request.url), 302);
    console.error("[calendar-sync] google callback", err);
    return backToCalendar(request, "google-error");
  }

  let result: "google-ok" | "google-error" = "google-ok";
  try {
    const sp = request.nextUrl.searchParams;
    const code = sp.get("code");
    const state = sp.get("state");
    const expected = (await cookies()).get(STATE_COOKIE)?.value;

    if (sp.get("error") || !code || !state || !expected || !statesMatch(state, expected)) {
      throw new ValidationError("Autorizzazione Google non valida o annullata");
    }
    await connectGoogle(companyId, code);
  } catch (err) {
    result = "google-error";
    console.error("[calendar-sync] google callback", err);
  }

  const response = backToCalendar(request, result);
  response.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: STATE_COOKIE_PATH,
    maxAge: 0,
  });
  return response;
}
