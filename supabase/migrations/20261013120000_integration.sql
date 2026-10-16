-- ============================================================================
-- Migration: integration
-- Description: hardening company_members, pulizia indici duplicati,
--              agenda sincronizzata (calendar_events + calendar_connections),
--              anagrafica pazienti, grant/revoke, create_company per onboarding.
-- Depends on: 20260729181500_security_hardening_polp.sql
-- ============================================================================

-- ============================================================================
-- 1a. company_members: identità immutabile + UPDATE solo owner/admin
-- ============================================================================
CREATE OR REPLACE FUNCTION public.protect_company_member_identity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'user_id and company_id are immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_company_members_immutable_identity
  BEFORE UPDATE ON public.company_members
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_member_identity();

DROP POLICY IF EXISTS "company_members_update" ON public.company_members;
CREATE POLICY "company_members_update" ON public.company_members
  FOR UPDATE USING (
    public.get_my_role_in_company(company_id) IN ('owner', 'admin')
  ) WITH CHECK (
    public.get_my_role_in_company(company_id) IN ('owner', 'admin')
  );

-- ============================================================================
-- 1b. Pulizia indici duplicati
--     - company_members_company_user_uniq duplica UNIQUE(company_id, user_id)
--       (company_members_company_id_user_id_key, da init_saas_core)
--     - *_company_id_idx duplicano idx_*_company (init_saas_core)
-- ============================================================================
DROP INDEX IF EXISTS public.company_members_company_user_uniq;
DROP INDEX IF EXISTS public.calendar_events_company_id_idx;
DROP INDEX IF EXISTS public.reminders_company_id_idx;
DROP INDEX IF EXISTS public.tasks_company_id_idx;
DROP INDEX IF EXISTS public.conversations_company_id_idx;
DROP INDEX IF EXISTS public.messages_company_id_idx;
DROP INDEX IF EXISTS public.quotes_company_id_idx;

-- ============================================================================
-- 1c. calendar_events: schema per agenda sincronizzata
--     Tabella vuota: il backfill di end_at è difensivo.
-- ============================================================================
DROP INDEX IF EXISTS public.idx_calendar_events_date;

ALTER TABLE public.calendar_events RENAME COLUMN event_time TO start_at;

ALTER TABLE public.calendar_events ADD COLUMN end_at TIMESTAMPTZ;
UPDATE public.calendar_events SET end_at = start_at + INTERVAL '1 hour' WHERE end_at IS NULL;
ALTER TABLE public.calendar_events ALTER COLUMN end_at SET NOT NULL;

ALTER TABLE public.calendar_events DROP COLUMN event_date;

ALTER TABLE public.calendar_events
  ADD COLUMN all_day          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN external_provider TEXT CHECK (external_provider IN ('google', 'apple')),
  ADD COLUMN external_id       TEXT,
  ADD COLUMN external_etag     TEXT,
  ADD CONSTRAINT calendar_events_external_ref_chk
    CHECK ((external_provider IS NULL) = (external_id IS NULL)),
  ADD CONSTRAINT calendar_events_end_after_start_chk
    CHECK (end_at >= start_at);

CREATE INDEX idx_calendar_events_start ON public.calendar_events(company_id, start_at);

CREATE UNIQUE INDEX calendar_events_external_uniq
  ON public.calendar_events(company_id, external_provider, external_id)
  WHERE external_id IS NOT NULL;

-- ============================================================================
-- 1e. calendar_connections: una connessione per provider per azienda
--     credentials_encrypted: payload AES-256-GCM cifrato lato app.
-- ============================================================================
CREATE TABLE public.calendar_connections (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider              TEXT        NOT NULL CHECK (provider IN ('google', 'apple')),
  account               TEXT,
  calendar_id           TEXT,       -- Google calendar id oppure URL CalDAV
  calendar_name         TEXT,
  credentials_encrypted TEXT        NOT NULL,
  last_sync_at          TIMESTAMPTZ,
  created_by            UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT calendar_connections_company_id_provider_key UNIQUE (company_id, provider)
);

CREATE TRIGGER trg_calendar_connections_updated_at
  BEFORE UPDATE ON public.calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_calendar_connections_created_by
  BEFORE INSERT ON public.calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

CREATE TRIGGER trg_calendar_connections_immutable_created_by
  BEFORE UPDATE ON public.calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.protect_created_by();

CREATE TRIGGER trg_calendar_connections_immutable_company_id
  BEFORE UPDATE ON public.calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_connections FORCE  ROW LEVEL SECURITY;

