/**
 * SLATE POS — Sidebar Navigation Structure & Single-Page URL Route Mapping
 *
 * Centralizes:
 * - Authoritative 6-section sidebar structure (MAIN, SALES, PURCHASE, ACCOUNTS, REPORT, SETTING)
 * - Route-to-module URL mapping & parsing (direct URLs, browser refresh, browser back/forward)
 * - Role-based initial route & direct-URL authorization resolution
 */

import type { ActiveView } from '../components/layout/Sidebar';
import type { UserRole } from '../types';
import { canAccessView, getDefaultViewForRole } from './roleNavigation';

export interface SidebarItemConfig {
  id: ActiveView;
  label: string;
  shortcut?: string;
  spacerBefore?: boolean;
}

export interface SidebarGroupConfig {
  title: 'MAIN' | 'SALES' | 'PURCHASE' | 'ACCOUNTS' | 'SETTING';
  items: readonly SidebarItemConfig[];
}

export const SIDEBAR_NAVIGATION_GROUPS: readonly SidebarGroupConfig[] = [
  {
    title: 'MAIN',
    items: [
      { id: 'DASHBOARD', label: 'Home' },
      { id: 'BANKING', label: 'Banking' },
      { id: 'QUOTES', label: 'Quotation' },
      { id: 'PRODUCTS', label: 'Inventory' },
    ],
  },
  {
    title: 'SALES',
    items: [
      { id: 'CUSTOMERS', label: 'Customers' },
      { id: 'SALES', label: 'Invoice' },
      { id: 'PAYMENTS', label: 'Recipets' },
      { id: 'CREDIT_NOTES', label: 'Credit Notes' },
    ],
  },
  {
    title: 'PURCHASE',
    items: [
      { id: 'SUPPLIERS', label: 'Suppliers' },
      { id: 'PURCHASES', label: 'Bills' },
      { id: 'PURCHASE_PAYMENTS', label: 'Payments' },
      { id: 'DEBIT_NOTES', label: 'Debit Notes' },
      { id: 'EXPENSES', label: 'Expenses' },
    ],
  },
  {
    title: 'ACCOUNTS',
    items: [
      { id: 'JOURNAL', label: 'Journal' },
      { id: 'BULK_UPDATES', label: 'Bulk Updates' },
      { id: 'CHART_OF_ACCOUNTS', label: 'Chart of Accounts' },
      { id: 'REPORTS', label: 'Report' },
    ],
  },
  {
    title: 'SETTING',
    items: [
      { id: 'SETTINGS', label: 'Configure' },
    ],
  },
];

export interface ModuleRouteMeta {
  title: string;
  path: string;
  aliases?: readonly string[];
}

