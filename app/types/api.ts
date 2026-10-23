// Contratto condiviso UI ↔ API per l'integrazione con il database (Supabase + Drizzle).
// Tutte le route rispondono con ApiResult<T>. Errori comuni:
//   401 { success:false, error:"UNAUTHORIZED" }  → utente non loggato (redirect a /login)
//   409 { success:false, error:"NO_COMPANY" }    → utente senza studio (redirect a /onboarding)
//   403 { success:false, error:"FORBIDDEN" }     → ruolo senza il permesso richiesto
// Tutti gli id delle entità sono UUID string.

import type { EventSource, ReminderPriority, ReminderStatus } from "./calendar";
import type { Task, ColumnId, TaskPriority } from "./maintenance";
import type { MessageFrom } from "./messaging";
import type { Client, ClientAttributeValue, ClientAttributes, ClientFieldDefinition, ClientFieldType, FieldEntity, Sector } from "./clients";
import type { AccessProfile, Permission } from "@/lib/auth/permissions";
import type { AppointmentType, CompanyModules, CustomRole, Terms, VerticalTemplateSummary } from "./settings";

export type { ApiResult } from "./calendar-sync";

export const API_ERROR = {
  UNAUTHORIZED: "UNAUTHORIZED",
  NO_COMPANY: "NO_COMPANY",
  FORBIDDEN: "FORBIDDEN",
} as const;

// ─── Sessione & onboarding ──────────────────────────────────────────────────
// GET  /api/me                → MeResponse
// POST /api/onboarding        body OnboardingInput → MeResponse["company"]
// Login/registrazione: client Supabase lato browser (lib/supabase/client.ts),
// conferma email su GET /auth/callback?code=... → redirect "/".
// owner/admin = titolare (accesso completo); member = staff; accountant = assistente contabile.
export type CompanyRole = "owner" | "admin" | "member" | "accountant";
export interface MeResponse {
  user: { id: string; email: string | null };
  company: {
    id: string; name: string; slug: string; sector: Sector; role: CompanyRole;
    /** Versione del preset di settore applicata (null se mai applicato) */
    templateVersion: number | null;
  } | null;
  /** Ruolo nello studio corrente (null se nessuno studio) */
  role: CompanyRole | null;
  profile: AccessProfile | null;
  /** Permessi effettivi: ruolo (o ruolo personalizzato) filtrato dai moduli attivi. Controllo: can() */
  permissions: Permission[];
  /** Terminologia risolta dello studio (con default) */
  terms: Terms;
  modules: CompanyModules;
  customRole: { id: string; label: string } | null;
  /** Titolo leggibile del ruolo (etichetta del ruolo personalizzato, altrimenti da terms) */
  roleTitle: string | null;
}
export interface OnboardingInput {
  name: string;
  /** Popola lo studio con i dati demo (app/data/*) */
  seedDemo: boolean;
  /** Settore: sceglie i campi personalizzati di default (default "generico") */
  sector: Sector;
}

// ─── Agenda (eventi salvati su DB; quelli Google/Apple sono importati via sync) ──
// GET    /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD → CalendarEventData[]
// POST   /api/calendar/events      body CreateCalendarEventInput → CalendarEventData
//        (source Google/Apple: crea prima sul calendario esterno, poi salva su DB)
// DELETE /api/calendar/events/[id] → null (se esterno elimina anche sul provider)
// POST   /api/calendar/sync        body { from, to } → SyncResult
// GET    /api/calendar/status      → SyncStatusResponse (app/types/calendar-sync.ts)
// GET    /api/calendar/google/connect (redirect OAuth) | DELETE → disconnette
// POST   /api/calendar/apple/connect body AppleConnectInput → ProviderStatus | DELETE
export interface CreateCalendarEventInput {
  title: string;
  description?: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
  source: EventSource;
  /** Bene del cliente collegato (facoltativo, deve appartenere allo studio) */
  assetId?: string;
  /** Tipo di appuntamento dello studio (attivo, deve appartenere allo studio) */
  appointmentTypeId?: string;
  /** Colore #RRGGBB; se assente e c'è un tipo di appuntamento, si usa il suo colore */
  color?: string;
}
export interface SyncResult {
  imported: number;
  removed: number;
  errors: Partial<Record<"google" | "apple", string>>;
}
export interface AppleConnectInput {
  appleId: string;
  appPassword: string;
  calendarName?: string;
}

// ─── Promemoria ─────────────────────────────────────────────────────────────
// GET   /api/reminders → ReminderData[]
// POST  /api/reminders body { text, time: "HH:mm", priority } → ReminderData
// PATCH /api/reminders/[id] body { status } → ReminderData
export interface CreateReminderInput { text: string; time: string; priority: ReminderPriority }
export interface UpdateReminderInput { status: ReminderStatus }

