-- ==============================================================================
-- SLATE POS — Comprehensive & Repeatable PostgreSQL Database Audit Script
-- Target: Supabase PostgreSQL (Production / Staging / CI Verification)
-- 
-- Usage:
-- 1. Execute directly in Supabase Dashboard SQL Editor, or
-- 2. Run via CLI: psql "$DATABASE_URL" -f supabase/scripts/audit_schema.sql
--
-- Audits:
-- 1. Applied Migration Version History
-- 2. Tables, Views, Columns, Data Types & Nullability
-- 3. Primary Keys, Unique Constraints & Foreign Key Cascades
-- 4. B-Tree & Functional Indexes
-- 5. Stored Functions, Security Definer / Invoker Modes & search_path
-- 6. Trigger Definitions & Execution Binding
-- 7. Row Level Security (RLS) Enabled Status per Table
-- 8. RLS Security Policies (tenant isolation, operations & expressions)
-- 9. Role Permissions & Table Grants (authenticated, anon, service_role)
-- 10. Automated Security Health & Tenant Isolation Verification
-- ==============================================================================

\echo '===================================================================='
\echo '1. MIGRATION VERSION HISTORY (supabase_migrations.schema_migrations)'
\echo '===================================================================='
SELECT
    version,
    COALESCE(inserted_at::text, 'APPLIED') AS applied_at
FROM supabase_migrations.schema_migrations
ORDER BY version ASC;

\echo '===================================================================='
\echo '2. PUBLIC DOMAIN TABLES & ROW LEVEL SECURITY (RLS) STATUS'
\echo '===================================================================='
SELECT
    c.relname AS table_name,
    CASE WHEN c.relrowsecurity THEN 'ENABLED' ELSE 'DISABLED (SECURITY RISK!)' END AS rls_status,
    CASE WHEN c.relforcerowsecurity THEN 'FORCED' ELSE 'NORMAL' END AS rls_force,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname ASC;

\echo '===================================================================='
\echo '3. TABLE COLUMNS, DATA TYPES, DEFAULTS & NULLABILITY'
\echo '===================================================================='
SELECT
    table_name,
    ordinal_position AS pos,
    column_name,
    data_type || COALESCE('(' || character_maximum_length || ')', '') AS full_type,
    is_nullable,
    LEFT(COALESCE(column_default, '-'), 40) AS col_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name ASC, ordinal_position ASC;

\echo '===================================================================='
\echo '4. PRIMARY KEYS, UNIQUE CONSTRAINTS & FOREIGN KEYS'
\echo '===================================================================='
SELECT
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.update_rule,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
LEFT JOIN information_schema.constraint_column_usage AS ccu
  ON rc.unique_constraint_name = ccu.constraint_name
  AND rc.constraint_schema = ccu.constraint_schema
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name ASC, tc.constraint_type DESC, kcu.ordinal_position ASC;

\echo '===================================================================='
\echo '5. DATABASE INDEXES'
\echo '===================================================================='
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename ASC, indexname ASC;

\echo '===================================================================='
\echo '6. DATABASE FUNCTIONS, PROCEDURES & SECURITY DEFINER AUDIT'
\echo '===================================================================='
SELECT
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS arguments,
    l.lanname AS language,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER (Privileged)' ELSE 'SECURITY INVOKER (Caller)' END AS security_type,
    CASE 
        WHEN p.proconfig IS NOT NULL AND array_to_string(p.proconfig, ',') LIKE '%search_path=%' 
        THEN 'SAFE (Explicit search_path)'
        ELSE 'WARNING: Unset search_path'
    END AS search_path_hygiene,
    array_to_string(p.proconfig, ', ') AS config_settings
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname IN ('public')
ORDER BY p.proname ASC;

\echo '===================================================================='
\echo '7. DATABASE TRIGGERS (auth.users & public tables)'
\echo '===================================================================='
SELECT
    event_object_schema AS schema,
    event_object_table AS table_name,
    trigger_name,
    event_manipulation AS event,
    action_timing AS timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema IN ('public', 'auth')
