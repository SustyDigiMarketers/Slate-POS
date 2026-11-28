-- ==============================================================================
-- SLATE POS — Foundation Schema (Superseded by 20261019000000_slate_pos_schema.sql)
-- Migration: 20261010000000_slate_pos_schema.sql
-- Target: Supabase PostgreSQL
-- ==============================================================================
-- NOTE:
-- This initial prototype migration definition was superseded by the production-hardened
-- enterprise schema migration (20261019000000_slate_pos_schema.sql) which standardized
-- all tenant and branch identifiers as VARCHAR(64) and established the authoritative
-- multi-branch RBAC, Indian GST Council split (CGST/SGST/IGST), atomic inventory
-- deductions, and idempotent sync outbox.
--
-- Running both migrations with 'CREATE TABLE IF NOT EXISTS' on a fresh instance
-- would cause conflicting UUID primary keys on 'organizations' and 'branches'.
-- Therefore, this file initializes only the core extensions and safely delegates
-- authoritative table definitions to 20261019000000_slate_pos_schema.sql.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Notice: Core domain tables are defined authoritatively in:
-- supabase/migrations/20261019000000_slate_pos_schema.sql
