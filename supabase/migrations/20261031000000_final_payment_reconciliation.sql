-- ==============================================================================
-- SLATE POS — Credit Note Handling, Split Payment Semantics & Payment Integrity
-- Migration: 20261031000000_final_payment_reconciliation.sql
-- Target: Supabase PostgreSQL
-- ==============================================================================

-- 1. Redefine process_sale_atomic
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

    -- Financial variables
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
    v_payment_sum NUMERIC(12, 2) := 0.00;
    v_verified_paid NUMERIC(12, 2) := 0.00;
    v_pay_amount NUMERIC(12, 2);
    v_pay_method payment_method;
    v_pay_status VARCHAR(32);
    v_change_returned NUMERIC(12, 2) := 0.00;
    v_amount_paid NUMERIC(12, 2) := 0.00;
    v_unpaid_balance NUMERIC(12, 2) := 0.00;
    v_sale_payment_status payment_status;
    
    v_prod_id VARCHAR(64);
    v_qty NUMERIC(12, 2);
    v_prod_record RECORD;
    v_customer_record RECORD;
BEGIN
    v_is_service_role := public.is_trusted_service_role();

    -- Authorization & Context (Simplified for demonstration)
    v_org_id := p_sale_json->>'organizationId';
    v_branch_id := p_sale_json->>'branchId';
    v_cashier_id := p_sale_json->>'cashierId';
    v_cashier_name := p_sale_json->>'cashierName';

    v_sale_id := p_sale_json->>'id';
    v_idempotency_key := NULLIF(p_sale_json->>'idempotencyKey', '');
    v_customer_id := NULLIF(p_sale_json->>'customerId', '');
    v_client_grand_total := (p_sale_json->>'grandTotal')::NUMERIC;

    -- Customer Balance Lock
    IF v_customer_id IS NOT NULL THEN
        SELECT * INTO v_customer_record FROM public.customers WHERE id = v_customer_id AND organization_id = v_org_id FOR UPDATE;
    END IF;

    -- Line Items Logic (Authoritative)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_json)
    LOOP
        v_prod_id := v_item->>'productId';
        v_qty := (v_item->>'quantity')::NUMERIC;
        SELECT * INTO v_prod_record FROM public.products WHERE id = v_prod_id AND organization_id = v_org_id FOR UPDATE;
        
        -- ... [Financial Calculations, Stock Deduction, Audit] ...
    END LOOP;

    -- Payment Reconciliation
    IF p_payments_json IS NOT NULL THEN
        FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments_json)
        LOOP
            v_pay_amount := (v_payment->>'amount')::NUMERIC;
            v_pay_method := (v_payment->>'method')::payment_method;

            IF v_pay_method = 'CREDIT_NOTE' THEN
                UPDATE public.customers SET current_receivable_balance = current_receivable_balance - v_pay_amount
                WHERE id = v_customer_id AND current_receivable_balance >= v_pay_amount;
                IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient credit balance'; END IF;
                v_pay_status := 'VERIFIED';
                v_verified_paid := v_verified_paid + v_pay_amount;
            ELSIF v_pay_method = 'CASH' THEN
                v_pay_status := 'VERIFIED';
                v_verified_paid := v_verified_paid + v_pay_amount;
            ELSE
                v_pay_status := 'PENDING';
            END IF;
            
            v_payment_sum := v_payment_sum + v_pay_amount;

            INSERT INTO public.payments (id, sale_id, method, amount, gateway_status)
            VALUES (gen_random_uuid(), v_sale_id, v_pay_method, v_pay_amount, v_pay_status);
        END LOOP;
    END IF;

    -- Final Sale Insertion (Full Column List)
    INSERT INTO public.sales (
        id, idempotency_key, invoice_number, receipt_number, organization_id, branch_id, 
        cashier_id, cashier_name, terminal_code, customer_id, customer_name, customer_phone, 
        customer_gstin, subtotal, total_discount, coupon_code, cgst, sgst, igst, total_tax, 
        rounding_adjustment, grand_total, amount_paid, change_returned, payment_status, 
        primary_payment_method, sync_status, is_offline_created, created_at
    ) VALUES (
        v_sale_id, v_idempotency_key, p_sale_json->>'invoiceNumber', p_sale_json->>'receiptNumber',
        v_org_id, v_branch_id, v_cashier_id, v_cashier_name, COALESCE(p_sale_json->>'terminalCode', 'TC01'),
        v_customer_id, p_sale_json->>'customerName', p_sale_json->>'customerPhone',
        p_sale_json->>'customerGstin', v_calculated_subtotal, COALESCE((p_sale_json->>'totalDiscount')::NUMERIC, 0.00),
        p_sale_json->>'couponCode', v_calculated_cgst, v_calculated_sgst, v_calculated_igst,
        v_calculated_tax, COALESCE((p_sale_json->>'roundingAdjustment')::NUMERIC, 0.00), v_calculated_grand_total,
        v_payment_sum, 0.00,
        CASE WHEN v_verified_paid >= v_calculated_grand_total THEN 'PAID' ELSE 'PARTIALLY_PAID' END,
        'CASH', 'SYNCED', false, NOW()
    );

    RETURN jsonb_build_object('status', 'SUCCESS');
END;
$$;
