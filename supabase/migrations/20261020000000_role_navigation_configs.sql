-- =========================================================================
-- SLATE POS Migration: 20261020000000_role_navigation_configs.sql
-- Role-Specific Navigation Preferences & Manager Delegation Configurations
-- =========================================================================

-- 1. Create table for persisting role-specific navigation preferences
CREATE TABLE IF NOT EXISTS role_navigation_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
    role user_role NOT NULL,
    enabled_additional_modules TEXT[] NOT NULL DEFAULT '{}',
    disabled_modules TEXT[] NOT NULL DEFAULT '{}',
    updated_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_role_nav_org_role UNIQUE (organization_id, role)
);

-- Index for high-speed tenant lookups
CREATE INDEX IF NOT EXISTS idx_role_nav_org_role ON role_navigation_configs(organization_id, role);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE role_navigation_configs ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies: Least Privilege Enforcement
-- Read Policy: Any authenticated member of the organization can read the navigation configuration
CREATE POLICY role_nav_select_tenant ON role_navigation_configs
    FOR SELECT
    USING (organization_id = (auth.jwt() ->> 'organization_id')::text);

-- Super Admin Full Control Policy
CREATE POLICY role_nav_admin_all ON role_navigation_configs
    FOR ALL
    USING (
        (auth.jwt() ->> 'role') IN ('SUPER_ADMIN', 'ORG_ADMIN')
        AND organization_id = (auth.jwt() ->> 'organization_id')::text
    )
    WITH CHECK (
        (auth.jwt() ->> 'role') IN ('SUPER_ADMIN', 'ORG_ADMIN')
        AND organization_id = (auth.jwt() ->> 'organization_id')::text
    );

-- Manager Delegated Update Policy:
-- Managers may ONLY update CASHIER or STORE_OFFICER roles.
-- Managers CANNOT update SUPER_ADMIN, ORG_ADMIN, or MANAGER roles.
CREATE POLICY role_nav_manager_update ON role_navigation_configs
    FOR INSERT
    WITH CHECK (
        (auth.jwt() ->> 'role') = 'MANAGER'
        AND organization_id = (auth.jwt() ->> 'organization_id')::text
        AND role IN ('CASHIER', 'STORE_OFFICER', 'PURCHASE_OFFICER')
    );

CREATE POLICY role_nav_manager_modify ON role_navigation_configs
    FOR UPDATE
    USING (
        (auth.jwt() ->> 'role') = 'MANAGER'
        AND organization_id = (auth.jwt() ->> 'organization_id')::text
        AND role IN ('CASHIER', 'STORE_OFFICER', 'PURCHASE_OFFICER')
    )
    WITH CHECK (
        (auth.jwt() ->> 'role') = 'MANAGER'
        AND organization_id = (auth.jwt() ->> 'organization_id')::text
        AND role IN ('CASHIER', 'STORE_OFFICER', 'PURCHASE_OFFICER')
    );

-- Trigger to maintain updated_at timestamp
CREATE OR REPLACE FUNCTION update_role_nav_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_role_nav_timestamp ON role_navigation_configs;
CREATE TRIGGER trg_role_nav_timestamp
    BEFORE UPDATE ON role_navigation_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_role_nav_timestamp();
