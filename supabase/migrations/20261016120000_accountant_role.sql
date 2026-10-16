-- ============================================================================
-- Migration: accountant_role
-- Description: aggiunge il ruolo 'accountant' (assistente contabile) a
--              company_members.role. Se esiste già un check constraint sul
--              ruolo lo sostituisce, altrimenti lo crea.
-- Depends on: 20261013120000_integration.sql
-- NOTA: le policy RLS non cambiano qui: 'accountant' è trattato come membro
--       non privilegiato. Il controllo di accesso applicativo è in lib/auth/permissions.ts.
-- ============================================================================

DO $$
DECLARE
  v_con RECORD;
BEGIN
  FOR v_con IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.company_members'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.company_members DROP CONSTRAINT %I', v_con.conname);
  END LOOP;
END $$;

ALTER TABLE public.company_members
  ADD CONSTRAINT company_members_role_check
  CHECK (role IN ('owner', 'admin', 'member', 'accountant'));

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
