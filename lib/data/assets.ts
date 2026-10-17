import "server-only";
import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import {
  clientAssets,
  clients,
  type ClientAssetRow,
  type NewClientAssetRow,
} from "@/drizzle/schema";
import type { ClientAttributes } from "@/app/types/clients";
import type { ClientAsset, ClientAssetOption, CreateAssetInput, UpdateAssetInput } from "@/app/types/api";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { validateAttributes } from "@/lib/validation";
import { listFieldDefinitions } from "./clients";
import { assertUuid, first } from "./format";

/**
 * Definizioni dei campi di un tipo di bene (entity = 'asset', client_type = asset_type).
 * Solo campi non sensibili: non esiste una tabella clinica per i beni.
 */
export function listAssetFieldDefinitions(tx: Tx, companyId: string, assetType: string) {
  return listFieldDefinitions(tx, companyId, assetType, false, "asset");
}

async function validateAssetAttributes(
  tx: Tx,
  companyId: string,
  assetType: string,
  raw: ClientAttributes | undefined,
  partial: boolean,
): Promise<ClientAttributes> {
  const defs = await listAssetFieldDefinitions(tx, companyId, assetType);
  return validateAttributes(raw ?? {}, defs, partial);
}

function toAsset(row: ClientAssetRow, clientCode: string): ClientAsset {
  return {
    id: row.id,
    clientId: clientCode,
    assetType: row.assetType,
    name: row.name,
    identifier: row.identifier,
    attributes: row.attributes,
    note: row.note,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Beni con il codice applicativo del cliente (join su clients per id). */
async function findAssets(tx: Tx, where: SQL | undefined): Promise<ClientAsset[]> {
  const rows = await tx
    .select({ asset: clientAssets, clientCode: clients.code })
    .from(clientAssets)
    .innerJoin(clients, eq(clients.id, clientAssets.clientId))
    .where(where)
    .orderBy(asc(clientAssets.name));
  return rows.map((r) => toAsset(r.asset, r.clientCode));
}

/** UUID del cliente dal codice applicativo nello studio. */
async function clientIdOf(tx: Tx, companyId: string, clientCode: string): Promise<string> {
  const [row] = await tx
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.companyId, companyId), eq(clients.code, clientCode)))
    .limit(1);
  if (!row) throw new NotFoundError("Cliente non trovato");
  return row.id;
}

/** Beni di un cliente. Gli archiviati sono esclusi salvo `includeArchived`. */
export async function listClientAssets(
  tx: Tx,
  companyId: string,
  clientCode: string,
  includeArchived: boolean,
): Promise<ClientAsset[]> {
  const clientId = await clientIdOf(tx, companyId, clientCode);
  return findAssets(
    tx,
    and(
      eq(clientAssets.companyId, companyId),
      eq(clientAssets.clientId, clientId),
      includeArchived ? undefined : isNull(clientAssets.archivedAt),
    ),
  );
}

/**
 * Beni attivi (non archiviati) dello studio, ordinati per cliente e nome.
 * `clientCode` facoltativo: filtra su un cliente. Per i selettori di eventi/attività/preventivi.
 */
export async function listCompanyAssets(
  tx: Tx,
  companyId: string,
  clientCode?: string,
): Promise<ClientAssetOption[]> {
  const rows = await tx
    .select({ asset: clientAssets, clientCode: clients.code, clientName: clients.name })
    .from(clientAssets)
    .innerJoin(clients, eq(clients.id, clientAssets.clientId))
    .where(
      and(
        eq(clientAssets.companyId, companyId),
        isNull(clientAssets.archivedAt),
        clientCode ? eq(clients.code, clientCode) : undefined,
      ),
    )
    .orderBy(asc(clients.name), asc(clientAssets.name));
  return rows.map((r) => ({ ...toAsset(r.asset, r.clientCode), clientName: r.clientName }));
}

