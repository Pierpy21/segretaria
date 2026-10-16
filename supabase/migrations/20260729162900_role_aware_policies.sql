-- ============================================================================
-- Migration: role_aware_policies
-- Description: Implements role-based RLS policies (PoLP levels L2–L5).
--              Adds created_by tracking, role change protection trigger,
--              and replaces 16 flat policies with role-aware equivalents.
--
-- Depends on: 20260715214055_init_saas_core.sql
-- ============================================================================

-- ============================================================================
-- 1. ADD created_by COLUMN TO ALL 6 DATA TABLES
--    Nullable for backward compatibility with existing records.
--    Auto-populated by trigger on INSERT (see section 3).
-- ============================================================================
ALTER TABLE public.calendar_events ADD COLUMN created_by UUID;
ALTER TABLE public.reminders       ADD COLUMN created_by UUID;
ALTER TABLE public.tasks           ADD COLUMN created_by UUID;
ALTER TABLE public.conversations   ADD COLUMN created_by UUID;
ALTER TABLE public.messages        ADD COLUMN created_by UUID;
ALTER TABLE public.quotes          ADD COLUMN created_by UUID;

-- ============================================================================
-- 2. HELPER FUNCTION: get_my_role_in_company()
--    Returns the current user's role ('owner','admin','member') in a company.
--    SECURITY DEFINER bypasses RLS on company_members (same pattern as
--    get_my_company_ids) to avoid infinite recursion.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_my_role_in_company(p_company_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM public.company_members
  WHERE user_id = auth.uid() AND company_id = p_company_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- 3. TRIGGER FUNCTION: auto-populate created_by on INSERT
--    Sets created_by = auth.uid() if the caller didn't supply it.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_created_by()
RETURNS TRIGGER AS $$
BEGIN
  -- Force created_by to the current user to prevent spoofing
  NEW.created_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calendar_events_created_by
  BEFORE INSERT ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

CREATE TRIGGER trg_reminders_created_by
  BEFORE INSERT ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

CREATE TRIGGER trg_tasks_created_by
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

CREATE TRIGGER trg_conversations_created_by
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

CREATE TRIGGER trg_messages_created_by
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

CREATE TRIGGER trg_quotes_created_by
  BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

-- ============================================================================
-- 3.5. TRIGGER FUNCTION: protect created_by immutability on UPDATE
--      Ensures that once a record is created, its author cannot be changed.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.protect_created_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    NEW.created_by = OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calendar_events_immutable_created_by
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_created_by();

CREATE TRIGGER trg_reminders_immutable_created_by
  BEFORE UPDATE ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION public.protect_created_by();

CREATE TRIGGER trg_tasks_immutable_created_by
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.protect_created_by();

CREATE TRIGGER trg_conversations_immutable_created_by
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.protect_created_by();

CREATE TRIGGER trg_messages_immutable_created_by
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.protect_created_by();

CREATE TRIGGER trg_quotes_immutable_created_by
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.protect_created_by();

-- ============================================================================
-- 4. TRIGGER FUNCTION: protect role changes on company_members
--    Only users with role = 'owner' in the target company can change
--    another member's role. Uses get_my_role_in_company() which is
--    SECURITY DEFINER and handles RLS bypass internally.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.protect_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF public.get_my_role_in_company(NEW.company_id) != 'owner' THEN
      RAISE EXCEPTION 'Only company owners can change member roles'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_company_members_protect_role
  BEFORE UPDATE ON public.company_members
  FOR EACH ROW EXECUTE FUNCTION public.protect_role_change();

-- ============================================================================
-- 5. DROP FLAT POLICIES (to be replaced with role-aware versions)
--    SELECT and INSERT policies remain unchanged.
-- ============================================================================

-- companies (UPDATE + DELETE)
DROP POLICY IF EXISTS "companies_update" ON public.companies;
DROP POLICY IF EXISTS "companies_delete" ON public.companies;

-- company_members (UPDATE + DELETE)
DROP POLICY IF EXISTS "company_members_update" ON public.company_members;
DROP POLICY IF EXISTS "company_members_delete" ON public.company_members;

-- calendar_events (UPDATE + DELETE)
DROP POLICY IF EXISTS "calendar_events_update" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events_delete" ON public.calendar_events;

-- reminders (UPDATE + DELETE)
DROP POLICY IF EXISTS "reminders_update" ON public.reminders;
DROP POLICY IF EXISTS "reminders_delete" ON public.reminders;

-- tasks (UPDATE + DELETE)
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;

-- conversations (UPDATE + DELETE)
DROP POLICY IF EXISTS "conversations_update" ON public.conversations;
DROP POLICY IF EXISTS "conversations_delete" ON public.conversations;

-- messages (UPDATE + DELETE)
DROP POLICY IF EXISTS "messages_update" ON public.messages;
DROP POLICY IF EXISTS "messages_delete" ON public.messages;

-- quotes (UPDATE + DELETE)
DROP POLICY IF EXISTS "quotes_update" ON public.quotes;
DROP POLICY IF EXISTS "quotes_delete" ON public.quotes;

-- ============================================================================
-- 6. RECREATE POLICIES WITH ROLE-AWARE LOGIC
--
-- Pattern for infrastructure tables (companies, company_members):
--   UPDATE/DELETE restricted by role.
--
-- Pattern for 6 data tables:
--   owner/admin → full CRUD on all tenant records
--   member      → full CRUD only on own records (created_by = auth.uid())
-- ============================================================================

-- ---- companies ----

-- UPDATE: only owner or admin can modify company details (name, slug, etc.)
CREATE POLICY "companies_update" ON public.companies
  FOR UPDATE USING (
    id IN (SELECT public.get_my_company_ids())
    AND public.get_my_role_in_company(id) IN ('owner', 'admin')
  ) WITH CHECK (
    id IN (SELECT public.get_my_company_ids())
  );

-- DELETE: only owner can destroy the company (cascades all data)
CREATE POLICY "companies_delete" ON public.companies
  FOR DELETE USING (
    id IN (SELECT public.get_my_company_ids())
    AND public.get_my_role_in_company(id) = 'owner'
  );

-- ---- company_members ----

-- UPDATE: owner/admin can update any member; member can update only self.
-- Role changes are additionally blocked by the protect_role_change trigger.
CREATE POLICY "company_members_update" ON public.company_members
  FOR UPDATE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) IN ('owner', 'admin')
      OR user_id = auth.uid()
    )
  ) WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

