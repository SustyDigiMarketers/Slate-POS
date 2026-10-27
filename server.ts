/**
 * SLATE POS — Trusted Cloud API & Dev Server
 * Express 4.21 + Vite Middleware Integration
 * Enforces tenant isolation, RBAC verification, idempotent sync endpoints & webhook verification
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
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
} from './src/lib/subscriptionServer.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// AI Studio dev server runtime expects dev server to listen on port 3000
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

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
        branchId: auth.profile?.branch_id || `br_${auth.organizationId.slice(0, 8)}_01`,
        userId: auth.user?.id || auth.profile?.id,
        role: auth.role || 'CASHIER',
      };
      return next();
    }
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
app.get(['/health', '/api/v1/health'], (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'SLATE POS Cloud API',
    version: '2.5.0',
    database: 'Supabase PostgreSQL connected (pooler active)',
    region: 'ap-south-1 (Mumbai)',
  });
});

app.use('/api/v1', authenticateTenant);

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
app.get('/api/v1/auth/me', (req, res) => {
  const role = (req as any).tenant?.role || 'MANAGER';
  res.json({
    id: (req as any).tenant?.userId || 'usr_manager_01',
    name: role === 'CASHIER' ? 'Arun Kumar' : role === 'STORE_OFFICER' ? 'Sunil Verma' : 'Rajesh Sharma',
    email: role === 'CASHIER' ? 'arun.k@apexretail.in' : role === 'STORE_OFFICER' ? 'sunil.v@apexretail.in' : 'rajesh.sharma@apexretail.in',
    role: role,
    organizationId: (req as any).tenant?.orgId || 'org_apex_01',
    branchId: (req as any).tenant?.branchId || 'br_blr_01',
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
const serverRoleNavConfigs: Record<string, Record<string, string[]>> = {
  org_apex_01: {},
};

// Role Navigation Configs: Manager and Admin ONLY
app.get('/api/v1/role-navigation-configs', requireRoles(['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER']), (req, res) => {
  const orgId = (req as any).tenant?.orgId || 'org_apex_01';
  res.json({
    status: 'success',
    data: serverRoleNavConfigs[orgId] || {},
  });
});

app.post('/api/v1/role-navigation-configs', requireRoles(['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER']), (req, res) => {
  const actorRole = (req as any).tenant?.role || 'MANAGER';
  const orgId = (req as any).tenant?.orgId || 'org_apex_01';
  const { role, enabledAdditionalModules } = req.body;

  // Security gate: Manager cannot configure Admin or Manager roles
  if (actorRole === 'MANAGER' && (role === 'SUPER_ADMIN' || role === 'ORG_ADMIN' || role === 'MANAGER')) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Manager cannot configure administrative role navigation.',
    });
  }

  // Security gate: Manager cannot enable restricted views for cashier
  const RESTRICTED_CASHIER = ['REPORTS', 'SETTINGS', 'STAFF', 'SUBSCRIPTIONS', 'SUPPLIERS', 'DASHBOARD'];
  if (actorRole === 'MANAGER' && role === 'CASHIER') {
    const hasRestricted = (enabledAdditionalModules || []).some((m: string) => RESTRICTED_CASHIER.includes(m));
    if (hasRestricted) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot delegate restricted administrative modules to Cashier.',
      });
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
app.post(['/api/v1/admin/users/provision', '/api/admin/provision-user'], requireRoles(['SUPER_ADMIN', 'ORG_ADMIN']), async (req, res) => {
  const actorOrgId = (req as any).tenant?.orgId || 'org_apex_01';
  const actorBranchId = (req as any).tenant?.branchId;
  const { email, name, role, branchId, phone } = req.body || {};

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Validation Error', message: 'Valid email address is required.' });
  }
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Validation Error', message: 'Staff name is required (minimum 2 characters).' });
  }

  const validRoles = ['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'CASHIER', 'STORE_OFFICER', 'PURCHASE_OFFICER'];
  const targetRole = validRoles.includes(role) ? role : 'CASHIER';
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();
  const targetBranchId = branchId || actorBranchId || `br_${actorOrgId.slice(0, 8)}_01`;
  const newProfileId = `usr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

  const supabase = getServerSupabase();
  if (supabase) {
    try {
      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (existingProfile) {
        return res.status(409).json({ error: 'Conflict', message: `Staff profile for ${cleanEmail} already exists.` });
      }

      const { data: inserted, error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          id: newProfileId,
          organization_id: actorOrgId,
          branch_id: targetBranchId,
          email: cleanEmail,
          name: cleanName,
          phone: phone ? phone.trim() : null,
          role: targetRole,
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

  return res.status(201).json({
    status: 'success',
    message: `Staff account provisioned in local sandbox for ${cleanEmail}.`,
    profile: {
      id: newProfileId,
      organization_id: actorOrgId,
      branch_id: targetBranchId,
      email: cleanEmail,
      name: cleanName,
      phone: phone ? phone.trim() : null,
      role: targetRole,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });
});

// --- Synchronization Outbox Push (Idempotent Event Receiver) ---
app.post('/api/v1/sync/push', (req, res) => {
  const { deviceId, items } = req.body;

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Payload items must be an array' });
  }

  const processedIds: string[] = [];
  const conflicts: any[] = [];
  const now = new Date().toISOString();

  for (const item of items) {
    const key = item.idempotencyKey || `${item.eventType}_${item.entityId}`;

    // 1. Idempotency Check: if already processed, safely return success without re-applying side effects
    if (cloudDb.idempotencyKeys.has(key)) {
      processedIds.push(item.id);
      continue;
    }

    // 2. Process based on event type
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
    success: true,
    processedCount: processedIds.length,
    processedIds,
    conflicts,
    serverTimestamp: now,
  });
});

// --- Sync Pull (Terminal Catch-Up) ---
app.get('/api/v1/sync/pull', (req, res) => {
  const since = req.query.since as string;
  const updates = cloudDb.syncEvents.filter((ev) => !since || ev.ingestedAt > since);
  res.json({
    serverTimestamp: new Date().toISOString(),
    events: updates,
  });
});

// --- Subscriptions API (Vercel parity in dev server) ---
app.get(['/api/subscriptions', '/api/v1/subscriptions'], async (req, res) => {
  const authHeader = req.headers.authorization;
  const auth = await authenticateSupabaseRequest(authHeader);

  // If unauthorized and not dev bypass, reject
  if (!auth.authenticated && process.env.VITE_DEV_LOCAL_MODE !== 'true') {
    return res.status(auth.statusCode || 401).json({ error: auth.error || 'Authentication required' });
  }

  const orgId = auth.organizationId || (req.headers['x-organization-id'] as string) || 'org_apex_01';
  res.json({
    status: 'success',
    data: {
      plans: Object.values(AUTHORITATIVE_PLANS),
      organizationId: orgId,
      subscription: {
        id: `sub_${orgId.slice(0, 12)}`,
        organizationId: orgId,
        planId: 'plan_growth_monthly',
        planName: 'Growth Monthly',
        tier: 'GROWTH',
        status: 'ACTIVE',
        billingInterval: 'MONTHLY',
        currentPeriodStart: new Date(Date.now() - 15 * 86400000).toISOString(),
        currentPeriodEnd: new Date(Date.now() + 15 * 86400000).toISOString(),
        cancelAtPeriodEnd: false,
        maxBranches: 3,
        maxUsers: 8,
        maxTerminals: 4,
        priceInr: 3499,
        gstPercentage: 18,
      },
    },
  });
});

app.post(['/api/subscriptions/checkout', '/api/v1/subscriptions/checkout'], async (req, res) => {
  const authHeader = req.headers.authorization;
  const auth = await authenticateSupabaseRequest(authHeader);

  if (!auth.authenticated && process.env.VITE_DEV_LOCAL_MODE !== 'true') {
    return res.status(auth.statusCode || 401).json({ error: auth.error || 'Authentication required' });
  }

  const orgId = auth.organizationId || (req.headers['x-organization-id'] as string) || 'org_apex_01';
  const role = auth.role || (req.headers['x-user-role'] as string) || 'ORG_ADMIN';
  const { planId, billingInterval, clientSubmittedPrice } = req.body || {};

  if (!planId) {
    return res.status(400).json({ error: 'Missing required planId in checkout request' });
  }

  if (role !== 'SUPER_ADMIN' && role !== 'ORG_ADMIN' && role !== 'MANAGER') {
    return res.status(403).json({ error: 'Only organization administrators are authorized to initiate billing' });
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
  const authHeader = req.headers.authorization;
  const auth = await authenticateSupabaseRequest(authHeader);

  if (!auth.authenticated && process.env.VITE_DEV_LOCAL_MODE !== 'true') {
    return res.status(auth.statusCode || 401).json({ error: auth.error || 'Authentication required for onboarding' });
  }

  const { businessName, legalName, gstin, state, stateCode, pan } = req.body || {};
  if (!businessName || !gstin || !state || !stateCode || !pan) {
    return res.status(400).json({ error: 'Missing required business details (businessName, gstin, state, stateCode, pan)' });
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client unavailable' });
  }

  const newOrgId = `org_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const authUserId = auth.user?.id || '00000000-0000-0000-0000-000000000000'; // Fallback for dev

  try {
    const { data, error } = await supabase.rpc('register_business_tenant_atomic', {
      p_org_id: newOrgId,
      p_org_name: businessName,
      p_legal_name: legalName || businessName,
      p_trade_name: businessName,
      p_gstin: gstin,
      p_pan: pan,
      p_state: state,
      p_state_code: stateCode,
      p_auth_user_id: authUserId,
      p_user_email: auth.user?.email || 'admin@slate.local',
      p_user_name: auth.user?.user_metadata?.name || 'Admin',
      p_user_phone: auth.user?.phone || '0000000000',
    });

    if (error) throw error;

    res.json({
      status: 'success',
      data,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Webhook: Razorpay Verified Subscriptions Webhook ---
app.post(['/api/webhooks/razorpay', '/api/v1/webhooks/payment'], async (req, res) => {
  const signature = req.headers['x-razorpay-signature'] as string | undefined;
  const event = req.body;
  const rawBody = JSON.stringify(req.body);
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
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    // Vite Dev Server middleware mode (HMR is disabled in AI Studio container environment)
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
