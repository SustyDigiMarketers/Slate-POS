/**
 * SLATE POS — Trusted Cloud API & Dev Server
 * Express 4.21 + Vite Middleware Integration
 * Enforces tenant isolation, RBAC verification, idempotent sync endpoints & webhook verification
 */

import express from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  AUTHORITATIVE_PLANS,
  resolveAuthoritativePlan,
  verifyWebhookSignature,
  isEventProcessed,
  recordProcessedEvent,
  transitionSubscriptionState,
  authenticateSupabaseRequest,
  createAuthoritativeRazorpayOrder,
  recordWebhookDurable,
  getServerSupabase,
} from './src/lib/subscriptionServer.ts';
import {
  canManageRoles,
  hasAnyPermission,
  hasPermission,
  toLegacyPermissions,
  type GranularPermission,
} from './src/lib/permissions.ts';
import {
  applySyncPushItems,
  pullIncrementalSyncData,
} from './src/lib/syncServer.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isProdServer =
  process.env.NODE_ENV === 'production' ||
  (process.env.NODE_ENV !== 'development' && fs.existsSync(path.resolve(__dirname, 'dist', 'index.html')));
const portArgIndex = process.argv.indexOf('--port');
const cliPort = portArgIndex !== -1 ? Number(process.argv[portArgIndex + 1]) : NaN;
// Dev server runs on port 3000; Cloud Run production respects injected PORT (defaulting to 3000)
const PORT = !Number.isNaN(cliPort)
  ? cliPort
  : isProdServer
  ? Number(process.env.PORT) || 3000
  : 3000;

app.use(
  express.json({
    limit: '10mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);

// In-memory central cloud database state (simulating Supabase PostgreSQL persistent records)
const cloudDb = {
  idempotencyKeys: new Set<string>(),
  syncEvents: [] as any[],
  sales: [] as any[],
  inventory: new Map<string, number>(),
  auditLogs: [] as any[],
};

// --- Middleware: Tenant & Auth Verification ---
const authenticateTenant = async (req: Request, res: Response, next: Function) => {
  const isProd = process.env.NODE_ENV === 'production' || process.env.VITE_APP_ENV === 'production';
  const authHeader = req.headers.authorization;

  // 1. If Bearer token is provided, verify using authoritative Supabase auth
  if (authHeader) {
    const auth = await authenticateSupabaseRequest(authHeader);
    if (auth.authenticated && auth.organizationId) {
      (req as any).tenant = {
        orgId: auth.organizationId,
        branchId: auth.profile?.branch_id || null,
        userId: auth.profile?.id || auth.user?.id,
        role: auth.role || 'CASHIER',
        profile: auth.profile,
      };
      return next();
    }
    return res.status(auth.statusCode || 401).json({
      error: 'Unauthorized',
      message: auth.error || 'Session expired or invalid.',
    });
  }

  // 2. In production/staging, unauthenticated access is strictly rejected
  if (isProd) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid Supabase authorization Bearer token is required. Client-controlled headers are not trusted.',
    });
  }

  // 3. Local Development Only: Allow sandbox testing when VITE_DEV_LOCAL_MODE=true
  if (process.env.VITE_DEV_LOCAL_MODE === 'true') {
    const role = (req.headers['x-user-role'] as string) || 'MANAGER';
    (req as any).tenant = {
      orgId: 'org_apex_01',
      branchId: 'br_blr_01',
      userId: 'usr_dev_manager',
      role,
    };
    return next();
  }

  return res.status(401).json({
    error: 'Unauthorized',
    message: 'Authentication token required.',
  });
};

// --- Health Check (Unauthenticated for liveness & readiness probes) ---
app.get(['/health', '/api/health', '/api/v1/health'], async (_req, res) => {
  const supabase = getServerSupabase();
  let databaseStatus: 'connected' | 'unconfigured' | 'error' = 'unconfigured';
  let accountingSchemaReady = false;
  let financialSchemaReady = false;
  const missingTables: string[] = [];

  if (supabase) {
    try {
      const { error } = await supabase.from('organizations').select('id').limit(1);
      if (error) {
        databaseStatus = 'error';
      } else {
        databaseStatus = 'connected';
        const checks = await Promise.all([
          supabase.from('chart_of_accounts').select('id').limit(1),
          supabase.from('bank_accounts').select('id').limit(1),
          supabase.from('supplier_bills').select('id').limit(1),
          supabase.from('customer_receipts').select('id').limit(1),
        ]);
        const tableNames = ['chart_of_accounts', 'bank_accounts', 'supplier_bills', 'customer_receipts'];
        checks.forEach((r, idx) => {
          if (r.error) missingTables.push(tableNames[idx]);
        });
        accountingSchemaReady = !checks[0].error;
        financialSchemaReady = !checks[1].error && !checks[2].error;
      }
    } catch {
      databaseStatus = 'error';
    }
  }

  res.status(databaseStatus === 'error' ? 503 : 200).json({
    status: databaseStatus === 'error' ? 'degraded' : 'healthy',
    timestamp: new Date().toISOString(),
    service: 'SLATE POS Finance & Accounting API',
    version: '3.1.0',
    database: databaseStatus,
    accountingSchemaReady,
    financialSchemaReady,
    missingTables,
  });
});

app.use('/api/v1', authenticateTenant);
app.use(['/api/auth-me', '/api/sync-push', '/api/sync-pull', '/api/provision-user', '/api/role-navigation', '/api/accounting'], authenticateTenant);

