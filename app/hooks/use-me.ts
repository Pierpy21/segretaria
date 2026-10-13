"use client";

import { useApiData } from "@/app/hooks/use-api-data";
import type { CompanyRole, MeResponse } from "@/app/types/api";

const ROLE_LABEL: Record<CompanyRole, string> = {
  owner: "Titolare",
  admin: "Amministratore",
  member: "Collaboratore",
};

/** Dati della sessione corrente (GET /api/me), condivisi tra header e sidebar. */
export function useMe() {
  return useApiData<MeResponse>("/api/me");
}

export function roleLabel(role: CompanyRole | undefined): string | null {
  return role ? ROLE_LABEL[role] : null;
}

export function initialsOf(text: string | null | undefined): string {
  if (!text) return "?";
  const parts = text.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}
