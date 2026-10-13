-- ============================================================================
-- Migration: init_saas_core
-- Description: Multitenant SaaS schema derived from TypeScript interfaces
--              (calendar.ts, maintenance.ts, messaging.ts, quotes.ts)
-- ============================================================================

-- ============================================================================
-- 0. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ============================================================================
-- 1. HELPER: auto-update updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. ENUM TYPES
-- ============================================================================

-- calendar.ts
CREATE TYPE public.event_source AS ENUM (
  'google_calendar',
  'apple_calendar',
  'manual',
  'ai_secretary'
);

CREATE TYPE public.reminder_priority AS ENUM ('high', 'medium', 'low');
CREATE TYPE public.reminder_status  AS ENUM ('active', 'resolved', 'archived');

-- maintenance.ts
CREATE TYPE public.task_priority AS ENUM ('high', 'medium', 'low');
CREATE TYPE public.task_column   AS ENUM ('todo', 'in_progress', 'done');

-- messaging.ts
CREATE TYPE public.message_from AS ENUM ('contact', 'user', 'ai_draft');

-- quotes.ts
CREATE TYPE public.quote_status AS ENUM (
  'pending_ai',
  'quote_sent',
  'approved',
  'declined'
);

-- ============================================================================
-- 3. TABLES
-- ============================================================================

