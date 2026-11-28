-- ==============================================================================
-- SLATE POS — Cloud Persistence, Cross-Device Sync & Storage Optimization
-- Migration: 20261128000000_persistence_sync_and_storage_optimization.sql
--
-- Safety Guarantees:
-- 1. Strictly additive and idempotent; preserves all existing tables, schemas,
--    rows, organizations, user profiles, branches, and accounting/tax records.
-- 2. Adds optimistic concurrency versioning (`version`, `updated_at`), soft-delete
--    columns (`deleted_at`), idempotency keys, missing quotation/supplier/expense
--    attributes, `user_preferences`, `process_customer_payment_atomic` RPC,
--    missing composite/FK indexes, and a strict TTL cleanup function scoped ONLY
--    to expired synced transient outbox/webhook rows.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. ADDITIVE SCHEMA EXTENSIONS (CONCURRENCY, SOFT DELETES, IDEMPOTENCY, DATA)
-- ------------------------------------------------------------------------------

-- Organizations & Stores
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Stock Movements
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

-- Customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS company_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS shipping_address TEXT,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Suppliers
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS current_payable_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS category VARCHAR(128),
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Sales & Payments
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Quotations (Full Line Items, Tax Breakdown, Activities & Cloud Sync Fields)
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128),
  ADD COLUMN IF NOT EXISTS quote_type VARCHAR(32) NOT NULL DEFAULT 'ONE_TIME',
  ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(32),
  ADD COLUMN IF NOT EXISTS customer_gstin VARCHAR(20),
  ADD COLUMN IF NOT EXISTS billing_address TEXT,
  ADD COLUMN IF NOT EXISTS shipping_address TEXT,
  ADD COLUMN IF NOT EXISTS date DATE,
  ADD COLUMN IF NOT EXISTS reference_number VARCHAR(128),
  ADD COLUMN IF NOT EXISTS salesperson VARCHAR(255),
  ADD COLUMN IF NOT EXISTS project_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS discount_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS adjustment NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS taxable_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS cgst_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS sgst_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS igst_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS round_off NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT,
  ADD COLUMN IF NOT EXISTS email_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pdf_template VARCHAR(64),
  ADD COLUMN IF NOT EXISTS linked_invoice_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS linked_invoice_number VARCHAR(64),
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS activities JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Expenses (GST ITC Support, Concurrency & Soft Delete)
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128),
  ADD COLUMN IF NOT EXISTS gst_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS is_gst_input_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Financial & Procurement Modules (Idempotency + Concurrency + Soft Delete)
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128),
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128),
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE public.supplier_bills
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128),
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE public.supplier_payments
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

ALTER TABLE public.debit_notes
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128),
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

-- ------------------------------------------------------------------------------
-- 2. USER PREFERENCES & FORM DRAFT RECOVERY TABLE (RLS PROTECTED)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_preferences (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  auth_user_id UUID,
  user_id TEXT NOT NULL,
  quote_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  custom_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  drafts JSONB NOT NULL DEFAULT '{}'::jsonb,
  fiscal_year VARCHAR(32),
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_prefs_org_user UNIQUE (organization_id, user_id)
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User Preferences Select Policy" ON public.user_preferences;
DROP POLICY IF EXISTS "User Preferences Insert Policy" ON public.user_preferences;
DROP POLICY IF EXISTS "User Preferences Update Policy" ON public.user_preferences;
DROP POLICY IF EXISTS "User Preferences Delete Policy" ON public.user_preferences;

CREATE POLICY "User Preferences Select Policy" ON public.user_preferences
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND (
      auth_user_id = auth.uid()
      OR user_id = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.id = user_preferences.user_id
          AND up.auth_user_id = auth.uid()
          AND up.organization_id = public.current_user_org_id()
      )
    )
  );

CREATE POLICY "User Preferences Insert Policy" ON public.user_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND (
      auth_user_id = auth.uid()
      OR user_id = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.id = user_preferences.user_id
          AND up.auth_user_id = auth.uid()
          AND up.organization_id = public.current_user_org_id()
      )
    )
  );

