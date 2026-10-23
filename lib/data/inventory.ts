import "server-only";
import { and, asc, desc, eq, gt, ilike, isNotNull, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import {
  clients,
  inventoryCategories,
  inventoryItemTypes,
  inventoryItems,
  inventoryMovements,
  inventoryStock,
  type InventoryCategoryRow,
  type InventoryItemRow,
  type InventoryItemTypeRow,
  type InventoryMovementRow,
  type NewInventoryItemRow,
  type NewInventoryItemTypeRow,
} from "@/drizzle/schema";
import type { ClientAttributes } from "@/app/types/clients";
import type {
  CreateInventoryCategoryInput,
  CreateInventoryItemInput,
  CreateInventoryItemTypeInput,
  CreateInventoryMovementInput,
  InventoryCategory,
  InventoryItem,
  InventoryItemDetail,
  InventoryItemFilters,
  InventoryItemType,
  InventoryMovement,
  InventoryStockLot,
  UpdateInventoryCategoryInput,
  UpdateInventoryItemInput,
  UpdateInventoryItemTypeInput,
} from "@/app/types/api";
import { getCalendarTimeZone } from "@/lib/calendar-sync/time";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { validateAttributes } from "@/lib/validation";
import { listFieldDefinitions } from "./clients";
import { assertUuid, dateInZone, first } from "./format";
import { keyFromLabel } from "./settings";

const DEFAULT_MOVEMENTS_LIMIT = 50;
const MAX_MOVEMENTS_LIMIT = 200;
/** Passo di posizione per i nuovi tipi (come i tipi di appuntamento). */
const POSITION_STEP = 10;
const DEFAULT_UNIT = "pz";

// ─── Mapping ────────────────────────────────────────────────────────────────
const nullableNumber = (v: string | null): number | null => (v === null ? null : Number(v));
const decimalString = (v: number | null): string | null => (v === null ? null : String(v));

function toItemType(row: InventoryItemTypeRow): InventoryItemType {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    position: row.position,
    trackLot: row.trackLot,
    trackExpiry: row.trackExpiry,
    trackSerial: row.trackSerial,
    consumable: row.consumable,
    fractional: row.fractional,
    sellable: row.sellable,
    requiresClientOnIssue: row.requiresClientOnIssue,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

function toCategory(row: InventoryCategoryRow): InventoryCategory {
  return { id: row.id, name: row.name, parentId: row.parentId };
}

/** Sotto scorta: solo consumabili con soglia impostata e giacenza <= soglia (deve restare uguale al SQL di inventoryBelowReorderCountSql). */
function isBelowReorder(consumable: boolean, reorderLevel: number | null, stock: number): boolean {
  return consumable && reorderLevel !== null && stock <= reorderLevel;
}

function toItem(
  item: InventoryItemRow,
  type: InventoryItemTypeRow,
  stock: number,
  nextExpiryDate: string | null,
): InventoryItem {
  const reorderLevel = nullableNumber(item.reorderLevel);
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    itemTypeId: item.itemTypeId,
    itemType: toItemType(type),
    categoryId: item.categoryId,
    unit: item.unit,
    issueUnit: item.issueUnit,
    conversionFactor: Number(item.conversionFactor),
    reorderLevel,
    reorderQty: nullableNumber(item.reorderQty),
    purchasePrice: nullableNumber(item.purchasePrice),
    salePrice: nullableNumber(item.salePrice),
    vatRate: nullableNumber(item.vatRate),
    attributes: item.attributes,
    note: item.note,
    stock,
    belowReorder: isBelowReorder(type.consumable, reorderLevel, stock),
    nextExpiryDate,
    archivedAt: item.archivedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function toMovement(
  row: InventoryMovementRow,
  client: { code: string | null; name: string | null } | null,
): InventoryMovement {
  return {
    id: row.id,
    itemId: row.itemId,
    movementType: row.movementType,
    quantity: Number(row.quantity),
    lot: row.lot,
    expiryDate: row.expiryDate,
    serial: row.serial,
    unitCost: nullableNumber(row.unitCost),
    clientId: client?.code ?? null,
    clientName: client?.name ?? null,
    appointmentId: row.appointmentId,
    taskId: row.taskId,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Helpers di accesso ─────────────────────────────────────────────────────
/** Tipo attivo (non archiviato) dello studio: obbligatorio per creare/spostare un articolo. */
async function loadActiveItemType(tx: Tx, companyId: string, typeId: string): Promise<InventoryItemTypeRow> {
  const [type] = await tx
    .select()
    .from(inventoryItemTypes)
    .where(
      and(
        eq(inventoryItemTypes.id, typeId),
        eq(inventoryItemTypes.companyId, companyId),
        isNull(inventoryItemTypes.archivedAt),
      ),
    )
    .limit(1);
  if (!type) throw new ValidationError("Tipo di articolo non valido o archiviato");
  return type;
}

/** Articolo con il suo tipo (per i flag). */
async function loadItemWithType(
  tx: Tx,
  companyId: string,
  id: string,
): Promise<{ item: InventoryItemRow; itemType: InventoryItemTypeRow }> {
  const [row] = await tx
    .select({ item: inventoryItems, itemType: inventoryItemTypes })
    .from(inventoryItems)
    .innerJoin(
      inventoryItemTypes,
      and(
        eq(inventoryItemTypes.id, inventoryItems.itemTypeId),
        eq(inventoryItemTypes.companyId, inventoryItems.companyId),
      ),
    )
    .where(and(eq(inventoryItems.id, id), eq(inventoryItems.companyId, companyId)))
    .limit(1);
  if (!row) throw new NotFoundError("Articolo non trovato");
  return row;
}

/** Categoria dello studio (null/undefined = nessuna, nessun controllo). */
async function assertCategoryInCompany(tx: Tx, companyId: string, id: string | null | undefined): Promise<void> {
  if (!id) return;
  const [row] = await tx
    .select({ id: inventoryCategories.id })
    .from(inventoryCategories)
    .where(and(eq(inventoryCategories.id, id), eq(inventoryCategories.companyId, companyId)))
    .limit(1);
  if (!row) throw new ValidationError("Categoria non trovata per questo studio");
}

async function assertSkuFree(tx: Tx, companyId: string, sku: string, exceptId?: string): Promise<void> {
  const [dup] = await tx
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.companyId, companyId),
        eq(inventoryItems.sku, sku),
        exceptId ? ne(inventoryItems.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  if (dup) throw new ConflictError(`SKU "${sku}" già utilizzato in questo studio`);
}

async function countItems(tx: Tx, companyId: string, typeId: string, extra?: SQL): Promise<number> {
  const [row] = await tx
    .select({ n: sql<string>`count(*)` })
    .from(inventoryItems)
    .where(
      and(eq(inventoryItems.companyId, companyId), eq(inventoryItems.itemTypeId, typeId), extra),
    );
  return Number(row?.n ?? 0);
}

async function hasMovements(tx: Tx, companyId: string, itemId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: inventoryMovements.id })
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.companyId, companyId), eq(inventoryMovements.itemId, itemId)))
    .limit(1);
  return row !== undefined;
}

