-- ============================================================================
-- Migration: moduli_lavori_portale
-- Description:
--   1. Permessi e moduli: work_orders, requests, customer_portal, recalls.
--      Catalogo, ruoli di sistema, permesso→modulo e CHECK moduli allineati a
--      docs/MODULI_LAVORI_PORTALE.md §1. module_enabled: un modulo nuovo senza riga
--      è spento (come DEFAULT_MODULES in TS); i moduli esistenti restano accesi.
--   2. Schema cliente: clients.gender/date_of_birth facoltativi; quotes.client_id/request_id;
--      calendar_events.client_id; client_field_definitions.entity += 'work_order'.
--   3. Tabelle: work_orders + work_order_events, service_catalog, service_requests,
--      client_accounts, customer_notifications, client_documents (+ bucket), recall_log.
--   4. Helper di accesso cliente: get_my_client_links, is_my_client, has_client_link.
--   5. Trigger ordini: timestamp derivati dallo stato, evento di stato, notifica cliente.
--   6. RLS (ENABLE + FORCE) e grant espliciti (anon: nessuno).
--   7. RPC SECURITY DEFINER con studio esplicito (search_path vuoto).
--   8. Preset: apply_vertical_template con services e roles; gommista, officina,
--      autolavaggio v2; upgrade degli studi esistenti solo con le novità.
-- Depends on: 20261024140000_settori_officina_parrucchiere_autolavaggio.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Permessi e moduli (DEVE restare allineato a lib/auth/permissions.ts)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.permission_catalog()
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    'clients:read', 'clients:write', 'sensitive:read', 'sensitive:write',
    'chat:read', 'chat:write', 'calendar:read', 'calendar:write',
    'reminders:read', 'reminders:write', 'tasks:read', 'tasks:write',
    'quotes:read', 'quotes:write', 'payments:read', 'payments:write',
    'inventory:read', 'inventory:write',
    'work_orders:read', 'work_orders:write', 'requests:read', 'requests:write', 'recalls:manage',
    'reports:read', 'records:manage', 'settings:manage', 'members:manage'
  ]::TEXT[];
$$;

-- member = attuali + i 5 nuovi; accountant invariato; owner/admin = catalogo.
CREATE OR REPLACE FUNCTION public.system_role_permissions(p_role TEXT)
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_role
    WHEN 'owner'  THEN public.permission_catalog()
    WHEN 'admin'  THEN public.permission_catalog()
    WHEN 'member' THEN ARRAY[
      'clients:read', 'clients:write', 'sensitive:read', 'sensitive:write',
      'chat:read', 'chat:write', 'calendar:read', 'calendar:write',
      'reminders:read', 'reminders:write', 'tasks:read', 'tasks:write',
      'quotes:read', 'quotes:write', 'payments:read', 'payments:write',
      'inventory:read', 'inventory:write',
      'work_orders:read', 'work_orders:write', 'requests:read', 'requests:write', 'recalls:manage',
      'reports:read'
    ]::TEXT[]
    WHEN 'accountant' THEN ARRAY[
      'clients:read', 'quotes:read', 'quotes:write',
      'payments:read', 'payments:write', 'inventory:read',
      'reports:read', 'records:manage'
    ]::TEXT[]
    ELSE ARRAY[]::TEXT[]
  END;
$$;

