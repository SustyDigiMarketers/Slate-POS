-- ==============================================================================
-- SLATE POS — Production Remediation Migration: RLS, Granular Permissions & RPCs
-- Migration: 20261122000000_rls_permissions_branch_fixes.sql
--
-- Safety Guarantees:
-- 1. Purely additive & idempotent; never removes tables, rows, or auth users.
-- 2. Preserves ALL existing organizations (org_apex_01, org_slate_crm_01,
--    org_slate_billing_01), existing Auth UUIDs, profiles, branches, and data.
-- 3. Fixes live database errors from supabase_logs.csv:
--    - Error A (42501): quotations RLS WITH CHECK + auth_user_id backfill
--    - Error B (42501): products RLS WITH CHECK
--    - Error C (42501): customers RLS WITH CHECK
--    - Error D (P0001 / 42703): MANAGER multi-branch org access & stores.state_code
--      replaced by organizations.state_code join in process_sale_atomic
-- 4. Enforces the single authoritative role & granular permission matrix across
--    PostgreSQL RLS via public.has_permission(TEXT).
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. SAFE NON-DESTRUCTIVE IDENTITY, CODE & PERMISSIONS BACKFILL
-- ------------------------------------------------------------------------------

-- Link pre-provisioned active profiles whose auth_user_id is still NULL by email
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    UPDATE public.user_profiles up
    SET auth_user_id = au.id,
        updated_at = NOW()
    FROM auth.users au
    WHERE up.auth_user_id IS NULL
      AND LOWER(up.email) = LOWER(au.email);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Ensure organization_code exists and is backfilled
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS organization_code VARCHAR(32);

UPDATE public.organizations
SET organization_code = UPPER(SUBSTRING(md5(id || COALESCE(name, '') || random()::text) FROM 1 FOR 10))
WHERE organization_code IS NULL OR TRIM(organization_code) = '';

-- Ensure user_code exists and is backfilled with unique 6-digit numeric strings
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS user_code VARCHAR(6);

DO $$
DECLARE
  r RECORD;
  i INT := 1;
  v_code VARCHAR(6);
BEGIN
  FOR r IN
    SELECT id
    FROM public.user_profiles
    WHERE user_code IS NULL OR user_code !~ '^[0-9]{6}$'
    ORDER BY created_at ASC NULLS LAST, id ASC
  LOOP
    LOOP
      v_code := LPAD((i % 1000000)::TEXT, 6, '0');
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.user_profiles WHERE user_code = v_code AND id <> r.id
      );
      i := i + 1;
    END LOOP;

    UPDATE public.user_profiles
    SET user_code = v_code,
        updated_at = NOW()
    WHERE id = r.id;

    i := i + 1;
  END LOOP;
END $$;

-- Backfill legacy permission arrays only if column is TEXT[] (non-destructive)
DO $$
DECLARE
  v_udt text;
BEGIN
  SELECT udt_name INTO v_udt
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'user_profiles'
    AND column_name = 'permissions';

  IF v_udt = '_text' THEN
    UPDATE public.user_profiles
    SET permissions = CASE role::text
      WHEN 'SUPER_ADMIN' THEN ARRAY[
        'POS_USE','PRODUCT_VIEW','PRODUCT_CREATE','PRODUCT_EDIT','PRODUCT_COST_VIEW',
        'INVENTORY_ADJUST','CUSTOMER_VIEW','CUSTOMER_EDIT','SALES_VIEW','INVOICE_CREATE',
        'REFUND_CREATE','REFUND_APPROVE','REPORT_VIEW','REPORT_EXPORT','BUSINESS_SETTINGS',
        'STAFF_MANAGE','BRANCH_MANAGE','SUBSCRIPTION_MANAGE','PLATFORM_MANAGE'
      ]::TEXT[]
      WHEN 'ORG_ADMIN' THEN ARRAY[
        'POS_USE','PRODUCT_VIEW','PRODUCT_CREATE','PRODUCT_EDIT','PRODUCT_COST_VIEW',
        'INVENTORY_ADJUST','CUSTOMER_VIEW','CUSTOMER_EDIT','SALES_VIEW','INVOICE_CREATE',
        'REFUND_CREATE','REFUND_APPROVE','REPORT_VIEW','REPORT_EXPORT','BUSINESS_SETTINGS',
        'STAFF_MANAGE','BRANCH_MANAGE','SUBSCRIPTION_MANAGE'
      ]::TEXT[]
      WHEN 'MANAGER' THEN ARRAY[
        'POS_USE','PRODUCT_VIEW','PRODUCT_CREATE','PRODUCT_EDIT','PRODUCT_COST_VIEW',
        'INVENTORY_ADJUST','CUSTOMER_VIEW','CUSTOMER_EDIT','SALES_VIEW','INVOICE_CREATE',
        'REFUND_CREATE','REFUND_APPROVE','REPORT_VIEW','REPORT_EXPORT','BUSINESS_SETTINGS',
        'BRANCH_MANAGE'
      ]::TEXT[]
      WHEN 'CASHIER' THEN ARRAY[
        'POS_USE','PRODUCT_VIEW','CUSTOMER_VIEW','CUSTOMER_EDIT','SALES_VIEW','INVOICE_CREATE'
      ]::TEXT[]
      WHEN 'STORE_OFFICER' THEN ARRAY[
        'PRODUCT_VIEW','PRODUCT_CREATE','PRODUCT_EDIT','PRODUCT_COST_VIEW','INVENTORY_ADJUST',
        'SUPPLIER_VIEW','SUPPLIER_EDIT','QUOTES_VIEW','INVOICE_VIEW','DELIVERY_MANAGE',
        'PURCHASE_VIEW','PURCHASE_CREATE','PURCHASE_RECEIVE'
      ]::TEXT[]
      WHEN 'PURCHASE_OFFICER' THEN ARRAY[
        'PRODUCT_VIEW','PRODUCT_CREATE','PRODUCT_EDIT','PRODUCT_COST_VIEW','INVENTORY_ADJUST',
        'SUPPLIER_VIEW','SUPPLIER_EDIT','QUOTES_VIEW','INVOICE_VIEW','DELIVERY_MANAGE',
        'PURCHASE_VIEW','PURCHASE_CREATE','PURCHASE_RECEIVE'
      ]::TEXT[]
      ELSE permissions
    END
    WHERE permissions IS NULL OR cardinality(permissions) = 0;
  END IF;
END $$;

-- Ensure helpful lookup indexes exist
CREATE INDEX IF NOT EXISTS idx_user_profiles_auth_active
  ON public.user_profiles (auth_user_id, is_active);

-- ------------------------------------------------------------------------------
-- 2. HARDENED TENANT, ROLE & PERMISSION HELPER FUNCTIONS
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_org()
RETURNS VARCHAR(64)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.user_profiles
  WHERE auth_user_id = auth.uid()
    AND is_active = TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id::text
  FROM public.user_profiles
  WHERE auth_user_id = auth.uid()
    AND is_active = TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_profiles
  WHERE auth_user_id = auth.uid()
    AND is_active = TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_branch_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id::text
  FROM public.user_profiles
  WHERE auth_user_id = auth.uid()
    AND is_active = TRUE
  LIMIT 1;
$$;