export async function getClientAsset(tx: Tx, companyId: string, id: string): Promise<ClientAsset | null> {
  assertUuid(id, "id bene");
  const [asset] = await findAssets(
    tx,
    and(eq(clientAssets.id, id), eq(clientAssets.companyId, companyId)),
  );
  return asset ?? null;
}

export async function createClientAsset(
  tx: Tx,
  companyId: string,
  clientCode: string,
  input: CreateAssetInput,
): Promise<ClientAsset> {
  const clientId = await clientIdOf(tx, companyId, clientCode);
  const attributes = await validateAssetAttributes(tx, companyId, input.assetType, input.attributes, false);
  const inserted = await tx
    .insert(clientAssets)
    .values({
      companyId,
      clientId,
      assetType: input.assetType,
      name: input.name,
      identifier: input.identifier ?? null,
      note: input.note ?? null,
      attributes,
    })
    .returning();
  return toAsset(first(inserted, "insert client_assets"), clientCode);
}

/** Gli attributi del patch sono uniti (non sostituiti): chiave a `null` = svuotata. */
export async function updateClientAsset(
  tx: Tx,
  companyId: string,
  id: string,
  patch: UpdateAssetInput,
): Promise<ClientAsset> {
  assertUuid(id, "id bene");
  const [current] = await tx
    .select({ assetType: clientAssets.assetType, archivedAt: clientAssets.archivedAt })
    .from(clientAssets)
    .where(and(eq(clientAssets.id, id), eq(clientAssets.companyId, companyId)))
    .limit(1);
  if (!current) throw new NotFoundError("Bene non trovato");
  if (current.archivedAt) throw new ValidationError("Bene archiviato: non modificabile");

  const set: Omit<Partial<NewClientAssetRow>, "attributes"> & { attributes?: ClientAttributes | SQL } = {
    updatedAt: new Date(),
  };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.identifier !== undefined) set.identifier = patch.identifier;
  if (patch.note !== undefined) set.note = patch.note;
  if (patch.attributes !== undefined) {
    const pub = await validateAssetAttributes(tx, companyId, current.assetType, patch.attributes, true);
    if (Object.keys(pub).length > 0) {
      set.attributes = sql`${clientAssets.attributes} || ${JSON.stringify(pub)}::jsonb`;
    }
  }

  const updated = await tx
    .update(clientAssets)
    .set(set)
    .where(and(eq(clientAssets.id, id), eq(clientAssets.companyId, companyId)))
    .returning({ id: clientAssets.id });
  if (!updated[0]) throw new NotFoundError("Bene non trovato");
  const asset = await getClientAsset(tx, companyId, id);
  if (!asset) throw new NotFoundError("Bene non trovato");
  return asset;
}

/** Archivia (non elimina): i collegamenti di eventi/attività/preventivi restano. False se non trovato o già archiviato. */
export async function archiveClientAsset(tx: Tx, companyId: string, id: string): Promise<boolean> {
  assertUuid(id, "id bene");
  const archived = await tx
    .update(clientAssets)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(clientAssets.id, id), eq(clientAssets.companyId, companyId), isNull(clientAssets.archivedAt)))
    .returning({ id: clientAssets.id });
  return archived.length > 0;
}

/**
 * Verifica che il bene esista, sia dello studio e non sia archiviato.
 * Usata da eventi, attività e preventivi prima di salvare `assetId`
 * (la FK composita nel DB è il secondo presidio).
 */
export async function assertAssetInCompany(tx: Tx, companyId: string, assetId: string): Promise<void> {
  assertUuid(assetId, "id bene");
  const [row] = await tx
    .select({ id: clientAssets.id })
    .from(clientAssets)
    .where(and(eq(clientAssets.id, assetId), eq(clientAssets.companyId, companyId), isNull(clientAssets.archivedAt)))
    .limit(1);
  if (!row) throw new ValidationError("Bene non trovato per questo studio");
}
