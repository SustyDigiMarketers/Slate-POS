-- ==============================================================================
-- SLATE POS — Additive Migration: Centralized Organization Branding Assets
-- Migration: 20261127000000_org_branding_assets.sql
--
-- Safety Guarantees:
-- 1. Purely additive & idempotent (ADD COLUMN IF NOT EXISTS).
-- 2. Preserves all existing organizations, branches, user profiles, and data.
-- 3. Keeps tenant-isolated RLS strictly scoped via current_user_org_id() and
--    ORG_SETTINGS_MANAGE permission checks.
-- ==============================================================================

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS login_banner_url TEXT;

COMMENT ON COLUMN public.organizations.logo_url IS 'Centralized 500x500 PNG company brand logo (HTTPS URL or base64 data URI)';
COMMENT ON COLUMN public.organizations.login_banner_url IS 'Optional custom login showcase visual URL';

-- Ensure tenant-scoped UPDATE policy exists on organizations for authorized admins
DROP POLICY IF EXISTS "Organizations Update Policy" ON public.organizations;
CREATE POLICY "Organizations Update Policy" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    id = public.current_user_org_id()
    AND public.has_permission('ORG_SETTINGS_MANAGE')
  )
  WITH CHECK (
    id = public.current_user_org_id()
    AND public.has_permission('ORG_SETTINGS_MANAGE')
  );

COMMIT;
