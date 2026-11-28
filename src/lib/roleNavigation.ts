/**
 * SLATE POS — Centralized Role-Based Navigation & Access Control Policy
 *
 * Strict least-privilege matrix for Finance, Accounting & Billing:
 * - SUPER_ADMIN / ORG_ADMIN: Full access to all modules, accounting, financial statements, audit, staff, roles, and subscriptions
 * - MANAGER: Full access to finance operations, accounting, banking, reports, branches, and settings
 *            (strictly excluded from STAFF/user/role management & SUBSCRIPTIONS)
 * - CASHIER: STRICTLY limited to counter sales & collections:
 *     CUSTOMERS, PRODUCTS, POS, QUOTES, SALES, PAYMENTS
 * - STORE_OFFICER / PURCHASE_OFFICER: STRICTLY limited to procurement & inventory:
 *     SUPPLIERS, PRODUCTS, QUOTES (read-only), SALES (read-only), CHALLANS, PURCHASE_ORDERS, PURCHASES, DEBIT_NOTES
 *
 * Default Deny: If a view is not explicitly listed, access is DENIED.
 */

import { UserRole } from '../types';
import { ActiveView } from '../components/layout/Sidebar';
import { normalizeRole, hasPermission } from './permissions';

export interface RoleNavigationPolicy {
  allowedViews: readonly ActiveView[];
  defaultView: ActiveView;
  roleLabel: string;
  description: string;
}

const ALL_ACCOUNTS_VIEWS: readonly ActiveView[] = [
  'JOURNAL',
  'BUDGETS',
  'BULK_UPDATES',
  'CHART_OF_ACCOUNTS',
  'TRANSACTIONS',
];

const ALL_REPORT_VIEWS: readonly ActiveView[] = [
  'REPORTS',
  'REPORT_PL',
  'REPORT_BS',
  'REPORT_CF',
  'REPORT_TB',
  'REPORT_GL',
  'REPORT_AR',
  'REPORT_AP',
  'REPORT_GST',
  'REPORT_AUDIT',
];

const ALL_FINANCE_ADMIN_VIEWS: readonly ActiveView[] = [
  'DASHBOARD',
  'BANKING',
  'CUSTOMERS',
  'POS',
  'QUOTES',
  'SALES',
  'PAYMENTS',
  'CREDIT_NOTES',
  'SALES_RETURNS',
  'CHALLANS',
  'SUPPLIERS',
  'PURCHASE_ORDERS',
  'PURCHASES',
  'PURCHASE_PAYMENTS',
  'DEBIT_NOTES',
  'EXPENSES',
  'PRODUCTS',
  'INVENTORY',
  ...ALL_ACCOUNTS_VIEWS,
  ...ALL_REPORT_VIEWS,
  'SETTINGS',
  'SETTINGS_BRANCHES',
  'SETTINGS_FISCAL',
  'STAFF',
  'SUBSCRIPTIONS',
  'SYNC',
];

const MANAGER_ALLOWED_VIEWS: readonly ActiveView[] = ALL_FINANCE_ADMIN_VIEWS.filter(
  (v) => v !== 'STAFF' && v !== 'SUBSCRIPTIONS'
);

