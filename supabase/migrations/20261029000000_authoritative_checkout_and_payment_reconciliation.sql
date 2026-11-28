-- ==============================================================================
-- SLATE POS — Authoritative Checkout, Payment Reconciliation & Gateway Status Fix
-- Migration: 20261029000000_authoritative_checkout_and_payment_reconciliation.sql
-- Target: Supabase PostgreSQL
--
-- Remediations:
-- 1. Payments Schema Hardening:
--    - Alters public.payments.gateway_status column default from 'VERIFIED' to 'PENDING'.
--    - Eliminates nonexistent type casts (gateway_status_val does not exist).
--    - Adds check constraint chk_payments_gateway_status ('PENDING', 'VERIFIED', 'FAILED', 'REFUNDED').
--    - Adds check constraint chk_payments_amount_positive (amount > 0).
-- 2. Authoritative Counter Checkout (process_sale_atomic):
--    - Counter CASH tenders are verified only after server-side payment reconciliation.
--    - UPI, Card, and electronic/gateway tenders strictly default to PENDING.
--    - Client-supplied gatewayStatus and paymentStatus are strictly ignored.
--    - Product selling prices, GST rates, taxable values, and grand totals are server-authoritative.
--    - Disallows line discounts greater than item value or negative discounts.
--    - Product row-locking (FOR UPDATE) guarantees concurrent overselling protection.
--    - Enforces tenant isolation for customers, branches, products, and idempotency keys.
-- 3. Privileged Gateway Confirmation (confirm_gateway_payment_atomic):
--    - Restricted strictly to service_role (revoked from PUBLIC, anon, authenticated).
--    - Safely transitions electronic payment from PENDING to VERIFIED and reconciles parent sale.
-- ==============================================================================

-- ============================================================================
-- 1. PAYMENTS TABLE CONSTRAINTS & DEFAULT STATUS HARDENING
-- ============================================================================

-- Backfill any unexpected NULL gateway_status values before adding constraint
UPDATE public.payments
SET gateway_status = 'PENDING'
WHERE gateway_status IS NULL;

-- Remove permissive 'VERIFIED' default: electronic payments must never default to verified
ALTER TABLE public.payments ALTER COLUMN gateway_status SET DEFAULT 'PENDING';

-- Enforce permitted gateway status values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payments_gateway_status'
    ) THEN
        ALTER TABLE public.payments
        ADD CONSTRAINT chk_payments_gateway_status
        CHECK (gateway_status IN ('PENDING', 'VERIFIED', 'FAILED', 'REFUNDED'));
    END IF;
END $$;

-- Enforce strictly positive payment amounts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payments_amount_positive'
    ) THEN
        ALTER TABLE public.payments
        ADD CONSTRAINT chk_payments_amount_positive
        CHECK (amount > 0);
    END IF;
END $$;

-- ============================================================================
-- 2. HARDENED ATOMIC CHECKOUT: process_sale_atomic
-- ============================================================================

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

    -- Server-authoritative financial calculation variables
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

    -- Payment and inventory processing variables
    v_item JSONB;
    v_payment JSONB;
    v_prod_id VARCHAR(64);
    v_qty NUMERIC(12, 2);
    v_prod_record RECORD;
    v_current_stock NUMERIC(12, 2);
    v_payment_sum NUMERIC(12, 2) := 0.00;
    v_verified_paid NUMERIC(12, 2) := 0.00;
    v_pay_amount NUMERIC(12, 2);
    v_pay_method payment_method;
    v_pay_status VARCHAR(32); -- Strictly standard VARCHAR, no invalid enum cast
    v_change_returned NUMERIC(12, 2) := 0.00;
    v_amount_paid NUMERIC(12, 2) := 0.00;
    v_unpaid_balance NUMERIC(12, 2) := 0.00;
    v_sale_payment_status payment_status;
