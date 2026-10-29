-- ============================================================================
-- SLATE POS — GSTIN/PAN Nullability, Onboarding Hardening & Test Tenant Provisioning
-- Migration: 20261102000000_repair_and_onboard_test_tenants.sql
-- Target: Supabase PostgreSQL (Cloud)
-- ============================================================================

-- 1. Schema Alterations: Allow nullable GSTIN & PAN for unregistered businesses
ALTER TABLE public.organizations ALTER COLUMN gstin DROP NOT NULL;
ALTER TABLE public.organizations ALTER COLUMN pan DROP NOT NULL;
ALTER TABLE public.stores ALTER COLUMN gstin DROP NOT NULL;

-- 2. Hardened Atomic Business Tenant Registration Procedure
CREATE OR REPLACE FUNCTION public.register_business_tenant_atomic(
    p_org_id VARCHAR(64),
    p_org_name VARCHAR(255),
    p_legal_name VARCHAR(255),
    p_trade_name VARCHAR(255),
    p_gstin VARCHAR(15),
    p_pan VARCHAR(10),
    p_state VARCHAR(100),
    p_state_code VARCHAR(2),
    p_auth_user_id UUID,
    p_user_email VARCHAR(255),
    p_user_name VARCHAR(255),
    p_user_phone VARCHAR(20),
    p_initial_plan_id VARCHAR(64) DEFAULT 'plan_growth_monthly'
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
    v_branch_id VARCHAR(64);
    v_profile_id VARCHAR(64);
    v_plan_exists VARCHAR(64);
    v_clean_gstin VARCHAR(15);
    v_clean_pan VARCHAR(10);
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

    -- Clean optional GSTIN and PAN inputs (convert empty string / whitespace to NULL)
    v_clean_gstin := NULLIF(TRIM(p_gstin), '');
    IF v_clean_gstin IN ('OPTIONAL', 'NONE', 'UNREGISTERED', 'NULL') THEN
        v_clean_gstin := NULL;
    END IF;

    v_clean_pan := NULLIF(TRIM(p_pan), '');
    IF v_clean_pan IN ('OPTIONAL', 'NONE', 'UNREGISTERED', 'NULL') THEN
        v_clean_pan := NULL;
    END IF;

    -- 1. Check if user is already onboarded (Idempotent retry guard)
    SELECT organization_id INTO v_existing_org
    FROM public.user_profiles
    WHERE auth_user_id = p_auth_user_id OR email = p_user_email
    LIMIT 1;

    IF v_existing_org IS NOT NULL THEN
        -- Link auth_user_id if missing
        UPDATE public.user_profiles
        SET auth_user_id = p_auth_user_id,
            updated_at = NOW()
        WHERE email = p_user_email AND (auth_user_id IS NULL OR auth_user_id <> p_auth_user_id);

        SELECT branch_id, id INTO v_branch_id, v_profile_id
        FROM public.user_profiles
        WHERE auth_user_id = p_auth_user_id OR email = p_user_email
        LIMIT 1;

        RETURN jsonb_build_object(
            'success', TRUE,
            'isExisting', TRUE,
            'organizationId', v_existing_org,
            'branchId', v_branch_id,
            'profileId', v_profile_id,
            'message', 'User is already associated with an active organization'
        );
    END IF;

    -- 2. Verify plan exists
    SELECT id INTO v_plan_exists FROM public.subscription_plans WHERE id = p_initial_plan_id;
    IF v_plan_exists IS NULL THEN
        p_initial_plan_id := 'plan_growth_monthly';
    END IF;

    -- 3. Create Organization
    INSERT INTO public.organizations (
        id, name, legal_name, trade_name, gstin, pan,
        state, state_code, currency, subscription_plan_id, created_at, updated_at
    ) VALUES (
        p_org_id, p_org_name, COALESCE(p_legal_name, p_org_name), COALESCE(p_trade_name, p_org_name),
        v_clean_gstin, v_clean_pan, p_state, p_state_code, 'INR', p_initial_plan_id, NOW(), NOW()
    );

    -- 4. Create Primary Flagship Branch
    v_branch_id := 'br_' || substr(p_org_id, 5) || '_main';
    INSERT INTO public.stores (
        id, organization_id, code, name, city, state,
        address, phone, gstin, is_active, is_headquarters, max_terminals, created_at, updated_at
    ) VALUES (
        v_branch_id, p_org_id, 'MAIN-01', p_org_name || ' Main Store',
        p_state, p_state, 'Primary Registered Commercial Address', p_user_phone,
        v_clean_gstin, TRUE, TRUE, 4, NOW(), NOW()
    );

    -- 5. Create Verified Owner User Profile (Role: ORG_ADMIN)
    v_profile_id := 'usr_' || substr(p_auth_user_id::text, 1, 16);
    INSERT INTO public.user_profiles (
        id, auth_user_id, organization_id, branch_id, name, email, phone,
        role, permissions, is_active, created_at, updated_at
    ) VALUES (
        v_profile_id, p_auth_user_id, p_org_id, v_branch_id, p_user_name, p_user_email, p_user_phone,
        'ORG_ADMIN',
        ARRAY[
            'POS_USE', 'PRODUCT_VIEW', 'PRODUCT_CREATE', 'PRODUCT_EDIT', 'PRODUCT_COST_VIEW',
            'INVENTORY_ADJUST', 'CUSTOMER_VIEW', 'CUSTOMER_EDIT', 'SALES_VIEW', 'INVOICE_CREATE',
            'REFUND_CREATE', 'REFUND_APPROVE', 'REPORT_VIEW', 'REPORT_EXPORT', 'BUSINESS_SETTINGS',
            'STAFF_MANAGE', 'BRANCH_MANAGE', 'SUBSCRIPTION_MANAGE',
            'SUPPLIER_VIEW', 'SUPPLIER_EDIT', 'QUOTES_VIEW', 'INVOICE_VIEW', 'DELIVERY_MANAGE'
        ]::permission[],
        TRUE,
        NOW(), NOW()
    );

    -- 6. Initialize Business Subscription
    INSERT INTO public.business_subscriptions (
        organization_id, plan_id, status, billing_interval,
        current_period_start, current_period_end, created_at, updated_at
    ) VALUES (
        p_org_id, p_initial_plan_id, 'ACTIVE',
        'MONTHLY', NOW(), NOW() + INTERVAL '30 days', NOW(), NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'organizationId', p_org_id,
        'branchId', v_branch_id,
        'profileId', v_profile_id,
        'subscriptionStatus', 'ACTIVE',
        'trialEndsAt', (NOW() + INTERVAL '30 days')
    );
END;
$$;

-- Grant permissions for register_business_tenant_atomic
REVOKE ALL ON FUNCTION public.register_business_tenant_atomic(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_business_tenant_atomic(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO authenticated, service_role;

-- ============================================================================
-- 3. PROVISION / REPAIR BUSINESS 1 — SLATE CRM (sherin@slatepos.com)
-- ============================================================================

-- A. Organization: Slate CRM
INSERT INTO public.organizations (
    id, name, legal_name, trade_name, gstin, pan, state, state_code, subscription_plan_id, created_at, updated_at
) VALUES (
    'org_slate_crm_01',
    'Slate CRM',
    'Test 1',
    'Slate CRM',
    NULL,
    NULL,
    'Tamil Nadu',
    '33',
    'plan_starter_monthly',
    NOW(), NOW()
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    legal_name = EXCLUDED.legal_name,
    trade_name = EXCLUDED.trade_name,
    state = EXCLUDED.state,
    state_code = EXCLUDED.state_code,
    subscription_plan_id = EXCLUDED.subscription_plan_id,
    updated_at = NOW();

-- B. Primary Branch: Slate CRM Main Store
INSERT INTO public.stores (
    id, organization_id, code, name, city, state, address, phone, gstin, is_active, is_headquarters, max_terminals, created_at, updated_at
) VALUES (
    'br_slate_crm_main',
    'org_slate_crm_01',
    'MAIN-01',
    'Slate CRM Main Store',
    'Chennai',
    'Tamil Nadu',
    'Chennai Central Commercial Premises, TN',
    '+91 98400 11111',
    NULL,
    TRUE,
    TRUE,
    4,
    NOW(), NOW()
) ON CONFLICT (id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    name = EXCLUDED.name,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    is_active = TRUE,
    updated_at = NOW();

-- C. User Profile: sherin@slatepos.com (Auth UUID: 0fd8b6d6-8b59-4802-b11e-3153b5356e15)
INSERT INTO public.user_profiles (
    id, auth_user_id, organization_id, branch_id, email, name, role, permissions, is_active, created_at, updated_at
) VALUES (
    'usr_slate_crm_admin',
    '0fd8b6d6-8b59-4802-b11e-3153b5356e15'::uuid,
    'org_slate_crm_01',
    'br_slate_crm_main',
    'sherin@slatepos.com',
    'Test 1 Admin',
    'ORG_ADMIN',
    ARRAY[
        'POS_USE', 'PRODUCT_VIEW', 'PRODUCT_CREATE', 'PRODUCT_EDIT', 'PRODUCT_COST_VIEW',
        'INVENTORY_ADJUST', 'CUSTOMER_VIEW', 'CUSTOMER_EDIT', 'SALES_VIEW', 'INVOICE_CREATE',
        'REFUND_CREATE', 'REFUND_APPROVE', 'REPORT_VIEW', 'REPORT_EXPORT', 'BUSINESS_SETTINGS',
        'STAFF_MANAGE', 'BRANCH_MANAGE', 'SUBSCRIPTION_MANAGE',
        'SUPPLIER_VIEW', 'SUPPLIER_EDIT', 'QUOTES_VIEW', 'INVOICE_VIEW', 'DELIVERY_MANAGE'
    ]::permission[],
    TRUE,
    NOW(), NOW()
) ON CONFLICT (email) DO UPDATE SET
    auth_user_id = EXCLUDED.auth_user_id,
    organization_id = EXCLUDED.organization_id,
    branch_id = EXCLUDED.branch_id,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    is_active = TRUE,
    updated_at = NOW();

-- D. Subscription: Slate CRM Plan (Starter Monthly)
INSERT INTO public.business_subscriptions (
    organization_id, plan_id, status, billing_interval, current_period_start, current_period_end, created_at, updated_at
) VALUES (
    'org_slate_crm_01',
    'plan_starter_monthly',
    'ACTIVE',
    'MONTHLY',
    NOW(),
    NOW() + INTERVAL '30 days',
    NOW(), NOW()
) ON CONFLICT (organization_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'ACTIVE',
    billing_interval = EXCLUDED.billing_interval,
    current_period_end = GREATEST(business_subscriptions.current_period_end, EXCLUDED.current_period_end),
    updated_at = NOW();

-- ============================================================================
-- 4. PROVISION / REPAIR BUSINESS 2 — SLATE BILLING (test1@gmail.com)
-- ============================================================================

-- A. Organization: Slate Billing
INSERT INTO public.organizations (
    id, name, legal_name, trade_name, gstin, pan, state, state_code, subscription_plan_id, created_at, updated_at
) VALUES (
    'org_slate_billing_01',
    'Slate Billing',
    'Test 2',
    'Slate Billing',
    NULL,
    NULL,
    'Tamil Nadu',
    '33',
    'plan_enterprise_monthly',
    NOW(), NOW()
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    legal_name = EXCLUDED.legal_name,
    trade_name = EXCLUDED.trade_name,
    state = EXCLUDED.state,
    state_code = EXCLUDED.state_code,
    subscription_plan_id = EXCLUDED.subscription_plan_id,
    updated_at = NOW();

-- B. Primary Branch: Slate Billing Main Store
INSERT INTO public.stores (
    id, organization_id, code, name, city, state, address, phone, gstin, is_active, is_headquarters, max_terminals, created_at, updated_at
) VALUES (
    'br_slate_billing_main',
    'org_slate_billing_01',
    'MAIN-01',
    'Slate Billing Main Store',
    'Chennai',
    'Tamil Nadu',
    'Anna Salai Tech Park, Chennai, TN',
    '+91 98400 22222',
    NULL,
    TRUE,
    TRUE,
    4,
    NOW(), NOW()
) ON CONFLICT (id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    name = EXCLUDED.name,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    is_active = TRUE,
    updated_at = NOW();

-- C. User Profile: test1@gmail.com (Auth UUID: 7b8579fc-651d-4e23-b929-2ba3ef9bf8ed)
INSERT INTO public.user_profiles (
    id, auth_user_id, organization_id, branch_id, email, name, role, permissions, is_active, created_at, updated_at
) VALUES (
    'usr_slate_billing_admin',
    '7b8579fc-651d-4e23-b929-2ba3ef9bf8ed'::uuid,
    'org_slate_billing_01',
    'br_slate_billing_main',
    'test1@gmail.com',
    'Test 2 Admin',
    'ORG_ADMIN',
    ARRAY[
        'POS_USE', 'PRODUCT_VIEW', 'PRODUCT_CREATE', 'PRODUCT_EDIT', 'PRODUCT_COST_VIEW',
        'INVENTORY_ADJUST', 'CUSTOMER_VIEW', 'CUSTOMER_EDIT', 'SALES_VIEW', 'INVOICE_CREATE',
        'REFUND_CREATE', 'REFUND_APPROVE', 'REPORT_VIEW', 'REPORT_EXPORT', 'BUSINESS_SETTINGS',
        'STAFF_MANAGE', 'BRANCH_MANAGE', 'SUBSCRIPTION_MANAGE',
        'SUPPLIER_VIEW', 'SUPPLIER_EDIT', 'QUOTES_VIEW', 'INVOICE_VIEW', 'DELIVERY_MANAGE'
    ]::permission[],
    TRUE,
    NOW(), NOW()
) ON CONFLICT (email) DO UPDATE SET
    auth_user_id = EXCLUDED.auth_user_id,
    organization_id = EXCLUDED.organization_id,
    branch_id = EXCLUDED.branch_id,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    is_active = TRUE,
    updated_at = NOW();

-- D. Subscription: Slate Billing Plan (Enterprise Monthly)
INSERT INTO public.business_subscriptions (
    organization_id, plan_id, status, billing_interval, current_period_start, current_period_end, created_at, updated_at
) VALUES (
    'org_slate_billing_01',
    'plan_enterprise_monthly',
    'ACTIVE',
    'MONTHLY',
    NOW(),
    NOW() + INTERVAL '30 days',
    NOW(), NOW()
) ON CONFLICT (organization_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'ACTIVE',
    billing_interval = EXCLUDED.billing_interval,
    current_period_end = GREATEST(business_subscriptions.current_period_end, EXCLUDED.current_period_end),
    updated_at = NOW();
