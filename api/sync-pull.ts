export interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[]>;
}

export interface VercelResponse {
  status: (statusCode: number) => VercelResponse;
  json: (body: any) => VercelResponse;
  setHeader: (name: string, value: string | string[]) => VercelResponse;
  end: () => void;
}

import { authenticateSupabaseRequest, getServerSupabase } from '../src/lib/subscriptionServer';
import { isAllowedSyncOrigin, pullIncrementalSyncData } from '../src/lib/syncServer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers['origin'] as string | undefined;
  if (isAllowedSyncOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin!);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authHeader = (req.headers['authorization'] || req.headers['Authorization']) as string | undefined;
  const auth = await authenticateSupabaseRequest(authHeader);
  if (!auth.authenticated || !auth.organizationId) {
    return res.status(auth.statusCode || 401).json({
      error: 'Unauthorized',
      message: auth.error || 'Authentication required to pull sync updates.',
    });
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return res.status(503).json({
      error: 'Database Unavailable',
      message: 'Supabase service client is not configured on the server.',
    });
  }

  const sinceRaw = req.query?.since;
  const since = Array.isArray(sinceRaw) ? sinceRaw[0] : sinceRaw;

  try {
    const pulled = await pullIncrementalSyncData({
      supabase,
      orgId: auth.organizationId,
      role: auth.role,
      since,
    });
    return res.status(200).json(pulled);
  } catch (error: any) {
    return res.status(500).json({ error: 'Database Error', message: error?.message || 'Sync pull failed' });
  }
}
