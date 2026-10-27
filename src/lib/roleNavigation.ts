/**
 * SLATE POS — Centralized Role-Based Navigation & Access Control Policy
 * 
 * Strict least-privilege matrix:
 * - SUPER_ADMIN / ORG_ADMIN: Full access to all modules, settings, reports, subscriptions
 * - MANAGER: Configurable access to store analytics, operations, POS, inventory, reports
 * - CASHIER: STRICTLY limited to:
 *     1. Customers
 *     2. Products
 *     3. POS
 *     4. Quotes
 *     5. Invoices (SALES)
 *     6. Coupons
 *     7. Payments
 * - STORE_OFFICER / PURCHASE_OFFICER: STRICTLY limited to:
 *     1. Suppliers
 *     2. Products
 *     3. Quotes
 *     4. Invoices (SALES)
 *     5. Coupons
 *     6. Delivery (CHALLANS)
 * 
 * Default Deny: If a view is not explicitly listed, access is DENIED.
 */

import { UserRole } from '../types';
import { ActiveView } from '../components/layout/Sidebar';

export interface RoleNavigationPolicy {
  allowedViews: readonly ActiveView[];
  defaultView: ActiveView;
  roleLabel: string;
  description: string;
}

export const ROLE_NAVIGATION_POLICIES: Record<UserRole, RoleNavigationPolicy> = {
  SUPER_ADMIN: {
    roleLabel: 'Super Administrator',
    description: 'Full global system administration, enterprise billing, multi-store audit, and platform settings',
    defaultView: 'DASHBOARD',
    allowedViews: [
      'DASHBOARD',
      'CUSTOMERS',
      'SUPPLIERS',
      'PRODUCTS',
      'POS',
      'QUOTES',
      'SALES',
      'COUPONS',
      'CHALLANS',
      'PAYMENTS',
      'EXPENSES',
      'INVENTORY',
      'REPORTS',
      'STAFF',
      'SETTINGS',
      'SUBSCRIPTIONS',
      'SYNC',
    ],
  },
  ORG_ADMIN: {
    roleLabel: 'Organization Admin',
    description: 'Enterprise organization administrator with full store and staff controls',
    defaultView: 'DASHBOARD',
    allowedViews: [
      'DASHBOARD',
      'CUSTOMERS',
      'SUPPLIERS',
      'PRODUCTS',
      'POS',
      'QUOTES',
      'SALES',
      'COUPONS',
      'CHALLANS',
      'PAYMENTS',
      'EXPENSES',
      'INVENTORY',
      'REPORTS',
      'STAFF',
      'SETTINGS',
      'SUBSCRIPTIONS',
      'SYNC',
    ],
  },
  MANAGER: {
    roleLabel: 'Store Manager',
    description: 'Store operations supervisor with access to store analytics, inventory, and staff operations',
    defaultView: 'DASHBOARD',
    allowedViews: [
      'DASHBOARD',
      'CUSTOMERS',
      'SUPPLIERS',
      'PRODUCTS',
      'POS',
      'QUOTES',
      'SALES',
      'COUPONS',
      'CHALLANS',
      'PAYMENTS',
      'EXPENSES',
      'INVENTORY',
      'REPORTS',
      'SETTINGS',
      'SYNC',
    ],
  },
  CASHIER: {
    roleLabel: 'Counter Cashier',
    description: 'Front-desk point of sale billing, counter sales, quotes, invoices, and payments',
    defaultView: 'POS',
    allowedViews: [
      'CUSTOMERS',
      'PRODUCTS',
      'POS',
      'QUOTES',
      'SALES',
      'COUPONS',
      'PAYMENTS',
    ],
  },
  STORE_OFFICER: {
    roleLabel: 'Store / Purchase Officer',
    description: 'Inventory procurement, wholesale supplier coordination, quotes, invoices, and delivery challans',
    defaultView: 'PRODUCTS',
    allowedViews: [
      'SUPPLIERS',
      'PRODUCTS',
      'QUOTES',
      'SALES',
      'COUPONS',
      'CHALLANS',
    ],
  },
  PURCHASE_OFFICER: {
    roleLabel: 'Store / Purchase Officer',
    description: 'Inventory procurement, wholesale supplier coordination, quotes, invoices, and delivery challans',
    defaultView: 'PRODUCTS',
    allowedViews: [
      'SUPPLIERS',
      'PRODUCTS',
      'QUOTES',
      'SALES',
      'COUPONS',
      'CHALLANS',
    ],
  },
};

/**
 * Strict Manager Delegation Governance Rules:
 * Defines which roles a Manager may administer, which additional modules they can enable,
 * and which modules are strictly forbidden from delegation (Default Deny).
 */
export interface RoleDelegationRules {
  canBeManagedBy: readonly UserRole[];
  eligibleAdditionalViews: readonly ActiveView[];
  restrictedViews: readonly ActiveView[];
}