-- Authoritative PostgreSQL mirror of src/lib/permissions.ts
CREATE OR REPLACE FUNCTION public.has_permission(p_perm TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF p_perm IS NULL OR TRIM(p_perm) = '' THEN
    RETURN FALSE;
  END IF;

  IF public.is_trusted_service_role() THEN
    RETURN TRUE;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role::text INTO v_role
  FROM public.user_profiles
  WHERE auth_user_id = auth.uid()
    AND is_active = TRUE
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_role = 'PURCHASE_OFFICER' THEN
    v_role := 'STORE_OFFICER';
  END IF;

  IF v_role = 'SUPER_ADMIN' THEN
    RETURN TRUE;
  END IF;

  IF v_role = 'ORG_ADMIN' THEN
    RETURN p_perm <> 'PLATFORM_MANAGE';
  END IF;

  IF v_role = 'MANAGER' THEN
    RETURN p_perm IN (
      'DASHBOARD_VIEW',
      'BANKING_VIEW', 'BANKING_MANAGE', 'BANKING_RECONCILE',
      'CUSTOMERS_VIEW', 'CUSTOMERS_CREATE', 'CUSTOMERS_EDIT', 'CUSTOMERS_DELETE',
      'POS_USE', 'POS_CHECKOUT',
      'QUOTES_VIEW', 'QUOTES_CREATE', 'QUOTES_EDIT', 'QUOTES_DELETE',
      'SALES_VIEW', 'INVOICES_CREATE',
      'PAYMENTS_VIEW', 'PAYMENTS_COLLECT',
      'CREDIT_NOTES_MANAGE',
      'REFUNDS_CREATE', 'REFUNDS_APPROVE',
      'CHALLANS_MANAGE',
      'SUPPLIERS_VIEW', 'SUPPLIERS_MANAGE',
      'PURCHASE_ORDERS_MANAGE', 'GOODS_RECEIPTS_MANAGE', 'SUPPLIER_BILLS_MANAGE', 'DEBIT_NOTES_MANAGE',
      'EXPENSES_VIEW', 'EXPENSES_MANAGE',
      'PRODUCTS_VIEW', 'PRODUCTS_CREATE', 'PRODUCTS_EDIT', 'PRODUCTS_COST_VIEW',
      'INVENTORY_VIEW', 'INVENTORY_ADJUST', 'STOCK_MOVEMENTS_VIEW',
      'COA_MANAGE', 'JOURNAL_MANAGE', 'BUDGETS_MANAGE', 'BUDGETS_APPROVE', 'BULK_UPDATES_MANAGE',
      'TRANSACTIONS_VIEW',
      'REPORTS_FINANCIAL_VIEW', 'REPORTS_INVENTORY_VIEW', 'REPORTS_GST_VIEW', 'AUDIT_VIEW', 'REPORTS_EXPORT',
      'SETTINGS_VIEW', 'ORG_SETTINGS_MANAGE',
      'BRANCH_SWITCH', 'BRANCH_MANAGE', 'FISCAL_MANAGE',
      'USERS_VIEW', 'SYNC_MANAGE'
    );
  END IF;

  IF v_role = 'CASHIER' THEN
    RETURN p_perm IN (
      'POS_USE', 'POS_CHECKOUT',
      'CUSTOMERS_VIEW', 'CUSTOMERS_CREATE', 'CUSTOMERS_EDIT',
      'PRODUCTS_VIEW',
      'QUOTES_VIEW', 'QUOTES_CREATE', 'QUOTES_EDIT',
      'SALES_VIEW', 'INVOICES_CREATE',
      'PAYMENTS_VIEW', 'PAYMENTS_COLLECT'
    );
  END IF;

  IF v_role = 'STORE_OFFICER' THEN
    RETURN p_perm IN (
      'SUPPLIERS_VIEW', 'SUPPLIERS_MANAGE',
      'PRODUCTS_VIEW', 'PRODUCTS_CREATE', 'PRODUCTS_EDIT', 'PRODUCTS_COST_VIEW',
      'INVENTORY_VIEW', 'INVENTORY_ADJUST', 'STOCK_MOVEMENTS_VIEW',
      'QUOTES_VIEW', 'SALES_VIEW',
      'CHALLANS_MANAGE', 'PURCHASE_ORDERS_MANAGE', 'GOODS_RECEIPTS_MANAGE',
      'SUPPLIER_BILLS_MANAGE', 'DEBIT_NOTES_MANAGE',
      'REPORTS_INVENTORY_VIEW'
    );
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_org() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_org_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_branch_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_permission(TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_user_org() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_branch_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. EXPLICIT RLS POLICIES (SELECT / INSERT WITH CHECK / UPDATE / DELETE)
-- ------------------------------------------------------------------------------

-- A. ORGANIZATIONS
DROP POLICY IF EXISTS "Organizations Select Policy" ON public.organizations;
DROP POLICY IF EXISTS "Organizations Update Policy" ON public.organizations;
CREATE POLICY "Organizations Select Policy" ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.current_user_org_id());

CREATE POLICY "Organizations Update Policy" ON public.organizations
  FOR UPDATE TO authenticated
  USING (id = public.current_user_org_id() AND public.has_permission('ORG_SETTINGS_MANAGE'))
  WITH CHECK (id = public.current_user_org_id() AND public.has_permission('ORG_SETTINGS_MANAGE'));

-- B. STORES (BRANCHES)
DROP POLICY IF EXISTS "Stores Select Policy" ON public.stores;
DROP POLICY IF EXISTS "Stores Insert Policy" ON public.stores;
DROP POLICY IF EXISTS "Stores Update Policy" ON public.stores;
CREATE POLICY "Stores Select Policy" ON public.stores
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_org_id());

CREATE POLICY "Stores Insert Policy" ON public.stores
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('BRANCH_MANAGE'));

CREATE POLICY "Stores Update Policy" ON public.stores
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_user_org_id() AND public.has_permission('BRANCH_MANAGE'))
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('BRANCH_MANAGE'));

-- C. USER PROFILES
DROP POLICY IF EXISTS "User Profiles Select Policy" ON public.user_profiles;
DROP POLICY IF EXISTS "User Profiles Insert Policy" ON public.user_profiles;
DROP POLICY IF EXISTS "User Profiles Admin Update Policy" ON public.user_profiles;
DROP POLICY IF EXISTS "User Profiles Self Read Policy" ON public.user_profiles;

CREATE POLICY "User Profiles Select Policy" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR (
      organization_id = public.current_user_org_id()
      AND (public.has_permission('USERS_VIEW') OR public.has_permission('USERS_MANAGE'))
    )
  );

CREATE POLICY "User Profiles Insert Policy" ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND public.has_permission('USERS_MANAGE')
    AND (public.current_user_role() = 'SUPER_ADMIN' OR role <> 'SUPER_ADMIN')
  );

CREATE POLICY "User Profiles Admin Update Policy" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('USERS_MANAGE')
    AND (public.current_user_role() = 'SUPER_ADMIN' OR role <> 'SUPER_ADMIN')
  )
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND public.has_permission('USERS_MANAGE')
    AND (public.current_user_role() = 'SUPER_ADMIN' OR role <> 'SUPER_ADMIN')
  );

-- D. ROLE NAVIGATION CONFIGS (Strictly SUPER_ADMIN & ORG_ADMIN writes; MANAGER read-only)
DROP POLICY IF EXISTS role_nav_select_tenant ON public.role_navigation_configs;
DROP POLICY IF EXISTS role_nav_admin_all ON public.role_navigation_configs;
DROP POLICY IF EXISTS role_nav_manager_update ON public.role_navigation_configs;
DROP POLICY IF EXISTS role_nav_manager_modify ON public.role_navigation_configs;
DROP POLICY IF EXISTS "Role Nav Select Policy" ON public.role_navigation_configs;
DROP POLICY IF EXISTS "Role Nav Insert Policy" ON public.role_navigation_configs;
DROP POLICY IF EXISTS "Role Nav Update Policy" ON public.role_navigation_configs;
DROP POLICY IF EXISTS "Role Nav Delete Policy" ON public.role_navigation_configs;

CREATE POLICY "Role Nav Select Policy" ON public.role_navigation_configs
  FOR SELECT TO authenticated
  USING (organization_id = public.current_user_org_id());

CREATE POLICY "Role Nav Insert Policy" ON public.role_navigation_configs
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND public.has_permission('ROLES_MANAGE')
    AND (public.current_user_role() = 'SUPER_ADMIN' OR role <> 'SUPER_ADMIN')
  );

CREATE POLICY "Role Nav Update Policy" ON public.role_navigation_configs
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('ROLES_MANAGE')
    AND (public.current_user_role() = 'SUPER_ADMIN' OR role <> 'SUPER_ADMIN')
  )
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND public.has_permission('ROLES_MANAGE')
    AND (public.current_user_role() = 'SUPER_ADMIN' OR role <> 'SUPER_ADMIN')
  );