-- --------------------------------------------------------------------------
-- 3a. companies  (tenant root – referenced by every other table)
-- --------------------------------------------------------------------------
CREATE TABLE public.companies (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  slug            TEXT        NOT NULL UNIQUE,  -- URL-friendly identifier
  custom_metadata JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3b. company_members  (maps auth.users → company)
-- --------------------------------------------------------------------------
CREATE TABLE public.company_members (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL,          -- auth.uid()
  role            TEXT        NOT NULL DEFAULT 'member',
  custom_metadata JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (company_id, user_id)
);

CREATE INDEX idx_company_members_user    ON public.company_members(user_id);
CREATE INDEX idx_company_members_company ON public.company_members(company_id);

CREATE TRIGGER trg_company_members_updated_at
  BEFORE UPDATE ON public.company_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3c. calendar_events  (from CalendarEventData)
-- --------------------------------------------------------------------------
CREATE TABLE public.calendar_events (
  id               UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID               NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title            TEXT               NOT NULL,
  event_time       TIMESTAMPTZ        NOT NULL,
  event_date       DATE               NOT NULL,
  color            TEXT,                           -- hex / css colour token
  source           public.event_source NOT NULL DEFAULT 'manual',
  description      TEXT               NOT NULL DEFAULT '',
  is_ai_generated  BOOLEAN            NOT NULL DEFAULT FALSE,
  custom_metadata  JSONB              NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ        NOT NULL DEFAULT now()
);

CREATE INDEX idx_calendar_events_company ON public.calendar_events(company_id);
CREATE INDEX idx_calendar_events_date    ON public.calendar_events(company_id, event_date);

CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3d. reminders  (from ReminderData)
-- --------------------------------------------------------------------------
CREATE TABLE public.reminders (
  id              UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID                    NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  text            TEXT                    NOT NULL,
  remind_at       TIMESTAMPTZ             NOT NULL,
  priority        public.reminder_priority NOT NULL DEFAULT 'medium',
  status          public.reminder_status   NOT NULL DEFAULT 'active',
  custom_metadata JSONB                   NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ             NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ             NOT NULL DEFAULT now()
);

CREATE INDEX idx_reminders_company ON public.reminders(company_id);
CREATE INDEX idx_reminders_status  ON public.reminders(company_id, status);

CREATE TRIGGER trg_reminders_updated_at
  BEFORE UPDATE ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3e. tasks  (from Task + Column context)
-- --------------------------------------------------------------------------
CREATE TABLE public.tasks (
  id               UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID                NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title            TEXT                NOT NULL,
  priority         public.task_priority NOT NULL DEFAULT 'medium',
  is_ai            BOOLEAN             NOT NULL DEFAULT FALSE,
  description      TEXT                NOT NULL DEFAULT '',
  assigned_to      UUID,               -- nullable FK to a user/member
  column_id        public.task_column   NOT NULL DEFAULT 'todo',
  position         INT                 NOT NULL DEFAULT 0,  -- ordering within column
  custom_metadata  JSONB               NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ         NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_company ON public.tasks(company_id);
CREATE INDEX idx_tasks_column  ON public.tasks(company_id, column_id);

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3f. conversations  (from ChatListItem)
-- --------------------------------------------------------------------------
CREATE TABLE public.conversations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  snippet          TEXT        NOT NULL DEFAULT '',
  last_message_at  TIMESTAMPTZ,
  unread_count     INT         NOT NULL DEFAULT 0,
  is_ai            BOOLEAN     NOT NULL DEFAULT FALSE,
  initials         TEXT,
  color            TEXT,
  custom_metadata  JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_company ON public.conversations(company_id);

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3g. messages  (from Message)
-- --------------------------------------------------------------------------
CREATE TABLE public.messages (
  id               UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID               NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id  UUID               NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_type      public.message_from NOT NULL,
  body             TEXT               NOT NULL,
  sent_at          TIMESTAMPTZ        NOT NULL DEFAULT now(),
  custom_metadata  JSONB              NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ        NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_company         ON public.messages(company_id);
CREATE INDEX idx_messages_conversation    ON public.messages(conversation_id);
CREATE INDEX idx_messages_conv_sent_at    ON public.messages(conversation_id, sent_at);

CREATE TRIGGER trg_messages_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3h. quotes  (from Quote)
-- --------------------------------------------------------------------------
CREATE TABLE public.quotes (
  id               UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID               NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client           TEXT               NOT NULL,
  quote_type       TEXT               NOT NULL DEFAULT '',
  quote_date       DATE               NOT NULL DEFAULT CURRENT_DATE,
  status           public.quote_status NOT NULL DEFAULT 'pending_ai',
  amount           NUMERIC(12,2)      NOT NULL DEFAULT 0,
  description      TEXT               NOT NULL DEFAULT '',
  is_ai_generated  BOOLEAN            NOT NULL DEFAULT FALSE,
  custom_metadata  JSONB              NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ        NOT NULL DEFAULT now()
);

CREATE INDEX idx_quotes_company ON public.quotes(company_id);
CREATE INDEX idx_quotes_status  ON public.quotes(company_id, status);

CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 4. ROW LEVEL SECURITY – ENABLE + FORCE on ALL tables
-- ============================================================================
ALTER TABLE public.companies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies        FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.company_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members  FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.calendar_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events  FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.reminders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders        FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks            FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.conversations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations    FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages         FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.quotes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes           FORCE  ROW LEVEL SECURITY;

-- ============================================================================
-- 5. HELPER: resolve current user's company_ids (SECURITY DEFINER bypasses RLS)
--    This avoids infinite recursion when company_members itself has FORCE RLS.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_my_company_ids()
RETURNS SETOF UUID AS $$
  SELECT company_id FROM public.company_members WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- 6. RLS POLICIES – tenant isolation via get_my_company_ids()
-- ============================================================================

-- ---- companies ----
CREATE POLICY "companies_select" ON public.companies
  FOR SELECT USING (
    id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "companies_insert" ON public.companies
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "companies_update" ON public.companies
  FOR UPDATE USING (
    id IN (SELECT public.get_my_company_ids())
  ) WITH CHECK (
    id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "companies_delete" ON public.companies
  FOR DELETE USING (
    id IN (SELECT public.get_my_company_ids())
  );

-- ---- company_members ----
CREATE POLICY "company_members_select" ON public.company_members
  FOR SELECT USING (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "company_members_insert" ON public.company_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "company_members_update" ON public.company_members
  FOR UPDATE USING (
    company_id IN (SELECT public.get_my_company_ids())
  ) WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "company_members_delete" ON public.company_members
  FOR DELETE USING (
    company_id IN (SELECT public.get_my_company_ids())
  );

-- ---- calendar_events ----
CREATE POLICY "calendar_events_select" ON public.calendar_events
  FOR SELECT USING (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "calendar_events_insert" ON public.calendar_events
  FOR INSERT WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "calendar_events_update" ON public.calendar_events
  FOR UPDATE USING (
    company_id IN (SELECT public.get_my_company_ids())
  ) WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "calendar_events_delete" ON public.calendar_events
  FOR DELETE USING (
    company_id IN (SELECT public.get_my_company_ids())
  );

-- ---- reminders ----
CREATE POLICY "reminders_select" ON public.reminders
  FOR SELECT USING (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "reminders_insert" ON public.reminders
  FOR INSERT WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "reminders_update" ON public.reminders
  FOR UPDATE USING (
    company_id IN (SELECT public.get_my_company_ids())
  ) WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "reminders_delete" ON public.reminders
  FOR DELETE USING (
    company_id IN (SELECT public.get_my_company_ids())
  );

-- ---- tasks ----
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT USING (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE USING (
    company_id IN (SELECT public.get_my_company_ids())
  ) WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE USING (
    company_id IN (SELECT public.get_my_company_ids())
  );

-- ---- conversations ----
CREATE POLICY "conversations_select" ON public.conversations
  FOR SELECT USING (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "conversations_insert" ON public.conversations
  FOR INSERT WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "conversations_update" ON public.conversations
  FOR UPDATE USING (
    company_id IN (SELECT public.get_my_company_ids())
  ) WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "conversations_delete" ON public.conversations
  FOR DELETE USING (
    company_id IN (SELECT public.get_my_company_ids())
  );

-- ---- messages ----
CREATE POLICY "messages_select" ON public.messages
  FOR SELECT USING (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE USING (
    company_id IN (SELECT public.get_my_company_ids())
  ) WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "messages_delete" ON public.messages
  FOR DELETE USING (
    company_id IN (SELECT public.get_my_company_ids())
  );

-- ---- quotes ----
CREATE POLICY "quotes_select" ON public.quotes
  FOR SELECT USING (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "quotes_insert" ON public.quotes
  FOR INSERT WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "quotes_update" ON public.quotes
  FOR UPDATE USING (
    company_id IN (SELECT public.get_my_company_ids())
  ) WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
  );

CREATE POLICY "quotes_delete" ON public.quotes
  FOR DELETE USING (
    company_id IN (SELECT public.get_my_company_ids())
  );

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