/** Attributi validati contro le definizioni entity='item' del tipo. */
async function validateItemAttributes(
  tx: Tx,
  companyId: string,
  typeKey: string,
  raw: ClientAttributes | undefined,
  partial: boolean,
): Promise<ClientAttributes> {
  const defs = await listFieldDefinitions(tx, companyId, typeKey, false, "item");
  return validateAttributes(raw ?? {}, defs, partial);
}

interface TypeRuleValues {
  issueUnit: string | null;
  /** null = non indicato */
  conversionFactor: number | null;
  salePrice: number | null;
  vatRate: number | null;
}

/**
 * Regole dei flag sui valori finali dell'articolo (creazione e modifica).
 * Frazionabile → unità di scarico e fattore > 0; non frazionabile → unità di scarico NULL, fattore 1.
 * Vendibile → prezzo di vendita e IVA obbligatori.
 */
function applyTypeRules(type: InventoryItemTypeRow, v: TypeRuleValues): { issueUnit: string | null; conversionFactor: number } {
  if (type.sellable && (v.salePrice === null || v.vatRate === null)) {
    throw new ValidationError("Articolo in vendita: indicare prezzo di vendita e aliquota IVA");
  }
  if (!type.fractional) return { issueUnit: null, conversionFactor: 1 };
  if (!v.issueUnit) {
    throw new ValidationError("Articolo frazionabile: indicare l'unità di scarico e il fattore di conversione");
  }
  if (v.conversionFactor === null || v.conversionFactor <= 0) {
    throw new ValidationError("Articolo frazionabile: il fattore di conversione deve essere maggiore di zero");
  }
  return { issueUnit: v.issueUnit, conversionFactor: v.conversionFactor };
}