CREATE POLICY "Role Nav Delete Policy" ON public.role_navigation_configs
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('ROLES_MANAGE')
    AND (public.current_user_role() = 'SUPER_ADMIN' OR role <> 'SUPER_ADMIN')
  );

-- E. SUBSCRIPTIONS & SUBSCRIPTION INVOICES (MANAGER/CASHIER/STORE_OFFICER denied)
DROP POLICY IF EXISTS tenant_isolation_org_subscriptions ON public.business_subscriptions;
DROP POLICY IF EXISTS business_subscriptions_update_policy ON public.business_subscriptions;
DROP POLICY IF EXISTS subscription_invoices_select_policy ON public.subscription_invoices;

CREATE POLICY tenant_isolation_org_subscriptions ON public.business_subscriptions
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('SUBSCRIPTIONS_VIEW')
  );

CREATE POLICY business_subscriptions_update_policy ON public.business_subscriptions
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('SUBSCRIPTIONS_MANAGE')
  )
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND public.has_permission('SUBSCRIPTIONS_MANAGE')
  );

CREATE POLICY subscription_invoices_select_policy ON public.subscription_invoices
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('SUBSCRIPTIONS_VIEW')
  );

-- F. QUOTATIONS (Fixes Error A: 42501 on INSERT/UPSERT)
DROP POLICY IF EXISTS "Quotations Access Policy" ON public.quotations;
DROP POLICY IF EXISTS "Quotations Select Policy" ON public.quotations;
DROP POLICY IF EXISTS "Quotations Insert Policy" ON public.quotations;
DROP POLICY IF EXISTS "Quotations Update Policy" ON public.quotations;
DROP POLICY IF EXISTS "Quotations Delete Policy" ON public.quotations;

CREATE POLICY "Quotations Select Policy" ON public.quotations
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('QUOTES_VIEW')
  );

CREATE POLICY "Quotations Insert Policy" ON public.quotations
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND public.has_permission('QUOTES_CREATE')
  );

CREATE POLICY "Quotations Update Policy" ON public.quotations
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('QUOTES_EDIT')
  )
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND public.has_permission('QUOTES_EDIT')
  );

CREATE POLICY "Quotations Delete Policy" ON public.quotations
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('QUOTES_DELETE')
  );

-- G. PRODUCTS & CATEGORIES (Fixes Error B: 42501 on INSERT/UPDATE)
DROP POLICY IF EXISTS "Products Select Policy" ON public.products;
DROP POLICY IF EXISTS "Products Insert/Update Policy" ON public.products;
DROP POLICY IF EXISTS "Products Insert Policy" ON public.products;
DROP POLICY IF EXISTS "Products Update Policy" ON public.products;
DROP POLICY IF EXISTS "Products Delete Policy" ON public.products;

CREATE POLICY "Products Select Policy" ON public.products
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('PRODUCTS_VIEW')
  );

CREATE POLICY "Products Insert Policy" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND public.has_permission('PRODUCTS_CREATE')
  );

CREATE POLICY "Products Update Policy" ON public.products
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND (public.has_permission('PRODUCTS_EDIT') OR public.has_permission('INVENTORY_ADJUST'))
  )
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND (public.has_permission('PRODUCTS_EDIT') OR public.has_permission('INVENTORY_ADJUST'))
  );

CREATE POLICY "Products Delete Policy" ON public.products
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('PRODUCTS_EDIT')
    AND public.current_user_role() IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER')
  );

DROP POLICY IF EXISTS "Product Categories Select Policy" ON public.product_categories;
DROP POLICY IF EXISTS "Product Categories Manage Policy" ON public.product_categories;
CREATE POLICY "Product Categories Select Policy" ON public.product_categories
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('PRODUCTS_VIEW')
  );

CREATE POLICY "Product Categories Manage Policy" ON public.product_categories
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND (public.has_permission('PRODUCTS_CREATE') OR public.has_permission('PRODUCTS_EDIT'))
  )
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND (public.has_permission('PRODUCTS_CREATE') OR public.has_permission('PRODUCTS_EDIT'))
  );

-- H. CUSTOMERS (Fixes Error C: 42501 on INSERT/UPDATE)
DROP POLICY IF EXISTS "Customers Access Policy" ON public.customers;
DROP POLICY IF EXISTS "Customers Select Policy" ON public.customers;
DROP POLICY IF EXISTS "Customers Insert Policy" ON public.customers;
DROP POLICY IF EXISTS "Customers Update Policy" ON public.customers;
DROP POLICY IF EXISTS "Customers Delete Policy" ON public.customers;

CREATE POLICY "Customers Select Policy" ON public.customers
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('CUSTOMERS_VIEW')
  );

CREATE POLICY "Customers Insert Policy" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND public.has_permission('CUSTOMERS_CREATE')
  );

CREATE POLICY "Customers Update Policy" ON public.customers
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('CUSTOMERS_EDIT')
  )
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND public.has_permission('CUSTOMERS_EDIT')
  );

CREATE POLICY "Customers Delete Policy" ON public.customers
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('CUSTOMERS_DELETE')
  );

-- I. SALES, SALE ITEMS, PAYMENTS & REFUNDS
DROP POLICY IF EXISTS "Sales Access Policy" ON public.sales;
DROP POLICY IF EXISTS "Sales Select Policy" ON public.sales;
DROP POLICY IF EXISTS "Sales Insert Policy" ON public.sales;

CREATE POLICY "Sales Select Policy" ON public.sales
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('SALES_VIEW')
  );

CREATE POLICY "Sales Insert Policy" ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND (public.has_permission('POS_CHECKOUT') OR public.has_permission('INVOICES_CREATE'))
  );

DROP POLICY IF EXISTS "Sale Items Access Policy" ON public.sale_items;
DROP POLICY IF EXISTS "Sale Items Select Policy" ON public.sale_items;
DROP POLICY IF EXISTS "Sale Items Insert Policy" ON public.sale_items;

CREATE POLICY "Sale Items Select Policy" ON public.sale_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND s.organization_id = public.current_user_org_id()
        AND public.has_permission('SALES_VIEW')
    )
  );

CREATE POLICY "Sale Items Insert Policy" ON public.sale_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND s.organization_id = public.current_user_org_id()
        AND (public.has_permission('POS_CHECKOUT') OR public.has_permission('INVOICES_CREATE'))
    )
  );

DROP POLICY IF EXISTS "Payments Access Policy" ON public.payments;
DROP POLICY IF EXISTS "Payments Select Policy" ON public.payments;
DROP POLICY IF EXISTS "Payments Insert Policy" ON public.payments;

CREATE POLICY "Payments Select Policy" ON public.payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = payments.sale_id
        AND s.organization_id = public.current_user_org_id()
        AND (public.has_permission('PAYMENTS_VIEW') OR public.has_permission('SALES_VIEW'))
    )
  );

CREATE POLICY "Payments Insert Policy" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = payments.sale_id
        AND s.organization_id = public.current_user_org_id()
        AND (public.has_permission('PAYMENTS_COLLECT') OR public.has_permission('POS_CHECKOUT'))
    )
  );

DROP POLICY IF EXISTS "Refunds Access Policy" ON public.refunds;
DROP POLICY IF EXISTS "Refunds Select Policy" ON public.refunds;
DROP POLICY IF EXISTS "Refunds Insert Policy" ON public.refunds;

CREATE POLICY "Refunds Select Policy" ON public.refunds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = refunds.sale_id
        AND s.organization_id = public.current_user_org_id()
        AND (public.has_permission('REFUNDS_CREATE') OR public.has_permission('SALES_VIEW'))
    )
  );

CREATE POLICY "Refunds Insert Policy" ON public.refunds
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = refunds.sale_id
        AND s.organization_id = public.current_user_org_id()
        AND public.has_permission('REFUNDS_CREATE')
    )
  );

-- J. SUPPLIERS, DELIVERIES, EXPENSES, COUPONS, STOCK MOVEMENTS & AUDIT LOGS
DROP POLICY IF EXISTS "Suppliers Access Policy" ON public.suppliers;
DROP POLICY IF EXISTS "Suppliers Select Policy" ON public.suppliers;
DROP POLICY IF EXISTS "Suppliers Manage Policy" ON public.suppliers;

