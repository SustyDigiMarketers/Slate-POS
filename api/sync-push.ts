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
import { applySyncPushItems, isAllowedSyncOrigin } from '../src/lib/syncServer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers['origin'] as string | undefined;
  if (isAllowedSyncOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin!);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authHeader = (req.headers['authorization'] || req.headers['Authorization']) as string | undefined;
  const auth = await authenticateSupabaseRequest(authHeader);
  if (!auth.authenticated || !auth.organizationId) {
    return res.status(auth.statusCode || 401).json({
      error: 'Unauthorized',
      message: auth.error || 'Authentication required to synchronize outbox events.',
    });
  }

  const { deviceId, items } = req.body || {};
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Bad Request', message: 'Payload items must be an array.' });
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return res.status(503).json({
      error: 'Database Unavailable',
      message: 'Supabase service client is not configured on the server.',
    });
  }

  const result = await applySyncPushItems({
    supabase,
    orgId: auth.organizationId,
    defaultBranchId: auth.profile?.branch_id || null,
    role: auth.role,
    actorId: auth.profile?.id || auth.user?.id || null,
    actorName: auth.profile?.name || auth.user?.email || null,
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
