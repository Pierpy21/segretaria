-- ============================================================================
-- Migration: client_assets
-- Description: "beni del cliente" generici (veicoli, animali, immobili, impianti…).
--   1. client_assets: N beni per cliente. Attributi via client_field_definitions
--      (entity = 'asset', client_type = asset_type). Nessun if sul settore.
--   2. client_field_definitions.entity ('client' | 'asset'); unique include entity.
--   3. seed_client_field_defaults: tabella di default con entity. Nessun settore
--      attuale ha beni: le righe 'asset' sono commentate (esempio meccanico).
--   4. calendar_events / tasks / quotes.asset_id (FK composita, ON DELETE SET NULL).
-- Nessun backfill. Richiede PostgreSQL >= 15 (ON DELETE SET NULL (colonna)).
-- Depends on: 20261016150000_clients_multisector.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. client_assets (stessa struttura/pattern di clients)
-- ----------------------------------------------------------------------------
CREATE TABLE public.client_assets (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id    UUID        NOT NULL,
  asset_type   TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  identifier   TEXT,
  attributes   JSONB       NOT NULL DEFAULT '{}',
  note         TEXT,
  archived_at  TIMESTAMPTZ,
  created_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Coerenza tenant: il bene appartiene a un cliente della stessa azienda.
  CONSTRAINT client_assets_id_company_id_key UNIQUE (id, company_id),
  CONSTRAINT client_assets_client_fkey FOREIGN KEY (client_id, company_id)
    REFERENCES public.clients(id, company_id) ON DELETE CASCADE,
  CONSTRAINT client_assets_attributes_object CHECK (jsonb_typeof(attributes) = 'object'),
  CONSTRAINT client_assets_type_format CHECK (asset_type ~ '^[a-z][a-z0-9_]{0,62}$')
);

CREATE INDEX idx_client_assets_client     ON public.client_assets(company_id, client_id);
CREATE INDEX idx_client_assets_identifier ON public.client_assets(company_id, identifier);
CREATE INDEX idx_client_assets_created_by ON public.client_assets(created_by);

-- Trigger come clients: updated_at, company_id immutabile, created_by.
CREATE TRIGGER trg_client_assets_updated_at
  BEFORE UPDATE ON public.client_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_client_assets_created_by
  BEFORE INSERT ON public.client_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

CREATE TRIGGER trg_client_assets_immutable_created_by
  BEFORE UPDATE ON public.client_assets
  FOR EACH ROW EXECUTE FUNCTION public.protect_created_by();

CREATE TRIGGER trg_client_assets_immutable_company_id
  BEFORE UPDATE ON public.client_assets
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

-- RLS identica a clients (SELECT membri; scrittura esclusa per accountant).
ALTER TABLE public.client_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_assets FORCE  ROW LEVEL SECURITY;

CREATE POLICY "client_assets_select" ON public.client_assets
  FOR SELECT USING (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "client_assets_insert" ON public.client_assets
  FOR INSERT WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "client_assets_update" ON public.client_assets
  FOR UPDATE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) IN ('owner', 'admin')
      OR created_by = (SELECT auth.uid())
    )
  ) WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "client_assets_delete" ON public.client_assets
  FOR DELETE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) IN ('owner', 'admin')
      OR created_by = (SELECT auth.uid())
    )
  );

CREATE POLICY "client_assets_insert_no_accountant" ON public.client_assets
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.get_my_role_in_company(company_id) IS DISTINCT FROM 'accountant');

CREATE POLICY "client_assets_update_no_accountant" ON public.client_assets
  AS RESTRICTIVE FOR UPDATE
  USING (public.get_my_role_in_company(company_id) IS DISTINCT FROM 'accountant');

CREATE POLICY "client_assets_delete_no_accountant" ON public.client_assets
  AS RESTRICTIVE FOR DELETE
  USING (public.get_my_role_in_company(company_id) IS DISTINCT FROM 'accountant');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_assets TO authenticated;
REVOKE ALL ON public.client_assets FROM anon;

-- ----------------------------------------------------------------------------
-- 2. client_field_definitions: entity ('client' | 'asset')
--    Per entity = 'asset': client_type = asset_type.
-- ----------------------------------------------------------------------------
ALTER TABLE public.client_field_definitions
  ADD COLUMN entity TEXT NOT NULL DEFAULT 'client',
  ADD CONSTRAINT client_field_definitions_entity_check CHECK (entity IN ('client', 'asset'));

ALTER TABLE public.client_field_definitions
  DROP CONSTRAINT client_field_definitions_key_unique;
ALTER TABLE public.client_field_definitions
  ADD CONSTRAINT client_field_definitions_key_unique UNIQUE (company_id, entity, client_type, key);

DROP INDEX public.idx_client_field_definitions_company;
CREATE INDEX idx_client_field_definitions_company
  ON public.client_field_definitions(company_id, entity, client_type, position);

