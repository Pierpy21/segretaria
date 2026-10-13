import "server-only";
import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { withRLS, type Tx, type VerifiedClaims } from "@/lib/system/rls";
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

/** Contesto fornito a withCompany: tutto ciò che serve alle query dello studio. */
export interface CompanyTxContext {
  userId: string;
  companyId: string;
  role: CompanyRole;
}

/**
 * Utente verificato server-side. Deduplicato per richiesta via cache():
 * withCompany/getMe/requireCompany usati insieme producono una sola chiamata GoTrue.
 * supabase.auth.getUser() interroga sempre Supabase Auth (rete): logout e revoca
 * della sessione hanno effetto immediato. Nessuna verifica locale del JWT
 * (getClaims) né lettura del cookie (getSession): MAI usarli per autorizzazione.
 */
const getVerifiedUser = cache(async (): Promise<AuthUser> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;
  if (error || !user || user.role !== "authenticated" || !user.id) {
    throw new UnauthorizedError();
  }
  return {
    id: user.id,
    email: typeof user.email === "string" ? user.email : null,
  };
});

function claimsOf(user: AuthUser): VerifiedClaims {
  return { sub: user.id, role: "authenticated", email: user.email ?? undefined };
}

/**
 * Transazione RLS per l'utente corrente (senza risolvere lo studio).
 * Per le route che operano sui dati dello studio usare withCompany().
 */
export async function withUser<T>(cb: (tx: Tx) => Promise<T>): Promise<T> {
  const user = await getVerifiedUser();
  return withRLS(claimsOf(user), cb);
}

/** Primo studio dell'utente (più vecchio) letto nella transazione già aperta. */
async function selectMembership(tx: Tx, userId: string) {
  const rows = await tx
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
    .limit(1);
  return rows[0] ?? null;
}

/**
 * UNICO punto di accesso ai dati dello studio dalle route: UNA sola transazione RLS
 * che risolve la membership (1 query) e poi esegue cb con tx e contesto dello studio.
 * Lancia UnauthorizedError (401) o NoCompanyError (409).
 */
export async function withCompany<T>(
  cb: (tx: Tx, ctx: CompanyTxContext) => Promise<T>
): Promise<T> {
  const user = await getVerifiedUser();
  return withRLS(claimsOf(user), async (tx) => {
    const m = await selectMembership(tx, user.id);
    if (!m) throw new NoCompanyError();
    return cb(tx, { userId: user.id, companyId: m.companyId, role: m.role as CompanyRole });
  });
}

/** Sessione + studio corrente per /api/me. Non lancia se manca lo studio. */
export const getMe = cache(async (): Promise<MeResponse> => {
  const user = await getVerifiedUser();
  const m = await withUser((tx) => selectMembership(tx, user.id));
  return {
    user,
    company: m
      ? { id: m.companyId, name: m.name, slug: m.slug, role: m.role as CompanyRole }
      : null,
  };
});

/**
 * Richiede sessione e studio, senza eseguire query dati. Usare per i flussi che
 * chiamano provider esterni (OAuth/CalDAV): non tenere una tx aperta durante la rete.
 * Lancia UnauthorizedError (401) o NoCompanyError (409).
 */
export const requireCompany = cache(async (): Promise<CompanyContext> => {
  const user = await getVerifiedUser();
  const m = await withUser((tx) => selectMembership(tx, user.id));
  if (!m) throw new NoCompanyError();
  return { user, companyId: m.companyId, role: m.role as CompanyRole };
});
