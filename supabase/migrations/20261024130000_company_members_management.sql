-- ============================================================================
-- Migration: company_members_management
-- Description: gestione membri dello studio (C2, sopra Fase B). Gerarchia dei
--              ruoli di sistema (owner gestisce tutti; admin solo member/accountant),
--              inviti per email con token hashato (company_invitations), funzioni
--              SECURITY DEFINER per anteprima e accettazione invito.
--              Le policy di company_invitations usano has_permission(members:manage).
-- Depends on: 20261024120000_gommista.sql (rinominata da 20261022120000 nel merge con main)
-- ============================================================================

-- ============================================================================
-- 1. protect_role_change: gerarchia dei ruoli di sistema
--    - nessuna modifica di ruolo: consentito
--    - contesto senza auth.uid() (service role / job di sistema): comportamento invariato
--    - owner: consentito
--    - admin: solo member|accountant -> member|accountant
--    - altrimenti: 42501
-- ============================================================================
CREATE OR REPLACE FUNCTION public.protect_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor_role TEXT;
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- Contesto senza utente autenticato: comportamento invariato
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  v_actor_role := public.get_my_role_in_company(NEW.company_id);

  IF v_actor_role = 'owner' THEN
    RETURN NEW;
  END IF;

  IF v_actor_role = 'admin'
     AND OLD.role IN ('member', 'accountant')
     AND NEW.role IN ('member', 'accountant') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only company owners can change member roles'
    USING ERRCODE = '42501';
END;
$$;