CREATE OR REPLACE FUNCTION public.permission_module(p_permission TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE split_part(p_permission, ':', 1)
    WHEN 'calendar'    THEN 'agenda'
    WHEN 'reminders'   THEN 'agenda'
    WHEN 'chat'        THEN 'chat'
    WHEN 'tasks'       THEN 'maintenance'
    WHEN 'quotes'      THEN 'quotes'
    WHEN 'sensitive'   THEN 'sensitive_data'
    WHEN 'inventory'   THEN 'inventory'
    WHEN 'work_orders' THEN 'work_orders'
    WHEN 'requests'    THEN 'requests'
    WHEN 'recalls'     THEN 'recalls'
    ELSE NULL
  END;
$$;

-- Riga assente = attivo per i moduli esistenti; spento per i moduli nuovi (DEFAULT_MODULES = false).
CREATE OR REPLACE FUNCTION public.module_enabled(p_company_id UUID, p_module TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_module IS NULL OR coalesce(
    (SELECT cm.enabled FROM public.company_modules cm
     WHERE cm.company_id = p_company_id AND cm.module = p_module),
    p_module NOT IN ('work_orders', 'requests', 'customer_portal', 'recalls')
  );
$$;

ALTER TABLE public.company_modules DROP CONSTRAINT company_modules_module_check;
ALTER TABLE public.company_modules
  ADD CONSTRAINT company_modules_module_check CHECK (
    module IN ('agenda', 'chat', 'quotes', 'maintenance', 'sensitive_data', 'assets', 'ai_assistant',
               'inventory', 'work_orders', 'requests', 'customer_portal', 'recalls')
  );

-- ----------------------------------------------------------------------------
-- 2. Schema cliente
-- ----------------------------------------------------------------------------
ALTER TABLE public.clients ALTER COLUMN gender DROP NOT NULL;
ALTER TABLE public.clients DROP CONSTRAINT clients_gender_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_gender_check CHECK (gender IS NULL OR gender IN ('F', 'M'));
ALTER TABLE public.clients ALTER COLUMN date_of_birth DROP NOT NULL;

-- Vincoli di supporto per le FK composite.
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_id_company_id_key UNIQUE (id, company_id);

ALTER TABLE public.quotes
  ADD COLUMN client_id  UUID,
  ADD COLUMN request_id UUID,
  ADD CONSTRAINT quotes_client_fkey FOREIGN KEY (client_id, company_id)
    REFERENCES public.clients(id, company_id) ON DELETE SET NULL (client_id);
CREATE INDEX idx_quotes_client  ON public.quotes(company_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_quotes_request ON public.quotes(company_id, request_id) WHERE request_id IS NOT NULL;

ALTER TABLE public.calendar_events ADD COLUMN client_id UUID;
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_client_fkey FOREIGN KEY (client_id, company_id)
    REFERENCES public.clients(id, company_id) ON DELETE SET NULL (client_id);
CREATE INDEX idx_calendar_events_client ON public.calendar_events(company_id, client_id)
  WHERE client_id IS NOT NULL;

ALTER TABLE public.client_field_definitions DROP CONSTRAINT client_field_definitions_entity_check;
ALTER TABLE public.client_field_definitions
  ADD CONSTRAINT client_field_definitions_entity_check CHECK (entity IN ('client', 'asset', 'item', 'work_order'));

-- Un bene identificato (es. targa) è unico nello studio per tipo.
CREATE UNIQUE INDEX client_assets_identifier_uniq
  ON public.client_assets(company_id, asset_type, identifier)
  WHERE identifier IS NOT NULL AND archived_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3a. client_accounts: utente ↔ scheda cliente (solo RPC scrivono)
--     Un utente può essere cliente di più studi, non dello studio di cui è membro.
-- ----------------------------------------------------------------------------
CREATE TABLE public.client_accounts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id   UUID        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ,

  CONSTRAINT client_accounts_company_id_user_id_key UNIQUE (company_id, user_id),
  CONSTRAINT client_accounts_client_fkey FOREIGN KEY (client_id, company_id)
    REFERENCES public.clients(id, company_id) ON DELETE CASCADE
);

CREATE INDEX idx_client_accounts_user   ON public.client_accounts(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_client_accounts_client ON public.client_accounts(company_id, client_id);

CREATE TRIGGER trg_client_accounts_immutable_company_id
  BEFORE UPDATE ON public.client_accounts
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

CREATE OR REPLACE FUNCTION public.client_account_staff_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = NEW.company_id AND m.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Account dello staff: non collegabile come cliente dello stesso studio'
      USING ERRCODE = '42501', CONSTRAINT = 'client_accounts_staff_member';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_client_accounts_staff_guard
  BEFORE INSERT ON public.client_accounts
  FOR EACH ROW EXECUTE FUNCTION public.client_account_staff_guard();

-- ----------------------------------------------------------------------------
-- 4. Helper di accesso cliente (SECURITY DEFINER: non dipendono dalla RLS di client_accounts).
--    Il link è attivo se non revocato E il modulo customer_portal dello studio è acceso.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_client_links()
RETURNS TABLE (company_id UUID, client_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ca.company_id, ca.client_id
  FROM public.client_accounts ca
  WHERE ca.user_id = (SELECT auth.uid())
    AND ca.revoked_at IS NULL
    AND public.module_enabled(ca.company_id, 'customer_portal');
$$;

CREATE OR REPLACE FUNCTION public.is_my_client(p_company_id UUID, p_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_accounts ca
    WHERE ca.company_id = p_company_id
      AND ca.client_id = p_client_id
      AND ca.user_id = (SELECT auth.uid())
      AND ca.revoked_at IS NULL
      AND public.module_enabled(ca.company_id, 'customer_portal')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_client_link(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_accounts ca
    WHERE ca.company_id = p_company_id
      AND ca.user_id = (SELECT auth.uid())
      AND ca.revoked_at IS NULL
      AND public.module_enabled(ca.company_id, 'customer_portal')
  );
$$;

-- Link del cliente corrente nello studio indicato; solleva 42501 se non valido.
CREATE OR REPLACE FUNCTION public.customer_client_id(p_company_id UUID)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client UUID;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta' USING ERRCODE = '42501';
  END IF;
  IF p_company_id IS NULL OR NOT public.module_enabled(p_company_id, 'customer_portal') THEN
    RAISE EXCEPTION 'Portale clienti non attivo per questo studio' USING ERRCODE = '42501';
  END IF;
  SELECT l.client_id INTO v_client
  FROM public.get_my_client_links() AS l
  WHERE l.company_id = p_company_id;
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Cliente non collegato allo studio' USING ERRCODE = '42501';
  END IF;
  RETURN v_client;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3b. service_catalog: listino. price NULL = "su richiesta".
--     addon_for_item_type: il servizio si somma una volta al preventivo di un articolo di quel tipo.
-- ----------------------------------------------------------------------------
CREATE TABLE public.service_catalog (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID          NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key                 TEXT          NOT NULL,
  category            TEXT          NOT NULL,
  title               TEXT          NOT NULL,
  description         TEXT          NOT NULL DEFAULT '',
  price               NUMERIC(12,2),
  duration_minutes    INTEGER,
  appointment_type_id UUID,
  addon_for_item_type TEXT,
  "public"            BOOLEAN       NOT NULL DEFAULT true,
  active              BOOLEAN       NOT NULL DEFAULT true,
  position            INTEGER       NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT service_catalog_company_key_unique UNIQUE (company_id, key),
  CONSTRAINT service_catalog_id_company_id_key UNIQUE (id, company_id),
  CONSTRAINT service_catalog_appointment_type_fkey FOREIGN KEY (appointment_type_id, company_id)
    REFERENCES public.company_appointment_types(id, company_id) ON DELETE SET NULL (appointment_type_id),
  CONSTRAINT service_catalog_addon_type_fkey FOREIGN KEY (company_id, addon_for_item_type)
    REFERENCES public.inventory_item_types(company_id, key) ON DELETE SET NULL (addon_for_item_type),
  CONSTRAINT service_catalog_key_format CHECK (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  CONSTRAINT service_catalog_category_format CHECK (category ~ '^[a-z][a-z0-9_]{0,62}$'),
  CONSTRAINT service_catalog_addon_format CHECK (
    addon_for_item_type IS NULL OR addon_for_item_type ~ '^[a-z][a-z0-9_]{0,62}$'
  ),
  CONSTRAINT service_catalog_title_length CHECK (char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT service_catalog_description_length CHECK (char_length(description) <= 500),
  CONSTRAINT service_catalog_price_nonneg CHECK (price IS NULL OR price >= 0),
  CONSTRAINT service_catalog_duration_range CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 600)
);

CREATE INDEX idx_service_catalog_company ON public.service_catalog(company_id, position);
CREATE INDEX idx_service_catalog_appointment_type ON public.service_catalog(appointment_type_id)
  WHERE appointment_type_id IS NOT NULL;
CREATE INDEX idx_service_catalog_addon ON public.service_catalog(company_id, addon_for_item_type)
  WHERE addon_for_item_type IS NOT NULL;

CREATE TRIGGER trg_service_catalog_updated_at
  BEFORE UPDATE ON public.service_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_service_catalog_immutable_company_id
  BEFORE UPDATE ON public.service_catalog
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

-- ----------------------------------------------------------------------------
-- 3c. service_requests: richieste (dal portale solo via RPC; dal desk con requests:write).
-- ----------------------------------------------------------------------------
CREATE TABLE public.service_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id       UUID        NOT NULL,
  asset_id        UUID,
  kind            TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'new',
  item            JSONB,
  message         TEXT,
  preferred_date  DATE,
  auto_quote      JSONB,
  quote_id        UUID,
  appointment_id  UUID,
  source          TEXT        NOT NULL DEFAULT 'desk',
  handled_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT service_requests_id_company_id_key UNIQUE (id, company_id),
  CONSTRAINT service_requests_client_fkey FOREIGN KEY (client_id, company_id)
    REFERENCES public.clients(id, company_id) ON DELETE CASCADE,
  CONSTRAINT service_requests_asset_fkey FOREIGN KEY (asset_id, company_id)
    REFERENCES public.client_assets(id, company_id) ON DELETE SET NULL (asset_id),
  CONSTRAINT service_requests_quote_fkey FOREIGN KEY (quote_id, company_id)
    REFERENCES public.quotes(id, company_id) ON DELETE SET NULL (quote_id),
  CONSTRAINT service_requests_appointment_fkey FOREIGN KEY (appointment_id, company_id)
    REFERENCES public.calendar_events(id, company_id) ON DELETE SET NULL (appointment_id),
  CONSTRAINT service_requests_kind_check CHECK (kind IN ('quote', 'appointment', 'info')),
  CONSTRAINT service_requests_status_check CHECK (
    status IN ('new', 'auto_quoted', 'quoted', 'confirmed', 'declined', 'closed')
  ),
  CONSTRAINT service_requests_source_check CHECK (source IN ('portal', 'desk')),
  CONSTRAINT service_requests_item_object CHECK (item IS NULL OR jsonb_typeof(item) = 'object'),
  CONSTRAINT service_requests_item_source CHECK (
    item IS NULL OR coalesce(item ->> 'source', '') IN ('service', 'inventory')
  ),
  CONSTRAINT service_requests_auto_quote_object CHECK (
    auto_quote IS NULL OR jsonb_typeof(auto_quote) = 'object'
  ),
  CONSTRAINT service_requests_message_length CHECK (message IS NULL OR char_length(message) <= 1000)
);

CREATE INDEX idx_service_requests_company_status ON public.service_requests(company_id, status, created_at DESC);
CREATE INDEX idx_service_requests_client         ON public.service_requests(company_id, client_id);
CREATE INDEX idx_service_requests_asset          ON public.service_requests(company_id, asset_id) WHERE asset_id IS NOT NULL;
CREATE INDEX idx_service_requests_quote          ON public.service_requests(company_id, quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX idx_service_requests_appointment    ON public.service_requests(company_id, appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX idx_service_requests_handled_by     ON public.service_requests(handled_by) WHERE handled_by IS NOT NULL;

CREATE TRIGGER trg_service_requests_updated_at
  BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_service_requests_immutable_company_id
  BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_request_fkey FOREIGN KEY (request_id, company_id)
    REFERENCES public.service_requests(id, company_id) ON DELETE SET NULL (request_id);

-- ----------------------------------------------------------------------------
-- 3d. work_orders: ordini di lavoro con stato live.
--     started_at = primo in_progress; ready_at / delivered_at = ingresso nello stato.
--     I timestamp sono derivati dallo stato: non scrivibili direttamente.
-- ----------------------------------------------------------------------------
CREATE TABLE public.work_orders (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id         UUID        NOT NULL,
  asset_id          UUID,
  request_id        UUID,
  appointment_id    UUID,
  title             TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'waiting',
  attributes        JSONB       NOT NULL DEFAULT '{}',
  inventory_item_id UUID,
  item_qty          INTEGER,
  notes             TEXT,
  started_at        TIMESTAMPTZ,
  ready_at          TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  created_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT work_orders_id_company_id_key UNIQUE (id, company_id),
  CONSTRAINT work_orders_client_fkey FOREIGN KEY (client_id, company_id)
    REFERENCES public.clients(id, company_id) ON DELETE CASCADE,
  CONSTRAINT work_orders_asset_fkey FOREIGN KEY (asset_id, company_id)
    REFERENCES public.client_assets(id, company_id) ON DELETE SET NULL (asset_id),
  CONSTRAINT work_orders_request_fkey FOREIGN KEY (request_id, company_id)
    REFERENCES public.service_requests(id, company_id) ON DELETE SET NULL (request_id),
  CONSTRAINT work_orders_appointment_fkey FOREIGN KEY (appointment_id, company_id)
    REFERENCES public.calendar_events(id, company_id) ON DELETE SET NULL (appointment_id),
  CONSTRAINT work_orders_item_fkey FOREIGN KEY (inventory_item_id, company_id)
    REFERENCES public.inventory_items(id, company_id) ON DELETE SET NULL (inventory_item_id),
  CONSTRAINT work_orders_status_check CHECK (status IN ('waiting', 'in_progress', 'ready', 'delivered')),
  CONSTRAINT work_orders_title_length CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT work_orders_attributes_object CHECK (jsonb_typeof(attributes) = 'object'),
  CONSTRAINT work_orders_item_qty_positive CHECK (item_qty IS NULL OR item_qty > 0),
  CONSTRAINT work_orders_notes_length CHECK (notes IS NULL OR char_length(notes) <= 2000)
);

CREATE INDEX idx_work_orders_company_status ON public.work_orders(company_id, status);
CREATE INDEX idx_work_orders_client         ON public.work_orders(company_id, client_id);
CREATE INDEX idx_work_orders_asset          ON public.work_orders(company_id, asset_id) WHERE asset_id IS NOT NULL;
CREATE INDEX idx_work_orders_request        ON public.work_orders(company_id, request_id) WHERE request_id IS NOT NULL;
CREATE INDEX idx_work_orders_appointment    ON public.work_orders(company_id, appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX idx_work_orders_item           ON public.work_orders(company_id, inventory_item_id) WHERE inventory_item_id IS NOT NULL;
CREATE INDEX idx_work_orders_created_by     ON public.work_orders(created_by);

-- ----------------------------------------------------------------------------
-- 3e. work_order_events: registro append-only (scritto solo dal trigger).
-- ----------------------------------------------------------------------------
CREATE TABLE public.work_order_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  work_order_id UUID        NOT NULL,
  from_status   TEXT,
  to_status     TEXT        NOT NULL,
  changed_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT work_order_events_work_order_fkey FOREIGN KEY (work_order_id, company_id)
    REFERENCES public.work_orders(id, company_id) ON DELETE CASCADE,
  CONSTRAINT work_order_events_from_check CHECK (
    from_status IS NULL OR from_status IN ('waiting', 'in_progress', 'ready', 'delivered')
  ),
  CONSTRAINT work_order_events_to_check CHECK (
    to_status IN ('waiting', 'in_progress', 'ready', 'delivered')
  )
);

CREATE INDEX idx_work_order_events_order      ON public.work_order_events(work_order_id, created_at);
CREATE INDEX idx_work_order_events_company    ON public.work_order_events(company_id);
CREATE INDEX idx_work_order_events_changed_by ON public.work_order_events(changed_by);

CREATE TRIGGER trg_work_order_events_immutable_company_id
  BEFORE UPDATE ON public.work_order_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

-- ----------------------------------------------------------------------------
-- 3f. customer_notifications: notifiche in-app (polling).
-- ----------------------------------------------------------------------------
CREATE TABLE public.customer_notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id   UUID        NOT NULL,
  kind        TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  body        TEXT,
  link        TEXT,
  dedupe_key  TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT customer_notifications_client_fkey FOREIGN KEY (client_id, company_id)
    REFERENCES public.clients(id, company_id) ON DELETE CASCADE,
  CONSTRAINT customer_notifications_dedupe_unique UNIQUE (company_id, client_id, dedupe_key),
  CONSTRAINT customer_notifications_kind_check CHECK (
    kind IN ('status', 'reminder', 'recall', 'quote', 'request', 'info')
  ),
  CONSTRAINT customer_notifications_title_length CHECK (char_length(title) BETWEEN 1 AND 160),
  CONSTRAINT customer_notifications_body_length CHECK (body IS NULL OR char_length(body) <= 1000),
  CONSTRAINT customer_notifications_link_format CHECK (
    link IS NULL OR (link LIKE '/%' AND link NOT LIKE '//%' AND char_length(link) <= 500)
  )
);

CREATE INDEX idx_customer_notifications_client ON public.customer_notifications(company_id, client_id, created_at DESC);

CREATE TRIGGER trg_customer_notifications_immutable_company_id
  BEFORE UPDATE ON public.customer_notifications
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

-- ----------------------------------------------------------------------------
-- 3g. client_documents: documenti di clienti/beni. Il percorso è sotto <company>/<client>/.
-- ----------------------------------------------------------------------------
CREATE TABLE public.client_documents (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id    UUID        NOT NULL,
  asset_id     UUID,
  kind         TEXT        NOT NULL,
  storage_path TEXT        NOT NULL,
  mime_type    TEXT        NOT NULL,
  size_bytes   INTEGER     NOT NULL,
  uploaded_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT client_documents_storage_path_key UNIQUE (storage_path),
  CONSTRAINT client_documents_client_fkey FOREIGN KEY (client_id, company_id)
    REFERENCES public.clients(id, company_id) ON DELETE CASCADE,
  CONSTRAINT client_documents_asset_fkey FOREIGN KEY (asset_id, company_id)
    REFERENCES public.client_assets(id, company_id) ON DELETE SET NULL (asset_id),
  CONSTRAINT client_documents_kind_format CHECK (kind ~ '^[a-z][a-z0-9_]{0,62}$'),
  CONSTRAINT client_documents_mime_check CHECK (
    mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  CONSTRAINT client_documents_size_check CHECK (size_bytes BETWEEN 1 AND 10485760),
  CONSTRAINT client_documents_path_prefix CHECK (
    starts_with(storage_path, company_id::TEXT || '/' || client_id::TEXT || '/')
  )
);

CREATE INDEX idx_client_documents_client ON public.client_documents(company_id, client_id);
CREATE INDEX idx_client_documents_asset  ON public.client_documents(company_id, asset_id) WHERE asset_id IS NOT NULL;
CREATE INDEX idx_client_documents_uploaded_by ON public.client_documents(uploaded_by);

CREATE TRIGGER trg_client_documents_immutable_company_id
  BEFORE UPDATE ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

-- ----------------------------------------------------------------------------
-- 3h. recall_log: registro dei richiami (anti-duplicati). Regole di kind nel data layer.
-- ----------------------------------------------------------------------------
CREATE TABLE public.recall_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id   UUID        NOT NULL,
  asset_id    UUID,
  kind        TEXT        NOT NULL,
  period_key  TEXT        NOT NULL,
  channel     TEXT        NOT NULL,
  sent_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT recall_log_client_fkey FOREIGN KEY (client_id, company_id)
    REFERENCES public.clients(id, company_id) ON DELETE CASCADE,
  CONSTRAINT recall_log_asset_fkey FOREIGN KEY (asset_id, company_id)
    REFERENCES public.client_assets(id, company_id) ON DELETE SET NULL (asset_id),
  CONSTRAINT recall_log_unique UNIQUE (company_id, client_id, kind, period_key, channel),
  CONSTRAINT recall_log_kind_format CHECK (kind ~ '^[a-z][a-z0-9_]{0,62}$'),
  CONSTRAINT recall_log_channel_check CHECK (channel IN ('whatsapp', 'in_app', 'email', 'sms')),
  CONSTRAINT recall_log_period_length CHECK (char_length(period_key) BETWEEN 1 AND 120)
);

CREATE INDEX idx_recall_log_sent_by ON public.recall_log(sent_by);
CREATE INDEX idx_recall_log_asset   ON public.recall_log(company_id, asset_id) WHERE asset_id IS NOT NULL;

CREATE TRIGGER trg_recall_log_immutable_company_id
  BEFORE UPDATE ON public.recall_log
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

-- ----------------------------------------------------------------------------
-- 5. Trigger degli ordini
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_order_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.started_at   := CASE WHEN NEW.status = 'in_progress' THEN now() END;
    NEW.ready_at     := CASE WHEN NEW.status = 'ready' THEN now() END;
    NEW.delivered_at := CASE WHEN NEW.status = 'delivered' THEN now() END;
    RETURN NEW;
  END IF;

  -- UPDATE: i timestamp seguono lo stato; una scrittura diretta viene ignorata.
  NEW.started_at := coalesce(OLD.started_at,
                             CASE WHEN NEW.status = 'in_progress' THEN now() END);
  NEW.ready_at := CASE WHEN NEW.status = 'ready' AND NEW.status IS DISTINCT FROM OLD.status
                       THEN now() ELSE OLD.ready_at END;
  NEW.delivered_at := CASE WHEN NEW.status = 'delivered' AND NEW.status IS DISTINCT FROM OLD.status
                           THEN now() ELSE OLD.delivered_at END;
  RETURN NEW;
END;
$$;

-- Evento di stato + notifica al cliente (solo se il portale è attivo e il cliente ha un account).
-- Titoli dalla terminologia dello studio, con fallback generici.
CREATE OR REPLACE FUNCTION public.work_order_status_event()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_terms JSONB;
  v_title TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.work_order_events (company_id, work_order_id, from_status, to_status, changed_by)
  VALUES (
    NEW.company_id,
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
    NEW.status,
    (SELECT auth.uid())
  );

  IF NOT public.module_enabled(NEW.company_id, 'customer_portal') THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.client_accounts ca
    WHERE ca.company_id = NEW.company_id AND ca.client_id = NEW.client_id AND ca.revoked_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;

  SELECT c.terms INTO v_terms FROM public.companies c WHERE c.id = NEW.company_id;

  v_title := left(coalesce(
    nullif(btrim(CASE NEW.status
      WHEN 'waiting'     THEN v_terms ->> 'workOrderStatusWaiting'
      WHEN 'in_progress' THEN v_terms ->> 'workOrderStatusInProgress'
      WHEN 'ready'       THEN v_terms ->> 'workOrderStatusReady'
      WHEN 'delivered'   THEN v_terms ->> 'workOrderStatusDelivered'
    END), ''),
    CASE NEW.status
      WHEN 'waiting'     THEN 'Richiesta presa in carico'
      WHEN 'in_progress' THEN 'Lavoro in corso'
      WHEN 'ready'       THEN 'Pronto per il ritiro'
      ELSE 'Consegnato, grazie!'
    END), 160);

  INSERT INTO public.customer_notifications (company_id, client_id, kind, title, dedupe_key)
  VALUES (NEW.company_id, NEW.client_id, 'status', v_title,
          'work_order:' || NEW.id::TEXT || ':' || NEW.status)
  ON CONFLICT (company_id, client_id, dedupe_key) DO NOTHING;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_work_orders_created_by
  BEFORE INSERT ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

CREATE TRIGGER trg_work_orders_immutable_created_by
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_created_by();

CREATE TRIGGER trg_work_orders_immutable_company_id
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

CREATE TRIGGER trg_work_orders_updated_at
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_work_orders_timestamps
  BEFORE INSERT OR UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.work_order_timestamps();

CREATE TRIGGER trg_work_orders_status_event
  AFTER INSERT OR UPDATE OF status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.work_order_status_event();

-- ----------------------------------------------------------------------------
-- 6. RLS (ENABLE + FORCE). Policy dello staff con has_permission; cliente solo sui propri dati.
-- ----------------------------------------------------------------------------
ALTER TABLE public.client_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_accounts        FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.service_catalog        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_catalog        FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.service_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests       FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.work_orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders            FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.work_order_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_events      FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_notifications FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.client_documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_documents       FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.recall_log             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recall_log             FORCE  ROW LEVEL SECURITY;

-- client_accounts: il cliente vede il proprio link; lo staff con clients:read. Nessuna scrittura diretta.
CREATE POLICY "client_accounts_select" ON public.client_accounts
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR public.has_permission(company_id, 'clients:read')
  );

-- service_catalog: membri dello studio; cliente collegato solo sui servizi attivi e pubblici.
CREATE POLICY "service_catalog_select" ON public.service_catalog
  FOR SELECT USING (
    company_id IN (SELECT public.get_my_company_ids())
    OR (public.has_client_link(company_id) AND active AND "public")
  );
CREATE POLICY "service_catalog_insert" ON public.service_catalog
  FOR INSERT WITH CHECK (public.has_permission(company_id, 'settings:manage'));
CREATE POLICY "service_catalog_update" ON public.service_catalog
  FOR UPDATE USING (public.has_permission(company_id, 'settings:manage'))
  WITH CHECK (public.has_permission(company_id, 'settings:manage'));
CREATE POLICY "service_catalog_delete" ON public.service_catalog
  FOR DELETE USING (public.has_permission(company_id, 'settings:manage'));

-- service_requests: staff con requests:read; cliente vede le proprie. Insert/update dallo staff.
CREATE POLICY "service_requests_select" ON public.service_requests
  FOR SELECT USING (
    public.has_permission(company_id, 'requests:read')
    OR public.is_my_client(company_id, client_id)
  );
CREATE POLICY "service_requests_insert" ON public.service_requests
  FOR INSERT WITH CHECK (public.has_permission(company_id, 'requests:write'));
CREATE POLICY "service_requests_update" ON public.service_requests
  FOR UPDATE USING (public.has_permission(company_id, 'requests:write'))
  WITH CHECK (public.has_permission(company_id, 'requests:write'));

-- work_orders: staff con work_orders:read; cliente vede i propri. Cancellazione con records:manage.
CREATE POLICY "work_orders_select" ON public.work_orders
  FOR SELECT USING (
    public.has_permission(company_id, 'work_orders:read')
    OR public.is_my_client(company_id, client_id)
  );
CREATE POLICY "work_orders_insert" ON public.work_orders
  FOR INSERT WITH CHECK (public.has_permission(company_id, 'work_orders:write'));
CREATE POLICY "work_orders_update" ON public.work_orders
  FOR UPDATE USING (public.has_permission(company_id, 'work_orders:write'))
  WITH CHECK (public.has_permission(company_id, 'work_orders:write'));
CREATE POLICY "work_orders_delete" ON public.work_orders
  FOR DELETE USING (
    public.has_permission(company_id, 'work_orders:write')
    AND public.has_permission(company_id, 'records:manage')
  );

-- work_order_events: sola lettura dello staff (scritti dal trigger).
CREATE POLICY "work_order_events_select" ON public.work_order_events
  FOR SELECT USING (public.has_permission(company_id, 'work_orders:read'));

-- customer_notifications: cliente legge le proprie; staff con requests/work_orders/recalls.
CREATE POLICY "customer_notifications_select" ON public.customer_notifications
  FOR SELECT USING (
    public.is_my_client(company_id, client_id)
    OR public.has_permission(company_id, 'requests:read')
    OR public.has_permission(company_id, 'work_orders:read')
    OR public.has_permission(company_id, 'recalls:manage')
  );
CREATE POLICY "customer_notifications_insert" ON public.customer_notifications
  FOR INSERT WITH CHECK (
    public.has_permission(company_id, 'requests:write')
    OR public.has_permission(company_id, 'work_orders:write')
    OR public.has_permission(company_id, 'recalls:manage')
  );

-- client_documents: staff con clients:read; cliente vede i propri. Insert dello staff con clients:write.
CREATE POLICY "client_documents_select" ON public.client_documents
  FOR SELECT USING (
    public.has_permission(company_id, 'clients:read')
    OR public.is_my_client(company_id, client_id)
  );
CREATE POLICY "client_documents_insert" ON public.client_documents
  FOR INSERT WITH CHECK (
    public.has_permission(company_id, 'clients:write')
    AND uploaded_by = (SELECT auth.uid())
  );
CREATE POLICY "client_documents_delete" ON public.client_documents
  FOR DELETE USING (public.has_permission(company_id, 'clients:write'));

-- recall_log: solo recalls:manage; registrazione a proprio nome. Log append-only.
CREATE POLICY "recall_log_select" ON public.recall_log
  FOR SELECT USING (public.has_permission(company_id, 'recalls:manage'));
CREATE POLICY "recall_log_insert" ON public.recall_log
  FOR INSERT WITH CHECK (
    public.has_permission(company_id, 'recalls:manage')
    AND sent_by = (SELECT auth.uid())
  );

-- Lettura cliente sulle tabelle esistenti (si sommano alle policy dello staff).
CREATE POLICY "clients_select_customer" ON public.clients
  FOR SELECT USING (public.is_my_client(company_id, id));
CREATE POLICY "client_assets_select_customer" ON public.client_assets
  FOR SELECT USING (public.is_my_client(company_id, client_id));
CREATE POLICY "client_field_definitions_select_customer" ON public.client_field_definitions
  FOR SELECT USING (public.has_client_link(company_id) AND NOT sensitive);
CREATE POLICY "quotes_select_customer" ON public.quotes
  FOR SELECT USING (client_id IS NOT NULL AND public.is_my_client(company_id, client_id));
CREATE POLICY "calendar_events_select_customer" ON public.calendar_events
  FOR SELECT USING (client_id IS NOT NULL AND public.is_my_client(company_id, client_id));

-- ----------------------------------------------------------------------------
-- 7. Grant. Supabase concede per default ad authenticated su ogni nuova tabella:
--    si revoca tutto e si concede il minimo. anon: nessun accesso alle tabelle.
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.client_accounts        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.service_catalog        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.service_requests       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.work_orders            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.work_order_events      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.customer_notifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.client_documents       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.recall_log             FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.client_accounts                                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_catalog        TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.service_requests               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_orders            TO authenticated;
GRANT SELECT ON public.work_order_events                              TO authenticated;
GRANT SELECT, INSERT ON public.customer_notifications                 TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.client_documents               TO authenticated;
GRANT SELECT, INSERT ON public.recall_log                             TO authenticated;

-- Funzioni di trigger e helper interni: nessun accesso diretto.
REVOKE ALL ON FUNCTION public.work_order_timestamps()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.work_order_status_event()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.client_account_staff_guard()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_client_id(UUID)             FROM PUBLIC, anon, authenticated;

-- Helper usati dalle policy: solo utenti autenticati.
REVOKE ALL ON FUNCTION public.get_my_client_links()                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_my_client(UUID, UUID)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_client_link(UUID)                FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_client_links()             TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_my_client(UUID, UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_client_link(UUID)             TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. RPC. Ogni funzione riceve lo studio, verifica il modulo customer_portal, auth.uid()
--    e il link attivo (customer_client_id). Errori 42501 = non consentito, 22023 = input.
-- ----------------------------------------------------------------------------

-- 8.1 Validazione degli attributi di un bene: solo chiavi definite (entity 'asset', non sensibili).
CREATE OR REPLACE FUNCTION public.customer_validate_asset_attributes(
  p_company_id UUID, p_asset_type TEXT, p_attributes JSONB, p_complete BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key TEXT;
BEGIN
  IF jsonb_typeof(p_attributes) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Dati del bene non validi' USING ERRCODE = '22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_attributes) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.client_field_definitions d
      WHERE d.company_id = p_company_id AND d.entity = 'asset' AND d.client_type = p_asset_type
        AND d.key = v_key AND NOT d.sensitive
    ) THEN
      RAISE EXCEPTION 'Campo non previsto per questo bene: %', v_key USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_attributes -> v_key) NOT IN ('string', 'number', 'boolean', 'null') THEN
      RAISE EXCEPTION 'Valore non valido per il campo: %', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_complete AND EXISTS (
    SELECT 1 FROM public.client_field_definitions d
    WHERE d.company_id = p_company_id AND d.entity = 'asset' AND d.client_type = p_asset_type
      AND d.required AND NOT d.sensitive AND NOT (p_attributes ? d.key)
  ) THEN
    RAISE EXCEPTION 'Compila tutti i campi obbligatori del bene' USING ERRCODE = '22023';
  END IF;
END;
$$;

-- 8.2 Registrazione: crea la scheda cliente nello studio (client_type = settore) e il link.
CREATE OR REPLACE FUNCTION public.register_customer(
  p_company_id UUID, p_first_name TEXT, p_last_name TEXT, p_phone TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    UUID := (SELECT auth.uid());
  v_first  TEXT := btrim(coalesce(p_first_name, ''));
  v_last   TEXT := btrim(coalesce(p_last_name, ''));
  v_phone  TEXT := btrim(coalesce(p_phone, ''));
  v_sector TEXT;
  v_email  TEXT;
  v_code   TEXT;
  v_client UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta' USING ERRCODE = '42501';
  END IF;
  IF p_company_id IS NULL OR NOT public.module_enabled(p_company_id, 'customer_portal') THEN
    RAISE EXCEPTION 'Portale clienti non attivo per questo studio' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_first) NOT BETWEEN 1 AND 60 OR char_length(v_last) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Nome e cognome sono obbligatori (massimo 60 caratteri)' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_phone) NOT BETWEEN 6 AND 30 THEN
    RAISE EXCEPTION 'Numero di cellulare non valido' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('register_customer:' || p_company_id::TEXT || ':' || v_uid::TEXT));

  IF EXISTS (SELECT 1 FROM public.company_members m
             WHERE m.company_id = p_company_id AND m.user_id = v_uid) THEN
    RAISE EXCEPTION 'Account dello staff: non collegabile come cliente di questo studio'
      USING ERRCODE = '42501', CONSTRAINT = 'register_customer_is_staff';
  END IF;
  IF EXISTS (SELECT 1 FROM public.client_accounts ca
             WHERE ca.company_id = p_company_id AND ca.user_id = v_uid AND ca.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'Utente già collegato come cliente di questo studio'
      USING ERRCODE = '23505', CONSTRAINT = 'register_customer_already_linked';
  END IF;
  IF EXISTS (SELECT 1 FROM public.client_accounts ca
             WHERE ca.company_id = p_company_id AND ca.user_id = v_uid) THEN
    RAISE EXCEPTION 'Accesso revocato dallo studio'
      USING ERRCODE = '42501', CONSTRAINT = 'register_customer_revoked';
  END IF;

  SELECT c.sector INTO v_sector FROM public.companies c WHERE c.id = p_company_id;
  SELECT u.email::TEXT INTO v_email FROM auth.users u WHERE u.id = v_uid;

  -- Codice PT-AAAA-NNNN come lib/data/clients.ts: retry su collisione.
  FOR i IN 1..20 LOOP
    v_code := 'PT-' || to_char(now(), 'YYYY') || '-' || lpad(floor(random() * 10000)::INTEGER::TEXT, 4, '0');
    INSERT INTO public.clients (company_id, code, name, client_type, phone, email)
    VALUES (p_company_id, v_code, v_first || ' ' || v_last, v_sector, v_phone, coalesce(v_email, ''))
    ON CONFLICT (company_id, code) DO NOTHING
    RETURNING id INTO v_client;
    EXIT WHEN v_client IS NOT NULL;
  END LOOP;
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Impossibile generare un codice cliente univoco, riprova' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.client_accounts (user_id, company_id, client_id)
  VALUES (v_uid, p_company_id, v_client);

  RETURN v_client;
END;
$$;

-- 8.3 Nuovo bene del cliente. Identificatore normalizzato (trim, maiuscolo), unico nello studio per tipo.
CREATE OR REPLACE FUNCTION public.customer_add_asset(
  p_company_id UUID, p_asset_type TEXT, p_name TEXT, p_identifier TEXT, p_attributes JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client UUID := public.customer_client_id(p_company_id);
  v_type   TEXT := btrim(coalesce(p_asset_type, ''));
  v_name   TEXT := btrim(coalesce(p_name, ''));
  v_ident  TEXT := nullif(upper(btrim(coalesce(p_identifier, ''))), '');
  v_attrs  JSONB := coalesce(p_attributes, '{}'::JSONB);
  v_id     UUID;
BEGIN
  IF char_length(v_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Nome del bene obbligatorio (massimo 120 caratteri)' USING ERRCODE = '22023';
  END IF;
  IF v_type !~ '^[a-z][a-z0-9_]{0,62}$' OR NOT EXISTS (
    SELECT 1 FROM public.client_field_definitions d
    WHERE d.company_id = p_company_id AND d.entity = 'asset' AND d.client_type = v_type
  ) THEN
    RAISE EXCEPTION 'Tipo di bene non previsto dallo studio' USING ERRCODE = '22023';
  END IF;

  PERFORM public.customer_validate_asset_attributes(p_company_id, v_type, v_attrs, true);

  IF v_ident IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.client_assets a
    WHERE a.company_id = p_company_id AND a.asset_type = v_type
      AND a.identifier = v_ident AND a.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Questo bene risulta già registrato nello studio'
      USING ERRCODE = '23505', CONSTRAINT = 'client_assets_identifier_uniq';
  END IF;

  INSERT INTO public.client_assets (company_id, client_id, asset_type, name, identifier, attributes)
  VALUES (p_company_id, v_client, v_type, v_name, v_ident, v_attrs)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 8.4 Aggiornamento attributi di un bene del cliente. Chiavi non previste: 22023 (nessun merge silenzioso).
CREATE OR REPLACE FUNCTION public.customer_update_asset(p_company_id UUID, p_asset_id UUID, p_attributes JSONB)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client UUID := public.customer_client_id(p_company_id);
  v_type   TEXT;
  v_attrs  JSONB := coalesce(p_attributes, '{}'::JSONB);
BEGIN
  SELECT a.asset_type INTO v_type
  FROM public.client_assets a
  WHERE a.id = p_asset_id AND a.company_id = p_company_id
    AND a.client_id = v_client AND a.archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bene non trovato' USING ERRCODE = '42501';
  END IF;

  PERFORM public.customer_validate_asset_attributes(p_company_id, v_type, v_attrs, false);

  UPDATE public.client_assets
  SET attributes = attributes || v_attrs
  WHERE id = p_asset_id;
END;
$$;

-- 8.5 Documento del cliente (il file è già caricato nel bucket sotto <company>/<client>/).
CREATE OR REPLACE FUNCTION public.customer_add_document(
  p_company_id UUID, p_asset_id UUID, p_kind TEXT, p_path TEXT, p_mime TEXT, p_size INTEGER)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client UUID := public.customer_client_id(p_company_id);
  v_kind   TEXT := btrim(coalesce(p_kind, ''));
  v_prefix TEXT;
  v_id     UUID;
BEGIN
  IF v_kind !~ '^[a-z][a-z0-9_]{0,62}$' THEN
    RAISE EXCEPTION 'Tipo di documento non valido' USING ERRCODE = '22023';
  END IF;
  IF p_asset_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.client_assets a
    WHERE a.id = p_asset_id AND a.company_id = p_company_id
      AND a.client_id = v_client AND a.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Bene non trovato' USING ERRCODE = '42501';
  END IF;
  v_prefix := p_company_id::TEXT || '/' || v_client::TEXT || '/';
  IF p_path IS NULL OR NOT starts_with(p_path, v_prefix)
     OR p_path LIKE '%..%' OR char_length(p_path) > 300 THEN
    RAISE EXCEPTION 'Percorso del documento non valido' USING ERRCODE = '42501';
  END IF;
  IF p_mime IS NULL OR p_mime NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') THEN
    RAISE EXCEPTION 'Tipo di file non ammesso' USING ERRCODE = '22023';
  END IF;
  IF p_size IS NULL OR p_size NOT BETWEEN 1 AND 10485760 THEN
    RAISE EXCEPTION 'Dimensione del file non valida (massimo 10 MB)' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.client_documents
    (company_id, client_id, asset_id, kind, storage_path, mime_type, size_bytes)
  VALUES (p_company_id, v_client, p_asset_id, v_kind, p_path, p_mime, p_size)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 8.6 Richiesta dal cliente. Il cliente sceglie {source, id}: titolo, prezzo e giacenza sono
--     letti dal DB. Il preventivo automatico è calcolato qui (kind 'quote'); mai ricevuto dal client.
--     Servizio: prezzo di listino (NULL = su richiesta). Articolo: giacenza >= qty e
--     total = qty × sale_price + somma dei servizi attivi con addon_for_item_type = tipo dell'articolo
--     (una volta sola). Prezzo addon NULL → non disponibile.
--     available → 'auto_quoted'; con companies.custom_metadata.auto_quote = true → preventivo subito.
CREATE OR REPLACE FUNCTION public.customer_create_request(
  p_company_id     UUID,
  p_kind           TEXT,
  p_asset_id       UUID,
  p_item_source    TEXT,
  p_item_id        UUID,
  p_qty            INTEGER,
  p_message        TEXT,
  p_preferred_date DATE
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client        UUID := public.customer_client_id(p_company_id);
  v_message       TEXT := nullif(btrim(coalesce(p_message, '')), '');
  v_qty           INTEGER := 1;
  v_title         TEXT;
  v_item_type     TEXT;
  v_unit          NUMERIC;
  v_stock         NUMERIC := 0;
  v_addon         NUMERIC := 0;
  v_addon_unknown INTEGER := 0;
  v_available     BOOLEAN := false;
  v_total         NUMERIC;
  v_reason        TEXT;
  v_snapshot      JSONB := NULL;
  v_auto          JSONB := NULL;
  v_status        TEXT := 'new';
  v_client_name   TEXT;
  v_request       UUID;
  v_quote         UUID;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('quote', 'appointment', 'info') THEN
    RAISE EXCEPTION 'Tipo di richiesta non valido' USING ERRCODE = '22023';
  END IF;
  IF v_message IS NOT NULL AND char_length(v_message) > 1000 THEN
    RAISE EXCEPTION 'Messaggio troppo lungo (massimo 1000 caratteri)' USING ERRCODE = '22023';
  END IF;
  IF p_preferred_date IS NOT NULL AND p_preferred_date < current_date THEN
    RAISE EXCEPTION 'La data preferita non può essere nel passato' USING ERRCODE = '22023';
  END IF;
  IF p_asset_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.client_assets a
    WHERE a.id = p_asset_id AND a.company_id = p_company_id
      AND a.client_id = v_client AND a.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Bene non trovato' USING ERRCODE = '42501';
  END IF;
  IF (p_item_source IS NULL) <> (p_item_id IS NULL)
     OR (p_item_source IS NOT NULL AND p_item_source NOT IN ('service', 'inventory')) THEN
    RAISE EXCEPTION 'Articolo non valido' USING ERRCODE = '22023';
  END IF;

  IF p_item_source = 'service' THEN
    SELECT sc.title, sc.price INTO v_title, v_unit
    FROM public.service_catalog sc
    WHERE sc.id = p_item_id AND sc.company_id = p_company_id
      AND sc.active AND sc."public";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Articolo non disponibile' USING ERRCODE = '22023';
    END IF;
    v_qty       := 1;
    v_available := v_unit IS NOT NULL;
    v_total     := v_unit;
    v_reason    := CASE WHEN v_available THEN 'Prezzo di listino'
                        ELSE 'Prezzo su richiesta: il desk ti contatta' END;
    v_snapshot  := jsonb_build_object('source', 'service', 'id', p_item_id,
                                      'title', v_title, 'price', v_unit, 'qty', v_qty);

  ELSIF p_item_source = 'inventory' THEN
    v_qty := coalesce(p_qty, 1);
    IF v_qty NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'Quantità non valida' USING ERRCODE = '22023';
    END IF;

    SELECT ii.name, ii.sale_price, t.key INTO v_title, v_unit, v_item_type
    FROM public.inventory_items ii
    JOIN public.inventory_item_types t ON t.id = ii.item_type_id AND t.company_id = ii.company_id
    WHERE ii.id = p_item_id AND ii.company_id = p_company_id
      AND ii.archived_at IS NULL AND ii.sale_price IS NOT NULL AND t.sellable;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Articolo non disponibile' USING ERRCODE = '22023';
    END IF;

    SELECT coalesce(sum(s.quantity), 0) INTO v_stock
    FROM public.inventory_stock s
    WHERE s.company_id = p_company_id AND s.item_id = p_item_id;

    SELECT count(*) FILTER (WHERE sc.price IS NULL), coalesce(sum(sc.price), 0)
      INTO v_addon_unknown, v_addon
    FROM public.service_catalog sc
    WHERE sc.company_id = p_company_id AND sc.active AND sc.addon_for_item_type = v_item_type;

    v_available := v_stock >= v_qty AND v_addon_unknown = 0;
    v_total     := CASE WHEN v_addon_unknown > 0 THEN NULL ELSE v_qty * v_unit + v_addon END;
    v_reason    := CASE
      WHEN v_stock < v_qty THEN 'Giacenza insufficiente: il desk ti contatta'
      WHEN v_addon_unknown > 0 THEN 'Servizio collegato su richiesta: il desk ti contatta'
      ELSE 'Disponibile a magazzino' END;
    v_snapshot  := jsonb_build_object('source', 'inventory', 'id', p_item_id,
                                      'title', v_title, 'price', v_unit, 'qty', v_qty);
  END IF;

  IF p_kind = 'quote' AND v_snapshot IS NOT NULL THEN
    v_auto := jsonb_build_object(
      'available', v_available, 'qty', v_qty, 'unitPrice', v_unit,
      'addonPrice', CASE WHEN v_addon_unknown > 0 THEN NULL ELSE v_addon END,
      'total', v_total, 'reason', v_reason);
    IF v_available THEN
      v_status := 'auto_quoted';
    END IF;
  END IF;

  INSERT INTO public.service_requests
    (company_id, client_id, asset_id, kind, status, item, message, preferred_date, auto_quote, source)
  VALUES
    (p_company_id, v_client, p_asset_id, p_kind, v_status, v_snapshot, v_message, p_preferred_date, v_auto, 'portal')
  RETURNING id INTO v_request;

  IF v_status = 'auto_quoted' AND EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = p_company_id AND (c.custom_metadata ->> 'auto_quote') = 'true'
  ) THEN
    SELECT cl.name INTO v_client_name
    FROM public.clients cl
    WHERE cl.id = v_client AND cl.company_id = p_company_id;

    INSERT INTO public.quotes
      (company_id, client, quote_type, status, amount, description, is_ai_generated, asset_id, client_id, request_id)
    VALUES (
      p_company_id, coalesce(v_client_name, ''), v_title, 'quote_sent', v_total,
      CASE WHEN p_item_source = 'inventory' THEN v_qty::TEXT || ' x ' || v_title ELSE v_title END,
      true, p_asset_id, v_client, v_request)
    RETURNING id INTO v_quote;

    UPDATE public.service_requests
    SET status = 'quoted', quote_id = v_quote
    WHERE id = v_request;

    INSERT INTO public.customer_notifications (company_id, client_id, kind, title, body, dedupe_key)
    VALUES (
      p_company_id, v_client, 'quote', 'Nuovo preventivo',
      'Totale ' || to_char(v_total, 'FM999999990.00') || ' €. Accettalo o rifiutalo dall''app.',
      'quote:' || v_quote::TEXT)
    ON CONFLICT (company_id, client_id, dedupe_key) DO NOTHING;
  END IF;

  RETURN v_request;
END;
$$;

-- 8.7 Risposta del cliente a un preventivo inviato (solo i propri, in stato quote_sent).
CREATE OR REPLACE FUNCTION public.customer_respond_quote(p_company_id UUID, p_quote_id UUID, p_decision TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client UUID := public.customer_client_id(p_company_id);
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'declined') THEN
    RAISE EXCEPTION 'Decisione non valida' USING ERRCODE = '22023';
  END IF;

  UPDATE public.quotes q
  SET status = CASE WHEN p_decision = 'approved'
                    THEN 'approved'::public.quote_status
                    ELSE 'declined'::public.quote_status END
  WHERE q.id = p_quote_id AND q.company_id = p_company_id
    AND q.client_id = v_client AND q.status = 'quote_sent';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Preventivo non disponibile per la risposta' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- 8.8 Notifiche lette (massimo 200 id per chiamata).
CREATE OR REPLACE FUNCTION public.customer_mark_notifications_read(p_company_id UUID, p_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client UUID := public.customer_client_id(p_company_id);
  v_count  INTEGER;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN 0;
  END IF;
  IF cardinality(p_ids) > 200 THEN
    RAISE EXCEPTION 'Troppe notifiche in una sola richiesta' USING ERRCODE = '22023';
  END IF;

  UPDATE public.customer_notifications n
  SET read_at = now()
  WHERE n.id = ANY (p_ids) AND n.company_id = p_company_id
    AND n.client_id = v_client AND n.read_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

-- 8.9 Revoca dell'accesso cliente dallo staff (clients:write).
CREATE OR REPLACE FUNCTION public.revoke_client_account(p_company_id UUID, p_client_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_permission(p_company_id, 'clients:write') THEN
    RAISE EXCEPTION 'Permesso clients:write mancante' USING ERRCODE = '42501';
  END IF;

  UPDATE public.client_accounts
  SET revoked_at = now()
  WHERE company_id = p_company_id AND client_id = p_client_id AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nessun accesso attivo per questo cliente' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- 8.10 Anteprima pubblica dello studio dal suo slug (solo se il portale è attivo).
CREATE OR REPLACE FUNCTION public.get_portal_company(p_slug TEXT)
RETURNS TABLE (id UUID, name TEXT, slug TEXT, sector TEXT, terms JSONB)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id, c.name, c.slug, c.sector, c.terms
  FROM public.companies c
  WHERE c.slug = p_slug
    AND public.module_enabled(c.id, 'customer_portal');
$$;

-- 8.11 Catalogo pubblico: servizi attivi e pubblici + articoli di tipo vendibile con giacenza > 0.
--      Solo attributi non sensibili. Nessun dato personale. Solo se il portale è attivo.
CREATE OR REPLACE FUNCTION public.get_public_catalog(p_company_id UUID)
RETURNS TABLE (
  kind TEXT, id UUID, category TEXT, title TEXT, description TEXT,
  price NUMERIC, stock NUMERIC, item_type TEXT, attributes JSONB)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT x.kind, x.id, x.category, x.title, x.description, x.price, x.stock, x.item_type, x.attributes
  FROM (
    SELECT 0 AS grp, sc.position AS sort_pos, sc.title AS sort_title,
           'service'::TEXT AS kind, sc.id AS id, sc.category AS category, sc.title AS title,
           sc.description AS description, sc.price AS price, NULL::NUMERIC AS stock,
           NULL::TEXT AS item_type, '{}'::JSONB AS attributes
    FROM public.service_catalog sc
    WHERE sc.company_id = p_company_id
      AND sc.active AND sc."public"
      AND public.module_enabled(p_company_id, 'customer_portal')
    UNION ALL
    SELECT 1, 0, ii.name,
           'item'::TEXT, ii.id, cat.name, ii.name,
           NULL::TEXT, ii.sale_price, st.qty,
           t.key,
           coalesce((
             SELECT jsonb_object_agg(e.key, e.value)
             FROM jsonb_each(ii.attributes) AS e(key, value)
             WHERE EXISTS (
               SELECT 1 FROM public.client_field_definitions d
               WHERE d.company_id = ii.company_id AND d.entity = 'item'
                 AND d.client_type = t.key AND d.key = e.key AND NOT d.sensitive
             )
           ), '{}'::JSONB)
    FROM public.inventory_items ii
    JOIN public.inventory_item_types t ON t.id = ii.item_type_id AND t.company_id = ii.company_id
    LEFT JOIN public.inventory_categories cat ON cat.id = ii.category_id AND cat.company_id = ii.company_id
    JOIN LATERAL (
      SELECT coalesce(sum(s.quantity), 0) AS qty
      FROM public.inventory_stock s
      WHERE s.company_id = ii.company_id AND s.item_id = ii.id
    ) st ON true
    WHERE ii.company_id = p_company_id
      AND ii.archived_at IS NULL
      AND ii.sale_price IS NOT NULL
      AND t.sellable
      AND st.qty > 0
      AND public.module_enabled(p_company_id, 'customer_portal')
  ) x
  ORDER BY x.grp, x.sort_pos, x.sort_title;
$$;

-- Grant delle RPC: solo autenticati; anteprima e catalogo anche anon.
REVOKE ALL ON FUNCTION public.customer_validate_asset_attributes(UUID, TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_customer(UUID, TEXT, TEXT, TEXT)                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.customer_add_asset(UUID, TEXT, TEXT, TEXT, JSONB)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.customer_update_asset(UUID, UUID, JSONB)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.customer_add_document(UUID, UUID, TEXT, TEXT, TEXT, INTEGER)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.customer_create_request(UUID, TEXT, UUID, TEXT, UUID, INTEGER, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.customer_respond_quote(UUID, UUID, TEXT)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.customer_mark_notifications_read(UUID, UUID[])                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_client_account(UUID, UUID)                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_portal_company(TEXT)                                       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_catalog(UUID)                                       FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.register_customer(UUID, TEXT, TEXT, TEXT)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_add_asset(UUID, TEXT, TEXT, TEXT, JSONB)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_update_asset(UUID, UUID, JSONB)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_add_document(UUID, UUID, TEXT, TEXT, TEXT, INTEGER)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_create_request(UUID, TEXT, UUID, TEXT, UUID, INTEGER, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_respond_quote(UUID, UUID, TEXT)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_mark_notifications_read(UUID, UUID[])                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_client_account(UUID, UUID)                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_company(TEXT)                                       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_catalog(UUID)                                       TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9. Storage: bucket privato client-documents (solo se lo schema storage esiste).
--    Path: <company_id>/<client_id>/<nome file>
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'Schema storage assente: bucket client-documents non creato';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('client-documents', 'client-documents', false, 10485760,
          ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

  DROP POLICY IF EXISTS "client_documents_staff_select" ON storage.objects;
  CREATE POLICY "client_documents_staff_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'client-documents'
      AND EXISTS (
        SELECT 1 FROM public.company_members m
        WHERE m.company_id::TEXT = (storage.foldername(name))[1]
          AND m.user_id = (SELECT auth.uid())
          AND public.has_permission(m.company_id, 'clients:read')
      )
    );

  DROP POLICY IF EXISTS "client_documents_staff_insert" ON storage.objects;
  CREATE POLICY "client_documents_staff_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'client-documents'
      AND EXISTS (
        SELECT 1 FROM public.company_members m
        WHERE m.company_id::TEXT = (storage.foldername(name))[1]
          AND m.user_id = (SELECT auth.uid())
          AND public.has_permission(m.company_id, 'clients:write')
      )
    );

  DROP POLICY IF EXISTS "client_documents_customer_insert" ON storage.objects;
  CREATE POLICY "client_documents_customer_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'client-documents'
      AND EXISTS (
        SELECT 1 FROM public.get_my_client_links() l
        WHERE l.company_id::TEXT = (storage.foldername(name))[1]
          AND l.client_id::TEXT = (storage.foldername(name))[2]
      )
    );

  DROP POLICY IF EXISTS "client_documents_customer_select" ON storage.objects;
  CREATE POLICY "client_documents_customer_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'client-documents'
      AND EXISTS (
        SELECT 1 FROM public.get_my_client_links() l
        WHERE l.company_id::TEXT = (storage.foldername(name))[1]
          AND l.client_id::TEXT = (storage.foldername(name))[2]
      )
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. apply_vertical_template: come 20261024120000 (lot_label) + services e roles.
--     Idempotente (ON CONFLICT DO NOTHING). SECURITY INVOKER: valgono le policy.
--     Ordine: tipi di appuntamento e articoli prima dei servizi (FK).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_vertical_template(p_company_id UUID, p_key TEXT, p_keep_terms BOOLEAN DEFAULT false)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tpl public.vertical_templates%ROWTYPE;
BEGIN
  SELECT * INTO v_tpl FROM public.vertical_templates
  WHERE key = p_key ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Preset di settore inesistente: %', p_key USING ERRCODE = '22023';
  END IF;

  UPDATE public.companies
  SET sector = v_tpl.key,
      template_version = v_tpl.version,
      terms = CASE WHEN p_keep_terms THEN (v_tpl.payload -> 'terms') || terms ELSE v_tpl.payload -> 'terms' END
  WHERE id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Studio non trovato o non modificabile' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.client_field_definitions
    (company_id, entity, client_type, key, label, type, options, required, position, sensitive)
  SELECT p_company_id, f.entity, f.client_type, f.key, f.label, f.type, f.options, f.required, f.position, f.sensitive
  FROM jsonb_to_recordset(v_tpl.payload -> 'fields') AS f(
    entity TEXT, client_type TEXT, key TEXT, label TEXT, type TEXT,
    options JSONB, required BOOLEAN, position INTEGER, sensitive BOOLEAN)
  ON CONFLICT (company_id, entity, client_type, key) DO NOTHING;

  INSERT INTO public.company_modules (company_id, module, enabled)
  SELECT p_company_id, m.key, m.value::boolean
  FROM jsonb_each_text(v_tpl.payload -> 'modules') AS m
  ON CONFLICT (company_id, module) DO NOTHING;

  INSERT INTO public.company_appointment_types (company_id, key, label, color, duration_minutes, position)
  SELECT p_company_id, a.key, a.label, a.color, a.duration_minutes, a.position
  FROM jsonb_to_recordset(v_tpl.payload -> 'appointment_types') AS a(
    key TEXT, label TEXT, color TEXT, duration_minutes INTEGER, position INTEGER)
  ON CONFLICT (company_id, key) DO NOTHING;

  INSERT INTO public.inventory_item_types
    (company_id, key, label, lot_label, track_lot, track_expiry, track_serial, consumable,
     fractional, sellable, requires_client_on_issue, position)
  SELECT p_company_id, i.key, i.label, i.lot_label, i.track_lot, i.track_expiry, i.track_serial, i.consumable,
         i.fractional, i.sellable, i.requires_client_on_issue, i.position
  FROM jsonb_to_recordset(coalesce(v_tpl.payload -> 'item_types', '[]'::jsonb)) AS i(
    key TEXT, label TEXT, lot_label TEXT, track_lot BOOLEAN, track_expiry BOOLEAN, track_serial BOOLEAN,
    consumable BOOLEAN, fractional BOOLEAN, sellable BOOLEAN, requires_client_on_issue BOOLEAN,
    position INTEGER)
  ON CONFLICT (company_id, key) DO NOTHING;

  INSERT INTO public.company_roles (company_id, key, label, permissions)
  SELECT p_company_id, r.key, r.label, ARRAY(SELECT jsonb_array_elements_text(r.permissions))
  FROM jsonb_to_recordset(coalesce(v_tpl.payload -> 'roles', '[]'::jsonb)) AS r(
    key TEXT, label TEXT, permissions JSONB)
  ON CONFLICT (company_id, key) DO NOTHING;

  INSERT INTO public.service_catalog
    (company_id, key, category, title, description, price, duration_minutes,
     appointment_type_id, addon_for_item_type, "public", active, position)
  SELECT p_company_id, s.key, s.category, s.title, coalesce(s.description, ''), s.price, s.duration_minutes,
         (SELECT at.id FROM public.company_appointment_types at
          WHERE at.company_id = p_company_id AND at.key = s.appointment_type),
         s.addon_for_item_type, coalesce(s."public", true), coalesce(s.active, true), coalesce(s.position, 0)
  FROM jsonb_to_recordset(coalesce(v_tpl.payload -> 'services', '[]'::jsonb)) AS s(
    key TEXT, category TEXT, title TEXT, description TEXT, price NUMERIC, duration_minutes INTEGER,
    appointment_type TEXT, addon_for_item_type TEXT, "public" BOOLEAN, active BOOLEAN, position INTEGER)
  ON CONFLICT (company_id, key) DO NOTHING;

  RETURN v_tpl.version;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_vertical_template(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_vertical_template(UUID, TEXT, BOOLEAN) TO authenticated;

-- ----------------------------------------------------------------------------
-- 11. Preset v2 = payload v1 + novità (moduli, termini, appuntamenti, campi, servizi, ruoli).
--     Array: concatenazione con la v1. Termini: la novità sovrascrive il default della v1.
-- ----------------------------------------------------------------------------
INSERT INTO public.vertical_templates (key, version, label, description, payload)
SELECT t.key, 2, t.label, t.description,
       t.payload || jsonb_build_object(
         'terms',             (t.payload -> 'terms') || p.terms,
         'modules',           (t.payload -> 'modules') || p.modules,
         'appointment_types', coalesce(t.payload -> 'appointment_types', '[]'::jsonb) || p.appointment_types,
         'fields',            coalesce(t.payload -> 'fields', '[]'::jsonb) || p.fields,
         'services',          p.services,
         'roles',             p.roles)
FROM public.vertical_templates t
JOIN (VALUES
  ('gommista'::TEXT,
   $json${"memberTitle": "Desk", "workOrdersLabel": "Attività officina",
          "workOrderStatusWaiting": "Auto ricevuta in officina",
          "workOrderStatusInProgress": "La tua auto è in lavorazione",
          "workOrderStatusReady": "Auto pronta al ritiro!",
          "workOrderStatusDelivered": "Auto riconsegnata, grazie!"}$json$::jsonb,
   $json${"work_orders": true, "requests": true, "customer_portal": true, "recalls": true}$json$::jsonb,
   $json$[
     {"key": "revisione", "label": "Revisione ministeriale", "color": "#F59E0B", "duration_minutes": 40, "position": 60},
     {"key": "inversione", "label": "Inversione gomme", "color": "#0899E6", "duration_minutes": 20, "position": 70},
     {"key": "assetto", "label": "Assetto geometrico", "color": "#8B5CF6", "duration_minutes": 60, "position": 80}
   ]$json$::jsonb,
   $json$[
     {"entity": "asset", "client_type": "veicolo", "key": "misura_gomme", "label": "Misura gomme", "type": "text", "options": [], "required": false, "position": 60, "sensitive": false},
     {"entity": "asset", "client_type": "veicolo", "key": "scadenza_revisione", "label": "Scadenza revisione", "type": "date", "options": [], "required": false, "position": 70, "sensitive": false},
     {"entity": "asset", "client_type": "veicolo", "key": "km_riferimento_inversione", "label": "Km ultima inversione", "type": "number", "options": [], "required": false, "position": 80, "sensitive": false},
     {"entity": "work_order", "client_type": "gommista", "key": "km", "label": "Km", "type": "number", "options": [], "required": false, "position": 10, "sensitive": false}
   ]$json$::jsonb,
   $json$[
     {"key": "montaggio", "category": "gomme", "title": "Montaggio pneumatici", "description": "Montaggio degli pneumatici acquistati presso lo studio", "price": null, "duration_minutes": 30, "appointment_type": "montaggio", "addon_for_item_type": "pneumatici", "public": false, "active": true, "position": 10},
     {"key": "convergenza", "category": "convergenza", "title": "Convergenza", "description": "Controllo e regolazione della convergenza", "price": null, "duration_minutes": 30, "appointment_type": "convergenza", "public": true, "active": true, "position": 20},
     {"key": "equilibratura", "category": "equilibratura", "title": "Equilibratura", "description": "Equilibratura delle ruote", "price": null, "duration_minutes": 20, "appointment_type": "equilibratura", "public": true, "active": true, "position": 30},
     {"key": "inversione", "category": "inversione", "title": "Inversione gomme", "description": "Inversione delle gomme tra gli assi", "price": null, "duration_minutes": 20, "appointment_type": "inversione", "public": true, "active": true, "position": 40},
     {"key": "revisione", "category": "revisione", "title": "Revisione ministeriale", "description": "Prenotazione della revisione", "price": null, "duration_minutes": 40, "appointment_type": "revisione", "public": true, "active": true, "position": 50}
   ]$json$::jsonb,
   $json$[
     {"key": "officina", "label": "Officina", "permissions": ["work_orders:read", "work_orders:write", "clients:read", "calendar:read"]}
   ]$json$::jsonb),

  ('officina'::TEXT,
   $json${"workOrdersLabel": "Attività officina",
          "workOrderStatusWaiting": "Auto ricevuta in officina",
          "workOrderStatusInProgress": "La tua auto è in lavorazione",
          "workOrderStatusReady": "Auto pronta al ritiro!",
          "workOrderStatusDelivered": "Auto riconsegnata, grazie!"}$json$::jsonb,
   $json${"work_orders": true, "requests": true, "customer_portal": false, "recalls": false}$json$::jsonb,
   $json$[]$json$::jsonb,
   $json$[
     {"entity": "work_order", "client_type": "officina", "key": "km", "label": "Km", "type": "number", "options": [], "required": false, "position": 10, "sensitive": false}
   ]$json$::jsonb,
   $json$[]$json$::jsonb,
   $json$[
     {"key": "officina", "label": "Officina", "permissions": ["work_orders:read", "work_orders:write", "clients:read", "calendar:read"]}
   ]$json$::jsonb),

  ('autolavaggio'::TEXT,
   $json${"workOrdersLabel": "Lavaggi",
          "workOrderStatusWaiting": "Auto ricevuta",
          "workOrderStatusInProgress": "Lavaggio in corso",
          "workOrderStatusReady": "Auto pronta!",
          "workOrderStatusDelivered": "Auto riconsegnata, grazie!"}$json$::jsonb,
   $json${"work_orders": true}$json$::jsonb,
   $json$[]$json$::jsonb,
   $json$[]$json$::jsonb,
   $json$[]$json$::jsonb,
   $json$[]$json$::jsonb)
) AS p(key, terms, modules, appointment_types, fields, services, roles) ON p.key = t.key
WHERE t.version = 1;

-- ----------------------------------------------------------------------------
-- 12. Upgrade degli studi esistenti: solo se esiste una versione più recente del loro preset.
--     apply_vertical_template con p_keep_terms = true: solo le novità (ON CONFLICT DO NOTHING),
--     i termini personalizzati restano, le chiavi nuove si aggiungono.
--     Un upgrade non ripristina elementi eliminati dallo studio, perché gira solo sulle versioni nuove.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_co     RECORD;
  v_latest INTEGER;
BEGIN
  FOR v_co IN SELECT c.id, c.sector, c.template_version FROM public.companies c LOOP
    SELECT t.version INTO v_latest
    FROM public.vertical_templates t
    WHERE t.key = v_co.sector
    ORDER BY t.version DESC LIMIT 1;

    IF v_latest IS NOT NULL AND v_latest > coalesce(v_co.template_version, 0) THEN
      PERFORM public.apply_vertical_template(v_co.id, v_co.sector, true);
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
