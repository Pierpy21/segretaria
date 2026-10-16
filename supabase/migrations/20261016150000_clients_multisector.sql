-- ============================================================================
-- Migration: clients_multisector
-- Description: generalizza "pazienti" in "clienti" per più settori.
--   1. patients → clients, patient_clinical → client_clinical (patient_id → client_id)
--      con rinomina di policy, indici, constraint e trigger. Dati preservati.
--   2. clients.client_type + clients.attributes (campi NON sensibili).
--      client_clinical.attributes per i campi sensibili (RLS: niente accountant).
--   3. companies.sector (settore scelto all'onboarding).
--   4. client_field_definitions: campi personalizzati per company/tipo cliente.
--   5. seed_client_field_defaults(company, sector): preset per settore;
--      applicato come 'dentale' agli studi esistenti.
-- Depends on: 20261016130000_accountant_rls.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Rinomina tabelle, colonne, constraint, indici, trigger, policy
-- ----------------------------------------------------------------------------
ALTER TABLE public.patients         RENAME TO clients;
ALTER TABLE public.patient_clinical RENAME TO client_clinical;
ALTER TABLE public.client_clinical  RENAME COLUMN patient_id TO client_id;

ALTER TABLE public.clients RENAME CONSTRAINT patients_pkey                TO clients_pkey;
ALTER TABLE public.clients RENAME CONSTRAINT patients_company_id_code_key TO clients_company_id_code_key;
ALTER TABLE public.clients RENAME CONSTRAINT patients_id_company_id_key   TO clients_id_company_id_key;
ALTER TABLE public.clients RENAME CONSTRAINT patients_company_id_fkey     TO clients_company_id_fkey;
ALTER TABLE public.clients RENAME CONSTRAINT patients_created_by_fkey     TO clients_created_by_fkey;
ALTER TABLE public.clients RENAME CONSTRAINT patients_gender_check        TO clients_gender_check;
ALTER INDEX public.idx_patients_created_by RENAME TO idx_clients_created_by;

ALTER TABLE public.client_clinical RENAME CONSTRAINT patient_clinical_pkey            TO client_clinical_pkey;
ALTER TABLE public.client_clinical RENAME CONSTRAINT patient_clinical_company_id_fkey TO client_clinical_company_id_fkey;
ALTER TABLE public.client_clinical RENAME CONSTRAINT patient_clinical_patient_fkey    TO client_clinical_client_fkey;
ALTER INDEX public.idx_patient_clinical_company RENAME TO idx_client_clinical_company;

ALTER TRIGGER trg_patients_created_by           ON public.clients RENAME TO trg_clients_created_by;
ALTER TRIGGER trg_patients_immutable_company_id ON public.clients RENAME TO trg_clients_immutable_company_id;
ALTER TRIGGER trg_patients_immutable_created_by ON public.clients RENAME TO trg_clients_immutable_created_by;
ALTER TRIGGER trg_patients_updated_at           ON public.clients RENAME TO trg_clients_updated_at;
ALTER TRIGGER trg_patient_clinical_updated_at           ON public.client_clinical RENAME TO trg_client_clinical_updated_at;
ALTER TRIGGER trg_patient_clinical_immutable_company_id ON public.client_clinical RENAME TO trg_client_clinical_immutable_company_id;

-- Le espressioni delle policy seguono le rinomine (OID); cambiano solo i nomi.
ALTER POLICY "patients_select"               ON public.clients RENAME TO "clients_select";
ALTER POLICY "patients_insert"               ON public.clients RENAME TO "clients_insert";
ALTER POLICY "patients_update"               ON public.clients RENAME TO "clients_update";
ALTER POLICY "patients_delete"               ON public.clients RENAME TO "clients_delete";
ALTER POLICY "patients_insert_no_accountant" ON public.clients RENAME TO "clients_insert_no_accountant";
ALTER POLICY "patients_update_no_accountant" ON public.clients RENAME TO "clients_update_no_accountant";
ALTER POLICY "patients_delete_no_accountant" ON public.clients RENAME TO "clients_delete_no_accountant";
ALTER POLICY "patient_clinical_select" ON public.client_clinical RENAME TO "client_clinical_select";
ALTER POLICY "patient_clinical_insert" ON public.client_clinical RENAME TO "client_clinical_insert";
ALTER POLICY "patient_clinical_update" ON public.client_clinical RENAME TO "client_clinical_update";
ALTER POLICY "patient_clinical_delete" ON public.client_clinical RENAME TO "client_clinical_delete";

-- ----------------------------------------------------------------------------
-- 2. Tipo cliente e attributi
-- ----------------------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN sector TEXT NOT NULL DEFAULT 'generico'
  CONSTRAINT companies_sector_check CHECK (sector IN ('dentale', 'estetico', 'generico'));

-- Gli studi esistenti sono dentali.
UPDATE public.companies SET sector = 'dentale';

ALTER TABLE public.clients
  ADD COLUMN client_type TEXT  NOT NULL DEFAULT 'generico',
  ADD COLUMN attributes  JSONB NOT NULL DEFAULT '{}'
  CONSTRAINT clients_attributes_object CHECK (jsonb_typeof(attributes) = 'object');

UPDATE public.clients SET client_type = 'dentale';

-- Valori dei campi con sensitive = true: protetti dall'RLS di client_clinical.
ALTER TABLE public.client_clinical
  ADD COLUMN attributes JSONB NOT NULL DEFAULT '{}'
  CONSTRAINT client_clinical_attributes_object CHECK (jsonb_typeof(attributes) = 'object');

-- ----------------------------------------------------------------------------
-- 3. client_field_definitions
-- ----------------------------------------------------------------------------
CREATE TABLE public.client_field_definitions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_type TEXT        NOT NULL,
  key         TEXT        NOT NULL,
  label       TEXT        NOT NULL,
  type        TEXT        NOT NULL,
  options     JSONB       NOT NULL DEFAULT '[]',
  required    BOOLEAN     NOT NULL DEFAULT false,
  position    INTEGER     NOT NULL DEFAULT 0,
  sensitive   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT client_field_definitions_key_unique UNIQUE (company_id, client_type, key),
  CONSTRAINT client_field_definitions_type_check CHECK (type IN ('text', 'number', 'date', 'select', 'bool')),
  CONSTRAINT client_field_definitions_key_format CHECK (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  CONSTRAINT client_field_definitions_options_array CHECK (jsonb_typeof(options) = 'array')
);

CREATE INDEX idx_client_field_definitions_company ON public.client_field_definitions(company_id, client_type, position);

CREATE TRIGGER trg_client_field_definitions_updated_at
  BEFORE UPDATE ON public.client_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_client_field_definitions_immutable_company_id
  BEFORE UPDATE ON public.client_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

-- ----------------------------------------------------------------------------
-- 4. Preset per settore (SECURITY INVOKER: valgono le policy di scrittura)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_client_field_defaults(p_company_id UUID, p_sector TEXT)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  INSERT INTO public.client_field_definitions
    (company_id, client_type, key, label, type, options, required, position, sensitive)
  SELECT p_company_id, p_sector, d.key, d.label, d.type, d.options, d.required, d.position, d.sensitive
  FROM (VALUES
    ('dentale',  'referral_source',  'Come ci ha conosciuto', 'select', '["Passaparola","Web","Social","Altro"]'::jsonb, false, 10, false),
    ('dentale',  'referring_dentist','Dentista inviante',     'text',   '[]'::jsonb, false, 20, false),
    ('dentale',  'privacy_consent',  'Consenso privacy',      'bool',   '[]'::jsonb, true,  30, false),
    ('dentale',  'allergies',        'Allergie',              'text',   '[]'::jsonb, false, 40, true),
    ('dentale',  'anticoagulants',   'Terapia anticoagulante','bool',   '[]'::jsonb, false, 50, true),
    ('estetico', 'referral_source',  'Come ci ha conosciuto', 'select', '["Passaparola","Web","Social","Altro"]'::jsonb, false, 10, false),
    ('estetico', 'skin_type',        'Tipo di pelle',         'select', '["Normale","Secca","Grassa","Mista","Sensibile"]'::jsonb, false, 20, false),
    ('estetico', 'privacy_consent',  'Consenso privacy',      'bool',   '[]'::jsonb, true,  30, false),
    ('estetico', 'allergies',        'Allergie',              'text',   '[]'::jsonb, false, 40, true),
    ('generico', 'referral_source',  'Come ci ha conosciuto', 'select', '["Passaparola","Web","Social","Altro"]'::jsonb, false, 10, false),
    ('generico', 'privacy_consent',  'Consenso privacy',      'bool',   '[]'::jsonb, true,  20, false),
    ('generico', 'notes',            'Note',                  'text',   '[]'::jsonb, false, 30, false)
  ) AS d(sector, key, label, type, options, required, position, sensitive)
  WHERE d.sector = p_sector
  ON CONFLICT (company_id, client_type, key) DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.seed_client_field_defaults(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_client_field_defaults(UUID, TEXT) TO authenticated;

-- Preset dentale per gli studi esistenti (migration: gira come owner, bypassa RLS).
SELECT public.seed_client_field_defaults(id, 'dentale') FROM public.companies;

-- ----------------------------------------------------------------------------
-- 5. RLS client_field_definitions (dopo il seed degli studi esistenti)
-- ----------------------------------------------------------------------------
ALTER TABLE public.client_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_field_definitions FORCE  ROW LEVEL SECURITY;

-- Lettura: tutti i membri (anche accountant, per rendere i campi non sensibili).
CREATE POLICY "client_field_definitions_select" ON public.client_field_definitions
  FOR SELECT USING (company_id IN (SELECT public.get_my_company_ids()));

-- Scrittura: solo owner/admin.
CREATE POLICY "client_field_definitions_insert" ON public.client_field_definitions
  FOR INSERT WITH CHECK (public.get_my_role_in_company(company_id) IN ('owner', 'admin'));

CREATE POLICY "client_field_definitions_update" ON public.client_field_definitions
  FOR UPDATE USING (public.get_my_role_in_company(company_id) IN ('owner', 'admin'))
  WITH CHECK (public.get_my_role_in_company(company_id) IN ('owner', 'admin'));

CREATE POLICY "client_field_definitions_delete" ON public.client_field_definitions
  FOR DELETE USING (public.get_my_role_in_company(company_id) IN ('owner', 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_field_definitions TO authenticated;
REVOKE ALL ON public.client_field_definitions FROM anon;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
