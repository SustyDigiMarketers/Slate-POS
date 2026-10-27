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
  authenticateSupabaseRequest,
  getServerSupabase,
} from '../src/lib/subscriptionServer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 1. Authenticate Request via Supabase Bearer Token
  const authHeader = (req.headers['authorization'] || req.headers['Authorization']) as string | undefined;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Supabase authentication Bearer token required for business onboarding.',
    });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const supabase = getServerSupabase();

  let user: any = null;
  if (supabase) {
    const { data: { user: verifiedUser }, error } = await supabase.auth.getUser(token);
    if (error || !verifiedUser) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired authentication session.',
      });
    }
    user = verifiedUser;
  } else if (process.env.VITE_DEV_LOCAL_MODE === 'true' && token.startsWith('dev_token_')) {
    user = { id: 'usr_dev_onboarding', email: 'dev@slate.local' };
  } else {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'Supabase server configuration is missing.',
    });
  }

  const {
    businessName,
    legalName,
    gstin,
    pan,
    state,
    stateCode,
    phone,
    planId,
  } = req.body || {};

  if (!businessName || businessName.trim().length < 2) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Business name is required (minimum 2 characters).',
    });
  }

  const orgId = `org_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const cleanGstin = (gstin || '29AAAAA0000A1Z5').toUpperCase().trim();
  const cleanPan = (pan || cleanGstin.substring(2, 12) || 'AAAAA0000A').toUpperCase().trim();
  const cleanState = state || 'Karnataka';
  const cleanStateCode = stateCode || cleanGstin.substring(0, 2) || '29';
  const cleanPhone = phone || '+91 98000 00000';
  const targetPlan = planId || 'plan_growth_monthly';

  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('register_business_tenant_atomic', {
        p_org_id: orgId,
        p_org_name: businessName.trim(),
        p_legal_name: (legalName || businessName).trim(),
        p_trade_name: businessName.trim(),
        p_gstin: cleanGstin,
        p_pan: cleanPan,
        p_state: cleanState,
        p_state_code: cleanStateCode,
        p_auth_user_id: user.id,
        p_user_email: user.email || 'owner@business.in',
        p_user_name: user.user_metadata?.name || businessName.trim() + ' Admin',
        p_user_phone: cleanPhone,
        p_initial_plan_id: targetPlan,
      });

      if (error) {
        return res.status(500).json({
          error: 'Onboarding Failed',
          message: error.message,
        });
      }

      return res.status(200).json({
        status: 'success',
        data,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'Onboarding Error',
        message: err.message,
      });
    }
  }

  // Local dev mode fallback
  return res.status(200).json({
    status: 'success',
    data: {
      success: true,
      organizationId: orgId,
      branchId: `br_${orgId.slice(4)}_main`,
      subscriptionStatus: 'TRIALING',
      trialEndsAt: new Date(Date.now() + 14 * 86400000).toISOString(),
    },
  });
}
