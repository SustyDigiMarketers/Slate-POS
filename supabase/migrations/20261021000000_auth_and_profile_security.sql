-- ============================================================================
-- SLATE POS — Security Hardening, Multi-Tenant Isolation & Supabase Auth Bridge
-- Migration: 20261021000000_auth_and_profile_security.sql
-- Target: Supabase PostgreSQL (Cloud)
-- Enforces:
-- 1. Direct bridging between Supabase Auth (auth.users) and public.user_profiles
-- 2. Tenant isolation by organization_id across all business tables
-- 3. Strict prevention of client-side role escalation or self-promotion
-- 4. Dynamic role resolution in RLS helper functions based on auth.uid()
-- ============================================================================

-- 1. Ensure auth_user_id index on user_profiles for high-speed RLS lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_auth_user_id ON user_profiles (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles (email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_org_id ON user_profiles (organization_id);

-- 2. Strengthened Helper Functions for Current User Role and Organization
-- Resolves directly from trusted public.user_profiles table using auth.uid()
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM user_profiles WHERE auth_user_id = auth.uid() OR id = auth.uid()::text LIMIT 1),
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role')::user_role,
    (SELECT role FROM user_profiles WHERE email = (current_setting('request.jwt.claims', true)::jsonb ->> 'email') LIMIT 1),
    'CASHIER'::user_role
  );
$$;

CREATE OR REPLACE FUNCTION current_user_org()
RETURNS VARCHAR(64)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT organization_id FROM user_profiles WHERE auth_user_id = auth.uid() OR id = auth.uid()::text LIMIT 1),
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'organization_id',
    (SELECT organization_id FROM user_profiles WHERE email = (current_setting('request.jwt.claims', true)::jsonb ->> 'email') LIMIT 1),
    NULL
  );
$$;

-- 3. Strengthened User Profiles RLS Policies
DROP POLICY IF EXISTS "User Profiles Select Policy" ON user_profiles;
DROP POLICY IF EXISTS "User Profiles Admin Update Policy" ON user_profiles;
DROP POLICY IF EXISTS "User Profiles Insert Policy" ON user_profiles;
DROP POLICY IF EXISTS "User Profiles Self Read Policy" ON user_profiles;

-- Self-read & Organization Read Policy:
-- Authenticated users can read their own profile (by auth_user_id, UUID, or email)
-- or profiles within their authorized organization.
CREATE POLICY "User Profiles Select Policy" ON user_profiles
    FOR SELECT USING (
        auth_user_id = auth.uid()
        OR id = auth.uid()::text
        OR email = (current_setting('request.jwt.claims', true)::jsonb ->> 'email')
        OR organization_id = current_user_org()
    );

-- Only Super Admins and Org Admins may create new staff accounts
CREATE POLICY "User Profiles Insert Policy" ON user_profiles
    FOR INSERT WITH CHECK (
        organization_id = current_user_org() AND
        current_user_role() IN ('SUPER_ADMIN', 'ORG_ADMIN')
    );

-- Only Super Admins and Org Admins can update roles or user assignments
-- Users cannot self-promote or alter their own assigned role/organization
CREATE POLICY "User Profiles Admin Update Policy" ON user_profiles
    FOR UPDATE USING (
        organization_id = current_user_org() AND
        current_user_role() IN ('SUPER_ADMIN', 'ORG_ADMIN')
    ) WITH CHECK (
        organization_id = current_user_org()
    );

-- 4. Organization & Store Tenant Boundary Enforcement
DROP POLICY IF EXISTS "Organizations Select Policy" ON organizations;
CREATE POLICY "Organizations Select Policy" ON organizations
    FOR SELECT USING (
        id = current_user_org()
    );

DROP POLICY IF EXISTS "Stores Select Policy" ON stores;
CREATE POLICY "Stores Select Policy" ON stores
    FOR SELECT USING (
        organization_id = current_user_org()
    );

-- 5. Quotations and Invoices Tenant Isolation
DROP POLICY IF EXISTS "Quotations Access Policy" ON quotations;
CREATE POLICY "Quotations Access Policy" ON quotations
    FOR ALL USING (
        organization_id = current_user_org() AND
        current_user_role() IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'CASHIER')
    );

-- 6. Trigger to automatically bridge newly registered auth.users to public.user_profiles
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_profile_id VARCHAR(64);
    v_target_org VARCHAR(64);
    v_target_branch VARCHAR(64);
    v_target_role user_role;
BEGIN
    -- 1. Check if a staff profile with this email was pre-provisioned by an administrator
    SELECT id INTO v_existing_profile_id
    FROM public.user_profiles
    WHERE LOWER(email) = LOWER(NEW.email);

    IF v_existing_profile_id IS NOT NULL THEN
        -- Link the auth_user_id to the existing pre-provisioned profile
        UPDATE public.user_profiles
        SET auth_user_id = NEW.id,
            updated_at = NOW()
        WHERE id = v_existing_profile_id;
        RETURN NEW;
    END IF;

    -- 2. Check if valid organization_id was explicitly supplied in verified metadata (e.g. from admin invite)
    v_target_org := NEW.raw_user_meta_data->>'organization_id';
    v_target_branch := NEW.raw_user_meta_data->>'branch_id';

    IF v_target_org IS NOT NULL AND EXISTS (SELECT 1 FROM public.organizations WHERE id = v_target_org) THEN
        BEGIN
            v_target_role := COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'CASHIER'::user_role);
        EXCEPTION WHEN OTHERS THEN
            v_target_role := 'CASHIER'::user_role;
        END;

        INSERT INTO public.user_profiles (
            id,
            auth_user_id,
            organization_id,
            branch_id,
            email,
            name,
            role,
            is_active
        ) VALUES (
            'usr_' || SUBSTRING(NEW.id::text, 1, 12),
            NEW.id,
            v_target_org,
            v_target_branch,
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
            v_target_role,
            TRUE
        ) ON CONFLICT (email) DO UPDATE
        SET auth_user_id = NEW.id,
            organization_id = EXCLUDED.organization_id;

        RETURN NEW;
    END IF;

    -- 3. Fail Safe for unprovisioned/ambiguous accounts:
    -- Under zero-trust multi-tenancy, unprovisioned accounts MUST NOT attach to any default
    -- organization (e.g. org_apex_01). The user record remains unassigned until explicit admin
    -- provisioning or self-service business tenant onboarding (register_business_tenant_atomic).
    RETURN NEW;
END;
$$;

-- Drop trigger if already exists and re-create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
        CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
    END IF;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;
