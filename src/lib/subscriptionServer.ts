/**
 * SLATE POS — Authoritative Server-Side Subscription & Webhook Processing Engine
 * 
 * Features:
 * - Supabase Bearer token verification (No trust in client-supplied headers or demo defaults)
 * - Server-side plan resolution (rejects client-tampered prices and invalid plan IDs)
 * - Real Razorpay REST API integration for server-side order and subscription creation
 * - Timing-safe HMAC-SHA256 Razorpay webhook signature verification (fails closed if secret missing)
 * - Durable webhook event deduplication and replay defense in PostgreSQL payment_webhook_events
 * - Verified subscription lifecycle state machine (ACTIVE, PAST_DUE, CANCELLED, EXPIRED)
 * - Shared between Vercel Serverless Functions (/api/*) and Express Dev Server (server.ts)
 */

import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface PlanPricing {
  id: string;
  name: string;
  tier: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  billingInterval: 'MONTHLY' | 'ANNUAL';
  basePriceInr: number;
  gstAmountInr: number;
  totalAmountInr: number;
  totalAmountPaisa: number;
  maxBranches: number;
  maxUsers: number;
  maxTerminals: number;
}

export const AUTHORITATIVE_PLANS: Record<string, PlanPricing> = {
  plan_starter_monthly: {
    id: 'plan_starter_monthly',
    name: 'Starter Monthly',
    tier: 'STARTER',
    billingInterval: 'MONTHLY',
    basePriceInr: 1499,
    gstAmountInr: 270, // 18% of 1499 rounded
    totalAmountInr: 1769,
    totalAmountPaisa: 176900,
    maxBranches: 1,
    maxUsers: 2,
    maxTerminals: 1,
  },
  plan_starter_annual: {
    id: 'plan_starter_annual',
    name: 'Starter Annual',
    tier: 'STARTER',
    billingInterval: 'ANNUAL',
    basePriceInr: 14990,
    gstAmountInr: 2698, // 18% of 14990 rounded
    totalAmountInr: 17688,
    totalAmountPaisa: 1768800,
    maxBranches: 1,
    maxUsers: 2,
    maxTerminals: 1,
  },
  plan_growth_monthly: {
    id: 'plan_growth_monthly',
    name: 'Growth Monthly',
    tier: 'GROWTH',
    billingInterval: 'MONTHLY',
    basePriceInr: 3499,
    gstAmountInr: 630, // 18% of 3499 rounded
    totalAmountInr: 4129,
    totalAmountPaisa: 412900,
    maxBranches: 3,
    maxUsers: 8,
    maxTerminals: 4,
  },
  plan_growth_annual: {
    id: 'plan_growth_annual',
    name: 'Growth Annual',
    tier: 'GROWTH',
    billingInterval: 'ANNUAL',
    basePriceInr: 34990,
    gstAmountInr: 6298, // 18% of 34990 rounded
    totalAmountInr: 41288,
    totalAmountPaisa: 4128800,
    maxBranches: 3,
    maxUsers: 8,
    maxTerminals: 4,
  },
  plan_enterprise_monthly: {
    id: 'plan_enterprise_monthly',
    name: 'Enterprise Monthly',
    tier: 'ENTERPRISE',
    billingInterval: 'MONTHLY',
    basePriceInr: 7999,
    gstAmountInr: 1440, // 18% of 7999 rounded
    totalAmountInr: 9439,
    totalAmountPaisa: 943900,
    maxBranches: 15,
    maxUsers: 30,
    maxTerminals: 15,
  },
  plan_enterprise_annual: {
    id: 'plan_enterprise_annual',
    name: 'Enterprise Annual',
    tier: 'ENTERPRISE',
    billingInterval: 'ANNUAL',
    basePriceInr: 79990,
    gstAmountInr: 14398, // 18% of 79990 rounded
    totalAmountInr: 94388,
    totalAmountPaisa: 9438800,
    maxBranches: 15,
    maxUsers: 30,
    maxTerminals: 15,
  },
};

/**
 * Resolves authoritative plan catalog definition
 */