// ─── Giacenza ───────────────────────────────────────────────────────────────
/** Totali di giacenza per articolo (sottoselect condivisa dalle query di elenco). */
function stockTotalsOf(tx: Tx, companyId: string) {
  return tx
    .select({
      itemId: inventoryStock.itemId,
      total: sql<string>`sum(${inventoryStock.quantity})`.as("total"),
      // ::text: data YYYY-MM-DD indipendente dal parsing del driver.
      nextExpiry: sql<string | null>`min(case when ${inventoryStock.quantity} > 0 then ${inventoryStock.expiryDate} end)::text`.as(
        "next_expiry",
      ),
    })
    .from(inventoryStock)
    .where(eq(inventoryStock.companyId, companyId))
    .groupBy(inventoryStock.itemId)
    .as("inventory_totals");
}

/** Articolo con almeno un lotto in giacenza che scade entro `days` giorni (scaduti inclusi). */
function expiringWithin(companyId: string, days: number): SQL {
  const today = dateInZone(new Date(), getCalendarTimeZone());
  const [y, m, d] = today.split("-").map(Number);
  const limit = new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  return sql`exists (select 1 from ${inventoryStock}
    where ${eq(inventoryStock.companyId, companyId)}
      and ${eq(inventoryStock.itemId, inventoryItems.id)}
      and ${gt(inventoryStock.quantity, "0")}
      and ${lte(inventoryStock.expiryDate, limit)})`;
}

/** Quantità disponibile per articolo + lotto + scadenza (null = non tracciato). */
async function availableStock(
  tx: Tx,
  companyId: string,
  itemId: string,
  lot: string | null,
  expiryDate: string | null,
): Promise<number> {
  const [row] = await tx
    .select({ quantity: inventoryStock.quantity })
    .from(inventoryStock)
    .where(
      and(
        eq(inventoryStock.companyId, companyId),
        eq(inventoryStock.itemId, itemId),
        lot === null ? isNull(inventoryStock.lot) : eq(inventoryStock.lot, lot),
        expiryDate === null ? isNull(inventoryStock.expiryDate) : eq(inventoryStock.expiryDate, expiryDate),
      ),
    )
    .limit(1);
  return row ? Number(row.quantity) : 0;
}

/**
 * SQL scalare: numero di articoli sotto scorta (consumabili, non archiviati, giacenza <= soglia).
 * Per i badge della sidebar (lib/data/badges.ts). Stesso predicato di isBelowReorder().
 */
export function inventoryBelowReorderCountSql(companyId: string): SQL {
  const totals = sql`(select ${inventoryStock.itemId} as item_id, sum(${inventoryStock.quantity}) as total
    from ${inventoryStock}
    where ${eq(inventoryStock.companyId, companyId)}
    group by ${inventoryStock.itemId})`;
  return sql`(select count(*) from ${inventoryItems}
    inner join ${inventoryItemTypes}
      on ${eq(inventoryItemTypes.id, inventoryItems.itemTypeId)}
      and ${eq(inventoryItemTypes.companyId, inventoryItems.companyId)}
    left join ${totals} as inventory_totals on inventory_totals.item_id = ${inventoryItems.id}
    where ${eq(inventoryItems.companyId, companyId)}
      and ${isNull(inventoryItems.archivedAt)}
      and ${eq(inventoryItemTypes.consumable, true)}
      and ${isNotNull(inventoryItems.reorderLevel)}
      and coalesce(inventory_totals.total, 0) <= ${inventoryItems.reorderLevel})`;
}

// ─── Tipi di articolo ───────────────────────────────────────────────────────
export async function listInventoryItemTypes(tx: Tx, companyId: string): Promise<InventoryItemType[]> {
  const rows = await tx
    .select()
    .from(inventoryItemTypes)
    .where(eq(inventoryItemTypes.companyId, companyId))
    .orderBy(asc(inventoryItemTypes.position), asc(inventoryItemTypes.label));
  return rows.map(toItemType);
}

