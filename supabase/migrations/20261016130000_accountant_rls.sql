-- ============================================================================
-- Migration: accountant_rls
-- Description: allinea le policy RLS a ROLE_PERMISSIONS (lib/auth/permissions.ts)
--              per il ruolo 'accountant' (assistente contabile).
--   accountant: patients:read (senza clinical:read), quotes:read/write,
--               payments:*, reports:read. Nessun accesso a chat, agenda,
--               promemoria, task, né scrittura pazienti.
--   1. Dati clinici spostati da patients a patient_clinical (RLS: niente accountant).
--   2. Policy RESTRICTIVE che escludono accountant da patients (scrittura),
--      calendar_events, reminders, tasks, conversations, messages.
--   3. quotes_update/delete: accountant equiparato a owner/admin.
-- Depends on: 20261016120000_accountant_role.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. patient_clinical
-- ----------------------------------------------------------------------------
-- Vincolo di supporto per la FK composita (patient_id, company_id): la riga
-- clinica non può puntare a un paziente di un'altra azienda.
ALTER TABLE public.patients
  ADD CONSTRAINT patients_id_company_id_key UNIQUE (id, company_id);

CREATE TABLE public.patient_clinical (
  patient_id      UUID        PRIMARY KEY,
  company_id      UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recommendation  TEXT        NOT NULL DEFAULT '',
  previous_visit  JSONB       NOT NULL DEFAULT '{}',
  selected_tooth  JSONB       NOT NULL DEFAULT '{}',
  xray_findings   JSONB       NOT NULL DEFAULT '[]',
  treatments      JSONB       NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT patient_clinical_patient_fkey FOREIGN KEY (patient_id, company_id)
    REFERENCES public.patients(id, company_id) ON DELETE CASCADE
);

CREATE INDEX idx_patient_clinical_company ON public.patient_clinical(company_id);

CREATE TRIGGER trg_patient_clinical_updated_at
  BEFORE UPDATE ON public.patient_clinical
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_patient_clinical_immutable_company_id
  BEFORE UPDATE ON public.patient_clinical
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

INSERT INTO public.patient_clinical
  (patient_id, company_id, recommendation, previous_visit, selected_tooth, xray_findings, treatments)
SELECT id, company_id, recommendation, previous_visit, selected_tooth, xray_findings, treatments
FROM public.patients;

ALTER TABLE public.patients
  DROP COLUMN recommendation,
  DROP COLUMN previous_visit,
  DROP COLUMN selected_tooth,
  DROP COLUMN xray_findings,
  DROP COLUMN treatments;

ALTER TABLE public.patient_clinical ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_clinical FORCE  ROW LEVEL SECURITY;

-- clinical:read = owner/admin/member
CREATE POLICY "patient_clinical_select" ON public.patient_clinical
  FOR SELECT USING (
    public.get_my_role_in_company(company_id) IN ('owner', 'admin', 'member')
  );

CREATE POLICY "patient_clinical_insert" ON public.patient_clinical
  FOR INSERT WITH CHECK (
    public.get_my_role_in_company(company_id) IN ('owner', 'admin', 'member')
  );

-- Stessa regola di patients_update: owner/admin oppure chi ha creato il paziente.
CREATE POLICY "patient_clinical_update" ON public.patient_clinical
  FOR UPDATE USING (
    public.get_my_role_in_company(company_id) IN ('owner', 'admin')
    OR (
      public.get_my_role_in_company(company_id) = 'member'
      AND EXISTS (
        SELECT 1 FROM public.patients p
        WHERE p.id = patient_clinical.patient_id
          AND p.created_by = (SELECT auth.uid())
      )
    )
  ) WITH CHECK (
    public.get_my_role_in_company(company_id) IN ('owner', 'admin', 'member')
  );

-- La cancellazione avviene in cascata da patients; policy esplicita per coerenza.
CREATE POLICY "patient_clinical_delete" ON public.patient_clinical
  FOR DELETE USING (
    public.get_my_role_in_company(company_id) IN ('owner', 'admin')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_clinical TO authenticated;
REVOKE ALL ON public.patient_clinical FROM anon;

-- ----------------------------------------------------------------------------
-- 2. Esclusione di accountant (policy RESTRICTIVE: in AND con quelle esistenti)
--    IS DISTINCT FROM: per i non membri get_my_role_in_company è NULL e
--    decidono già le policy permissive.
-- ----------------------------------------------------------------------------
-- patients: lettura sì (patients:read), scrittura no (manca patients:write)
CREATE POLICY "patients_insert_no_accountant" ON public.patients
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.get_my_role_in_company(company_id) IS DISTINCT FROM 'accountant');

CREATE POLICY "patients_update_no_accountant" ON public.patients
  AS RESTRICTIVE FOR UPDATE
  USING (public.get_my_role_in_company(company_id) IS DISTINCT FROM 'accountant');

CREATE POLICY "patients_delete_no_accountant" ON public.patients
  AS RESTRICTIVE FOR DELETE
  USING (public.get_my_role_in_company(company_id) IS DISTINCT FROM 'accountant');

-- calendar:*, reminders:*, tasks:*, chat:* non assegnati ad accountant
DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['calendar_events', 'reminders', 'tasks', 'conversations', 'messages']
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL
         USING (public.get_my_role_in_company(company_id) IS DISTINCT FROM ''accountant'')
         WITH CHECK (public.get_my_role_in_company(company_id) IS DISTINCT FROM ''accountant'')',
      v_table || '_no_accountant', v_table
    );
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. quotes: accountant ha quotes:write su tutti i preventivi dell'azienda
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "quotes_update" ON public.quotes;
CREATE POLICY "quotes_update" ON public.quotes FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = quotes.company_id AND m.user_id = (SELECT auth.uid()) AND m.role IN ('owner', 'admin', 'accountant'))
  OR created_by = (SELECT auth.uid())
) WITH CHECK (company_id IN (SELECT public.get_my_company_ids()));

DROP POLICY IF EXISTS "quotes_delete" ON public.quotes;
CREATE POLICY "quotes_delete" ON public.quotes FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = quotes.company_id AND m.user_id = (SELECT auth.uid()) AND m.role IN ('owner', 'admin', 'accountant'))
  OR created_by = (SELECT auth.uid())
);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
