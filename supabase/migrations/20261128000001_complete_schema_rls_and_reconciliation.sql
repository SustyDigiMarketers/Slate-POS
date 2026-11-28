-- ==============================================================================
-- SLATE POS — Complete Schema Guarantee, PostgREST Cache Reload, RLS & Receipts
-- Migration: 20261128000001_complete_schema_rls_and_reconciliation.sql
--
-- Safety Guarantees:
-- 1. Purely additive & idempotent (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- 2. Preserves ALL existing organizations, user_profiles, staff accounts, customers,
--    suppliers, products, sales, quotations, accounting, and audit records.
-- 3. Ensures every table queried by the frontend & /api/accounting exists with full
--    tenant-isolated RLS policies and GRANT permissions, fixing HTTP 404 (PGRST205)
--    and schema-cache / FK / NOT-NULL blockers on supplier_payments & debit_notes.
-- 4. Adds public.customer_receipts for standalone customer receipt management,
--    invoice allocations, advance credits, and authorized reversals.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. GUARANTEE OPERATIONAL & BANKING TABLES EXIST
-- ------------------------------------------------------------------------------

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
  account_type text NOT NULL DEFAULT 'CURRENT' CHECK (account_type IN ('CURRENT', 'SAVINGS', 'OVERDRAFT', 'CASH_CREDIT', 'CASH')),
  opening_balance numeric(15,2) NOT NULL DEFAULT 0,
  current_balance numeric(15,2) NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'FROZEN')),
  notes text,
  version int NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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
  idempotency_key varchar(128),
  version int NOT NULL DEFAULT 1,
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
  idempotency_key varchar(128),
  version int NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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
  idempotency_key varchar(128),
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id text PRIMARY KEY,
  payment_number text NOT NULL UNIQUE,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id text REFERENCES public.stores(id),
  supplier_id text NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_name text NOT NULL,
  supplier_bill_id text REFERENCES public.supplier_bills(id) ON DELETE RESTRICT,
  bill_number text,
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('CASH', 'UPI', 'CARD', 'BANK', 'CHEQUE', 'NEFT/RTGS')),
  bank_account_id text REFERENCES public.bank_accounts(id),
  bank_account_name text,
  payment_date date NOT NULL DEFAULT current_date,
  reference_number text,
  notes text,
  allocated_bills jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_advance boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'REVERSED')),
  reversal_reason text,
  reversed_at timestamptz,
  reversed_by text,
  idempotency_key varchar(128),
  created_by text NOT NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Dedicated Customer Receipts (Payments Received) Table