// ─── Attività (kanban) ──────────────────────────────────────────────────────
// GET    /api/tasks → BoardTask[]   (le colonne/colori restano costanti UI)
// POST   /api/tasks body CreateTaskInput → BoardTask
// PATCH  /api/tasks/[id] body UpdateTaskInput → BoardTask
// DELETE /api/tasks/[id] → null
export interface BoardTask extends Task { columnId: ColumnId; position: number; assetId?: string | null }
export interface CreateTaskInput {
  title: string; description?: string; priority: TaskPriority; columnId: ColumnId; assignedTo?: string;
  assetId?: string;
}
/** assetId: null = scollega il bene */
export type UpdateTaskInput = Partial<Omit<CreateTaskInput, "assetId"> & { position: number; assetId: string | null }>;

// ─── Chat ───────────────────────────────────────────────────────────────────
// GET  /api/conversations → ChatListItem[]
// GET  /api/conversations/[id]/messages → Message[]
// POST /api/conversations/[id]/messages body { from, text } → Message
// POST /api/conversations/[id]/read → null (azzera unread)
export interface CreateMessageInput { from: MessageFrom; text: string }

// ─── Preventivi ─────────────────────────────────────────────────────────────
// GET    /api/quotes → Quote[]
// POST   /api/quotes body CreateQuoteInput → Quote
// PATCH  /api/quotes/[id] body Partial<CreateQuoteInput & { status: QuoteStatus }> → Quote
// DELETE /api/quotes/[id] → null
export interface CreateQuoteInput {
  client: string; type: string; amount: number; description?: string; date?: string;
  /** Bene del cliente collegato (facoltativo). In PATCH: null = scollega */
  assetId?: string | null;
}

