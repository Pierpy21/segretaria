# Moduli: Ordini di lavoro, Richieste, Portale cliente, Recall

Generalizzazione delle funzioni nate per un gommista (progetto Rocchetta) in moduli SegretarIA
**multi-tenant e multi-settore**. Regole di `docs/generalizzazione-segretaria.html` §1 e §4:
niente logica di settore nel codice o in SQL; tutto passa da preset (`vertical_templates`), moduli
(`company_modules`), terminologia (`companies.terms`) e definizioni dei campi (`client_field_definitions`).

Migration: `supabase/migrations/20261112120000_moduli_lavori_portale.sql` (incrementale, unica).
Il database è vuoto: niente backfill complessi, ma la migration resta idempotente rispetto agli studi esistenti
(upgrade dei preset come fatto in 20261024120000_gommista.sql).

## 1. Moduli e permessi (SQL e `lib/auth/permissions.ts` IDENTICI)

| Modulo (`company_modules.module`) | Permessi | Cosa abilita |
|---|---|---|
| `work_orders` | `work_orders:read`, `work_orders:write` | Ordini di lavoro con stato live (officina, gommista, autolavaggio, sartoria…) |
| `requests` | `requests:read`, `requests:write` | Listino servizi + richieste dei clienti (app o desk) + preventivo automatico |
| `customer_portal` | (nessuno: lo usano i clienti finali) | Account cliente, app cliente, notifiche in-app |
| `recalls` | `recalls:manage` | Registro dei richiami ai clienti (anti-duplicati) |

- `permission_module`: work_orders:* → work_orders; requests:* → requests; recalls:* → recalls.
- `system_role_permissions`: owner/admin = catalogo; member = attuali + i 5 nuovi; accountant invariato.
- CHECK `company_modules_module_check` += `work_orders`, `requests`, `customer_portal`, `recalls`.
- Default nei preset esistenti: tutti `false`, tranne quanto indicato al §7.

