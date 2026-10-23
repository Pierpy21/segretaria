import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { CompanyTxContext, Tx } from "@/lib/db";
import { companyInvitations, companyMembers } from "@/drizzle/schema";
import type {
  AcceptInvitationResult,
  CompanyInvitationView,
  CompanyRole,
  CreateInvitationInput,
  InvitationPreview,
  InvitationStatus,
  MemberPatch,
  MemberSummary,
  MemberView,
  MembersOverview,
} from "@/app/types/api";
import {
  COMPANY_ROLES,
  assignableRoles,
  canManageMember,
  homePathFor,
  invitableRoles,
} from "@/lib/auth/permissions";
import { generateInvitationToken, hashInvitationToken } from "@/lib/auth/invitation-token";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  pgConstraintName,
  pgErrorCode,
  pgErrorMessages,
} from "@/lib/errors";
import { assignCustomRole, listMembers } from "@/lib/data/settings";

const INVITATION_STATUSES: readonly InvitationStatus[] = ["pending", "expired", "accepted", "revoked"];
const LAST_OWNER_MESSAGE = "Lo studio deve avere almeno un titolare";
const ALREADY_MEMBER_CONSTRAINT = "accept_invitation_already_member";

export interface CreatedInvitation {
  invitation: CompanyInvitationView;
  /** Token in chiaro: restituito una sola volta, mai salvato. */
  token: string;
}

function asCompanyRole(value: string): CompanyRole {
  if ((COMPANY_ROLES as readonly string[]).includes(value)) return value as CompanyRole;
  throw new Error(`Ruolo sconosciuto nel database: ${value}`);
}

function asInvitationStatus(value: string): InvitationStatus {
  if ((INVITATION_STATUSES as readonly string[]).includes(value)) return value as InvitationStatus;
  throw new Error(`Stato invito sconosciuto nel database: ${value}`);
}

function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

/** Membro con i flag rispetto all'attore: mai se stesso. */
function toMemberView(member: MemberSummary, ctx: CompanyTxContext): MemberView {
  const isSelf = member.userId === ctx.userId;
  return {
    ...member,
    isSelf,
    canManage: !isSelf && canManageMember(ctx.role, member.role),
  };
}

/** Colonne di company_invitations lette dall'app: MAI token_hash (credenziale di accept, solo nelle RPC). */
const INVITATION_COLUMNS = {
  id: companyInvitations.id,
  companyId: companyInvitations.companyId,
  email: companyInvitations.email,
  role: companyInvitations.role,
  invitedBy: companyInvitations.invitedBy,
  createdAt: companyInvitations.createdAt,
  expiresAt: companyInvitations.expiresAt,
  acceptedAt: companyInvitations.acceptedAt,
  acceptedBy: companyInvitations.acceptedBy,
  revokedAt: companyInvitations.revokedAt,
} as const;

type InvitationRow = Pick<typeof companyInvitations.$inferSelect, "id" | "email" | "role" | "createdAt" | "expiresAt">;

function toInvitationView(row: InvitationRow, ctx: CompanyTxContext, nowMs: number): CompanyInvitationView {
  const role = asCompanyRole(row.role);
  return {
    id: row.id,
    email: row.email,
    role,
    createdAt: toIso(row.createdAt),
    expiresAt: toIso(row.expiresAt),
    status: row.expiresAt.getTime() <= nowMs ? "expired" : "pending",
    canManage: canManageMember(ctx.role, role),
  };
}

/** Errore del trigger protect_last_owner (42501 con messaggio "last owner") → 409. */
function translateLastOwnerError(err: unknown): unknown {
  if (pgErrorCode(err) === "42501" && pgErrorMessages(err).some((m) => /last owner/i.test(m))) {
    return new ConflictError(LAST_OWNER_MESSAGE);
  }
  return err;
}

/** Membri (con email) e inviti non accettati né revocati dello studio. */
export async function getMembersOverview(tx: Tx, ctx: CompanyTxContext): Promise<MembersOverview> {
  const members = await listMembers(tx, ctx.companyId);
  const inviteRows = await tx
    .select(INVITATION_COLUMNS)
    .from(companyInvitations)
    .where(
      and(
        eq(companyInvitations.companyId, ctx.companyId),
        isNull(companyInvitations.acceptedAt),
        isNull(companyInvitations.revokedAt),
      ),
    )
    .orderBy(desc(companyInvitations.createdAt));
  const nowMs = Date.now();
  return {
    members: members.map((m) => toMemberView(m, ctx)),
    invitations: inviteRows.map((row) => toInvitationView(row, ctx, nowMs)),
  };
}

