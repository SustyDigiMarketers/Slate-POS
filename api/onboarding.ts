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
  getServerSupabase,
} from '../src/lib/subscriptionServer';

const STATE_CODE_MAP: Record<string, string> = {
  'JAMMU & KASHMIR': '01',
  'HIMACHAL PRADESH': '02',
  'PUNJAB': '03',
  'CHANDIGARH': '04',
  'UTTARAKHAND': '05',
  'HARYANA': '06',
  'DELHI': '07',
  'RAJASTHAN': '08',
  'UTTAR PRADESH': '09',
  'BIHAR': '10',
  'WEST BENGAL': '19',
  'JHARKHAND': '20',
  'ODISHA': '21',
  'CHHATTISGARH': '22',
  'MADHYA PRADESH': '23',
  'GUJARAT': '24',
  'MAHARASHTRA': '27',
  'KARNATAKA': '29',
  'GOA': '30',
  'KERALA': '32',
  'TAMIL NADU': '33',
  'PUDUCHERRY': '34',
  'TELANGANA': '36',
  'ANDHRA PRADESH': '37',
};

function resolveStateCode(stateName: string, suppliedCode?: string, gstin?: string | null): string {
  if (suppliedCode && suppliedCode.trim().length === 2 && !isNaN(Number(suppliedCode))) {
    return suppliedCode.trim();
  }
  if (gstin && gstin.trim().length >= 2) {
    const prefix = gstin.trim().substring(0, 2);
    if (!isNaN(Number(prefix))) {
      return prefix;
    }
  }
  const normalized = (stateName || '').trim().toUpperCase();
  return STATE_CODE_MAP[normalized] || '29';
}

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
    subscription_plan_id,
    subscriptionPlanId,
  } = req.body || {};

  if (!businessName || businessName.trim().length < 2) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Business name is required (minimum 2 characters).',
    });
  }

  const orgId = `org_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  
  // Clean GSTIN and PAN: if not provided or blank, set to NULL rather than fabricated strings
  const rawGstin = (gstin || '').toString().trim().toUpperCase();
  const cleanGstin = rawGstin.length >= 15 ? rawGstin : null;

  const rawPan = (pan || '').toString().trim().toUpperCase();
  const cleanPan = rawPan.length >= 10
    ? rawPan
    : (cleanGstin ? cleanGstin.substring(2, 12) : null);

  const cleanState = (state || 'Karnataka').trim();
  const cleanStateCode = resolveStateCode(cleanState, stateCode, cleanGstin);
  const cleanPhone = (phone || '').trim() || '+91 98000 00000';
  const targetPlan = planId || subscription_plan_id || subscriptionPlanId || 'plan_starter_monthly';

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
      subscriptionStatus: 'ACTIVE',
      trialEndsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    },
  });
}
