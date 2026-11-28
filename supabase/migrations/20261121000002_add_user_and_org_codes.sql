-- ==============================================================================
-- SLATE POS — Additive Migration: Add 6-Digit User Codes & Alphanumeric Org Codes
-- Migration: 20261121000002_add_user_and_org_codes.sql
-- ==============================================================================

-- 1. Add organization_code to organizations table
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS organization_code VARCHAR(32);

-- Backfill existing organizations with unique alphanumeric codes
UPDATE public.organizations
SET organization_code = UPPER(SUBSTRING(md5(id || random()::text) FROM 1 for 10))
WHERE organization_code IS NULL;

ALTER TABLE public.organizations
ALTER COLUMN organization_code SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'organizations_organization_code_key'
    ) THEN
        ALTER TABLE public.organizations ADD CONSTRAINT organizations_organization_code_key UNIQUE (organization_code);
    END IF;
END $$;

-- 2. Add user_code to user_profiles table (6-digit numeric string)
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS user_code VARCHAR(6);

-- Backfill existing user profiles with unique 6-digit numeric codes
DO $$
DECLARE
    r RECORD;
    i INT := 1;
    v_code VARCHAR(6);
BEGIN
    FOR r IN SELECT id FROM public.user_profiles WHERE user_code IS NULL LOOP
        v_code := LPAD((i % 1000000)::TEXT, 6, '0');
        -- Ensure uniqueness
        WHILE EXISTS (SELECT 1 FROM public.user_profiles WHERE user_code = v_code AND id <> r.id) LOOP
            i := i + 1;
            v_code := LPAD((i % 1000000)::TEXT, 6, '0');
        END LOOP;
        
        UPDATE public.user_profiles
        SET user_code = v_code
        WHERE id = r.id;
        
        i := i + 1;
    END LOOP;
END $$;

ALTER TABLE public.user_profiles
ALTER COLUMN user_code SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_user_code_key'
    ) THEN
        ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_user_code_key UNIQUE (user_code);
    END IF;
END $$;

