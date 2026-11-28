-- ============================================================================
-- SLATE POS — Business Subscription, Entitlement & Webhook Ledger Schema
-- Target: Supabase PostgreSQL (Production Multi-Tenant Subscription Model)
-- Compliant with:
-- 1. Tenant ownership strictly at Organization level (NOT per-user)
-- 2. Monthly and Yearly billing intervals with 18% GST calculation
-- 3. Payment provider mapping (Razorpay Subscriptions / UPI AutoPay)
-- 4. Idempotent webhook event ledger for duplicate and replay defense
-- 5. Strict multi-tenant Row Level Security (RLS) default deny
-- ============================================================================

-- 1. Subscription Plans Master Table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    tier VARCHAR(32) NOT NULL, -- STARTER, GROWTH, ENTERPRISE
    tagline VARCHAR(255),
    billing_interval VARCHAR(20) NOT NULL, -- MONTHLY, ANNUAL
    price_inr INT NOT NULL, -- Price in whole INR
    gst_percentage INT DEFAULT 18,
    max_branches INT NOT NULL,
    max_users INT NOT NULL,
    max_terminals INT NOT NULL,
    features TEXT[] DEFAULT '{}',
    is_popular BOOLEAN DEFAULT FALSE,
    provider_plan_id VARCHAR(100), -- Razorpay plan_id (e.g. plan_RzpStarterMo)
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Business Subscriptions (One active subscription per Organization)
CREATE TABLE IF NOT EXISTS business_subscriptions (
    id VARCHAR(64) PRIMARY KEY DEFAULT ('sub_' || substr(gen_random_uuid()::text, 1, 16)),
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan_id VARCHAR(64) NOT NULL REFERENCES subscription_plans(id),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING, TRIALING, ACTIVE, PAST_DUE, CANCELLED, EXPIRED
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'MONTHLY', -- MONTHLY, ANNUAL
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,
    provider_subscription_id VARCHAR(100), -- Razorpay sub_id
    provider_customer_id VARCHAR(100),     -- Razorpay cust_id
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_business_subscription_org UNIQUE (organization_id)
);

