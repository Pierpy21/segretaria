import "server-only";
import { cache } from "react";
import { and, asc, eq } from "drizzle-orm";
import { withRLS, type Tx, type VerifiedClaims } from "@/lib/system/rls";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { companies, companyMembers, companyModules, companyRoles } from "@/drizzle/schema";
import * as schema from "@/drizzle/schema";
import type { CompanyRole, MeResponse } from "@/app/types/api";
import type { CompanyModules, ModuleKey, Terms } from "@/app/types/settings";
import type { Sector } from "@/app/types/clients";
import {
  DEFAULT_MODULES,
  can,
  effectivePermissions,
  homePathFor,
  profileOf,
  type AccessProfile,
  type Permission,
} from "@/lib/auth/permissions";
import { resolveTerms, roleTitle } from "@/lib/terms";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

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
  /** Permessi effettivi (ruolo o ruolo personalizzato, filtrati dai moduli attivi) */
  permissions: Permission[];
  modules: CompanyModules;
}

/** Contesto fornito a withCompany: tutto ciò che serve alle query dello studio. */
export interface CompanyTxContext {
  userId: string;
  companyId: string;
  role: CompanyRole;
  permissions: Permission[];
  modules: CompanyModules;
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

/** Membership dell'utente nel primo studio (più vecchio), con permessi effettivi e moduli. */
export interface MembershipData {
  companyId: string;
  name: string;
  slug: string;
  sector: Sector;
  templateVersion: number | null;
  terms: Terms;
  role: CompanyRole;
  customRole: { id: string; label: string } | null;
  modules: CompanyModules;
  permissions: Permission[];
}

/**
 * Primo studio dell'utente letto nella transazione già aperta. Due query nella stessa tx:
 * membership + ruolo personalizzato (left join), poi i moduli dello studio.
 */
async function selectMembership(tx: Tx, userId: string): Promise<MembershipData | null> {
  const rows = await tx
    .select({
      companyId: companies.id,
      name: companies.name,
      slug: companies.slug,
      sector: companies.sector,
      templateVersion: companies.templateVersion,
      terms: companies.terms,
      role: companyMembers.role,
      customRoleId: companyMembers.customRoleId,
      customRoleLabel: companyRoles.label,
      customRolePermissions: companyRoles.permissions,
    })
    .from(companyMembers)
    .innerJoin(companies, eq(companies.id, companyMembers.companyId))
    .leftJoin(
      companyRoles,
      and(
        eq(companyRoles.id, companyMembers.customRoleId),
        eq(companyRoles.companyId, companyMembers.companyId),
      ),
    )
    .where(eq(companyMembers.userId, userId))
    .orderBy(asc(companyMembers.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const moduleRows = await tx
    .select({ module: companyModules.module, enabled: companyModules.enabled })
    .from(companyModules)
    .where(eq(companyModules.companyId, row.companyId));
  const modules: CompanyModules = { ...DEFAULT_MODULES };
  for (const m of moduleRows) modules[m.module as ModuleKey] = m.enabled;

  const role = row.role as CompanyRole;
  // Ruolo personalizzato assegnato: i suoi permessi sostituiscono quelli di sistema.
  const customPermissions = row.customRoleId ? (row.customRolePermissions ?? []) : null;
  return {
    companyId: row.companyId,
    name: row.name,
    slug: row.slug,
    sector: row.sector,
    templateVersion: row.templateVersion,
    terms: resolveTerms(row.terms),
    role,
    customRole: row.customRoleId && row.customRoleLabel
      ? { id: row.customRoleId, label: row.customRoleLabel }
      : null,
    modules,
    permissions: effectivePermissions(role, customPermissions, modules),
  };
}

/**
 * UNICO punto di accesso ai dati dello studio dalle route: UNA sola transazione RLS
 * che risolve la membership (query) e poi esegue cb con tx e contesto dello studio.
 * Lancia UnauthorizedError (401) o NoCompanyError (409).
 */
export async function withCompany<T>(
  cb: (tx: Tx, ctx: CompanyTxContext) => Promise<T>
): Promise<T> {
  const user = await getVerifiedUser();
  return withRLS(claimsOf(user), async (tx) => {
    const m = await selectMembership(tx, user.id);
    if (!m) throw new NoCompanyError();
    return cb(tx, {
      userId: user.id,
      companyId: m.companyId,
      role: m.role,
      permissions: m.permissions,
      modules: m.modules,
    });
  });
}

/** Sessione + studio corrente per /api/me. Non lancia se manca lo studio. */
export const getMe = cache(async (): Promise<MeResponse> => {
  const user = await getVerifiedUser();
  const m = await withUser((tx) => selectMembership(tx, user.id));
  if (!m) {
    return {
      user,
      company: null,
      role: null,
      profile: null,
      permissions: [],
      terms: resolveTerms(null),
      modules: { ...DEFAULT_MODULES },
      customRole: null,
      roleTitle: null,
    };
  }
  const terms = m.terms;
  return {
    user,
    company: {
      id: m.companyId,
      name: m.name,
      slug: m.slug,
      sector: m.sector,
      role: m.role,
      templateVersion: m.templateVersion,
    },
    role: m.role,
    profile: profileOf(m.role),
    permissions: m.permissions,
    terms,
    modules: m.modules,
    customRole: m.customRole,
    roleTitle: roleTitle(terms, m.role, m.customRole?.label),
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
  return {
    user,
    companyId: m.companyId,
    role: m.role,
    permissions: m.permissions,
    modules: m.modules,
  };
});

/**
 * Come withCompany, ma la callback viene eseguita solo se l'utente ha il permesso effettivo.
 * Uso dichiarativo nelle route: withPermission("quotes:write", (tx, { companyId }) => ...).
 * Lancia ForbiddenError (403 FORBIDDEN) prima di qualunque query dati.
 */
export function withPermission<T>(
  permission: Permission,
  cb: (tx: Tx, ctx: CompanyTxContext) => Promise<T>
): Promise<T> {
  return withCompany((tx, ctx) => {
    if (!can(ctx.permissions, permission)) throw new ForbiddenError();
    return cb(tx, ctx);
  });
}

/**
 * Come withPermission, ma prima verifica che il modulo sia attivo: modulo spento → 404
 * (la funzionalità non esiste per lo studio). `permission` null per moduli senza permessi.
 */
export function withModule<T>(
  module: ModuleKey,
  permission: Permission | null,
  cb: (tx: Tx, ctx: CompanyTxContext) => Promise<T>
): Promise<T> {
  return withCompany((tx, ctx) => {
    if (!ctx.modules[module]) throw new NotFoundError("Modulo non attivo");
    if (permission && !can(ctx.permissions, permission)) throw new ForbiddenError();
    return cb(tx, ctx);
  });
}

/** Come requireCompany, con controllo del permesso (per route senza query dati, es. OAuth/provider). */
export async function requirePermission(permission: Permission): Promise<CompanyContext> {
  const ctx = await requireCompany();
  if (!can(ctx.permissions, permission)) throw new ForbiddenError();
  return ctx;
}

export interface Membership extends CompanyContext {
  profile: AccessProfile;
  /** Pagina iniziale del ruolo ("/" oppure "/contabile") */
  homePath: string;
  terms: Terms;
  customRole: { id: string; label: string } | null;
  roleTitle: string;
}

/**
 * Helper per Server Components / layout (redirect per ruolo).
 * Lancia UnauthorizedError se non loggato (→ /login). Ritorna null se l'utente non ha
 * uno studio (→ /onboarding). Riusa getMe (deduplicato per richiesta).
 */
export const getCurrentMembership = cache(async (): Promise<Membership | null> => {
  const me = await getMe();
  if (!me.company || !me.role) return null;
  return {
    user: me.user,
    companyId: me.company.id,
    role: me.role,
    permissions: me.permissions,
    modules: me.modules,
    profile: profileOf(me.role),
    homePath: homePathFor(me.role),
    terms: me.terms,
    customRole: me.customRole,
    roleTitle: me.roleTitle ?? me.terms.ownerTitle,
  };
});
