-- SLATE POS Migration: Financial Modules (Banking, Credit Notes, Purchases & Bills) & Staff Tenant Association
-- Migration: 20261120000000_financial_modules_and_tenant_staff.sql

BEGIN;

-- 1. BANK ACCOUNTS
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id text REFERENCES public.stores(id),
  account_name text NOT NULL,
  account_holder_name text NOT NULL,
  account_number text NOT NULL,
  bank_name text NOT NULL,
  ifsc_code text NOT NULL,
  branch_name text,
  account_type text NOT NULL DEFAULT 'CURRENT' CHECK (account_type IN ('CURRENT', 'SAVINGS', 'OVERDRAFT', 'CASH_CREDIT')),
  opening_balance numeric(15,2) NOT NULL DEFAULT 0,
  current_balance numeric(15,2) NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'FROZEN')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. BANK TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id text PRIMARY KEY,
  transaction_number text NOT NULL UNIQUE,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id text REFERENCES public.stores(id),
  bank_account_id text NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  bank_account_name text NOT NULL,
  type text NOT NULL CHECK (type IN ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER')),
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  balance_before numeric(15,2) NOT NULL,
  balance_after numeric(15,2) NOT NULL,
  transaction_date date NOT NULL DEFAULT current_date,
  reference_number text,
  description text,
  category text NOT NULL DEFAULT 'General',
  payee_payer text,
  status text NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'PENDING', 'REVERSED', 'FAILED')),
  reversal_reason text,
  reversed_at timestamptz,
  reversal_transaction_id text,
  transfer_to_account_id text REFERENCES public.bank_accounts(id),
  transfer_from_account_id text REFERENCES public.bank_accounts(id),
  initiated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. CREDIT NOTES
CREATE TABLE IF NOT EXISTS public.credit_notes (
  id text PRIMARY KEY,
  credit_note_number text NOT NULL UNIQUE,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id text REFERENCES public.stores(id),
  customer_id text NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  customer_name text NOT NULL,
  customer_gstin text,
  invoice_id text REFERENCES public.sales(id),
  invoice_number text,
  subtotal numeric(15,2) NOT NULL DEFAULT 0,
  taxable_total numeric(15,2) NOT NULL DEFAULT 0,
  cgst_total numeric(15,2) NOT NULL DEFAULT 0,
  sgst_total numeric(15,2) NOT NULL DEFAULT 0,
  igst_total numeric(15,2) NOT NULL DEFAULT 0,
  total_tax numeric(15,2) NOT NULL DEFAULT 0,
  total_credit_amount numeric(15,2) NOT NULL CHECK (total_credit_amount >= 0),
  allocated_amount numeric(15,2) NOT NULL DEFAULT 0,
  remaining_amount numeric(15,2) NOT NULL DEFAULT 0,
  reason text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'ISSUED', 'CANCELLED', 'APPLIED', 'REFUNDED')),
  restock_inventory boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_by_name text,
  approved_by text,
  approved_by_name text,
  approved_at timestamptz,
  issued_by text,
  issued_by_name text,
  issue_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. CREDIT NOTE ITEMS
CREATE TABLE IF NOT EXISTS public.credit_note_items (
  id text PRIMARY KEY,
  credit_note_id text NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(15,2) NOT NULL,
  taxable_amount numeric(15,2) NOT NULL,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  cgst_rate numeric(5,2) DEFAULT 0,
  cgst_amount numeric(15,2) DEFAULT 0,
  sgst_rate numeric(5,2) DEFAULT 0,
  sgst_amount numeric(15,2) DEFAULT 0,
  igst_rate numeric(5,2) DEFAULT 0,
  igst_amount numeric(15,2) DEFAULT 0,
  total numeric(15,2) NOT NULL
);

-- 5. PURCHASE ORDERS
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id text PRIMARY KEY,
  po_number text NOT NULL UNIQUE,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id text REFERENCES public.stores(id),
  supplier_id text NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_name text NOT NULL,
  supplier_gstin text,
  order_date date NOT NULL DEFAULT current_date,
  expected_delivery_date date,
  subtotal numeric(15,2) NOT NULL DEFAULT 0,
  tax_total numeric(15,2) NOT NULL DEFAULT 0,
  discount_total numeric(15,2) NOT NULL DEFAULT 0,
  additional_charges numeric(15,2) NOT NULL DEFAULT 0,
  grand_total numeric(15,2) NOT NULL CHECK (grand_total >= 0),
  received_total numeric(12,3) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ORDERED' CHECK (status IN ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
  notes text,
  created_by text NOT NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. PURCHASE ORDER ITEMS
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id text PRIMARY KEY,
  purchase_order_id text NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  ordered_quantity numeric(12,3) NOT NULL CHECK (ordered_quantity > 0),
  received_quantity numeric(12,3) NOT NULL DEFAULT 0,
  unit_price numeric(15,2) NOT NULL,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  tax_amount numeric(15,2) NOT NULL DEFAULT 0,
  total numeric(15,2) NOT NULL
);

-- 7. GOODS RECEIPTS (GRN)
CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id text PRIMARY KEY,
  grn_number text NOT NULL UNIQUE,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id text REFERENCES public.stores(id),
  purchase_order_id text REFERENCES public.purchase_orders(id),
  po_number text,
  supplier_id text NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_name text NOT NULL,
  received_date date NOT NULL DEFAULT current_date,
  received_by text NOT NULL,
  received_by_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. GOODS RECEIPT ITEMS
