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

import crypto from 'crypto';
import {
  authenticateSupabaseRequest,
  getServerSupabase,
} from '../src/lib/subscriptionServer';
import { toLegacyPermissions } from '../src/lib/permissions';

async function generateUniqueUserCode(supabase: any): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const { data } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_code', candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  throw new Error('Unable to allocate a unique 6-digit user code.');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = (req.headers['origin'] as string | undefined) || '';
  if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.endsWith('.vercel.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
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
  const auth = await authenticateSupabaseRequest(authHeader);

  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({
      error: 'Unauthorized',
      message: auth.error || 'Authentication required to provision staff users.',
    });
  }

  // 2. Strict RBAC Enforcement: Only Super Admins and Org Admins may provision staff
  const allowedRoles = ['SUPER_ADMIN', 'ORG_ADMIN'];
  if (!allowedRoles.includes(auth.role || '')) {
    return res.status(403).json({
      error: 'Forbidden',
      message: `Role ${auth.role} is unauthorized to provision staff accounts. Super Admin or Organization Admin required.`,
    });
  }

  const { email, name, role, branchId, phone } = req.body || {};

  // 3. Input Validation
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'A valid email address is required.',
    });
  }

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Staff full name is required (minimum 2 characters).',
    });
  }

  const validRoles = ['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'CASHIER', 'STORE_OFFICER', 'PURCHASE_OFFICER'];
  const targetRole = validRoles.includes(role) ? role : 'CASHIER';

  // Privilege escalation guard: Only SUPER_ADMIN can provision SUPER_ADMIN
  if (targetRole === 'SUPER_ADMIN' && auth.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only Super Admins can provision SUPER_ADMIN accounts.',
    });
  }

  // Strict Tenant Isolation: Target organization is locked to the caller's verified tenant
  const targetOrgId = auth.organizationId!;
  let targetBranchId = typeof branchId === 'string' && branchId.trim() ? branchId.trim() : (auth.profile?.branch_id || '');
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();
  const cleanPhone = phone ? String(phone).trim() : null;

  const supabase = getServerSupabase();
  const newProfileId = `usr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const assignedPermissions = toLegacyPermissions(targetRole);

  if (supabase) {
    try {
      // Verify branch belongs to targetOrgId and is active
      if (targetBranchId) {
        const { data: branchRow } = await supabase
          .from('stores')
          .select('id, is_active')
          .eq('id', targetBranchId)
          .eq('organization_id', targetOrgId)
          .maybeSingle();

        if (!branchRow || branchRow.is_active === false) {
          return res.status(400).json({
            error: 'Validation Error',
            message: `Branch ${targetBranchId} does not belong to organization ${targetOrgId} or is inactive.`,
          });
        }
      } else {
        const { data: defaultBranch } = await supabase
          .from('stores')
          .select('id')
          .eq('organization_id', targetOrgId)
          .eq('is_active', true)
          .order('is_headquarters', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!defaultBranch?.id) {
          return res.status(400).json({
            error: 'Validation Error',
            message: `No active branch found for organization ${targetOrgId}.`,
          });
        }
        targetBranchId = defaultBranch.id;
      }

      // Check if profile already exists for this email
      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('id, organization_id')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (existingProfile) {
        return res.status(409).json({
          error: 'Conflict',
          message: `A staff profile for ${cleanEmail} already exists.`,
        });
      }

      const generatedUserCode = await generateUniqueUserCode(supabase);

      // Insert pre-provisioned user profile with 6-digit user_code and authoritative permissions
      const { data: insertedProfile, error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          id: newProfileId,
          user_code: generatedUserCode,
          organization_id: targetOrgId,
          branch_id: targetBranchId,
          email: cleanEmail,
          name: cleanName,
          phone: cleanPhone,
          role: targetRole,
          permissions: assignedPermissions,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (insertError) {
        return res.status(500).json({
          error: 'Database Error',
          message: insertError.message || 'Failed to persist staff profile in Supabase.',
        });
      }

      return res.status(201).json({
        status: 'success',
        message: `Staff account successfully provisioned for ${cleanEmail}.`,
        profile: insertedProfile,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: err.message || 'Unexpected failure during staff provisioning.',
      });
    }
  }

  const isProd = process.env.NODE_ENV === 'production' || process.env.VITE_APP_ENV === 'production';
  if (!isProd && process.env.VITE_DEV_LOCAL_MODE === 'true') {
    const devCode = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    return res.status(201).json({
      status: 'success',
      message: `Staff account provisioned in local sandbox for ${cleanEmail}.`,
      profile: {
        id: newProfileId,
        user_code: devCode,
        organization_id: targetOrgId,
        branch_id: targetBranchId || `br_${targetOrgId.slice(0, 8)}_01`,
        email: cleanEmail,
        name: cleanName,
        phone: cleanPhone,
        role: targetRole,
        permissions: assignedPermissions,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  }

  return res.status(503).json({
    error: 'Service Unavailable',
    message: 'Supabase server configuration is missing. Cannot provision staff user.',
  });
}
