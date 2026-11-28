/**
 * SLATE POS — Single Authoritative Role & Granular Permission Matrix
 *
 * Enforced consistently across:
 * - React UI routes, navigation, and action buttons
 * - Express API routes (server.ts)
 * - Vercel serverless endpoints (/api/*)
 * - OfflineStore client guards
 * - Mirrored by PostgreSQL RLS & public.has_permission()
 *
 * Role Semantics:
 * - SUPER_ADMIN: Platform & full tenant administration
 * - ORG_ADMIN: Full organization administration (including users, roles, branches, fiscal, subscriptions, operations, finance)
 * - MANAGER: Identical to ORG_ADMIN across all business, operational, inventory, banking, accounting, GST, reports,
 *            branch, fiscal, and settings capabilities — ONLY restricted from user/role management and subscriptions.
 * - CASHIER: Front-desk billing & counter sales only (Customers, Products view-only, POS, Quotes, Sales, Payments).
 *            Strictly blocked from wholesale costs, inventory adjustments, refunds, suppliers, accounting, reports, settings, users.
 * - STORE_OFFICER (and PURCHASE_OFFICER alias): Procurement & inventory only (Suppliers, Products + Stock,
 *            Purchase Orders, Purchases/GRN, Debit Notes, Delivery Challans, read-only Quotes & Sales lookup).
 *            Strictly blocked from creating quotes/invoices, POS checkout, customers, payments, accounting, reports, settings, users.
 */

import type { Permission, UserProfile, UserRole } from '../types';
import type { ActiveView } from '../components/layout/Sidebar';

export type NormalizedUserRole =
  | 'SUPER_ADMIN'
  | 'ORG_ADMIN'
  | 'MANAGER'
  | 'CASHIER'
  | 'STORE_OFFICER';

export type GranularPermission =
  | 'DASHBOARD_VIEW'
  | 'BANKING_VIEW'
  | 'BANKING_MANAGE'
  | 'BANKING_RECONCILE'
  | 'CUSTOMERS_VIEW'
  | 'CUSTOMERS_CREATE'
  | 'CUSTOMERS_EDIT'
  | 'CUSTOMERS_DELETE'
  | 'POS_USE'
  | 'POS_CHECKOUT'
  | 'QUOTES_VIEW'
  | 'QUOTES_CREATE'
  | 'QUOTES_EDIT'
  | 'QUOTES_DELETE'
  | 'SALES_VIEW'
  | 'INVOICES_CREATE'
  | 'PAYMENTS_VIEW'
  | 'PAYMENTS_COLLECT'
  | 'CREDIT_NOTES_MANAGE'
  | 'REFUNDS_CREATE'
  | 'REFUNDS_APPROVE'
  | 'CHALLANS_MANAGE'
  | 'SUPPLIERS_VIEW'
  | 'SUPPLIERS_MANAGE'
  | 'PURCHASE_ORDERS_MANAGE'
  | 'GOODS_RECEIPTS_MANAGE'
  | 'SUPPLIER_BILLS_MANAGE'
  | 'DEBIT_NOTES_MANAGE'
  | 'EXPENSES_VIEW'
  | 'EXPENSES_MANAGE'
  | 'PRODUCTS_VIEW'
  | 'PRODUCTS_CREATE'
  | 'PRODUCTS_EDIT'
  | 'PRODUCTS_COST_VIEW'
  | 'INVENTORY_VIEW'
  | 'INVENTORY_ADJUST'
  | 'STOCK_MOVEMENTS_VIEW'
  | 'COA_MANAGE'
  | 'JOURNAL_MANAGE'
  | 'BUDGETS_MANAGE'
  | 'BUDGETS_APPROVE'
  | 'BULK_UPDATES_MANAGE'
  | 'TRANSACTIONS_VIEW'
  | 'REPORTS_FINANCIAL_VIEW'
  | 'REPORTS_INVENTORY_VIEW'
  | 'REPORTS_GST_VIEW'
  | 'AUDIT_VIEW'
  | 'REPORTS_EXPORT'
  | 'SETTINGS_VIEW'
  | 'ORG_SETTINGS_MANAGE'
  | 'BRANCH_SWITCH'
  | 'BRANCH_MANAGE'
  | 'FISCAL_MANAGE'
  | 'USERS_VIEW'
  | 'USERS_MANAGE'
  | 'ROLES_MANAGE'
  | 'SUBSCRIPTIONS_VIEW'
  | 'SUBSCRIPTIONS_MANAGE'
  | 'SYNC_MANAGE'
  | 'PLATFORM_MANAGE';