CREATE TABLE IF NOT EXISTS public.goods_receipt_items (
  id text PRIMARY KEY,
  goods_receipt_id text NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  quantity_received numeric(12,3) NOT NULL CHECK (quantity_received > 0),
  unit_price numeric(15,2) NOT NULL DEFAULT 0,
  batch_number text,
  expiry_date text
);

-- 9. SUPPLIER BILLS (ACCOUNTS PAYABLE)
CREATE TABLE IF NOT EXISTS public.supplier_bills (
  id text PRIMARY KEY,
  bill_number text NOT NULL UNIQUE,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id text REFERENCES public.stores(id),
  purchase_order_id text REFERENCES public.purchase_orders(id),
  po_number text,
  goods_receipt_id text REFERENCES public.goods_receipts(id),
  grn_number text,
  supplier_id text NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_name text NOT NULL,
  supplier_gstin text,
  bill_date date NOT NULL DEFAULT current_date,
  due_date date,
  subtotal numeric(15,2) NOT NULL DEFAULT 0,
  taxable_total numeric(15,2) NOT NULL DEFAULT 0,
  gst_total numeric(15,2) NOT NULL DEFAULT 0,
  discount_total numeric(15,2) NOT NULL DEFAULT 0,
  additional_charges numeric(15,2) NOT NULL DEFAULT 0,
  total_amount numeric(15,2) NOT NULL CHECK (total_amount >= 0),
  paid_amount numeric(15,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  outstanding_amount numeric(15,2) NOT NULL DEFAULT 0 CHECK (outstanding_amount >= 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 10. SUPPLIER PAYMENTS
CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id text PRIMARY KEY,
  payment_number text NOT NULL UNIQUE,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id text REFERENCES public.stores(id),
  supplier_id text NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_name text NOT NULL,
  supplier_bill_id text NOT NULL REFERENCES public.supplier_bills(id) ON DELETE RESTRICT,
  bill_number text NOT NULL,
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('CASH', 'UPI', 'CARD', 'BANK', 'CHEQUE')),
  bank_account_id text REFERENCES public.bank_accounts(id),
  bank_account_name text,
  payment_date date NOT NULL DEFAULT current_date,
  reference_number text,
  notes text,
  created_by text NOT NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Row-Level Security
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_note_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

-- Helper to retrieve current user organization
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.user_profiles WHERE auth_user_id = auth.uid() AND is_active = TRUE LIMIT 1;
$$;

-- RLS Policies (idempotent)
DROP POLICY IF EXISTS "Tenant isolation for bank_accounts" ON public.bank_accounts;
CREATE POLICY "Tenant isolation for bank_accounts" ON public.bank_accounts
  FOR ALL USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Tenant isolation for bank_transactions" ON public.bank_transactions;
CREATE POLICY "Tenant isolation for bank_transactions" ON public.bank_transactions
  FOR ALL USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Tenant isolation for credit_notes" ON public.credit_notes;
CREATE POLICY "Tenant isolation for credit_notes" ON public.credit_notes
  FOR ALL USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Tenant isolation for purchase_orders" ON public.purchase_orders;
CREATE POLICY "Tenant isolation for purchase_orders" ON public.purchase_orders
  FOR ALL USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Tenant isolation for goods_receipts" ON public.goods_receipts;
CREATE POLICY "Tenant isolation for goods_receipts" ON public.goods_receipts
  FOR ALL USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Tenant isolation for supplier_bills" ON public.supplier_bills;
CREATE POLICY "Tenant isolation for supplier_bills" ON public.supplier_bills
  FOR ALL USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Tenant isolation for supplier_payments" ON public.supplier_payments;
CREATE POLICY "Tenant isolation for supplier_payments" ON public.supplier_payments
  FOR ALL USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

-- Additive seed of test staff accounts for Slate CRM and Slate Billing (preserves existing production profiles)
INSERT INTO public.user_profiles (id, organization_id, branch_id, role, name, email, phone, is_active, created_at, updated_at)
VALUES
  ('usr_scrm_mgr_01', 'org_slate_crm_01', 'br_slate_crm_main', 'MANAGER', 'Kavita Menon', 'manager@slatecrm.com', '+91 98450 77001', TRUE, now(), now()),
  ('usr_scrm_store_01', 'org_slate_crm_01', 'br_slate_crm_main', 'STORE_OFFICER', 'Anand Rao', 'store@slatecrm.com', '+91 98450 77002', TRUE, now(), now()),
  ('usr_scrm_cash_01', 'org_slate_crm_01', 'br_slate_crm_main', 'CASHIER', 'Deepak Joshi', 'cashier@slatecrm.com', '+91 98450 77003', TRUE, now(), now()),
  ('usr_sbill_mgr_01', 'org_slate_billing_01', 'br_slate_billing_main', 'MANAGER', 'Rohit Sen', 'manager@slatebilling.com', '+91 98450 88001', TRUE, now(), now()),
  ('usr_sbill_store_01', 'org_slate_billing_01', 'br_slate_billing_main', 'STORE_OFFICER', 'Meera Nair', 'store@slatebilling.com', '+91 98450 88002', TRUE, now(), now()),
  ('usr_sbill_cash_01', 'org_slate_billing_01', 'br_slate_billing_main', 'CASHIER', 'Suresh Patel', 'cashier@slatebilling.com', '+91 98450 88003', TRUE, now(), now())
ON CONFLICT DO NOTHING;

COMMIT;