BEGIN
    v_caller_auth_id := auth.uid();
    v_is_service_role := public.is_trusted_service_role();

    -- 1. Authorization & Tenant Context Resolution
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

        -- Branch Scope Enforcement
        IF v_caller_profile.role IN ('SUPER_ADMIN', 'ORG_ADMIN') THEN
            v_branch_id := COALESCE(NULLIF(p_sale_json->>'branchId', ''), v_caller_profile.branch_id);
        ELSE
            IF v_caller_profile.branch_id IS NOT NULL 
               AND p_sale_json->>'branchId' IS NOT NULL 
               AND (p_sale_json->>'branchId') <> v_caller_profile.branch_id THEN
                RAISE EXCEPTION 'Access Denied: User role % assigned to branch % cannot create sales for branch %',
                    v_caller_profile.role, v_caller_profile.branch_id, p_sale_json->>'branchId';
            END IF;
            v_branch_id := COALESCE(v_caller_profile.branch_id, NULLIF(p_sale_json->>'branchId', ''));
        END IF;
    ELSE
        -- Trusted service-role sync
        v_org_id := p_sale_json->>'organizationId';
        v_branch_id := p_sale_json->>'branchId';
        v_cashier_id := COALESCE(p_sale_json->>'cashierId', 'usr_system_sync');
        v_cashier_name := COALESCE(p_sale_json->>'cashierName', 'Cloud Service Sync');
    END IF;

    -- Verify branch belongs to authorized organization
    SELECT state_code INTO v_store_state_code
    FROM public.stores
    WHERE id = v_branch_id AND organization_id = v_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Branch % does not belong to authorized organization %', v_branch_id, v_org_id;
    END IF;

    v_sale_id := p_sale_json->>'id';
    IF v_sale_id IS NULL OR TRIM(v_sale_id) = '' THEN
        RAISE EXCEPTION 'Sale ID must be provided';
    END IF;

    v_idempotency_key := NULLIF(p_sale_json->>'idempotencyKey', '');
    v_customer_id := NULLIF(p_sale_json->>'customerId', '');
    v_client_grand_total := NULLIF((p_sale_json->>'grandTotal')::NUMERIC, NULL);

    -- 2. Customer Tenant Isolation Verification & State Code Resolution
    IF v_customer_id IS NOT NULL THEN
        SELECT state_code INTO v_customer_state_code
        FROM public.customers
        WHERE id = v_customer_id AND organization_id = v_org_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Customer % does not belong to authorized organization %', v_customer_id, v_org_id;
        END IF;
    END IF;

    -- 3. Idempotency Check with Multi-Tenant Isolation
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

    -- 4. Line Items Validation & Server-Authoritative Price/Tax Calculation
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

        -- Row-level lock on product prevents concurrent overselling race conditions
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

        -- AUTHORITATIVE PRICING: Derive unit price strictly from database record
        v_unit_price := v_prod_record.selling_price;

        -- Validate line discount: non-negative and capped at gross line value
        v_item_discount := GREATEST(0.00, COALESCE((v_item->>'discount')::NUMERIC, 0.00));
        IF v_item_discount > (v_qty * v_unit_price) THEN
            v_item_discount := (v_qty * v_unit_price);
        END IF;

        v_taxable_amount := ROUND((v_qty * v_unit_price) - v_item_discount, 2);
        v_gst_rate := COALESCE(v_prod_record.gst_rate, 0.00);

        -- Authoritative GST calculation: Inter-State (IGST) vs Intra-State (CGST + SGST)
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

        -- Decrement inventory strictly in same atomic transaction
        UPDATE public.products
        SET current_stock = current_stock - v_qty,
            updated_at = NOW()
        WHERE id = v_prod_id
        RETURNING current_stock INTO v_current_stock;

        -- Record immutable stock movement audit entry
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

    -- 5. Invoice-level Discount & Grand Total Verification
    v_total_discount := GREATEST(v_total_item_discounts, COALESCE((p_sale_json->>'totalDiscount')::NUMERIC, 0.00));
    IF v_total_discount > v_calculated_subtotal THEN
        v_total_discount := v_calculated_subtotal;
    END IF;

    v_calculated_grand_total := ROUND(v_calculated_subtotal - v_total_discount + v_calculated_tax + COALESCE((p_sale_json->>'roundingAdjustment')::NUMERIC, 0.00), 2);

    IF v_client_grand_total IS NOT NULL AND ABS(v_calculated_grand_total - v_client_grand_total) > 1.00 THEN
        RAISE EXCEPTION 'Grand total mismatch: calculated %, supplied %', v_calculated_grand_total, v_client_grand_total;
    END IF;

    -- 6. Payment Reconciliation & Status Derivation
    IF p_payments_json IS NOT NULL AND jsonb_typeof(p_payments_json) = 'array' THEN
        FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments_json)
        LOOP
            v_pay_amount := (v_payment->>'amount')::NUMERIC;
            IF v_pay_amount IS NULL OR v_pay_amount <= 0 THEN
                RAISE EXCEPTION 'Payment amount must be greater than zero';
            END IF;
            v_payment_sum := v_payment_sum + v_pay_amount;
            v_pay_method := (v_payment->>'method')::payment_method;

            -- Counter payment verification rules:
            -- 1. Counter physical CASH received by cashier is marked VERIFIED.
            -- 2. ALL electronic/gateway tenders (UPI, CARD, NET_BANKING, etc.) MUST be marked PENDING at sale creation.
            -- Client-supplied gatewayStatus is strictly ignored to prevent forgery!
            IF v_pay_method = 'CASH' THEN
                v_pay_status := 'VERIFIED';
                v_verified_paid := v_verified_paid + v_pay_amount;
            ELSE
                v_pay_status := 'PENDING';
            END IF;

            INSERT INTO public.payments (
                id, idempotency_key, sale_id, customer_id,
                method, amount, utr_or_ref, gateway_status, timestamp
            ) VALUES (
                COALESCE(v_payment->>'id', 'pay_' || v_sale_id || '_' || (v_payment->>'method')),
                COALESCE(v_payment->>'idempotencyKey', v_idempotency_key || '_' || (v_payment->>'method') || '_' || v_pay_amount),
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

    -- Reconcile payment totals & change returned
    IF v_payment_sum > v_calculated_grand_total THEN
        v_change_returned := ROUND(v_payment_sum - v_calculated_grand_total, 2);
        v_amount_paid := v_calculated_grand_total;
    ELSE
        v_change_returned := 0.00;
        v_amount_paid := v_payment_sum;
    END IF;

    v_unpaid_balance := GREATEST(0.00, ROUND(v_calculated_grand_total - v_payment_sum, 2));

    -- Derive sale payment status from verified payments vs pending gateway tenders
    IF v_verified_paid >= v_calculated_grand_total THEN
        v_sale_payment_status := 'PAID';
    ELSIF v_payment_sum >= v_calculated_grand_total THEN
        -- Full amount tendered, but pending gateway confirmation
        v_sale_payment_status := 'PENDING';
    ELSIF v_payment_sum > 0 THEN
        v_sale_payment_status := 'PARTIALLY_PAID';
    ELSE
        v_sale_payment_status := 'UNPAID';
    END IF;

    -- 7. Insert Sale Master Record (Storing authoritative server-calculated financials)
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
        (p_sale_json->>'primaryPaymentMethod')::payment_method,
        'SYNCED',
        COALESCE((p_sale_json->>'isOfflineCreated')::BOOLEAN, false)
    );

    -- 8. Insert Sale Items (Storing authoritative server-calculated line values)
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
            v_item->>'id',
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

    -- 9. Customer Ledger Update
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET total_orders_count = total_orders_count + 1,
            current_receivable_balance = current_receivable_balance + v_unpaid_balance,
            updated_at = NOW()
        WHERE id = v_customer_id;
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