CREATE POLICY "Suppliers Select Policy" ON public.suppliers
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('SUPPLIERS_VIEW')
  );

CREATE POLICY "Suppliers Manage Policy" ON public.suppliers
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('SUPPLIERS_MANAGE')
  )
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND public.has_permission('SUPPLIERS_MANAGE')
  );

DROP POLICY IF EXISTS "Deliveries Access Policy" ON public.deliveries;
CREATE POLICY "Deliveries Access Policy" ON public.deliveries
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('CHALLANS_MANAGE')
  )
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND public.has_permission('CHALLANS_MANAGE')
  );

DROP POLICY IF EXISTS "Expenses Access Policy" ON public.expenses;
DROP POLICY IF EXISTS "Expenses Select Policy" ON public.expenses;
DROP POLICY IF EXISTS "Expenses Manage Policy" ON public.expenses;

CREATE POLICY "Expenses Select Policy" ON public.expenses
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('EXPENSES_VIEW')
  );

CREATE POLICY "Expenses Manage Policy" ON public.expenses
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('EXPENSES_MANAGE')
  )
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND public.has_permission('EXPENSES_MANAGE')
  );

DROP POLICY IF EXISTS "Coupons Select Policy" ON public.coupons;
DROP POLICY IF EXISTS "Coupons Manage Policy" ON public.coupons;
CREATE POLICY "Coupons Select Policy" ON public.coupons
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND (public.has_permission('POS_USE') OR public.has_permission('SALES_VIEW'))
  );

CREATE POLICY "Coupons Manage Policy" ON public.coupons
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('ORG_SETTINGS_MANAGE')
  )
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND public.has_permission('ORG_SETTINGS_MANAGE')
  );

DROP POLICY IF EXISTS "Stock Movements Select Policy" ON public.stock_movements;
DROP POLICY IF EXISTS "Stock Movements Insert Policy" ON public.stock_movements;
CREATE POLICY "Stock Movements Select Policy" ON public.stock_movements
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND (
      public.has_permission('STOCK_MOVEMENTS_VIEW')
      OR public.has_permission('INVENTORY_VIEW')
      OR public.has_permission('POS_USE')
    )
  );

CREATE POLICY "Stock Movements Insert Policy" ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND (
      public.has_permission('INVENTORY_ADJUST')
      OR public.has_permission('POS_CHECKOUT')
      OR public.has_permission('GOODS_RECEIPTS_MANAGE')
      OR public.has_permission('DEBIT_NOTES_MANAGE')
    )
  );

DROP POLICY IF EXISTS "Audit Logs Select Policy" ON public.audit_logs;
DROP POLICY IF EXISTS "Audit Logs Insert Policy" ON public.audit_logs;
CREATE POLICY "Audit Logs Select Policy" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND public.has_permission('AUDIT_VIEW')
  );

CREATE POLICY "Audit Logs Insert Policy" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Sync Outbox Access Policy" ON public.sync_outbox;
CREATE POLICY "Sync Outbox Access Policy" ON public.sync_outbox
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND (public.has_permission('SYNC_MANAGE') OR public.has_permission('POS_CHECKOUT'))
  )
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND (public.has_permission('SYNC_MANAGE') OR public.has_permission('POS_CHECKOUT'))
  );

-- K. FINANCIAL & ACCOUNTING MODULES (Granular Permission Enforcement + Tenant Isolation)
DROP POLICY IF EXISTS "Tenant isolation for bank_accounts" ON public.bank_accounts;
CREATE POLICY "Tenant isolation for bank_accounts" ON public.bank_accounts
  FOR ALL TO authenticated
  USING (organization_id = public.current_user_org_id() AND public.has_permission('BANKING_VIEW'))
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('BANKING_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for bank_transactions" ON public.bank_transactions;
CREATE POLICY "Tenant isolation for bank_transactions" ON public.bank_transactions
  FOR ALL TO authenticated
  USING (organization_id = public.current_user_org_id() AND public.has_permission('BANKING_VIEW'))
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('BANKING_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for bank_reconciliations" ON public.bank_reconciliations;
CREATE POLICY "Tenant isolation for bank_reconciliations" ON public.bank_reconciliations
  FOR ALL TO authenticated
  USING (organization_id = public.current_user_org_id() AND public.has_permission('BANKING_VIEW'))
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('BANKING_RECONCILE'));

DROP POLICY IF EXISTS "Tenant isolation for bank_reconciliation_items" ON public.bank_reconciliation_items;
CREATE POLICY "Tenant isolation for bank_reconciliation_items" ON public.bank_reconciliation_items
  FOR ALL TO authenticated
  USING (organization_id = public.current_user_org_id() AND public.has_permission('BANKING_VIEW'))
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('BANKING_RECONCILE'));

DROP POLICY IF EXISTS "Tenant isolation for credit_notes" ON public.credit_notes;
CREATE POLICY "Tenant isolation for credit_notes" ON public.credit_notes
  FOR ALL TO authenticated
  USING (organization_id = public.current_user_org_id() AND public.has_permission('CREDIT_NOTES_MANAGE'))
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('CREDIT_NOTES_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for credit_note_items" ON public.credit_note_items;
CREATE POLICY "Tenant isolation for credit_note_items" ON public.credit_note_items
  FOR ALL TO authenticated
  USING (
    public.has_permission('CREDIT_NOTES_MANAGE')
    AND EXISTS (
      SELECT 1 FROM public.credit_notes cn
      WHERE cn.id = credit_note_items.credit_note_id
        AND cn.organization_id = public.current_user_org_id()
    )
  )
  WITH CHECK (
    public.has_permission('CREDIT_NOTES_MANAGE')
    AND EXISTS (
      SELECT 1 FROM public.credit_notes cn
      WHERE cn.id = credit_note_items.credit_note_id
        AND cn.organization_id = public.current_user_org_id()
    )
  );

DROP POLICY IF EXISTS "Tenant isolation for purchase_orders" ON public.purchase_orders;
CREATE POLICY "Tenant isolation for purchase_orders" ON public.purchase_orders
  FOR ALL TO authenticated
  USING (organization_id = public.current_user_org_id() AND public.has_permission('PURCHASE_ORDERS_MANAGE'))
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('PURCHASE_ORDERS_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for purchase_order_items" ON public.purchase_order_items;
CREATE POLICY "Tenant isolation for purchase_order_items" ON public.purchase_order_items
  FOR ALL TO authenticated
  USING (
    public.has_permission('PURCHASE_ORDERS_MANAGE')
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND po.organization_id = public.current_user_org_id()
    )
  )
  WITH CHECK (
    public.has_permission('PURCHASE_ORDERS_MANAGE')
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND po.organization_id = public.current_user_org_id()
    )
  );