export function normalizeRole(role: UserRole | string | undefined | null): NormalizedUserRole | null {
  if (!role) return null;
  const upper = String(role).trim().toUpperCase();
  if (upper === 'PURCHASE_OFFICER') return 'STORE_OFFICER';
  if (
    upper === 'SUPER_ADMIN' ||
    upper === 'ORG_ADMIN' ||
    upper === 'MANAGER' ||
    upper === 'CASHIER' ||
    upper === 'STORE_OFFICER'
  ) {
    return upper;
  }
  return null;
}

const MANAGER_CORE_PERMISSIONS: readonly GranularPermission[] = [
  'DASHBOARD_VIEW',
  'BANKING_VIEW',
  'BANKING_MANAGE',
  'BANKING_RECONCILE',
  'CUSTOMERS_VIEW',
  'CUSTOMERS_CREATE',
  'CUSTOMERS_EDIT',
  'CUSTOMERS_DELETE',
  'POS_USE',
  'POS_CHECKOUT',
  'QUOTES_VIEW',
  'QUOTES_CREATE',
  'QUOTES_EDIT',
  'QUOTES_DELETE',
  'SALES_VIEW',
  'INVOICES_CREATE',
  'PAYMENTS_VIEW',
  'PAYMENTS_COLLECT',
  'CREDIT_NOTES_MANAGE',
  'REFUNDS_CREATE',
  'REFUNDS_APPROVE',
  'CHALLANS_MANAGE',
  'SUPPLIERS_VIEW',
  'SUPPLIERS_MANAGE',
  'PURCHASE_ORDERS_MANAGE',
  'GOODS_RECEIPTS_MANAGE',
  'SUPPLIER_BILLS_MANAGE',
  'DEBIT_NOTES_MANAGE',
  'EXPENSES_VIEW',
  'EXPENSES_MANAGE',
  'PRODUCTS_VIEW',
  'PRODUCTS_CREATE',
  'PRODUCTS_EDIT',
  'PRODUCTS_COST_VIEW',
  'INVENTORY_VIEW',
  'INVENTORY_ADJUST',
  'STOCK_MOVEMENTS_VIEW',
  'COA_MANAGE',
  'JOURNAL_MANAGE',
  'BUDGETS_MANAGE',
  'BUDGETS_APPROVE',
  'BULK_UPDATES_MANAGE',
  'TRANSACTIONS_VIEW',
  'REPORTS_FINANCIAL_VIEW',
  'REPORTS_INVENTORY_VIEW',
  'REPORTS_GST_VIEW',
  'AUDIT_VIEW',
  'REPORTS_EXPORT',
  'SETTINGS_VIEW',
  'ORG_SETTINGS_MANAGE',
  'BRANCH_SWITCH',
  'BRANCH_MANAGE',
  'FISCAL_MANAGE',
  'USERS_VIEW',
  'SYNC_MANAGE',
];

const ORG_ADMIN_PERMISSIONS: readonly GranularPermission[] = [
  ...MANAGER_CORE_PERMISSIONS,
  'USERS_MANAGE',
  'ROLES_MANAGE',
  'SUBSCRIPTIONS_VIEW',
  'SUBSCRIPTIONS_MANAGE',
];

const SUPER_ADMIN_PERMISSIONS: readonly GranularPermission[] = [
  ...ORG_ADMIN_PERMISSIONS,
  'PLATFORM_MANAGE',
];

const CASHIER_PERMISSIONS: readonly GranularPermission[] = [
  'POS_USE',
  'POS_CHECKOUT',
  'CUSTOMERS_VIEW',
  'CUSTOMERS_CREATE',
  'CUSTOMERS_EDIT',
  'PRODUCTS_VIEW',
  'QUOTES_VIEW',
  'QUOTES_CREATE',
  'QUOTES_EDIT',
  'SALES_VIEW',
  'INVOICES_CREATE',
  'PAYMENTS_VIEW',
  'PAYMENTS_COLLECT',
];