CREATE POLICY "User Preferences Update Policy" ON public.user_preferences
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND (
      auth_user_id = auth.uid()
      OR user_id = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.id = user_preferences.user_id
          AND up.auth_user_id = auth.uid()
          AND up.organization_id = public.current_user_org_id()
      )
    )
  )
  WITH CHECK (
    organization_id = public.current_user_org_id()
    AND (
      auth_user_id = auth.uid()
      OR user_id = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.id = user_preferences.user_id
          AND up.auth_user_id = auth.uid()
          AND up.organization_id = public.current_user_org_id()
      )
    )
  );

CREATE POLICY "User Preferences Delete Policy" ON public.user_preferences
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_user_org_id()
    AND (
      auth_user_id = auth.uid()
      OR user_id = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.id = user_preferences.user_id
          AND up.auth_user_id = auth.uid()
          AND up.organization_id = public.current_user_org_id()
      )
    )
  );

-- ------------------------------------------------------------------------------
-- 3. OPTIMISTIC CONCURRENCY & UPDATED_AT TRIGGER FUNCTION
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bump_version_and_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  NEW.version := COALESCE(OLD.version, 1) + 1;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_tbl TEXT;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'organizations',
    'stores',
    'products',
    'customers',
    'suppliers',
    'sales',
    'quotations',
    'expenses',
    'bank_accounts',
    'credit_notes',
    'purchase_orders',
    'supplier_bills',
    'debit_notes',
    'user_preferences'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_tbl
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_bump_version ON public.%I;', v_tbl, v_tbl);
      EXECUTE format(
        'CREATE TRIGGER trg_%I_bump_version BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bump_version_and_updated_at();',
        v_tbl,
        v_tbl
      );
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 4. COMPOSITE PERFORMANCE, FOREIGN-KEY & IDEMPOTENCY INDEXES
-- ------------------------------------------------------------------------------

