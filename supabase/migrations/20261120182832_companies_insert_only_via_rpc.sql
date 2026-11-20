-- ============================================================================
-- vuln-0008: creazione studi solo tramite public.create_company
--   - Rimuove l'INSERT diretto su companies via PostgREST (slug squatting,
--     bypass della regola "un solo studio per utente").
--   - create_company (SECURITY DEFINER, owner della tabella) resta l'unico
--     ingresso e ora valida anche nome e formato dello slug.
-- ============================================================================

DROP POLICY IF EXISTS "companies_insert" ON public.companies;
REVOKE INSERT ON public.companies FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_company(p_name TEXT, p_slug TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid  UUID := (SELECT auth.uid());
  v_id   UUID := gen_random_uuid();
  v_name TEXT := btrim(p_name);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta' USING ERRCODE = '42501';
  END IF;

  IF v_name IS NULL OR v_name = '' OR char_length(v_name) > 200 THEN
    RAISE EXCEPTION 'Nome dello studio non valido' USING ERRCODE = '22023';
  END IF;

  -- Formato generato dall'app: slugify(nome) + '-' + 6 hex casuali
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{6}$' OR char_length(p_slug) > 55 THEN
    RAISE EXCEPTION 'Slug dello studio non valido' USING ERRCODE = '22023';
  END IF;

  -- Serializza le chiamate concorrenti dello stesso utente (evita doppio studio)
  PERFORM pg_advisory_xact_lock(hashtext('create_company:' || v_uid::text));

  IF EXISTS (SELECT 1 FROM public.company_members WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'L''utente è già membro di uno studio'
      USING ERRCODE = '23505', CONSTRAINT = 'create_company_already_member';
  END IF;

  -- trg_companies_auto_enroll inserisce il creatore come 'owner'
  INSERT INTO public.companies (id, name, slug) VALUES (v_id, v_name, p_slug);

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_company(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_company(TEXT, TEXT) TO authenticated;