const STORE_OFFICER_PERMISSIONS: readonly GranularPermission[] = [
  'SUPPLIERS_VIEW',
  'SUPPLIERS_MANAGE',
  'PRODUCTS_VIEW',
  'PRODUCTS_CREATE',
  'PRODUCTS_EDIT',
  'PRODUCTS_COST_VIEW',
  'INVENTORY_VIEW',
  'INVENTORY_ADJUST',
  'STOCK_MOVEMENTS_VIEW',
  'QUOTES_VIEW',
  'SALES_VIEW',
  'CHALLANS_MANAGE',
  'PURCHASE_ORDERS_MANAGE',
  'GOODS_RECEIPTS_MANAGE',
  'SUPPLIER_BILLS_MANAGE',
  'DEBIT_NOTES_MANAGE',
  'REPORTS_INVENTORY_VIEW',
];

const ROLE_PERMISSION_SETS: Record<NormalizedUserRole, ReadonlySet<GranularPermission>> = {
  SUPER_ADMIN: new Set(SUPER_ADMIN_PERMISSIONS),
  ORG_ADMIN: new Set(ORG_ADMIN_PERMISSIONS),
  MANAGER: new Set(MANAGER_CORE_PERMISSIONS),
  CASHIER: new Set(CASHIER_PERMISSIONS),
  STORE_OFFICER: new Set(STORE_OFFICER_PERMISSIONS),
};

export function getRolePermissions(role: UserRole | string | undefined | null): GranularPermission[] {
  const normalized = normalizeRole(role);
  if (!normalized) return [];
  return Array.from(ROLE_PERMISSION_SETS[normalized]);
}

function extractRole(userOrRole: UserProfile | UserRole | string | undefined | null): NormalizedUserRole | null {
  if (!userOrRole) return null;
  if (typeof userOrRole === 'string') return normalizeRole(userOrRole);
  return normalizeRole(userOrRole.role);
}

export function hasPermission(
  userOrRole: UserProfile | UserRole | string | undefined | null,
  permission: GranularPermission
): boolean {
  const normalized = extractRole(userOrRole);
  if (!normalized) return false;
  return ROLE_PERMISSION_SETS[normalized].has(permission);
}

export function hasAnyPermission(
  userOrRole: UserProfile | UserRole | string | undefined | null,
  permissions: readonly GranularPermission[]
): boolean {
  const normalized = extractRole(userOrRole);
  if (!normalized) return false;
  const set = ROLE_PERMISSION_SETS[normalized];
  return permissions.some((p) => set.has(p));
}

export function canManageUsers(actor: UserProfile | UserRole | string | undefined | null): boolean {
  return hasPermission(actor, 'USERS_MANAGE');
}

export function canManageRoles(actor: UserProfile | UserRole | string | undefined | null): boolean {
  return hasPermission(actor, 'ROLES_MANAGE');
}

export function canSwitchOrgBranches(actor: UserProfile | UserRole | string | undefined | null): boolean {
  return hasPermission(actor, 'BRANCH_SWITCH');
}

export const VIEW_REQUIRED_PERMISSION: Record<ActiveView, GranularPermission> = {
  DASHBOARD: 'DASHBOARD_VIEW',
  BANKING: 'BANKING_VIEW',
  CUSTOMERS: 'CUSTOMERS_VIEW',
  POS: 'POS_USE',
  QUOTES: 'QUOTES_VIEW',
  SALES: 'SALES_VIEW',
  PAYMENTS: 'PAYMENTS_VIEW',
  CREDIT_NOTES: 'CREDIT_NOTES_MANAGE',
  SALES_RETURNS: 'REFUNDS_CREATE',
  CHALLANS: 'CHALLANS_MANAGE',
  SUPPLIERS: 'SUPPLIERS_VIEW',
  PURCHASE_ORDERS: 'PURCHASE_ORDERS_MANAGE',
  PURCHASES: 'SUPPLIER_BILLS_MANAGE',
  PURCHASE_PAYMENTS: 'SUPPLIER_BILLS_MANAGE',
  DEBIT_NOTES: 'DEBIT_NOTES_MANAGE',
  EXPENSES: 'EXPENSES_VIEW',
  PRODUCTS: 'PRODUCTS_VIEW',
  INVENTORY: 'INVENTORY_VIEW',
  JOURNAL: 'JOURNAL_MANAGE',
  BUDGETS: 'BUDGETS_MANAGE',
  BULK_UPDATES: 'BULK_UPDATES_MANAGE',
  CHART_OF_ACCOUNTS: 'COA_MANAGE',
  TRANSACTIONS: 'TRANSACTIONS_VIEW',
  REPORTS: 'REPORTS_FINANCIAL_VIEW',
  REPORT_PL: 'REPORTS_FINANCIAL_VIEW',
  REPORT_BS: 'REPORTS_FINANCIAL_VIEW',
  REPORT_CF: 'REPORTS_FINANCIAL_VIEW',
  REPORT_TB: 'REPORTS_FINANCIAL_VIEW',
  REPORT_GL: 'REPORTS_FINANCIAL_VIEW',
  REPORT_AR: 'REPORTS_FINANCIAL_VIEW',
  REPORT_AP: 'REPORTS_FINANCIAL_VIEW',
  REPORT_GST: 'REPORTS_GST_VIEW',
  REPORT_AUDIT: 'AUDIT_VIEW',
  SETTINGS: 'SETTINGS_VIEW',
  SETTINGS_BRANCHES: 'BRANCH_MANAGE',
  SETTINGS_FISCAL: 'FISCAL_MANAGE',
  STAFF: 'USERS_MANAGE',
  SUBSCRIPTIONS: 'SUBSCRIPTIONS_MANAGE',
  SYNC: 'SYNC_MANAGE',
};

