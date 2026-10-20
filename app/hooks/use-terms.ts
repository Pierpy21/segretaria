"use client";

import { useMe } from "@/app/hooks/use-me";
import type { Terms } from "@/app/types/settings";
import { DEFAULT_TERMS } from "@/lib/terms";

/** Terminologia dello studio (da GET /api/me). Mentre la sessione carica usa i default. */
export function useTerms(): Terms {
  const { data } = useMe();
  return data?.terms ?? DEFAULT_TERMS;
}
