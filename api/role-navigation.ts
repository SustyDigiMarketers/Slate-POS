export interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
}

export interface VercelResponse {
  status: (statusCode: number) => VercelResponse;
  json: (body: any) => VercelResponse;
  setHeader: (name: string, value: string | string[]) => VercelResponse;
  end: () => void;
}

import { authenticateSupabaseRequest, getServerSupabase } from '../src/lib/subscriptionServer';
import { canManageRoles } from '../src/lib/permissions';

const VALID_TARGET_ROLES = ['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'CASHIER', 'STORE_OFFICER', 'PURCHASE_OFFICER'];
const RESTRICTED_CASHIER_MODULES = [
  'REPORTS', 'REPORT_PL', 'REPORT_BS', 'REPORT_CF', 'REPORT_TB', 'REPORT_GL',
  'REPORT_AR', 'REPORT_AP', 'REPORT_GST', 'REPORT_AUDIT',
  'JOURNAL', 'BUDGETS', 'BULK_UPDATES', 'CHART_OF_ACCOUNTS', 'TRANSACTIONS',
  'SETTINGS', 'SETTINGS_BRANCHES', 'SETTINGS_FISCAL', 'STAFF', 'SUBSCRIPTIONS',
  'SUPPLIERS', 'PURCHASES', 'PURCHASE_ORDERS', 'DEBIT_NOTES', 'BANKING', 'DASHBOARD',
];
const RESTRICTED_STORE_OFFICER_MODULES = [
  'POS', 'CUSTOMERS', 'PAYMENTS', 'CREDIT_NOTES', 'SALES_RETURNS',
  'DASHBOARD', 'BANKING', 'JOURNAL', 'BUDGETS', 'BULK_UPDATES', 'CHART_OF_ACCOUNTS',
  'TRANSACTIONS', 'REPORTS', 'REPORT_PL', 'REPORT_BS', 'REPORT_CF', 'REPORT_TB',
  'REPORT_GL', 'REPORT_AR', 'REPORT_AP', 'REPORT_GST', 'REPORT_AUDIT',
  'SETTINGS', 'SETTINGS_BRANCHES', 'SETTINGS_FISCAL', 'STAFF', 'SUBSCRIPTIONS',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = (req.headers['origin'] as string | undefined) || '';
  if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.endsWith('.vercel.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authHeader = (req.headers['authorization'] || req.headers['Authorization']) as string | undefined;
  const auth = await authenticateSupabaseRequest(authHeader);
  if (!auth.authenticated || !auth.organizationId || !auth.role) {
    return res.status(auth.statusCode || 401).json({
      error: 'Unauthorized',
      message: auth.error || 'Authentication required.',
    });
  }

  if (!canManageRoles(auth.role)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: `Role ${auth.role} is not authorized to manage role navigation policies. Super Admin or Organization Admin required.`,
    });
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return res.status(503).json({
      error: 'Database Unavailable',
      message: 'Supabase service client is not configured on the server.',
    });
  }

  const orgId = auth.organizationId;

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('role_navigation_configs')
      .select('role, enabled_additional_modules, updated_at, updated_by')
      .eq('organization_id', orgId);

    if (error) {
      return res.status(500).json({ error: 'Database Error', message: error.message });
    }

    const mapped: Record<string, string[]> = {};
    for (const row of data || []) {
      mapped[row.role] = Array.isArray(row.enabled_additional_modules) ? row.enabled_additional_modules : [];
    }

    return res.status(200).json({ status: 'success', data: mapped });
  }

  if (req.method === 'POST') {
    const { role, enabledAdditionalModules } = req.body || {};
    if (!role || !VALID_TARGET_ROLES.includes(role) || !Array.isArray(enabledAdditionalModules)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Valid target role and enabledAdditionalModules array are required.',
      });
    }

    // Security gate: Org Admin cannot configure Super Admin role
    if (auth.role === 'ORG_ADMIN' && role === 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Organization Admins cannot modify Super Admin navigation policies.',
      });
    }

    if (role === 'CASHIER') {
      const hasRestricted = enabledAdditionalModules.some((m: string) =>
        RESTRICTED_CASHIER_MODULES.includes(m)
      );
      if (hasRestricted) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot delegate restricted financial, accounting, or administrative modules to Cashier.',
        });
      }
    }

    if (role === 'STORE_OFFICER' || role === 'PURCHASE_OFFICER') {
      const hasRestricted = enabledAdditionalModules.some((m: string) =>
        RESTRICTED_STORE_OFFICER_MODULES.includes(m)
      );
      if (hasRestricted) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot delegate restricted POS, customer, accounting, or administrative modules to Store Officer.',
        });
      }
    }

    const { error } = await supabase
      .from('role_navigation_configs')
      .upsert(
        {
          organization_id: orgId,
          role,
          enabled_additional_modules: enabledAdditionalModules,
          updated_by: auth.profile?.name || auth.user?.email || auth.role,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,role' }
      );

    if (error) {
      return res.status(500).json({ error: 'Database Error', message: error.message });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Role navigation configuration saved to Supabase.',
    });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