## 2. Schema cliente (generico)
- `clients.gender` e `clients.date_of_birth` facoltativi (persone giuridiche, clienti registrati dall'app):
  DROP NOT NULL, `clients_gender_check` = `gender IS NULL OR gender IN ('F','M')`.
- `quotes.client_id` (FK composita `(client_id, company_id) → clients(id, company_id)`, nullable) e `quotes.request_id`.
- `calendar_events.client_id` (FK composita nullable) e `calendar_events.asset_id` se non esiste già.
- Vincoli UNIQUE `(id, company_id)` dove servono per le FK composite.
- `client_field_definitions_entity_check` += `'work_order'` (campi di settore sugli ordini di lavoro, es. `km`).

## 3. Tabelle nuove
Tutte: `company_id NOT NULL`, RLS ENABLE + FORCE, trigger `protect_company_id`, `set_updated_at` dove serve,
FK composite su `(x_id, company_id)`, grant minimi (anon: nessuno), indici su FK.

**work_orders** — `id, company_id, client_id, asset_id NULL, request_id NULL, appointment_id NULL, title 1..200,
status CHECK IN ('waiting','in_progress','ready','delivered') default 'waiting', attributes jsonb object (campi entity='work_order'),
inventory_item_id NULL, item_qty int NULL (>0), notes ≤2000, started_at, ready_at, delivered_at, created_by, created_at, updated_at`.
Trigger timestamps (started_at al primo in_progress, ready_at a ready, delivered_at a delivered).
**work_order_events** append-only (scritta solo dal trigger SECURITY DEFINER): `id, company_id, work_order_id, from_status, to_status, changed_by, created_at`.
Trigger AFTER INSERT/UPDATE OF status: evento + (se modulo `customer_portal` attivo e il cliente ha un account) `customer_notifications`
kind `status`, dedupe `work_order:<id>:<status>`. Titolo dalla terminologia dello studio:
`terms.workOrderStatusWaiting|InProgress|Ready|Delivered` con fallback generici
("Richiesta presa in carico", "Lavoro in corso", "Pronto per il ritiro", "Consegnato, grazie!").
RLS: select work_orders:read (+ cliente sui propri); insert/update work_orders:write; delete work_orders:write AND records:manage.

**service_catalog** — listino servizi: `id, company_id, key (regex chiave, UNIQUE(company_id,key)), category (regex chiave, libera),
title 1..120, description ≤500, price numeric(12,2) NULL (NULL = "su richiesta"), duration_minutes 5..600 NULL,
appointment_type_id NULL (FK composita), addon_for_item_type TEXT NULL (chiave di inventory_item_types: il servizio si somma
una volta al preventivo automatico di un articolo di quel tipo, es. montaggio per i pneumatici), public BOOLEAN default true
(mostrato nel catalogo pubblico), active, position, created_at, updated_at`.
RLS: select membri dello studio + cliente collegato; CUD settings:manage.

**service_requests** — `id, company_id, client_id, asset_id NULL, kind CHECK IN ('quote','appointment','info'),
status CHECK IN ('new','auto_quoted','quoted','confirmed','declined','closed') default 'new',
item jsonb NULL (snapshot {source:'service'|'inventory', id, title, price, qty}), message ≤1000, preferred_date NULL,
auto_quote jsonb NULL ({available, qty, unitPrice, addonPrice, total, reason}), quote_id NULL, appointment_id NULL,
source CHECK IN ('portal','desk') default 'desk', handled_by NULL, created_at, updated_at`.
RLS: staff select requests:read, insert/update requests:write; cliente select propri. Dal portale solo via RPC.

**client_accounts** — `id, user_id → auth.users ON DELETE CASCADE, company_id, client_id, created_at, revoked_at`,
UNIQUE(company_id, user_id). Un utente può essere cliente di più studi; non può essere cliente dello studio di cui è membro.
RLS select: `user_id = auth.uid()` OR clients:read. Nessuna scrittura diretta (solo RPC; revoca via staff con clients:write → RPC `revoke_client_account`).

**customer_notifications** — `id, company_id, client_id, kind CHECK IN ('status','reminder','recall','quote','request','info'),
title 1..160, body ≤1000, link NULL, dedupe_key NULL, read_at, created_at`, UNIQUE(company_id, client_id, dedupe_key).
RLS: cliente select propri; staff select requests:read OR work_orders:read OR recalls:manage; insert requests:write OR work_orders:write OR recalls:manage.

**client_documents** — documenti dei clienti/beni (es. libretto di circolazione, ma generico):
`id, company_id, client_id, asset_id NULL, kind (regex chiave, es. 'libretto'), storage_path UNIQUE, mime_type, size_bytes, uploaded_by, created_at`.
`storage_path` deve iniziare con `<company_id>/<client_id>/`. RLS: staff select clients:read, insert/delete clients:write;
cliente select propri; insert cliente solo via RPC.
Storage: bucket privato `client-documents` (10 MB, jpg/png/webp/pdf), creato solo se lo schema storage esiste;
policy su storage.objects: staff (clients:read select, clients:write insert) sul primo segmento; cliente insert/select sotto `<company>/<client>/` dei propri link.

**recall_log** — `id, company_id, client_id, asset_id NULL, kind (regex chiave libera: le regole stanno nel data layer, configurate per studio),
period_key 1..120, channel CHECK IN ('whatsapp','in_app','email','sms'), sent_by, sent_at`,
UNIQUE(company_id, client_id, kind, period_key, channel). RLS: recalls:manage.

## 4. Impostazioni dello studio
`companies.custom_metadata`: `auto_quote` (bool, preventivo automatico inviato senza conferma del desk). Il portale si accende col modulo `customer_portal`.
Nessun vincolo "studio unico" e nessun "studio portale unico": ogni studio ha il suo portale, identificato dallo `slug`.

## 5. RPC (SECURITY DEFINER, `search_path = ''`, REVOKE PUBLIC/anon, GRANT authenticated salvo indicato)
Tutte ricevono lo studio esplicitamente e verificano: modulo `customer_portal` attivo, `auth.uid()`, link attivo in client_accounts.
- `get_portal_company(p_slug)` (anon) → `{id, name, slug, sector, terms}` solo se il portale è attivo.
- `get_public_catalog(p_company_id)` (anon) → servizi `active AND public` + articoli di magazzino di tipo `sellable` con giacenza > 0 e prezzo:
  `{kind:'service'|'item', id, category, title, description, price, stock, item_type, attributes}` (solo attributi non sensibili). Solo se portale attivo.
- `register_customer(p_company_id, p_first_name, p_last_name, p_phone)` → client_id. Crea la scheda (client_type = settore dello studio,
  email da auth.users, code come `lib/data/clients.ts`) e il link. 23505 se già collegato; 42501 se membro dello studio.
- `customer_add_asset(p_company_id, p_asset_type, p_name, p_identifier, p_attributes)` → asset_id. Tipo e chiavi ammessi solo se definiti
  (`entity='asset'`, non sensibili); identifier normalizzato (trim, maiuscolo) e unico nello studio per quel tipo.
- `customer_update_asset(p_company_id, p_asset_id, p_attributes)` → merge delle sole chiavi definite e non sensibili.
- `customer_add_document(p_company_id, p_asset_id, p_kind, p_path, p_mime, p_size)` → document_id (path sotto i propri prefissi).
- `customer_create_request(p_company_id, p_kind, p_asset_id, p_item_source, p_item_id, p_qty, p_message, p_preferred_date)` → request_id.
  **Il preventivo automatico è calcolato qui, mai ricevuto dal client**: servizio → prezzo listino (NULL → available=false);
  articolo → available se giacenza ≥ qty, total = qty × sale_price + somma dei servizi attivi con `addon_for_item_type` = tipo dell'articolo.
  Se available → status 'auto_quoted'; se inoltre `custom_metadata.auto_quote = true` → crea subito il preventivo
  (`quotes` 'quote_sent', is_ai_generated, client_id, request_id, asset_id), request 'quoted', notifica 'quote'.
- `customer_respond_quote(p_quote_id, p_decision 'approved'|'declined')` solo su preventivi propri in 'quote_sent'.
- `customer_mark_notifications_read(p_company_id, p_ids uuid[])` (max 200).
- `revoke_client_account(p_company_id, p_client_id)` (staff con clients:write).

## 6. Helper
`get_my_client_links()` → (company_id, client_id) attivi; `is_my_client(company, client)`; `has_client_link(company)`;
`is_module_enabled(company, module)` (riga assente = attivo, come in TS) se non esiste già. Policy di lettura cliente sulle tabelle esistenti:
clients, client_assets, client_field_definitions (non sensibili), quotes, calendar_events, service_catalog.

## 7. Preset
`apply_vertical_template` += `services` (righe di service_catalog, ON CONFLICT DO NOTHING) e `roles` (company_roles personalizzati, ON CONFLICT DO NOTHING).
Nuove versioni dei preset (INSERT version+1, payload = precedente + novità; upgrade degli studi esistenti solo con le novità):
- **gommista** v2: moduli work_orders, requests, customer_portal, recalls = true; appuntamenti + revisione, inversione, assetto;
  campi veicolo + misura_gomme, scadenza_revisione (date), km_riferimento_inversione; campo work_order `km`;
  servizi montaggio (category 'gomme', addon_for_item_type 'pneumatici', public false), convergenza, equilibratura, inversione, revisione (prezzi NULL);
  ruolo `officina` (work_orders:read/write, clients:read, calendar:read); terms memberTitle "Desk", workOrdersLabel "Attività officina",
  workOrderStatus* ("Auto ricevuta in officina", "La tua auto è in lavorazione", "Auto pronta al ritiro!", "Auto riconsegnata, grazie!").
- **officina** v2: work_orders, requests = true; customer_portal, recalls = false; campo work_order `km`; ruolo `officina`; terms come sopra.
- **autolavaggio** v2: work_orders = true; terms workOrdersLabel "Lavaggi" e stati adatti.
- Altri preset: invariati (moduli nuovi assenti = gestiti dal default TS `false`).

## 8. TypeScript (allineamento, nessuna logica di settore)
`lib/auth/permissions.ts` (PERMISSIONS, MEMBER_PERMISSIONS, ROLE_PERMISSIONS, PERMISSION_MODULE, MODULE_KEYS, DEFAULT_MODULES con i nuovi = false),
`app/types/settings.ts` (ModuleKey), `lib/validation.ts` (MODULE_KEY_SET), etichette moduli nella card impostazioni, terms nuovi in `lib/terms.ts`,
`app/types/clients.ts` + `lib/data/clients.ts` (gender/dateOfBirth/age nullable), `drizzle/schema.ts` + `relations.ts`,
`lib/db.ts`/`getMe`: un utente senza membership ma con client_accounts è `kind: 'customer'` e non va all'onboarding.
Il data layer e le API dei moduli (lib/data/work-orders.ts, requests.ts, customer.ts, recalls.ts) sono un passo successivo.

## 9. Test
`supabase/tests/rls_moduli_lavori_portale.sql` (o .sh come in Rocchetta): owner, member, accountant, ruolo officina, cliente A vs cliente B
(stesso studio e studi diversi), anon; verifica isolamento tra due studi.