export function toLegacyPermissions(role: UserRole | string | undefined | null): Permission[] {
  const normalized = normalizeRole(role);
  switch (normalized) {
    case 'SUPER_ADMIN':
      return [
        'POS_USE', 'PRODUCT_VIEW', 'PRODUCT_CREATE', 'PRODUCT_EDIT', 'PRODUCT_COST_VIEW',
        'INVENTORY_ADJUST', 'CUSTOMER_VIEW', 'CUSTOMER_EDIT', 'SALES_VIEW', 'INVOICE_CREATE',
        'REFUND_CREATE', 'REFUND_APPROVE', 'REPORT_VIEW', 'REPORT_EXPORT', 'BUSINESS_SETTINGS',
        'STAFF_MANAGE', 'BRANCH_MANAGE', 'SUBSCRIPTION_MANAGE', 'PLATFORM_MANAGE',
      ];
    case 'ORG_ADMIN':
      return [
        'POS_USE', 'PRODUCT_VIEW', 'PRODUCT_CREATE', 'PRODUCT_EDIT', 'PRODUCT_COST_VIEW',
        'INVENTORY_ADJUST', 'CUSTOMER_VIEW', 'CUSTOMER_EDIT', 'SALES_VIEW', 'INVOICE_CREATE',
        'REFUND_CREATE', 'REFUND_APPROVE', 'REPORT_VIEW', 'REPORT_EXPORT', 'BUSINESS_SETTINGS',
        'STAFF_MANAGE', 'BRANCH_MANAGE', 'SUBSCRIPTION_MANAGE',
      ];
    case 'MANAGER':
      return [
        'POS_USE', 'PRODUCT_VIEW', 'PRODUCT_CREATE', 'PRODUCT_EDIT', 'PRODUCT_COST_VIEW',
        'INVENTORY_ADJUST', 'CUSTOMER_VIEW', 'CUSTOMER_EDIT', 'SALES_VIEW', 'INVOICE_CREATE',
        'REFUND_CREATE', 'REFUND_APPROVE', 'REPORT_VIEW', 'REPORT_EXPORT', 'BUSINESS_SETTINGS',
        'BRANCH_MANAGE',
      ];
    case 'CASHIER':
      return [
        'POS_USE', 'PRODUCT_VIEW', 'CUSTOMER_VIEW', 'CUSTOMER_EDIT',
        'SALES_VIEW', 'INVOICE_CREATE',
      ];
    case 'STORE_OFFICER':
      return [
        'PRODUCT_VIEW', 'PRODUCT_CREATE', 'PRODUCT_EDIT', 'PRODUCT_COST_VIEW', 'INVENTORY_ADJUST',
        'SUPPLIER_VIEW', 'SUPPLIER_EDIT', 'QUOTES_VIEW', 'INVOICE_VIEW', 'DELIVERY_MANAGE',
        'PURCHASE_VIEW', 'PURCHASE_CREATE', 'PURCHASE_RECEIVE',
      ];
    default:
      return [];
  }
}