-- 3. Subscription Invoices / Payment History
CREATE TABLE IF NOT EXISTS subscription_invoices (
    id VARCHAR(64) PRIMARY KEY DEFAULT ('sinv_' || substr(gen_random_uuid()::text, 1, 16)),
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subscription_id VARCHAR(64) NOT NULL REFERENCES business_subscriptions(id) ON DELETE CASCADE,
    amount_paid INT NOT NULL, -- in INR
    tax_amount INT NOT NULL,   -- GST component in INR
    currency VARCHAR(10) DEFAULT 'INR',
    status VARCHAR(32) NOT NULL DEFAULT 'PAID', -- PAID, FAILED, PENDING
    invoice_pdf_url TEXT,
    provider_payment_id VARCHAR(100), -- Razorpay pay_id
    billing_reason VARCHAR(64) DEFAULT 'SUBSCRIPTION_CYCLE',
    paid_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Payment Webhook Events (Idempotency Ledger)
CREATE TABLE IF NOT EXISTS payment_webhook_events (
    event_id VARCHAR(128) PRIMARY KEY, -- Deduplication key from gateway
    event_type VARCHAR(64) NOT NULL,
    provider VARCHAR(32) DEFAULT 'RAZORPAY',
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_webhook_events ENABLE ROW LEVEL SECURITY;

-- Plans: Any authenticated user can read active plans
CREATE POLICY subscription_plans_select_policy ON subscription_plans
    FOR SELECT TO authenticated
    USING (is_active = TRUE);

-- Business Subscriptions: Users can only view their own organization's subscription (tenant_isolation_org_subscriptions)
CREATE POLICY tenant_isolation_org_subscriptions ON business_subscriptions
    FOR SELECT TO authenticated
    USING (
        organization_id = (
            SELECT organization_id FROM user_profiles
            WHERE auth_user_id = auth.uid() OR id = auth.uid()::text
            LIMIT 1
        )
    );

-- Business Subscriptions: Only ORG_ADMIN or SUPER_ADMIN can update their subscription
CREATE POLICY business_subscriptions_update_policy ON business_subscriptions
    FOR UPDATE TO authenticated
    USING (
        organization_id = (
            SELECT organization_id FROM user_profiles
            WHERE (auth_user_id = auth.uid() OR id = auth.uid()::text)
              AND role IN ('SUPER_ADMIN', 'ORG_ADMIN')
            LIMIT 1
        )
    )
    WITH CHECK (
        organization_id = (
            SELECT organization_id FROM user_profiles
            WHERE (auth_user_id = auth.uid() OR id = auth.uid()::text)
              AND role IN ('SUPER_ADMIN', 'ORG_ADMIN')
            LIMIT 1
        )
    );

-- Invoices: Organization members can view their invoices
CREATE POLICY subscription_invoices_select_policy ON subscription_invoices
    FOR SELECT TO authenticated
    USING (
        organization_id = (
            SELECT organization_id FROM user_profiles
            WHERE auth_user_id = auth.uid() OR id = auth.uid()::text
            LIMIT 1
        )
    );

-- Webhook events: Restricted entirely from direct public client manipulation
-- (Service role key or secure RPC functions only)
CREATE POLICY payment_webhook_events_service_only ON payment_webhook_events
    FOR ALL TO authenticated
    USING (FALSE);

-- ============================================================================
-- 6. SEED SUBSCRIPTION PLANS
-- ============================================================================

INSERT INTO subscription_plans (
    id, name, tier, tagline, billing_interval, price_inr, gst_percentage,
    max_branches, max_users, max_terminals, features, is_popular, is_active
) VALUES
-- Starter
('plan_starter_monthly', 'Starter Monthly', 'STARTER', 'Ideal for single retail shop or boutique', 'MONTHLY', 1499, 18, 1, 2, 1, ARRAY[
    'Single Branch with 1 POS terminal',
    'Offline Checkout with local persistence',
    'UPI QR & Cash with change calculator',
    '58mm / 80mm thermal receipt printing',
    'Standard GST B2C summary'
], FALSE, TRUE),
('plan_starter_annual', 'Starter Annual', 'STARTER', 'Ideal for single retail shop or boutique (Save 17%)', 'ANNUAL', 14990, 18, 1, 2, 1, ARRAY[
    'Single Branch with 1 POS terminal',
    'Offline Checkout with local persistence',
    'UPI QR & Cash with change calculator',
    '58mm / 80mm thermal receipt printing',
    'Standard GST B2C summary',
    '2 Months Free on Annual Billing'
], FALSE, TRUE),

-- Growth
('plan_growth_monthly', 'Growth Monthly', 'GROWTH', 'For fast-growing retail outlets & multi-counter stores', 'MONTHLY', 3499, 18, 3, 8, 4, ARRAY[
    'Up to 3 Branches with consolidated dashboard',
    'Durable outbox with automatic background sync',
    'Receivables aging (1-15, 16-30, 31-45, >45 days)',
    'Customer credit limit & ledger tracking',
    'Cashier & Manager role-based access control',
    'GSTR-1 & GSTR-3B tax export ready'
], TRUE, TRUE),
('plan_growth_annual', 'Growth Annual', 'GROWTH', 'For fast-growing retail outlets & multi-counter stores (Save 17%)', 'ANNUAL', 34990, 18, 3, 8, 4, ARRAY[
    'Up to 3 Branches with consolidated dashboard',
    'Durable outbox with automatic background sync',
    'Receivables aging (1-15, 16-30, 31-45, >45 days)',
    'Customer credit limit & ledger tracking',
    'Cashier & Manager role-based access control',
    'GSTR-1 & GSTR-3B tax export ready',
    '2 Months Free on Annual Billing'
], TRUE, TRUE),

-- Enterprise
('plan_enterprise_monthly', 'Enterprise Monthly', 'ENTERPRISE', 'For multi-city retail chains and franchises', 'MONTHLY', 7999, 18, 15, 30, 15, ARRAY[
    'Unlimited Branches & terminal scaling',
    'Central stock transfers & purchase orders',
    'Razorpay Subscriptions & UPI AutoPay SDK',
    'Dedicated audit trail with device fingerprinting',
    'Priority 24/7 phone & WhatsApp support'
], FALSE, TRUE),
('plan_enterprise_annual', 'Enterprise Annual', 'ENTERPRISE', 'For multi-city retail chains and franchises (Save 17%)', 'ANNUAL', 79990, 18, 15, 30, 15, ARRAY[
    'Unlimited Branches & terminal scaling',
    'Central stock transfers & purchase orders',
    'Razorpay Subscriptions & UPI AutoPay SDK',
    'Dedicated audit trail with device fingerprinting',
    'Priority 24/7 phone & WhatsApp support',
    '2 Months Free on Annual Billing'
], FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET
    price_inr = EXCLUDED.price_inr,
    features = EXCLUDED.features,
    is_active = EXCLUDED.is_active;

-- ============================================================================
-- 7. ATOMIC SUBSCRIPTION TRANSITION FUNCTION (Idempotent Webhook Processor)
-- ============================================================================

CREATE OR REPLACE FUNCTION process_subscription_webhook_atomic(
    p_event_id VARCHAR(128),
    p_event_type VARCHAR(64),
    p_org_id VARCHAR(64),
    p_plan_id VARCHAR(64),
    p_provider_sub_id VARCHAR(100),
    p_amount INT,
    p_tax INT,
    p_period_days INT DEFAULT 30,
    p_raw_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_already_processed BOOLEAN;
    v_sub_id VARCHAR(64);
    v_new_end TIMESTAMPTZ;
BEGIN
    -- 1. Idempotency Check: if event_id already exists, return early
    SELECT processed INTO v_already_processed
    FROM payment_webhook_events
    WHERE event_id = p_event_id;

    IF v_already_processed IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'status', 'ALREADY_PROCESSED',
            'eventId', p_event_id
        );
    END IF;

    -- 2. Record incoming webhook event
    INSERT INTO payment_webhook_events (event_id, event_type, payload, processed, processed_at)
    VALUES (p_event_id, p_event_type, p_raw_payload, TRUE, NOW());

    -- 3. Calculate period end
    v_new_end := NOW() + (p_period_days || ' days')::INTERVAL;

    -- 4. Upsert business_subscriptions for organization
    INSERT INTO business_subscriptions (
        organization_id, plan_id, status, billing_interval,
        current_period_start, current_period_end,
        provider_subscription_id, updated_at
    )
    VALUES (
        p_org_id, p_plan_id, 'ACTIVE',
        CASE WHEN p_period_days > 60 THEN 'ANNUAL' ELSE 'MONTHLY' END,
        NOW(), v_new_end, p_provider_sub_id, NOW()
    )
    ON CONFLICT (organization_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = 'ACTIVE',
        billing_interval = EXCLUDED.billing_interval,
        current_period_end = GREATEST(business_subscriptions.current_period_end, v_new_end),
        cancel_at_period_end = FALSE,
        provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id, business_subscriptions.provider_subscription_id),
        updated_at = NOW()
    RETURNING id INTO v_sub_id;

    -- 5. Record invoice
    IF p_amount > 0 THEN
        INSERT INTO subscription_invoices (
            organization_id, subscription_id, amount_paid, tax_amount,
            currency, status, provider_payment_id, paid_at
        ) VALUES (
            p_org_id, v_sub_id, p_amount, p_tax,
            'INR', 'PAID', ('pay_wh_' || substr(p_event_id, 1, 16)), NOW()
        );
    END IF;

    -- 6. Update organization subscription_plan_id
    UPDATE organizations
    SET subscription_plan_id = p_plan_id,
        updated_at = NOW()
    WHERE id = p_org_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'status', 'PROCESSED',
        'subscriptionId', v_sub_id,
        'currentPeriodEnd', v_new_end
    );
END;
$$;

-- ============================================================================
-- 8. ATOMIC BUSINESS REGISTRATION & ONBOARDING PROCEDURE
-- ============================================================================

CREATE OR REPLACE FUNCTION register_business_tenant_atomic(
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
    v_existing_org VARCHAR(64);
    v_branch_id VARCHAR(64);
    v_profile_id VARCHAR(64);
    v_plan_exists VARCHAR(64);
BEGIN
    -- 1. Check if user is already onboarded (Idempotent retry guard)
    SELECT organization_id INTO v_existing_org
    FROM user_profiles
    WHERE auth_user_id = p_auth_user_id OR email = p_user_email
    LIMIT 1;

    IF v_existing_org IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'isExisting', TRUE,
            'organizationId', v_existing_org,
            'message', 'User already associated with an existing organization'
        );
    END IF;

    -- 2. Verify plan exists
    SELECT id INTO v_plan_exists FROM subscription_plans WHERE id = p_initial_plan_id;
    IF v_plan_exists IS NULL THEN
        p_initial_plan_id := 'plan_growth_monthly';
    END IF;

    -- 3. Create Organization
    INSERT INTO organizations (
        id, name, legal_name, trade_name, gstin, pan,
        state, state_code, currency, subscription_plan_id, created_at, updated_at
    ) VALUES (
        p_org_id, p_org_name, COALESCE(p_legal_name, p_org_name), COALESCE(p_trade_name, p_org_name),
        p_gstin, p_pan, p_state, p_state_code, 'INR', p_initial_plan_id, NOW(), NOW()
    );

    -- 4. Create Primary Branch
    v_branch_id := 'br_' || substr(p_org_id, 5) || '_main';
    INSERT INTO stores (
        id, organization_id, code, name, city, state,
        address, phone, gstin, is_active, is_headquarters, max_terminals, created_at, updated_at
    ) VALUES (
        v_branch_id, p_org_id, 'MAIN-01', p_org_name || ' Main Store',
        p_state, p_state, 'Primary Registered Commercial Address', p_user_phone,
        p_gstin, TRUE, TRUE, 4, NOW(), NOW()
    );

    -- 5. Create Owner User Profile
    v_profile_id := 'usr_' || substr(p_auth_user_id::text, 1, 16);
    INSERT INTO user_profiles (
        id, auth_user_id, organization_id, branch_id, name, email, phone,
        role, permissions, created_at, updated_at
    ) VALUES (
        v_profile_id, p_auth_user_id, p_org_id, v_branch_id, p_user_name, p_user_email, p_user_phone,
        'SUPER_ADMIN',
        ARRAY[
            'POS_USE', 'PRODUCT_VIEW', 'PRODUCT_CREATE', 'PRODUCT_EDIT', 'PRODUCT_COST_VIEW',
            'INVENTORY_ADJUST', 'CUSTOMER_VIEW', 'CUSTOMER_EDIT', 'SALES_VIEW', 'INVOICE_CREATE',
            'REFUND_CREATE', 'REFUND_APPROVE', 'REPORT_VIEW', 'REPORT_EXPORT', 'BUSINESS_SETTINGS',
            'STAFF_MANAGE', 'BRANCH_MANAGE', 'SUBSCRIPTION_MANAGE', 'PLATFORM_MANAGE',
            'SUPPLIER_VIEW', 'SUPPLIER_EDIT', 'QUOTES_VIEW', 'INVOICE_VIEW', 'DELIVERY_MANAGE'
        ]::permission[],
        NOW(), NOW()
    );

    -- 6. Initialize Business Subscription (14-Day Trialing / Pending Activation)
    INSERT INTO business_subscriptions (
        organization_id, plan_id, status, billing_interval,
        current_period_start, current_period_end, created_at, updated_at
    ) VALUES (
        p_org_id, p_initial_plan_id, 'TRIALING',
        'MONTHLY', NOW(), NOW() + INTERVAL '14 days', NOW(), NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'organizationId', p_org_id,
        'branchId', v_branch_id,
        'profileId', v_profile_id,
        'subscriptionStatus', 'TRIALING',
        'trialEndsAt', (NOW() + INTERVAL '14 days')
    );
END;
$$;