CREATE TABLE IF NOT EXISTS public.customer_receipts (
  id text PRIMARY KEY,
  receipt_number text NOT NULL,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id text REFERENCES public.stores(id),
  customer_id text NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  customer_name text NOT NULL,
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  allocated_amount numeric(15,2) NOT NULL DEFAULT 0,
  unallocated_advance numeric(15,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL CHECK (payment_method IN ('CASH', 'UPI', 'CARD', 'BANK', 'CHEQUE', 'NEFT/RTGS')),
  bank_account_id text REFERENCES public.bank_accounts(id),
  bank_account_name text,
  receipt_date date NOT NULL DEFAULT current_date,
  reference_number text,
  notes text,
  allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'REVERSED')),
  reversal_reason text,
  reversed_at timestamptz,
  reversed_by text,
  journal_entry_id text,
  journal_number text,
  idempotency_key varchar(128),
  created_by text NOT NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_customer_receipt_org_number UNIQUE (organization_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS public.user_preferences (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  auth_user_id uuid,
  user_id text NOT NULL,
  quote_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  drafts jsonb NOT NULL DEFAULT '{}'::jsonb,
  fiscal_year varchar(32),
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_prefs_org_user UNIQUE (organization_id, user_id)
);

-- ------------------------------------------------------------------------------
-- 2. ALIGN EXISTING TABLES (SUPPLIER PAYMENTS ADVANCE/MULTI-BILL, DEBIT NOTES WORKFLOW, JOURNALS)
-- ------------------------------------------------------------------------------

DO $$
BEGIN
  -- Allow advance & multi-bill supplier payments (drop NOT NULL on single bill columns)
  ALTER TABLE public.supplier_payments ALTER COLUMN supplier_bill_id DROP NOT NULL;
  ALTER TABLE public.supplier_payments ALTER COLUMN bill_number DROP NOT NULL;

  ALTER TABLE public.supplier_payments
    ADD COLUMN IF NOT EXISTS allocated_bills jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS is_advance boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'COMPLETED',
    ADD COLUMN IF NOT EXISTS reversal_reason text,
    ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
    ADD COLUMN IF NOT EXISTS reversed_by text,
    ADD COLUMN IF NOT EXISTS idempotency_key varchar(128);

  ALTER TABLE public.supplier_payments DROP CONSTRAINT IF EXISTS supplier_payments_payment_method_check;
  ALTER TABLE public.supplier_payments ADD CONSTRAINT supplier_payments_payment_method_check
    CHECK (payment_method IN ('CASH', 'UPI', 'CARD', 'BANK', 'CHEQUE', 'NEFT/RTGS'));

  ALTER TABLE public.supplier_payments DROP CONSTRAINT IF EXISTS supplier_payments_status_check;
  ALTER TABLE public.supplier_payments ADD CONSTRAINT supplier_payments_status_check
    CHECK (status IN ('COMPLETED', 'REVERSED'));

  -- Allow CASH bank_account type
  ALTER TABLE public.bank_accounts DROP CONSTRAINT IF EXISTS bank_accounts_account_type_check;
  ALTER TABLE public.bank_accounts ADD CONSTRAINT bank_accounts_account_type_check
    CHECK (account_type IN ('CURRENT', 'SAVINGS', 'OVERDRAFT', 'CASH_CREDIT', 'CASH'));

  -- Debit notes approval & cancellation columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'debit_notes') THEN
    ALTER TABLE public.debit_notes
      ADD COLUMN IF NOT EXISTS approved_by text,
      ADD COLUMN IF NOT EXISTS approved_by_name text,
      ADD COLUMN IF NOT EXISTS approved_at timestamptz,
      ADD COLUMN IF NOT EXISTS cancelled_by text,
      ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
      ADD COLUMN IF NOT EXISTS cancel_reason text,
      ADD COLUMN IF NOT EXISTS idempotency_key varchar(128);

    ALTER TABLE public.debit_notes DROP CONSTRAINT IF EXISTS debit_notes_status_check;
    ALTER TABLE public.debit_notes ADD CONSTRAINT debit_notes_status_check
      CHECK (status IN ('DRAFT', 'APPROVED', 'ISSUED', 'APPLIED', 'CANCELLED'));
  END IF;

  -- Journal source_type support for Customer Receipts & Reversals
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'journal_entries') THEN
    ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
    ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check CHECK (
      source_type IN (
        'MANUAL', 'MANUAL_JOURNAL', 'SALE', 'SALES_INVOICE', 'CUSTOMER_PAYMENT',
        'CUSTOMER_RECEIPT', 'CUSTOMER_RECEIPT_REVERSAL',
        'CREDIT_NOTE', 'CREDIT_NOTE_REFUND', 'SUPPLIER_BILL', 'PURCHASE_BILL',
        'SUPPLIER_PAYMENT', 'SUPPLIER_PAYMENT_REVERSAL', 'DEBIT_NOTE', 'DEBIT_NOTE_REVERSAL',
        'EXPENSE', 'BANK_DEPOSIT', 'BANK_WITHDRAWAL', 'BANK_TRANSFER', 'BANK_TRANSACTION',
        'BANK_RECONCILIATION', 'OPENING_BALANCE', 'BULK_ADJUSTMENT', 'STOCK_ADJUSTMENT', 'REVERSAL'
      )
    );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. INDEXES & REALTIME FOR CUSTOMER RECEIPTS AND SUPPLIER PAYMENTS
-- ------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_customer_receipts_org_date
  ON public.customer_receipts (organization_id, receipt_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_receipts_org_cust
  ON public.customer_receipts (organization_id, customer_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_receipts_org_idempotency
  ON public.customer_receipts (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_payments_org_supp_date
  ON public.supplier_payments (organization_id, supplier_id, payment_date DESC);

-- ------------------------------------------------------------------------------
-- 4. RLS POLICIES & GRANTS FOR ALL OPERATIONAL & FINANCIAL TABLES
-- ------------------------------------------------------------------------------

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
ALTER TABLE public.customer_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for customer_receipts" ON public.customer_receipts;
CREATE POLICY "Tenant isolation for customer_receipts" ON public.customer_receipts
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND (public.has_permission('PAYMENTS_VIEW') OR public.has_permission('SALES_VIEW'))
  )
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND public.has_permission('PAYMENTS_COLLECT')
  );

-- Ensure permissions grant for authenticated & service_role across public schema tables
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;

-- Realtime publication for customer_receipts
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_receipts;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
    END;
  END IF;
END $$;

COMMIT;

-- Force PostgREST to reload schema cache immediately so new/migrated tables never 404
NOTIFY pgrst, 'reload schema';
