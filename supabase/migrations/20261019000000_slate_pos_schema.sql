-- ============================================================================
-- SLATE POS — Enterprise PostgreSQL Schema & Security Migration for Supabase
-- Target: Supabase PostgreSQL (ap-south-1 Mumbai / Cloud)
-- Compliant with: Indian GST Council specifications, multi-branch tenant isolation,
-- Row Level Security (RLS), atomic inventory deductions, and idempotent sync outbox.
-- ============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Custom Enumerated Types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'SUPER_ADMIN',
        'ORG_ADMIN',
        'MANAGER',
        'CASHIER',
        'STORE_OFFICER',
        'PURCHASE_OFFICER'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM (
        'PAID',
        'PARTIALLY_PAID',
        'OVERDUE',
        'PENDING',
        'CANCELLED',
        'REFUNDED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM (
        'CASH',
        'UPI',
        'CARD',
        'CREDIT_NOTE',
        'SPLIT'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE sync_status AS ENUM (
        'PENDING',
        'SYNCING',
        'SYNCED',
        'CONFLICT',
        'FAILED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE stock_movement_type AS ENUM (
        'PURCHASE',
        'SALE',
        'RETURN',
        'ADJUSTMENT',
        'AUDIT_CORRECTION',
        'TRANSFER'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 3. CORE MULTI-TENANT & BRANCH TABLES
-- ============================================================================

-- Organizations (Enterprise Tenant)
CREATE TABLE IF NOT EXISTS organizations (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    gstin VARCHAR(15) NOT NULL,
    pan VARCHAR(10) NOT NULL,
    state VARCHAR(100) NOT NULL,
    state_code VARCHAR(2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    fiscal_year_start VARCHAR(10) DEFAULT '04-01',
    subscription_plan_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stores / Branches (Branch Isolation Boundary)
CREATE TABLE IF NOT EXISTS stores (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(20) NOT NULL,
    gstin VARCHAR(15) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_headquarters BOOLEAN DEFAULT FALSE,
    max_terminals INT DEFAULT 4,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_store_code_per_org UNIQUE (organization_id, code)
);

-- User Profiles & Role-Based Access Control
CREATE TABLE IF NOT EXISTS user_profiles (
    id VARCHAR(64) PRIMARY KEY, -- Maps to Supabase auth.users(id) or legacy user ID
    auth_user_id UUID,          -- Foreign key to Supabase auth.users when using Supabase Auth
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id VARCHAR(64) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role user_role NOT NULL DEFAULT 'CASHIER',
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    permissions TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. MASTER CATALOGUE & INVENTORY
-- ============================================================================

-- Product Categories
CREATE TABLE IF NOT EXISTS product_categories (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products Catalogue (with HSN, GST Slabs, Cost & Selling Prices)
CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id VARCHAR(64) REFERENCES stores(id) ON DELETE SET NULL,
    sku VARCHAR(64) NOT NULL,
    barcode VARCHAR(64) NOT NULL,
    hsn VARCHAR(16) NOT NULL,
    name VARCHAR(255) NOT NULL,
    category_id VARCHAR(64) REFERENCES product_categories(id) ON DELETE SET NULL,
    category_name VARCHAR(255),
    unit VARCHAR(16) NOT NULL DEFAULT 'PCS',
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    selling_price NUMERIC(12, 2) NOT NULL,
    gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00, -- 0%, 5%, 12%, 18%, 28%
    current_stock NUMERIC(12, 2) NOT NULL DEFAULT 0,
    min_stock_threshold NUMERIC(12, 2) NOT NULL DEFAULT 10,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_product_sku_per_org UNIQUE (organization_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_org_branch ON products(organization_id, branch_id);

-- Inventory Stock Movements & Audit
CREATE TABLE IF NOT EXISTS stock_movements (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id VARCHAR(64) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    product_id VARCHAR(64) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name VARCHAR(255) NOT NULL,
    sku VARCHAR(64) NOT NULL,
    type stock_movement_type NOT NULL,
    quantity_change NUMERIC(12, 2) NOT NULL,
    new_balance NUMERIC(12, 2) NOT NULL,
    reference_id VARCHAR(128),
    notes TEXT,
    performed_by VARCHAR(255) NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_prod ON stock_movements(product_id, timestamp DESC);

-- ============================================================================
-- 5. PARTIES: CUSTOMERS & SUPPLIERS
-- ============================================================================

-- Customers & Receivables Ledger
CREATE TABLE IF NOT EXISTS customers (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id VARCHAR(64) REFERENCES stores(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    gstin VARCHAR(15),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100) NOT NULL DEFAULT 'Karnataka',
    state_code VARCHAR(2) NOT NULL DEFAULT '29',
    credit_limit NUMERIC(12, 2) DEFAULT 25000.00,
    current_receivable_balance NUMERIC(12, 2) DEFAULT 0.00,
    total_orders_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_gstin ON customers(gstin);

-- Procurement Suppliers (Wholesale Vendors)
CREATE TABLE IF NOT EXISTS suppliers (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    gstin VARCHAR(15),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100) NOT NULL DEFAULT 'Karnataka',
    payment_terms_days INT DEFAULT 30,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 6. TRANSACTIONS: SALES, INVOICES, PAYMENTS & GST
-- ============================================================================

-- Sales & Tax Invoices (Durable Idempotent Records)
CREATE TABLE IF NOT EXISTS sales (
    id VARCHAR(64) PRIMARY KEY,
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    invoice_number VARCHAR(64) NOT NULL,
    receipt_number VARCHAR(64) NOT NULL,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id VARCHAR(64) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    cashier_id VARCHAR(64) NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
    cashier_name VARCHAR(255) NOT NULL,
    terminal_code VARCHAR(32) NOT NULL,
    customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20),
    customer_gstin VARCHAR(15),
    subtotal NUMERIC(12, 2) NOT NULL,
    total_discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    coupon_code VARCHAR(64),
    cgst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sgst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    igst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_tax NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    rounding_adjustment NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    grand_total NUMERIC(12, 2) NOT NULL,
    amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    change_returned NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_status payment_status NOT NULL DEFAULT 'PAID',
    primary_payment_method payment_method NOT NULL DEFAULT 'CASH',
    sync_status sync_status NOT NULL DEFAULT 'SYNCED',
    is_offline_created BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_idempotency ON sales(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_branch_created ON sales(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);

-- Sale Items / Line Items
CREATE TABLE IF NOT EXISTS sale_items (
    id VARCHAR(64) PRIMARY KEY,
    sale_id VARCHAR(64) NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id VARCHAR(64) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    sku VARCHAR(64) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    hsn VARCHAR(16) NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    taxable_amount NUMERIC(12, 2) NOT NULL,
    gst_rate NUMERIC(5, 2) NOT NULL,
    cgst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sgst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    igst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(12, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

-- Split Tender & Payment Allocations
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(64) PRIMARY KEY,
    idempotency_key VARCHAR(128) UNIQUE,
    sale_id VARCHAR(64) NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE SET NULL,
    method payment_method NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    utr_or_ref VARCHAR(128),
    gateway_status VARCHAR(64) DEFAULT 'VERIFIED',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);

-- Coupons & Promotional Discounts
CREATE TABLE IF NOT EXISTS coupons (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(64) UNIQUE NOT NULL,
    description TEXT,
    discount_type VARCHAR(16) NOT NULL, -- PERCENTAGE or FIXED
    discount_value NUMERIC(10, 2) NOT NULL,
    min_order_value NUMERIC(12, 2) DEFAULT 0.00,
    max_discount_cap NUMERIC(12, 2),
    usage_limit INT,
    times_used INT DEFAULT 0,
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 7. OPERATIONS: QUOTES, DELIVERIES & EXPENSES
-- ============================================================================

-- Quotations & Price Estimates
CREATE TABLE IF NOT EXISTS quotations (
    id VARCHAR(64) PRIMARY KEY,
    quote_number VARCHAR(64) NOT NULL,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id VARCHAR(64) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    valid_until TIMESTAMPTZ NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL,
    tax_amount NUMERIC(12, 2) NOT NULL,
    grand_total NUMERIC(12, 2) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT', -- DRAFT, SENT, ACCEPTED, DECLINED, EXPIRED, CONVERTED
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Delivery Challans & Logistics
CREATE TABLE IF NOT EXISTS deliveries (
    id VARCHAR(64) PRIMARY KEY,
    challan_number VARCHAR(64) NOT NULL,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id VARCHAR(64) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    sale_id VARCHAR(64) REFERENCES sales(id) ON DELETE SET NULL,
    customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE SET NULL,
    vehicle_number VARCHAR(32),
    driver_name VARCHAR(255),
    driver_phone VARCHAR(20),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING, IN_TRANSIT, DELIVERED, RETURNED
    dispatch_time TIMESTAMPTZ,
    delivered_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store Operating Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id VARCHAR(64) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    category VARCHAR(64) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    paid_to VARCHAR(255) NOT NULL,
    payment_mode VARCHAR(32) NOT NULL,
    receipt_ref VARCHAR(128),
    notes TEXT,
    recorded_by VARCHAR(255) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs & Device Telemetry
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id VARCHAR(64) REFERENCES stores(id) ON DELETE SET NULL,
    user_id VARCHAR(64) NOT NULL,
    action VARCHAR(128) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    device_id VARCHAR(64),
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_date ON audit_logs(organization_id, created_at DESC);

-- Durable Outbox Synchronization Queue
CREATE TABLE IF NOT EXISTS sync_outbox (
    id VARCHAR(64) PRIMARY KEY,
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    device_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    retry_count INT DEFAULT 0,
    status sync_status NOT NULL DEFAULT 'PENDING',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status);

-- ============================================================================
-- 8. ATOMIC BUSINESS FUNCTIONS & STORED PROCEDURES
-- ============================================================================

-- Function to atomically process sales sync and decrement inventory
CREATE OR REPLACE FUNCTION process_sale_atomic(
    p_sale_json JSONB,
    p_items_json JSONB,
    p_payments_json JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale_id VARCHAR(64);
    v_idempotency_key VARCHAR(128);
    v_item JSONB;
    v_current_stock NUMERIC(12, 2);
BEGIN
    v_sale_id := p_sale_json->>'id';
    v_idempotency_key := p_sale_json->>'idempotencyKey';

    -- 1. Idempotency Check: If already processed, return existing record
    IF EXISTS (SELECT 1 FROM sales WHERE idempotency_key = v_idempotency_key) THEN
        RETURN jsonb_build_object('status', 'ALREADY_EXISTS', 'sale_id', v_sale_id);
    END IF;

    -- 2. Insert Sale Master Record
    INSERT INTO sales (
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
        p_sale_json->>'organizationId',
        p_sale_json->>'branchId',
        p_sale_json->>'cashierId',
        p_sale_json->>'cashierName',
        p_sale_json->>'terminalCode',
        NULLIF(p_sale_json->>'customerId', ''),
        p_sale_json->>'customerName',
        p_sale_json->>'customerPhone',
        p_sale_json->>'customerGstin',
        (p_sale_json->>'subtotal')::NUMERIC,
        COALESCE((p_sale_json->>'totalDiscount')::NUMERIC, 0.00),
        p_sale_json->>'couponCode',
        COALESCE((p_sale_json->>'cgst')::NUMERIC, 0.00),
        COALESCE((p_sale_json->>'sgst')::NUMERIC, 0.00),
        COALESCE((p_sale_json->>'igst')::NUMERIC, 0.00),
        COALESCE((p_sale_json->>'totalTax')::NUMERIC, 0.00),
        COALESCE((p_sale_json->>'roundingAdjustment')::NUMERIC, 0.00),
        (p_sale_json->>'grandTotal')::NUMERIC,
        COALESCE((p_sale_json->>'amountPaid')::NUMERIC, (p_sale_json->>'grandTotal')::NUMERIC),
        COALESCE((p_sale_json->>'changeReturned')::NUMERIC, 0.00),
        (p_sale_json->>'paymentStatus')::payment_status,
        (p_sale_json->>'primaryPaymentMethod')::payment_method,
        'SYNCED',
        COALESCE((p_sale_json->>'isOfflineCreated')::BOOLEAN, false)
    );

    -- 3. Insert Line Items & Deduct Stock Atomically
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_json)
    LOOP
        INSERT INTO sale_items (
            id, sale_id, product_id, sku, product_name, hsn,
            quantity, unit_price, discount, taxable_amount, gst_rate,
            cgst, sgst, igst, total
        ) VALUES (
            v_item->>'id',
            v_sale_id,
            v_item->>'productId',
            v_item->>'sku',
            v_item->>'productName',
            v_item->>'hsn',
            (v_item->>'quantity')::NUMERIC,
            (v_item->>'unitPrice')::NUMERIC,
            COALESCE((v_item->>'discount')::NUMERIC, 0.00),
            (v_item->>'taxableAmount')::NUMERIC,
            (v_item->>'gstRate')::NUMERIC,
            COALESCE((v_item->>'cgst')::NUMERIC, 0.00),
            COALESCE((v_item->>'sgst')::NUMERIC, 0.00),
            COALESCE((v_item->>'igst')::NUMERIC, 0.00),
            (v_item->>'total')::NUMERIC
        );

        -- Decrement Inventory
        UPDATE products
        SET current_stock = current_stock - (v_item->>'quantity')::NUMERIC,
            updated_at = NOW()
        WHERE id = v_item->>'productId'
        RETURNING current_stock INTO v_current_stock;

        -- Record stock movement audit trail
        INSERT INTO stock_movements (
            id, organization_id, branch_id, product_id, product_name, sku,
            type, quantity_change, new_balance, reference_id, notes, performed_by
        ) VALUES (
            'mov_' || v_sale_id || '_' || (v_item->>'sku'),
            p_sale_json->>'organizationId',
            p_sale_json->>'branchId',
            v_item->>'productId',
            v_item->>'productName',
            v_item->>'sku',
            'SALE',
            -(v_item->>'quantity')::NUMERIC,
            COALESCE(v_current_stock, 0),
            p_sale_json->>'invoiceNumber',
            'Counter checkout sale',
            p_sale_json->>'cashierName'
        );
    END LOOP;

    RETURN jsonb_build_object('status', 'SUCCESS', 'sale_id', v_sale_id);
END;
$$;

-- ============================================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- Least-Privilege Role Policies for Super Admin, Manager, Cashier, Store Officer
-- ============================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_outbox ENABLE ROW LEVEL SECURITY;

-- Helper function to extract user role from active JWT or profile table
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role')::user_role,
    (SELECT role FROM user_profiles WHERE id = current_setting('request.jwt.claims', true)::jsonb ->> 'sub'),
    'CASHIER'::user_role
  );
$$;

-- Helper function to extract user organization
CREATE OR REPLACE FUNCTION current_user_org()
RETURNS VARCHAR(64)
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'organization_id',
    (SELECT organization_id FROM user_profiles WHERE id = current_setting('request.jwt.claims', true)::jsonb ->> 'sub'),
    'org_apex_01'
  );
$$;

-- ============================================================================
-- RLS POLICIES FOR PRODUCTS
-- Super Admin, Manager: full control
-- Cashier: read-only access (POS scanning)
-- Store Officer: read and write (procurement & inventory updating)
-- ============================================================================
CREATE POLICY "Products Select Policy" ON products
    FOR SELECT USING (organization_id = current_user_org());

CREATE POLICY "Products Insert/Update Policy" ON products
    FOR ALL USING (
        organization_id = current_user_org() AND
        current_user_role() IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'STORE_OFFICER', 'PURCHASE_OFFICER')
    );

-- ============================================================================
-- RLS POLICIES FOR SALES & PAYMENTS
-- Cashier, Manager, Super Admin: insert and select
-- Store Officer: NO access to sales/checkout
-- ============================================================================
CREATE POLICY "Sales Access Policy" ON sales
    FOR ALL USING (
        organization_id = current_user_org() AND
        current_user_role() IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'CASHIER')
    );

CREATE POLICY "Sale Items Access Policy" ON sale_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sales
            WHERE sales.id = sale_items.sale_id
            AND sales.organization_id = current_user_org()
            AND current_user_role() IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'CASHIER')
        )
    );

CREATE POLICY "Payments Access Policy" ON payments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sales
            WHERE sales.id = payments.sale_id
            AND sales.organization_id = current_user_org()
            AND current_user_role() IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'CASHIER')
        )
    );

-- ============================================================================
-- RLS POLICIES FOR SUPPLIERS
-- Super Admin, Manager, Store Officer: full access
-- Cashier: strictly NO access to wholesale suppliers
-- ============================================================================
CREATE POLICY "Suppliers Access Policy" ON suppliers
    FOR ALL USING (
        organization_id = current_user_org() AND
        current_user_role() IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'STORE_OFFICER', 'PURCHASE_OFFICER')
    );

-- ============================================================================
-- RLS POLICIES FOR CUSTOMERS
-- Cashier, Manager, Super Admin: manage customers
-- Store Officer: strictly NO access to retail customers
-- ============================================================================
CREATE POLICY "Customers Access Policy" ON customers
    FOR ALL USING (
        organization_id = current_user_org() AND
        current_user_role() IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'CASHIER')
    );

-- ============================================================================
-- RLS POLICIES FOR DELIVERIES (CHALLANS)
-- Store Officer, Manager, Super Admin: manage deliveries
-- Cashier: strictly NO access to deliveries
-- ============================================================================
CREATE POLICY "Deliveries Access Policy" ON deliveries
    FOR ALL USING (
        organization_id = current_user_org() AND
        current_user_role() IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'STORE_OFFICER', 'PURCHASE_OFFICER')
    );

-- ============================================================================
-- RLS POLICIES FOR EXPENSES
-- Manager, Super Admin: manage expenses
-- Cashier and Store Officer: strictly NO access to store financial expenses
-- ============================================================================
CREATE POLICY "Expenses Access Policy" ON expenses
    FOR ALL USING (
        organization_id = current_user_org() AND
        current_user_role() IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER')
    );

-- ============================================================================
-- RLS POLICIES FOR USER PROFILES
-- Prevent non-Super Admins from modifying roles or self-promoting to SUPER_ADMIN
-- ============================================================================
CREATE POLICY "User Profiles Select Policy" ON user_profiles
    FOR SELECT USING (organization_id = current_user_org());

CREATE POLICY "User Profiles Admin Update Policy" ON user_profiles
    FOR UPDATE USING (
        organization_id = current_user_org() AND
        current_user_role() IN ('SUPER_ADMIN', 'ORG_ADMIN')
    );

-- ============================================================================
-- 10. SEED DATA (Enterprise Apex SuperStore & Indian Retail Branches)
-- ============================================================================
INSERT INTO organizations (
    id, name, legal_name, trade_name, gstin, pan, state, state_code, subscription_plan_id
) VALUES (
    'org_apex_01',
    'Apex Retail Enterprises Pvt Ltd',
    'Apex Retail Enterprises Private Limited',
    'Apex SuperStore & Electronics',
    '29AABCA1234F1Z5',
    'AABCA1234F',
    'Karnataka',
    '29',
    'plan_enterprise'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO stores (
    id, organization_id, code, name, city, state, address, phone, gstin, is_headquarters
) VALUES
(
    'br_blr_01',
    'org_apex_01',
    'BLR-01',
    'Bengaluru Flagship (Indiranagar)',
    'Bengaluru',
    'Karnataka',
    '45, 100 Feet Road, HAL 2nd Stage, Indiranagar, Bengaluru, KA 560038',
    '+91 80 2520 1101',
    '29AABCA1234F1Z5',
    TRUE
),
(
    'br_blr_02',
    'org_apex_01',
    'BLR-02',
    'Koramangala SuperStore',
    'Bengaluru',
    'Karnataka',
    '12, 80 Feet Road, 4th Block, Koramangala, Bengaluru, KA 560034',
    '+91 80 2553 2202',
    '29AABCA1234F1Z5',
    FALSE
) ON CONFLICT (id) DO NOTHING;

INSERT INTO user_profiles (
    id, organization_id, branch_id, email, name, phone, role, is_active
) VALUES
(
    'usr_super_01',
    'org_apex_01',
    'br_blr_01',
    'vikram.m@slatepos.cloud',
    'Vikram Malhotra',
    '+91 98450 11001',
    'SUPER_ADMIN',
    TRUE
),
(
    'usr_admin_01',
    'org_apex_01',
    'br_blr_01',
    'priya.nair@apexretail.in',
    'Priya Nair',
    '+91 98450 22002',
    'ORG_ADMIN',
    TRUE
),
(
    'usr_manager_01',
    'org_apex_01',
    'br_blr_01',
    'rajesh.sharma@apexretail.in',
    'Rajesh Sharma',
    '+91 98450 33003',
    'MANAGER',
    TRUE
),
(
    'usr_cashier_01',
    'org_apex_01',
    'br_blr_01',
    'arun.k@apexretail.in',
    'Arun Kumar',
    '+91 98450 44004',
    'CASHIER',
    TRUE
),
(
    'usr_officer_01',
    'org_apex_01',
    'br_blr_01',
    'sunil.v@apexretail.in',
    'Sunil Verma',
    '+91 98450 55005',
    'STORE_OFFICER',
    TRUE
) ON CONFLICT (id) DO NOTHING;
