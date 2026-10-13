-- ============================================================================
-- Migration: security_hardening_polp
-- Description: Consolidates P0 and P1 security fixes into a single migration.
-- ============================================================================

-- ============================================================================
-- FIX P0.1: Escalation di privilegio via INSERT su company_members
-- ============================================================================
-- 1. Unique constraint to prevent duplicate memberships
CREATE UNIQUE INDEX IF NOT EXISTS company_members_company_user_uniq
  ON public.company_members (company_id, user_id);

-- 2. Restrict INSERT so that the granted role is constrained
DROP POLICY IF EXISTS "company_members_insert" ON public.company_members;
CREATE POLICY "company_members_insert" ON public.company_members
  FOR INSERT WITH CHECK (
    public.get_my_role_in_company(company_id) IN ('owner', 'admin')
    AND (
      role <> 'owner'
      OR public.get_my_role_in_company(company_id) = 'owner'
    )
  );

-- ============================================================================
-- FIX P1.4: ON DELETE behavior per integrità referenziale
-- ============================================================================
-- Alter user_id to CASCADE (membership makes no sense without a user)
ALTER TABLE public.company_members
  DROP CONSTRAINT IF EXISTS company_members_user_id_fkey,
  ADD CONSTRAINT company_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- For all 6 data tables, created_by must be ON DELETE SET NULL
ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_created_by_fkey,
  ADD CONSTRAINT calendar_events_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.reminders
  DROP CONSTRAINT IF EXISTS reminders_created_by_fkey,
  ADD CONSTRAINT reminders_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_created_by_fkey,
  ADD CONSTRAINT tasks_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_created_by_fkey,
  ADD CONSTRAINT conversations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_created_by_fkey,
  ADD CONSTRAINT messages_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS quotes_created_by_fkey,
  ADD CONSTRAINT quotes_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================================
-- FIX P0.2 & P1.3: SECURITY DEFINER + search_path & System Context Support
-- ============================================================================

-- get_my_company_ids
CREATE OR REPLACE FUNCTION public.get_my_company_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT company_id FROM public.company_members WHERE user_id = (SELECT auth.uid());
$$;

-- get_my_role_in_company
CREATE OR REPLACE FUNCTION public.get_my_role_in_company(p_company_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT role FROM public.company_members
  WHERE user_id = (SELECT auth.uid()) AND company_id = p_company_id;
$$;

-- set_created_by (Handles system context when auth.uid() is null)
CREATE OR REPLACE FUNCTION public.set_created_by()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL THEN
    NEW.created_by = (SELECT auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- protect_created_by
CREATE OR REPLACE FUNCTION public.protect_created_by()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    NEW.created_by = OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

-- protect_role_change
CREATE OR REPLACE FUNCTION public.protect_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF public.get_my_role_in_company(NEW.company_id) != 'owner' THEN
      RAISE EXCEPTION 'Only company owners can change member roles'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- auto_enroll_company_creator (Handles system context when auth.uid() is null)
CREATE OR REPLACE FUNCTION public.auto_enroll_company_creator()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL THEN
    INSERT INTO public.company_members (company_id, user_id, role)
    VALUES (NEW.id, (SELECT auth.uid()), 'owner');
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- FIX P0.3: Contenimento cross-tenant (company_id immutabile via trigger)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.protect_company_id()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'company_id is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calendar_events_immutable_company_id BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();
CREATE TRIGGER trg_reminders_immutable_company_id BEFORE UPDATE ON public.reminders FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();
CREATE TRIGGER trg_tasks_immutable_company_id BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();
CREATE TRIGGER trg_conversations_immutable_company_id BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();
CREATE TRIGGER trg_messages_immutable_company_id BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();
CREATE TRIGGER trg_quotes_immutable_company_id BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.protect_company_id();

-- ============================================================================
-- FIX P1.1: Protezione dell'ultimo owner
-- ============================================================================
CREATE OR REPLACE FUNCTION public.protect_last_owner()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  owner_count INT;
BEGIN
  -- We only care if an owner is being removed or demoted
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' THEN
      SELECT COUNT(*) INTO owner_count FROM public.company_members WHERE company_id = OLD.company_id AND role = 'owner' FOR UPDATE;
      IF owner_count <= 1 THEN
        RAISE EXCEPTION 'Cannot remove the last owner of a company' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'owner' AND NEW.role != 'owner' THEN
      SELECT COUNT(*) INTO owner_count FROM public.company_members WHERE company_id = OLD.company_id AND role = 'owner' FOR UPDATE;
      IF owner_count <= 1 THEN
        RAISE EXCEPTION 'Cannot demote the last owner of a company' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_protect_last_owner
  BEFORE UPDATE OR DELETE ON public.company_members
  FOR EACH ROW EXECUTE FUNCTION public.protect_last_owner();

-- ============================================================================
-- FIX P1.2: Policy DELETE granulare su company_members
-- ============================================================================
DROP POLICY IF EXISTS "company_members_delete" ON public.company_members;
CREATE POLICY "company_members_delete" ON public.company_members
  FOR DELETE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      -- 1. Owner can remove anyone except the last owner (handled by trigger)
      public.get_my_role_in_company(company_id) = 'owner'
      -- 2. Admin can only remove members
      OR (public.get_my_role_in_company(company_id) = 'admin' AND role = 'member')
      -- 3. Anyone can remove themselves
      OR user_id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- FIX P1.5: Indici e riscrittura EXISTS per funzioni correlate
-- ============================================================================
-- Indexes for performance
CREATE INDEX IF NOT EXISTS company_members_user_company_role_idx ON public.company_members (user_id, company_id, role);
CREATE INDEX IF NOT EXISTS calendar_events_company_id_idx ON public.calendar_events (company_id);
CREATE INDEX IF NOT EXISTS calendar_events_created_by_idx ON public.calendar_events (created_by);
CREATE INDEX IF NOT EXISTS reminders_company_id_idx ON public.reminders (company_id);
CREATE INDEX IF NOT EXISTS reminders_created_by_idx ON public.reminders (created_by);
CREATE INDEX IF NOT EXISTS tasks_company_id_idx ON public.tasks (company_id);
CREATE INDEX IF NOT EXISTS tasks_created_by_idx ON public.tasks (created_by);
CREATE INDEX IF NOT EXISTS conversations_company_id_idx ON public.conversations (company_id);
CREATE INDEX IF NOT EXISTS conversations_created_by_idx ON public.conversations (created_by);
CREATE INDEX IF NOT EXISTS messages_company_id_idx ON public.messages (company_id);
CREATE INDEX IF NOT EXISTS messages_created_by_idx ON public.messages (created_by);
CREATE INDEX IF NOT EXISTS quotes_company_id_idx ON public.quotes (company_id);
CREATE INDEX IF NOT EXISTS quotes_created_by_idx ON public.quotes (created_by);

-- Rewrite UPDATE/DELETE policies to use EXISTS instead of get_my_role_in_company inline
-- (Reduces n-query correlated function executions)

-- calendar_events
DROP POLICY IF EXISTS "calendar_events_update" ON public.calendar_events;
CREATE POLICY "calendar_events_update" ON public.calendar_events FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = calendar_events.company_id AND m.user_id = (SELECT auth.uid()) AND m.role IN ('owner','admin'))
  OR created_by = (SELECT auth.uid())
) WITH CHECK (company_id IN (SELECT public.get_my_company_ids()));