export async function createInventoryItemType(
  tx: Tx,
  companyId: string,
  input: CreateInventoryItemTypeInput,
): Promise<InventoryItemType> {
  const key = input.key ?? keyFromLabel(input.label);
  const [dup] = await tx
    .select({ id: inventoryItemTypes.id })
    .from(inventoryItemTypes)
    .where(and(eq(inventoryItemTypes.companyId, companyId), eq(inventoryItemTypes.key, key)))
    .limit(1);
  if (dup) throw new ConflictError(`Esiste già un tipo di articolo con chiave "${key}"`);

  const inserted = await tx
    .insert(inventoryItemTypes)
    .values({
      companyId,
      key,
      label: input.label,
      trackLot: input.trackLot ?? false,
      trackExpiry: input.trackExpiry ?? false,
      trackSerial: input.trackSerial ?? false,
      consumable: input.consumable ?? true,
      fractional: input.fractional ?? false,
      sellable: input.sellable ?? false,
      requiresClientOnIssue: input.requiresClientOnIssue ?? false,
      // Dopo l'ultimo tipo (archiviati inclusi, per non riusare posizioni).
      position: sql`(select coalesce(max(${inventoryItemTypes.position}), 0) + ${POSITION_STEP} from ${inventoryItemTypes} where ${eq(inventoryItemTypes.companyId, companyId)})`,
    })
    .returning();
  return toItemType(first(inserted, "insert inventory_item_types"));
}

export async function updateInventoryItemType(
  tx: Tx,
  companyId: string,
  id: string,
  patch: UpdateInventoryItemTypeInput,
): Promise<InventoryItemType> {
  assertUuid(id, "id tipo di articolo");
  const [current] = await tx
    .select()
    .from(inventoryItemTypes)
    .where(and(eq(inventoryItemTypes.id, id), eq(inventoryItemTypes.companyId, companyId)))
    .limit(1);
  if (!current) throw new NotFoundError("Tipo di articolo non trovato");

  // Frazionabilità: cambia il significato dell'unità di scarico degli articoli esistenti.
  if (patch.fractional !== undefined && patch.fractional !== current.fractional) {
    if ((await countItems(tx, companyId, id)) > 0) {
      throw new ValidationError("La frazionabilità non si può cambiare: il tipo ha già articoli");
    }
  }
  // Vendibilità: gli articoli esistenti devono già avere prezzo e IVA.
  if (patch.sellable === true && !current.sellable) {
    const missing = await countItems(
      tx,
      companyId,
      id,
      or(isNull(inventoryItems.salePrice), isNull(inventoryItems.vatRate)),
    );
    if (missing > 0) {
      throw new ValidationError("Ci sono articoli di questo tipo senza prezzo di vendita o IVA: completarli prima");
    }
  }

  const { label, position, archived, ...flags } = patch;
  const set: Partial<NewInventoryItemTypeRow> = { ...flags, updatedAt: new Date() };
  if (label !== undefined) set.label = label;
  if (position !== undefined) set.position = position;
  if (archived !== undefined) set.archivedAt = archived ? (current.archivedAt ?? new Date()) : null;

  const updated = await tx
    .update(inventoryItemTypes)
    .set(set)
    .where(and(eq(inventoryItemTypes.id, id), eq(inventoryItemTypes.companyId, companyId)))
    .returning();
  return toItemType(first(updated, "update inventory_item_types"));
}

/** Elimina il tipo se nessun articolo lo usa, altrimenti lo archivia (FK NO ACTION sugli articoli). */
export async function deleteInventoryItemType(tx: Tx, companyId: string, id: string): Promise<void> {
  assertUuid(id, "id tipo di articolo");
  const [current] = await tx
    .select({ id: inventoryItemTypes.id, archivedAt: inventoryItemTypes.archivedAt })
    .from(inventoryItemTypes)
    .where(and(eq(inventoryItemTypes.id, id), eq(inventoryItemTypes.companyId, companyId)))
    .limit(1);
  if (!current) throw new NotFoundError("Tipo di articolo non trovato");

  if ((await countItems(tx, companyId, id)) > 0) {
    if (!current.archivedAt) {
      await tx
        .update(inventoryItemTypes)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(inventoryItemTypes.id, id), eq(inventoryItemTypes.companyId, companyId)));
    }
    return;
  }
  await tx
    .delete(inventoryItemTypes)
    .where(and(eq(inventoryItemTypes.id, id), eq(inventoryItemTypes.companyId, companyId)));
}