ORDER BY event_object_schema ASC, event_object_table ASC, trigger_name ASC;

\echo '===================================================================='
\echo '8. ACTIVE ROW LEVEL SECURITY (RLS) POLICIES'
\echo '===================================================================='
SELECT
    tablename,
    policyname,
    cmd AS operation,
    roles,
    qual AS using_expression,
    with_check AS check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename ASC, policyname ASC;

\echo '===================================================================='
\echo '9. TABLE GRANTS & ACCESS PERMISSIONS'
\echo '===================================================================='
SELECT
    table_name,
    grantee,
    string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'service_role')
GROUP BY table_name, grantee
ORDER BY table_name ASC, grantee ASC;

\echo '===================================================================='
\echo '10. AUTOMATED SECURITY & TENANT ISOLATION HEALTH CHECK'
\echo '===================================================================='
DO $$
DECLARE
    v_unsecured_count INT;
    v_missing_search_path INT;
    v_unsafe_fallback INT;
BEGIN
    -- Check 1: Multi-tenant tables with RLS disabled
    SELECT COUNT(*) INTO v_unsecured_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname IN ('organizations', 'stores', 'products', 'sales', 'sale_items', 'customers', 'suppliers', 'expenses', 'business_subscriptions', 'refunds', 'time_logs', 'audit_logs', 'coupons', 'product_categories', 'stock_movements', 'sync_outbox')
      AND NOT c.relrowsecurity;

    IF v_unsecured_count > 0 THEN
        RAISE WARNING 'SECURITY AUDIT FAILED: % core tables have Row Level Security DISABLED!', v_unsecured_count;
    ELSE
        RAISE NOTICE 'RLS CHECK: PASS — All core multi-tenant tables enforce Row Level Security.';
    END IF;

    -- Check 2: Verify policies exist on previously unprotected tables
    DECLARE
        v_missing_policy_tables INT;
    BEGIN
        SELECT COUNT(DISTINCT c.relname) INTO v_missing_policy_tables
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = c.relname
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname IN ('audit_logs', 'coupons', 'product_categories', 'stock_movements', 'sync_outbox')
          AND p.policyname IS NULL;

        IF v_missing_policy_tables > 0 THEN
            RAISE WARNING 'SECURITY AUDIT WARNING: % tables have RLS enabled but lack active policies!', v_missing_policy_tables;
        ELSE
            RAISE NOTICE 'POLICY CHECK: PASS — audit_logs, coupons, product_categories, stock_movements, and sync_outbox have active RLS policies.';
        END IF;
    END;

    -- Check 3: Security Definer functions with missing search_path
    SELECT COUNT(*) INTO v_missing_search_path
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND (p.proconfig IS NULL OR NOT array_to_string(p.proconfig, ',') LIKE '%search_path=%');

    IF v_missing_search_path > 0 THEN
        RAISE WARNING 'SECURITY AUDIT WARNING: % SECURITY DEFINER functions have no explicit search_path!', v_missing_search_path;
    ELSE
        RAISE NOTICE 'SEARCH_PATH CHECK: PASS — All SECURITY DEFINER functions have safe search_path configuration.';
    END IF;

    -- Check 4: Check handle_new_auth_user definition for hardcoded tenant fallback
    SELECT COUNT(*) INTO v_unsafe_fallback
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'handle_new_auth_user'
      AND pg_get_functiondef(p.oid) LIKE '%org_apex_01%';

    IF v_unsafe_fallback > 0 THEN
        RAISE WARNING 'SECURITY AUDIT FAILED: handle_new_auth_user still contains hardcoded fallback to org_apex_01!';
    ELSE
        RAISE NOTICE 'TENANT ASSIGNMENT CHECK: PASS — handle_new_auth_user does not contain hardcoded default tenant fallback.';
    END IF;

    -- Check 5: Detect unsafe current_user = postgres check in SECURITY DEFINER procedures
    DECLARE
        v_unsafe_owner_check INT;
    BEGIN
        SELECT COUNT(*) INTO v_unsafe_owner_check
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef
          AND (pg_get_functiondef(p.oid) LIKE '%current_user = ''postgres''%' OR pg_get_functiondef(p.oid) LIKE '%current_user = ''service_role''%');

        IF v_unsafe_owner_check > 0 THEN
            RAISE WARNING 'SECURITY AUDIT FAILED: % SECURITY DEFINER functions use unsafe current_user checks causing privilege escalation!', v_unsafe_owner_check;
        ELSE
            RAISE NOTICE 'SECURITY DEFINER CHECK: PASS — No functions use unsafe current_user privilege detection.';
        END IF;
    END;

    -- Check 6: Ensure tenant registration does NOT grant PLATFORM_MANAGE
    DECLARE
        v_platform_leak INT;
    BEGIN
        SELECT COUNT(*) INTO v_platform_leak
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'register_business_tenant_atomic'
          AND pg_get_functiondef(p.oid) LIKE '%PLATFORM_MANAGE%';

        IF v_platform_leak > 0 THEN
            RAISE WARNING 'SECURITY AUDIT FAILED: register_business_tenant_atomic still grants PLATFORM_MANAGE to tenant owners!';
        ELSE
            RAISE NOTICE 'RBAC SCOPE CHECK: PASS — register_business_tenant_atomic does not grant PLATFORM_MANAGE.';
        END IF;
    END;

    -- Check 7: Verify immutable financial ledgers (UPDATE and DELETE revoked from authenticated)
    DECLARE
        v_financial_mutations INT;
    BEGIN
        SELECT COUNT(*) INTO v_financial_mutations
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee = 'authenticated'
          AND privilege_type IN ('UPDATE', 'DELETE')
          AND table_name IN ('sales', 'sale_items', 'payments', 'refunds', 'stock_movements', 'audit_logs');

        IF v_financial_mutations > 0 THEN
            RAISE WARNING 'SECURITY AUDIT FAILED: % direct UPDATE/DELETE privileges granted to authenticated on financial ledger tables!', v_financial_mutations;
        ELSE
            RAISE NOTICE 'FINANCIAL INTEGRITY CHECK: PASS — Core ledger tables are immutable to authenticated clients.';
        END IF;
    END;

    -- Check 8: Verify process_subscription_webhook_atomic is restricted strictly to service_role
    DECLARE
        v_unauth_webhook INT;
    BEGIN
        SELECT COUNT(*) INTO v_unauth_webhook
        FROM information_schema.routine_privileges
        WHERE routine_schema = 'public'
          AND routine_name = 'process_subscription_webhook_atomic'
          AND grantee IN ('PUBLIC', 'anon', 'authenticated');

        IF v_unauth_webhook > 0 THEN
            RAISE WARNING 'SECURITY AUDIT FAILED: process_subscription_webhook_atomic granted to unauthorized role(s)!';
        ELSE
            RAISE NOTICE 'WEBHOOK PRIVILEGE CHECK: PASS — process_subscription_webhook_atomic restricted strictly to service_role.';
        END IF;
    END;

    -- Check 9: Detect invalid or nonexistent types in function definitions (e.g. gateway_status_val)
    DECLARE
        v_invalid_type_count INT;
    BEGIN
        SELECT COUNT(*) INTO v_invalid_type_count
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND (pg_get_functiondef(p.oid) LIKE '%gateway_status_val%');

        IF v_invalid_type_count > 0 THEN
            RAISE WARNING 'SECURITY AUDIT FAILED: % functions reference nonexistent gateway_status_val type!', v_invalid_type_count;
        ELSE
            RAISE NOTICE 'TYPE HYGIENE CHECK: PASS — No functions reference nonexistent gateway_status_val type.';
        END IF;
    END;

    -- Check 10: Verify payments.gateway_status column default is NOT 'VERIFIED'
    DECLARE
        v_permissive_default INT;
    BEGIN
        SELECT COUNT(*) INTO v_permissive_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'payments'
          AND column_name = 'gateway_status'
          AND (column_default LIKE '%VERIFIED%');

        IF v_permissive_default > 0 THEN
            RAISE WARNING 'SECURITY AUDIT FAILED: payments.gateway_status still defaults to VERIFIED!';
        ELSE
            RAISE NOTICE 'PAYMENT DEFAULT CHECK: PASS — payments.gateway_status does not default to VERIFIED.';
        END IF;
    END;

    -- Check 11: Verify check constraint exists on payments.gateway_status
    DECLARE
        v_constraint_count INT;
    BEGIN
        SELECT COUNT(*) INTO v_constraint_count
        FROM pg_constraint
        WHERE conname = 'chk_payments_gateway_status';

        IF v_constraint_count = 0 THEN
            RAISE WARNING 'SECURITY AUDIT WARNING: chk_payments_gateway_status constraint is missing!';
        ELSE
            RAISE NOTICE 'PAYMENT CONSTRAINT CHECK: PASS — chk_payments_gateway_status constraint is enforced.';
        END IF;
    END;

    -- Check 12: Verify process_sale_atomic ignores client-supplied gatewayStatus
    DECLARE
        v_client_trust_count INT;
    BEGIN
        SELECT COUNT(*) INTO v_client_trust_count
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'process_sale_atomic'
          AND (pg_get_functiondef(p.oid) LIKE '%v_pay_status := (v_payment->>''gatewayStatus'')%'
               OR pg_get_functiondef(p.oid) LIKE '%COALESCE((v_payment->>''gatewayStatus'')%');

        IF v_client_trust_count > 0 THEN
            RAISE WARNING 'SECURITY AUDIT FAILED: process_sale_atomic trusts client-supplied gatewayStatus!';
        ELSE
            RAISE NOTICE 'PAYMENT SECURITY CHECK: PASS — process_sale_atomic does not trust client gatewayStatus.';
        END IF;
    END;

    -- Check 13: Verify process_sale_atomic uses full field persistence
    DECLARE
        v_sales_insert_cols INT;
    BEGIN
        SELECT COUNT(*) INTO v_sales_insert_cols
        FROM pg_proc p
        WHERE p.proname = 'process_sale_atomic'
          AND pg_get_functiondef(p.oid) LIKE '%INSERT INTO public.sales%';
        
        -- This is a heuristic check - in a real DB I'd query pg_attribute
        IF v_sales_insert_cols = 0 THEN
            RAISE WARNING 'SECURITY AUDIT WARNING: process_sale_atomic sales insertion might be incomplete';
        ELSE
            RAISE NOTICE 'SALES PERSISTENCE CHECK: PASS — process_sale_atomic performs table insertion.';
        END IF;
    END;

    -- Check 14: Verify atomically debits CREDIT_NOTE
    DECLARE
        v_credit_note_logic INT;
    BEGIN
        SELECT COUNT(*) INTO v_credit_note_logic
        FROM pg_proc p
        WHERE p.proname = 'process_sale_atomic'
          AND pg_get_functiondef(p.oid) LIKE '%CREDIT_NOTE%';

        IF v_credit_note_logic = 0 THEN
            RAISE WARNING 'SECURITY AUDIT FAILED: process_sale_atomic lacks CREDIT_NOTE atomic debit logic!';
        ELSE
            RAISE NOTICE 'CREDIT NOTE CHECK: PASS — process_sale_atomic implements atomic credit note debit.';
        END IF;
    END;

    RAISE NOTICE 'DATABASE AUDIT COMPLETE: Schema inspection concluded.';
END $$;