/**
 * Crea un invito (o lo "reinvia": revoca i pendenti per la stessa email).
 * Non fa rete: l'invio email avviene dopo la transazione, nella route.
 */
export async function createInvitation(
  tx: Tx,
  ctx: CompanyTxContext,
  input: CreateInvitationInput,
): Promise<CreatedInvitation> {
  if (!invitableRoles(ctx.role).includes(input.role)) {
    throw new ForbiddenError("Non puoi invitare una persona con questo ruolo");
  }

  const members = await listMembers(tx, ctx.companyId);
  if (members.some((m) => m.email?.toLowerCase() === input.email)) {
    throw new ConflictError("Questa persona fa già parte dello studio");
  }

  const pending = await tx
    .select(INVITATION_COLUMNS)
    .from(companyInvitations)
    .where(
      and(
        eq(companyInvitations.companyId, ctx.companyId),
        eq(companyInvitations.email, input.email),
        isNull(companyInvitations.acceptedAt),
        isNull(companyInvitations.revokedAt),
      ),
    );
  // Un invito pendente di un ruolo che l'attore non gestisce non può essere sostituito da lui.
  if (pending.some((row) => !canManageMember(ctx.role, asCompanyRole(row.role)))) {
    throw new ForbiddenError("Non puoi sostituire un invito di questo ruolo");
  }
  if (pending.length > 0) {
    await tx
      .update(companyInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(companyInvitations.companyId, ctx.companyId),
          eq(companyInvitations.email, input.email),
          isNull(companyInvitations.acceptedAt),
          isNull(companyInvitations.revokedAt),
        ),
      );
  }

  const token = generateInvitationToken();
  let row: InvitationRow | undefined;
  try {
    [row] = await tx
      .insert(companyInvitations)
      .values({
        companyId: ctx.companyId,
        email: input.email,
        role: input.role,
        tokenHash: hashInvitationToken(token),
        invitedBy: ctx.userId,
      })
      .returning(INVITATION_COLUMNS);
  } catch (err) {
    // Due inviti concorrenti per la stessa email: vince l'indice parziale dei pendenti.
    if (pgErrorCode(err) === "23505") {
      throw new ConflictError("C'è già un invito in corso per questa email");
    }
    throw err;
  }
  if (!row) throw new Error("Invito non creato");

  return { invitation: toInvitationView(row, ctx, Date.now()), token };
}

/** Revoca un invito non ancora accettato né revocato. */
export async function revokeInvitation(tx: Tx, ctx: CompanyTxContext, id: string): Promise<{ id: string }> {
  const rows = await tx
    .select({ id: companyInvitations.id, role: companyInvitations.role })
    .from(companyInvitations)
    .where(
      and(
        eq(companyInvitations.id, id),
        eq(companyInvitations.companyId, ctx.companyId),
        isNull(companyInvitations.acceptedAt),
        isNull(companyInvitations.revokedAt),
      ),
    )
    .limit(1);
  const target = rows[0];
  if (!target) throw new NotFoundError("Invito non trovato o già chiuso");
  if (!canManageMember(ctx.role, asCompanyRole(target.role))) {
    throw new ForbiddenError("Non puoi revocare un invito di questo ruolo");
  }

  const updated = await tx
    .update(companyInvitations)
    .set({ revokedAt: new Date() })
    .where(eq(companyInvitations.id, id))
    .returning({ id: companyInvitations.id });
  if (updated.length === 0) throw new NotFoundError("Invito non trovato o già chiuso");
  return { id };
}