DROP POLICY IF EXISTS "calendar_events_delete" ON public.calendar_events;
CREATE POLICY "calendar_events_delete" ON public.calendar_events FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = calendar_events.company_id AND m.user_id = (SELECT auth.uid()) AND m.role IN ('owner','admin'))
  OR created_by = (SELECT auth.uid())
);

-- reminders
DROP POLICY IF EXISTS "reminders_update" ON public.reminders;
CREATE POLICY "reminders_update" ON public.reminders FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = reminders.company_id AND m.user_id = (SELECT auth.uid()) AND m.role IN ('owner','admin'))
  OR created_by = (SELECT auth.uid())
) WITH CHECK (company_id IN (SELECT public.get_my_company_ids()));

DROP POLICY IF EXISTS "reminders_delete" ON public.reminders;
CREATE POLICY "reminders_delete" ON public.reminders FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = reminders.company_id AND m.user_id = (SELECT auth.uid()) AND m.role IN ('owner','admin'))
  OR created_by = (SELECT auth.uid())
);

-- tasks
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = tasks.company_id AND m.user_id = (SELECT auth.uid()) AND m.role IN ('owner','admin'))
  OR created_by = (SELECT auth.uid())
) WITH CHECK (company_id IN (SELECT public.get_my_company_ids()));

DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = tasks.company_id AND m.user_id = (SELECT auth.uid()) AND m.role IN ('owner','admin'))
  OR created_by = (SELECT auth.uid())
);

-- conversations
DROP POLICY IF EXISTS "conversations_update" ON public.conversations;
CREATE POLICY "conversations_update" ON public.conversations FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = conversations.company_id AND m.user_id = (SELECT auth.uid()) AND m.role IN ('owner','admin'))
  OR created_by = (SELECT auth.uid())
) WITH CHECK (company_id IN (SELECT public.get_my_company_ids()));

DROP POLICY IF EXISTS "conversations_delete" ON public.conversations;
CREATE POLICY "conversations_delete" ON public.conversations FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = conversations.company_id AND m.user_id = (SELECT auth.uid()) AND m.role IN ('owner','admin'))
  OR created_by = (SELECT auth.uid())
);

-- messages
DROP POLICY IF EXISTS "messages_update" ON public.messages;
CREATE POLICY "messages_update" ON public.messages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = messages.company_id AND m.user_id = (SELECT auth.uid()) AND m.role IN ('owner','admin'))
  OR created_by = (SELECT auth.uid())
) WITH CHECK (company_id IN (SELECT public.get_my_company_ids()));

DROP POLICY IF EXISTS "messages_delete" ON public.messages;
CREATE POLICY "messages_delete" ON public.messages FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = messages.company_id AND m.user_id = (SELECT auth.uid()) AND m.role IN ('owner','admin'))
  OR created_by = (SELECT auth.uid())
);

-- quotes
DROP POLICY IF EXISTS "quotes_update" ON public.quotes;
CREATE POLICY "quotes_update" ON public.quotes FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = quotes.company_id AND m.user_id = (SELECT auth.uid()) AND m.role IN ('owner','admin'))
  OR created_by = (SELECT auth.uid())
) WITH CHECK (company_id IN (SELECT public.get_my_company_ids()));

DROP POLICY IF EXISTS "quotes_delete" ON public.quotes;
CREATE POLICY "quotes_delete" ON public.quotes FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = quotes.company_id AND m.user_id = (SELECT auth.uid()) AND m.role IN ('owner','admin'))
  OR created_by = (SELECT auth.uid())
);