-- ============================================================================
-- 3. SEPARATE PRIVILEGED GATEWAY CONFIRMATION WORKFLOW
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirm_gateway_payment_atomic(
    p_payment_id VARCHAR(64),
    p_utr_or_ref VARCHAR(128),
    p_provider_status VARCHAR(32) DEFAULT 'VERIFIED'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payment_record RECORD;
    v_sale_record RECORD;
    v_total_verified NUMERIC(12, 2);
BEGIN
    -- Only trusted service-role can confirm external electronic gateway payments
    IF NOT public.is_trusted_service_role() THEN
        RAISE EXCEPTION 'Access Denied: confirm_gateway_payment_atomic requires service_role credentials';
    END IF;

    IF p_payment_id IS NULL OR TRIM(p_payment_id) = '' THEN
        RAISE EXCEPTION 'Payment ID must be provided';
    END IF;

    SELECT * INTO v_payment_record
    FROM public.payments
    WHERE id = p_payment_id
    FOR UPDATE;

    IF v_payment_record IS NULL THEN
        RAISE EXCEPTION 'Payment % not found', p_payment_id;
    END IF;

    IF v_payment_record.gateway_status = 'VERIFIED' THEN
        RETURN jsonb_build_object('status', 'ALREADY_VERIFIED', 'payment_id', p_payment_id);
    END IF;

    UPDATE public.payments
    SET gateway_status = p_provider_status,
        utr_or_ref = COALESCE(p_utr_or_ref, utr_or_ref),
        timestamp = NOW()
    WHERE id = p_payment_id;

    -- If verified, reconcile parent sale status
    IF p_provider_status = 'VERIFIED' THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_total_verified
        FROM public.payments
        WHERE sale_id = v_payment_record.sale_id AND gateway_status = 'VERIFIED';

        SELECT * INTO v_sale_record
        FROM public.sales
        WHERE id = v_payment_record.sale_id
        FOR UPDATE;

        IF v_sale_record IS NOT NULL AND v_total_verified >= v_sale_record.grand_total THEN
            UPDATE public.sales
            SET payment_status = 'PAID'
            WHERE id = v_payment_record.sale_id;
        END IF;
    END IF;

    RETURN jsonb_build_object('status', 'SUCCESS', 'payment_id', p_payment_id);
END;
$$;

-- Revoke gateway confirmation from all client roles
REVOKE ALL ON FUNCTION public.confirm_gateway_payment_atomic(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_gateway_payment_atomic(VARCHAR, VARCHAR, VARCHAR) TO service_role;

-- Ensure execute grants on process_sale_atomic are preserved for authenticated counter users
GRANT EXECUTE ON FUNCTION public.process_sale_atomic(JSONB, JSONB, JSONB) TO authenticated, service_role;
