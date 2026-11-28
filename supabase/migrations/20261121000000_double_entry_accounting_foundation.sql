-- ==============================================================================
-- SLATE POS — Additive Migration: Double-Entry Accounting Foundation & Sync
-- Migration: 20261121000000_double_entry_accounting_foundation.sql
--
-- Safety Guarantees:
-- 1. Purely additive & idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- 2. Preserves ALL existing organizations (org_apex_01, org_slate_billing_01,
--    org_slate_crm_01), user_profiles, staff accounts, customers, suppliers,
--    products, sales, banking, credit notes, and purchase records untouched.
-- 3. Strict numeric(15,2) monetary precision, immutable general_ledger &
--    financial_audit_logs, tenant-isolated RLS on every table, and atomic
--    PostgreSQL double-entry posting/reversal RPCs.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. COMPATIBILITY ENHANCEMENT: Allow 'CASH' account_type in public.bank_accounts
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bank_accounts'
  ) THEN
    ALTER TABLE public.bank_accounts
      DROP CONSTRAINT IF EXISTS bank_accounts_account_type_check;
    ALTER TABLE public.bank_accounts
      ADD CONSTRAINT bank_accounts_account_type_check
      CHECK (account_type IN ('CURRENT', 'SAVINGS', 'OVERDRAFT', 'CASH_CREDIT', 'CASH'));
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 1. CHART OF ACCOUNTS (Full 5-Class Double-Entry Ledger Hierarchy)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id text,
  code text NOT NULL,
  name text NOT NULL,
  account_class text NOT NULL CHECK (account_class IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')),
  account_group text NOT NULL,
  parent_account_id text REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  parent_code text,
  normal_balance text NOT NULL CHECK (normal_balance IN ('DEBIT', 'CREDIT')),
  opening_balance numeric(15,2) NOT NULL DEFAULT 0,
  current_balance numeric(15,2) NOT NULL DEFAULT 0,
  tax_applicable boolean NOT NULL DEFAULT false,
  gst_tag text CHECK (gst_tag IS NULL OR gst_tag IN ('INPUT_CGST', 'INPUT_SGST', 'INPUT_IGST', 'OUTPUT_CGST', 'OUTPUT_SGST', 'OUTPUT_IGST', 'NONE')),
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_coa_org_code UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_coa_org_class
  ON public.chart_of_accounts (organization_id, account_class, code);

-- ------------------------------------------------------------------------------
-- 2. ACCOUNTING PERIODS & FISCAL YEAR LOCK CONTROLS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  fiscal_year text NOT NULL,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_locked boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'LOCKED', 'CLOSED')),
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_accounting_period_dates CHECK (end_date >= start_date),
  CONSTRAINT uq_accounting_period_org_name UNIQUE (organization_id, fiscal_year, name)
);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_org_range
  ON public.accounting_periods (organization_id, start_date, end_date);