export const MODULE_ROUTE_META: Record<ActiveView, ModuleRouteMeta> = {
  // MAIN
  DASHBOARD: { title: 'Home', path: '/home', aliases: ['/dashboard'] },
  BANKING: { title: 'Banking', path: '/banking' },
  QUOTES: { title: 'Quotation', path: '/quotation', aliases: ['/quotes'] },
  PRODUCTS: { title: 'Inventory', path: '/inventory', aliases: ['/products'] },

  // SALES
  CUSTOMERS: { title: 'Customers', path: '/customers' },
  SALES: { title: 'Invoice', path: '/invoice', aliases: ['/invoices', '/sales'] },
  PAYMENTS: {
    title: 'Recipets',
    path: '/receipts',
    aliases: ['/recipets', '/sales/receipts', '/payments-received'],
  },
  CREDIT_NOTES: { title: 'Credit Notes', path: '/credit-notes' },

  // PURCHASE
  SUPPLIERS: { title: 'Suppliers', path: '/suppliers' },
  PURCHASES: { title: 'Bills', path: '/bills', aliases: ['/purchases'] },
  PURCHASE_PAYMENTS: {
    title: 'Payments',
    path: '/payments',
    aliases: ['/supplier-payments', '/purchase-payments'],
  },
  DEBIT_NOTES: { title: 'Debit Notes', path: '/debit-notes' },
  EXPENSES: { title: 'Expenses', path: '/expenses' },

  // ACCOUNTS
  JOURNAL: { title: 'Journal', path: '/journal' },
  BULK_UPDATES: { title: 'Bulk Updates', path: '/bulk-updates' },
  CHART_OF_ACCOUNTS: { title: 'Chart of Accounts', path: '/chart-of-accounts' },
  REPORTS: { title: 'Report', path: '/summary', aliases: ['/reports', '/report', '/summery'] },

  // SETTING
  SETTINGS: { title: 'Configure', path: '/configure', aliases: ['/settings'] },

  // PRESERVED SECONDARY ROUTES (accessible via Home shortcuts / Configure / Reports tabs / direct URLs)
  POS: { title: 'Checkout', path: '/checkout', aliases: ['/pos'] },
  PURCHASE_ORDERS: { title: 'Purchase Order', path: '/purchase-order', aliases: ['/purchase-orders'] },
  INVENTORY: { title: 'Stock Movements', path: '/stock-movements' },
  SALES_RETURNS: { title: 'Sales Returns', path: '/sales-returns' },
  CHALLANS: { title: 'Delivery Challans', path: '/delivery', aliases: ['/challans'] },
  BUDGETS: { title: 'Budgets', path: '/budgets' },
  TRANSACTIONS: { title: 'Transactions', path: '/transactions' },
  REPORT_AR: { title: 'Receivable', path: '/receivable', aliases: ['/receivables', '/reports/ar'] },
  REPORT_AP: { title: 'Payables', path: '/payables', aliases: ['/reports/ap'] },
  REPORT_CF: { title: 'Cash Flow', path: '/cash-flow', aliases: ['/reports/cf'] },
  REPORT_GL: { title: 'General Ledger', path: '/general-ledger', aliases: ['/reports/gl'] },
  REPORT_PL: { title: 'Profit & Loss', path: '/profit-and-loss', aliases: ['/reports/pl'] },
  REPORT_BS: { title: 'Balance Sheet', path: '/balance-sheet', aliases: ['/reports/bs'] },
  REPORT_TB: { title: 'Trial Balance', path: '/trial-balance', aliases: ['/reports/tb'] },
  REPORT_GST: { title: 'GST / Tax Summary', path: '/gst-summary', aliases: ['/reports/gst'] },
  REPORT_AUDIT: { title: 'Audit Trail', path: '/audit-trail', aliases: ['/reports/audit'] },
  SETTINGS_BRANCHES: { title: 'Branches', path: '/branches', aliases: ['/settings/branches'] },
  SETTINGS_FISCAL: { title: 'Fiscal Year & Locks', path: '/fiscal-settings', aliases: ['/settings/fiscal'] },
  STAFF: { title: 'Users & Roles', path: '/users-roles', aliases: ['/staff'] },
  SUBSCRIPTIONS: { title: 'Subscriptions', path: '/subscriptions' },
  SYNC: { title: 'Sync & Diagnostics', path: '/sync-diagnostics', aliases: ['/sync'] },
};

export function getModuleTitle(view: ActiveView): string {
  return MODULE_ROUTE_META[view]?.title || view;
}

export function getRoutePathForView(view: ActiveView): string {
  return MODULE_ROUTE_META[view]?.path || '/home';
}

function normalizeRouteSegment(raw: string): string {
  const cleaned = raw.trim().split('?')[0].split('#')[0].replace(/\/+$/, '').toLowerCase();
  if (!cleaned) return '/';
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
}

export function resolveViewFromLocation(
  pathname: string,
  hash: string = '',
  search: string = ''
): ActiveView | null {
  // Preserve Supabase password recovery / OAuth callback hashes
  if (
    hash.includes('type=recovery') ||
    hash.includes('access_token=') ||
    hash.includes('reset-password') ||
    search.includes('type=recovery')
  ) {
    return null;
  }

  // Check ?view=VIEW_ID query param if provided
  if (search) {
    try {
      const params = new URLSearchParams(search);
      const qView = params.get('view')?.trim().toUpperCase();
      if (qView && qView in MODULE_ROUTE_META) {
        return qView as ActiveView;
      }
    } catch {
      // ignore malformed search string
    }
  }

  const candidates: string[] = [];
  if (hash && hash.startsWith('#/')) {
    candidates.push(normalizeRouteSegment(hash.slice(1)));
  }
  candidates.push(normalizeRouteSegment(pathname));

  for (const candidate of candidates) {
    if (!candidate || candidate === '/' || candidate === '/index.html') continue;
    for (const [viewKey, meta] of Object.entries(MODULE_ROUTE_META)) {
      if (meta.path === candidate || meta.aliases?.includes(candidate)) {
        return viewKey as ActiveView;
      }
    }
  }

  return null;
}

export function resolveAuthorizedRouteForUser(
  role: UserRole | string | undefined,
  pathname: string = '',
  hash: string = '',
  search: string = ''
): { activeView: ActiveView; deniedView: ActiveView | null } {
  const defaultView = getDefaultViewForRole(role);
  const urlView = resolveViewFromLocation(pathname, hash, search);

  if (!urlView) {
    return { activeView: defaultView, deniedView: null };
  }

  if (canAccessView(role, urlView)) {
    return { activeView: urlView, deniedView: null };
  }

  return { activeView: defaultView, deniedView: urlView };
}