// ─── Beni del cliente (client_assets) ───────────────────────────────────────
// GET    /api/assets[?clientId=PT-…] → ClientAssetOption[] (attivi, ordinati per cliente e nome)
// GET    /api/clients/[id]/assets?includeArchived=true → ClientAsset[] (id = codice cliente)
// POST   /api/clients/[id]/assets body CreateAssetInput → ClientAsset (201)
// GET    /api/assets/[id] → ClientAsset
// PATCH  /api/assets/[id] body UpdateAssetInput → ClientAsset
// DELETE /api/assets/[id] → null (archivia, non elimina)
// Definizioni campi: lib/data/assets.ts listAssetFieldDefinitions(tx, companyId, assetType)
export interface ClientAsset {
  id: string;
  /** Codice applicativo del cliente (es. "PT-2026-0142") */
  clientId: string;
  assetType: string;
  name: string;
  identifier: string | null;
  /** Valori dei campi con entity = 'asset' e client_type = assetType */
  attributes: ClientAttributes;
  note: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CreateAssetInput {
  assetType: string;
  name: string;
  identifier?: string;
  note?: string;
  attributes?: ClientAttributes;
}
/** Bene con il nome del cliente (selettori di eventi/attività/preventivi). */
export type ClientAssetOption = ClientAsset & { clientName: string };

/** Il tipo del bene non è modificabile (gli attributi dipendono da lui). null = svuota. */
export interface UpdateAssetInput {
  name?: string;
  identifier?: string | null;
  note?: string | null;
  attributes?: ClientAttributes;
}

// ─── Clienti ────────────────────────────────────────────────────────────────
// GET   /api/clients → ClientResponse[]
// GET   /api/clients/[id] → ClientResponse
// POST  /api/clients body CreateClientInput → ClientResponse
// PATCH /api/clients/[id] body Partial<CreateClientInput> → ClientResponse
// GET   /api/clients/fields?type=dentale → ClientFieldDefinition[] (ordinati per position)
// GET   /api/clients/fields?entity=asset[&type=veicolo] → ClientFieldDefinition[] dei beni
//       (senza type: tutte le definizioni dei beni dello studio; solo non sensibili)
export type CreateClientInput = Omit<Client, "id" | "age" | "initials">;
/** Campi sensibili (ex clinici): presenti in risposta solo con sensitive:read (assenti, non null, altrimenti). */
export type ClinicalClientKey = "recommendation" | "previousVisit" | "treatments";
export type ClientResponse = Omit<Client, ClinicalClientKey> & Partial<Pick<Client, ClinicalClientKey>>;
export type { Sector, ClientFieldDefinition, ClientFieldType, ClientAttributeValue, ClientAttributes, FieldEntity };

// ─── Tipi di appuntamento (agenda) ──────────────────────────────────────────
// GET /api/appointment-types → AppointmentType[] (attivi, ordinati per position; calendar:read)

// ─── Impostazioni dello studio (settori configurabili) ──────────────────────
// GET    /api/settings                       → SettingsResponse                       (settings:manage)
// PATCH  /api/settings/terms                 body Partial<Terms> → Terms              ("" o null = ripristina default)
// PATCH  /api/settings/modules               body Partial<CompanyModules> → CompanyModules
// POST   /api/settings/template              body ApplyTemplateInput → SettingsResponse
// POST   /api/settings/appointment-types     body CreateAppointmentTypeInput → AppointmentType (201)
// PATCH  /api/settings/appointment-types/[id] body UpdateAppointmentTypeInput → AppointmentType
// DELETE /api/settings/appointment-types/[id] → null (archivia, non elimina)
// GET    /api/settings/roles                 → RolesResponse                          (members:manage)
// POST   /api/settings/roles                 body CreateCustomRoleInput → CustomRole (201)
// PATCH  /api/settings/roles/[id]            body UpdateCustomRoleInput → CustomRole
// DELETE /api/settings/roles/[id]            → null (i membri tornano al ruolo di sistema)
// PATCH  /api/settings/members/[userId]      body { customRoleId: string | null } → MemberSummary
export interface SettingsResponse {
  sector: Sector;
  templateVersion: number | null;
  /** Terminologia risolta (con default) */
  terms: Terms;
  /** Solo le etichette personalizzate dello studio (companies.terms grezzo) */
  termOverrides: Partial<Terms>;
  modules: CompanyModules;
  /** Anche gli archiviati (archivedAt valorizzato) */
  appointmentTypes: AppointmentType[];
  /** Ultima versione di ogni preset di settore */
  templates: VerticalTemplateSummary[];
}
export interface ApplyTemplateInput {
  sector: Sector;
  /** true = le etichette personalizzate dello studio restano sopra il preset */
  keepTerms?: boolean;
}
export interface CreateAppointmentTypeInput {
  label: string;
  color?: string;
  durationMinutes?: number;
  /** Chiave stabile; se assente viene generata dalla label */
  key?: string;
}
export interface UpdateAppointmentTypeInput {
  label?: string;
  color?: string;
  durationMinutes?: number;
  position?: number;
  archived?: boolean;
}
/** Membro dello studio (get_company_members). */
export interface MemberSummary {
  userId: string;
  email: string | null;
  role: CompanyRole;
  customRoleId: string | null;
  createdAt: string;
}
export interface RolesResponse {
  roles: CustomRole[];
  members: MemberSummary[];
}
export interface CreateCustomRoleInput {
  label: string;
  /** Solo permessi di CUSTOM_ROLE_PERMISSIONS, almeno uno */
  permissions: Permission[];
  /** Chiave stabile; se assente viene generata dalla label */
  key?: string;
}
export interface UpdateCustomRoleInput {
  label?: string;
  permissions?: Permission[];
}

// ─── Magazzino (inventory) ──────────────────────────────────────────────────
// Modulo 'inventory'. Giacenza = somma dei movimenti (inventory_stock scritta dal trigger).
// Quantità SEMPRE nell'unità di scarico (issueUnit se il tipo è frazionabile, altrimenti unit).
// Errori di regola del DB (23514 inventory_*_rules) → 400 con messaggio in italiano.
//
// GET    /api/inventory/items[?q&categoryId&itemTypeId&belowReorder&expiringWithinDays&includeArchived]
//        → InventoryItem[]                                              (inventory:read)
// POST   /api/inventory/items body CreateInventoryItemInput → InventoryItem (201)   (inventory:write)
// GET    /api/inventory/items/[id]                  → InventoryItemDetail  (inventory:read; movimenti e cliente solo con clients:read)
// PATCH  /api/inventory/items/[id] body UpdateInventoryItemInput → InventoryItem   (inventory:write; archived true/false = archivia/ripristina)
// POST   /api/inventory/items/[id]/movements body CreateInventoryMovementInput → InventoryMovement (201) (inventory:write)
// GET    /api/inventory/categories                  → InventoryCategory[]  (inventory:read)
// POST   /api/inventory/categories body CreateInventoryCategoryInput → InventoryCategory (201) (inventory:write)
// PATCH  /api/inventory/categories/[id] body UpdateInventoryCategoryInput → InventoryCategory (inventory:write)
// DELETE /api/inventory/categories/[id]             → null (sottocategorie e articoli restano senza padre/categoria)
// GET    /api/inventory/item-types                  → InventoryItemType[] (inventory:read oppure settings:manage)
// POST   /api/inventory/item-types body CreateInventoryItemTypeInput → InventoryItemType (201) (settings:manage)
// PATCH  /api/inventory/item-types/[id] body UpdateInventoryItemTypeInput → InventoryItemType (settings:manage)
// DELETE /api/inventory/item-types/[id]             → null (elimina se nessun articolo, altrimenti archivia)

/** Flag di comportamento di un tipo di articolo (inventory_item_types). */
export type InventoryItemTypeFlag =
  | "trackLot" | "trackExpiry" | "trackSerial" | "consumable"
  | "fractional" | "sellable" | "requiresClientOnIssue";

export interface InventoryItemType extends Record<InventoryItemTypeFlag, boolean> {
  id: string;
  key: string;
  label: string;
  /** Etichetta del lotto in UI (es. "DOT"); null = "Lotto" */
  lotLabel: string | null;
  position: number;
  /** Tipi archiviati: restano sugli articoli esistenti, non si usano per nuovi articoli */
  archivedAt: string | null;
}
export interface CreateInventoryItemTypeInput extends Partial<Record<InventoryItemTypeFlag, boolean>> {
  label: string;
  /** Chiave stabile; se assente viene generata dalla label */
  key?: string;
  /** Etichetta del lotto (max 40); vuota o null = "Lotto" */
  lotLabel?: string | null;
}
/** `fractional` non è modificabile se il tipo ha già articoli; `sellable` non si attiva se ci sono articoli senza prezzo/IVA. */
export interface UpdateInventoryItemTypeInput extends Partial<Record<InventoryItemTypeFlag, boolean>> {
  label?: string;
  /** null o vuota = torna "Lotto" */
  lotLabel?: string | null;
  position?: number;
  archived?: boolean;
}

// ─── Catalogo pneumatici (EPREL, solo lettura) ──────────────────────────────
// GET /api/inventory/catalog/tyres                       → TyreCatalogResponse (senza parametri: solo disponibilità)
// GET /api/inventory/catalog/tyres?width&ratio&rim[&brand] → TyreCatalogResponse (inventory:write)
//   width 100-400 (intero), ratio 20-100 (intero), rim 10-26 (intero o .5), brand max 60 caratteri.
//   catalogAvailable false (chiave EPREL assente) → results sempre []; errori EPREL → ApiResult con error.
export interface TyreCatalogQuery {
  width: number;
  ratio: number;
  rim: number;
  brand?: string;
}
/** Scheda di un pneumatico registrato in EPREL. Campi assenti nel catalogo = null. */
export interface TyreCatalogEntry {
  registrationNumber: string | null;
  brand: string | null;
  commercialName: string | null;
  modelIdentifier: string | null;
  sizeDesignation: string | null;
  width: number | null;
  ratio: number | null;
  rim: number | null;
  /** Indice di carico, es. "91" o "91/89" (doppio indice) */
  loadIndex: string | null;
  speedSymbol: string | null;
  tyreClass: string | null;
  /** Classe di consumo (energyClass) */
  fuelClass: string | null;
  wetGripClass: string | null;
  noiseClass: string | null;
  noiseDb: number | null;
  /** Neve (3PMSF) */
  snow: boolean | null;
  ice: boolean | null;
}
export interface TyreCatalogResponse {
  /** false = chiave EPREL non configurata sul server: nessuna chiamata esterna */
  catalogAvailable: boolean;
  results: TyreCatalogEntry[];
}

export interface InventoryCategory {
  id: string;
  name: string;
  parentId: string | null;
}
export interface CreateInventoryCategoryInput {
  name: string;
  parentId?: string;
}
/** parentId: null = porta a livello radice */
export interface UpdateInventoryCategoryInput {
  name?: string;
  parentId?: string | null;
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  itemTypeId: string;
  /** Tipo completo (flag utili alla UI: lotti, scadenze, matricole, vendibile, ...) */
  itemType: InventoryItemType;
  categoryId: string | null;
  /** Unità di carico */
  unit: string;
  /** Unità di scarico (solo se frazionabile) */
  issueUnit: string | null;
  /** Unità di scarico per 1 unità di carico (1 se non frazionabile) */
  conversionFactor: number;
  reorderLevel: number | null;
  reorderQty: number | null;
  purchasePrice: number | null;
  salePrice: number | null;
  vatRate: number | null;
  /** Valori dei campi con entity = 'item' e client_type = chiave del tipo */
  attributes: ClientAttributes;
  note: string | null;
  /** Giacenza totale in unità di scarico (somma di tutti i lotti) */
  stock: number;
  /** Consumabile con reorderLevel non nullo e giacenza <= reorderLevel */
  belowReorder: boolean;
  /** Scadenza più vicina tra i lotti con giacenza > 0 (YYYY-MM-DD), null se nessuna */
  nextExpiryDate: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
/** Lotto/scadenza con giacenza > 0 */
export interface InventoryStockLot {
  lot: string | null;
  expiryDate: string | null;  // YYYY-MM-DD
  quantity: number;
}
export interface InventoryItemDetail extends InventoryItem {
  /** Lotti in giacenza (quantity > 0), per scadenza crescente */
  lots: InventoryStockLot[];
  /** Ultimi movimenti (più recenti prima) */
  movements: InventoryMovement[];
}
export interface CreateInventoryItemInput {
  sku: string;
  name: string;
  itemTypeId: string;
  categoryId?: string;
  /** Default 'pz' */
  unit?: string;
  /** Obbligatoria se il tipo è frazionabile */
  issueUnit?: string;
  /** Obbligatorio e > 0 se il tipo è frazionabile (default 1) */
  conversionFactor?: number;
  reorderLevel?: number;
  reorderQty?: number;
  purchasePrice?: number;
  /** Obbligatorio se il tipo è vendibile */
  salePrice?: number;
  /** Obbligatoria se il tipo è vendibile (0-100) */
  vatRate?: number;
  attributes?: ClientAttributes;
  note?: string;
}
/** Campi nullable: null = svuota. Il tipo non cambia dopo i primi movimenti. */
export interface UpdateInventoryItemInput {
  sku?: string;
  name?: string;
  itemTypeId?: string;
  categoryId?: string | null;
  unit?: string;
  issueUnit?: string | null;
  conversionFactor?: number;
  reorderLevel?: number | null;
  reorderQty?: number | null;
  purchasePrice?: number | null;
  salePrice?: number | null;
  vatRate?: number | null;
  /** Uniti (non sostituiti): chiave a null = svuotata */
  attributes?: ClientAttributes;
  note?: string | null;
  archived?: boolean;
}
export interface InventoryItemFilters {
  q?: string;
  categoryId?: string;
  itemTypeId?: string;
  /** Solo articoli sotto scorta */
  belowReorder: boolean;
  /** Solo articoli con un lotto in giacenza che scade entro N giorni (scaduti inclusi) */
  expiringWithinDays?: number;
  includeArchived: boolean;
}

export type InventoryMovementType = "carico" | "scarico" | "rettifica" | "reso";
export interface InventoryMovement {
  id: string;
  itemId: string;
  movementType: InventoryMovementType;
  /** Con segno, unità di scarico: + carico/reso/rettifica in, − scarico/rettifica out */
  quantity: number;
  lot: string | null;
  expiryDate: string | null;
  serial: string | null;
  unitCost: number | null;
  /** Codice applicativo del cliente (null se assente o senza permesso clients:read) */
  clientId: string | null;
  clientName: string | null;
  appointmentId: string | null;
  taskId: string | null;
  reason: string | null;
  createdAt: string;
}
export interface CreateInventoryMovementInput {
  movementType: InventoryMovementType;
  /** Sempre positiva: il segno lo applica il backend */
  quantity: number;
  /** Obbligatoria per le rettifiche, vietata per le altre */
  direction?: "in" | "out";
  /** true = quantità espressa in unità di carico (solo articoli frazionabili): convertita con conversionFactor */
  inLoadUnit?: boolean;
  lot?: string;
  expiryDate?: string;  // YYYY-MM-DD
  serial?: string;
  unitCost?: number;
  /** Codice applicativo del cliente (obbligatorio per gli scarichi dei tipi che lo richiedono) */
  clientId?: string;
  reason?: string;
}

// ─── Badge sidebar (contatori reali) ────────────────────────────────────────
// GET /api/badges → SidebarBadges. 0 = nessun badge mostrato.
export interface SidebarBadges {
  /** Clienti creati negli ultimi 7 giorni (chiave `patients` mantenuta: contratto con la sidebar) */
  patients: number;
  /** Somma dei messaggi non letti di tutte le conversazioni */
  chat: number;
  /** Appuntamenti di oggi non ancora iniziati (fuso CALENDAR_TIMEZONE) */
  calendar: number;
  /** Attività aperte (todo + in-progress) con priorità alta */
  tasks: number;
  /** Preventivi da gestire (status pending_ai) */
  quotes: number;
  /** Articoli consumabili sotto scorta minima, non archiviati (inventory:read) */
  inventory: number;
}
