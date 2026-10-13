import "server-only";
import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { withRLS, type Tx } from "@/lib/system/rls";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { companies, companyMembers } from "@/drizzle/schema";
import * as schema from "@/drizzle/schema";
import type { CompanyRole, MeResponse } from "@/app/types/api";

export { schema };
export type { Tx };

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized: invalid or missing user session") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Utente autenticato ma senza studio → HTTP 409 NO_COMPANY (onboarding). */
export class NoCompanyError extends Error {
  constructor(message = "Nessuno studio associato all'utente") {
    super(message);
    this.name = "NoCompanyError";
  }
}

export type AuthUser = MeResponse["user"];

export interface CompanyContext {
  user: AuthUser;
  companyId: string;
  role: CompanyRole;
}

/**
 * Utente verificato server-side. Deduplicato per richiesta via cache():
 * getUser() è una chiamata di rete a GoTrue.
 * getSession() legge il cookie senza validarlo: MAI usarlo qui.
 */
const getVerifiedUser = cache(async (): Promise<AuthUser> => {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new UnauthorizedError();
  return { id: user.id, email: user.email ?? null };
});

/**
 * UNICO punto di accesso al database dal codice applicativo.
 * I claims derivano esclusivamente dalla sessione verificata.
 */
export async function withUser<T>(cb: (tx: Tx) => Promise<T>): Promise<T> {
  const user = await getVerifiedUser();
  return withRLS(
    { sub: user.id, role: "authenticated", email: user.email ?? undefined },
    cb
  );
}

/** Primo studio dell'utente (più vecchio). Null se non ha membership. */
async function loadMembership(userId: string) {
  const rows = await withUser((tx) =>
    tx
      .select({
        companyId: companies.id,
        name: companies.name,
        slug: companies.slug,
        role: companyMembers.role,
      })
      .from(companyMembers)
      .innerJoin(companies, eq(companies.id, companyMembers.companyId))
      .where(eq(companyMembers.userId, userId))
      .orderBy(asc(companyMembers.createdAt))
      .limit(1)
  );
  return rows[0] ?? null;
}

/** Sessione + studio corrente per /api/me. Non lancia se manca lo studio. */
export const getMe = cache(async (): Promise<MeResponse> => {
  const user = await getVerifiedUser();
  const m = await loadMembership(user.id);
  return {
    user,
    company: m
      ? { id: m.companyId, name: m.name, slug: m.slug, role: m.role as CompanyRole }
      : null,
  };
});

/**
 * Richiede sessione e studio. Lancia UnauthorizedError (401) o NoCompanyError (409).
 * Usare companyId per TUTTE le query dati (oltre alla RLS).
 */
export const requireCompany = cache(async (): Promise<CompanyContext> => {
  const user = await getVerifiedUser();
  const m = await loadMembership(user.id);
  if (!m) throw new NoCompanyError();
  return { user, companyId: m.companyId, role: m.role as CompanyRole };
});