export const ROLE_NAVIGATION_POLICIES: Record<UserRole, RoleNavigationPolicy> = {
  SUPER_ADMIN: {
    roleLabel: 'Super Administrator',
    description: 'Full financial administration, double-entry accounting, multi-branch audit, and platform settings',
    defaultView: 'DASHBOARD',
    allowedViews: ALL_FINANCE_ADMIN_VIEWS,
  },
  ORG_ADMIN: {
    roleLabel: 'Organization Admin',
    description: 'Enterprise finance owner with complete accounting, fiscal locking, branch, and staff controls',
    defaultView: 'DASHBOARD',
    allowedViews: ALL_FINANCE_ADMIN_VIEWS,
  },
  MANAGER: {
    roleLabel: 'Finance & Store Manager',
    description: 'Operations and accounting manager with access to GL, budgets, banking, procurement, branches, and financial reports',
    defaultView: 'DASHBOARD',
    allowedViews: MANAGER_ALLOWED_VIEWS,
  },
  CASHIER: {
    roleLabel: 'Counter Cashier',
    description: 'Front-desk invoicing, counter checkout, quotes, customer billing, and payment collections',
    defaultView: 'POS',
    allowedViews: [
      'CUSTOMERS',
      'PRODUCTS',
      'POS',
      'QUOTES',
      'SALES',
      'PAYMENTS',
    ],
  },
  STORE_OFFICER: {
    roleLabel: 'Store / Purchase Officer',
    description: 'Supplier procurement, purchase orders, bills, debit notes, inventory stock, and delivery challans',
    defaultView: 'PRODUCTS',
    allowedViews: [
      'SUPPLIERS',
      'PRODUCTS',
      'QUOTES',
      'SALES',
      'CHALLANS',
      'PURCHASE_ORDERS',
      'PURCHASES',
      'DEBIT_NOTES',
    ],
  },
  PURCHASE_OFFICER: {
    roleLabel: 'Store / Purchase Officer',
    description: 'Supplier procurement, purchase orders, bills, debit notes, inventory stock, and delivery challans',
    defaultView: 'PRODUCTS',
    allowedViews: [
      'SUPPLIERS',
      'PRODUCTS',
      'QUOTES',
      'SALES',
      'CHALLANS',
      'PURCHASE_ORDERS',
      'PURCHASES',
      'DEBIT_NOTES',
    ],
  },
};

export interface RoleDelegationRules {
  canBeManagedBy: readonly UserRole[];
  eligibleAdditionalViews: readonly ActiveView[];
  restrictedViews: readonly ActiveView[];
}

export const ROLE_DELEGATION_RULES: Record<UserRole, RoleDelegationRules> = {
  CASHIER: {
    canBeManagedBy: ['SUPER_ADMIN', 'ORG_ADMIN'],
    eligibleAdditionalViews: ['CHALLANS', 'EXPENSES', 'INVENTORY', 'CREDIT_NOTES', 'SALES_RETURNS'],
    restrictedViews: [
      'DASHBOARD',
      'BANKING',
      'SUPPLIERS',
      'PURCHASE_ORDERS',
      'PURCHASES',
      'PURCHASE_PAYMENTS',
      'DEBIT_NOTES',
      ...ALL_ACCOUNTS_VIEWS,
      ...ALL_REPORT_VIEWS,
      'SETTINGS',
      'SETTINGS_BRANCHES',
      'SETTINGS_FISCAL',
      'STAFF',
      'SUBSCRIPTIONS',
      'SYNC',
    ],
  },
  STORE_OFFICER: {
    canBeManagedBy: ['SUPER_ADMIN', 'ORG_ADMIN'],
    eligibleAdditionalViews: ['INVENTORY', 'EXPENSES'],
    restrictedViews: [
      'POS',
      'CUSTOMERS',
      'PAYMENTS',
      'PURCHASE_PAYMENTS',
      'CREDIT_NOTES',
      'SALES_RETURNS',
      'DASHBOARD',
      'BANKING',
      ...ALL_ACCOUNTS_VIEWS,
      ...ALL_REPORT_VIEWS,
      'SETTINGS',
      'SETTINGS_BRANCHES',
      'SETTINGS_FISCAL',
      'STAFF',
      'SUBSCRIPTIONS',
      'SYNC',
    ],
  },
  PURCHASE_OFFICER: {
    canBeManagedBy: ['SUPER_ADMIN', 'ORG_ADMIN'],
    eligibleAdditionalViews: ['INVENTORY', 'EXPENSES'],
    restrictedViews: [
      'POS',
      'CUSTOMERS',
      'PAYMENTS',
      'PURCHASE_PAYMENTS',
      'CREDIT_NOTES',
      'SALES_RETURNS',
      'DASHBOARD',
      'BANKING',
      ...ALL_ACCOUNTS_VIEWS,
      ...ALL_REPORT_VIEWS,
      'SETTINGS',
      'SETTINGS_BRANCHES',
      'SETTINGS_FISCAL',
      'STAFF',
      'SUBSCRIPTIONS',
      'SYNC',
    ],
  },
  MANAGER: {
    canBeManagedBy: ['SUPER_ADMIN', 'ORG_ADMIN'],
    eligibleAdditionalViews: [],
    restrictedViews: ['STAFF', 'SUBSCRIPTIONS'],
  },
  ORG_ADMIN: {
    canBeManagedBy: ['SUPER_ADMIN'],
    eligibleAdditionalViews: [],
    restrictedViews: [],
  },
  SUPER_ADMIN: {
    canBeManagedBy: [],
    eligibleAdditionalViews: [],
    restrictedViews: [],
  },
};