// ─── Categorie ──────────────────────────────────────────────────────────────
export async function listInventoryCategories(tx: Tx, companyId: string): Promise<InventoryCategory[]> {
  const rows = await tx
    .select()
    .from(inventoryCategories)
    .where(eq(inventoryCategories.companyId, companyId))
    .orderBy(asc(inventoryCategories.name));
  return rows.map(toCategory);
}

export async function createInventoryCategory(
  tx: Tx,
  companyId: string,
  input: CreateInventoryCategoryInput,
): Promise<InventoryCategory> {
  await assertCategoryInCompany(tx, companyId, input.parentId);
  const inserted = await tx
    .insert(inventoryCategories)
    .values({ companyId, name: input.name, parentId: input.parentId ?? null })
    .returning();
  return toCategory(first(inserted, "insert inventory_categories"));
}

export async function updateInventoryCategory(
  tx: Tx,
  companyId: string,
  id: string,
  patch: UpdateInventoryCategoryInput,
): Promise<InventoryCategory> {
  assertUuid(id, "id categoria");
  const all = await listInventoryCategories(tx, companyId);
  if (!all.some((c) => c.id === id)) throw new NotFoundError("Categoria non trovata");

  if (patch.parentId) {
    await assertCategoryInCompany(tx, companyId, patch.parentId);
    // Il nuovo padre non può essere la categoria stessa né un suo discendente.
    const parentOf = new Map(all.map((c) => [c.id, c.parentId]));
    const seen = new Set<string>();
    for (let cursor: string | null = patch.parentId; cursor !== null && !seen.has(cursor); ) {
      if (cursor === id) throw new ValidationError("Categoria padre non valida: creerebbe un ciclo");
      seen.add(cursor);
      cursor = parentOf.get(cursor) ?? null;
    }
  }

  const set: { name?: string; parentId?: string | null; updatedAt: Date } = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.parentId !== undefined) set.parentId = patch.parentId;
  const updated = await tx
    .update(inventoryCategories)
    .set(set)
    .where(and(eq(inventoryCategories.id, id), eq(inventoryCategories.companyId, companyId)))
    .returning();
  return toCategory(first(updated, "update inventory_categories"));
}

/** Elimina: le sottocategorie tornano radice e gli articoli senza categoria (FK ON DELETE SET NULL). */
export async function deleteInventoryCategory(tx: Tx, companyId: string, id: string): Promise<void> {
  assertUuid(id, "id categoria");
  const deleted = await tx
    .delete(inventoryCategories)
    .where(and(eq(inventoryCategories.id, id), eq(inventoryCategories.companyId, companyId)))
    .returning({ id: inventoryCategories.id });
  if (deleted.length === 0) throw new NotFoundError("Categoria non trovata");
}

// ─── Articoli ───────────────────────────────────────────────────────────────
/** Pattern ILIKE con escape di % _ \ */
const likePattern = (q: string): string => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Articoli con giacenza totale e tipo; filtri opzionali (anche id singolo). */
async function findItems(tx: Tx, companyId: string, f: Partial<InventoryItemFilters> & { id?: string }): Promise<InventoryItem[]> {
  const totals = stockTotalsOf(tx, companyId);
  const rows = await tx
    .select({
      item: inventoryItems,
      itemType: inventoryItemTypes,
      stock: sql<string>`coalesce(${totals.total}, 0)`,
      nextExpiry: totals.nextExpiry,
    })
    .from(inventoryItems)
    .innerJoin(
      inventoryItemTypes,
      and(
        eq(inventoryItemTypes.id, inventoryItems.itemTypeId),
        eq(inventoryItemTypes.companyId, inventoryItems.companyId),
      ),
    )
    .leftJoin(totals, eq(totals.itemId, inventoryItems.id))
    .where(
      and(
        eq(inventoryItems.companyId, companyId),
        f.includeArchived ? undefined : isNull(inventoryItems.archivedAt),
        f.id ? eq(inventoryItems.id, f.id) : undefined,
        f.categoryId ? eq(inventoryItems.categoryId, f.categoryId) : undefined,
        f.itemTypeId ? eq(inventoryItems.itemTypeId, f.itemTypeId) : undefined,
        f.q ? or(ilike(inventoryItems.name, likePattern(f.q)), ilike(inventoryItems.sku, likePattern(f.q))) : undefined,
        f.belowReorder
          ? and(
              eq(inventoryItemTypes.consumable, true),
              isNotNull(inventoryItems.reorderLevel),
              sql`coalesce(${totals.total}, 0) <= ${inventoryItems.reorderLevel}`,
            )
          : undefined,
        f.expiringWithinDays !== undefined ? expiringWithin(companyId, f.expiringWithinDays) : undefined,
      ),
    )
    .orderBy(asc(inventoryItems.name), asc(inventoryItems.sku));
  return rows.map((r) => toItem(r.item, r.itemType, Number(r.stock), r.nextExpiry ?? null));
}

