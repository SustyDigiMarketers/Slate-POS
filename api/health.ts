export interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface VercelResponse {
  status: (statusCode: number) => VercelResponse;
  json: (body: any) => VercelResponse;
  setHeader: (name: string, value: string | string[]) => VercelResponse;
  end: () => void;
}

import { getServerSupabase } from '../src/lib/subscriptionServer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabase = getServerSupabase();
  let databaseStatus: 'connected' | 'unconfigured' | 'error' = 'unconfigured';
  let accountingTablesReady = false;
  let financialTablesReady = false;
  const missingTables: string[] = [];

  if (supabase) {
    try {
      const { error: orgErr } = await supabase.from('organizations').select('id').limit(1);
      if (orgErr) {
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
        checks.forEach((res, idx) => {
          if (res.error) missingTables.push(tableNames[idx]);
        });
        accountingTablesReady = !checks[0].error;
        financialTablesReady = !checks[1].error && !checks[2].error;
      }
    } catch {
      databaseStatus = 'error';
    }
  }

  return res.status(databaseStatus === 'error' ? 503 : 200).json({
    status: databaseStatus === 'error' ? 'degraded' : 'healthy',
    timestamp: new Date().toISOString(),
    service: 'SLATE POS Finance & Accounting API',
    version: '3.1.0',
    database: databaseStatus,
    accountingSchemaReady: accountingTablesReady,
    financialSchemaReady: financialTablesReady,
    missingTables,
  });
}
