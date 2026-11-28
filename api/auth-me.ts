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

import { authenticateSupabaseRequest } from '../src/lib/subscriptionServer';
import { toLegacyPermissions } from '../src/lib/permissions';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = (req.headers['origin'] as string | undefined) || '';
  if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.endsWith('.vercel.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
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

  if (!auth.authenticated || !auth.profile) {
    return res.status(auth.statusCode || 401).json({
      error: 'Unauthorized',
      message: auth.error || 'No active business profile associated with this account.',
    });
  }

  return res.status(200).json({
    status: 'success',
    profile: {
      id: auth.profile.id,
      userCode: auth.profile.user_code || undefined,
      name: auth.profile.name,
      email: auth.profile.email,
      phone: auth.profile.phone || '',
      role: auth.profile.role,
      organizationId: auth.profile.organization_id,
      branchId: auth.profile.branch_id,
      permissions: toLegacyPermissions(auth.profile.role),
    },
  });
}