export async function listInventoryItems(
  tx: Tx,
  companyId: string,
  filters: InventoryItemFilters,
): Promise<InventoryItem[]> {
  return findItems(tx, companyId, filters);
}

/**
 * Dettaglio articolo: lotti in giacenza e ultimi movimenti. Cliente e nome del cliente
 * nei movimenti solo con `withClients` (permesso clients:read dell'utente).
 */
export async function getInventoryItem(
  tx: Tx,
  companyId: string,
  id: string,
  opts: { withClients: boolean; movementLimit?: number },
): Promise<InventoryItemDetail | null> {
  assertUuid(id, "id articolo");
  const [item] = await findItems(tx, companyId, { id, includeArchived: true });
  if (!item) return null;

  const lotRows = await tx
    .select({
      lot: inventoryStock.lot,
      expiryDate: inventoryStock.expiryDate,
      quantity: inventoryStock.quantity,
    })
    .from(inventoryStock)
    .where(
      and(
        eq(inventoryStock.companyId, companyId),
        eq(inventoryStock.itemId, id),
        gt(inventoryStock.quantity, "0"),
      ),
    )
    .orderBy(asc(inventoryStock.expiryDate), asc(inventoryStock.lot));
  const lots: InventoryStockLot[] = lotRows.map((r) => ({
    lot: r.lot,
    expiryDate: r.expiryDate,
    quantity: Number(r.quantity),
  }));

  const limit = Math.min(opts.movementLimit ?? DEFAULT_MOVEMENTS_LIMIT, MAX_MOVEMENTS_LIMIT);
  const movementRows = await tx
    .select({ movement: inventoryMovements, clientCode: clients.code, clientName: clients.name })
    .from(inventoryMovements)
    .leftJoin(
      clients,
      and(eq(clients.id, inventoryMovements.clientId), eq(clients.companyId, inventoryMovements.companyId)),
    )
    .where(and(eq(inventoryMovements.companyId, companyId), eq(inventoryMovements.itemId, id)))
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(limit);
  const movements = movementRows.map((r) =>
    toMovement(
      r.movement,
      opts.withClients ? { code: r.clientCode, name: r.clientName } : null,
    ),
  );

  return { ...item, lots, movements };
}

export async function createInventoryItem(
  tx: Tx,
  companyId: string,
  input: CreateInventoryItemInput,
): Promise<InventoryItem> {
  const type = await loadActiveItemType(tx, companyId, input.itemTypeId);
  await assertCategoryInCompany(tx, companyId, input.categoryId);
  await assertSkuFree(tx, companyId, input.sku);

  const rules = applyTypeRules(type, {
    issueUnit: input.issueUnit ?? null,
    conversionFactor: input.conversionFactor ?? null,
    salePrice: input.salePrice ?? null,
    vatRate: input.vatRate ?? null,
  });
  const attributes = await validateItemAttributes(tx, companyId, type.key, input.attributes, false);

  const inserted = await tx
    .insert(inventoryItems)
    .values({
      companyId,
      sku: input.sku,
      name: input.name,
      itemTypeId: type.id,
      categoryId: input.categoryId ?? null,
      unit: input.unit ?? DEFAULT_UNIT,
      issueUnit: rules.issueUnit,
      conversionFactor: String(rules.conversionFactor),
      reorderLevel: decimalString(input.reorderLevel ?? null),
      reorderQty: decimalString(input.reorderQty ?? null),
      purchasePrice: decimalString(input.purchasePrice ?? null),
      salePrice: decimalString(input.salePrice ?? null),
      vatRate: decimalString(input.vatRate ?? null),
      attributes,
      note: input.note ?? null,
    })
    .returning();
  const row = first(inserted, "insert inventory_items");
  const [created] = await findItems(tx, companyId, { id: row.id, includeArchived: true });
  if (!created) throw new Error("Articolo appena creato non leggibile");
  return created;
}

