import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/safe-next";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Conferma email / magic link: scambia il codice PKCE con la sessione.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth_callback", origin));
  }

  return NextResponse.redirect(new URL(safeNextPath(searchParams.get("next"), origin), origin));
}