-- 3. Update register_business_tenant_atomic to generate and persist organization_code and user_code
CREATE OR REPLACE FUNCTION public.register_business_tenant_atomic(
    p_org_id VARCHAR,
    p_org_name VARCHAR,
    p_legal_name VARCHAR,
    p_trade_name VARCHAR,
    p_gstin VARCHAR,
    p_pan VARCHAR,
    p_state VARCHAR,
    p_state_code VARCHAR,
    p_auth_user_id UUID,
    p_user_email VARCHAR,
    p_user_name VARCHAR,
    p_user_phone VARCHAR,
    p_initial_plan_id VARCHAR DEFAULT 'plan_growth_monthly'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_auth_id UUID;
    v_is_service_role BOOLEAN;
    v_existing_org VARCHAR(64);
    v_existing_org_code VARCHAR(32);
    v_org_code VARCHAR(32);
    v_user_code VARCHAR(6);
    v_profile_id VARCHAR(64);
    v_branch_id VARCHAR(64);
    v_plan_exists VARCHAR(64);
    v_clean_gstin VARCHAR(15);
    v_clean_pan VARCHAR(10);
    i INT := 0;
BEGIN
    v_caller_auth_id := auth.uid();
    v_is_service_role := public.is_trusted_service_role();

    -- Strict caller session binding
    IF v_caller_auth_id IS NOT NULL THEN
        p_auth_user_id := v_caller_auth_id;
    ELSIF NOT v_is_service_role THEN
        RAISE EXCEPTION 'Authentication required: valid user session required for business registration';
    END IF;

    IF p_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'A valid authenticated user ID must be provided';
    END IF;

    v_clean_gstin := NULLIF(TRIM(p_gstin), '');
    IF v_clean_gstin IN ('OPTIONAL', 'NONE', 'UNREGISTERED', 'NULL') THEN
        v_clean_gstin := NULL;
    END IF;

    v_clean_pan := NULLIF(TRIM(p_pan), '');
    IF v_clean_pan IN ('OPTIONAL', 'NONE', 'UNREGISTERED', 'NULL') THEN
        v_clean_pan := NULL;
    END IF;

    -- Idempotent retry guard for already-onboarded users
    SELECT organization_id, branch_id, id, user_code
    INTO v_existing_org, v_branch_id, v_profile_id, v_user_code
    FROM public.user_profiles
    WHERE auth_user_id = p_auth_user_id OR LOWER(email) = LOWER(p_user_email)
    LIMIT 1;

    IF v_existing_org IS NOT NULL THEN
        IF v_user_code IS NULL THEN
            i := 0;
            LOOP
                v_user_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
                EXIT WHEN NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE user_code = v_user_code);
                i := i + 1;
                IF i > 100 THEN
                    v_user_code := LPAD((ABS(HASHTEXT(p_auth_user_id::text || clock_timestamp()::text)) % 1000000)::TEXT, 6, '0');
                    EXIT;
                END IF;
            END LOOP;
        END IF;

        UPDATE public.user_profiles
        SET auth_user_id = COALESCE(auth_user_id, p_auth_user_id),
            user_code = COALESCE(user_code, v_user_code),
            updated_at = NOW()
        WHERE id = v_profile_id;

        SELECT organization_code INTO v_existing_org_code
        FROM public.organizations
        WHERE id = v_existing_org;

        RETURN jsonb_build_object(
            'success', TRUE,
            'isExisting', TRUE,
            'organizationId', v_existing_org,
            'organizationCode', v_existing_org_code,
            'branchId', v_branch_id,
            'profileId', v_profile_id,
            'userId', v_profile_id,
            'userCode', v_user_code,
            'message', 'User is already associated with an active organization'
        );
    END IF;

    -- Verify plan exists
    SELECT id INTO v_plan_exists FROM public.subscription_plans WHERE id = p_initial_plan_id;
    IF v_plan_exists IS NULL THEN
        p_initial_plan_id := 'plan_growth_monthly';
    END IF;

    -- Generate unique organization code (alphanumeric)
    i := 0;
    LOOP
        v_org_code := UPPER(SUBSTRING(md5(random()::text || clock_timestamp()::text) FROM 1 FOR 10));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.organizations WHERE organization_code = v_org_code);
        i := i + 1;
        IF i > 100 THEN
            v_org_code := 'ORG' || TO_CHAR(EXTRACT(EPOCH FROM NOW()) * 1000, 'FM9999999999');
            EXIT;
        END IF;
    END LOOP;

    -- Insert Organization (real columns only)
    INSERT INTO public.organizations (
        id, name, legal_name, trade_name, gstin, pan, state, state_code,
        currency, fiscal_year_start, subscription_plan_id, organization_code,
        created_at, updated_at
    ) VALUES (
        p_org_id,
        p_org_name,
        COALESCE(NULLIF(TRIM(p_legal_name), ''), p_org_name),
        COALESCE(NULLIF(TRIM(p_trade_name), ''), p_org_name),
        v_clean_gstin,
        v_clean_pan,
        p_state,
        p_state_code,
        'INR',
        '04-01',
        p_initial_plan_id,
        v_org_code,
        NOW(),
        NOW()
    );

    -- Create Initial Flagship Branch
    v_branch_id := 'br_' || SUBSTRING(p_org_id FROM 1 FOR 16) || '_main';
    INSERT INTO public.stores (
        id, organization_id, code, name, city, state, address, phone, gstin,
        is_active, is_headquarters, max_terminals, created_at, updated_at
    ) VALUES (
        v_branch_id, p_org_id, 'MAIN-01', p_org_name || ' Main Store',
        p_state, p_state, 'Primary Registered Commercial Address', p_user_phone,
        v_clean_gstin, TRUE, TRUE, 4, NOW(), NOW()
    ) ON CONFLICT (id) DO NOTHING;

    -- Generate unique 6-digit numeric user code
    i := 0;
    LOOP
        v_user_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE user_code = v_user_code);
        i := i + 1;
        IF i > 100 THEN
            v_user_code := LPAD((ABS(HASHTEXT(random()::text || clock_timestamp()::text)) % 1000000)::TEXT, 6, '0');
            EXIT;
        END IF;
    END LOOP;

    v_profile_id := 'usr_' || SUBSTRING(p_auth_user_id::text FROM 1 FOR 8) || '_' || FLOOR(RANDOM() * 9000 + 1000)::text;

    -- Insert Verified Owner Profile (Role: ORG_ADMIN, never PLATFORM_MANAGE)
    INSERT INTO public.user_profiles (
        id, auth_user_id, organization_id, branch_id, email, name, phone, role,
        is_active, user_code, permissions, created_at, updated_at
    ) VALUES (
        v_profile_id,
        p_auth_user_id,
        p_org_id,
        v_branch_id,
        p_user_email,
        p_user_name,
        p_user_phone,
        'ORG_ADMIN',
        TRUE,
        v_user_code,
        ARRAY[
            'POS_USE', 'PRODUCT_VIEW', 'PRODUCT_CREATE', 'PRODUCT_EDIT', 'PRODUCT_COST_VIEW',
            'INVENTORY_ADJUST', 'CUSTOMER_VIEW', 'CUSTOMER_EDIT', 'SALES_VIEW', 'INVOICE_CREATE',
            'REFUND_CREATE', 'REFUND_APPROVE', 'REPORT_VIEW', 'REPORT_EXPORT', 'BUSINESS_SETTINGS',
            'STAFF_MANAGE', 'BRANCH_MANAGE', 'SUBSCRIPTION_MANAGE',
            'SUPPLIER_VIEW', 'SUPPLIER_EDIT', 'QUOTES_VIEW', 'INVOICE_VIEW', 'DELIVERY_MANAGE'
        ]::TEXT[],
        NOW(),
        NOW()
    ) ON CONFLICT (email) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id,
        user_code = COALESCE(public.user_profiles.user_code, EXCLUDED.user_code),
        organization_id = EXCLUDED.organization_id,
        branch_id = EXCLUDED.branch_id,
        updated_at = NOW();

    -- Create Initial Subscription Record (real columns only)
    INSERT INTO public.business_subscriptions (
        id, organization_id, plan_id, status, billing_interval,
        current_period_start, current_period_end, created_at, updated_at
    ) VALUES (
        'sub_' || p_org_id,
        p_org_id,
        p_initial_plan_id,
        'ACTIVE',
        'MONTHLY',
        NOW(),
        NOW() + INTERVAL '30 days',
        NOW(),
        NOW()
    ) ON CONFLICT (organization_id) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'organizationId', p_org_id,
        'organizationCode', v_org_code,
        'branchId', v_branch_id,
        'profileId', v_profile_id,
        'userId', v_profile_id,
        'userCode', v_user_code,
        'subscriptionStatus', 'ACTIVE',
        'trialEndsAt', (NOW() + INTERVAL '30 days')::text
    );
END;
$$;

REVOKE ALL ON FUNCTION public.register_business_tenant_atomic(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_business_tenant_atomic(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO authenticated, service_role;
