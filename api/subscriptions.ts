export interface VercelRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[]>;
  body?: any;
}

export interface VercelResponse {
  status: (statusCode: number) => VercelResponse;
  json: (body: any) => VercelResponse;
  send: (body: any) => VercelResponse;
  setHeader: (name: string, value: string | string[]) => VercelResponse;
  end: () => void;
}

import {
  AUTHORITATIVE_PLANS,
  resolveAuthoritativePlan,
  authenticateSupabaseRequest,
  createAuthoritativeRazorpayOrder,
  getServerSupabase,
} from '../src/lib/subscriptionServer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS & Security headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Authenticate Request via Verified Supabase Bearer Token
  // Eliminates all trust in client-supplied headers (x-organization-id, x-user-role)
  const authHeader = (req.headers['authorization'] || req.headers['Authorization']) as string | undefined;
  const auth = await authenticateSupabaseRequest(authHeader);

  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({
      error: 'Unauthorized',
      message: auth.error || 'Authentication required to access subscription services.',
    });
  }

  const organizationId = auth.organizationId!;
  const role = auth.role!;
  const supabase = getServerSupabase();

  // 2. GET: Fetch Authoritative Plans & Real Persistent Subscription Status
  if (req.method === 'GET') {
    let currentSubscription: any = null;
    let invoices: any[] = [];

    if (supabase) {
      try {
        const { data: subData } = await supabase
          .from('business_subscriptions')
          .select('*')
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (subData) {
          currentSubscription = subData;
        }

        const { data: invoiceData } = await supabase
          .from('subscription_invoices')
          .select('*')
          .eq('organization_id', organizationId)
          .order('paid_at', { ascending: false })
          .limit(10);

        if (invoiceData) {
          invoices = invoiceData;
        }
      } catch (err) {
        console.warn('Failed to query Supabase subscription record:', err);
      }
    }

    // If no persistent subscription exists yet, provide structured non-active/trial status
    if (!currentSubscription) {
      const isProd = process.env.NODE_ENV === 'production' || process.env.VITE_APP_ENV === 'production';
      currentSubscription = {
        id: `pending_${organizationId.slice(0, 12)}`,
        organizationId,
        planId: 'plan_starter_monthly',
        status: isProd ? 'NO_ACTIVE_SUBSCRIPTION' : 'TRIALING',
        billingInterval: 'MONTHLY',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: isProd ? new Date().toISOString() : new Date(Date.now() + 14 * 86400000).toISOString(),
        cancelAtPeriodEnd: false,
        priceInr: 1499,
        gstPercentage: 18,
      };
    }

    return res.status(200).json({
      status: 'success',
      data: {
        plans: Object.values(AUTHORITATIVE_PLANS),
        organizationId,
        subscription: currentSubscription,
        invoices,
      },
    });
  }

  // 3. POST: Secure Server-Side Checkout Session Creation via Razorpay API
  if (req.method === 'POST') {
    const { planId, billingInterval, clientSubmittedPrice } = req.body || {};

    if (!planId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required planId in checkout request.',
      });
    }

    // Role check: Only SUPER_ADMIN, ORG_ADMIN, or MANAGER can initiate subscription checkout
    if (role !== 'SUPER_ADMIN' && role !== 'ORG_ADMIN' && role !== 'MANAGER') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only organization administrators are authorized to initiate subscription billing.',
      });
    }

    // Authoritative Server-Side Plan Resolution
    const resolvedPlan = resolveAuthoritativePlan(planId, billingInterval || 'MONTHLY');
    if (!resolvedPlan) {
      return res.status(404).json({
        error: 'Invalid Plan',
        message: `Subscription plan ${planId} does not exist or is inactive.`,
      });
    }

    // Anti-Tamper Check: Validate client-submitted price against authoritative catalog
    if (clientSubmittedPrice !== undefined && clientSubmittedPrice !== resolvedPlan.basePriceInr) {
      console.warn(`[SECURITY] Tampered price rejected for org ${organizationId}: sent ${clientSubmittedPrice}, expected ${resolvedPlan.basePriceInr}`);
      return res.status(400).json({
        error: 'Price Tampering Detected',
        message: 'The submitted plan price does not match the authoritative server catalog.',
      });
    }

    const customerEmail = auth.user?.email || auth.profile?.email || 'billing@slate.local';
    const razorpayResult = await createAuthoritativeRazorpayOrder(resolvedPlan, organizationId, customerEmail);

    if (!razorpayResult.success) {
      return res.status(502).json({
        error: 'Gateway Error',
        message: razorpayResult.error || 'Failed to initialize payment session with Razorpay.',
      });
    }

    const rzpKeyId = process.env.VITE_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder_key';

    return res.status(200).json({
      status: 'success',
      data: {
        orderId: razorpayResult.orderId,
        organizationId,
        plan: resolvedPlan,
        currency: 'INR',
        amount: resolvedPlan.totalAmountPaisa,
        displayAmount: resolvedPlan.totalAmountInr,
        keyId: rzpKeyId,
        isMock: razorpayResult.isMock,
        prefill: {
          name: auth.profile?.name || 'Business Administrator',
          email: customerEmail,
        },
        notes: {
          organizationId,
          planId: resolvedPlan.id,
          billingInterval: resolvedPlan.billingInterval,
          software: 'SLATE POS Commercial',
        },
      },
    });
  }

  // 4. DELETE / PATCH: Cancel Subscription at Period End
  if (req.method === 'DELETE' || req.method === 'PATCH') {
    if (role !== 'SUPER_ADMIN' && role !== 'ORG_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only organization administrators can cancel subscriptions.',
      });
    }

    if (supabase) {
      try {
        await supabase
          .from('business_subscriptions')
          .update({
            cancel_at_period_end: true,
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId);
      } catch (err) {
        console.warn('Failed to update cancel_at_period_end in Supabase:', err);
      }
    }

    return res.status(200).json({
      status: 'success',
      message: 'Subscription set to cancel at end of current billing period. POS history and data are preserved.',
      data: {
        organizationId,
        cancelAtPeriodEnd: true,
      },
    });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