-- ============================================================================
-- 1b. protect_last_owner: fix. La versione in 20260729181500 usava
--     "SELECT COUNT(*) ... FOR UPDATE", non ammesso da Postgres (0A000): ogni
--     declassamento/rimozione di un owner falliva, anche con più owner.
--     Ora: lock delle righe owner, poi conteggio. Messaggi invariati.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.protect_last_owner()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  owner_count INT;
BEGIN
  IF OLD.role = 'owner'
     AND (TG_OP = 'DELETE' OR NEW.role IS DISTINCT FROM 'owner') THEN
    PERFORM 1 FROM public.company_members
      WHERE company_id = OLD.company_id AND role = 'owner'
      FOR UPDATE;
    SELECT count(*) INTO owner_count FROM public.company_members
      WHERE company_id = OLD.company_id AND role = 'owner';
    IF owner_count <= 1 THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Cannot remove the last owner of a company' USING ERRCODE = '42501';
      END IF;
      RAISE EXCEPTION 'Cannot demote the last owner of a company' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. company_members_delete: owner rimuove chiunque (tranne l'ultimo owner,
--    via trigger); admin rimuove solo member/accountant; ciascuno può uscire.
-- ============================================================================
DROP POLICY IF EXISTS "company_members_delete" ON public.company_members;
CREATE POLICY "company_members_delete" ON public.company_members
  FOR DELETE USING (
    company_id IN (SELECT public.get_my_company_ids())
    AND (
      public.get_my_role_in_company(company_id) = 'owner'
      OR (
        public.get_my_role_in_company(company_id) = 'admin'
        AND role IN ('member', 'accountant')
      )
      OR user_id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- 2b. company_members_insert: nessun INSERT diretto. Si entra in uno studio
--     solo creandolo (auto_enroll_company_creator) o accettando un invito
--     (accept_company_invitation): entrambe SECURITY DEFINER, bypassano RLS.
-- ============================================================================
DROP POLICY IF EXISTS "company_members_insert" ON public.company_members;
CREATE POLICY "company_members_insert" ON public.company_members
  FOR INSERT WITH CHECK (false);

-- ============================================================================
-- 3. company_invitations: inviti. Il token in chiaro non e' mai salvato:
--    solo token_hash = sha256 hex (lib/auth/invitation-token.ts).
-- ============================================================================
CREATE TABLE public.company_invitations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email        TEXT        NOT NULL CHECK (email = lower(email) AND char_length(email) <= 254),
  role         TEXT        NOT NULL CHECK (role IN ('admin', 'member', 'accountant')),
  token_hash   TEXT        NOT NULL UNIQUE,
  invited_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  accepted_at  TIMESTAMPTZ,
  accepted_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX company_invitations_pending_uniq
  ON public.company_invitations (company_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX company_invitations_company_id_idx
  ON public.company_invitations (company_id);

ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_invitations FORCE  ROW LEVEL SECURITY;

-- Gerarchia: owner gestisce admin|member|accountant; admin solo member|accountant.
-- members:manage e' posseduto solo da owner/admin (system_role_permissions).
DROP POLICY IF EXISTS "company_invitations_select" ON public.company_invitations;
CREATE POLICY "company_invitations_select" ON public.company_invitations
  FOR SELECT USING (
    public.has_permission(company_id, 'members:manage')
  );

DROP POLICY IF EXISTS "company_invitations_insert" ON public.company_invitations;
CREATE POLICY "company_invitations_insert" ON public.company_invitations
  FOR INSERT WITH CHECK (
    invited_by = (SELECT auth.uid())
    AND public.has_permission(company_id, 'members:manage')
    AND (
      public.get_my_role_in_company(company_id) = 'owner'
      OR role IN ('member', 'accountant')
    )
  );

-- UPDATE serve solo a revocare: solo inviti ancora aperti, e solo verso revoked_at valorizzato
-- (un invito revocato o accettato non può essere riattivato).
DROP POLICY IF EXISTS "company_invitations_update" ON public.company_invitations;
CREATE POLICY "company_invitations_update" ON public.company_invitations
  FOR UPDATE USING (
    accepted_at IS NULL
    AND revoked_at IS NULL
    AND public.has_permission(company_id, 'members:manage')
    AND (
      public.get_my_role_in_company(company_id) = 'owner'
      OR role IN ('member', 'accountant')
    )
  ) WITH CHECK (
    revoked_at IS NOT NULL
    AND public.has_permission(company_id, 'members:manage')
    AND (
      public.get_my_role_in_company(company_id) = 'owner'
      OR role IN ('member', 'accountant')
    )
  );

-- Nessuna policy DELETE: gli inviti si revocano (revoked_at), non si cancellano.
-- token_hash NON è leggibile dai client: è la credenziale di accept, usata solo dentro
-- le RPC SECURITY DEFINER (get_company_invitation / accept_company_invitation).
REVOKE ALL ON public.company_invitations FROM PUBLIC, anon, authenticated;
GRANT INSERT ON public.company_invitations TO authenticated;
GRANT SELECT (id, company_id, email, role, invited_by, created_at, expires_at, accepted_at, accepted_by, revoked_at)
  ON public.company_invitations TO authenticated;
GRANT UPDATE (revoked_at) ON public.company_invitations TO authenticated;

-- ============================================================================
-- 4. get_company_invitation: anteprima dell'invito per token_hash
--    status: accepted | revoked | expired | pending
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_company_invitation(p_token_hash TEXT)
RETURNS TABLE(company_name TEXT, role TEXT, email TEXT, expires_at TIMESTAMPTZ, status TEXT, email_matches BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid        UUID := (SELECT auth.uid());
  v_user_email TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta' USING ERRCODE = '42501';
  END IF;

  SELECT lower(u.email)::text INTO v_user_email
  FROM auth.users u
  WHERE u.id = v_uid;

  RETURN QUERY
  SELECT
    c.name::text,
    i.role,
    i.email,
    i.expires_at,
    (CASE
      WHEN i.accepted_at IS NOT NULL THEN 'accepted'
      WHEN i.revoked_at IS NOT NULL THEN 'revoked'
      WHEN i.expires_at <= now() THEN 'expired'
      ELSE 'pending'
    END)::text,
    COALESCE(i.email = v_user_email, false)
  FROM public.company_invitations i
  JOIN public.companies c ON c.id = i.company_id
  WHERE i.token_hash = p_token_hash;
END;
$$;

-- ============================================================================
-- 5. accept_company_invitation: accetta l'invito per l'utente corrente
--    - invito non valido (non trovato/revocato/accettato/scaduto): P0002
--    - email dell'utente diversa dall'invito: 42501
--    - utente gia' membro di uno studio: 23505 (constraint accept_invitation_already_member)
--    Inserisce il ruolo di sistema (custom_role_id resta NULL).
--    Lock condiviso con create_company per evitare doppie appartenenze concorrenti.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.accept_company_invitation(p_token_hash TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid        UUID := (SELECT auth.uid());
  v_user_email TEXT;
  v_inv        public.company_invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('create_company:' || v_uid::text));

  SELECT * INTO v_inv
  FROM public.company_invitations i
  WHERE i.token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND
     OR v_inv.revoked_at IS NOT NULL
     OR v_inv.accepted_at IS NOT NULL
     OR v_inv.expires_at <= now() THEN
    RAISE EXCEPTION 'invitation_invalid' USING ERRCODE = 'P0002';
  END IF;

  SELECT lower(u.email)::text INTO v_user_email
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_user_email IS NULL OR v_user_email <> v_inv.email THEN
    RAISE EXCEPTION 'invitation_email_mismatch' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.company_members m WHERE m.user_id = v_uid) THEN
    RAISE EXCEPTION 'L''utente e'' gia'' membro di uno studio'
      USING ERRCODE = '23505', CONSTRAINT = 'accept_invitation_already_member';
  END IF;

  INSERT INTO public.company_members (company_id, user_id, role)
  VALUES (v_inv.company_id, v_uid, v_inv.role);

  UPDATE public.company_invitations
  SET accepted_at = now(), accepted_by = v_uid
  WHERE id = v_inv.id;

  RETURN v_inv.company_id;
END;
$$;

-- ============================================================================
-- 6. Grant: funzioni invocabili solo da utenti autenticati
--    (list_company_members non esiste: la lista usa get_company_members, Fase B)
-- ============================================================================
REVOKE ALL ON FUNCTION public.get_company_invitation(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_company_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_invitation(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(TEXT) TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