DROP POLICY IF EXISTS "Tenant isolation for goods_receipts" ON public.goods_receipts;
CREATE POLICY "Tenant isolation for goods_receipts" ON public.goods_receipts
  FOR ALL TO authenticated
  USING (organization_id = public.current_user_org_id() AND public.has_permission('GOODS_RECEIPTS_MANAGE'))
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('GOODS_RECEIPTS_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for goods_receipt_items" ON public.goods_receipt_items;
CREATE POLICY "Tenant isolation for goods_receipt_items" ON public.goods_receipt_items
  FOR ALL TO authenticated
  USING (
    public.has_permission('GOODS_RECEIPTS_MANAGE')
    AND EXISTS (
      SELECT 1 FROM public.goods_receipts gr
      WHERE gr.id = goods_receipt_items.goods_receipt_id
        AND gr.organization_id = public.current_user_org_id()
    )
  )
  WITH CHECK (
    public.has_permission('GOODS_RECEIPTS_MANAGE')
    AND EXISTS (
      SELECT 1 FROM public.goods_receipts gr
      WHERE gr.id = goods_receipt_items.goods_receipt_id
        AND gr.organization_id = public.current_user_org_id()
    )
  );

DROP POLICY IF EXISTS "Tenant isolation for supplier_bills" ON public.supplier_bills;
CREATE POLICY "Tenant isolation for supplier_bills" ON public.supplier_bills
  FOR ALL TO authenticated
  USING (organization_id = public.current_user_org_id() AND public.has_permission('SUPPLIER_BILLS_MANAGE'))
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('SUPPLIER_BILLS_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for supplier_payments" ON public.supplier_payments;
CREATE POLICY "Tenant isolation for supplier_payments" ON public.supplier_payments
  FOR ALL TO authenticated
  USING (organization_id = public.current_user_org_id() AND public.has_permission('SUPPLIER_BILLS_MANAGE'))
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('SUPPLIER_BILLS_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for debit_notes" ON public.debit_notes;
CREATE POLICY "Tenant isolation for debit_notes" ON public.debit_notes
  FOR ALL TO authenticated
  USING (organization_id = public.current_user_org_id() AND public.has_permission('DEBIT_NOTES_MANAGE'))
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('DEBIT_NOTES_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for debit_note_items" ON public.debit_note_items;
CREATE POLICY "Tenant isolation for debit_note_items" ON public.debit_note_items
  FOR ALL TO authenticated
  USING (organization_id = public.current_user_org_id() AND public.has_permission('DEBIT_NOTES_MANAGE'))
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('DEBIT_NOTES_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for chart_of_accounts" ON public.chart_of_accounts;
CREATE POLICY "Tenant isolation for chart_of_accounts" ON public.chart_of_accounts
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND (public.has_permission('COA_MANAGE') OR public.has_permission('REPORTS_FINANCIAL_VIEW') OR public.has_permission('BUDGETS_MANAGE'))
  )
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('COA_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for accounting_periods" ON public.accounting_periods;
CREATE POLICY "Tenant isolation for accounting_periods" ON public.accounting_periods
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND (public.has_permission('FISCAL_MANAGE') OR public.has_permission('JOURNAL_MANAGE') OR public.has_permission('REPORTS_FINANCIAL_VIEW'))
  )
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('FISCAL_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for journal_entries" ON public.journal_entries;
CREATE POLICY "Tenant isolation for journal_entries" ON public.journal_entries
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND (public.has_permission('JOURNAL_MANAGE') OR public.has_permission('TRANSACTIONS_VIEW') OR public.has_permission('REPORTS_FINANCIAL_VIEW'))
  )
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('JOURNAL_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for journal_entry_lines" ON public.journal_entry_lines;
CREATE POLICY "Tenant isolation for journal_entry_lines" ON public.journal_entry_lines
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND (public.has_permission('JOURNAL_MANAGE') OR public.has_permission('TRANSACTIONS_VIEW') OR public.has_permission('REPORTS_FINANCIAL_VIEW'))
  )
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('JOURNAL_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for general_ledger" ON public.general_ledger;
CREATE POLICY "Tenant isolation for general_ledger" ON public.general_ledger
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND (public.has_permission('REPORTS_FINANCIAL_VIEW') OR public.has_permission('TRANSACTIONS_VIEW') OR public.has_permission('JOURNAL_MANAGE'))
  )
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('JOURNAL_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for accounting_posting_records" ON public.accounting_posting_records;
CREATE POLICY "Tenant isolation for accounting_posting_records" ON public.accounting_posting_records
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND (public.has_permission('JOURNAL_MANAGE') OR public.has_permission('REPORTS_FINANCIAL_VIEW'))
  )
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('JOURNAL_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for budgets" ON public.budgets;
CREATE POLICY "Tenant isolation for budgets" ON public.budgets
  FOR ALL TO authenticated
  USING (organization_id = public.current_user_org_id() AND public.has_permission('BUDGETS_MANAGE'))
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('BUDGETS_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for budget_lines" ON public.budget_lines;
CREATE POLICY "Tenant isolation for budget_lines" ON public.budget_lines
  FOR ALL TO authenticated
  USING (organization_id = public.current_user_org_id() AND public.has_permission('BUDGETS_MANAGE'))
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('BUDGETS_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for bulk_import_batches" ON public.bulk_import_batches;
CREATE POLICY "Tenant isolation for bulk_import_batches" ON public.bulk_import_batches
  FOR ALL TO authenticated
  USING (organization_id = public.current_user_org_id() AND public.has_permission('BULK_UPDATES_MANAGE'))
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('BULK_UPDATES_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for bulk_import_errors" ON public.bulk_import_errors;
CREATE POLICY "Tenant isolation for bulk_import_errors" ON public.bulk_import_errors
  FOR ALL TO authenticated
  USING (organization_id = public.current_user_org_id() AND public.has_permission('BULK_UPDATES_MANAGE'))
  WITH CHECK (organization_id = public.current_user_org_id() AND public.has_permission('BULK_UPDATES_MANAGE'));

DROP POLICY IF EXISTS "Tenant isolation for financial_audit_logs" ON public.financial_audit_logs;
CREATE POLICY "Tenant isolation for financial_audit_logs" ON public.financial_audit_logs
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND (
      public.has_permission('AUDIT_VIEW')
      OR public.has_permission('JOURNAL_MANAGE')
      OR public.has_permission('BANKING_MANAGE')
      OR public.has_permission('DEBIT_NOTES_MANAGE')
    )
  )
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Tenant isolation for sync_outbox_events" ON public.sync_outbox_events;
CREATE POLICY "Tenant isolation for sync_outbox_events" ON public.sync_outbox_events
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND (public.has_permission('SYNC_MANAGE') OR public.has_permission('POS_CHECKOUT'))
  )
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND (public.has_permission('SYNC_MANAGE') OR public.has_permission('POS_CHECKOUT'))
  );

-- ------------------------------------------------------------------------------
-- 4. REPAIRED ATOMIC RPCS: process_sale_atomic, process_refund_atomic, register_business_tenant_atomic
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_sale_atomic(
    p_sale_json JSONB,
    p_items_json JSONB,
    p_payments_json JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_auth_id UUID;
    v_is_service_role BOOLEAN;
    v_caller_profile RECORD;
    v_org_id VARCHAR(64);
    v_branch_id VARCHAR(64);
    v_cashier_id VARCHAR(64);
    v_cashier_name VARCHAR(255);
    v_sale_id VARCHAR(64);
    v_idempotency_key VARCHAR(128);
    v_existing_sale_id VARCHAR(64);
    v_existing_org_id VARCHAR(64);
    v_customer_id VARCHAR(64);
    v_customer_state_code VARCHAR(2);
    v_store_state_code VARCHAR(2);

    v_unit_price NUMERIC(12, 2);
    v_item_discount NUMERIC(12, 2);
    v_taxable_amount NUMERIC(12, 2);
    v_gst_rate NUMERIC(5, 2);
    v_cgst NUMERIC(12, 2);
    v_sgst NUMERIC(12, 2);
    v_igst NUMERIC(12, 2);
    v_line_total NUMERIC(12, 2);

    v_calculated_subtotal NUMERIC(12, 2) := 0.00;
    v_total_item_discounts NUMERIC(12, 2) := 0.00;
    v_calculated_cgst NUMERIC(12, 2) := 0.00;
    v_calculated_sgst NUMERIC(12, 2) := 0.00;
    v_calculated_igst NUMERIC(12, 2) := 0.00;
    v_calculated_tax NUMERIC(12, 2) := 0.00;
    v_total_discount NUMERIC(12, 2) := 0.00;
    v_calculated_grand_total NUMERIC(12, 2) := 0.00;
    v_client_grand_total NUMERIC(12, 2);

    v_item JSONB;
    v_payment JSONB;
    v_prod_id VARCHAR(64);
    v_qty NUMERIC(12, 2);
    v_prod_record RECORD;
    v_customer_record RECORD;
    v_current_stock NUMERIC(12, 2);
    v_payment_sum NUMERIC(12, 2) := 0.00;
    v_verified_paid NUMERIC(12, 2) := 0.00;
    v_pay_amount NUMERIC(12, 2);
    v_pay_method payment_method;
    v_pay_method_text TEXT;
    v_pay_status VARCHAR(32);
    v_change_returned NUMERIC(12, 2) := 0.00;
    v_amount_paid NUMERIC(12, 2) := 0.00;
    v_unpaid_balance NUMERIC(12, 2) := 0.00;
    v_sale_payment_status payment_status;
    v_primary_method payment_method := 'CASH';
    v_requested_primary TEXT;
BEGIN
    v_caller_auth_id := auth.uid();
    v_is_service_role := public.is_trusted_service_role();

    IF NOT v_is_service_role THEN
        IF v_caller_auth_id IS NULL THEN
            RAISE EXCEPTION 'Authentication required: valid session token must be provided';
        END IF;

        SELECT id, name, organization_id, branch_id, role, is_active
        INTO v_caller_profile
        FROM public.user_profiles
        WHERE auth_user_id = v_caller_auth_id AND is_active = TRUE
        LIMIT 1;

        IF v_caller_profile IS NULL OR v_caller_profile.organization_id IS NULL THEN
            RAISE EXCEPTION 'Access Denied: Caller has no active organization profile';
        END IF;

        IF v_caller_profile.role NOT IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'CASHIER') THEN
            RAISE EXCEPTION 'Access Denied: Role % is not authorized to process counter checkout sales', v_caller_profile.role;
        END IF;

        v_org_id := v_caller_profile.organization_id;
        v_cashier_id := v_caller_profile.id;
        v_cashier_name := v_caller_profile.name;

        IF v_caller_profile.role IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER') THEN
            v_branch_id := COALESCE(NULLIF(p_sale_json->>'branchId', ''), v_caller_profile.branch_id);
        ELSE
            IF v_caller_profile.branch_id IS NOT NULL
               AND NULLIF(p_sale_json->>'branchId', '') IS NOT NULL
               AND (p_sale_json->>'branchId') <> v_caller_profile.branch_id THEN
                RAISE EXCEPTION 'Access Denied: User role % assigned to branch % cannot create sales for branch %',
                    v_caller_profile.role, v_caller_profile.branch_id, p_sale_json->>'branchId';
            END IF;
            v_branch_id := COALESCE(v_caller_profile.branch_id, NULLIF(p_sale_json->>'branchId', ''));
        END IF;
    ELSE
        v_org_id := p_sale_json->>'organizationId';
        v_branch_id := p_sale_json->>'branchId';
        v_cashier_id := COALESCE(p_sale_json->>'cashierId', 'usr_system_sync');
        v_cashier_name := COALESCE(p_sale_json->>'cashierName', 'Cloud Service Sync');
    END IF;

    -- Resolve organization GST state_code & validate active tenant branch (stores has no state_code)
    SELECT o.state_code INTO v_store_state_code
    FROM public.stores s
    JOIN public.organizations o ON o.id = s.organization_id
    WHERE s.id = v_branch_id
      AND s.organization_id = v_org_id
      AND s.is_active = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Branch % does not belong to active authorized organization %', v_branch_id, v_org_id;
    END IF;

    v_sale_id := p_sale_json->>'id';
    IF v_sale_id IS NULL OR TRIM(v_sale_id) = '' THEN
        RAISE EXCEPTION 'Sale ID must be provided';
    END IF;

    v_idempotency_key := NULLIF(p_sale_json->>'idempotencyKey', '');
    v_customer_id := NULLIF(p_sale_json->>'customerId', '');
    v_client_grand_total := NULLIF((p_sale_json->>'grandTotal')::NUMERIC, NULL);

    IF v_customer_id IS NOT NULL THEN
        SELECT * INTO v_customer_record
        FROM public.customers
        WHERE id = v_customer_id AND organization_id = v_org_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Customer % does not belong to authorized organization %', v_customer_id, v_org_id;
        END IF;
        v_customer_state_code := v_customer_record.state_code;
    END IF;

    IF v_idempotency_key IS NOT NULL THEN
        SELECT id, organization_id INTO v_existing_sale_id, v_existing_org_id
        FROM public.sales
        WHERE idempotency_key = v_idempotency_key
        LIMIT 1;

        IF v_existing_sale_id IS NOT NULL THEN
            IF v_existing_org_id <> v_org_id THEN
                RAISE EXCEPTION 'Access Denied: Idempotency key collision across tenant boundary';
            END IF;
            RETURN jsonb_build_object('status', 'ALREADY_EXISTS', 'sale_id', v_existing_sale_id);
        END IF;
    END IF;

    IF p_items_json IS NULL OR jsonb_array_length(p_items_json) = 0 THEN
        RAISE EXCEPTION 'Sale must contain at least one line item';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_json)
    LOOP
        v_prod_id := v_item->>'productId';
        v_qty := (v_item->>'quantity')::NUMERIC;
        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Item quantity must be greater than zero for product %', v_prod_id;
        END IF;

        SELECT * INTO v_prod_record
        FROM public.products
        WHERE id = v_prod_id AND organization_id = v_org_id
        FOR UPDATE;

        IF v_prod_record IS NULL THEN
            RAISE EXCEPTION 'Product % does not belong to authorized organization %', v_prod_id, v_org_id;
        END IF;

        IF v_prod_record.current_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient inventory for % (SKU: %). Available: %, Requested: %',
                v_prod_record.name, v_prod_record.sku, v_prod_record.current_stock, v_qty;
        END IF;

        v_unit_price := v_prod_record.selling_price;
        v_item_discount := GREATEST(0.00, COALESCE((v_item->>'discount')::NUMERIC, 0.00));
        IF v_item_discount > (v_qty * v_unit_price) THEN
            v_item_discount := (v_qty * v_unit_price);
        END IF;

        v_taxable_amount := ROUND((v_qty * v_unit_price) - v_item_discount, 2);
        v_gst_rate := COALESCE(v_prod_record.gst_rate, 0.00);

        IF v_customer_state_code IS NOT NULL AND v_store_state_code IS NOT NULL AND v_customer_state_code <> v_store_state_code THEN
            v_igst := ROUND((v_taxable_amount * v_gst_rate / 100.0), 2);
            v_cgst := 0.00;
            v_sgst := 0.00;
        ELSE
            v_cgst := ROUND((v_taxable_amount * (v_gst_rate / 2.0) / 100.0), 2);
            v_sgst := ROUND((v_taxable_amount * (v_gst_rate / 2.0) / 100.0), 2);
            v_igst := 0.00;
        END IF;

        v_line_total := v_taxable_amount + v_cgst + v_sgst + v_igst;

        v_calculated_subtotal := v_calculated_subtotal + ROUND(v_qty * v_unit_price, 2);
        v_total_item_discounts := v_total_item_discounts + v_item_discount;
        v_calculated_cgst := v_calculated_cgst + v_cgst;
        v_calculated_sgst := v_calculated_sgst + v_sgst;
        v_calculated_igst := v_calculated_igst + v_igst;
        v_calculated_tax := v_calculated_tax + v_cgst + v_sgst + v_igst;

        UPDATE public.products
        SET current_stock = current_stock - v_qty,
            updated_at = NOW()
        WHERE id = v_prod_id
        RETURNING current_stock INTO v_current_stock;

        INSERT INTO public.stock_movements (
            id, organization_id, branch_id, product_id, product_name, sku,
            type, quantity_change, new_balance, reference_id, notes, performed_by
        ) VALUES (
            'mov_' || v_sale_id || '_' || v_prod_record.sku,
            v_org_id,
            v_branch_id,
            v_prod_id,
            v_prod_record.name,
            v_prod_record.sku,
            'SALE',
            -v_qty,
            v_current_stock,
            p_sale_json->>'invoiceNumber',
            'Counter checkout sale',
            v_cashier_name
        );
    END LOOP;

    v_total_discount := GREATEST(v_total_item_discounts, COALESCE((p_sale_json->>'totalDiscount')::NUMERIC, 0.00));
    IF v_total_discount > v_calculated_subtotal THEN
        v_total_discount := v_calculated_subtotal;
    END IF;

    v_calculated_grand_total := ROUND(
        v_calculated_subtotal - v_total_discount + v_calculated_tax + COALESCE((p_sale_json->>'roundingAdjustment')::NUMERIC, 0.00),
        2
    );

    IF v_client_grand_total IS NOT NULL AND ABS(v_calculated_grand_total - v_client_grand_total) > 1.00 THEN
        RAISE EXCEPTION 'Grand total mismatch: calculated %, supplied %', v_calculated_grand_total, v_client_grand_total;
    END IF;

    IF p_payments_json IS NOT NULL AND jsonb_typeof(p_payments_json) = 'array' THEN
        FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments_json)
        LOOP
            v_pay_amount := (v_payment->>'amount')::NUMERIC;
            IF v_pay_amount IS NULL OR v_pay_amount <= 0 THEN
                RAISE EXCEPTION 'Payment amount must be greater than zero';
            END IF;

            v_pay_method_text := COALESCE(UPPER(TRIM(v_payment->>'method')), 'CASH');
            IF v_pay_method_text = 'CREDIT' THEN
                CONTINUE;
            END IF;

            IF v_pay_method_text NOT IN ('CASH', 'UPI', 'CARD', 'CREDIT_NOTE', 'SPLIT') THEN
                RAISE EXCEPTION 'Unsupported payment method: %', v_pay_method_text;
            END IF;

            v_pay_method := v_pay_method_text::payment_method;
            v_primary_method := COALESCE(v_primary_method, v_pay_method);

            IF v_pay_method = 'CREDIT_NOTE' THEN
                IF v_customer_id IS NULL THEN
                    RAISE EXCEPTION 'Customer required to apply CREDIT_NOTE payment';
                END IF;
                UPDATE public.customers
                SET current_receivable_balance = current_receivable_balance - v_pay_amount
                WHERE id = v_customer_id AND organization_id = v_org_id AND current_receivable_balance >= v_pay_amount;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Insufficient credit balance';
                END IF;
                v_pay_status := 'VERIFIED';
                v_verified_paid := v_verified_paid + v_pay_amount;
                v_payment_sum := v_payment_sum + v_pay_amount;
            ELSIF v_pay_method = 'CASH' THEN
                v_pay_status := 'VERIFIED';
                v_verified_paid := v_verified_paid + v_pay_amount;
                v_payment_sum := v_payment_sum + v_pay_amount;
            ELSE
                v_pay_status := 'PENDING';
                v_payment_sum := v_payment_sum + v_pay_amount;
            END IF;

            INSERT INTO public.payments (
                id, idempotency_key, sale_id, customer_id,
                method, amount, utr_or_ref, gateway_status, timestamp
            ) VALUES (
                COALESCE(v_payment->>'id', 'pay_' || v_sale_id || '_' || v_pay_method_text),
                COALESCE(v_payment->>'idempotencyKey', COALESCE(v_idempotency_key, v_sale_id) || '_' || v_pay_method_text || '_' || v_pay_amount),
                v_sale_id,
                v_customer_id,
                v_pay_method,
                v_pay_amount,
                v_payment->>'utrOrRef',
                v_pay_status,
                COALESCE((v_payment->>'timestamp')::TIMESTAMPTZ, NOW())
            ) ON CONFLICT (idempotency_key) DO NOTHING;
        END LOOP;
    END IF;

    IF v_payment_sum > v_calculated_grand_total THEN
        v_change_returned := ROUND(v_payment_sum - v_calculated_grand_total, 2);
        v_amount_paid := v_calculated_grand_total;
    ELSE
        v_change_returned := 0.00;
        v_amount_paid := v_payment_sum;
    END IF;

    v_unpaid_balance := GREATEST(0.00, ROUND(v_calculated_grand_total - v_payment_sum, 2));

    IF v_verified_paid >= v_calculated_grand_total THEN
        v_sale_payment_status := 'PAID';
    ELSIF v_payment_sum >= v_calculated_grand_total THEN
        v_sale_payment_status := 'PENDING';
    ELSIF v_payment_sum > 0 THEN
        v_sale_payment_status := 'PARTIALLY_PAID';
    ELSE
        v_sale_payment_status := 'PENDING';
    END IF;

    v_requested_primary := UPPER(COALESCE(NULLIF(TRIM(p_sale_json->>'primaryPaymentMethod'), ''), ''));
    IF v_requested_primary IN ('CASH', 'UPI', 'CARD', 'CREDIT_NOTE', 'SPLIT') THEN
        v_primary_method := v_requested_primary::payment_method;
    END IF;

    INSERT INTO public.sales (
        id, idempotency_key, invoice_number, receipt_number,
        organization_id, branch_id, cashier_id, cashier_name,
        terminal_code, customer_id, customer_name, customer_phone, customer_gstin,
        subtotal, total_discount, coupon_code, cgst, sgst, igst, total_tax,
        rounding_adjustment, grand_total, amount_paid, change_returned,
        payment_status, primary_payment_method, sync_status, is_offline_created
    ) VALUES (
        v_sale_id,
        v_idempotency_key,
        p_sale_json->>'invoiceNumber',
        p_sale_json->>'receiptNumber',
        v_org_id,
        v_branch_id,
        v_cashier_id,
        v_cashier_name,
        COALESCE(p_sale_json->>'terminalCode', 'TERM-01'),
        v_customer_id,
        p_sale_json->>'customerName',
        p_sale_json->>'customerPhone',
        p_sale_json->>'customerGstin',
        v_calculated_subtotal,
        v_total_discount,
        p_sale_json->>'couponCode',
        v_calculated_cgst,
        v_calculated_sgst,
        v_calculated_igst,
        v_calculated_tax,
        COALESCE((p_sale_json->>'roundingAdjustment')::NUMERIC, 0.00),
        v_calculated_grand_total,
        v_amount_paid,
        v_change_returned,
        v_sale_payment_status,
        v_primary_method,
        'SYNCED',
        COALESCE((p_sale_json->>'isOfflineCreated')::BOOLEAN, false)
    );

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_json)
    LOOP
        v_prod_id := v_item->>'productId';
        v_qty := (v_item->>'quantity')::NUMERIC;

        SELECT * INTO v_prod_record
        FROM public.products
        WHERE id = v_prod_id AND organization_id = v_org_id;

        v_unit_price := v_prod_record.selling_price;
        v_item_discount := GREATEST(0.00, COALESCE((v_item->>'discount')::NUMERIC, 0.00));
        IF v_item_discount > (v_qty * v_unit_price) THEN
            v_item_discount := (v_qty * v_unit_price);
        END IF;

        v_taxable_amount := ROUND((v_qty * v_unit_price) - v_item_discount, 2);
        v_gst_rate := COALESCE(v_prod_record.gst_rate, 0.00);

        IF v_customer_state_code IS NOT NULL AND v_store_state_code IS NOT NULL AND v_customer_state_code <> v_store_state_code THEN
            v_igst := ROUND((v_taxable_amount * v_gst_rate / 100.0), 2);
            v_cgst := 0.00;
            v_sgst := 0.00;
        ELSE
            v_cgst := ROUND((v_taxable_amount * (v_gst_rate / 2.0) / 100.0), 2);
            v_sgst := ROUND((v_taxable_amount * (v_gst_rate / 2.0) / 100.0), 2);
            v_igst := 0.00;
        END IF;

        v_line_total := v_taxable_amount + v_cgst + v_sgst + v_igst;

        INSERT INTO public.sale_items (
            id, sale_id, product_id, sku, product_name, hsn,
            quantity, unit_price, discount, taxable_amount, gst_rate,
            cgst, sgst, igst, total
        ) VALUES (
            COALESCE(v_item->>'id', v_sale_id || '_' || v_prod_id),
            v_sale_id,
            v_prod_id,
            v_prod_record.sku,
            v_prod_record.name,
            v_prod_record.hsn,
            v_qty,
            v_unit_price,
            v_item_discount,
            v_taxable_amount,
            v_gst_rate,
            v_cgst,
            v_sgst,
            v_igst,
            v_line_total
        );
    END LOOP;

    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET total_orders_count = total_orders_count + 1,
            current_receivable_balance = current_receivable_balance + v_unpaid_balance,
            updated_at = NOW()
        WHERE id = v_customer_id AND organization_id = v_org_id;
    END IF;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'sale_id', v_sale_id,
        'grand_total', v_calculated_grand_total,
        'payment_status', v_sale_payment_status::text,
        'change_returned', v_change_returned
    );
END;
$$;

REVOKE ALL ON FUNCTION public.process_sale_atomic(JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_sale_atomic(JSONB, JSONB, JSONB) TO authenticated, service_role;

-- Update process_refund_atomic so MANAGER can approve refunds across all active branches within their organization
CREATE OR REPLACE FUNCTION public.process_refund_atomic(
    p_refund_json JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_auth_id UUID;
    v_is_service_role BOOLEAN;
    v_caller_profile RECORD;
    v_org_id VARCHAR(64);
    v_approved_by VARCHAR(255);
    v_refund_id VARCHAR(64);
    v_sale_id VARCHAR(64);
    v_refund_amount NUMERIC(12, 2);
    v_already_refunded NUMERIC(12, 2);
    v_sale_record RECORD;
    v_sale_item RECORD;
    v_item JSONB;
    v_restock BOOLEAN;
    v_prod_id VARCHAR(64);
    v_qty NUMERIC(10, 2);
    v_previous_item_returns NUMERIC(10, 2);
    v_current_stock NUMERIC(12, 2);
BEGIN
    v_caller_auth_id := auth.uid();
    v_is_service_role := public.is_trusted_service_role();

    IF NOT v_is_service_role THEN
        IF v_caller_auth_id IS NULL THEN
            RAISE EXCEPTION 'Authentication required: valid session token must be provided';
        END IF;

        SELECT id, name, organization_id, branch_id, role
        INTO v_caller_profile
        FROM public.user_profiles
        WHERE auth_user_id = v_caller_auth_id AND is_active = TRUE
        LIMIT 1;

        IF v_caller_profile IS NULL OR v_caller_profile.organization_id IS NULL THEN
            RAISE EXCEPTION 'Access Denied: Caller has no active organization profile';
        END IF;

        IF v_caller_profile.role NOT IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER') THEN
            RAISE EXCEPTION 'Access Denied: Role % is not authorized to approve refunds', v_caller_profile.role;
        END IF;

        v_org_id := v_caller_profile.organization_id;
        v_approved_by := v_caller_profile.name;
    ELSE
        v_org_id := NULL;
        v_approved_by := COALESCE(p_refund_json->>'approvedBy', 'System Administrator');
    END IF;

    v_refund_id := p_refund_json->>'id';
    v_sale_id := p_refund_json->>'saleId';
    v_refund_amount := (p_refund_json->>'refundAmount')::NUMERIC;

    IF v_refund_amount <= 0 THEN
        RAISE EXCEPTION 'Refund amount must be greater than zero';
    END IF;

    IF EXISTS (SELECT 1 FROM public.refunds WHERE id = v_refund_id) THEN
        RETURN jsonb_build_object('status', 'ALREADY_EXISTS', 'refund_id', v_refund_id);
    END IF;

    SELECT * INTO v_sale_record
    FROM public.sales
    WHERE id = v_sale_id
      AND (v_org_id IS NULL OR organization_id = v_org_id)
    FOR UPDATE;

    IF v_sale_record IS NULL THEN
        RAISE EXCEPTION 'Original sale % not found in authorized organization', v_sale_id;
    END IF;

    SELECT COALESCE(SUM(refund_amount), 0) INTO v_already_refunded
    FROM public.refunds
    WHERE sale_id = v_sale_id;

    IF (v_already_refunded + v_refund_amount) > v_sale_record.grand_total THEN
        RAISE EXCEPTION 'Refund amount % exceeds remaining refundable balance % (Original: %, Already Refunded: %)',
            v_refund_amount, (v_sale_record.grand_total - v_already_refunded), v_sale_record.grand_total, v_already_refunded;
    END IF;

    IF p_refund_json->'items' IS NOT NULL AND jsonb_typeof(p_refund_json->'items') = 'array' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_refund_json->'items')
        LOOP
            v_prod_id := v_item->>'productId';
            v_qty := (v_item->>'quantity')::NUMERIC;
            v_restock := COALESCE((v_item->>'restockInventory')::BOOLEAN, false);

            SELECT * INTO v_sale_item
            FROM public.sale_items
            WHERE sale_id = v_sale_id AND product_id = v_prod_id;

            IF v_sale_item IS NULL THEN
                RAISE EXCEPTION 'Product % was not found in original sale transaction %', v_prod_id, v_sale_id;
            END IF;

            IF v_qty <= 0 THEN
                RAISE EXCEPTION 'Invalid return quantity % for product %', v_qty, v_sale_item.product_name;
            END IF;

            SELECT COALESCE(SUM((ref_item->>'quantity')::NUMERIC), 0)
            INTO v_previous_item_returns
            FROM public.refunds r,
                 jsonb_array_elements(r.items) ref_item
            WHERE r.sale_id = v_sale_id
              AND (ref_item->>'productId') = v_prod_id;

            IF (v_previous_item_returns + v_qty) > v_sale_item.quantity THEN
                RAISE EXCEPTION 'Cumulative return quantity % exceeds originally purchased quantity % for product % (already returned: %)',
                    (v_previous_item_returns + v_qty), v_sale_item.quantity, v_sale_item.product_name, v_previous_item_returns;
            END IF;

            IF v_restock THEN
                UPDATE public.products
                SET current_stock = current_stock + v_qty,
                    updated_at = NOW()
                WHERE id = v_prod_id
                RETURNING current_stock INTO v_current_stock;

                INSERT INTO public.stock_movements (
                    id, organization_id, branch_id, product_id, product_name, sku,
                    type, quantity_change, new_balance, reference_id, notes, performed_by
                ) VALUES (
                    'mov_ref_' || v_refund_id || '_' || v_sale_item.sku,
                    v_sale_record.organization_id,
                    v_sale_record.branch_id,
                    v_prod_id,
                    v_sale_item.product_name,
                    v_sale_item.sku,
                    'RETURN',
                    v_qty,
                    v_current_stock,
                    p_refund_json->>'receiptNumber',
                    'Customer Return - ' || COALESCE(p_refund_json->>'reason', 'Return restock'),
                    v_approved_by
                );
            END IF;
        END LOOP;
    END IF;

    INSERT INTO public.refunds (
        id, sale_id, receipt_number, refund_amount, items,
        reason, approved_by, refund_method, created_at
    ) VALUES (
        v_refund_id,
        v_sale_id,
        p_refund_json->>'receiptNumber',
        v_refund_amount,
        p_refund_json->'items',
        p_refund_json->>'reason',
        v_approved_by,
        p_refund_json->>'refundMethod',
        NOW()
    ) ON CONFLICT (id) DO NOTHING;

    IF (v_already_refunded + v_refund_amount) >= v_sale_record.grand_total THEN
        UPDATE public.sales
        SET payment_status = 'REFUNDED'
        WHERE id = v_sale_id;
    ELSE
        UPDATE public.sales
        SET payment_status = 'PARTIALLY_PAID'
        WHERE id = v_sale_id;
    END IF;

    RETURN jsonb_build_object('status', 'SUCCESS', 'refund_id', v_refund_id);
END;
$$;

REVOKE ALL ON FUNCTION public.process_refund_atomic(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_refund_atomic(JSONB) TO authenticated, service_role;

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

    SELECT id INTO v_plan_exists FROM public.subscription_plans WHERE id = p_initial_plan_id;
    IF v_plan_exists IS NULL THEN
        p_initial_plan_id := 'plan_growth_monthly';
    END IF;

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

    v_branch_id := 'br_' || SUBSTRING(p_org_id FROM 1 FOR 16) || '_main';
    INSERT INTO public.stores (
        id, organization_id, code, name, city, state, address, phone, gstin,
        is_active, is_headquarters, max_terminals, created_at, updated_at
    ) VALUES (
        v_branch_id, p_org_id, 'MAIN-01', p_org_name || ' Main Store',
        p_state, p_state, 'Primary Registered Commercial Address', p_user_phone,
        v_clean_gstin, TRUE, TRUE, 4, NOW(), NOW()
    ) ON CONFLICT (id) DO NOTHING;

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

COMMIT;
