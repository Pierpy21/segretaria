-- ============================================================================
-- Migration: company_onboarding_and_drizzle_safety
-- Description: Fixes the IDOR vulnerability in company_members insertion,
--              establishes a secure onboarding flow (chicken-and-egg fix).
-- ============================================================================

-- 1. DROP the insecure company_members_insert policy
--    This policy previously allowed ANY user to join ANY company if they knew the ID.
DROP POLICY IF EXISTS "company_members_insert" ON public.company_members;

-- 2. CREATE secure company_members_insert policy (Invitations)
--    Only an existing owner or admin of the company can add new members.
CREATE POLICY "company_members_insert" ON public.company_members
  FOR INSERT WITH CHECK (
    company_id IN (SELECT public.get_my_company_ids())
    AND public.get_my_role_in_company(company_id) IN ('owner', 'admin')
  );

-- 3. HELPER FUNCTION: auto-enroll creator as owner
--    SECURITY DEFINER bypasses RLS so the creator can insert into company_members
--    even though they are not yet a member of the new company.
CREATE OR REPLACE FUNCTION public.auto_enroll_company_creator()
RETURNS TRIGGER AS $$
BEGIN
  -- We assume auth.uid() is the creator.
  -- If auth.uid() is null (e.g. service role creation), we skip to avoid errors,
  -- or we could enforce it. We'll only insert if auth.uid() is present.
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.company_members (company_id, user_id, role)
    VALUES (NEW.id, auth.uid(), 'owner');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. TRIGGER: fire auto_enroll_company_creator AFTER INSERT on companies
CREATE TRIGGER trg_companies_auto_enroll
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.auto_enroll_company_creator();
