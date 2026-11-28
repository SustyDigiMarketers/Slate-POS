-- ============================================================================
-- SLATE POS — Provision Demo Tenants (Apex SuperStore & GreenMart Retail)
-- Migration: 20261101000000_provision_demo_tenants.sql
-- ============================================================================

-- 1. Insert GreenMart Retail Organization
INSERT INTO organizations (
    id, name, legal_name, trade_name, gstin, pan, state, state_code, subscription_plan_id
) VALUES (
    'org_greenmart_01',
    'GreenMart Retail Pvt Ltd',
    'GreenMart Retail Private Limited',
    'GreenMart Fresh & Organic',
    '29GGGG1234F1Z1',
    'GGGGG1234F',
    'Karnataka',
    '29',
    'plan_growth_monthly'
) ON CONFLICT (id) DO NOTHING;

-- 2. Insert Store for GreenMart Retail
INSERT INTO stores (
    id, organization_id, code, name, city, state, address, phone, gstin, is_active, is_headquarters
) VALUES (
    'br_gm_01',
    'org_greenmart_01',
    'GM-01',
    'GreenMart Organic Store',
    'Bengaluru',
    'Karnataka',
    '10, Organic Lane, JP Nagar, Bengaluru, KA 560078',
    '+91 80 2233 4455',
    '29GGGG1234F1Z1',
    TRUE,
    TRUE
) ON CONFLICT (id) DO NOTHING;

-- 3. Insert Admin User for GreenMart
INSERT INTO user_profiles (
    id, organization_id, branch_id, email, name, role, is_active
) VALUES (
    'usr_gm_admin_01',
    'org_greenmart_01',
    'br_gm_01',
    'admin@greenmart.demo',
    'GreenMart Admin',
    'ORG_ADMIN',
    TRUE
) ON CONFLICT (id) DO NOTHING;

-- 4. Initialize Business Subscription for GreenMart
INSERT INTO business_subscriptions (
    organization_id, plan_id, status, billing_interval,
    current_period_start, current_period_end
) VALUES (
    'org_greenmart_01', 'plan_growth_monthly', 'ACTIVE', 'MONTHLY',
    NOW(), NOW() + INTERVAL '30 days'
) ON CONFLICT (organization_id) DO NOTHING;