export const ROLE_DELEGATION_RULES: Record<UserRole, RoleDelegationRules> = {
  CASHIER: {
    canBeManagedBy: ['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER'],
    // Eligible tabs a manager can choose to delegate to counter cashier:
    eligibleAdditionalViews: ['CHALLANS', 'EXPENSES', 'INVENTORY'],
    // Restricted tabs: NEVER delegatable to cashier under any circumstances
    restrictedViews: ['REPORTS', 'SETTINGS', 'STAFF', 'SUBSCRIPTIONS', 'SUPPLIERS', 'DASHBOARD', 'SYNC'],
  },
  STORE_OFFICER: {
    canBeManagedBy: ['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER'],
    // Eligible tabs a manager can choose to delegate to store/procurement officer:
    eligibleAdditionalViews: ['INVENTORY', 'EXPENSES'],
    // Restricted tabs: NEVER delegatable to store officer
    restrictedViews: ['POS', 'CUSTOMERS', 'PAYMENTS', 'REPORTS', 'SETTINGS', 'STAFF', 'SUBSCRIPTIONS', 'DASHBOARD', 'SYNC'],
  },
  PURCHASE_OFFICER: {
    canBeManagedBy: ['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER'],
    eligibleAdditionalViews: ['INVENTORY', 'EXPENSES'],
    restrictedViews: ['POS', 'CUSTOMERS', 'PAYMENTS', 'REPORTS', 'SETTINGS', 'STAFF', 'SUBSCRIPTIONS', 'DASHBOARD', 'SYNC'],
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
 * Checks if an actor role is authorized to configure navigation for a target role.
 * Super Admin can configure any role.
 * Manager can only configure CASHIER, STORE_OFFICER, and PURCHASE_OFFICER.
 * Cashier and Store Officer have zero configuration authority.
 */
export function canManagerManageRole(actorRole: UserRole | string | undefined, targetRole: UserRole): boolean {
  if (!actorRole) return false;
  if (actorRole === 'SUPER_ADMIN' || actorRole === 'ORG_ADMIN') return true;
  if (actorRole === 'MANAGER') {
    return targetRole === 'CASHIER' || targetRole === 'STORE_OFFICER' || targetRole === 'PURCHASE_OFFICER';
  }
  return false;
}

/**
 * Checks if an actor is permitted to enable an additional module for a target role.
 * Enforces the explicit delegation allowlist and rejects restricted administrative modules.
 */
export function canManagerEnableModule(
  actorRole: UserRole | string | undefined,
  targetRole: UserRole,
  view: ActiveView
): boolean {
  if (!canManagerManageRole(actorRole, targetRole)) return false;
  
  // Super Admin has full discretion except for non-existent modules
  if (actorRole === 'SUPER_ADMIN' || actorRole === 'ORG_ADMIN') return true;

  // Manager delegation must strictly adhere to the allowlist
  const rules = ROLE_DELEGATION_RULES[targetRole];
  if (!rules) return false;

  // If in restricted views list, reject immediately
  if (rules.restrictedViews.includes(view)) return false;

  // Must be in eligible additional views
  return rules.eligibleAdditionalViews.includes(view);
}

/**
 * Computes the authoritative allowed views for a role, combining immutable baseline policies
 * with permitted, validated overrides from persistent storage.
 */
export function getEffectiveAllowedViews(
  role: UserRole | string | undefined,
  overrides?: Record<string, string[]>
): ActiveView[] {
  if (!role) return [];
  const typedRole = role as UserRole;
  const policy = ROLE_NAVIGATION_POLICIES[typedRole];
  if (!policy) return [];

  const baselineViews = [...policy.allowedViews];
  const rules = ROLE_DELEGATION_RULES[typedRole];
  if (!rules) return baselineViews;

  // If overrides parameter is not supplied, pull from offlineStore safely
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

  const roleOverrides = activeOverrides?.[typedRole];
  if (!roleOverrides || !Array.isArray(roleOverrides)) {
    return baselineViews;
  }

  // Filter overrides: only allow items in eligibleAdditionalViews, never restricted items
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

/**
 * Checks if a specific user role is authorized to view the requested active view.
 * Defaults to false (deny) if permission is not explicitly granted.
 */
export function canAccessView(role: UserRole | string | undefined, view: ActiveView): boolean {
  if (!role) return false;
  const effectiveAllowed = getEffectiveAllowedViews(role);
  return effectiveAllowed.includes(view);
}

/**
 * Returns the default initial landing view for a role.
 */
export function getDefaultViewForRole(role: UserRole | string | undefined): ActiveView {
  if (!role) return 'POS';
  const policy = ROLE_NAVIGATION_POLICIES[role as UserRole];
  return policy ? policy.defaultView : 'POS';
}

/**
 * Returns user-friendly human label for role
 */
export function getRoleDisplayName(role: UserRole | string | undefined): string {
  if (!role) return 'User';
  const policy = ROLE_NAVIGATION_POLICIES[role as UserRole];
  return policy ? policy.roleLabel : String(role);
}

export type RoleNavigationListener = () => void;
const roleNavigationListeners: Set<RoleNavigationListener> = new Set();

/**
 * Subscribes to changes in role navigation configurations and overrides.
 * Returns an unsubscription callback.
 */
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

/**
 * Notifies all active subscribers that role navigation policy overrides have been updated.
 */
export function notifyRoleNavigationChange(): void {
  roleNavigationListeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.error('Error invoking role navigation listener:', err);
    }
  });
}