-- ----------------------------------------------------------------------------
-- 3. Preset per settore (SECURITY INVOKER: valgono le policy di scrittura)
--    Tabella di default: (settore, entity, client_type, definizione).
--    Campi cliente: client_type = settore (comportamento invariato).
--    Campi bene: aggiungere un settore (companies_sector_check) e le righe
--    entity = 'asset' con client_type = asset_type. Esempio (commentato):
--      ('meccanico', 'asset', 'veicolo', 'marca',  'Marca',  'text',   '[]'::jsonb, false, 10, false),
--      ('meccanico', 'asset', 'veicolo', 'modello', 'Modello','text',   '[]'::jsonb, false, 20, false),
--      ('meccanico', 'asset', 'veicolo', 'anno',   'Anno',   'number', '[]'::jsonb, false, 30, false),
--      ('meccanico', 'asset', 'veicolo', 'km',     'Km',     'number', '[]'::jsonb, false, 40, false),
--    Nessun settore attuale ha beni: nessuna riga 'asset' attiva.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_client_field_defaults(p_company_id UUID, p_sector TEXT)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  INSERT INTO public.client_field_definitions
    (company_id, entity, client_type, key, label, type, options, required, position, sensitive)
  SELECT p_company_id, d.entity, d.client_type, d.key, d.label, d.type, d.options, d.required, d.position, d.sensitive
  FROM (VALUES
    ('dentale',  'client', 'dentale',  'referral_source',  'Come ci ha conosciuto', 'select', '["Passaparola","Web","Social","Altro"]'::jsonb, false, 10, false),
    ('dentale',  'client', 'dentale',  'referring_dentist','Dentista inviante',     'text',   '[]'::jsonb, false, 20, false),
    ('dentale',  'client', 'dentale',  'privacy_consent',  'Consenso privacy',      'bool',   '[]'::jsonb, true,  30, false),
    ('dentale',  'client', 'dentale',  'allergies',        'Allergie',              'text',   '[]'::jsonb, false, 40, true),
    ('dentale',  'client', 'dentale',  'anticoagulants',   'Terapia anticoagulante','bool',   '[]'::jsonb, false, 50, true),
    ('estetico', 'client', 'estetico', 'referral_source',  'Come ci ha conosciuto', 'select', '["Passaparola","Web","Social","Altro"]'::jsonb, false, 10, false),
    ('estetico', 'client', 'estetico', 'skin_type',        'Tipo di pelle',         'select', '["Normale","Secca","Grassa","Mista","Sensibile"]'::jsonb, false, 20, false),
    ('estetico', 'client', 'estetico', 'privacy_consent',  'Consenso privacy',      'bool',   '[]'::jsonb, true,  30, false),
    ('estetico', 'client', 'estetico', 'allergies',        'Allergie',              'text',   '[]'::jsonb, false, 40, true),
    ('generico', 'client', 'generico', 'referral_source',  'Come ci ha conosciuto', 'select', '["Passaparola","Web","Social","Altro"]'::jsonb, false, 10, false),
    ('generico', 'client', 'generico', 'privacy_consent',  'Consenso privacy',      'bool',   '[]'::jsonb, true,  20, false),
    ('generico', 'client', 'generico', 'notes',            'Note',                  'text',   '[]'::jsonb, false, 30, false)
  ) AS d(sector, entity, client_type, key, label, type, options, required, position, sensitive)
  WHERE d.sector = p_sector
  ON CONFLICT (company_id, entity, client_type, key) DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.seed_client_field_defaults(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_client_field_defaults(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. asset_id su calendar_events, tasks, quotes
--    FK composita (asset_id, company_id): il bene è della stessa azienda.
--    ON DELETE SET NULL (asset_id): company_id resta valorizzato.
--    Gli oggetti non hanno client_id: il collegamento al cliente non è verificato qui.
-- ----------------------------------------------------------------------------
ALTER TABLE public.calendar_events ADD COLUMN asset_id UUID;
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_asset_fkey FOREIGN KEY (asset_id, company_id)
    REFERENCES public.client_assets(id, company_id) ON DELETE SET NULL (asset_id);
CREATE INDEX idx_calendar_events_asset ON public.calendar_events(company_id, asset_id);

ALTER TABLE public.tasks ADD COLUMN asset_id UUID;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_asset_fkey FOREIGN KEY (asset_id, company_id)
    REFERENCES public.client_assets(id, company_id) ON DELETE SET NULL (asset_id);
CREATE INDEX idx_tasks_asset ON public.tasks(company_id, asset_id);

ALTER TABLE public.quotes ADD COLUMN asset_id UUID;
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_asset_fkey FOREIGN KEY (asset_id, company_id)
    REFERENCES public.client_assets(id, company_id) ON DELETE SET NULL (asset_id);
CREATE INDEX idx_quotes_asset ON public.quotes(company_id, asset_id);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
