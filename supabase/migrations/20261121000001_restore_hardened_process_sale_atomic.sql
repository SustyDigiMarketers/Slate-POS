-- ==============================================================================
-- SLATE POS — Additive Migration: Restore Full Hardened process_sale_atomic
-- Migration: 20261121000001_restore_hardened_process_sale_atomic.sql
--
-- Purpose:
-- Migration 20261031000000_final_payment_reconciliation.sql replaced process_sale_atomic
-- with an abbreviated version missing auth.uid() caller checks, branch scoping,
-- server-authoritative pricing/GST computation, stock deduction, stock_movements,
-- and sale_items persistence. This additive migration restores ALL hardened
-- security & accounting guarantees from 20261029000000 while retaining
-- CREDIT_NOTE & CREDIT receivable semantics cleanly.
-- ==============================================================================

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

    -- Verify branch belongs to authorized organization and resolve GST state_code from organizations
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

    -- 2. Customer Tenant Isolation Verification & Row Lock
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

    -- 4. Line Items Validation & Authoritative Financial/Inventory Update
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

    -- 5. Invoice-level Discount & Grand Total Verification
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

    -- 6. Payment Reconciliation & Status Derivation
    IF p_payments_json IS NOT NULL AND jsonb_typeof(p_payments_json) = 'array' THEN
        FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments_json)
        LOOP
            v_pay_amount := (v_payment->>'amount')::NUMERIC;
            IF v_pay_amount IS NULL OR v_pay_amount <= 0 THEN
                RAISE EXCEPTION 'Payment amount must be greater than zero';
            END IF;

            v_pay_method_text := COALESCE(UPPER(TRIM(v_payment->>'method')), 'CASH');
            IF v_pay_method_text = 'CREDIT' THEN
                -- On-account credit sale: no tender settled yet; receivable balance increases below
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

    -- 7. Insert Sale Master Record
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

    -- 8. Insert Authoritative Sale Items
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

    -- 9. Customer Ledger Update
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