/**
 * Modifica anagrafica o archiviazione (`archived`). Articolo archiviato: solo il ripristino.
 * Il tipo non cambia dopo il primo movimento. Attributi uniti (chiave a null = svuotata).
 */
export async function updateInventoryItem(
  tx: Tx,
  companyId: string,
  id: string,
  patch: UpdateInventoryItemInput,
): Promise<InventoryItem> {
  assertUuid(id, "id articolo");
  const { item, itemType: currentType } = await loadItemWithType(tx, companyId, id);
  const onlyArchiveFlag = Object.keys(patch).every((k) => k === "archived");
  if (item.archivedAt && !onlyArchiveFlag) {
    throw new ValidationError("Articolo archiviato: ripristinarlo per modificarlo");
  }

  let type = currentType;
  const set: Omit<Partial<NewInventoryItemRow>, "attributes"> & { attributes?: ClientAttributes | SQL } = {
    updatedAt: new Date(),
  };
  if (patch.itemTypeId !== undefined && patch.itemTypeId !== item.itemTypeId) {
    if (await hasMovements(tx, companyId, id)) {
      throw new ValidationError("Il tipo non può cambiare: l'articolo ha già movimenti");
    }
    type = await loadActiveItemType(tx, companyId, patch.itemTypeId);
    set.itemTypeId = type.id;
  }
  if (patch.archived !== undefined) {
    set.archivedAt = patch.archived ? (item.archivedAt ?? new Date()) : null;
  }
  if (patch.sku !== undefined && patch.sku !== item.sku) {
    await assertSkuFree(tx, companyId, patch.sku, id);
    set.sku = patch.sku;
  }
  if (patch.categoryId !== undefined) {
    await assertCategoryInCompany(tx, companyId, patch.categoryId);
    set.categoryId = patch.categoryId;
  }
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.unit !== undefined) set.unit = patch.unit;
  if (patch.note !== undefined) set.note = patch.note;
  if (patch.reorderLevel !== undefined) set.reorderLevel = decimalString(patch.reorderLevel);
  if (patch.reorderQty !== undefined) set.reorderQty = decimalString(patch.reorderQty);
  if (patch.purchasePrice !== undefined) set.purchasePrice = decimalString(patch.purchasePrice);
  if (patch.salePrice !== undefined) set.salePrice = decimalString(patch.salePrice);
  if (patch.vatRate !== undefined) set.vatRate = decimalString(patch.vatRate);

  // Regole dei flag sui valori finali (dopo le modifiche sopra).
  const rules = applyTypeRules(type, {
    issueUnit: patch.issueUnit !== undefined ? patch.issueUnit : item.issueUnit,
    conversionFactor: patch.conversionFactor ?? Number(item.conversionFactor),
    salePrice: patch.salePrice !== undefined ? patch.salePrice : nullableNumber(item.salePrice),
    vatRate: patch.vatRate !== undefined ? patch.vatRate : nullableNumber(item.vatRate),
  });
  // La giacenza è nell'unità di scarico: con movimenti unità e fattore non cambiano.
  if (
    (rules.issueUnit !== item.issueUnit || rules.conversionFactor !== Number(item.conversionFactor))
    && await hasMovements(tx, companyId, id)
  ) {
    throw new ValidationError("Unità di scarico e fattore di conversione non si possono cambiare: l'articolo ha già movimenti");
  }
  set.issueUnit = rules.issueUnit;
  set.conversionFactor = String(rules.conversionFactor);

  if (patch.attributes !== undefined) {
    const pub = await validateItemAttributes(tx, companyId, type.key, patch.attributes, true);
    if (Object.keys(pub).length > 0) {
      set.attributes = sql`${inventoryItems.attributes} || ${JSON.stringify(pub)}::jsonb`;
    }
  }

  await tx
    .update(inventoryItems)
    .set(set)
    .where(and(eq(inventoryItems.id, id), eq(inventoryItems.companyId, companyId)));
  const [updated] = await findItems(tx, companyId, { id, includeArchived: true });
  if (!updated) throw new NotFoundError("Articolo non trovato");
  return updated;
}

// ─── Movimenti ──────────────────────────────────────────────────────────────
/** Valore obbligatorio per un articolo che traccia il campo; altrimenti null (il campo è ignorato). */
function requiredWhenTracked(tracked: boolean, value: string | undefined, message: string): string | null {
  if (!tracked) return null;
  if (value === undefined) throw new ValidationError(message);
  return value;
}