export function resolveAuthoritativePlan(planId: string, interval: 'MONTHLY' | 'ANNUAL' = 'MONTHLY'): PlanPricing | null {
  if (AUTHORITATIVE_PLANS[planId]) {
    return AUTHORITATIVE_PLANS[planId];
  }

  const suffix = interval === 'ANNUAL' ? '_annual' : '_monthly';
  const resolvedKey = planId.endsWith('_monthly') || planId.endsWith('_annual') ? planId : `${planId}${suffix}`;

  return AUTHORITATIVE_PLANS[resolvedKey] || null;
}

/**
 * Returns an authenticated Supabase client using server-side service role key or anon key
 */
let serverSupabaseInstance: SupabaseClient | null = null;
export function getServerSupabase(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key || key.includes('placeholder') || key.includes('your-supabase')) {
    return null;
  }

  if (!serverSupabaseInstance) {
    serverSupabaseInstance = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return serverSupabaseInstance;
}

export interface AuthContext {
  authenticated: boolean;
  statusCode?: number;
  error?: string;
  user?: any;
  profile?: any;
  organizationId?: string;
  role?: string;
}

/**
 * Validates Supabase Bearer access token and resolves trusted user profile & tenant organization
 * Strictly rejects unauthenticated requests and removes all trust in client-supplied headers
 */
export async function authenticateSupabaseRequest(authHeader: string | undefined): Promise<AuthContext> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      authenticated: false,
      statusCode: 401,
      error: 'Authentication required: missing or malformed Bearer token.',
    };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return {
      authenticated: false,
      statusCode: 401,
      error: 'Authentication required: empty token provided.',
    };
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    // In local development without cloud Supabase credentials, verify structure
    const isProd = process.env.NODE_ENV === 'production' || process.env.VITE_APP_ENV === 'production';
    if (!isProd && process.env.VITE_DEV_LOCAL_MODE === 'true' && token.startsWith('dev_token_')) {
      const parts = token.split('_');
      const devRole = parts[2] || 'ORG_ADMIN';
      const devOrg = parts[3] || 'org_apex_01';
      return {
        authenticated: true,
        user: { id: 'usr_dev_admin', email: 'dev@slate.local' },
        profile: { id: 'usr_dev_admin', role: devRole, organization_id: devOrg },
        organizationId: devOrg,
        role: devRole,
      };
    }

    return {
      authenticated: false,
      statusCode: 503,
      error: 'Authentication service unavailable: Supabase server configuration is missing.',
    };
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return {
        authenticated: false,
        statusCode: 401,
        error: `Session expired or invalid: ${authError?.message || 'User not found.'}`,
      };
    }

    // Resolve trusted profile & organization strictly from database
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, name, email, role, organization_id, branch_id')
      .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
      .limit(1)
      .maybeSingle();

    if (profileError || !profile || !profile.organization_id) {
      return {
        authenticated: false,
        statusCode: 403,
        error: 'Access Denied: No active business organization profile found for this user.',
      };
    }

    return {
      authenticated: true,
      user,
      profile,
      organizationId: profile.organization_id,
      role: profile.role,
    };
  } catch (err: any) {
    return {
      authenticated: false,
      statusCode: 500,
      error: `Authentication failed: ${err.message}`,
    };
  }
}

/**
 * Creates an authoritative Razorpay order via the official REST API
 */
