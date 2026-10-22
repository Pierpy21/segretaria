"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/auth/safe-next";

// Conferma del link email (es. invito) tramite token_hash. Avviene lato client, con una
// chiamata POST a verifyOtp: i bot degli scanner di link (GET) non consumano il token.
const OTP_TYPES: readonly EmailOtpType[] = ["invite", "magiclink", "signup", "email", "recovery"];
const FAILED_PATH = "/login?error=auth_confirm";

function isOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (OTP_TYPES as readonly string[]).includes(value);
}

/** Pagina di conferma: il Suspense serve a useSearchParams (Next 16). */
export default function ConfirmPage() {
  return (
    <Suspense fallback={<Waiting />}>
      <ConfirmLink />
    </Suspense>
  );
}

function Waiting() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-line p-6 shadow-sm">
        <p role="status" className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
          <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
          Verifica del link in corso…
        </p>
      </div>
    </main>
  );
}

function ConfirmLink() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Evita la doppia verifica in StrictMode (il token è monouso)
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");
    const next = safeNextPath(searchParams.get("next"), window.location.origin);

    if (!tokenHash || !isOtpType(type)) {
      router.replace(FAILED_PATH);
      return;
    }

    createSupabaseBrowserClient()
      .auth.verifyOtp({ type, token_hash: tokenHash })
      .then(({ error }) => {
        if (error) {
          router.replace(FAILED_PATH);
          return;
        }
        router.replace(next);
        router.refresh();
      })
      .catch(() => router.replace(FAILED_PATH));
  }, [router, searchParams]);

  return <Waiting />;
}