/**
 * Registra un movimento. La quantità in input è sempre positiva: il segno lo applica
 * il backend (scarico −, rettifica in/out). I controlli dei flag precedono il DB;
 * il trigger resta la seconda barriera.
 */
export async function recordInventoryMovement(
  tx: Tx,
  companyId: string,
  itemId: string,
  input: CreateInventoryMovementInput,
): Promise<InventoryMovement> {
  assertUuid(itemId, "id articolo");
  const { item, itemType: type } = await loadItemWithType(tx, companyId, itemId);

  if (item.archivedAt && (input.movementType === "carico" || input.movementType === "scarico")) {
    throw new ValidationError("Articolo archiviato: sono ammessi solo rettifiche e resi");
  }

  // Quantità nell'unità di scarico (in unità di carico solo per gli articoli frazionabili).
  let amount = input.quantity;
  if (input.inLoadUnit) {
    if (!type.fractional) {
      throw new ValidationError("La quantità in unità di carico vale solo per gli articoli frazionabili");
    }
    amount = input.quantity * Number(item.conversionFactor);
  }
  const scaled = amount * 1000;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) {
    throw new ValidationError("Quantità non rappresentabile: massimo 3 decimali nell'unità di scarico");
  }
  const magnitude = Math.round(scaled) / 1000;
  const negative =
    input.movementType === "scarico" || (input.movementType === "rettifica" && input.direction === "out");
  const signed = negative ? -magnitude : magnitude;
  const unitLabel = type.fractional && item.issueUnit ? item.issueUnit : item.unit;

  // Campi tracciati dal tipo: obbligatori; gli altri sono ignorati (come nel trigger).
  const lot = requiredWhenTracked(type.trackLot, input.lot, "Lotto obbligatorio per questo tipo di articolo");
  const expiryDate = requiredWhenTracked(
    type.trackExpiry,
    input.expiryDate,
    "Data di scadenza obbligatoria per questo tipo di articolo",
  );
  const serial = requiredWhenTracked(type.trackSerial, input.serial, "Matricola obbligatoria per questo tipo di articolo");
  if (serial !== null && Math.abs(signed) !== 1) {
    throw new ValidationError("Con la matricola ogni movimento riguarda un solo pezzo");
  }

  if (serial !== null) {
    const [net] = await tx
      .select({ total: sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)` })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.companyId, companyId),
          eq(inventoryMovements.itemId, itemId),
          eq(inventoryMovements.serial, serial),
        ),
      );
    const held = Number(net?.total ?? 0);
    if (signed > 0 && held > 0) throw new ValidationError(`Matricola ${serial} già presente a magazzino`);
    if (signed < 0 && held < 1) throw new ValidationError(`Matricola ${serial} non presente a magazzino`);
  }

  if (input.movementType === "scarico" && type.requiresClientOnIssue && !input.clientId) {
    throw new ValidationError("Lo scarico di questo tipo di articolo richiede il cliente");
  }
  const client = input.clientId ? await clientByCode(tx, companyId, input.clientId) : null;

  if (signed < 0) {
    const available = await availableStock(tx, companyId, itemId, lot, expiryDate);
    if (Math.round((available + signed) * 1000) < 0) {
      throw new ValidationError(`Giacenza insufficiente: disponibili ${available} ${unitLabel}`);
    }
  }

  const inserted = await tx
    .insert(inventoryMovements)
    .values({
      companyId,
      itemId,
      movementType: input.movementType,
      quantity: String(signed),
      lot,
      expiryDate,
      serial,
      unitCost: decimalString(input.unitCost ?? null),
      clientId: client?.id ?? null,
      reason: input.reason ?? null,
    })
    .returning();
  return toMovement(
    first(inserted, "insert inventory_movements"),
    client ? { code: client.code, name: client.name } : null,
  );
}

/** Cliente dello studio dal codice applicativo (come nel resto delle API). */
async function clientByCode(
  tx: Tx,
  companyId: string,
  code: string,
): Promise<{ id: string; code: string; name: string }> {
  const [row] = await tx
    .select({ id: clients.id, code: clients.code, name: clients.name })
    .from(clients)
    .where(and(eq(clients.companyId, companyId), eq(clients.code, code)))
    .limit(1);
  if (!row) throw new NotFoundError("Cliente non trovato");
  return row;
}
