/**
 * SLATE POS — Development-Only Demo Authentication
 *
 * Isolated demo authentication service for local testing without Supabase connectivity.
 * Strict safeguards:
 * - Completely inactive and tree-shaken in production builds (guarded by import.meta.env.DEV).
 * - Never transmits or overwrites production Supabase tokens.
 * - Does not call external network endpoints or live database instances.
 * - Preserves strict role-based access control, branch restrictions, and user profile data.
 */

import { isSupabaseConfigured } from '../lib/supabaseClient';
import { INITIAL_USERS, INITIAL_BRANCHES } from '../lib/initialData';
import { offlineStore } from '../lib/offlineStore';
import { UserProfile } from '../types';

export const DEMO_PASSWORD = 'SlateDemo!2026';

export interface DemoAccount {
  id: string;
  name: string;
  email: string;
  role: 'MANAGER' | 'CASHIER' | 'STORE_OFFICER' | 'SUPER_ADMIN';
  roleLabel: string;
  branchId: string;
  branchName: string;
  description: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: 'usr_manager_01',
    name: 'Rajesh Sharma',
    email: 'demo.manager@slate.local',
    role: 'MANAGER',
    roleLabel: 'Store Manager',
    branchId: 'br_blr_01',
    branchName: 'Indiranagar Flagship',
    description: 'Dashboard analytics, sales reports, inventory approvals & staff navigation',
  },
  {
    id: 'usr_cashier_01',
    name: 'Arun Kumar',
    email: 'demo.cashier@slate.local',
    role: 'CASHIER',
    roleLabel: 'Billing Cashier',
    branchId: 'br_blr_01',
    branchName: 'Indiranagar Flagship',
    description: 'Rapid POS counter checkout, cash/UPI payments, receipt printing & customer lookup',
  },
  {
    id: 'usr_officer_01',
    name: 'Sunil Verma',
    email: 'demo.officer@slate.local',
    role: 'STORE_OFFICER',
    roleLabel: 'Store Officer',
    branchId: 'br_blr_01',
    branchName: 'Indiranagar Flagship',
    description: 'Product catalog, supplier ledger, delivery challans & inward stock movements',
  },
  {
    id: 'usr_super_01',
    name: 'Vikram Malhotra',
    email: 'demo.admin@slate.local',
    role: 'SUPER_ADMIN',
    roleLabel: 'Super Admin',
    branchId: 'br_blr_01',
    branchName: 'Indiranagar Flagship',
    description: 'Full enterprise control, subscription management & multi-branch governance',
  },
];

/**
 * Returns true strictly in development mode.
 * In production builds (npm run build), import.meta.env.DEV is statically replaced with false,
 * guaranteeing demo features are never reachable.
 */
export const isDemoAuthAvailable = (): boolean => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    return Boolean((import.meta as any).env.DEV);
  }
  return process.env.NODE_ENV !== 'production';
};

export interface DemoAuthResult {
  success: boolean;
  user?: UserProfile;
  branchId?: string;
  error?: string;
}

/**
 * Authenticates a demo user without calling Supabase or touching external databases.
 */
export const authenticateDemoUser = (
  email: string,
  password: string
): DemoAuthResult => {
  if (!isDemoAuthAvailable()) {
    return {
      success: false,
      error: 'Demo authentication is strictly disabled in production builds.',
    };
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Find demo account matching normalized email
  const demoAccount = DEMO_ACCOUNTS.find(
    (acc) => acc.email.toLowerCase() === normalizedEmail
  );

  // Also check initial seed accounts if matching with demo password
  const seedAccount = INITIAL_USERS.find(
    (u) => u.email.toLowerCase() === normalizedEmail
  );

  const matchedAccount = demoAccount || seedAccount;

  if (!matchedAccount) {
    return {
      success: false,
      error: 'Demo user not found. Please use one of the configured demo accounts.',
    };
  }

  // Check password (accept demo password or allow convenient local matching in dev)
  if (password !== DEMO_PASSWORD && password !== 'password123') {
    return {
      success: false,
      error: `Invalid password. For local demo testing, use: ${DEMO_PASSWORD}`,
    };
  }

  // Resolve user profile
  let targetUser: UserProfile | undefined;
  if (demoAccount) {
    const baseUser = INITIAL_USERS.find((u) => u.id === demoAccount.id);
    targetUser = {
      ...(baseUser || INITIAL_USERS[2]),
      id: demoAccount.id,
      name: demoAccount.name,
      email: demoAccount.email,
      role: demoAccount.role,
      branchId: demoAccount.branchId,
    };
  } else if (seedAccount) {
    targetUser = seedAccount;
  }

  if (!targetUser) {
    return {
      success: false,
      error: 'Could not construct demo user profile.',
    };
  }

  const branchId = targetUser.branchId || 'br_blr_01';

  return {
    success: true,
    user: targetUser,
    branchId,
  };
};

/**
 * Convenience helper to log in a demo account directly into offlineStore
 */
export const performDemoLogin = (
  account: DemoAccount,
  onLoginSuccess: (userId: string, branchId: string) => void
): boolean => {
  if (!isDemoAuthAvailable()) {
    return false;
  }

  const result = authenticateDemoUser(account.email, DEMO_PASSWORD);
  if (result.success && result.user && result.branchId) {
    offlineStore.login(result.user.id, result.branchId, result.user);
    onLoginSuccess(result.user.id, result.branchId);
    return true;
  }
  return false;
};