-- DELETE: owner/admin can remove any member; member can only remove self (leave).
CREATE POLICY "company_members_delete" ON public.company_members
  FOR DELETE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) IN ('owner', 'admin')
      OR user_id = auth.uid()
    )
  );

-- ---- calendar_events ----

CREATE POLICY "calendar_events_update" ON public.calendar_events
  FOR UPDATE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) IN ('owner', 'admin')
      OR created_by = auth.uid()
    )
  ) WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "calendar_events_delete" ON public.calendar_events
  FOR DELETE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) IN ('owner', 'admin')
      OR created_by = auth.uid()
    )
  );

-- ---- reminders ----

CREATE POLICY "reminders_update" ON public.reminders
  FOR UPDATE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) IN ('owner', 'admin')
      OR created_by = auth.uid()
    )
  ) WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "reminders_delete" ON public.reminders
  FOR DELETE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) IN ('owner', 'admin')
      OR created_by = auth.uid()
    )
  );

-- ---- tasks ----

CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) IN ('owner', 'admin')
      OR created_by = auth.uid()
    )
  ) WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) IN ('owner', 'admin')
      OR created_by = auth.uid()
    )
  );

-- ---- conversations ----

CREATE POLICY "conversations_update" ON public.conversations
  FOR UPDATE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) IN ('owner', 'admin')
      OR created_by = auth.uid()
    )
  ) WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "conversations_delete" ON public.conversations
  FOR DELETE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) IN ('owner', 'admin')
      OR created_by = auth.uid()
    )
  );

-- ---- messages ----

CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) IN ('owner', 'admin')
      OR created_by = auth.uid()
    )
  ) WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "messages_delete" ON public.messages
  FOR DELETE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) IN ('owner', 'admin')
      OR created_by = auth.uid()
    )
  );

-- ---- quotes ----

CREATE POLICY "quotes_update" ON public.quotes
  FOR UPDATE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) IN ('owner', 'admin')
      OR created_by = auth.uid()
    )
  ) WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "quotes_delete" ON public.quotes
  FOR DELETE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) IN ('owner', 'admin')
      OR created_by = auth.uid()
    )
  );

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