// --- RBAC Role Guard Middleware ---
const requireRoles = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: Function) => {
    const role = (req as any).tenant?.role || 'CASHIER';
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role ${role} is unauthorized to access this endpoint. Default deny enforced.`,
      });
    }
    next();
  };
};

// --- Auth Profile ---
app.get(['/api/v1/auth/me', '/api/auth-me'], (req, res) => {
  const tenant = (req as any).tenant;
  const profile = tenant?.profile;
  if (!profile) {
    if (!isProdServer && process.env.VITE_DEV_LOCAL_MODE === 'true') {
      const devRole = tenant?.role || 'MANAGER';
      return res.json({
        id: tenant?.userId || 'usr_dev_manager',
        name: 'Local Sandbox User',
        email: 'dev@slate.local',
        role: devRole,
        organizationId: tenant?.orgId || 'org_apex_01',
        branchId: tenant?.branchId || 'br_blr_01',
        permissions: toLegacyPermissions(devRole),
      });
    }
    return res.status(401).json({ error: 'Unauthorized', message: 'Active profile not found.' });
  }
  res.json({
    id: profile.id,
    userCode: profile.user_code || undefined,
    name: profile.name,
    email: profile.email,
    phone: profile.phone || '',
    role: profile.role,
    organizationId: profile.organization_id,
    branchId: profile.branch_id,
    permissions: toLegacyPermissions(profile.role),
  });
});

// --- RBAC Protected Endpoints ---
// Suppliers: Store Officer, Manager, Admin ONLY (Cashier blocked)
app.get('/api/v1/suppliers', requireRoles(['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'STORE_OFFICER', 'PURCHASE_OFFICER']), (req, res) => {
  res.json({ status: 'success', data: [] });
});

// Reports: Manager and Admin ONLY (Cashier and Store Officer blocked)
app.get('/api/v1/reports', requireRoles(['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER']), (req, res) => {
  res.json({ status: 'success', data: [] });
});

// Customers: Cashier, Manager, Admin ONLY (Store Officer blocked)
app.get('/api/v1/customers', requireRoles(['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  res.json({ status: 'success', data: [] });
});

// In-memory server store for role navigation configs (mirrors Supabase table)
const serverRoleNavConfigs: Record<string, Record<string, string[]>> = {};

// Role Navigation Configs: SUPER_ADMIN and ORG_ADMIN ONLY (MANAGER denied)
app.get(['/api/v1/role-navigation-configs', '/api/role-navigation'], requireRoles(['SUPER_ADMIN', 'ORG_ADMIN']), async (req, res) => {
  const orgId = (req as any).tenant?.orgId;
  if (!orgId) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Organization context missing.' });
  }
  const supabase = getServerSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('role_navigation_configs')
        .select('role, enabled_additional_modules')
        .eq('organization_id', orgId);
      if (error) {
        return res.status(500).json({ error: 'Database Error', message: error.message });
      }
      const mapped: Record<string, string[]> = {};
      for (const row of data || []) {
        mapped[row.role] = Array.isArray(row.enabled_additional_modules) ? row.enabled_additional_modules : [];
      }
      return res.json({ status: 'success', data: mapped });
    } catch (err: any) {
      return res.status(500).json({ error: 'Database Error', message: err.message });
    }
  }
  res.json({
    status: 'success',
    data: serverRoleNavConfigs[orgId] || {},
  });
});

app.post(['/api/v1/role-navigation-configs', '/api/role-navigation'], requireRoles(['SUPER_ADMIN', 'ORG_ADMIN']), async (req, res) => {
  const actorRole = (req as any).tenant?.role || '';
  const orgId = (req as any).tenant?.orgId;
  const { role, enabledAdditionalModules } = req.body || {};

  if (!canManageRoles(actorRole) || !orgId) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only Super Admins and Organization Admins may manage role navigation policies.',
    });
  }

  const validRoles = ['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'CASHIER', 'STORE_OFFICER', 'PURCHASE_OFFICER'];
  if (!role || !validRoles.includes(role) || !Array.isArray(enabledAdditionalModules)) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Valid target role and enabledAdditionalModules array are required.',
    });
  }

  // Security gate: Org Admin cannot configure Super Admin role
  if (actorRole === 'ORG_ADMIN' && role === 'SUPER_ADMIN') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Organization Admins cannot modify Super Admin navigation policies.',
    });
  }

  const RESTRICTED_CASHIER = [
    'REPORTS', 'REPORT_PL', 'REPORT_BS', 'REPORT_CF', 'REPORT_TB', 'REPORT_GL',
    'REPORT_AR', 'REPORT_AP', 'REPORT_GST', 'REPORT_AUDIT',
    'JOURNAL', 'BUDGETS', 'BULK_UPDATES', 'CHART_OF_ACCOUNTS', 'TRANSACTIONS',
    'SETTINGS', 'SETTINGS_BRANCHES', 'SETTINGS_FISCAL', 'STAFF', 'SUBSCRIPTIONS',
    'SUPPLIERS', 'PURCHASES', 'PURCHASE_ORDERS', 'DEBIT_NOTES', 'BANKING', 'DASHBOARD',
  ];
  const RESTRICTED_STORE_OFFICER = [
    'POS', 'CUSTOMERS', 'PAYMENTS', 'CREDIT_NOTES', 'SALES_RETURNS',
    'DASHBOARD', 'BANKING', 'JOURNAL', 'BUDGETS', 'BULK_UPDATES', 'CHART_OF_ACCOUNTS',
    'TRANSACTIONS', 'REPORTS', 'REPORT_PL', 'REPORT_BS', 'REPORT_CF', 'REPORT_TB',
    'REPORT_GL', 'REPORT_AR', 'REPORT_AP', 'REPORT_GST', 'REPORT_AUDIT',
    'SETTINGS', 'SETTINGS_BRANCHES', 'SETTINGS_FISCAL', 'STAFF', 'SUBSCRIPTIONS',
  ];

  if (role === 'CASHIER' && enabledAdditionalModules.some((m: string) => RESTRICTED_CASHIER.includes(m))) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Cannot delegate restricted administrative modules to Cashier.',
    });
  }

  if ((role === 'STORE_OFFICER' || role === 'PURCHASE_OFFICER') && enabledAdditionalModules.some((m: string) => RESTRICTED_STORE_OFFICER.includes(m))) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Cannot delegate restricted POS, accounting, or administrative modules to Store Officer.',
    });
  }

  const supabase = getServerSupabase();
  if (supabase) {
    try {
      const { error } = await supabase
        .from('role_navigation_configs')
        .upsert(
          {
            organization_id: orgId,
            role,
            enabled_additional_modules: enabledAdditionalModules || [],
            updated_by: (req as any).tenant?.profile?.name || (req as any).tenant?.userId || actorRole,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id,role' }
        );
      if (error) {
        return res.status(500).json({ error: 'Database Error', message: error.message });
      }
    } catch (err: any) {
      return res.status(500).json({ error: 'Database Error', message: err.message });
    }
  }

  if (!serverRoleNavConfigs[orgId]) {
    serverRoleNavConfigs[orgId] = {};
  }
  serverRoleNavConfigs[orgId][role] = enabledAdditionalModules || [];

  res.json({
    status: 'success',
    message: 'Role navigation configuration persisted successfully.',
    data: serverRoleNavConfigs[orgId],
  });
});

// --- Staff Provisioning: Super Admin & Org Admin ONLY ---
app.post(['/api/v1/admin/users/provision', '/api/admin/provision-user', '/api/provision-user'], requireRoles(['SUPER_ADMIN', 'ORG_ADMIN']), async (req, res) => {
  const actorOrgId = (req as any).tenant?.orgId;
  const actorRole = (req as any).tenant?.role;
  const actorBranchId = (req as any).tenant?.branchId;
  if (!actorOrgId) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Organization context missing.' });
  }
  const { email, name, role, branchId, phone } = req.body || {};

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Validation Error', message: 'Valid email address is required.' });
  }
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Validation Error', message: 'Staff name is required (minimum 2 characters).' });
  }

  const validRoles = ['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'CASHIER', 'STORE_OFFICER', 'PURCHASE_OFFICER'];
  const targetRole = validRoles.includes(role) ? role : 'CASHIER';

  if (targetRole === 'SUPER_ADMIN' && actorRole !== 'SUPER_ADMIN') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only Super Admins can provision SUPER_ADMIN accounts.',
    });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();
  let targetBranchId = typeof branchId === 'string' && branchId.trim() ? branchId.trim() : (actorBranchId || '');
  const newProfileId = `usr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const assignedPermissions = toLegacyPermissions(targetRole);

  const supabase = getServerSupabase();
  if (supabase) {
    try {
      if (targetBranchId) {
        const { data: branchRow } = await supabase
          .from('stores')
          .select('id, is_active')
          .eq('id', targetBranchId)
          .eq('organization_id', actorOrgId)
          .maybeSingle();

        if (!branchRow || branchRow.is_active === false) {
          return res.status(400).json({
            error: 'Validation Error',
            message: `Branch ${targetBranchId} does not belong to organization ${actorOrgId} or is inactive.`,
          });
        }
      } else {
        const { data: defaultBranch } = await supabase
          .from('stores')
          .select('id')
          .eq('organization_id', actorOrgId)
          .eq('is_active', true)
          .order('is_headquarters', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!defaultBranch?.id) {
          return res.status(400).json({
            error: 'Validation Error',
            message: `No active branch found for organization ${actorOrgId}.`,
          });
        }
        targetBranchId = defaultBranch.id;
      }

      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (existingProfile) {
        return res.status(409).json({ error: 'Conflict', message: `Staff profile for ${cleanEmail} already exists.` });
      }

      let generatedUserCode = '';
      for (let attempt = 0; attempt < 25; attempt++) {
        const candidate = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        const { data: dup } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('user_code', candidate)
          .maybeSingle();
        if (!dup) {
          generatedUserCode = candidate;
          break;
        }
      }
      if (!generatedUserCode) {
        return res.status(500).json({ error: 'Code Generation Error', message: 'Unable to allocate unique 6-digit user code.' });
      }

      const { data: inserted, error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          id: newProfileId,
          user_code: generatedUserCode,
          organization_id: actorOrgId,
          branch_id: targetBranchId,
          email: cleanEmail,
          name: cleanName,
          phone: phone ? String(phone).trim() : null,
          role: targetRole,
          permissions: assignedPermissions,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (insertError) {
        return res.status(500).json({ error: 'Database Error', message: insertError.message });
      }

      return res.status(201).json({
        status: 'success',
        message: `Staff account successfully provisioned for ${cleanEmail}.`,
        profile: inserted,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Internal Error', message: err.message });
    }
  }

  if (!isProdServer && process.env.VITE_DEV_LOCAL_MODE === 'true') {
    const devCode = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    return res.status(201).json({
      status: 'success',
      message: `Staff account provisioned in local sandbox for ${cleanEmail}.`,
      profile: {
        id: newProfileId,
        user_code: devCode,
        organization_id: actorOrgId,
        branch_id: targetBranchId || `br_${actorOrgId.slice(0, 8)}_01`,
        email: cleanEmail,
        name: cleanName,
        phone: phone ? String(phone).trim() : null,
        role: targetRole,
        permissions: assignedPermissions,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  }

  return res.status(503).json({
    error: 'Service Unavailable',
    message: 'Supabase server configuration is missing.',
  });
});

// --- Synchronization Outbox Push (Idempotent Event Receiver) ---
app.post(['/api/v1/sync/push', '/api/sync-push'], async (req, res) => {
  const { deviceId, items } = req.body || {};
  const tenant = (req as any).tenant;
  const orgId = tenant?.orgId || 'org_apex_01';
  const branchId = tenant?.branchId || null;

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Payload items must be an array' });
  }

  const processedIds: string[] = [];
  const conflicts: any[] = [];
  const now = new Date().toISOString();
  const supabase = getServerSupabase();

  if (supabase) {
    const result = await applySyncPushItems({
      supabase,
      orgId,
      defaultBranchId: branchId,
      role: tenant?.role,
      actorId: tenant?.profile?.id || tenant?.userId || null,
      actorName: tenant?.profile?.name || null,
      deviceId: deviceId || 'web_terminal',
      items,
    });

    const hasOnlyConflicts =
      result.processedIds.length === 0 &&
      result.conflicts.length > 0 &&
      result.conflicts.every((c) => c.code === 'CONFLICT');

    return res.status(hasOnlyConflicts ? 409 : 200).json({
      success: result.conflicts.length === 0,
      processedCount: result.processedIds.length,
      processedIds: result.processedIds,
      conflicts: result.conflicts,
      serverTimestamp: result.serverTimestamp,
    });
  }

  for (const item of items) {
    const key = item.idempotencyKey || `${item.eventType}_${item.entityId}`;

    // Local dev fallback when Supabase is not configured
    if (cloudDb.idempotencyKeys.has(key)) {
      processedIds.push(item.id);
      continue;
    }

    try {
      if (item.eventType === 'SALE_CREATED') {
        cloudDb.sales.push(item.payload);
        cloudDb.auditLogs.push({
          action: 'SYNC_SALE_INGESTED',
          entityId: item.entityId,
          deviceId,
          timestamp: now,
        });
      }

      cloudDb.idempotencyKeys.add(key);
      cloudDb.syncEvents.push({
        ...item,
        organizationId: orgId,
        ingestedAt: now,
        status: 'SYNCED',
      });
      processedIds.push(item.id);
    } catch (e: any) {
      conflicts.push({
        id: item.id,
        error: e.message || 'Processing failed',
      });
    }
  }

  res.json({
    success: conflicts.length === 0,
    processedCount: processedIds.length,
    processedIds,
    conflicts,
    serverTimestamp: now,
  });
});

// --- Sync Pull (Terminal Catch-Up) ---
app.get(['/api/v1/sync/pull', '/api/sync-pull'], async (req, res) => {
  const since = req.query.since as string | undefined;
  const tenant = (req as any).tenant;
  const orgId = tenant?.orgId || 'org_apex_01';
  const supabase = getServerSupabase();

  if (supabase) {
    try {
      const pulled = await pullIncrementalSyncData({
        supabase,
        orgId,
        role: tenant?.role,
        since,
      });
      return res.json(pulled);
    } catch {
      // Fallback below
    }
  }

  const updates = cloudDb.syncEvents.filter(
    (ev) => (!ev.organizationId || ev.organizationId === orgId) && (!since || ev.ingestedAt > since)
  );
  res.json({
    serverTimestamp: new Date().toISOString(),
    events: updates,
    entities: {},
  });
});

// --- Double-Entry Accounting Snapshot & Atomic Posting API (Vercel parity) ---
const ACCOUNTING_ACTION_PERMISSION_MAP: Record<string, GranularPermission> = {
  POST_JOURNAL: 'JOURNAL_MANAGE',
  REVERSE_JOURNAL: 'JOURNAL_MANAGE',
  CREATE_JOURNAL: 'JOURNAL_MANAGE',
  UPSERT_COA: 'COA_MANAGE',
  DELETE_COA: 'COA_MANAGE',
  TOGGLE_PERIOD_LOCK: 'FISCAL_MANAGE',
  UPSERT_BUDGET: 'BUDGETS_MANAGE',
  REVISE_BUDGET: 'BUDGETS_MANAGE',
  APPROVE_BUDGET: 'BUDGETS_APPROVE',
  SAVE_RECONCILIATION: 'BANKING_RECONCILE',
  RECORD_BULK_BATCH: 'BULK_UPDATES_MANAGE',
  CREATE_DEBIT_NOTE: 'DEBIT_NOTES_MANAGE',
  APPROVE_DEBIT_NOTE: 'DEBIT_NOTES_MANAGE',
  CANCEL_DEBIT_NOTE: 'DEBIT_NOTES_MANAGE',
};

function isServerSchemaMissingError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || err.details || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    code === '42703' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('could not find the')
  );
}

function mapServerPgError(err: any, fallbackMessage: string): { status: number; error: string; message: string } {
  const code = String(err?.code || '');
  const msg = String(err?.message || fallbackMessage);
  if (isServerSchemaMissingError(err)) return { status: 503, error: 'Schema Migration Pending', message: msg };
  if (code === '42501' || msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('permission denied')) {
    return { status: 403, error: 'Forbidden', message: msg };
  }
  if (code === '23505') return { status: 409, error: 'Duplicate Entry', message: msg };
  if (code === '23503' || code === '23502' || code === '23514' || code === '22P02') {
    return { status: 400, error: 'Validation Error', message: msg };
  }
  return { status: 500, error: 'Accounting Error', message: msg };
}

async function safeServerSelect(
  promise: PromiseLike<{ data: any; error: any }>,
  label: string,
  warnings: string[]
): Promise<any[]> {
  try {
    const res = await promise;
    if (res?.error) {
      warnings.push(`${label}: ${res.error.message}`);
      return [];
    }
    return Array.isArray(res?.data) ? res.data : [];
  } catch (err: any) {
    warnings.push(`${label}: ${err?.message || 'query error'}`);
    return [];
  }
}

app.get(['/api/v1/accounting', '/api/accounting'], async (req, res) => {
  const orgId = (req as any).tenant?.orgId;
  const actorRole = (req as any).tenant?.role;
  if (
    !hasAnyPermission(actorRole, [
      'COA_MANAGE',
      'JOURNAL_MANAGE',
      'BUDGETS_MANAGE',
      'REPORTS_FINANCIAL_VIEW',
      'AUDIT_VIEW',
      'BANKING_RECONCILE',
      'BULK_UPDATES_MANAGE',
      'DEBIT_NOTES_MANAGE',
      'FISCAL_MANAGE',
      'TRANSACTIONS_VIEW',
    ])
  ) {
    return res.status(403).json({ error: 'Forbidden', message: `Role ${actorRole} is unauthorized to access accounting APIs.` });
  }
  const supabase = getServerSupabase();
  if (!supabase || !orgId) {
    return res.status(503).json({ error: 'Database Unavailable', message: 'Supabase is not configured on this server.' });
  }
  const warnings: string[] = [];
  try {
    const canReadFinance = hasAnyPermission(actorRole, ['COA_MANAGE', 'JOURNAL_MANAGE', 'REPORTS_FINANCIAL_VIEW', 'TRANSACTIONS_VIEW']);
    const canReadBudgets = hasAnyPermission(actorRole, ['BUDGETS_MANAGE', 'REPORTS_FINANCIAL_VIEW']);
    const canReadRecon = hasPermission(actorRole, 'BANKING_RECONCILE');
    const canReadAudit = hasPermission(actorRole, 'AUDIT_VIEW');
    const canReadDebitNotes = hasPermission(actorRole, 'DEBIT_NOTES_MANAGE');
    const canReadBulk = hasPermission(actorRole, 'BULK_UPDATES_MANAGE');

    const [chartOfAccounts, accountingPeriods, journalEntries, generalLedger, budgets, bankReconciliations, financialAuditLogs, debitNotes, bulkImportBatches] =
      await Promise.all([
        canReadFinance ? safeServerSelect(supabase.from('chart_of_accounts').select('*').eq('organization_id', orgId).order('code'), 'chart_of_accounts', warnings) : Promise.resolve([]),
        canReadFinance || hasPermission(actorRole, 'FISCAL_MANAGE') ? safeServerSelect(supabase.from('accounting_periods').select('*').eq('organization_id', orgId).order('start_date'), 'accounting_periods', warnings) : Promise.resolve([]),
        canReadFinance ? safeServerSelect(supabase.from('journal_entries').select('*, journal_entry_lines(*)').eq('organization_id', orgId).order('entry_date', { ascending: false }).limit(200), 'journal_entries', warnings) : Promise.resolve([]),
        canReadFinance ? safeServerSelect(supabase.from('general_ledger').select('*').eq('organization_id', orgId).order('entry_date', { ascending: false }).limit(500), 'general_ledger', warnings) : Promise.resolve([]),
        canReadBudgets ? safeServerSelect(supabase.from('budgets').select('*, budget_lines(*)').eq('organization_id', orgId).order('created_at', { ascending: false }), 'budgets', warnings) : Promise.resolve([]),
        canReadRecon ? safeServerSelect(supabase.from('bank_reconciliations').select('*').eq('organization_id', orgId).order('statement_date', { ascending: false }).limit(50), 'bank_reconciliations', warnings) : Promise.resolve([]),
        canReadAudit ? safeServerSelect(supabase.from('financial_audit_logs').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(150), 'financial_audit_logs', warnings) : Promise.resolve([]),
        canReadDebitNotes ? safeServerSelect(supabase.from('debit_notes').select('*, debit_note_items(*)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(200), 'debit_notes', warnings) : Promise.resolve([]),
        canReadBulk ? safeServerSelect(supabase.from('bulk_import_batches').select('*, bulk_import_errors(*)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(100), 'bulk_import_batches', warnings) : Promise.resolve([]),
      ]);
    return res.json({
      status: 'success',
      data: {
        chartOfAccounts,
        accountingPeriods,
        journalEntries,
        generalLedger,
        budgets,
        bankReconciliations,
        financialAuditLogs,
        debitNotes,
        bulkImportBatches,
      },
      warnings,
    });
  } catch (err: any) {
    const mapped = mapServerPgError(err, 'Accounting query error.');
    return res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
  }
});

app.post(['/api/v1/accounting', '/api/accounting'], async (req, res) => {
  const orgId = (req as any).tenant?.orgId;
  const actorId = (req as any).tenant?.userId || 'system';
  const actorRole = (req as any).tenant?.role || '';
  const rawActorBranchId = (req as any).tenant?.branchId || null;
  const actorBranchId = rawActorBranchId && rawActorBranchId !== 'ALL' && rawActorBranchId !== 'main-branch' ? rawActorBranchId : null;
  const supabase = getServerSupabase();
  if (!supabase || !orgId) {
    return res.status(503).json({ error: 'Database Unavailable', message: 'Supabase is not configured on this server.' });
  }

  const { action, payload } = req.body || {};
  if (!action || typeof action !== 'string') {
    return res.status(400).json({ error: 'Validation Error', message: 'Action is required.' });
  }
  if (action === 'AUDIT_LOG') {
    if (!hasAnyPermission(actorRole, ['AUDIT_VIEW', 'JOURNAL_MANAGE', 'COA_MANAGE', 'BUDGETS_MANAGE', 'DEBIT_NOTES_MANAGE', 'BANKING_RECONCILE', 'BULK_UPDATES_MANAGE', 'FISCAL_MANAGE'])) {
      return res.status(403).json({ error: 'Forbidden', message: `Role ${actorRole} cannot write audit logs.` });
    }
  } else if (ACCOUNTING_ACTION_PERMISSION_MAP[action]) {
    if (!hasPermission(actorRole, ACCOUNTING_ACTION_PERMISSION_MAP[action])) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role ${actorRole} lacks permission ${ACCOUNTING_ACTION_PERMISSION_MAP[action]} for ${action}.`,
      });
    }
  } else {
    return res.status(400).json({ error: 'Unsupported Action', message: `Unknown accounting action: ${action}` });
  }

  if (payload?.branchId && payload.branchId !== 'ALL' && payload.branchId !== 'main-branch') {
    const { data: branchRow } = await supabase
      .from('stores')
      .select('id, is_active')
      .eq('id', payload.branchId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!branchRow || branchRow.is_active === false) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `Branch ${payload.branchId} does not belong to organization ${orgId} or is inactive.`,
      });
    }
  }

  try {
    if (action === 'POST_JOURNAL') {
      const journalId = payload?.journalId;
      if (!journalId) return res.status(400).json({ error: 'Validation Error', message: 'journalId is required.' });
      const { data: existing } = await supabase.from('journal_entries').select('id').eq('id', journalId).eq('organization_id', orgId).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'Not Found', message: 'Journal entry not found for this organization.' });
      const { data, error } = await supabase.rpc('post_journal_entry_atomic', { p_journal_id: journalId, p_actor_id: actorId });
      if (error) return res.status(400).json({ error: 'Posting Rejected', message: error.message });
      return res.json({ status: 'success', data });
    }

    if (action === 'REVERSE_JOURNAL') {
      const journalId = payload?.journalId;
      if (!journalId) return res.status(400).json({ error: 'Validation Error', message: 'journalId is required.' });
      const { data: existing } = await supabase.from('journal_entries').select('id').eq('id', journalId).eq('organization_id', orgId).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'Not Found', message: 'Journal entry not found for this organization.' });
      const { data, error } = await supabase.rpc('reverse_journal_entry_atomic', {
        p_journal_id: journalId,
        p_reason: payload?.reason || 'Reversal posted via API',
        p_actor_id: actorId,
      });
      if (error) return res.status(400).json({ error: 'Reversal Rejected', message: error.message });
      return res.json({ status: 'success', data });
    }

    if (action === 'UPSERT_COA') {
      const acct = payload;
      if (!acct?.id || !acct?.code || !acct?.name || !acct?.accountClass) {
        return res.status(400).json({ error: 'Validation Error', message: 'Missing required Chart of Accounts fields.' });
      }
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .upsert({
          id: acct.id,
          organization_id: orgId,
          branch_id: acct.branchId || 'ALL',
          code: acct.code,
          name: acct.name,
          account_class: acct.accountClass,
          account_group: acct.accountGroup || 'General',
          parent_account_id: acct.parentAccountId || null,
          parent_code: acct.parentCode || null,
          normal_balance: acct.normalBalance || (acct.accountClass === 'ASSET' || acct.accountClass === 'EXPENSE' ? 'DEBIT' : 'CREDIT'),
          opening_balance: Number(acct.openingBalance || 0),
          current_balance: Number(acct.currentBalance || 0),
          tax_applicable: Boolean(acct.taxApplicable),
          gst_tag: acct.gstTag && acct.gstTag !== 'NONE' ? acct.gstTag : null,
          is_system: Boolean(acct.isSystem),
          is_active: acct.isActive !== false,
          description: acct.description || null,
          updated_at: new Date().toISOString(),
        })
        .select('*')
        .single();
      if (error) throw error;
      return res.json({ status: 'success', data });
    }

    if (action === 'DELETE_COA') {
      const accountId = payload?.accountId;
      if (!accountId) return res.status(400).json({ error: 'Validation Error', message: 'accountId is required.' });
      const { data: acct } = await supabase.from('chart_of_accounts').select('id, is_system').eq('id', accountId).eq('organization_id', orgId).maybeSingle();
      if (!acct) return res.status(404).json({ error: 'Not Found', message: 'Ledger account not found.' });
      if (acct.is_system) return res.status(400).json({ error: 'Protected Account', message: 'System accounts cannot be deleted.' });
      const { count } = await supabase.from('general_ledger').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('account_id', accountId);
      if ((count || 0) > 0) return res.status(409).json({ error: 'Account In Use', message: 'Account has posted GL entries.' });
      const { error } = await supabase.from('chart_of_accounts').delete().eq('id', accountId).eq('organization_id', orgId);
      if (error) throw error;
      return res.json({ status: 'success', data: { deletedId: accountId } });
    }

    if (action === 'CREATE_JOURNAL') {
      const je = payload;
      if (!je?.id || !je?.journalNumber || !Array.isArray(je?.lines) || je.lines.length < 2) {
        return res.status(400).json({ error: 'Validation Error', message: 'Journal entry requires id, journalNumber, and at least 2 lines.' });
      }
      const totalDebit = Math.round(je.lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0) * 100) / 100;
      const totalCredit = Math.round(je.lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0) * 100) / 100;
      if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.009) {
        return res.status(400).json({ error: 'Unbalanced Journal', message: 'Debits must equal Credits and exceed zero.' });
      }
      const safeBranchId = je.branchId && je.branchId !== 'ALL' ? je.branchId : actorBranchId;
      const { error: jeErr } = await supabase.from('journal_entries').upsert({
        id: je.id,
        organization_id: orgId,
        branch_id: safeBranchId,
        journal_number: je.journalNumber,
        entry_date: je.entryDate || new Date().toISOString().slice(0, 10),
        reference_number: je.referenceNumber || null,
        narration: je.narration || 'Manual Journal Entry',
        status: 'DRAFT',
        source_type: je.sourceType || 'MANUAL_JOURNAL',
        source_id: je.sourceId || null,
        idempotency_key: je.idempotencyKey || null,
        total_debit: totalDebit,
        total_credit: totalCredit,
        created_by: actorId,
        created_by_name: je.createdByName || actorRole,
        updated_at: new Date().toISOString(),
      });
      if (jeErr) throw jeErr;
      await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', je.id);
      const { error: lineErr } = await supabase.from('journal_entry_lines').insert(
        je.lines.map((l: any, idx: number) => ({
          id: l.id || `${je.id}_l${idx + 1}`,
          journal_entry_id: je.id,
          organization_id: orgId,
          account_id: l.accountId,
          account_code: l.accountCode,
          account_name: l.accountName,
          description: l.description || null,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          party_type: l.partyType || null,
          party_id: l.partyId || null,
          party_name: l.partyName || null,
          line_order: idx + 1,
        }))
      );
      if (lineErr) throw lineErr;
      if (je.postImmediately) {
        const { data: posted, error: postErr } = await supabase.rpc('post_journal_entry_atomic', { p_journal_id: je.id, p_actor_id: actorId });
        if (postErr) return res.status(400).json({ error: 'Posting Rejected', message: postErr.message });
        return res.status(201).json({ status: 'success', data: posted });
      }
      return res.status(201).json({ status: 'success', data: { journalId: je.id, status: 'DRAFT' } });
    }

    if (action === 'TOGGLE_PERIOD_LOCK') {
      const { periodId, fiscalYear, name, startDate, endDate, lock } = payload || {};
      if (!periodId) return res.status(400).json({ error: 'Validation Error', message: 'periodId is required.' });
      const now = new Date().toISOString();
      const isLocked = Boolean(lock);
      const query = fiscalYear && name && startDate && endDate
        ? supabase.from('accounting_periods').upsert({
            id: periodId, organization_id: orgId, fiscal_year: fiscalYear, name, start_date: startDate, end_date: endDate,
            is_locked: isLocked, status: isLocked ? 'LOCKED' : 'OPEN', locked_by: isLocked ? actorId : null, locked_at: isLocked ? now : null, updated_at: now,
          }).select('*').single()
        : supabase.from('accounting_periods').update({
            is_locked: isLocked, status: isLocked ? 'LOCKED' : 'OPEN', locked_by: isLocked ? actorId : null, locked_at: isLocked ? now : null, updated_at: now,
          }).eq('id', periodId).eq('organization_id', orgId).select('*').maybeSingle();
      const { data, error } = await query;
      if (error) throw error;
      return res.json({ status: 'success', data });
    }

    if (action === 'UPSERT_BUDGET' || action === 'REVISE_BUDGET') {
      const b = payload;
      if (!b?.id || !b?.name || !b?.fiscalYear || !b?.startDate || !b?.endDate) {
        return res.status(400).json({ error: 'Validation Error', message: 'Missing required budget fields.' });
      }
      const { data: savedBudget, error: bErr } = await supabase.from('budgets').upsert({
        id: b.id, organization_id: orgId, branch_id: b.branchId || 'ALL', name: b.name, fiscal_year: b.fiscalYear,
        period_type: b.periodType || 'ANNUAL', start_date: b.startDate, end_date: b.endDate,
        status: action === 'REVISE_BUDGET' ? 'REVISED' : (b.status || 'DRAFT'),
        version: Array.isArray(b.revisions) ? b.revisions.length + 1 : 1,
        total_planned_revenue: Number(b.totalPlannedRevenue || 0),
        total_planned_expense: Number(b.totalPlannedExpense || 0),
        total_planned_capex: Number(b.totalPlannedCapex || 0),
        revisions: Array.isArray(b.revisions) ? b.revisions : [],
        created_by: b.createdBy || actorId,
        approved_by: b.approvedBy || null,
        approved_at: b.approvedAt || null,
        updated_at: new Date().toISOString(),
      }).select('*').single();
      if (bErr) throw bErr;
      await supabase.from('budget_lines').delete().eq('budget_id', b.id).eq('organization_id', orgId);
      if (Array.isArray(b.lines) && b.lines.length > 0) {
        const { error: blErr } = await supabase.from('budget_lines').insert(b.lines.map((l: any, idx: number) => ({
          id: l.id || `${b.id}_bl_${idx + 1}`, budget_id: b.id, organization_id: orgId, account_id: l.accountId,
          account_code: l.accountCode, account_name: l.accountName, account_class: l.accountClass,
          category: l.category || 'EXPENSE', period_label: b.periodType || 'ANNUAL', planned_amount: Number(l.plannedAmount || 0),
          notes: l.notes || null,
        })));
        if (blErr) throw blErr;
      }
      return res.json({ status: 'success', data: savedBudget });
    }

    if (action === 'APPROVE_BUDGET') {
      const budgetId = payload?.budgetId;
      if (!budgetId) return res.status(400).json({ error: 'Validation Error', message: 'budgetId is required.' });
      const now = new Date().toISOString();
      const { data, error } = await supabase.from('budgets').update({
        status: 'APPROVED', approved_by: actorId, approved_at: now, updated_at: now,
      }).eq('id', budgetId).eq('organization_id', orgId).select('*').maybeSingle();
      if (error) throw error;
      return res.json({ status: 'success', data });
    }

    if (action === 'SAVE_RECONCILIATION') {
      const r = payload;
      if (!r?.id || !r?.bankAccountId || !r?.statementDate) return res.status(400).json({ error: 'Validation Error', message: 'Missing reconciliation fields.' });
      const { data, error } = await supabase.from('bank_reconciliations').upsert({
        id: r.id, organization_id: orgId, branch_id: r.branchId && r.branchId !== 'ALL' ? r.branchId : null,
        bank_account_id: r.bankAccountId, bank_account_name: r.bankAccountName || 'Bank Account', statement_date: r.statementDate,
        statement_closing_balance: Number(r.statementClosingBalance || 0), book_closing_balance: Number(r.bookBalance ?? 0),
        cleared_balance: Number(r.clearedBalance || 0), difference: Number(r.variance ?? 0),
        matched_transaction_ids: Array.isArray(r.clearedTransactionIds) ? r.clearedTransactionIds : [],
        adjustment_journal_id: r.adjustmentJournalId || null, status: r.status || 'RECONCILED',
        notes: r.notes || null, reconciled_by: actorId,
      }).select('*').single();
      if (error) throw error;
      return res.json({ status: 'success', data });
    }

    if (action === 'RECORD_BULK_BATCH') {
      const b = payload;
      if (!b?.id || !b?.entityType || !b?.fileName) return res.status(400).json({ error: 'Validation Error', message: 'Missing bulk batch fields.' });
      const { data: savedBatch, error: batchErr } = await supabase.from('bulk_import_batches').upsert({
        id: b.id, organization_id: orgId, branch_id: b.branchId && b.branchId !== 'ALL' ? b.branchId : null,
        target: b.entityType, file_name: b.fileName, total_rows: Number(b.totalRows || 0), valid_rows: Number(b.validRows || 0),
        error_rows: Number(b.errorCount || 0), imported_rows: Number(b.importedRows || 0), updated_rows: Number(b.updatedRows || 0),
        skipped_duplicates: Number(b.skippedDuplicates || 0), status: b.status || 'COMMITTED',
        requires_approval: Boolean(b.requiresApproval), journal_entry_id: b.journalEntryId || null,
        created_by: actorId, approved_by: b.approvedBy || null, completed_at: new Date().toISOString(),
      }).select('*').single();
      if (batchErr) throw batchErr;
      return res.status(201).json({ status: 'success', data: savedBatch });
    }

    if (action === 'CREATE_DEBIT_NOTE') {
      const dn = payload;
      if (!dn?.id || !dn?.debitNoteNumber || !dn?.supplierId) return res.status(400).json({ error: 'Validation Error', message: 'Missing debit note fields.' });
      const cgst = Number(dn.cgstTotal || 0);
      const sgst = Number(dn.sgstTotal || 0);
      const igst = Number(dn.igstTotal || 0);
      const { data: savedDn, error: dnErr } = await supabase.from('debit_notes').upsert({
        id: dn.id, debit_note_number: dn.debitNoteNumber, organization_id: orgId,
        branch_id: dn.branchId && dn.branchId !== 'ALL' ? dn.branchId : null,
        supplier_id: dn.supplierId, supplier_name: dn.supplierName, supplier_gstin: dn.supplierGstin || null,
        supplier_bill_id: dn.supplierBillId || null, bill_number: dn.billNumber || null,
        subtotal: Number(dn.taxableTotal || 0), taxable_total: Number(dn.taxableTotal || 0),
        cgst_total: cgst, sgst_total: sgst, igst_total: igst, gst_total: cgst + sgst + igst,
        total_debit_amount: Number(dn.totalAmount || 0), reason: dn.reason || 'Purchase Return',
        notes: dn.notes || null, status: dn.status || 'ISSUED', reduce_inventory: Boolean(dn.deductInventory),
        issue_date: dn.issueDate || new Date().toISOString().slice(0, 10),
        journal_entry_id: dn.journalEntryId || null, journal_number: dn.journalNumber || null,
        created_by: actorId, updated_at: new Date().toISOString(),
      }).select('*').single();
      if (dnErr) throw dnErr;
      if (Array.isArray(dn.items) && dn.items.length > 0) {
        await supabase.from('debit_note_items').delete().eq('debit_note_id', dn.id).eq('organization_id', orgId);
        const { error: itemErr } = await supabase.from('debit_note_items').insert(dn.items.map((item: any, idx: number) => ({
          id: item.id || `${dn.id}_dni_${idx + 1}`, debit_note_id: dn.id, organization_id: orgId,
          product_id: item.productId, product_name: item.productName, sku: item.sku || null, hsn: item.hsn || null,
          quantity: Number(item.quantity || 1), unit_price: Number(item.unitPrice || 0), taxable_amount: Number(item.taxableAmount || 0),
          tax_rate: Number(item.gstRate || 0), cgst_amount: Number(item.cgstAmount || 0), sgst_amount: Number(item.sgstAmount || 0),
          igst_amount: Number(item.igstAmount || 0), tax_amount: Number(item.cgstAmount || 0) + Number(item.sgstAmount || 0) + Number(item.igstAmount || 0),
          total: Number(item.total || 0),
        })));
        if (itemErr) throw itemErr;
      }
      return res.status(201).json({ status: 'success', data: savedDn });
    }

      if (action === 'APPROVE_DEBIT_NOTE') {
        const debitNoteId = payload?.debitNoteId;
        if (!debitNoteId) return res.status(400).json({ error: 'Validation Error', message: 'debitNoteId is required.' });
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from('debit_notes')
          .update({ status: 'APPROVED', approved_by: actorId, approved_at: now, updated_at: now })
          .eq('id', debitNoteId)
          .eq('organization_id', orgId)
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return res.json({ status: 'success', data });
      }

      if (action === 'CANCEL_DEBIT_NOTE') {
        const debitNoteId = payload?.debitNoteId;
        if (!debitNoteId) return res.status(400).json({ error: 'Validation Error', message: 'debitNoteId is required.' });
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from('debit_notes')
          .update({ status: 'CANCELLED', cancelled_by: actorId, cancelled_at: now, cancel_reason: payload?.reason || 'Cancelled', updated_at: now })
          .eq('id', debitNoteId)
          .eq('organization_id', orgId)
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return res.json({ status: 'success', data });
      }

      if (action === 'AUDIT_LOG') {
      const entry = payload;
      if (!entry?.entityType || !entry?.entityId || !entry?.action || !entry?.summary) {
        return res.status(400).json({ error: 'Validation Error', message: 'Missing audit log fields.' });
      }
      const { data, error } = await supabase.from('financial_audit_logs').insert({
        id: entry.id || `fal_${Date.now().toString(36)}`,
        organization_id: orgId,
        branch_id: entry.branchId && entry.branchId !== 'ALL' && entry.branchId !== 'main-branch' ? entry.branchId : actorBranchId,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        action: entry.action,
        actor_id: actorId,
        actor_name: entry.actorName || actorRole,
        actor_role: actorRole,
        summary: entry.summary,
      }).select('*').single();
      if (error) throw error;
      return res.status(201).json({ status: 'success', data });
    }

    return res.status(400).json({ error: 'Unsupported Action', message: `Unknown accounting action: ${action}` });
  } catch (err: any) {
    const mapped = mapServerPgError(err, 'Failed to process accounting action.');
    return res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
  }
});

// --- Subscriptions API (Vercel parity in dev server) ---
app.get(['/api/subscriptions', '/api/v1/subscriptions'], async (req, res) => {
  const authHeader = req.headers.authorization;
  const auth = await authenticateSupabaseRequest(authHeader);

  if (!auth.authenticated || !auth.organizationId || !auth.role) {
    return res.status(auth.statusCode || 401).json({ error: auth.error || 'Authentication required' });
  }

  if (!hasPermission(auth.role, 'SUBSCRIPTIONS_VIEW')) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only Super Admins and Organization Admins are authorized to view subscription billing.',
    });
  }

  const orgId = auth.organizationId;
  const supabase = getServerSupabase();
  let currentSubscription: any = null;
  let invoices: any[] = [];

  if (supabase) {
    try {
      const { data: subData } = await supabase
        .from('business_subscriptions')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();
      if (subData) currentSubscription = subData;

      const { data: invoiceData } = await supabase
        .from('subscription_invoices')
        .select('*')
        .eq('organization_id', orgId)
        .order('paid_at', { ascending: false })
        .limit(10);
      if (invoiceData) invoices = invoiceData;
    } catch {
      // Fallback handled below
    }
  }

  if (!currentSubscription) {
    currentSubscription = {
      id: `pending_${orgId.slice(0, 12)}`,
      organizationId: orgId,
      planId: 'plan_starter_monthly',
      status: isProdServer ? 'NO_ACTIVE_SUBSCRIPTION' : 'TRIALING',
      billingInterval: 'MONTHLY',
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: isProdServer ? new Date().toISOString() : new Date(Date.now() + 14 * 86400000).toISOString(),
      cancelAtPeriodEnd: false,
      priceInr: 1499,
      gstPercentage: 18,
    };
  }

  res.json({
    status: 'success',
    data: {
      plans: Object.values(AUTHORITATIVE_PLANS),
      organizationId: orgId,
      subscription: currentSubscription,
      invoices,
    },
  });
});

app.post(['/api/subscriptions', '/api/subscriptions/checkout', '/api/v1/subscriptions/checkout'], async (req, res) => {
  const authHeader = req.headers.authorization;
  const auth = await authenticateSupabaseRequest(authHeader);

  if (!auth.authenticated || !auth.organizationId || !auth.role) {
    return res.status(auth.statusCode || 401).json({ error: auth.error || 'Authentication required' });
  }

  const orgId = auth.organizationId;
  const role = auth.role;
  const { planId, billingInterval, clientSubmittedPrice } = req.body || {};

  if (!planId) {
    return res.status(400).json({ error: 'Missing required planId in checkout request' });
  }

  if (!hasPermission(role, 'SUBSCRIPTIONS_MANAGE')) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only Super Admins and Organization Admins are authorized to initiate subscription billing.',
    });
  }

  const resolvedPlan = resolveAuthoritativePlan(planId, billingInterval || 'MONTHLY');
  if (!resolvedPlan) {
    return res.status(404).json({ error: 'Plan not found in authoritative catalog' });
  }

  if (clientSubmittedPrice !== undefined && clientSubmittedPrice !== resolvedPlan.basePriceInr) {
    return res.status(400).json({ error: 'Price tampering detected' });
  }

  const razorpayResult = await createAuthoritativeRazorpayOrder(
    resolvedPlan,
    orgId,
    auth.user?.email || 'billing@slate.local'
  );

  res.json({
    status: 'success',
    data: {
      orderId: razorpayResult.orderId,
      organizationId: orgId,
      plan: resolvedPlan,
      currency: 'INR',
      amount: resolvedPlan.totalAmountPaisa,
      displayAmount: resolvedPlan.totalAmountInr,
      keyId: process.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_placeholder_key',
      isMock: razorpayResult.isMock,
    },
  });
});

// --- Business Onboarding API ---
app.post(['/api/onboarding', '/api/v1/onboarding'], async (req, res) => {
  const isProd = process.env.NODE_ENV === 'production' || process.env.VITE_APP_ENV === 'production';
  const authHeader = req.headers.authorization;
  const auth = await authenticateSupabaseRequest(authHeader);

  if (!auth.authenticated && !(!isProd && process.env.VITE_DEV_LOCAL_MODE === 'true')) {
    return res.status(auth.statusCode || 401).json({ error: auth.error || 'Authentication required for onboarding' });
  }

  const {
    businessName,
    legalName,
    gstin,
    state,
    stateCode,
    pan,
    phone,
    planId,
    subscription_plan_id,
    subscriptionPlanId,
  } = req.body || {};

  if (!businessName || typeof businessName !== 'string' || businessName.trim().length < 2) {
    return res.status(400).json({ error: 'Validation Error', message: 'Business name is required (minimum 2 characters).' });
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return res.status(503).json({ error: 'Service Unavailable', message: 'Supabase server configuration is missing.' });
  }

  const newOrgId = `org_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const authUserId = auth.user?.id || '00000000-0000-0000-0000-000000000000';
  const rawGstin = (gstin || '').toString().trim().toUpperCase();
  const cleanGstin = rawGstin.length >= 15 ? rawGstin : null;
  const rawPan = (pan || '').toString().trim().toUpperCase();
  const cleanPan = rawPan.length >= 10 ? rawPan : (cleanGstin ? cleanGstin.substring(2, 12) : null);
  const cleanState = (state || 'Karnataka').toString().trim();
  const cleanStateCode = (stateCode && stateCode.toString().trim().length === 2)
    ? stateCode.toString().trim()
    : (cleanGstin ? cleanGstin.substring(0, 2) : '29');
  const cleanPhone = (phone || auth.user?.phone || '+91 98000 00000').toString().trim();
  const targetPlan = planId || subscription_plan_id || subscriptionPlanId || 'plan_starter_monthly';

  try {
    const { data, error } = await supabase.rpc('register_business_tenant_atomic', {
      p_org_id: newOrgId,
      p_org_name: businessName.trim(),
      p_legal_name: (legalName || businessName).toString().trim(),
      p_trade_name: businessName.trim(),
      p_gstin: cleanGstin,
      p_pan: cleanPan,
      p_state: cleanState,
      p_state_code: cleanStateCode,
      p_auth_user_id: authUserId,
      p_user_email: auth.user?.email || 'owner@business.in',
      p_user_name: auth.user?.user_metadata?.name || `${businessName.trim()} Admin`,
      p_user_phone: cleanPhone,
      p_initial_plan_id: targetPlan,
    });

    if (error) throw error;

    return res.json({
      status: 'success',
      data,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// --- Webhook: Razorpay Verified Subscriptions Webhook ---
app.post(['/api/webhook', '/api/webhooks/razorpay', '/api/v1/webhooks/payment'], async (req, res) => {
  const signature = req.headers['x-razorpay-signature'] as string | undefined;
  const event = req.body;
  const rawBody = typeof (req as any).rawBody === 'string' ? (req as any).rawBody : JSON.stringify(req.body);
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!event || !event.event) {
    return res.status(400).json({ error: 'Invalid webhook payload' });
  }

  // Fail closed if webhook secret is missing when validating live webhooks
  if (process.env.NODE_ENV === 'production' && !secret) {
    return res.status(500).json({ error: 'Server webhook secret unconfigured' });
  }

  if (secret && !verifyWebhookSignature(rawBody, signature, secret)) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const eventId =
    event.id ||
    event.payload?.payment?.entity?.id ||
    event.payload?.subscription?.entity?.id ||
    `wh_${Date.now()}`;

  const idempotency = await recordWebhookDurable(eventId, event.event, event);
  if (idempotency.alreadyProcessed || cloudDb.idempotencyKeys.has(eventId)) {
    return res.json({ status: 'already_processed', eventId });
  }

  cloudDb.idempotencyKeys.add(eventId);
  const transition = transitionSubscriptionState('PENDING', event.event);

  cloudDb.auditLogs.push({
    action: 'SUBSCRIPTION_WEBHOOK_PROCESSED',
    event: event.event,
    eventId,
    newStatus: transition.newStatus,
    timestamp: new Date().toISOString(),
  });

  res.json({
    status: 'success',
    received: true,
    eventId,
    subscriptionStatus: transition.newStatus,
  });
});

// --- Server Lifecycle & Vite Middleware Mount ---
async function startServer() {
  if (!isProdServer) {
    // Vite Dev Server middleware mode (HMR is disabled in AI Studio container environment)
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static files
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SLATE POS backend server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting SLATE POS server:', err);
  process.exit(1);
});