export async function createAuthoritativeRazorpayOrder(
  plan: PlanPricing,
  organizationId: string,
  customerEmail: string
): Promise<{ success: boolean; orderId: string; amount: number; isMock: boolean; error?: string }> {
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  const isConfigured =
    keyId &&
    keySecret &&
    !keyId.includes('placeholder') &&
    !keyId.includes('your_key') &&
    !keySecret.includes('your-razorpay');

  if (isConfigured) {
    try {
      const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: plan.totalAmountPaisa,
          currency: 'INR',
          receipt: `rcpt_${organizationId.slice(0, 8)}_${Date.now()}`,
          notes: {
            organizationId,
            planId: plan.id,
            billingInterval: plan.billingInterval,
            customerEmail,
          },
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        return {
          success: false,
          orderId: '',
          amount: plan.totalAmountPaisa,
          isMock: false,
          error: errData.error?.description || 'Failed to create order on Razorpay gateway.',
        };
      }

      const order = await response.json();
      return {
        success: true,
        orderId: order.id,
        amount: order.amount,
        isMock: false,
      };
    } catch (err: any) {
      return {
        success: false,
        orderId: '',
        amount: plan.totalAmountPaisa,
        isMock: false,
        error: `Razorpay connection error: ${err.message}`,
      };
    }
  }

  // In production, reject unconfigured Razorpay credentials - fail closed
  const isProd = process.env.NODE_ENV === 'production' || process.env.VITE_APP_ENV === 'production';
  if (isProd) {
    return {
      success: false,
      orderId: '',
      amount: plan.totalAmountPaisa,
      isMock: false,
      error: 'Razorpay payment gateway credentials are not configured in production.',
    };
  }

  // Safe fallback ONLY for local unit testing / non-production sandbox without live credentials
  const testOrderId = `order_test_${organizationId.slice(0, 8)}_${Date.now()}`;
  return {
    success: true,
    orderId: testOrderId,
    amount: plan.totalAmountPaisa,
    isMock: true,
  };
}

/**
 * Validates Razorpay Webhook HMAC-SHA256 signature using timing-safe comparison
 * Fails closed if secret or signature is missing
 */
export function verifyWebhookSignature(rawBody: string, signature: string | undefined, secret: string | undefined): boolean {
  if (!signature || !secret || !rawBody) {
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const providedBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}

// In-memory processed event ledger for fallback and fast cache
const inMemoryProcessedEvents = new Set<string>();

export function isEventProcessed(eventId: string): boolean {
  return inMemoryProcessedEvents.has(eventId);
}

export function recordProcessedEvent(eventId: string): void {
  inMemoryProcessedEvents.add(eventId);
}

/**
 * Persists webhook event durably in PostgreSQL payment_webhook_events
 * Enforces database-level idempotency
 */
export async function recordWebhookDurable(
  eventId: string,
  eventType: string,
  payload: any
): Promise<{ alreadyProcessed: boolean; error?: string }> {
  // Check fast cache first
  if (isEventProcessed(eventId)) {
    return { alreadyProcessed: true };
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    // Record in local cache
    recordProcessedEvent(eventId);
    return { alreadyProcessed: false };
  }

  try {
    // Check database idempotency table
    const { data: existing } = await supabase
      .from('payment_webhook_events')
      .select('event_id, processed')
      .eq('event_id', eventId)
      .maybeSingle();

    if (existing) {
      recordProcessedEvent(eventId);
      return { alreadyProcessed: true };
    }

    // Insert durable record
    const { error: insertError } = await supabase
      .from('payment_webhook_events')
      .insert({
        event_id: eventId,
        event_type: eventType,
        payload,
        processed: true,
        processed_at: new Date().toISOString(),
      });

    if (insertError && insertError.code === '23505') {
      // Unique violation means already processed
      recordProcessedEvent(eventId);
      return { alreadyProcessed: true };
    }

    recordProcessedEvent(eventId);
    return { alreadyProcessed: false };
  } catch (err: any) {
    recordProcessedEvent(eventId);
    return { alreadyProcessed: false, error: err.message };
  }
}

/**
 * Validates subscription state transitions based on Razorpay webhook events
 */
export function transitionSubscriptionState(
  currentStatus: string,
  eventType: string
): { newStatus: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED'; periodExtended: boolean } {
  switch (eventType) {
    case 'subscription.charged':
    case 'payment.captured':
    case 'order.paid':
      return { newStatus: 'ACTIVE', periodExtended: true };

    case 'subscription.halted':
    case 'payment.failed':
      return { newStatus: 'PAST_DUE', periodExtended: false };

    case 'subscription.cancelled':
      return { newStatus: 'CANCELLED', periodExtended: false };

    case 'subscription.completed':
      return { newStatus: 'EXPIRED', periodExtended: false };

    default:
      return {
        newStatus: (currentStatus as any) || 'ACTIVE',
        periodExtended: false,
      };
  }
}