/** Ruolo di sistema del membro (userId dello studio corrente). 404 se non è membro. */
async function findMemberRole(tx: Tx, ctx: CompanyTxContext, userId: string): Promise<CompanyRole> {
  const rows = await tx
    .select({ role: companyMembers.role })
    .from(companyMembers)
    .where(and(eq(companyMembers.companyId, ctx.companyId), eq(companyMembers.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError("Membro non trovato");
  return asCompanyRole(row.role);
}

/**
 * Modifica di un membro (mai se stessi). `role` e `customRoleId` nella stessa transazione:
 * il cambio di ruolo di sistema azzera il ruolo personalizzato nella stessa UPDATE.
 */
export async function updateMember(
  tx: Tx,
  ctx: CompanyTxContext,
  userId: string,
  patch: MemberPatch,
): Promise<MemberView> {
  if (userId === ctx.userId) throw new ConflictError("Non puoi modificare il tuo ruolo");
  const currentRole = await findMemberRole(tx, ctx, userId);
  if (!canManageMember(ctx.role, currentRole)) {
    throw new ForbiddenError("Non puoi modificare un membro con questo ruolo");
  }
  if (patch.role !== undefined && !assignableRoles(ctx.role).includes(patch.role)) {
    throw new ForbiddenError("Non puoi assegnare questo ruolo a questo membro");
  }

  if (patch.role !== undefined && patch.role !== currentRole) {
    let updated: Array<{ userId: string }>;
    try {
      updated = await tx
        .update(companyMembers)
        .set({ role: patch.role, customRoleId: null, updatedAt: new Date() })
        .where(and(eq(companyMembers.companyId, ctx.companyId), eq(companyMembers.userId, userId)))
        .returning({ userId: companyMembers.userId });
    } catch (err) {
      throw translateLastOwnerError(err);
    }
    if (updated.length === 0) throw new ForbiddenError("Non puoi assegnare questo ruolo a questo membro");
  }

  // Ruolo personalizzato (null = rimuovi). Titolari/admin: rifiutato da assignCustomRole (400).
  if (patch.customRoleId !== undefined) {
    await assignCustomRole(tx, ctx.companyId, userId, patch.customRoleId);
  }

  const member = (await listMembers(tx, ctx.companyId)).find((m) => m.userId === userId);
  if (!member) throw new NotFoundError("Membro non trovato");
  return toMemberView(member, ctx);
}

/** Rimozione di un membro (mai se stessi). */
export async function removeMember(tx: Tx, ctx: CompanyTxContext, userId: string): Promise<{ userId: string }> {
  if (userId === ctx.userId) throw new ConflictError("Non puoi rimuovere te stesso dallo studio");
  const currentRole = await findMemberRole(tx, ctx, userId);
  if (!canManageMember(ctx.role, currentRole)) {
    throw new ForbiddenError("Non puoi rimuovere un membro con questo ruolo");
  }

  let deleted: Array<{ userId: string }>;
  try {
    deleted = await tx
      .delete(companyMembers)
      .where(and(eq(companyMembers.companyId, ctx.companyId), eq(companyMembers.userId, userId)))
      .returning({ userId: companyMembers.userId });
  } catch (err) {
    throw translateLastOwnerError(err);
  }
  if (deleted.length === 0) throw new ForbiddenError("Non puoi rimuovere un membro con questo ruolo");
  return { userId };
}

/** Anteprima dell'invito per il token in chiaro (hash calcolato qui). Lancia NotFoundError se non esiste. */
export async function previewInvitation(tx: Tx, token: string): Promise<InvitationPreview> {
  const rows = (await tx.execute(
    sql`select company_name, role, email, expires_at, status, email_matches from public.get_company_invitation(${hashInvitationToken(token)})`,
  )) as unknown as Array<{
    company_name: string;
    role: string;
    email: string;
    expires_at: Date | string;
    status: string;
    email_matches: boolean;
  }>;
  const row = rows[0];
  if (!row) throw new NotFoundError("Invito non valido o scaduto");
  return {
    companyName: row.company_name,
    role: asCompanyRole(row.role),
    email: row.email,
    expiresAt: toIso(row.expires_at),
    status: asInvitationStatus(row.status),
    emailMatches: row.email_matches === true,
  };
}

function translateAcceptError(err: unknown): unknown {
  const code = pgErrorCode(err);
  if (code === "P0002") return new NotFoundError("Invito non valido o scaduto");
  if (code === "42501") return new ForbiddenError("Questo invito è destinato a un altro indirizzo email");
  if (pgConstraintName(err) === ALREADY_MEMBER_CONSTRAINT) {
    return new ConflictError("Il tuo account fa già parte di uno studio");
  }
  return err;
}

/** Accettazione dell'invito per l'utente corrente (RPC accept_company_invitation). */
export async function acceptInvitation(tx: Tx, token: string): Promise<AcceptInvitationResult> {
  const preview = await previewInvitation(tx, token);
  let companyId: string | undefined;
  try {
    const rows = (await tx.execute(
      sql`select public.accept_company_invitation(${hashInvitationToken(token)}) as company_id`,
    )) as unknown as Array<{ company_id: string }>;
    companyId = rows[0]?.company_id;
  } catch (err) {
    throw translateAcceptError(err);
  }
  if (!companyId) throw new Error("accept_company_invitation non ha restituito un id");
  return { companyId, homePath: homePathFor(preview.role) };
}