-- Tenant + Soft-Delete + Sort Indexes
CREATE INDEX IF NOT EXISTS idx_products_org_active_updated
  ON public.products (organization_id, is_active, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_org_updated
  ON public.customers (organization_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_org_active
  ON public.suppliers (organization_id, is_active, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_org_created
  ON public.quotations (organization_id, branch_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_customer
  ON public.quotations (customer_id);

CREATE INDEX IF NOT EXISTS idx_expenses_org_branch_date
  ON public.expenses (organization_id, branch_id, date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_org_branch_created
  ON public.sales (organization_id, branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_org_status_due
  ON public.sales (organization_id, payment_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_org_branch_ts
  ON public.stock_movements (organization_id, branch_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_bank_tx_org_acc_date
  ON public.bank_transactions (organization_id, bank_account_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_credit_notes_org_cust_status
  ON public.credit_notes (organization_id, customer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_org_supp_status
  ON public.purchase_orders (organization_id, supplier_id, status, order_date DESC);

CREATE INDEX IF NOT EXISTS idx_supplier_bills_org_supp_status
  ON public.supplier_bills (organization_id, supplier_id, status, bill_date DESC);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_org_bill_date
  ON public.supplier_payments (organization_id, supplier_bill_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_user_preferences_org_auth
  ON public.user_preferences (organization_id, auth_user_id);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_events_org_ingested
  ON public.sync_outbox_events (organization_id, ingested_at DESC);

-- Partial Unique Idempotency Indexes (Safe on existing data where NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_org_idempotency
  ON public.quotations (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_org_idempotency
  ON public.expenses (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_notes_org_idempotency
  ON public.credit_notes (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_org_idempotency
  ON public.purchase_orders (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_bills_org_idempotency
  ON public.supplier_bills (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_payments_org_idempotency
  ON public.supplier_payments (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_debit_notes_org_idempotency
  ON public.debit_notes (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_org_idempotency
  ON public.stock_movements (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 5. ATOMIC CUSTOMER RECEIVABLE PAYMENT ALLOCATION RPC
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_customer_payment_atomic(
  p_payment_json JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_service_role BOOLEAN;
  v_caller_org TEXT;
  v_org_id TEXT;
  v_customer_id TEXT;
  v_payment_id TEXT;
  v_idempotency_key TEXT;
  v_amount NUMERIC(12, 2);
  v_method TEXT;
  v_utr TEXT;
  v_remaining NUMERIC(12, 2);
  v_sale RECORD;
  v_outstanding NUMERIC(12, 2);
  v_apply NUMERIC(12, 2);
  v_new_paid NUMERIC(12, 2);
  v_new_status payment_status;
  v_new_cust_balance NUMERIC(12, 2);
BEGIN
  v_is_service_role := public.is_trusted_service_role();

  IF NOT v_is_service_role THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: authentication required' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_permission('PAYMENTS_COLLECT') THEN
      RAISE EXCEPTION 'Forbidden: missing PAYMENTS_COLLECT permission' USING ERRCODE = '42501';
    END IF;
    v_caller_org := public.current_user_org_id();
  END IF;

  v_org_id := COALESCE(NULLIF(p_payment_json->>'organizationId', ''), v_caller_org);
  IF NOT v_is_service_role AND v_org_id <> v_caller_org THEN
    RAISE EXCEPTION 'Forbidden: cross-tenant payment allocation denied' USING ERRCODE = '42501';
  END IF;

  v_customer_id := NULLIF(p_payment_json->>'customerId', '');
  v_payment_id := COALESCE(NULLIF(p_payment_json->>'paymentId', ''), 'pay_' || replace(gen_random_uuid()::text, '-', ''));
  v_idempotency_key := COALESCE(NULLIF(p_payment_json->>'idempotencyKey', ''), v_payment_id);
  v_amount := ROUND(COALESCE((p_payment_json->>'amount')::NUMERIC, 0), 2);
  v_method := COALESCE(NULLIF(p_payment_json->>'method', ''), 'CASH');
  v_utr := NULLIF(p_payment_json->>'utrOrRef', '');

  IF v_customer_id IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid customer payment payload' USING ERRCODE = '22023';
  END IF;

  -- Idempotency check
  IF EXISTS (SELECT 1 FROM public.payments WHERE idempotency_key = v_idempotency_key) THEN
    SELECT current_receivable_balance INTO v_new_cust_balance
    FROM public.customers
    WHERE id = v_customer_id AND organization_id = v_org_id;
    RETURN jsonb_build_object(
      'status', 'ALREADY_EXISTS',
      'payment_id', v_payment_id,
      'new_balance', COALESCE(v_new_cust_balance, 0)
    );
  END IF;

  -- Lock customer row for update
  PERFORM 1 FROM public.customers
  WHERE id = v_customer_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found in tenant' USING ERRCODE = 'P0002';
  END IF;

  v_remaining := v_amount;

  -- Apply FIFO across customer's open invoices
  FOR v_sale IN
    SELECT id, grand_total, COALESCE(amount_paid, 0) AS amount_paid
    FROM public.sales
    WHERE organization_id = v_org_id
      AND customer_id = v_customer_id
      AND payment_status IN ('OVERDUE', 'PARTIALLY_PAID', 'PENDING')
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_outstanding := GREATEST(0, ROUND(v_sale.grand_total - v_sale.amount_paid, 2));
    IF v_outstanding <= 0 THEN
      CONTINUE;
    END IF;

    v_apply := LEAST(v_remaining, v_outstanding);
    v_new_paid := ROUND(v_sale.amount_paid + v_apply, 2);
    v_new_status := CASE
      WHEN v_new_paid >= v_sale.grand_total - 0.01 THEN 'PAID'::payment_status
      ELSE 'PARTIALLY_PAID'::payment_status
    END;

    UPDATE public.sales
    SET amount_paid = v_new_paid,
        payment_status = v_new_status,
        updated_at = NOW()
    WHERE id = v_sale.id;

    INSERT INTO public.payments (
      id, idempotency_key, sale_id, customer_id,
      method, amount, utr_or_ref, gateway_status, timestamp
    ) VALUES (
      v_payment_id || '_' || right(v_sale.id, 6),
      v_idempotency_key || '_' || v_sale.id,
      v_sale.id,
      v_customer_id,
      (CASE WHEN v_method IN ('CASH', 'UPI', 'CARD', 'CREDIT_NOTE', 'SPLIT') THEN v_method ELSE 'CASH' END)::payment_method,
      v_apply,
      v_utr,
      'VERIFIED',
      NOW()
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    v_remaining := ROUND(v_remaining - v_apply, 2);
  END LOOP;

  -- Atomic receivable balance decrement (floor at 0)
  UPDATE public.customers
  SET current_receivable_balance = GREATEST(0, ROUND(COALESCE(current_receivable_balance, 0) - v_amount, 2)),
      updated_at = NOW()
  WHERE id = v_customer_id AND organization_id = v_org_id
  RETURNING current_receivable_balance INTO v_new_cust_balance;

  RETURN jsonb_build_object(
    'status', 'SUCCESS',
    'payment_id', v_payment_id,
    'new_balance', COALESCE(v_new_cust_balance, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_customer_payment_atomic(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_customer_payment_atomic(JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. SAFE TTL CLEANUP FOR EXPIRED TRANSIENT SYNC / WEBHOOK DATA ONLY
-- (NEVER deletes invoices, bills, journals, GL, tax, customers, or audit logs)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_expired_transient_sync_data(
  p_retention_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ;
  v_outbox_events_deleted INT := 0;
  v_outbox_deleted INT := 0;
  v_webhooks_deleted INT := 0;
BEGIN
  IF NOT public.is_trusted_service_role() THEN
    RAISE EXCEPTION 'Forbidden: service_role required for transient sync purge' USING ERRCODE = '42501';
  END IF;

  v_cutoff := NOW() - make_interval(days => GREATEST(7, COALESCE(p_retention_days, 30)));

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sync_outbox_events') THEN
    DELETE FROM public.sync_outbox_events
    WHERE status = 'SYNCED'
      AND ingested_at < v_cutoff;
    GET DIAGNOSTICS v_outbox_events_deleted = ROW_COUNT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sync_outbox') THEN
    DELETE FROM public.sync_outbox
    WHERE status = 'SYNCED'
      AND synced_at IS NOT NULL
      AND synced_at < v_cutoff;
    GET DIAGNOSTICS v_outbox_deleted = ROW_COUNT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_webhook_events') THEN
    DELETE FROM public.payment_webhook_events
    WHERE processed = TRUE
      AND created_at < v_cutoff;
    GET DIAGNOSTICS v_webhooks_deleted = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'status', 'SUCCESS',
    'cutoff', v_cutoff,
    'sync_outbox_events_deleted', v_outbox_events_deleted,
    'sync_outbox_deleted', v_outbox_deleted,
    'webhooks_deleted', v_webhooks_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_transient_sync_data(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_transient_sync_data(INT) TO service_role;

-- ------------------------------------------------------------------------------
-- 7. ENABLE REALTIME PUBLICATION FOR CROSS-DEVICE SYNC (SAFE / IDEMPOTENT)
-- ------------------------------------------------------------------------------

DO $$
DECLARE
  v_tbl TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_tbl IN ARRAY ARRAY[
      'products',
      'customers',
      'suppliers',
      'quotations',
      'sales',
      'expenses',
      'bank_accounts',
      'bank_transactions',
      'credit_notes',
      'purchase_orders',
      'supplier_bills',
      'supplier_payments',
      'debit_notes',
      'journal_entries',
      'user_preferences'
    ]
    LOOP
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', v_tbl);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN undefined_table THEN NULL;
      END;
    END LOOP;
  END IF;
END $$;

COMMIT;