CREATE POLICY "calendar_connections_select" ON public.calendar_connections
  FOR SELECT USING (
    public.get_my_role_in_company(company_id) IN ('owner', 'admin')
  );

CREATE POLICY "calendar_connections_insert" ON public.calendar_connections
  FOR INSERT WITH CHECK (
    public.get_my_role_in_company(company_id) IN ('owner', 'admin')
  );

CREATE POLICY "calendar_connections_update" ON public.calendar_connections
  FOR UPDATE USING (
    public.get_my_role_in_company(company_id) IN ('owner', 'admin')
  ) WITH CHECK (
    public.get_my_role_in_company(company_id) IN ('owner', 'admin')
  );

CREATE POLICY "calendar_connections_delete" ON public.calendar_connections
  FOR DELETE USING (
    public.get_my_role_in_company(company_id) IN ('owner', 'admin')
  );

-- ============================================================================
-- 1f. patients: anagrafica pazienti (id applicativo = code, es. PT-2026-0142)
-- ============================================================================
CREATE TABLE public.patients (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code             TEXT        NOT NULL,
  name             TEXT        NOT NULL,
  gender           TEXT        NOT NULL CHECK (gender IN ('F', 'M')),
  avatar           TEXT        NOT NULL DEFAULT '',
  date_of_birth    DATE        NOT NULL,
  phone            TEXT        NOT NULL DEFAULT '',
  email            TEXT        NOT NULL DEFAULT '',
  address          TEXT        NOT NULL DEFAULT '',
  fiscal_code      TEXT        NOT NULL DEFAULT '',
  recommendation   TEXT        NOT NULL DEFAULT '',
  insurance        JSONB       NOT NULL DEFAULT '{}',
  previous_visit   JSONB       NOT NULL DEFAULT '{}',
  selected_tooth   JSONB       NOT NULL DEFAULT '{}',
  xray_findings    JSONB       NOT NULL DEFAULT '[]',
  treatments       JSONB       NOT NULL DEFAULT '[]',
  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  custom_metadata  JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT patients_company_id_code_key UNIQUE (company_id, code)
);

CREATE INDEX idx_patients_created_by ON public.patients(created_by);

CREATE TRIGGER trg_patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_patients_created_by
  BEFORE INSERT ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

CREATE TRIGGER trg_patients_immutable_created_by
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.protect_created_by();

CREATE TRIGGER trg_patients_immutable_company_id
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients FORCE  ROW LEVEL SECURITY;

CREATE POLICY "patients_select" ON public.patients
  FOR SELECT USING (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "patients_insert" ON public.patients
  FOR INSERT WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "patients_update" ON public.patients
  FOR UPDATE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) IN ('owner', 'admin')
      OR created_by = (SELECT auth.uid())
    )
  ) WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "patients_delete" ON public.patients
  FOR DELETE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) IN ('owner', 'admin')
      OR created_by = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- 1h. Onboarding: create_company
--     INSERT ... RETURNING su companies fallirebbe: la policy SELECT vede
--     l'appartenenza solo dopo il trigger AFTER (auto_enroll), quindi l'id
--     viene generato in funzione e nessuna riga viene riletta.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_company(p_name TEXT, p_slug TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid UUID := (SELECT auth.uid());
  v_id  UUID := gen_random_uuid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta' USING ERRCODE = '42501';
  END IF;

  -- Serializza le chiamate concorrenti dello stesso utente (evita doppio studio)
  PERFORM pg_advisory_xact_lock(hashtext('create_company:' || v_uid::text));

  IF EXISTS (SELECT 1 FROM public.company_members WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'L''utente è già membro di uno studio'
      USING ERRCODE = '23505', CONSTRAINT = 'create_company_already_member';
  END IF;

  -- trg_companies_auto_enroll inserisce il creatore come 'owner'
  -- (eventuale collisione su companies.slug -> 23505 con constraint companies_slug_key)
  INSERT INTO public.companies (id, name, slug) VALUES (v_id, p_name, p_slug);

  RETURN v_id;
END;
$$;

-- ============================================================================
-- 1g. Grant e revoke
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_connections, public.patients TO authenticated;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- Helper usati dalle policy: solo utenti autenticati
REVOKE EXECUTE ON FUNCTION public.get_my_company_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_role_in_company(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_company_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role_in_company(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_company(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_company(TEXT, TEXT) TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