/**
 * Strict Admin-Only Role Management Gate:
 * Only SUPER_ADMIN and ORG_ADMIN can configure or manage role navigation/permissions.
 * MANAGER is explicitly prohibited from user/role administration.
 */
export function canManagerManageRole(actorRole: UserRole | string | undefined, targetRole: UserRole): boolean {
  if (!hasPermission(actorRole, 'ROLES_MANAGE')) return false;
  const actor = normalizeRole(actorRole);
  const target = normalizeRole(targetRole);
  if (!actor || !target) return false;
  if (actor === 'SUPER_ADMIN') return true;
  if (actor === 'ORG_ADMIN') {
    return target !== 'SUPER_ADMIN';
  }
  return false;
}

export function canManagerEnableModule(
  actorRole: UserRole | string | undefined,
  targetRole: UserRole,
  view: ActiveView
): boolean {
  if (!canManagerManageRole(actorRole, targetRole)) return false;
  const rules = ROLE_DELEGATION_RULES[normalizeRole(targetRole) || targetRole];
  if (!rules) return true;
  if (rules.restrictedViews.includes(view)) return false;
  return true;
}

export function getEffectiveAllowedViews(
  role: UserRole | string | undefined,
  overrides?: Record<string, string[]>
): ActiveView[] {
  const normalized = normalizeRole(role);
  if (!normalized) return [];
  const policy = ROLE_NAVIGATION_POLICIES[normalized];
  if (!policy) return [];

  const baselineViews = [...policy.allowedViews];
  const rules = ROLE_DELEGATION_RULES[normalized];
  if (!rules) return baselineViews;

  let activeOverrides = overrides;
  if (!activeOverrides && typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('slate_pos_role_nav_overrides');
      if (stored) {
        activeOverrides = JSON.parse(stored);
      }
    } catch {
      // ignore
    }
  }

  const roleOverrides = activeOverrides?.[normalized] || (role ? activeOverrides?.[role] : undefined);
  if (!roleOverrides || !Array.isArray(roleOverrides)) {
    return baselineViews;
  }

  const validAdditionalViews = roleOverrides.filter((viewStr) => {
    const view = viewStr as ActiveView;
    return (
      rules.eligibleAdditionalViews.includes(view) &&
      !rules.restrictedViews.includes(view) &&
      !baselineViews.includes(view)
    );
  }) as ActiveView[];

  return [...baselineViews, ...validAdditionalViews];
}

export function canAccessView(role: UserRole | string | undefined, view: ActiveView): boolean {
  if (!role) return false;
  const effectiveAllowed = getEffectiveAllowedViews(role);
  return effectiveAllowed.includes(view);
}

export function getDefaultViewForRole(role: UserRole | string | undefined): ActiveView {
  const normalized = normalizeRole(role);
  if (!normalized) return 'POS';
  const policy = ROLE_NAVIGATION_POLICIES[normalized];
  return policy ? policy.defaultView : 'POS';
}

export function getRoleDisplayName(role: UserRole | string | undefined): string {
  const normalized = normalizeRole(role);
  if (!normalized) return role ? String(role) : 'User';
  const policy = ROLE_NAVIGATION_POLICIES[normalized];
  return policy ? policy.roleLabel : String(role);
}

export type RoleNavigationListener = () => void;
const roleNavigationListeners: Set<RoleNavigationListener> = new Set();

export function subscribeToRoleNavigation(listener: RoleNavigationListener): () => void {
  roleNavigationListeners.add(listener);

  const handleStorage = (e: StorageEvent) => {
    if (e.key === 'slate_pos_role_nav_overrides') {
      listener();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage);
  }

  return () => {
    roleNavigationListeners.delete(listener);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorage);
    }
  };
}

export function notifyRoleNavigationChange(): void {
  roleNavigationListeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.error('Error invoking role navigation listener:', err);
    }
  });
}