-- ------------------------------------------------------------------------------
-- 3. JOURNAL ENTRIES (Header) & JOURNAL ENTRY LINES (Double-Entry Legs)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id text REFERENCES public.stores(id),
  journal_number text NOT NULL,
  entry_date date NOT NULL DEFAULT current_date,
  reference_number text,
  narration text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'POSTED', 'REVERSED')),
  source_type text NOT NULL DEFAULT 'MANUAL' CHECK (
    source_type IN (
      'MANUAL', 'MANUAL_JOURNAL', 'SALE', 'SALES_INVOICE', 'CUSTOMER_PAYMENT',
      'CREDIT_NOTE', 'CREDIT_NOTE_REFUND', 'SUPPLIER_BILL', 'PURCHASE_BILL',
      'SUPPLIER_PAYMENT', 'DEBIT_NOTE', 'EXPENSE', 'BANK_DEPOSIT',
      'BANK_WITHDRAWAL', 'BANK_TRANSFER', 'BANK_TRANSACTION', 'BANK_RECONCILIATION',
      'OPENING_BALANCE', 'BULK_ADJUSTMENT', 'STOCK_ADJUSTMENT', 'REVERSAL'
    )
  ),
  source_id text,
  idempotency_key text,
  total_debit numeric(15,2) NOT NULL DEFAULT 0 CHECK (total_debit >= 0),
  total_credit numeric(15,2) NOT NULL DEFAULT 0 CHECK (total_credit >= 0),
  reversal_of_journal_id text REFERENCES public.journal_entries(id),
  reversed_by_journal_id text REFERENCES public.journal_entries(id),
  reversal_reason text,
  created_by text NOT NULL,
  created_by_name text,
  approved_by text,
  approved_by_name text,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_journal_org_number UNIQUE (organization_id, journal_number),
  CONSTRAINT chk_posted_journal_balanced CHECK (status <> 'POSTED' OR (total_debit = total_credit AND total_debit > 0))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_org_idempotency
  ON public.journal_entries (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_org_date
  ON public.journal_entries (organization_id, entry_date DESC, status);

CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
  id text PRIMARY KEY,
  journal_entry_id text NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  account_code text NOT NULL,
  account_name text NOT NULL,
  description text,
  debit numeric(15,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(15,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  party_type text CHECK (party_type IS NULL OR party_type IN ('CUSTOMER', 'SUPPLIER')),
  party_id text,
  party_name text,
  tax_code text,
  line_order integer NOT NULL DEFAULT 1,
  CONSTRAINT chk_journal_line_single_side CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry
  ON public.journal_entry_lines (journal_entry_id, line_order);

CREATE INDEX IF NOT EXISTS idx_journal_lines_account
  ON public.journal_entry_lines (organization_id, account_id);

-- ------------------------------------------------------------------------------
-- 4. GENERAL LEDGER (Immutable Posted Ledger Lines)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.general_ledger (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id text REFERENCES public.stores(id),
  journal_entry_id text NOT NULL REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  journal_number text NOT NULL,
  entry_date date NOT NULL,
  account_id text NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  account_code text NOT NULL,
  account_name text NOT NULL,
  account_class text NOT NULL CHECK (account_class IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')),
  debit numeric(15,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(15,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  running_balance numeric(15,2) NOT NULL DEFAULT 0,
  source_type text NOT NULL,
  source_id text,
  reference_number text,
  narration text,
  party_type text CHECK (party_type IS NULL OR party_type IN ('CUSTOMER', 'SUPPLIER')),
  party_id text,
  party_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_gl_single_side CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_gl_org_account_date
  ON public.general_ledger (organization_id, account_id, entry_date, created_at);

CREATE INDEX IF NOT EXISTS idx_gl_org_date
  ON public.general_ledger (organization_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_gl_org_class
  ON public.general_ledger (organization_id, account_class, entry_date);

-- ------------------------------------------------------------------------------
-- 5. ACCOUNTING POSTING RECORDS (Idempotency Ledger for Operational Events)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_posting_records (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id text NOT NULL,
  journal_entry_id text NOT NULL REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_posting_org_source UNIQUE (organization_id, source_type, source_id),
  CONSTRAINT uq_posting_org_idempotency UNIQUE (organization_id, idempotency_key)
);

-- ------------------------------------------------------------------------------
-- 6. BUDGETS & BUDGET LINES (Fiscal Planning & Live GL Variance)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budgets (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id text,
  name text NOT NULL,
  fiscal_year text NOT NULL,
  period_type text NOT NULL DEFAULT 'MONTHLY' CHECK (period_type IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'REVISED', 'ARCHIVED')),
  version integer NOT NULL DEFAULT 1,
  total_planned_revenue numeric(15,2) NOT NULL DEFAULT 0,
  total_planned_expense numeric(15,2) NOT NULL DEFAULT 0,
  total_planned_capex numeric(15,2) NOT NULL DEFAULT 0,
  revisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_by text NOT NULL,
  created_by_name text,
  approved_by text,
  approved_by_name text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budgets_org_fy
  ON public.budgets (organization_id, fiscal_year, status);

CREATE TABLE IF NOT EXISTS public.budget_lines (
  id text PRIMARY KEY,
  budget_id text NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  account_code text NOT NULL,
  account_name text NOT NULL,
  account_class text NOT NULL CHECK (account_class IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')),
  category text NOT NULL DEFAULT 'EXPENSE' CHECK (category IN ('REVENUE', 'EXPENSE', 'CAPEX')),
  period_label text NOT NULL DEFAULT 'ANNUAL',
  planned_amount numeric(15,2) NOT NULL DEFAULT 0 CHECK (planned_amount >= 0),
  notes text
);

CREATE INDEX IF NOT EXISTS idx_budget_lines_budget
  ON public.budget_lines (budget_id, account_id);

-- ------------------------------------------------------------------------------
-- 7. BULK IMPORT BATCHES & ROW-LEVEL ERROR AUDIT
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bulk_import_batches (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id text REFERENCES public.stores(id),
  target text NOT NULL CHECK (
    target IN (
      'PRODUCTS_PRICING_GST', 'PRODUCTS', 'PRODUCT_PRICING', 'TAX_CLASSIFICATIONS',
      'ACCOUNT_CLASSIFICATIONS', 'CUSTOMERS', 'SUPPLIERS', 'CHART_OF_ACCOUNTS',
      'OPENING_BALANCES', 'EXPENSES', 'SUPPLIER_BILLS'
    )
  ),
  file_name text NOT NULL,
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  updated_rows integer NOT NULL DEFAULT 0,
  skipped_duplicates integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'VALIDATED' CHECK (
    status IN ('PREVIEW', 'APPROVED', 'COMMITTED', 'VALIDATED', 'PENDING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED')
  ),
  requires_approval boolean NOT NULL DEFAULT false,
  journal_entry_id text,
  created_by text NOT NULL,
  created_by_name text,
  approved_by text,
  approved_by_name text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bulk_batches_org_created
  ON public.bulk_import_batches (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.bulk_import_errors (
  id text PRIMARY KEY,
  batch_id text NOT NULL REFERENCES public.bulk_import_batches(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  field text NOT NULL,
  message text NOT NULL,
  raw_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 8. DEBIT NOTES & PURCHASE RETURNS (Supplier Return Vouchers)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.debit_notes (
  id text PRIMARY KEY,
  debit_note_number text NOT NULL,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id text REFERENCES public.stores(id),
  supplier_id text NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_name text NOT NULL,
  supplier_gstin text,
  supplier_bill_id text REFERENCES public.supplier_bills(id),
  bill_number text,
  subtotal numeric(15,2) NOT NULL DEFAULT 0,
  taxable_total numeric(15,2) NOT NULL DEFAULT 0,
  cgst_total numeric(15,2) NOT NULL DEFAULT 0,
  sgst_total numeric(15,2) NOT NULL DEFAULT 0,
  igst_total numeric(15,2) NOT NULL DEFAULT 0,
  gst_total numeric(15,2) NOT NULL DEFAULT 0,
  total_debit_amount numeric(15,2) NOT NULL CHECK (total_debit_amount >= 0),
  reason text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ISSUED', 'APPLIED', 'CANCELLED')),
  reduce_inventory boolean NOT NULL DEFAULT true,
  issue_date date NOT NULL DEFAULT current_date,
  journal_entry_id text,
  journal_number text,
  created_by text NOT NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_debit_note_org_number UNIQUE (organization_id, debit_note_number)
);

CREATE INDEX IF NOT EXISTS idx_debit_notes_org_date
  ON public.debit_notes (organization_id, issue_date DESC);

CREATE TABLE IF NOT EXISTS public.debit_note_items (
  id text PRIMARY KEY,
  debit_note_id text NOT NULL REFERENCES public.debit_notes(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  sku text,
  hsn text,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(15,2) NOT NULL,
  taxable_amount numeric(15,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  cgst_amount numeric(15,2) NOT NULL DEFAULT 0,
  sgst_amount numeric(15,2) NOT NULL DEFAULT 0,
  igst_amount numeric(15,2) NOT NULL DEFAULT 0,
  tax_amount numeric(15,2) NOT NULL DEFAULT 0,
  total numeric(15,2) NOT NULL
);

-- Idempotent additive column/constraint alignment when re-running migration on an existing instance
DO $$
BEGIN
  ALTER TABLE public.accounting_periods ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'OPEN';
  ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS total_planned_revenue numeric(15,2) NOT NULL DEFAULT 0;
  ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS total_planned_expense numeric(15,2) NOT NULL DEFAULT 0;
  ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS total_planned_capex numeric(15,2) NOT NULL DEFAULT 0;
  ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS revisions jsonb NOT NULL DEFAULT '[]'::jsonb;
  ALTER TABLE public.budget_lines ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'EXPENSE';
  ALTER TABLE public.budget_lines ALTER COLUMN period_label SET DEFAULT 'ANNUAL';
  ALTER TABLE public.bulk_import_batches ADD COLUMN IF NOT EXISTS updated_rows integer NOT NULL DEFAULT 0;
  ALTER TABLE public.bulk_import_batches ADD COLUMN IF NOT EXISTS skipped_duplicates integer NOT NULL DEFAULT 0;
  ALTER TABLE public.bulk_import_batches ADD COLUMN IF NOT EXISTS journal_entry_id text;
  ALTER TABLE public.debit_notes ADD COLUMN IF NOT EXISTS cgst_total numeric(15,2) NOT NULL DEFAULT 0;
  ALTER TABLE public.debit_notes ADD COLUMN IF NOT EXISTS sgst_total numeric(15,2) NOT NULL DEFAULT 0;
  ALTER TABLE public.debit_notes ADD COLUMN IF NOT EXISTS igst_total numeric(15,2) NOT NULL DEFAULT 0;
  ALTER TABLE public.debit_notes ADD COLUMN IF NOT EXISTS journal_entry_id text;
  ALTER TABLE public.debit_notes ADD COLUMN IF NOT EXISTS journal_number text;
  ALTER TABLE public.debit_note_items ADD COLUMN IF NOT EXISTS sku text;
  ALTER TABLE public.debit_note_items ADD COLUMN IF NOT EXISTS hsn text;
  ALTER TABLE public.debit_note_items ADD COLUMN IF NOT EXISTS taxable_amount numeric(15,2) NOT NULL DEFAULT 0;
  ALTER TABLE public.debit_note_items ADD COLUMN IF NOT EXISTS cgst_amount numeric(15,2) NOT NULL DEFAULT 0;
  ALTER TABLE public.debit_note_items ADD COLUMN IF NOT EXISTS sgst_amount numeric(15,2) NOT NULL DEFAULT 0;
  ALTER TABLE public.debit_note_items ADD COLUMN IF NOT EXISTS igst_amount numeric(15,2) NOT NULL DEFAULT 0;

  ALTER TABLE public.accounting_periods DROP CONSTRAINT IF EXISTS accounting_periods_status_check;
  ALTER TABLE public.accounting_periods ADD CONSTRAINT accounting_periods_status_check CHECK (status IN ('OPEN', 'LOCKED', 'CLOSED'));

  ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS budgets_status_check;
  ALTER TABLE public.budgets ADD CONSTRAINT budgets_status_check CHECK (status IN ('DRAFT', 'APPROVED', 'REVISED', 'ARCHIVED'));

  ALTER TABLE public.budget_lines DROP CONSTRAINT IF EXISTS budget_lines_category_check;
  ALTER TABLE public.budget_lines ADD CONSTRAINT budget_lines_category_check CHECK (category IN ('REVENUE', 'EXPENSE', 'CAPEX'));

  ALTER TABLE public.bulk_import_batches DROP CONSTRAINT IF EXISTS bulk_import_batches_target_check;
  ALTER TABLE public.bulk_import_batches ADD CONSTRAINT bulk_import_batches_target_check CHECK (
    target IN (
      'PRODUCTS_PRICING_GST', 'PRODUCTS', 'PRODUCT_PRICING', 'TAX_CLASSIFICATIONS',
      'ACCOUNT_CLASSIFICATIONS', 'CUSTOMERS', 'SUPPLIERS', 'CHART_OF_ACCOUNTS',
      'OPENING_BALANCES', 'EXPENSES', 'SUPPLIER_BILLS'
    )
  );

  ALTER TABLE public.bulk_import_batches DROP CONSTRAINT IF EXISTS bulk_import_batches_status_check;
  ALTER TABLE public.bulk_import_batches ADD CONSTRAINT bulk_import_batches_status_check CHECK (
    status IN ('PREVIEW', 'APPROVED', 'COMMITTED', 'VALIDATED', 'PENDING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED')
  );

  ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
  ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check CHECK (
    source_type IN (
      'MANUAL', 'MANUAL_JOURNAL', 'SALE', 'SALES_INVOICE', 'CUSTOMER_PAYMENT',
      'CREDIT_NOTE', 'CREDIT_NOTE_REFUND', 'SUPPLIER_BILL', 'PURCHASE_BILL',
      'SUPPLIER_PAYMENT', 'DEBIT_NOTE', 'EXPENSE', 'BANK_DEPOSIT',
      'BANK_WITHDRAWAL', 'BANK_TRANSFER', 'BANK_TRANSACTION', 'BANK_RECONCILIATION',
      'OPENING_BALANCE', 'BULK_ADJUSTMENT', 'STOCK_ADJUSTMENT', 'REVERSAL'
    )
  );
END $$;

-- ------------------------------------------------------------------------------
-- 9. BANK RECONCILIATIONS & RECONCILIATION ITEMS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_reconciliations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id text REFERENCES public.stores(id),
  bank_account_id text NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  bank_account_name text NOT NULL,
  statement_date date NOT NULL,
  statement_closing_balance numeric(15,2) NOT NULL,
  book_closing_balance numeric(15,2) NOT NULL,
  cleared_balance numeric(15,2) NOT NULL,
  difference numeric(15,2) NOT NULL DEFAULT 0,
  matched_transaction_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  adjustment_journal_id text REFERENCES public.journal_entries(id),
  status text NOT NULL DEFAULT 'RECONCILED' CHECK (status IN ('IN_PROGRESS', 'RECONCILED')),
  notes text,
  reconciled_by text NOT NULL,
  reconciled_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_org_account
  ON public.bank_reconciliations (organization_id, bank_account_id, statement_date DESC);

CREATE TABLE IF NOT EXISTS public.bank_reconciliation_items (
  id text PRIMARY KEY,
  reconciliation_id text NOT NULL REFERENCES public.bank_reconciliations(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bank_transaction_id text REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  statement_date date NOT NULL,
  statement_reference text,
  description text,
  amount numeric(15,2) NOT NULL,
  matched boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 10. FINANCIAL AUDIT LOGS (Immutable Compliance & Audit Trail)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_audit_logs (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id text,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  actor_id text NOT NULL,
  actor_name text NOT NULL,
  actor_role text NOT NULL,
  summary text NOT NULL,
  before_snapshot jsonb,
  after_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_audit_org_created
  ON public.financial_audit_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fin_audit_entity
  ON public.financial_audit_logs (organization_id, entity_type, entity_id);

-- ------------------------------------------------------------------------------
-- 11. SYNC OUTBOX EVENTS (Durable Multi-Device Idempotency Table)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_outbox_events (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id text,
  device_id text NOT NULL,
  idempotency_key text NOT NULL,
  event_type text NOT NULL,
  entity_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'SYNCED' CHECK (status IN ('PENDING', 'SYNCED', 'FAILED', 'CONFLICT')),
  error_message text,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sync_outbox_org_key UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_org_ingested
  ON public.sync_outbox_events (organization_id, ingested_at DESC);

-- ------------------------------------------------------------------------------
-- 12. ROW-LEVEL SECURITY (Tenant Isolation on Every Accounting Table)
-- ------------------------------------------------------------------------------
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.general_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_posting_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debit_note_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_outbox_events ENABLE ROW LEVEL SECURITY;

-- Ensure hardened tenant helper exists (active profile via auth.uid() only)
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS text
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

-- Idempotent RLS Policies for all new accounting & sync tables
DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'chart_of_accounts',
    'accounting_periods',
    'journal_entries',
    'journal_entry_lines',
    'general_ledger',
    'accounting_posting_records',
    'budgets',
    'budget_lines',
    'bulk_import_batches',
    'bulk_import_errors',
    'debit_notes',
    'debit_note_items',
    'bank_reconciliations',
    'bank_reconciliation_items',
    'financial_audit_logs',
    'sync_outbox_events'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Tenant isolation for %I" ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "Tenant isolation for %I" ON public.%I FOR ALL USING (organization_id = public.current_user_org_id()) WITH CHECK (organization_id = public.current_user_org_id())',
      tbl, tbl
    );
  END LOOP;
END $$;

-- Also ensure child-table RLS policies exist with WITH CHECK for 20261120000000 financial item tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'credit_note_items') THEN
    DROP POLICY IF EXISTS "Tenant isolation for credit_note_items" ON public.credit_note_items;
    CREATE POLICY "Tenant isolation for credit_note_items" ON public.credit_note_items
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.credit_notes cn
          WHERE cn.id = credit_note_items.credit_note_id
            AND cn.organization_id = public.current_user_org_id()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.credit_notes cn
          WHERE cn.id = credit_note_items.credit_note_id
            AND cn.organization_id = public.current_user_org_id()
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'purchase_order_items') THEN
    DROP POLICY IF EXISTS "Tenant isolation for purchase_order_items" ON public.purchase_order_items;
    CREATE POLICY "Tenant isolation for purchase_order_items" ON public.purchase_order_items
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.purchase_orders po
          WHERE po.id = purchase_order_items.purchase_order_id
            AND po.organization_id = public.current_user_org_id()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.purchase_orders po
          WHERE po.id = purchase_order_items.purchase_order_id
            AND po.organization_id = public.current_user_org_id()
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'goods_receipt_items') THEN
    DROP POLICY IF EXISTS "Tenant isolation for goods_receipt_items" ON public.goods_receipt_items;
    CREATE POLICY "Tenant isolation for goods_receipt_items" ON public.goods_receipt_items
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.goods_receipts gr
          WHERE gr.id = goods_receipt_items.goods_receipt_id
            AND gr.organization_id = public.current_user_org_id()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.goods_receipts gr
          WHERE gr.id = goods_receipt_items.goods_receipt_id
            AND gr.organization_id = public.current_user_org_id()
        )
      );
  END IF;
END $$;

-- Explicit table grants & General Ledger / Audit Log Immutability Guarantees
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.chart_of_accounts,
  public.accounting_periods,
  public.journal_entries,
  public.journal_entry_lines,
  public.accounting_posting_records,
  public.budgets,
  public.budget_lines,
  public.bulk_import_batches,
  public.bulk_import_errors,
  public.debit_notes,
  public.debit_note_items,
  public.bank_reconciliations,
  public.bank_reconciliation_items,
  public.sync_outbox_events
TO authenticated;

GRANT SELECT, INSERT ON TABLE public.general_ledger, public.financial_audit_logs TO authenticated;
REVOKE UPDATE, DELETE ON TABLE public.general_ledger FROM authenticated;
REVOKE UPDATE, DELETE ON TABLE public.financial_audit_logs FROM authenticated;

GRANT ALL ON TABLE
  public.chart_of_accounts,
  public.accounting_periods,
  public.journal_entries,
  public.journal_entry_lines,
  public.general_ledger,
  public.accounting_posting_records,
  public.budgets,
  public.budget_lines,
  public.bulk_import_batches,
  public.bulk_import_errors,
  public.debit_notes,
  public.debit_note_items,
  public.bank_reconciliations,
  public.bank_reconciliation_items,
  public.financial_audit_logs,
  public.sync_outbox_events
TO service_role;

-- ------------------------------------------------------------------------------
-- 13. ATOMIC DOUBLE-ENTRY POSTGRESQL RPC FUNCTIONS (HARDENED)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_journal_entry_atomic(
  p_journal_id text,
  p_actor_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_auth_id uuid;
  v_is_service_role boolean;
  v_caller_profile RECORD;
  v_actor_id text;
  v_actor_name text;
  v_actor_role text;
  v_journal public.journal_entries%ROWTYPE;
  v_total_debit numeric(15,2);
  v_total_credit numeric(15,2);
  v_line_count integer;
  v_locked_period text;
  v_line RECORD;
  v_acct public.chart_of_accounts%ROWTYPE;
  v_delta numeric(15,2);
  v_new_balance numeric(15,2);
BEGIN
  v_caller_auth_id := auth.uid();
  v_is_service_role := public.is_trusted_service_role();

  IF NOT v_is_service_role THEN
    IF v_caller_auth_id IS NULL THEN
      RAISE EXCEPTION 'Authentication required: valid session token must be provided';
    END IF;

    SELECT id, name, organization_id, role, is_active
    INTO v_caller_profile
    FROM public.user_profiles
    WHERE auth_user_id = v_caller_auth_id AND is_active = TRUE
    LIMIT 1;

    IF v_caller_profile IS NULL OR v_caller_profile.organization_id IS NULL THEN
      RAISE EXCEPTION 'Access Denied: Caller has no active organization profile';
    END IF;

    IF v_caller_profile.role NOT IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER') THEN
      RAISE EXCEPTION 'Access Denied: Role % is not authorized to post journal entries', v_caller_profile.role;
    END IF;
  END IF;

  -- Lock journal header for atomic transition
  SELECT * INTO v_journal
  FROM public.journal_entries
  WHERE id = p_journal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry % not found', p_journal_id;
  END IF;

  IF NOT v_is_service_role AND v_journal.organization_id <> v_caller_profile.organization_id THEN
    RAISE EXCEPTION 'Access Denied: Cross-tenant journal posting is forbidden';
  END IF;

  IF v_caller_profile IS NOT NULL THEN
    v_actor_id := v_caller_profile.id;
    v_actor_name := v_caller_profile.name;
    v_actor_role := v_caller_profile.role::text;
  ELSE
    SELECT id, name, role::text INTO v_actor_id, v_actor_name, v_actor_role
    FROM public.user_profiles
    WHERE id = p_actor_id AND organization_id = v_journal.organization_id AND is_active = TRUE
    LIMIT 1;
    v_actor_id := COALESCE(v_actor_id, NULLIF(trim(p_actor_id), ''), 'SYSTEM');
    v_actor_name := COALESCE(v_actor_name, v_actor_id);
    v_actor_role := COALESCE(v_actor_role, 'SERVICE_ROLE');
  END IF;

  IF v_journal.status = 'POSTED' THEN
    RETURN jsonb_build_object('status', 'already_posted', 'journal_id', p_journal_id);
  END IF;

  IF v_journal.status = 'REVERSED' THEN
    RAISE EXCEPTION 'Cannot post a reversed journal entry (%)', p_journal_id;
  END IF;

  -- Check locked or closed accounting period
  SELECT name INTO v_locked_period
  FROM public.accounting_periods
  WHERE organization_id = v_journal.organization_id
    AND (is_locked = true OR status IN ('LOCKED', 'CLOSED'))
    AND v_journal.entry_date BETWEEN start_date AND end_date
  LIMIT 1;

  IF v_locked_period IS NOT NULL THEN
    RAISE EXCEPTION 'Accounting period "%" is locked for date %', v_locked_period, v_journal.entry_date;
  END IF;

  -- Aggregate and validate double-entry invariants
  SELECT
    COALESCE(SUM(debit), 0)::numeric(15,2),
    COALESCE(SUM(credit), 0)::numeric(15,2),
    COUNT(*)
  INTO v_total_debit, v_total_credit, v_line_count
  FROM public.journal_entry_lines
  WHERE journal_entry_id = p_journal_id
    AND organization_id = v_journal.organization_id;

  IF v_line_count < 2 THEN
    RAISE EXCEPTION 'Journal entry must contain at least 2 lines';
  END IF;

  IF v_total_debit <= 0 OR v_total_debit <> v_total_credit THEN
    RAISE EXCEPTION 'Unbalanced journal entry: total_debit (%) <> total_credit (%)', v_total_debit, v_total_credit;
  END IF;

  -- Update journal header status
  UPDATE public.journal_entries
  SET
    status = 'POSTED',
    total_debit = v_total_debit,
    total_credit = v_total_credit,
    approved_by = COALESCE(approved_by, v_actor_id),
    approved_by_name = COALESCE(approved_by_name, v_actor_name),
    posted_at = now(),
    updated_at = now()
  WHERE id = p_journal_id;

  -- Expand lines into immutable general_ledger and update chart_of_accounts balances
  FOR v_line IN
    SELECT * FROM public.journal_entry_lines
    WHERE journal_entry_id = p_journal_id
      AND organization_id = v_journal.organization_id
    ORDER BY line_order ASC
  LOOP
    SELECT * INTO v_acct
    FROM public.chart_of_accounts
    WHERE id = v_line.account_id
      AND organization_id = v_journal.organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account % not found in organization Chart of Accounts', v_line.account_id;
    END IF;

    IF v_acct.normal_balance = 'DEBIT' THEN
      v_delta := v_line.debit - v_line.credit;
    ELSE
      v_delta := v_line.credit - v_line.debit;
    END IF;

    v_new_balance := ROUND(v_acct.current_balance + v_delta, 2);

    UPDATE public.chart_of_accounts
    SET current_balance = v_new_balance, updated_at = now()
    WHERE id = v_acct.id;

    INSERT INTO public.general_ledger (
      id, organization_id, branch_id, journal_entry_id, journal_number, entry_date,
      account_id, account_code, account_name, account_class,
      debit, credit, running_balance,
      source_type, source_id, reference_number, narration,
      party_type, party_id, party_name
    ) VALUES (
      'gl_' || p_journal_id || '_' || v_line.id,
      v_journal.organization_id,
      v_journal.branch_id,
      p_journal_id,
      v_journal.journal_number,
      v_journal.entry_date,
      v_acct.id,
      v_acct.code,
      v_acct.name,
      v_acct.account_class,
      v_line.debit,
      v_line.credit,
      v_new_balance,
      v_journal.source_type,
      v_journal.source_id,
      v_journal.reference_number,
      COALESCE(v_line.description, v_journal.narration),
      v_line.party_type,
      v_line.party_id,
      v_line.party_name
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- Record immutable financial audit log with authoritative caller metadata
  INSERT INTO public.financial_audit_logs (
    id, organization_id, branch_id, entity_type, entity_id, action,
    actor_id, actor_name, actor_role, summary
  ) VALUES (
    'faud_' || extract(epoch from now())::bigint || '_' || substr(md5(p_journal_id), 1, 6),
    v_journal.organization_id,
    v_journal.branch_id,
    'JOURNAL_ENTRY',
    p_journal_id,
    'JOURNAL_POSTED',
    v_actor_id,
    v_actor_name,
    v_actor_role,
    format('Posted %s (%s) — Debits/Credits: %s', v_journal.journal_number, v_journal.narration, v_total_debit)
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN jsonb_build_object(
    'status', 'posted',
    'journal_id', p_journal_id,
    'total_debit', v_total_debit,
    'total_credit', v_total_credit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_journal_entry_atomic(
  p_journal_id text,
  p_reason text,
  p_actor_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_auth_id uuid;
  v_is_service_role boolean;
  v_caller_profile RECORD;
  v_actor_id text;
  v_actor_name text;
  v_orig public.journal_entries%ROWTYPE;
  v_rev_id text;
  v_rev_number text;
  v_rev_date date := current_date;
  v_locked_period text;
  v_line RECORD;
BEGIN
  v_caller_auth_id := auth.uid();
  v_is_service_role := public.is_trusted_service_role();

  IF NOT v_is_service_role THEN
    IF v_caller_auth_id IS NULL THEN
      RAISE EXCEPTION 'Authentication required: valid session token must be provided';
    END IF;

    SELECT id, name, organization_id, role, is_active
    INTO v_caller_profile
    FROM public.user_profiles
    WHERE auth_user_id = v_caller_auth_id AND is_active = TRUE
    LIMIT 1;

    IF v_caller_profile IS NULL OR v_caller_profile.organization_id IS NULL THEN
      RAISE EXCEPTION 'Access Denied: Caller has no active organization profile';
    END IF;

    IF v_caller_profile.role NOT IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER') THEN
      RAISE EXCEPTION 'Access Denied: Role % is not authorized to reverse journal entries', v_caller_profile.role;
    END IF;
  END IF;

  SELECT * INTO v_orig
  FROM public.journal_entries
  WHERE id = p_journal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry % not found', p_journal_id;
  END IF;

  IF NOT v_is_service_role AND v_orig.organization_id <> v_caller_profile.organization_id THEN
    RAISE EXCEPTION 'Access Denied: Cross-tenant journal reversal is forbidden';
  END IF;

  IF v_caller_profile IS NOT NULL THEN
    v_actor_id := v_caller_profile.id;
    v_actor_name := v_caller_profile.name;
  ELSE
    SELECT id, name INTO v_actor_id, v_actor_name
    FROM public.user_profiles
    WHERE id = p_actor_id AND organization_id = v_orig.organization_id AND is_active = TRUE
    LIMIT 1;
    v_actor_id := COALESCE(v_actor_id, NULLIF(trim(p_actor_id), ''), 'SYSTEM');
    v_actor_name := COALESCE(v_actor_name, v_actor_id);
  END IF;

  IF v_orig.status <> 'POSTED' THEN
    RAISE EXCEPTION 'Only POSTED journal entries can be reversed (current status: %)', v_orig.status;
  END IF;

  -- Reject reversal into locked or closed period
  SELECT name INTO v_locked_period
  FROM public.accounting_periods
  WHERE organization_id = v_orig.organization_id
    AND (is_locked = true OR status IN ('LOCKED', 'CLOSED'))
    AND v_rev_date BETWEEN start_date AND end_date
  LIMIT 1;

  IF v_locked_period IS NOT NULL THEN
    RAISE EXCEPTION 'Accounting period "%" is locked; reversal blocked', v_locked_period;
  END IF;

  v_rev_id := 'je_rev_' || substr(md5(p_journal_id || now()::text), 1, 12);
  v_rev_number := 'REV-' || v_orig.journal_number;

  INSERT INTO public.journal_entries (
    id, organization_id, branch_id, journal_number, entry_date, reference_number,
    narration, status, source_type, source_id,
    total_debit, total_credit, reversal_of_journal_id, reversal_reason,
    created_by, created_by_name
  ) VALUES (
    v_rev_id,
    v_orig.organization_id,
    v_orig.branch_id,
    v_rev_number,
    v_rev_date,
    v_orig.journal_number,
    format('Reversal of %s: %s', v_orig.journal_number, COALESCE(NULLIF(trim(p_reason), ''), 'Audit correction')),
    'DRAFT',
    'REVERSAL',
    p_journal_id,
    v_orig.total_credit,
    v_orig.total_debit,
    p_journal_id,
    p_reason,
    v_actor_id,
    v_actor_name
  );

  -- Mirror lines (Debit <-> Credit)
  FOR v_line IN
    SELECT * FROM public.journal_entry_lines
    WHERE journal_entry_id = p_journal_id
      AND organization_id = v_orig.organization_id
    ORDER BY line_order ASC
  LOOP
    INSERT INTO public.journal_entry_lines (
      id, journal_entry_id, organization_id, account_id, account_code, account_name,
      description, debit, credit, party_type, party_id, party_name, tax_code, line_order
    ) VALUES (
      'jel_rev_' || v_line.id,
      v_rev_id,
      v_orig.organization_id,
      v_line.account_id,
      v_line.account_code,
      v_line.account_name,
      'Reversal: ' || COALESCE(v_line.description, v_orig.narration),
      v_line.credit,
      v_line.debit,
      v_line.party_type,
      v_line.party_id,
      v_line.party_name,
      v_line.tax_code,
      v_line.line_order
    );
  END LOOP;

  -- Post the reversing journal atomically
  PERFORM public.post_journal_entry_atomic(v_rev_id, v_actor_id);

  -- Mark original as REVERSED
  UPDATE public.journal_entries
  SET
    status = 'REVERSED',
    reversed_by_journal_id = v_rev_id,
    reversal_reason = p_reason,
    updated_at = now()
  WHERE id = p_journal_id;

  RETURN jsonb_build_object(
    'status', 'reversed',
    'original_journal_id', p_journal_id,
    'reversing_journal_id', v_rev_id,
    'reversing_journal_number', v_rev_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_journal_entry_atomic(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_journal_entry_atomic(text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reverse_journal_entry_atomic(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_journal_entry_atomic(text, text, text) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 14. IDEMPOTENT DEFAULT CHART OF ACCOUNTS & FISCAL PERIOD SEEDING
--     Runs ONLY for existing organizations without touching any operational data.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_default_chart_of_accounts(p_org_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org text;
  v_caller_role text;
BEGIN
  IF NOT public.is_trusted_service_role() THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Authentication required to seed Chart of Accounts';
    END IF;
    SELECT organization_id, role::text INTO v_caller_org, v_caller_role
    FROM public.user_profiles
    WHERE auth_user_id = auth.uid() AND is_active = TRUE
    LIMIT 1;
    IF v_caller_org IS NULL OR v_caller_org <> p_org_id OR v_caller_role NOT IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER') THEN
      RAISE EXCEPTION 'Access Denied: Caller cannot seed Chart of Accounts for organization %', p_org_id;
    END IF;
  END IF;
  INSERT INTO public.chart_of_accounts (
    id, organization_id, branch_id, code, name, account_class, account_group,
    parent_code, normal_balance, tax_applicable, gst_tag, is_system, description
  )
  VALUES
    ('coa_' || p_org_id || '_1000', p_org_id, 'ALL', '1000', 'Current Assets', 'ASSET', 'Current Assets', NULL, 'DEBIT', false, NULL, true, 'Parent group for liquid & short-term assets'),
    ('coa_' || p_org_id || '_1010', p_org_id, 'ALL', '1010', 'Cash on Hand', 'ASSET', 'Cash & Bank', '1000', 'DEBIT', false, NULL, true, 'Counter cash drawers and petty cash'),
    ('coa_' || p_org_id || '_1020', p_org_id, 'ALL', '1020', 'Bank Accounts', 'ASSET', 'Cash & Bank', '1000', 'DEBIT', false, NULL, true, 'Primary operating business bank accounts'),
    ('coa_' || p_org_id || '_1100', p_org_id, 'ALL', '1100', 'Accounts Receivable (Sundry Debtors)', 'ASSET', 'Accounts Receivable', '1000', 'DEBIT', false, NULL, true, 'Outstanding balances owed by customers'),
    ('coa_' || p_org_id || '_1200', p_org_id, 'ALL', '1200', 'Inventory Asset (Stock-in-Hand)', 'ASSET', 'Inventory', '1000', 'DEBIT', false, NULL, true, 'Merchandise and finished goods held for sale'),
    ('coa_' || p_org_id || '_1300', p_org_id, 'ALL', '1300', 'Input Tax Credit (GST Input)', 'ASSET', 'Tax Assets', '1000', 'DEBIT', false, NULL, true, 'GST paid on purchases & eligible expenses'),
    ('coa_' || p_org_id || '_1310', p_org_id, 'ALL', '1310', 'Input CGST', 'ASSET', 'Tax Assets', '1300', 'DEBIT', true, 'INPUT_CGST', true, 'Central GST Input Tax Credit'),
    ('coa_' || p_org_id || '_1320', p_org_id, 'ALL', '1320', 'Input SGST', 'ASSET', 'Tax Assets', '1300', 'DEBIT', true, 'INPUT_SGST', true, 'State GST Input Tax Credit'),
    ('coa_' || p_org_id || '_1330', p_org_id, 'ALL', '1330', 'Input IGST', 'ASSET', 'Tax Assets', '1300', 'DEBIT', true, 'INPUT_IGST', true, 'Integrated GST Input Tax Credit'),
    ('coa_' || p_org_id || '_1500', p_org_id, 'ALL', '1500', 'Fixed Assets & Equipment', 'ASSET', 'Fixed Assets', NULL, 'DEBIT', false, NULL, true, 'POS hardware, fixtures, computers, and store equipment'),
    ('coa_' || p_org_id || '_2000', p_org_id, 'ALL', '2000', 'Accounts Payable (Sundry Creditors)', 'LIABILITY', 'Accounts Payable', NULL, 'CREDIT', false, NULL, true, 'Unpaid supplier bills and trade creditors'),
    ('coa_' || p_org_id || '_2100', p_org_id, 'ALL', '2100', 'Duties & Taxes Payable (GST Output)', 'LIABILITY', 'Tax Liabilities', NULL, 'CREDIT', false, NULL, true, 'GST collected on sales payable to authorities'),
    ('coa_' || p_org_id || '_2110', p_org_id, 'ALL', '2110', 'Output CGST', 'LIABILITY', 'Tax Liabilities', '2100', 'CREDIT', true, 'OUTPUT_CGST', true, 'Central GST Output Tax Liability'),
    ('coa_' || p_org_id || '_2120', p_org_id, 'ALL', '2120', 'Output SGST', 'LIABILITY', 'Tax Liabilities', '2100', 'CREDIT', true, 'OUTPUT_SGST', true, 'State GST Output Tax Liability'),
    ('coa_' || p_org_id || '_2130', p_org_id, 'ALL', '2130', 'Output IGST', 'LIABILITY', 'Tax Liabilities', '2100', 'CREDIT', true, 'OUTPUT_IGST', true, 'Integrated GST Output Tax Liability'),
    ('coa_' || p_org_id || '_2200', p_org_id, 'ALL', '2200', 'Customer Credit Balances & Advances', 'LIABILITY', 'Current Liabilities', NULL, 'CREDIT', false, NULL, true, 'Unapplied customer credit notes and advances'),
    ('coa_' || p_org_id || '_2500', p_org_id, 'ALL', '2500', 'Long-Term Borrowings & Loans', 'LIABILITY', 'Long-Term Liabilities', NULL, 'CREDIT', false, NULL, true, 'Working capital facilities and business term loans'),
    ('coa_' || p_org_id || '_3000', p_org_id, 'ALL', '3000', 'Owner Capital / Share Capital', 'EQUITY', 'Capital', NULL, 'CREDIT', false, NULL, true, 'Subscribed capital and owner investments'),
    ('coa_' || p_org_id || '_3100', p_org_id, 'ALL', '3100', 'Retained Earnings', 'EQUITY', 'Reserves & Surplus', NULL, 'CREDIT', false, NULL, true, 'Accumulated net profits retained in the business'),
    ('coa_' || p_org_id || '_3200', p_org_id, 'ALL', '3200', 'Opening Balance Equity', 'EQUITY', 'Opening Adjustments', NULL, 'CREDIT', false, NULL, true, 'Contra equity account for opening balance migrations'),
    ('coa_' || p_org_id || '_4000', p_org_id, 'ALL', '4000', 'Sales Revenue', 'INCOME', 'Direct Income', NULL, 'CREDIT', true, NULL, true, 'Gross retail and wholesale invoice revenue'),
    ('coa_' || p_org_id || '_4100', p_org_id, 'ALL', '4100', 'Sales Returns & Allowances', 'INCOME', 'Direct Income', '4000', 'CREDIT', false, NULL, true, 'Contra-revenue account for customer credit notes and returns'),
    ('coa_' || p_org_id || '_4200', p_org_id, 'ALL', '4200', 'Other Operating Income', 'INCOME', 'Indirect Income', NULL, 'CREDIT', false, NULL, true, 'Interest received, freight recovered, and miscellaneous income'),
    ('coa_' || p_org_id || '_5000', p_org_id, 'ALL', '5000', 'Cost of Goods Sold (COGS)', 'EXPENSE', 'Direct Expenses', NULL, 'DEBIT', false, NULL, true, 'Direct cost of inventory sold to customers'),
    ('coa_' || p_org_id || '_5050', p_org_id, 'ALL', '5050', 'Purchase Returns & Rebates', 'EXPENSE', 'Direct Expenses', '5000', 'DEBIT', false, NULL, true, 'Contra-expense for supplier debit notes and purchase returns'),
    ('coa_' || p_org_id || '_5100', p_org_id, 'ALL', '5100', 'Store & Office Rent', 'EXPENSE', 'Operating Expenses', NULL, 'DEBIT', false, NULL, true, 'Commercial lease and warehouse rental costs'),
    ('coa_' || p_org_id || '_5200', p_org_id, 'ALL', '5200', 'Staff Salaries & Wages', 'EXPENSE', 'Operating Expenses', NULL, 'DEBIT', false, NULL, true, 'Payroll, staff allowances, and store incentives'),
    ('coa_' || p_org_id || '_5300', p_org_id, 'ALL', '5300', 'Utilities, Power & Internet', 'EXPENSE', 'Operating Expenses', NULL, 'DEBIT', false, NULL, true, 'Electricity, water, broadband, and telecom expenses'),
    ('coa_' || p_org_id || '_5400', p_org_id, 'ALL', '5400', 'Freight & Inventory Logistics', 'EXPENSE', 'Operating Expenses', NULL, 'DEBIT', false, NULL, true, 'Inward/outward courier, transport, and warehousing'),
    ('coa_' || p_org_id || '_5500', p_org_id, 'ALL', '5500', 'Repairs & Store Maintenance', 'EXPENSE', 'Operating Expenses', NULL, 'DEBIT', false, NULL, true, 'Equipment servicing, upkeep, and facility repairs'),
    ('coa_' || p_org_id || '_5600', p_org_id, 'ALL', '5600', 'General & Administrative Expenses', 'EXPENSE', 'Operating Expenses', NULL, 'DEBIT', false, NULL, true, 'Office supplies, professional fees, and misc expenses'),
    ('coa_' || p_org_id || '_5900', p_org_id, 'ALL', '5900', 'Bank Charges & Reconciliation Adjustments', 'EXPENSE', 'Financial Charges', NULL, 'DEBIT', false, NULL, true, 'Payment gateway fees, bank charges, and reconciliation variances')
  ON CONFLICT (organization_id, code) DO NOTHING;

  -- Link parent_account_id hierarchically
  UPDATE public.chart_of_accounts c
  SET parent_account_id = p.id
  FROM public.chart_of_accounts p
  WHERE c.organization_id = p_org_id
    AND p.organization_id = p_org_id
    AND c.parent_code IS NOT NULL
    AND c.parent_code = p.code
    AND c.parent_account_id IS NULL;

  -- Seed FY 2026-2027 quarterly accounting periods (idempotent)
  INSERT INTO public.accounting_periods (id, organization_id, fiscal_year, name, start_date, end_date, is_locked, status)
  VALUES
    ('ap_' || p_org_id || '_2026_q1', p_org_id, '2026–2027', 'Q1 FY 2026-27 (Apr–Jun 2026)', '2026-04-01', '2026-06-30', false, 'OPEN'),
    ('ap_' || p_org_id || '_2026_q2', p_org_id, '2026–2027', 'Q2 FY 2026-27 (Jul–Sep 2026)', '2026-07-01', '2026-09-30', false, 'OPEN'),
    ('ap_' || p_org_id || '_2026_q3', p_org_id, '2026–2027', 'Q3 FY 2026-27 (Oct–Dec 2026)', '2026-10-01', '2026-12-31', false, 'OPEN'),
    ('ap_' || p_org_id || '_2026_q4', p_org_id, '2026–2027', 'Q4 FY 2026-27 (Jan–Mar 2027)', '2027-01-01', '2027-03-31', false, 'OPEN')
  ON CONFLICT (organization_id, fiscal_year, name) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_chart_of_accounts(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_default_chart_of_accounts(text) TO authenticated, service_role;

-- Apply default Chart of Accounts & FY periods to all existing tenants safely
DO $$
DECLARE
  org_rec RECORD;
BEGIN
  FOR org_rec IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_default_chart_of_accounts(org_rec.id);
  END LOOP;
END $$;

COMMIT;
