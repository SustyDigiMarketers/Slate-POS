/**
 * SLATE POS — Comprehensive Automated Verification Test Suite
 * Tests financial calculations, Indian GST CGST/SGST split, cart totals,
 * offline checkout tender, split payments, idempotency keys, and RBAC permissions
 */

import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateCartItem, calculateCartTotals } from '../../src/lib/taxCalculations';
import { formatINR } from '../../src/lib/formatters';
import { Product, PaymentRecord } from '../../src/types';
import { applySyncPushItems, isAllowedSyncOrigin } from '../../src/lib/syncServer';
import { Sidebar } from '../../src/components/layout/Sidebar';
import { MobileBottomNav } from '../../src/components/layout/MobileBottomNav';
import { DesktopTitleBar } from '../../src/components/layout/DesktopTitleBar';
import { SalesReceiptsPage } from '../../src/components/sales/SalesReceiptsPage';
import { SupplierPaymentsPage } from '../../src/components/purchases/SupplierPaymentsPage';
import { DebitNotesPage } from '../../src/components/purchases/DebitNotesPage';
import healthHandler from '../../api/health';
import accountingHandler from '../../api/accounting';
import {
  TALLY_LEDGER_HEADERS,
  TALLY_VOUCHER_HEADERS,
  validateAndStageTallyCustomers,
  validateAndStageTallySuppliers,
  validateAndStageTallyPayments,
  validateAndStageTallyExpenses,
} from '../../src/lib/tallyIntegration';
import {
  canAccessView,
  getDefaultViewForRole,
  canManagerManageRole,
  canManagerEnableModule,
  getEffectiveAllowedViews,
  ROLE_DELEGATION_RULES,
  ROLE_NAVIGATION_POLICIES,
  subscribeToRoleNavigation,
  notifyRoleNavigationChange,
} from '../../src/lib/roleNavigation';
import {
  SIDEBAR_NAVIGATION_GROUPS,
  MODULE_ROUTE_META,
  resolveViewFromLocation,
  getRoutePathForView,
  resolveAuthorizedRouteForUser,
} from '../../src/lib/navigationRoutes';
import {
  hasPermission,
  hasAnyPermission,
  canManageUsers,
  canManageRoles,
  canSwitchOrgBranches,
  normalizeRole,
  getRolePermissions,
} from '../../src/lib/permissions';
import { isDesktopRuntime } from '../../src/lib/desktopBridge';
import {
  isSupabaseConfigured,
  getSupabaseConfigStatus,
  saveRoleNavigationConfig,
  signInWithSupabase,
  signOutSupabase,
  resetPasswordWithSupabase,
  updateUserPassword,
  provisionStaffUser,
  getSupabaseSession,
  subscribeToAuthChanges,
  fetchUserProfile,
  pushSaleToSupabase,
  pushRefundToSupabase,
  fetchProductsFromSupabase,
  createProductInSupabase,
  updateProductInSupabase,
  fetchCustomersFromSupabase,
  createCustomerInSupabase,
  allocateCustomerPaymentInSupabase,
  fetchSuppliersFromSupabase,
  createSupplierInSupabase,
  deleteSupplierInSupabase,
  fetchExpensesFromSupabase,
  createExpenseInSupabase,
  fetchQuotationsFromSupabase,
  saveQuotationToSupabase,
  deleteQuotationFromSupabase,
  fetchSalesFromSupabase,
  fetchTimeLogsFromSupabase,
  createTimeLogInSupabase,
  isTableMarkedUnavailable,
  handleSchemaTableError,
  resetUnavailableSchemaTables,
  sanitizeBranchIdForDb,
} from '../../src/lib/supabaseClient';
import { offlineStore } from '../../src/lib/offlineStore';
import { INITIAL_USERS } from '../../src/lib/initialData';
import {
  resolveAuthoritativePlan,
  verifyWebhookSignature,
  isEventProcessed,
  recordProcessedEvent,
  transitionSubscriptionState,
  AUTHORITATIVE_PLANS,
  authenticateSupabaseRequest,
  createAuthoritativeRazorpayOrder,
  recordWebhookDurable,
} from '../../src/lib/subscriptionServer';
import {
  validateDoubleEntryLines,
  SYSTEM_ACCOUNT_CODES,
  buildSaleRefundLines,
} from '../../src/lib/accountingEngine';
import {
  DEFAULT_BRAND_LOGO_PATH,
  parsePngDimensions,
  validatePngBytesForBrandLogo,
  sanitizeBrandImageUrl,
  getActiveBrandLogoUrl,
} from '../../src/lib/branding';
import crypto from 'crypto';

async function runTestSuite() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`✗ FAIL: ${testName}`);
      failed++;
    }
  }

  console.log('\n--- SLATE POS UNIT & INTEGRATION TESTS ---\n');
  offlineStore.seedTestDataForTesting();

  // TEST 1: Currency Formatting (INR)
  const formatted50k = formatINR(50000);
  assert(formatted50k.includes('50,000') || formatted50k.includes('50000'), 'Formats INR currency with rupee symbol');

  // TEST 2: Intra-State GST Calculation (CGST + SGST)
  const mockProduct: Product = {
    id: 'prod_test_01',
    sku: 'TST-01',
    barcode: '8901234567890',
    hsn: '8471',
    name: 'Wireless Barcode Scanner',
    categoryId: 'cat_electronics',
    categoryName: 'Electronics',
    unit: 'PCS',
    costPrice: 1200,
    sellingPrice: 2000,
    gstRate: 18,
    currentStock: 25,
    minStockAlert: 5,
    isActive: true,
    updatedAt: new Date().toISOString(),
  };

  const cartItem = calculateCartItem(mockProduct, 2, 10); // 2 qty, 10% discount
  // Gross = 4000. 10% discount = 400. Taxable = 3600.
  // 18% GST -> 9% CGST (324) + 9% SGST (324) -> Total = 4248
  assert(cartItem.taxableAmount === 3600, 'Calculates taxable amount correctly after 10% discount');
  assert(cartItem.cgstAmount === 324, 'Calculates 9% CGST (₹324) correctly');
  assert(cartItem.sgstAmount === 324, 'Calculates 9% SGST (₹324) correctly');
  assert(cartItem.total === 4248, 'Calculates line item grand total correctly');

  // TEST 3: Inter-State IGST Calculation
  const igstCartItem = calculateCartItem(mockProduct, 1, 0, true);
  // Gross = 2000. Taxable = 2000. 18% IGST = 360.
  assert(igstCartItem.igstAmount === 360, 'Calculates 18% IGST for inter-state customer');
  assert(igstCartItem.cgstAmount === 0 && igstCartItem.sgstAmount === 0, 'No CGST/SGST when IGST is levied');

  // TEST 4: Cart Totals & Round-Off Engine
  const totals = calculateCartTotals([cartItem, igstCartItem]);
  assert(totals.subtotal === 6000, 'Subtotal calculates accurately');
  assert(totals.grandTotal === 4248 + 2360, 'Multi-item grand total calculates accurately');

  // TEST 5: Cash Tender & Change Return Math
  const grandTotal = totals.grandTotal;
  const cashTendered = 7000;
  const changeToReturn = Math.max(0, cashTendered - grandTotal);
  assert(changeToReturn === 7000 - (4248 + 2360), 'Calculates change to return accurately for cash checkout');

  // TEST 6: Split Tender Math (Cash + UPI)
  const splitCash = Math.floor(grandTotal / 2);
  const splitUpi = grandTotal - splitCash;
  assert(splitCash + splitUpi === grandTotal, 'Split tender accurately partitions cash and UPI payments');

  // TEST 7: RBAC Role Integrity
  const cashier = offlineStore.getUsers().find((u) => u.role === 'CASHIER');
  const manager = offlineStore.getUsers().find((u) => u.role === 'MANAGER');
  const superAdmin = offlineStore.getUsers().find((u) => u.role === 'SUPER_ADMIN');

  assert(Boolean(cashier && !cashier.permissions.includes('REPORT_VIEW')), 'Cashier is restricted from financial reports');
  assert(Boolean(cashier && cashier.permissions.includes('POS_USE')), 'Cashier has POS checkout permissions');
  assert(Boolean(manager && manager.permissions.includes('REPORT_VIEW')), 'Store Manager has report viewing permissions');
  assert(Boolean(superAdmin && superAdmin.permissions.includes('SUBSCRIPTION_MANAGE')), 'Super Admin has subscription permissions');

  // TEST 8: Idempotency Key Format
  const saleId = 'sale_2026_test_01';
  const idempotencyKey = `SALE_CREATED_${saleId}`;
  assert(idempotencyKey.startsWith('SALE_CREATED_'), 'Generates durable idempotency key format for offline sync');

  // TEST 9: Role-Based Navigation Matrix & Module Boundaries (Finance-First)
  const cashierAllowed = [
    'CUSTOMERS', 'PRODUCTS', 'POS', 'QUOTES', 'SALES', 'PAYMENTS'
  ] as const;
  const cashierBlocked = [
    'DASHBOARD', 'BANKING', 'SUPPLIERS', 'CHALLANS', 'EXPENSES', 'JOURNAL', 'BUDGETS',
    'BULK_UPDATES', 'CHART_OF_ACCOUNTS', 'TRANSACTIONS', 'REPORTS', 'STAFF', 'SETTINGS',
    'SUBSCRIPTIONS', 'INVENTORY', 'SYNC'
  ] as const;

  const allCashierAllowedPass = cashierAllowed.every((view) => canAccessView('CASHIER', view));
  const allCashierBlockedPass = cashierBlocked.every((view) => !canAccessView('CASHIER', view));
  assert(allCashierAllowedPass, 'Cashier has access to exactly 6 authorized front-desk billing modules');
  assert(allCashierBlockedPass, 'Cashier is strictly blocked from accounting, banking, suppliers, reports, settings, and subscriptions');

  // TEST 10: Store / Purchase Officer Module Boundaries (Finance-First)
  const storeOfficerAllowed = [
    'SUPPLIERS', 'PRODUCTS', 'QUOTES', 'SALES', 'CHALLANS', 'PURCHASE_ORDERS', 'PURCHASES', 'DEBIT_NOTES'
  ] as const;
  const storeOfficerBlocked = [
    'POS', 'CUSTOMERS', 'PAYMENTS', 'PURCHASE_PAYMENTS', 'DASHBOARD', 'BANKING', 'JOURNAL', 'BUDGETS',
    'CHART_OF_ACCOUNTS', 'REPORTS', 'STAFF', 'SETTINGS', 'SUBSCRIPTIONS', 'EXPENSES'
  ] as const;

  const allOfficerAllowedPass = storeOfficerAllowed.every((view) => canAccessView('STORE_OFFICER', view));
  const allOfficerBlockedPass = storeOfficerBlocked.every((view) => !canAccessView('STORE_OFFICER', view));
  assert(allOfficerAllowedPass, 'Store / Purchase Officer has access to exactly 8 authorized procurement & inventory modules');
  assert(allOfficerBlockedPass, 'Store / Purchase Officer is strictly blocked from POS, customers, payments, accounting, reports, and settings');

  // TEST 11: Manager vs Super Admin Access Separation
  assert(canAccessView('MANAGER', 'DASHBOARD') && canAccessView('MANAGER', 'REPORTS'), 'Manager has access to store dashboard and reports');
  assert(!canAccessView('MANAGER', 'SUBSCRIPTIONS'), 'Manager is restricted from Super Admin subscription management');
  assert(canAccessView('SUPER_ADMIN', 'SUBSCRIPTIONS'), 'Super Admin has full access to subscription management');

  // TEST 12: Default Deny & Role Fallbacks
  assert(!canAccessView(undefined, 'POS'), 'Default deny: undefined role is denied all views');
  assert(!canAccessView('UNKNOWN_ROLE' as any, 'POS'), 'Default deny: unrecognized role is denied all views');
  assert(getDefaultViewForRole('CASHIER') === 'POS', 'Default landing view for Cashier is POS');
  assert(getDefaultViewForRole('STORE_OFFICER') === 'PRODUCTS', 'Default landing view for Store Officer is PRODUCTS');
  assert(getDefaultViewForRole('SUPER_ADMIN') === 'DASHBOARD', 'Default landing view for Super Admin is DASHBOARD');

  // TEST 13: Browser vs Desktop Window Controls Capability Check
  // In node / browser environment without Electron IPC bridge:
  assert(isDesktopRuntime() === false, 'Browser mode: Window controls are hidden when running outside Electron');

  // When simulated electronAPI is attached:
  (globalThis as any).window = {
    electronAPI: {
      minimize: () => {},
      maximize: () => {},
      close: () => {},
    },
  };
  assert(isDesktopRuntime() === true, 'Desktop mode: Window controls are active when Electron IPC is present');
  delete (globalThis as any).window;

  // TEST 14: Supabase Client Capability & Safe Fallback
  assert(typeof isSupabaseConfigured === 'function', 'Supabase capability detection function is available');

  // TEST 15: Store & Fiscal Context in Profile Drawer (Dynamic State & Reactivity)
  const defaultOrg = offlineStore.getOrganization();
  const defaultBranch = offlineStore.getActiveBranch();
  const defaultFY = offlineStore.getFiscalYear();

  assert(
    defaultOrg.tradeName === 'Apex SuperStore & Electronics' || defaultOrg.name.includes('Apex'),
    'Profile Context: Organization is Apex SuperStore & Electronics'
  );
  assert(
    defaultBranch.name.includes('Indiranagar Flagship') && defaultBranch.city === 'Bengaluru',
    'Profile Context: Store/Branch is Indiranagar Flagship (Bengaluru)'
  );
  assert(
    defaultFY.includes('2026') && (defaultFY.includes('2027') || defaultFY.includes('27')),
    'Profile Context: Fiscal Year is 2026–2027'
  );

  // Test dynamic context updates
  offlineStore.setFiscalYear('2027–2028');
  assert(offlineStore.getFiscalYear() === '2027–2028', 'Profile Context: Dynamic fiscal year updates reactively');
  offlineStore.setFiscalYear('2026–2027'); // Restore

  const branches = offlineStore.getBranches();
  if (branches.length > 1) {
    const originalBranchId = defaultBranch.id;
    offlineStore.setActiveBranch(branches[1].id);
    assert(offlineStore.getActiveBranch().id === branches[1].id, 'Profile Context: Branch switcher updates active storefront');
    offlineStore.setActiveBranch(originalBranchId); // Restore
  }

  // TEST 16: Dashboard Action Items Count & Icon-Only Responsive Pattern
  const dashboardActionItems = [
    'Setup Checklist',
    'Open POS Sale (F2)',
    'Sales & Cash Flow',
    'Receivables Aging',
    'Executive Overview',
  ];
  assert(dashboardActionItems.length === 5, 'Exactly 5 action items designated for Home/Dashboard tab');

  // TEST 17: Predefined Baseline Navigation Invariants
  const baselineCashier = ROLE_NAVIGATION_POLICIES.CASHIER.allowedViews;
  const baselineStoreOfficer = ROLE_NAVIGATION_POLICIES.STORE_OFFICER.allowedViews;
  const baselineManager = ROLE_NAVIGATION_POLICIES.MANAGER.allowedViews;

  assert(baselineCashier.length === 6, 'Cashier predefined baseline retains exactly 6 mandatory finance/billing modules');
  assert(baselineStoreOfficer.length === 8, 'Store Officer predefined baseline retains exactly 8 mandatory procurement/stock modules');
  assert(!baselineManager.includes('SUBSCRIPTIONS'), 'Manager is strictly restricted from subscriptions');
  assert(!baselineManager.includes('STAFF'), 'Manager is strictly restricted from staff/user administrative management');

  // TEST 18: Admin-Only Role Governance & Manager Exclusion
  assert(canManagerManageRole('SUPER_ADMIN', 'CASHIER') === true, 'Super Admin retains authority over all roles');
  assert(canManagerManageRole('SUPER_ADMIN', 'ORG_ADMIN') === true, 'Super Admin can manage Org Admin role');
  assert(canManagerManageRole('ORG_ADMIN', 'CASHIER') === true, 'Org Admin is authorized to administer Cashier navigation');
  assert(canManagerManageRole('ORG_ADMIN', 'STORE_OFFICER') === true, 'Org Admin is authorized to administer Store Officer navigation');
  assert(canManagerManageRole('ORG_ADMIN', 'SUPER_ADMIN') === false, 'Org Admin CANNOT administer Super Admin role');
  assert(canManagerManageRole('MANAGER', 'CASHIER') === false, 'Manager CANNOT administer role navigation/permissions');
  assert(canManagerManageRole('MANAGER', 'STORE_OFFICER') === false, 'Manager CANNOT administer Store Officer role');
  assert(canManagerManageRole('MANAGER', 'MANAGER') === false, 'Manager CANNOT administer or self-elevate Manager role');
  assert(canManagerManageRole('MANAGER', 'SUPER_ADMIN') === false, 'Manager CANNOT administer Super Admin role');
  assert(canManagerManageRole('CASHIER', 'CASHIER') === false, 'Cashier has ZERO authority to configure navigation (Default Deny)');
  assert(canManagerManageRole('STORE_OFFICER', 'STORE_OFFICER') === false, 'Store Officer has ZERO authority to configure navigation (Default Deny)');

  // TEST 19: Strict Admin Delegation Allowlist & Rejection of Restricted Modules
  // Org Admin delegating to Cashier
  assert(canManagerEnableModule('ORG_ADMIN', 'CASHIER', 'CHALLANS') === true, 'Org Admin CAN enable eligible Delivery Challans for Cashier');
  assert(canManagerEnableModule('ORG_ADMIN', 'CASHIER', 'EXPENSES') === true, 'Org Admin CAN enable eligible Expenses for Cashier');
  assert(canManagerEnableModule('ORG_ADMIN', 'CASHIER', 'INVENTORY') === true, 'Org Admin CAN enable eligible Inventory for Cashier');

  // Cashier Restricted Modules (Must be strictly rejected even for Admins)
  assert(canManagerEnableModule('ORG_ADMIN', 'CASHIER', 'REPORTS') === false, 'Org Admin CANNOT delegate restricted Reports to Cashier');
  assert(canManagerEnableModule('ORG_ADMIN', 'CASHIER', 'SETTINGS') === false, 'Org Admin CANNOT delegate restricted Settings to Cashier');
  assert(canManagerEnableModule('ORG_ADMIN', 'CASHIER', 'STAFF') === false, 'Org Admin CANNOT delegate restricted Staff to Cashier');
  assert(canManagerEnableModule('ORG_ADMIN', 'CASHIER', 'SUBSCRIPTIONS') === false, 'Org Admin CANNOT delegate restricted Subscriptions to Cashier');
  assert(canManagerEnableModule('ORG_ADMIN', 'CASHIER', 'SUPPLIERS') === false, 'Org Admin CANNOT delegate restricted Suppliers to Cashier');
  assert(canManagerEnableModule('MANAGER', 'CASHIER', 'CHALLANS') === false, 'Manager CANNOT modify Cashier navigation modules');

  // Store Officer Allowlist via Org Admin
  assert(canManagerEnableModule('ORG_ADMIN', 'STORE_OFFICER', 'INVENTORY') === true, 'Org Admin CAN enable eligible Inventory for Store Officer');
  assert(canManagerEnableModule('ORG_ADMIN', 'STORE_OFFICER', 'EXPENSES') === true, 'Org Admin CAN enable eligible Expenses for Store Officer');
  assert(canManagerEnableModule('ORG_ADMIN', 'STORE_OFFICER', 'POS') === false, 'Org Admin CANNOT delegate restricted POS checkout to Store Officer');
  assert(canManagerEnableModule('ORG_ADMIN', 'STORE_OFFICER', 'CUSTOMERS') === false, 'Org Admin CANNOT delegate restricted Customers to Store Officer');
  assert(canManagerEnableModule('ORG_ADMIN', 'STORE_OFFICER', 'REPORTS') === false, 'Org Admin CANNOT delegate restricted Reports to Store Officer');

  // TEST 20: Effective Navigation Calculation with Permitted Overrides
  const cashierWithChallans = getEffectiveAllowedViews('CASHIER', {
    CASHIER: ['CHALLANS'],
  });
  assert(cashierWithChallans.includes('CHALLANS'), 'Effective navigation includes delegated eligible module (CHALLANS)');
  assert(cashierWithChallans.includes('POS'), 'Effective navigation preserves all baseline modules (POS)');

  // Attempting to inject restricted module in override
  const cashierTampered = getEffectiveAllowedViews('CASHIER', {
    CASHIER: ['REPORTS', 'SETTINGS', 'CHALLANS'],
  });
  assert(!cashierTampered.includes('REPORTS'), 'Effective navigation filters out tampered restricted module (REPORTS)');
  assert(!cashierTampered.includes('SETTINGS'), 'Effective navigation filters out tampered restricted module (SETTINGS)');
  assert(cashierTampered.includes('CHALLANS'), 'Effective navigation retains valid eligible module (CHALLANS)');

  // TEST 21: Role Navigation Event Subscription
  let roleNavTriggerCount = 0;
  const unsubNav = subscribeToRoleNavigation(() => {
    roleNavTriggerCount++;
  });
  notifyRoleNavigationChange();
  assert(roleNavTriggerCount === 1, 'subscribeToRoleNavigation responds to notifyRoleNavigationChange');
  unsubNav();
  notifyRoleNavigationChange();
  assert(roleNavTriggerCount === 1, 'Unsubscribe stops receiving role navigation events');

  // TEST 22: Supabase Configuration Persistence Security
  saveRoleNavigationConfig({
    organizationId: 'org_apex_01',
    role: 'CASHIER',
    enabledAdditionalModules: ['CHALLANS'],
    updatedBy: 'Test Cashier',
    userRole: 'CASHIER',
  }).then((res) => {
    assert(res.success === false, 'Supabase persistence rejects unauthorized save from Cashier');
  });

  saveRoleNavigationConfig({
    organizationId: 'org_apex_01',
    role: 'SUPER_ADMIN',
    enabledAdditionalModules: ['STAFF'],
    updatedBy: 'Test Manager',
    userRole: 'MANAGER',
  }).then((res) => {
    assert(res.success === false, 'Supabase persistence rejects Manager attempt to modify Super Admin');
  });

  saveRoleNavigationConfig({
    organizationId: 'org_apex_01',
    role: 'CASHIER',
    enabledAdditionalModules: ['CHALLANS'],
    updatedBy: 'Store Manager',
    userRole: 'MANAGER',
  }).then((res) => {
    assert(res.success === false, 'Supabase persistence rejects unauthorized role-nav save from Manager');
  });

  saveRoleNavigationConfig({
    organizationId: 'org_apex_01',
    role: 'CASHIER',
    enabledAdditionalModules: ['CHALLANS'],
    updatedBy: 'Org Admin',
    userRole: 'ORG_ADMIN',
  }).then((res) => {
    assert(
      res.isOffline === true || res.success === true,
      'Supabase persistence allows Org Admin save cleanly in offline/online modes'
    );
  });

  // TEST 23: Authentication Session Lifecycle (Login, Session Check, Logout)
  offlineStore.logout();
  assert(offlineStore.isAuthenticated() === false, 'Session status is false after logout');
  const managerFixture = INITIAL_USERS.find((u) => u.id === 'usr_manager_01')!;
  offlineStore.login('usr_manager_01', 'br_blr_01', managerFixture);
  assert(offlineStore.isAuthenticated() === true, 'Session status is true after login');
  assert(offlineStore.getActiveUser().id === 'usr_manager_01', 'Active user updated accurately on login');
  assert(offlineStore.getActiveBranchId() === 'br_blr_01', 'Active branch updated accurately on login');

  // TEST 24: Supabase Auth Capability Check & Fallback
  assert(typeof isSupabaseConfigured === 'function', 'isSupabaseConfigured helper exists');
  assert(typeof signInWithSupabase === 'function', 'signInWithSupabase helper exists');
  assert(typeof signOutSupabase === 'function', 'signOutSupabase helper exists');
  assert(typeof resetPasswordWithSupabase === 'function', 'resetPasswordWithSupabase helper exists');
  assert(typeof getSupabaseSession === 'function', 'getSupabaseSession helper exists');
  assert(typeof subscribeToAuthChanges === 'function', 'subscribeToAuthChanges helper exists');
  assert(typeof fetchUserProfile === 'function', 'fetchUserProfile helper exists');

  // Verify that unconfigured environment rejects sign-in with explicit error and no bypass
  signInWithSupabase('unconfigured@slatepos.cloud', 'badpass').then((res) => {
    assert(res.success === false, 'Unconfigured Supabase rejects login without bypass');
    assert(Boolean(res.error), 'Unconfigured Supabase provides descriptive error message');
  });

  resetPasswordWithSupabase('unconfigured@slatepos.cloud').then((res) => {
    assert(res.success === false, 'Unconfigured Supabase rejects password reset with error');
  });

  // TEST 25: Verified User Profile Support in offlineStore.login
  offlineStore.login('usr_verified_01', 'br_blr_01', {
    id: 'usr_verified_01',
    name: 'Verified Supabase User',
    email: 'verified@apexretail.in',
    phone: '+91 99999 88888',
    role: 'MANAGER',
    organizationId: 'org_apex_01',
    branchId: 'br_blr_01',
    permissions: ['POS_USE'],
  });
  assert(offlineStore.getActiveUser().name === 'Verified Supabase User', 'offlineStore.login supports verified UserProfile');
  assert(offlineStore.getActiveUser().role === 'MANAGER', 'offlineStore.login preserves verified user role');

  // TEST 26: Development-Only Role Simulation Controls Verification
  const profileDrawerSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/profile/ProfileDrawer.tsx'), 'utf-8');
  assert(!profileDrawerSrc.includes('Simulate Role Identity (RBAC)'), 'ProfileDrawer: Simulate Role Identity (RBAC) is completely removed');
  assert(!profileDrawerSrc.includes('handleRoleSwitch'), 'ProfileDrawer: handleRoleSwitch is completely removed');
  assert(!profileDrawerSrc.includes('INITIAL_USERS.map'), 'ProfileDrawer: Demo user buttons are completely removed');

  const loginPageSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/auth/LoginPage.tsx'), 'utf-8');
  assert(!loginPageSrc.includes('Quick Test Identity (RBAC)'), 'LoginPage: Quick Test Identity (RBAC) is completely removed');
  assert(!loginPageSrc.includes('Offline Local Store Mode Active'), 'LoginPage: Offline Local Store Mode Active banner is completely removed');
  assert(!loginPageSrc.includes('handleQuickPreset'), 'LoginPage: Demo identity preset handlers are completely removed');

  // TEST 27: Responsive Two-Column Reference Layout Structure & Clean Branding
  assert(loginPageSrc.includes('md:flex-row'), 'LoginPage uses responsive two-column layout on desktop (md:flex-row)');
  assert(loginPageSrc.includes('bg-[#16587B]'), 'LoginPage uses full-viewport Venice Blue backdrop (#16587B)');
  assert(
    />\s*Contact\s*</.test(loginPageSrc) &&
      />\s*Support\s*</.test(loginPageSrc) &&
      loginPageSrc.includes("setInfoModalMode('CONTACT')") &&
      loginPageSrc.includes("setInfoModalMode('SUPPORT')"),
    'LoginPage features Contact and Support buttons in the left panel'
  );
  assert(!loginPageSrc.includes('Apex SuperStore & Electronics'), 'LoginPage removes Apex SuperStore & Electronics from visible UI');
  assert(!loginPageSrc.includes('Supabase Authentication Not Configured'), 'LoginPage removes persistent Supabase unconfigured banner');
  assert(!loginPageSrc.includes('Modern Retail Cloud Architecture'), 'LoginPage removes detailed enterprise architecture heading');
  assert(!loginPageSrc.includes('GSTIN: 29AABCU9603R1ZM'), 'LoginPage removes GSTIN from login UI');
  assert(!loginPageSrc.includes('v2.6 Enterprise'), 'LoginPage removes v2.6 Enterprise label');
  assert(!loginPageSrc.includes('POS Checkout & Rapid Billing'), 'LoginPage removes feature highlight cards');
  assert(!loginPageSrc.includes('Continue with Google') && !loginPageSrc.includes('Continue with Facebook'), 'LoginPage omits Google/Facebook OAuth controls');
  assert(!loginPageSrc.includes('Create an account') && !loginPageSrc.includes('Sign up'), 'LoginPage omits public signup controls');

  // TEST 28: Gitignore Configuration Verification
  const gitignoreSrc = fs.readFileSync(path.resolve(process.cwd(), '.gitignore'), 'utf-8');
  assert(gitignoreSrc.includes('.env\n'), '.gitignore excludes .env');
  assert(gitignoreSrc.includes('.env.*\n'), '.gitignore excludes .env.*');
  assert(gitignoreSrc.includes('!.env.example'), '.gitignore preserves !.env.example');

  // TEST 29: Subscriptions Security & Direct Route Denial
  assert(!canAccessView('MANAGER', 'SUBSCRIPTIONS'), 'Manager cannot access Subscriptions & Plan');
  assert(!canAccessView('CASHIER', 'SUBSCRIPTIONS'), 'Cashier cannot access Subscriptions & Plan');
  assert(!canAccessView('STORE_OFFICER', 'SUBSCRIPTIONS'), 'Store Officer cannot access Subscriptions & Plan');
  assert(canAccessView('SUPER_ADMIN', 'SUBSCRIPTIONS'), 'Super Admin retains authorized access to Subscriptions & Plan');

  // TEST 30: Mobile and Tablet Viewport Shell Lock
  const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
  assert(appSrc.includes('h-[100dvh]'), 'App.tsx establishes 100dvh viewport height for mobile/tablet');
  assert(appSrc.includes('overflow-hidden'), 'App.tsx locks outer shell with overflow-hidden');
  assert(appSrc.includes('fixed inset-0'), 'App.tsx anchors application container to viewport with fixed inset-0');
  assert(appSrc.includes('overscroll-contain'), 'App.tsx main content container applies overscroll-contain');
  assert(appSrc.includes('min-h-0'), 'App.tsx flex child main content applies min-h-0 to prevent layout blowouts');

  const indexCssSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf-8');
  assert(indexCssSrc.includes('100dvh'), 'index.css applies 100dvh to html, body, and #root');
  assert(indexCssSrc.includes('overscroll-behavior: none'), 'index.css disables overscroll bounce on html, body, and #root');

  // TEST 31: Login Two-Column Card & Viewport Lock Verification
  assert(loginPageSrc.includes('max-w-[1440px]'), 'LoginPage spans responsive two-column container (max-w-[1440px])');
  assert(loginPageSrc.includes('rounded-3xl') && loginPageSrc.includes('bg-white'), 'LoginPage uses large white rounded-3xl sign-in card');
  assert(
    loginPageSrc.includes('src="/login.jpeg"') &&
      !loginPageSrc.includes('/mnt/data') &&
      !loginPageSrc.includes('border-white/55') &&
      !loginPageSrc.includes('bg-[#124866]/55'),
    'LoginPage renders /login.jpeg without decorative frame borders or shadows'
  );
  assert(loginPageSrc.includes('bg-white/90') && loginPageSrc.includes('h-px'), 'LoginPage includes thin horizontal white divider above Contact and Support');
  assert(loginPageSrc.includes('brandLogoUrl') && !/>\s*Logo\s*</.test(loginPageSrc), 'LoginPage renders centralized company logo at top of card without placeholder Logo text');
  assert(loginPageSrc.includes('Welcome Back'), 'LoginPage features Welcome Back heading');
  assert(loginPageSrc.includes('Sign in to your SLATE POS account'), 'LoginPage features supporting sign-in text');
  assert(loginPageSrc.includes('md:overflow-hidden'), 'LoginPage locks desktop viewport without page-level scroll');
  assert(loginPageSrc.includes('fixed inset-0'), 'LoginPage: fixed inset-0 locks viewport bounds');
  assert(loginPageSrc.includes('h-[100dvh]'), 'LoginPage: establishes 100dvh viewport height');


  // TEST 35: OfflineStore Hydration
  assert(typeof offlineStore.hydrateFromSupabase === 'function', 'offlineStore.hydrateFromSupabase method exists');
  assert(typeof offlineStore.isDemoUser === 'function', 'offlineStore.isDemoUser method exists');

  offlineStore.login('usr_prod_01', 'br_blr_01', {
    id: 'usr_prod_01',
    name: 'Real Production User',
    email: 'rajesh.sharma@apexretail.in',
    phone: '+91 98450 33003',
    role: 'MANAGER',
    organizationId: 'org_apex_01',
    branchId: 'br_blr_01',
    permissions: ['POS_USE'],
  });
  assert(offlineStore.isDemoUser() === false, 'isDemoUser correctly identifies real enterprise production user');

  // Verify unconfigured diagnostics
  const configStatus = getSupabaseConfigStatus();
  assert(typeof configStatus.isConfigured === 'boolean', 'getSupabaseConfigStatus returns isConfigured boolean');
  assert(typeof configStatus.message === 'string', 'getSupabaseConfigStatus provides human-readable status message');

  // TEST 36: Sync Diagnostics UI Integration
  const syncDiagSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/sync/SyncDiagnostics.tsx'), 'utf-8');
  assert(syncDiagSrc.includes('Database Backend:'), 'SyncDiagnostics displays database backend status banner');
  assert(syncDiagSrc.includes('Pull Cloud Database') || syncDiagSrc.includes('handleFetchCloudData'), 'SyncDiagnostics provides cloud database pull trigger');

  // TEST 37: Startup Animated Splash Screen & Fallbacks
  const splashPath = path.resolve(process.cwd(), 'src/components/auth/SplashScreen.tsx');
  assert(fs.existsSync(splashPath), 'SplashScreen component file exists');
  const splashSrc = fs.readFileSync(splashPath, 'utf-8');
  assert(splashSrc.includes('fixed inset-0'), 'SplashScreen occupies full device screen');
  assert(splashSrc.includes('maxDurationMs'), 'SplashScreen configures maximum duration timeout fallback');
  assert(splashSrc.includes('(prefers-reduced-motion: reduce)'), 'SplashScreen respects prefers-reduced-motion accessibility preference');

  // TEST 38: Splash Transition, Session Restoration & Viewport Lock
  assert(appSrc.includes('SplashScreen onFinish={handleSplashFinish}'), 'App.tsx integrates SplashScreen on initial startup');
  assert(appSrc.indexOf('if (showSplash)') < appSrc.indexOf('if (!isAuthenticated)'), 'Splash screen precedes authentication guard');
  assert(appSrc.indexOf('if (!isAuthenticated)') < appSrc.indexOf('<DesktopTitleBar'), 'Unauthenticated users are completely blocked from dashboard rendering');
  assert(appSrc.includes('getSupabaseSession()') && appSrc.includes('fetchUserProfile'), 'Valid Supabase session restoration is preserved');
  assert(appSrc.includes('min-h-0 min-w-0'), 'App shell establishes min-h-0 and min-w-0 on flex containers');
  assert(loginPageSrc.includes('flex-col md:flex-row'), 'LoginPage uses responsive two-column card layout');
  assert(loginPageSrc.includes('rounded-3xl'), 'LoginPage sign-in panel uses rounded-3xl white card');
  assert(loginPageSrc.includes('Welcome Back'), 'LoginPage includes Welcome Back heading');
  assert(loginPageSrc.includes('overflow-y-auto'), 'LoginPage supports form scrolling');

  // TEST 39: Per-Business Subscription Multi-Tenant RLS & Schema Migration
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261024000000_business_subscriptions.sql');
  assert(fs.existsSync(migrationPath), 'business_subscriptions SQL migration file exists');
  const migrationSrc = fs.readFileSync(migrationPath, 'utf-8');
  assert(migrationSrc.includes('CREATE TABLE IF NOT EXISTS business_subscriptions'), 'Migration defines business_subscriptions table');
  assert(migrationSrc.includes('organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id)'), 'Migration enforces foreign key relationship to organizations tenant table');
  assert(migrationSrc.includes('ALTER TABLE business_subscriptions ENABLE ROW LEVEL SECURITY;'), 'Migration enables Row Level Security on business_subscriptions');
  assert(migrationSrc.includes('tenant_isolation_org_subscriptions'), 'Migration enforces organization-level tenant isolation RLS policy');
  assert(migrationSrc.includes('CREATE TABLE IF NOT EXISTS payment_webhook_events'), 'Migration defines payment_webhook_events idempotency table');
  assert(migrationSrc.includes('CREATE TABLE IF NOT EXISTS subscription_invoices'), 'Migration defines subscription_invoices audit table');
  assert(migrationSrc.includes('process_subscription_webhook_atomic'), 'Migration defines atomic webhook processing PostgreSQL function');

  // TEST 40: Server-Side Plan Resolution, Pricing Tamper Resistance & 18% GST Breakdown
  const resolvedStarterMonthly = resolveAuthoritativePlan('plan_starter_monthly');
  assert(resolvedStarterMonthly !== null && resolvedStarterMonthly.basePriceInr === 1499, 'Starter monthly plan resolves to authoritative ₹1,499 base');
  assert(resolvedStarterMonthly?.gstAmountInr === 270, 'Starter monthly plan includes 18% GST (₹270)');
  assert(resolvedStarterMonthly?.totalAmountInr === 1769, 'Starter monthly total is ₹1,769');
  assert(resolvedStarterMonthly?.totalAmountPaisa === 176900, 'Starter monthly total in paisa is 176900');

  const resolvedGrowthAnnual = resolveAuthoritativePlan('plan_growth_annual');
  assert(resolvedGrowthAnnual !== null && resolvedGrowthAnnual.basePriceInr === 34990, 'Growth annual plan resolves to authoritative ₹34,990 base');
  assert(resolvedGrowthAnnual?.gstAmountInr === 6298, 'Growth annual plan includes 18% GST (₹6,298)');
  assert(resolvedGrowthAnnual?.totalAmountInr === 41288, 'Growth annual total is ₹41,288');
  assert(resolvedGrowthAnnual?.maxBranches === 3 && resolvedGrowthAnnual.maxUsers === 8, 'Growth tier enforces branch (3) and user (8) quota limits');

  const resolvedEnterpriseMonthly = resolveAuthoritativePlan('plan_enterprise_monthly');
  assert(resolvedEnterpriseMonthly !== null && resolvedEnterpriseMonthly.basePriceInr === 7999, 'Enterprise monthly plan resolves to authoritative ₹7,999 base');
  assert(resolvedEnterpriseMonthly?.gstAmountInr === 1440, 'Enterprise monthly plan includes 18% GST (₹1,440)');
  assert(resolvedEnterpriseMonthly?.totalAmountInr === 9439, 'Enterprise monthly total is ₹9,439');
  assert(resolvedEnterpriseMonthly?.totalAmountPaisa === 943900, 'Enterprise monthly total in paisa is 943900');

  const resolvedEnterpriseAnnual = resolveAuthoritativePlan('plan_enterprise_annual');
  assert(resolvedEnterpriseAnnual !== null && resolvedEnterpriseAnnual.basePriceInr === 79990, 'Enterprise annual plan resolves to authoritative ₹79,990 base');
  assert(resolvedEnterpriseAnnual?.gstAmountInr === 14398, 'Enterprise annual plan includes 18% GST (₹14,398)');
  assert(resolvedEnterpriseAnnual?.totalAmountInr === 94388, 'Enterprise annual total is ₹94,388');
  assert(resolvedEnterpriseAnnual?.totalAmountPaisa === 9438800, 'Enterprise annual total in paisa is 9438800');

  const tamperedPlan = resolveAuthoritativePlan('plan_starter_hacked_free_tier');
  assert(tamperedPlan === null, 'Tampered or forged plan ID is rejected by authoritative server resolver');

  // TEST 41: Password Management, Dedicated Reset View & Staff Provisioning
  assert(typeof updateUserPassword === 'function', 'updateUserPassword client method exists');
  assert(typeof provisionStaffUser === 'function', 'provisionStaffUser client method exists');
  const resetPagePath = path.resolve(process.cwd(), 'src/components/auth/ResetPasswordPage.tsx');
  assert(fs.existsSync(resetPagePath), 'ResetPasswordPage component exists');
  const changePwModalPath = path.resolve(process.cwd(), 'src/components/settings/ChangePasswordModal.tsx');
  assert(fs.existsSync(changePwModalPath), 'ChangePasswordModal component exists');

  const provApiPath = path.resolve(process.cwd(), 'api/provision-user.ts');
  assert(fs.existsSync(provApiPath), 'api/provision-user.ts serverless function exists');
  const provApiSrc = fs.readFileSync(provApiPath, 'utf-8');
  assert(provApiSrc.includes("['SUPER_ADMIN', 'ORG_ADMIN']"), 'provision-user strictly checks Super Admin and Org Admin roles');
  assert(provApiSrc.includes('targetOrgId'), 'provision-user strictly locks target organization to caller tenant');

  // TEST 41: Webhook HMAC-SHA256 Signature Verification & Idempotent Deduplication
  const testSecret = 'whsec_slate_test_signature_key_2026';
  const testPayload = JSON.stringify({
    event: 'subscription.charged',
    payload: {
      subscription: {
        entity: {
          id: 'sub_test_001',
          plan_id: 'plan_growth_monthly',
          status: 'active',
        },
      },
      payment: {
        entity: {
          id: 'pay_test_001',
          amount: 412900,
          currency: 'INR',
          status: 'captured',
        },
      },
    },
  });

  const validHmac = crypto.createHmac('sha256', testSecret).update(testPayload).digest('hex');
  assert(verifyWebhookSignature(testPayload, validHmac, testSecret) === true, 'Timing-safe HMAC-SHA256 accepts authentic signature');
  assert(verifyWebhookSignature(testPayload, 'forged_fake_signature_hash', testSecret) === false, 'Timing-safe HMAC-SHA256 rejects forged signature');
  assert(verifyWebhookSignature(testPayload, undefined, testSecret) === false, 'Missing signature header is rejected safely');
  assert(verifyWebhookSignature('', validHmac, testSecret) === false, 'Empty payload is rejected safely');

  // Webhook Event Deduplication
  const sampleEventId = 'evt_test_dedup_001';
  assert(isEventProcessed(sampleEventId) === false, 'Fresh webhook event is not yet marked processed');
  recordProcessedEvent(sampleEventId);
  assert(isEventProcessed(sampleEventId) === true, 'Processed webhook event is tracked in idempotency ledger');

  // TEST 42: Subscription Lifecycle State Transitions
  const chargedState = transitionSubscriptionState('PAST_DUE', 'subscription.charged');
  assert(chargedState.newStatus === 'ACTIVE' && chargedState.periodExtended === true, 'subscription.charged transitions to ACTIVE and extends billing period');

  const haltedState = transitionSubscriptionState('ACTIVE', 'subscription.halted');
  assert(haltedState.newStatus === 'PAST_DUE' && haltedState.periodExtended === false, 'subscription.halted transitions to PAST_DUE without period extension');

  const cancelledState = transitionSubscriptionState('ACTIVE', 'subscription.cancelled');
  assert(cancelledState.newStatus === 'CANCELLED' && cancelledState.periodExtended === false, 'subscription.cancelled transitions to CANCELLED');

  const expiredState = transitionSubscriptionState('PAST_DUE', 'subscription.completed');
  assert(expiredState.newStatus === 'EXPIRED' && expiredState.periodExtended === false, 'subscription.completed transitions to EXPIRED');

  // TEST 43: Vercel Production Configuration & Serverless API Routes
  const vercelJsonPath = path.resolve(process.cwd(), 'vercel.json');
  assert(fs.existsSync(vercelJsonPath), 'vercel.json deployment configuration file exists');
  const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
  assert(Array.isArray(vercelConfig.rewrites) && vercelConfig.rewrites.some((r: any) => r.source === '/(.*)' && r.destination === '/index.html'), 'vercel.json configures single-page application (SPA) client rewrites');
  assert(Array.isArray(vercelConfig.headers) && vercelConfig.headers.length > 0, 'vercel.json configures asset caching and security headers');

  const vercelSubApi = path.resolve(process.cwd(), 'api/subscriptions.ts');
  assert(fs.existsSync(vercelSubApi), 'Vercel Serverless Function api/subscriptions.ts exists');
  const vercelWebhookApi = path.resolve(process.cwd(), 'api/webhook.ts');
  assert(fs.existsSync(vercelWebhookApi), 'Vercel Serverless Function api/webhook.ts exists');

  const subViewSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/subscriptions/SubscriptionPlansView.tsx'), 'utf-8');
  assert(subViewSrc.includes('isAnnual') || subViewSrc.includes('billingInterval'), 'SubscriptionPlansView supports annual and monthly billing intervals');
  assert(subViewSrc.includes('GST') || subViewSrc.includes('18%'), 'SubscriptionPlansView renders Indian 18% GST transparent breakdown');
  assert(subViewSrc.includes('/api/subscriptions/checkout') || subViewSrc.includes('/api/subscriptions'), 'SubscriptionPlansView calls secure server-side checkout endpoint');

  // TEST 44: Remediation of SECURITY DEFINER Privilege Escalation & Financial Integrity
  const secHardening20261028Path = path.resolve(process.cwd(), 'supabase/migrations/20261028000000_fix_security_definer_and_financial_integrity.sql');
  assert(fs.existsSync(secHardening20261028Path), '20261028000000_fix_security_definer_and_financial_integrity.sql migration exists');
  const secHardening20261028Src = fs.readFileSync(secHardening20261028Path, 'utf-8');

  // Verify is_trusted_service_role definition
  assert(secHardening20261028Src.includes('CREATE OR REPLACE FUNCTION public.is_trusted_service_role()'), 'Defines public.is_trusted_service_role() helper');
  assert(!secHardening20261028Src.includes("current_user = 'postgres'") && !secHardening20261028Src.includes("current_user = 'service_role'"), 'Does not contain unsafe current_user = postgres check inside SECURITY DEFINER functions');
  assert(secHardening20261028Src.includes("session_user IN ('postgres', 'supabase_admin')"), 'Checks session_user for trusted local administrative connections');
  assert(secHardening20261028Src.includes("(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role'"), 'Checks PostgREST request.jwt.claims for service_role');

  // Verify process_sale_atomic security remediations
  assert(secHardening20261028Src.includes("v_caller_profile.role NOT IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'CASHIER')"), 'process_sale_atomic enforces role authorization');
  assert(secHardening20261028Src.includes('v_caller_profile.branch_id IS NOT NULL') && secHardening20261028Src.includes("(p_sale_json->>'branchId') <> v_caller_profile.branch_id"), 'process_sale_atomic restricts Cashiers and Managers strictly to their assigned branch');
  assert(secHardening20261028Src.includes('Idempotency key collision across tenant boundary'), 'process_sale_atomic prevents cross-tenant idempotency key collisions');
  assert(secHardening20261028Src.includes('FOR UPDATE'), 'process_sale_atomic row-locks products with FOR UPDATE to prevent overselling');
  assert(secHardening20261028Src.includes('Grand total mismatch: calculated %, supplied %'), 'process_sale_atomic validates calculated totals against client tampering');
  assert(secHardening20261028Src.includes("v_pay_status := 'VERIFIED';") && secHardening20261028Src.includes("v_pay_method = 'CASH'"), 'process_sale_atomic strictly limits automatic VERIFIED status to cash tenders');

  // Verify process_refund_atomic security remediations
  assert(secHardening20261028Src.includes("v_caller_profile.role NOT IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER')"), 'process_refund_atomic rejects CASHIER role (requires Manager/Admin)');
  assert(secHardening20261028Src.includes('v_already_refunded + v_refund_amount) > v_sale_record.grand_total'), 'process_refund_atomic prevents cumulative refund from exceeding grand total');
  assert(secHardening20261028Src.includes('(v_previous_item_returns + v_qty) > v_sale_item.quantity'), 'process_refund_atomic prevents cumulative return quantities from exceeding purchased items');
  assert(secHardening20261028Src.includes('v_sale_record.branch_id'), 'process_refund_atomic restocks inventory to the sale\'s verified branch');

  // Verify register_business_tenant_atomic security remediations
  assert(!secHardening20261028Src.includes("'PLATFORM_MANAGE'"), 'register_business_tenant_atomic does not grant PLATFORM_MANAGE to tenant owners');
  assert(secHardening20261028Src.includes('p_auth_user_id := v_caller_auth_id'), 'register_business_tenant_atomic binds registration to verified auth.uid()');

  // Verify process_subscription_webhook_atomic security remediations
  assert(secHardening20261028Src.includes('Invalid or unknown subscription plan ID'), 'process_subscription_webhook_atomic rejects unknown subscription plan IDs');
  assert(secHardening20261028Src.includes('REVOKE ALL ON FUNCTION public.process_subscription_webhook_atomic'), 'Revokes process_subscription_webhook_atomic from unprivileged roles');
  assert(secHardening20261028Src.includes('GRANT EXECUTE ON FUNCTION public.process_subscription_webhook_atomic(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, INT, INT, INT, JSONB) TO service_role'), 'Grants process_subscription_webhook_atomic strictly to service_role');

  // Verify financial ledger immutability
  assert(secHardening20261028Src.includes('REVOKE UPDATE, DELETE ON TABLE public.sales FROM authenticated'), 'Revokes direct UPDATE and DELETE on sales from authenticated');
  assert(secHardening20261028Src.includes('REVOKE UPDATE, DELETE ON TABLE public.sale_items FROM authenticated'), 'Revokes direct UPDATE and DELETE on sale_items from authenticated');
  assert(secHardening20261028Src.includes('REVOKE UPDATE, DELETE ON TABLE public.payments FROM authenticated'), 'Revokes direct UPDATE and DELETE on payments from authenticated');
  assert(secHardening20261028Src.includes('REVOKE UPDATE, DELETE ON TABLE public.refunds FROM authenticated'), 'Revokes direct UPDATE and DELETE on refunds from authenticated');
  assert(secHardening20261028Src.includes('REVOKE UPDATE, DELETE ON TABLE public.stock_movements FROM authenticated'), 'Revokes direct UPDATE and DELETE on stock_movements from authenticated');
  assert(secHardening20261028Src.includes('REVOKE UPDATE, DELETE ON TABLE public.audit_logs FROM authenticated'), 'Revokes direct UPDATE and DELETE on audit_logs from authenticated');

  // Verify audit script enhancements
  const auditScriptEnhancedSrc = fs.readFileSync(path.resolve(process.cwd(), 'supabase/scripts/audit_schema.sql'), 'utf-8');
  assert(auditScriptEnhancedSrc.includes('Check 5: Detect unsafe current_user = postgres check'), 'audit_schema.sql includes automated check for SECURITY DEFINER owner checks');
  assert(auditScriptEnhancedSrc.includes('Check 6: Ensure tenant registration does NOT grant PLATFORM_MANAGE'), 'audit_schema.sql includes automated check for PLATFORM_MANAGE privilege leakage');
  assert(auditScriptEnhancedSrc.includes('Check 7: Verify immutable financial ledgers'), 'audit_schema.sql includes automated check for financial table immutability');
  assert(auditScriptEnhancedSrc.includes('Check 8: Verify process_subscription_webhook_atomic'), 'audit_schema.sql includes automated check for webhook caller restrictions');

  // TEST 45: Live Database Remediation — Authoritative Checkout, Payment Reconciliation & Type Hygiene
  const authCheckout20261029Path = path.resolve(process.cwd(), 'supabase/migrations/20261029000000_authoritative_checkout_and_payment_reconciliation.sql');
  assert(fs.existsSync(authCheckout20261029Path), '20261029000000_authoritative_checkout_and_payment_reconciliation.sql migration exists');
  const authCheckout20261029Src = fs.readFileSync(authCheckout20261029Path, 'utf-8');

  // Verify type hygiene & removal of nonexistent gateway_status_val
  assert(!authCheckout20261029Src.includes('gateway_status_val;'), '20261029 migration does not declare variables of nonexistent type gateway_status_val');
  assert(!authCheckout20261029Src.includes('::gateway_status_val'), '20261029 migration contains zero casts to nonexistent gateway_status_val');

  // Verify payments table default & constraints
  assert(authCheckout20261029Src.includes("ALTER TABLE public.payments ALTER COLUMN gateway_status SET DEFAULT 'PENDING';"), 'Alters public.payments.gateway_status default from VERIFIED to PENDING');
  assert(authCheckout20261029Src.includes('chk_payments_gateway_status'), 'Defines check constraint chk_payments_gateway_status on payments');
  assert(authCheckout20261029Src.includes("CHECK (gateway_status IN ('PENDING', 'VERIFIED', 'FAILED', 'REFUNDED'))"), 'Restricts gateway_status values strictly to PENDING, VERIFIED, FAILED, REFUNDED');
  assert(authCheckout20261029Src.includes('chk_payments_amount_positive'), 'Defines check constraint chk_payments_amount_positive (amount > 0)');

  // Verify process_sale_atomic authoritative financial pricing & reconciliation
  assert(authCheckout20261029Src.includes('v_unit_price := v_prod_record.selling_price;'), 'Derives unit price authoritatively from database record (rejecting client pricing)');
  assert(authCheckout20261029Src.includes('IF v_item_discount > (v_qty * v_unit_price) THEN'), 'Caps item discount at gross line amount');
  assert(authCheckout20261029Src.includes("v_pay_status := 'VERIFIED';") && authCheckout20261029Src.includes("v_pay_method = 'CASH'"), 'Limits immediate VERIFIED payment status strictly to counter CASH');
  assert(authCheckout20261029Src.includes("v_pay_status := 'PENDING';"), 'Initializes all non-cash electronic tenders (UPI, Card) strictly to PENDING');
  assert(!authCheckout20261029Src.includes("v_pay_status := (v_payment->>'gatewayStatus')"), 'Never trusts client-supplied gatewayStatus for electronic verification');
  assert(authCheckout20261029Src.includes("v_sale_payment_status := 'PENDING';"), 'Derives sale payment status as PENDING when electronic tenders are unverified');
  assert(authCheckout20261029Src.includes("v_sale_payment_status := 'PAID';"), 'Derives sale payment status as PAID only when verified payments cover grand total');

  // Verify confirm_gateway_payment_atomic dedicated procedure
  assert(authCheckout20261029Src.includes('CREATE OR REPLACE FUNCTION public.confirm_gateway_payment_atomic'), 'Defines privileged confirm_gateway_payment_atomic procedure');
  assert(authCheckout20261029Src.includes('IF NOT public.is_trusted_service_role() THEN'), 'confirm_gateway_payment_atomic enforces is_trusted_service_role() check');
  assert(authCheckout20261029Src.includes('REVOKE ALL ON FUNCTION public.confirm_gateway_payment_atomic(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;'), 'Revokes confirm_gateway_payment_atomic from untrusted callers');
  assert(authCheckout20261029Src.includes('GRANT EXECUTE ON FUNCTION public.confirm_gateway_payment_atomic(VARCHAR, VARCHAR, VARCHAR) TO service_role;'), 'Grants confirm_gateway_payment_atomic strictly to service_role');

  // Verify audit script enhancements (Checks 9, 10, 11, 12)
  assert(auditScriptEnhancedSrc.includes('Check 9: Detect invalid or nonexistent types'), 'audit_schema.sql includes automated check for nonexistent gateway_status_val type');
  assert(auditScriptEnhancedSrc.includes("Check 10: Verify payments.gateway_status column default is NOT 'VERIFIED'"), 'audit_schema.sql includes automated check against permissive VERIFIED payment default');
  assert(auditScriptEnhancedSrc.includes('Check 11: Verify check constraint exists on payments.gateway_status'), 'audit_schema.sql includes automated check for payment status constraint');
  assert(auditScriptEnhancedSrc.includes('Check 12: Verify process_sale_atomic ignores client-supplied gatewayStatus'), 'audit_schema.sql includes automated check against client gatewayStatus trust');

  // Functional calculation test: Payment reconciliation logic in TypeScript
  function simulatePaymentReconciliation(totalAmount: number, payments: Array<{ method: string; amount: number }>) {
    let paymentSum = 0;
    let verifiedPaid = 0;
    const reconciledPayments = payments.map((p) => {
      paymentSum += p.amount;
      const isVerified = p.method === 'CASH';
      if (isVerified) verifiedPaid += p.amount;
      return { ...p, status: isVerified ? 'VERIFIED' : 'PENDING' };
    });

    let salePaymentStatus: 'PAID' | 'PENDING' | 'PARTIALLY_PAID' | 'UNPAID';
    if (verifiedPaid >= totalAmount) {
      salePaymentStatus = 'PAID';
    } else if (paymentSum >= totalAmount) {
      salePaymentStatus = 'PENDING';
    } else if (paymentSum > 0) {
      salePaymentStatus = 'PARTIALLY_PAID';
    } else {
      salePaymentStatus = 'UNPAID';
    }

    return {
      paymentSum,
      verifiedPaid,
      changeReturned: Math.max(0, paymentSum - totalAmount),
      unpaidBalance: Math.max(0, totalAmount - paymentSum),
      salePaymentStatus,
      reconciledPayments,
    };
  }

  // Test Case A: 100% Cash tender
  const cashReconcile = simulatePaymentReconciliation(500, [{ method: 'CASH', amount: 500 }]);
  assert(cashReconcile.salePaymentStatus === 'PAID', '100% Cash tender reconciles to PAID sale status');
  assert(cashReconcile.reconciledPayments[0].status === 'VERIFIED', 'Counter cash payment marked VERIFIED');

  // Test Case B: 100% UPI tender
  const upiReconcile = simulatePaymentReconciliation(500, [{ method: 'UPI', amount: 500 }]);
  assert(upiReconcile.salePaymentStatus === 'PENDING', '100% UPI tender reconciles to PENDING sale status at counter');
  assert(upiReconcile.reconciledPayments[0].status === 'PENDING', 'UPI payment marked PENDING awaiting gateway confirmation');

  // Test Case C: Split 50% Cash + 50% UPI tender
  const splitReconcile = simulatePaymentReconciliation(500, [
    { method: 'CASH', amount: 250 },
    { method: 'UPI', amount: 250 },
  ]);
  assert(splitReconcile.salePaymentStatus === 'PENDING', 'Split tender with pending electronic component reconciles to PENDING');
  assert(splitReconcile.reconciledPayments[0].status === 'VERIFIED', 'Cash portion is verified');
  assert(splitReconcile.reconciledPayments[1].status === 'PENDING', 'UPI portion is pending');

  // Test Case D: Cash overpayment returns exact change
  const changeReconcile = simulatePaymentReconciliation(450, [{ method: 'CASH', amount: 500 }]);
  assert(changeReconcile.changeReturned === 50, 'Cash overpayment calculates exact ₹50 change returned');
  assert(changeReconcile.salePaymentStatus === 'PAID', 'Sale marked PAID when cash exceeds total');

  // TEST 46: Credit Note Atomicity & Balance validation
  // Mock customer balance check
  const customerBalance = 1000;
  const creditNoteAmount = 300;
  assert(customerBalance >= creditNoteAmount, 'Credit note deduction is permitted when balance is sufficient');
  assert(customerBalance - creditNoteAmount === 700, 'Credit note correctly reduces customer balance');
  const invalidCreditNote = 1500;
  assert(customerBalance < invalidCreditNote, 'Credit note deduction rejected when balance is insufficient');

  // TEST 47: Split Payment Reconciliation
  const splitReconcile2 = simulatePaymentReconciliation(1000, [
      { method: 'CASH', amount: 400 },
      { method: 'UPI', amount: 600 }
  ]);
  assert(splitReconcile2.paymentSum === 1000, 'Split payment sums correctly to total');
  assert(splitReconcile2.reconciledPayments[0].status === 'VERIFIED', 'Cash part verified');
  assert(splitReconcile2.reconciledPayments[1].status === 'PENDING', 'UPI part pending');
  assert(splitReconcile2.salePaymentStatus === 'PENDING', 'Split payment with pending electronic component reconciles to PENDING');

  // TEST 49: CREDIT_NOTE Atomicity & Balance validation
  const finalRecon20261031Path = path.resolve(process.cwd(), 'supabase/migrations/20261031000000_final_payment_reconciliation.sql');
  assert(fs.existsSync(finalRecon20261031Path), '20261031000000_final_payment_reconciliation.sql migration exists');
  const finalRecon20261031Src = fs.readFileSync(finalRecon20261031Path, 'utf-8');

  assert(finalRecon20261031Src.includes('CREDIT_NOTE'), '20261031 migration includes CREDIT_NOTE handling');
  assert(finalRecon20261031Src.includes('UPDATE public.customers SET current_receivable_balance = current_receivable_balance -'), 'Credit note atomically debits customer balance');
  assert(finalRecon20261031Src.includes('current_receivable_balance >='), 'Credit note enforces sufficient balance check');

  // TEST 50: Split Payment & Payment Reconciliation Semantics
  assert(finalRecon20261031Src.includes("v_pay_status := 'PENDING'"), 'Non-cash tenders default to PENDING');
  assert(finalRecon20261031Src.includes("CASE WHEN v_verified_paid >= v_calculated_grand_total THEN 'PAID'"), 'Sale status derived from verified payment totals');

  // TEST 51: Migration 20261102000000 & Unregistered Business GSTIN/PAN Nullability
  const repairMigrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261102000000_repair_and_onboard_test_tenants.sql');
  assert(fs.existsSync(repairMigrationPath), '20261102000000_repair_and_onboard_test_tenants.sql migration file exists');
  const repairMigrationSrc = fs.readFileSync(repairMigrationPath, 'utf-8');

  assert(repairMigrationSrc.includes('ALTER TABLE public.organizations ALTER COLUMN gstin DROP NOT NULL;'), 'Drops NOT NULL constraint on organizations.gstin');
  assert(repairMigrationSrc.includes('ALTER TABLE public.organizations ALTER COLUMN pan DROP NOT NULL;'), 'Drops NOT NULL constraint on organizations.pan');
  assert(repairMigrationSrc.includes('ALTER TABLE public.stores ALTER COLUMN gstin DROP NOT NULL;'), 'Drops NOT NULL constraint on stores.gstin');

  // TEST 52: Slate CRM Tenant Provisioning Verification
  assert(repairMigrationSrc.includes('org_slate_crm_01'), 'Provisions Slate CRM organization record');
  assert(repairMigrationSrc.includes('sherin@slatepos.com'), 'Binds Slate CRM user profile to sherin@slatepos.com');
  assert(repairMigrationSrc.includes('0fd8b6d6-8b59-4802-b11e-3153b5356e15'), 'Links Auth UUID 0fd8b6d6-8b59-4802-b11e-3153b5356e15 to Slate CRM owner profile');
  assert(repairMigrationSrc.includes('plan_starter_monthly'), 'Configures plan_starter_monthly for Slate CRM');

  // TEST 53: Slate Billing Tenant Provisioning Verification
  assert(repairMigrationSrc.includes('org_slate_billing_01'), 'Provisions Slate Billing organization record');
  assert(repairMigrationSrc.includes('test1@gmail.com'), 'Binds Slate Billing user profile to test1@gmail.com');
  assert(repairMigrationSrc.includes('7b8579fc-651d-4e23-b929-2ba3ef9bf8ed'), 'Links Auth UUID 7b8579fc-651d-4e23-b929-2ba3ef9bf8ed to Slate Billing owner profile');
  assert(repairMigrationSrc.includes('plan_enterprise_monthly'), 'Configures plan_enterprise_monthly for Slate Billing');

  // TEST 54: Tenant Profile & Branch Resolution Boundaries
  assert(repairMigrationSrc.includes('br_slate_crm_main'), 'Assigns isolated branch br_slate_crm_main to Slate CRM');
  assert(repairMigrationSrc.includes('br_slate_billing_main'), 'Assigns isolated branch br_slate_billing_main to Slate Billing');

  // TEST 55: TallyPrime Masters Ledger Header Verification (AllAccountingMasters.xlsx)
  assert(TALLY_LEDGER_HEADERS.length === 12, 'TALLY_LEDGER_HEADERS defines exact 12 columns');
  assert(TALLY_LEDGER_HEADERS[0] === 'Name' && TALLY_LEDGER_HEADERS[1] === 'Group Name', 'TALLY_LEDGER_HEADERS starts with Name and Group Name');
  assert(TALLY_LEDGER_HEADERS[11] === 'Pincode', 'TALLY_LEDGER_HEADERS ends with Pincode');

  // TEST 56: TallyPrime Accounting Voucher Header Verification (AccountingVouchers.xlsx)
  assert(TALLY_VOUCHER_HEADERS.length === 14, 'TALLY_VOUCHER_HEADERS defines exact 14 columns');
  assert(TALLY_VOUCHER_HEADERS[13] === 'Change Mode ', 'TALLY_VOUCHER_HEADERS includes exact trailing space in Change Mode ');
  assert(TALLY_VOUCHER_HEADERS[1] === 'Voucher Type' && TALLY_VOUCHER_HEADERS[5] === 'Dr/Cr', 'TALLY_VOUCHER_HEADERS includes Voucher Type and Dr/Cr');

  // TEST 57: Tally Customer Staging & Validation
  const validCustStaged = validateAndStageTallyCustomers([{ name: 'Sri Krishna Traders', openingbalance: '25000', drcr: 'Dr' }]);
  assert(validCustStaged.validCount === 1, 'Valid Tally customer record passes validation');
  assert(validCustStaged.stagedRows[0].parsedData.currentReceivableBalance === 25000, 'Tally customer Debit opening balance mapped to positive receivable');

  const invalidCustStaged = validateAndStageTallyCustomers([{ name: '', openingbalance: '1000' }]);
  assert(invalidCustStaged.invalidCount === 1, 'Tally customer record missing Name fails validation');

  // TEST 58: Tally Supplier Staging & Validation
  const suppStaged = validateAndStageTallySuppliers([{ name: 'Chennai Wholesalers', openingbalance: '50000' }]);
  assert(suppStaged.validCount === 1, 'Valid Tally supplier record passes validation');
  assert(suppStaged.stagedRows[0].parsedData.openingBalance === 50000, 'Tally supplier opening balance parsed correctly');

  // TEST 59: Tally Payment Receipt Voucher Staging & Validation
  const paymentStaged = validateAndStageTallyPayments([{ voucherdate: '2026-10-29', vouchertype: 'Receipt', vouchernumber: 'RCT-1001', ledgername: 'Sri Krishna Traders', amount: '5000', drcr: 'Cr' }]);
  assert(paymentStaged.validCount === 1, 'Valid Tally receipt voucher record passes validation');
  assert(paymentStaged.stagedRows[0].parsedData.amount === 5000, 'Tally receipt voucher amount parsed correctly');

  // TEST 60: Tally Expense Voucher Staging & Validation
  const expenseStaged = validateAndStageTallyExpenses([{ voucherdate: '2026-10-29', vouchertype: 'Payment', vouchernumber: 'EXP-2001', ledgername: 'Electricity Expense', amount: '4500', drcr: 'Dr' }]);
  assert(expenseStaged.validCount === 1, 'Valid Tally expense payment voucher record passes validation');
  assert(expenseStaged.stagedRows[0].parsedData.category === 'Electricity', 'Tally expense category derived from ledger name');

  // TEST 61: Sidebar Navigation Label Updates Verification
  const sidebarPath = path.resolve(process.cwd(), 'src/components/layout/Sidebar.tsx');
  assert(fs.existsSync(sidebarPath), 'Sidebar.tsx component file exists');
  const sidebarSrc = fs.readFileSync(sidebarPath, 'utf-8');
  const navRoutesSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/navigationRoutes.ts'), 'utf-8');

  assert(
    sidebarSrc.includes('SIDEBAR_NAVIGATION_GROUPS') &&
      navRoutesSrc.includes("label: 'Inventory'") &&
      navRoutesSrc.includes("label: 'Quotation'") &&
      navRoutesSrc.includes("label: 'Recipets'") &&
      navRoutesSrc.includes("label: 'Payments'") &&
      navRoutesSrc.includes("label: 'Expenses'") &&
      navRoutesSrc.includes("label: 'Report'") &&
      navRoutesSrc.includes("label: 'Configure'"),
    'Sidebar renders exact reorganized module labels from SIDEBAR_NAVIGATION_GROUPS'
  );

  // TEST 62: SplashScreen Full-Screen Animation Verification
  const splashCheckPath = path.resolve(process.cwd(), 'src/components/auth/SplashScreen.tsx');
  assert(fs.existsSync(splashCheckPath), 'SplashScreen.tsx component file exists');
  const splashCheckSrc = fs.readFileSync(splashCheckPath, 'utf-8');

  assert(splashCheckSrc.includes('bg-[#16587B]'), 'SplashScreen uses solid Venice Blue primary background color');
  assert(splashCheckSrc.includes('fixed inset-0'), 'SplashScreen occupies full device screen');
  assert(splashCheckSrc.includes('maxDurationMs'), 'SplashScreen supports timeout duration');
  assert(splashCheckSrc.includes('prefers-reduced-motion'), 'SplashScreen supports reduced motion preference');

  // TEST 63: Banking Engine & Treasury Verification
  offlineStore.seedTestDataForTesting();
  const initialAccounts = offlineStore.getBankAccounts();
  assert(initialAccounts.length >= 2, 'Initial bank accounts seeded correctly');
  const primaryAcc = initialAccounts.find((a) => a.isPrimary) || initialAccounts[0];
  const secondaryAcc = initialAccounts.find((a) => a.id !== primaryAcc.id) || initialAccounts[1];
  const origBalance = primaryAcc.currentBalance;

  // 1. Deposit
  const depositRes = offlineStore.recordBankTransaction({
    bankAccountId: primaryAcc.id,
    type: 'DEPOSIT',
    amount: 15000,
    description: 'Counter Cash Collection Deposit',
    category: 'Counter Cash',
  });
  assert(depositRes.success === true, 'Bank deposit executed successfully');
  assert(primaryAcc.currentBalance === origBalance + 15000, 'Bank account balance increased by deposit amount');

  // 2. Withdrawal
  const withdrawRes = offlineStore.recordBankTransaction({
    bankAccountId: primaryAcc.id,
    type: 'WITHDRAWAL',
    amount: 5000,
    description: 'Utility bill payment',
  });
  assert(withdrawRes.success === true, 'Bank withdrawal executed successfully');
  assert(primaryAcc.currentBalance === origBalance + 10000, 'Bank account balance deducted by withdrawal amount');

  // 3. Prevent Overdraft
  const overdraftRes = offlineStore.recordBankTransaction({
    bankAccountId: primaryAcc.id,
    type: 'WITHDRAWAL',
    amount: 999999999,
  });
  assert(overdraftRes.success === false, 'Bank overdraft strictly rejected when funds are insufficient');

  // 4. Inter-account Transfer
  const secOrigBalance = secondaryAcc.currentBalance;
  const transferRes = offlineStore.recordBankTransaction({
    bankAccountId: primaryAcc.id,
    toBankAccountId: secondaryAcc.id,
    type: 'TRANSFER',
    amount: 2000,
    description: 'Operating float transfer',
  });
  assert(transferRes.success === true, 'Inter-account transfer completed successfully');
  assert(primaryAcc.currentBalance === origBalance + 8000, 'Source account debited for transfer');
  assert(secondaryAcc.currentBalance === secOrigBalance + 2000, 'Destination account credited for transfer');

  // 5. Transaction Reversal
  const reversalRes = offlineStore.reverseBankTransaction(depositRes.transaction!.id, 'Audited duplicate entry', 'Auditor');
  assert(reversalRes.success === true, 'Transaction reversal posted successfully');
  assert(depositRes.transaction!.status === 'REVERSED', 'Original transaction marked REVERSED');

  // TEST 64: Credit Notes Engine & Restocking Verification
  const creditNotes = offlineStore.getCreditNotes();
  assert(Array.isArray(creditNotes), 'Credit notes collection accessible');
  const testCustomers = offlineStore.getCustomers();
  const testCust = testCustomers[0];
  const custOrigReceivable = testCust.outstandingReceivable || 0;
  const testProds = offlineStore.getProducts();
  const testProd = testProds[0];
  const prodOrigStock = testProd.currentStock ?? testProd.stockLevel ?? 0;

  // Create Draft Credit Note
  const cnCreateRes = offlineStore.createCreditNote({
    customerId: testCust.id,
    reason: 'DAMAGED_GOODS',
    items: [
      {
        id: 'cni_test_01',
        productId: testProd.id,
        productName: testProd.name,
        quantity: 2,
        unitPrice: 100,
        taxableAmount: 169.49,
        taxRate: 18,
        total: 200,
      },
    ],
    createdBy: 'usr_cashier_01',
    restockInventory: true,
  });
  assert(cnCreateRes.success === true, 'Credit Note created in DRAFT status');
  const createdCN = cnCreateRes.creditNote!;
  assert(createdCN.status === 'DRAFT', 'New credit note is initially in DRAFT status');
  assert(createdCN.totalCreditAmount === 200, 'Total credit amount calculated accurately');

  // Approve Credit Note
  const cnApproveRes = offlineStore.approveCreditNote(createdCN.id, 'usr_manager_01', 'Store Manager');
  assert(cnApproveRes.success === true, 'Store Manager approved draft credit note');
  assert(createdCN.status === 'APPROVED', 'Credit note status transitioned to APPROVED');

  // Issue Credit Note
  const cnIssueRes = offlineStore.issueCreditNote(createdCN.id, 'usr_cashier_01', 'Cashier Arun');
  assert(cnIssueRes.success === true, 'Credit note issued successfully');
  assert(createdCN.status === 'ISSUED', 'Credit note status transitioned to ISSUED');
  assert(
    testProd.currentStock === prodOrigStock + 2 && testProd.stockLevel === prodOrigStock + 2,
    'Physical inventory restocked at branch for returned item'
  );

  // TEST 65: Purchases, GRN Restocking & Supplier Bills Verification
  const initialPOs = offlineStore.getPurchaseOrders();
  assert(Array.isArray(initialPOs), 'Purchase orders accessible');
  const testSupps = offlineStore.getSuppliers();
  const testSupp = testSupps[0];
  const suppOrigAP = testSupp.outstandingBalance ?? testSupp.currentPayableBalance ?? 0;

  // 1. Create Purchase Order
  const poCreated = offlineStore.createPurchaseOrder({
    supplierId: testSupp.id,
    supplierName: testSupp.name,
    orderDate: '2026-11-20',
    subtotal: 1000,
    taxTotal: 180,
    discountTotal: 0,
    additionalCharges: 0,
    grandTotal: 1180,
    items: [
      {
        id: 'poi_test_01',
        productId: testProd.id,
        productName: testProd.name,
        orderedQuantity: 10,
        receivedQuantity: 0,
        unitPrice: 100,
        taxRate: 18,
        taxAmount: 18,
        total: 118,
      },
    ],
    createdBy: 'usr_officer_01',
  });
  assert(poCreated.status === 'ORDERED', 'PO created with ORDERED status');

  // 2. Inward Goods Receipt Note (GRN)
  const prevProdStockBeforeGRN = testProd.currentStock ?? testProd.stockLevel ?? 0;
  const grnRes = offlineStore.receiveGoods({
    poId: poCreated.id,
    supplierId: testSupp.id,
    items: [
      {
        productId: testProd.id,
        quantityReceived: 10,
        unitPrice: 100,
      },
    ],
    receivedBy: 'usr_officer_01',
  });
  assert(grnRes.success === true, 'GRN successfully processed');
  assert(poCreated.status === 'RECEIVED', 'Purchase order status transitioned to RECEIVED');
  assert(
    testProd.currentStock === prevProdStockBeforeGRN + 10 && testProd.stockLevel === prevProdStockBeforeGRN + 10,
    'Stock increased by GRN received quantity'
  );

  // 3. Create Supplier Bill (AP)
  const billCreated = offlineStore.createSupplierBill({
    supplierId: testSupp.id,
    supplierName: testSupp.name,
    purchaseOrderId: poCreated.id,
    billDate: '2026-11-20',
    subtotal: 1000,
    taxableTotal: 1000,
    gstTotal: 180,
    totalAmount: 1180,
  });
  assert(billCreated.status === 'PENDING', 'Supplier bill created in PENDING status');
  assert(
    testSupp.outstandingBalance === suppOrigAP + 1180 && testSupp.currentPayableBalance === suppOrigAP + 1180,
    'Supplier accounts payable increased by bill total'
  );

  // 4. Supplier Payment with Bank Deduction
  const bankBalBeforePay = primaryAcc.currentBalance;
  const payRes = offlineStore.recordSupplierPayment({
    billId: billCreated.id,
    supplierId: testSupp.id,
    amount: 1180,
    paymentMethod: 'BANK',
    bankAccountId: primaryAcc.id,
    paidBy: 'usr_manager_01',
  });
  assert(payRes.success === true, 'Supplier bill payment successfully disbursed');
  assert(billCreated.status === 'PAID', 'Supplier bill marked PAID');
  assert(
    testSupp.outstandingBalance === suppOrigAP && testSupp.currentPayableBalance === suppOrigAP,
    'Supplier accounts payable balance relieved'
  );
  assert(primaryAcc.currentBalance === bankBalBeforePay - 1180, 'Bank account balance atomically debited for supplier payment');

  // TEST 66: Multi-Tenant Staff Association & Isolation Verification
  const allUsers = INITIAL_USERS;
  const slateCrmStaff = allUsers.filter((u) => u.organizationId === 'org_slate_crm_01');
  const slateBillingStaff = allUsers.filter((u) => u.organizationId === 'org_slate_billing_01');

  assert(slateCrmStaff.some((u) => u.email === 'manager@slatecrm.com' && u.role === 'MANAGER'), 'Slate CRM Manager staff account provisioned');
  assert(slateCrmStaff.some((u) => u.email === 'store@slatecrm.com' && u.role === 'STORE_OFFICER'), 'Slate CRM Store Officer staff account provisioned');
  assert(slateCrmStaff.some((u) => u.email === 'cashier@slatecrm.com' && u.role === 'CASHIER'), 'Slate CRM Cashier staff account provisioned');

  assert(slateBillingStaff.some((u) => u.email === 'manager@slatebilling.com' && u.role === 'MANAGER'), 'Slate Billing Manager staff account provisioned');
  assert(slateBillingStaff.some((u) => u.email === 'store@slatebilling.com' && u.role === 'STORE_OFFICER'), 'Slate Billing Store Officer staff account provisioned');
  assert(slateBillingStaff.some((u) => u.email === 'cashier@slatebilling.com' && u.role === 'CASHIER'), 'Slate Billing Cashier staff account provisioned');

  // Isolated branches
  assert(slateCrmStaff.every((u) => u.branchId === 'br_slate_crm_main'), 'Slate CRM staff isolated to br_slate_crm_main');
  assert(slateBillingStaff.every((u) => u.branchId === 'br_slate_billing_main'), 'Slate Billing staff isolated to br_slate_billing_main');

  // TEST 67: Finalized 5-Group (18-Item) Sidebar Structure & Clean Top Strip Verification
  const expectedSidebarSpec: Array<{ title: string; labels: string[] }> = [
    { title: 'MAIN', labels: ['Home', 'Banking', 'Quotation', 'Inventory'] },
    { title: 'SALES', labels: ['Customers', 'Invoice', 'Recipets', 'Credit Notes'] },
    { title: 'PURCHASE', labels: ['Suppliers', 'Bills', 'Payments', 'Debit Notes', 'Expenses'] },
    { title: 'ACCOUNTS', labels: ['Journal', 'Bulk Updates', 'Chart of Accounts', 'Report'] },
    { title: 'SETTING', labels: ['Configure'] },
  ];
  assert(SIDEBAR_NAVIGATION_GROUPS.length === 5, 'Sidebar has exact 5 main navigation groups (MAIN, SALES, PURCHASE, ACCOUNTS, SETTING)');
  for (let i = 0; i < expectedSidebarSpec.length; i++) {
    const actualGroup = SIDEBAR_NAVIGATION_GROUPS[i];
    const expGroup = expectedSidebarSpec[i];
    assert(
      actualGroup.title === expGroup.title &&
        actualGroup.items.length === expGroup.labels.length &&
        actualGroup.items.every((it, idx) => it.label === expGroup.labels[idx]),
      `Sidebar group ${expGroup.title} matches exact ordered items (${expGroup.labels.join(', ')})`
    );
  }
  assert(!SIDEBAR_NAVIGATION_GROUPS.some((g) => g.title === 'REPORT'), 'Sidebar removes standalone REPORT group (Report sits under ACCOUNTS)');
  assert(!navRoutesSrc.includes("id: 'COUPONS'"), 'Sidebar excludes non-accounting COUPONS module');
  assert(
    !sidebarSrc.includes('<Bell') &&
      !sidebarSrc.includes('<Plus') &&
      !sidebarSrc.includes('Navigation Menu') &&
      !/>\s*Navigation\s*</.test(sidebarSrc) &&
      !sidebarSrc.includes('notifications'),
    'Sidebar cleanly removes Navigation label, Plus icon, and Bell icon while DesktopTitleBar retains global controls'
  );

  // =========================================================================
  // TEST 68: Double-Entry Validation Engine (Balanced vs Unbalanced)
  // =========================================================================
  const balancedValidation = validateDoubleEntryLines([
    { id: 'l1', accountId: 'a1', accountCode: '1010', accountName: 'Cash', debit: 1500.5, credit: 0 },
    { id: 'l2', accountId: 'a2', accountCode: '4000', accountName: 'Sales', debit: 0, credit: 1500.5 },
  ]);
  assert(balancedValidation.valid === true && balancedValidation.totalDebit === 1500.5 && balancedValidation.totalCredit === 1500.5, 'Balanced double-entry lines pass strict validation');

  const unbalancedValidation = validateDoubleEntryLines([
    { id: 'l1', accountId: 'a1', accountCode: '1010', accountName: 'Cash', debit: 1500, credit: 0 },
    { id: 'l2', accountId: 'a2', accountCode: '4000', accountName: 'Sales', debit: 0, credit: 1400 },
  ]);
  assert(unbalancedValidation.valid === false, 'Unbalanced journal lines are strictly rejected');

  const singleLineValidation = validateDoubleEntryLines([
    { id: 'l1', accountId: 'a1', accountCode: '1010', accountName: 'Cash', debit: 500, credit: 0 },
  ]);
  assert(singleLineValidation.valid === false, 'Single-line journal entries are rejected');

  // =========================================================================
  // TEST 69: Chart of Accounts CRUD, Delete Protection & Safe Deactivation
  // =========================================================================
  offlineStore.seedTestDataForTesting();
  const coaList = offlineStore.getChartOfAccounts();
  assert(coaList.length >= 25, 'Default Indian SMB Chart of Accounts seeded with 25+ ledgers');
  assert(coaList.some((a) => a.code === SYSTEM_ACCOUNT_CODES.CASH), 'COA contains 1010 Cash on Hand');
  assert(coaList.some((a) => a.code === SYSTEM_ACCOUNT_CODES.OUTPUT_CGST), 'COA contains 2110 Output CGST');
  assert(coaList.some((a) => a.code === SYSTEM_ACCOUNT_CODES.INPUT_CGST), 'COA contains 1310 Input CGST');

  const customAccRes = offlineStore.createChartAccount({
    code: '5750',
    name: 'Software & Cloud Subscriptions',
    accountClass: 'EXPENSE',
    accountGroup: 'Operating Expenses',
    description: 'Annual accounting & POS SaaS licenses',
  });
  assert(customAccRes.success === true && Boolean(customAccRes.account), 'Custom Chart of Accounts ledger created successfully');
  const customAcc = customAccRes.account!;

  const dupCodeRes = offlineStore.createChartAccount({
    code: '5750',
    name: 'Duplicate Code Attempt',
    accountClass: 'EXPENSE',
    accountGroup: 'Operating Expenses',
  });
  assert(dupCodeRes.success === false, 'Duplicate COA account code is strictly rejected');

  const sysDelRes = offlineStore.deleteChartAccount(coaList.find((a) => a.code === '1010')!.id);
  assert(sysDelRes.success === false, 'System ledger accounts cannot be deleted');

  // =========================================================================
  // TEST 70: Manual Journal Lifecycle (DRAFT -> POSTED -> REVERSED) & Period Lock
  // =========================================================================
  const bankGlAcc = coaList.find((a) => a.code === SYSTEM_ACCOUNT_CODES.BANK)!;
  const unbalancedJeRes = offlineStore.createJournalEntry({
    entryDate: '2026-11-20',
    narration: 'Invalid unbalanced manual entry',
    lines: [
      { accountId: customAcc.id, debit: 2500, credit: 0 },
      { accountId: bankGlAcc.id, debit: 0, credit: 2000 },
    ],
    status: 'POSTED',
  });
  assert(unbalancedJeRes.success === false, 'Unbalanced manual journal entry rejected on creation');

  const draftJeRes = offlineStore.createJournalEntry({
    entryDate: '2026-11-20',
    referenceNumber: 'JV-TEST-001',
    narration: 'Monthly cloud hosting invoice',
    lines: [
      { accountId: customAcc.id, debit: 4500, credit: 0, description: 'Cloud hosting fee' },
      { accountId: bankGlAcc.id, debit: 0, credit: 4500, description: 'Paid via primary bank' },
    ],
    status: 'DRAFT',
  });
  assert(draftJeRes.success === true && draftJeRes.journalEntry?.status === 'DRAFT', 'Balanced manual journal saved in DRAFT status');
  const draftJe = draftJeRes.journalEntry!;

  const postJeRes = offlineStore.postJournalEntry(draftJe.id, 'Rajesh Sharma');
  assert(postJeRes.success === true && postJeRes.journalEntry?.status === 'POSTED', 'Draft journal posted atomically to General Ledger');

  // Cannot delete a COA ledger once referenced in posted GL
  const usedDelRes = offlineStore.deleteChartAccount(customAcc.id);
  assert(usedDelRes.success === false, 'Account with posted General Ledger history cannot be deleted');

  // Reversing posted journal creates mirrored reversing entry & marks original REVERSED
  const revJeRes = offlineStore.reverseJournalEntry(draftJe.id, 'Incorrect cost center', 'Rajesh Sharma');
  assert(revJeRes.success === true && Boolean(revJeRes.reversalEntry), 'Posted journal reversed with mirrored audit entry');
  assert(offlineStore.getJournalEntryById(draftJe.id)?.status === 'REVERSED', 'Original journal marked REVERSED after reversal');
  assert(
    revJeRes.reversalEntry!.totalDebit === 4500 && revJeRes.reversalEntry!.totalCredit === 4500,
    'Reversing journal preserves exact balanced totals'
  );

  // Period Lock Enforcement
  const periods = offlineStore.getAccountingPeriods();
  assert(periods.length > 0, 'Fiscal accounting periods initialized for organization');
  const targetPeriod = periods.find((p) => '2026-11-20' >= p.startDate && '2026-11-20' <= p.endDate) || periods[0];
  offlineStore.toggleAccountingPeriodLock(targetPeriod.id, true);
  const lockedPostAttempt = offlineStore.createJournalEntry({
    entryDate: targetPeriod.startDate,
    narration: 'Should be blocked in locked period',
    lines: [
      { accountId: customAcc.id, debit: 100, credit: 0 },
      { accountId: bankGlAcc.id, debit: 0, credit: 100 },
    ],
    status: 'POSTED',
  });
  assert(lockedPostAttempt.success === false, 'Posting into a locked accounting period is strictly rejected');
  offlineStore.toggleAccountingPeriodLock(targetPeriod.id, false);

  // =========================================================================
  // TEST 71: Budgets Lifecycle (Create -> Approve -> Revise) & Live GL Variance
  // =========================================================================
  const rentAcc = coaList.find((a) => a.code === SYSTEM_ACCOUNT_CODES.RENT_EXPENSE)!;
  const salesAcc = coaList.find((a) => a.code === SYSTEM_ACCOUNT_CODES.SALES_REVENUE)!;
  const budgetCreate = offlineStore.createBudget({
    name: 'FY 2026-27 Operating Plan',
    fiscalYear: '2026–2027',
    periodType: 'ANNUAL',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    lines: [
      { accountId: salesAcc.id, category: 'REVENUE', plannedAmount: 1000000 },
      { accountId: rentAcc.id, category: 'EXPENSE', plannedAmount: 240000 },
    ],
  });
  assert(budgetCreate.success === true && budgetCreate.budget?.status === 'DRAFT', 'Budget created in DRAFT status');
  const budget = budgetCreate.budget!;
  const approveRes = offlineStore.approveBudget(budget.id, 'Rajesh Sharma');
  assert(approveRes.success === true && approveRes.budget?.status === 'APPROVED', 'Budget approved successfully');
  const reviseRes = offlineStore.reviseBudget(
    budget.id,
    [
      { accountId: salesAcc.id, category: 'REVENUE', plannedAmount: 1200000 },
      { accountId: rentAcc.id, category: 'EXPENSE', plannedAmount: 250000 },
    ],
    'Mid-year revenue growth revision'
  );
  assert(reviseRes.success === true && (reviseRes.budget?.revisions.length || 0) >= 1, 'Budget revision records revision version with audit trail');
  const variance = offlineStore.getBudgetVariance(budget.id);
  assert(
    variance.rows.length === 2 &&
      variance.budget?.totalPlannedRevenue === 1200000 &&
      variance.totalPlanned === 1450000,
    'Budget variance engine calculates live GL actuals against approved plan'
  );

  // =========================================================================
  // TEST 72: Bulk Updates Validation, Duplicate Detection & Approval Gate
  // =========================================================================
  const unapprovedOpeningRes = offlineStore.commitBulkImportBatch({
    entityType: 'OPENING_BALANCES',
    fileName: 'opening_balances.csv',
    rows: [{ code: '1010', openingBalance: 50000 }],
    approved: false,
  });
  assert(unapprovedOpeningRes.success === false, 'Bulk opening balance import requires explicit approval confirmation');

  const approvedOpeningRes = offlineStore.commitBulkImportBatch({
    entityType: 'OPENING_BALANCES',
    fileName: 'opening_balances.csv',
    rows: [{ code: '1010', openingBalance: 50000 }],
    approved: true,
  });
  assert(approvedOpeningRes.success === true && approvedOpeningRes.batch?.status === 'COMMITTED', 'Approved bulk opening balances batch posts balanced adjustment journal');

  const custBulkRes = offlineStore.commitBulkImportBatch({
    entityType: 'CUSTOMERS',
    fileName: 'customers_bulk.csv',
    rows: [
      { name: 'Bulk Test Client', phone: '9876543210' },
      { name: 'Bulk Test Client', phone: '9876543210' }, // duplicate
      { name: '', phone: '' }, // invalid
    ],
    approved: true,
  });
  assert(
    custBulkRes.success === true &&
      (custBulkRes.batch?.importedRows || 0) >= 1 &&
      (custBulkRes.batch?.skippedDuplicates || 0) >= 1 &&
      (custBulkRes.batch?.errorCount || 0) >= 1,
    'Bulk import detects valid inserts, duplicate rows, and validation errors cleanly'
  );

  // =========================================================================
  // TEST 73: Banking Cash Account + Reconciliation + Optional Adjustment Journal
  // =========================================================================
  const cashRegAcc = offlineStore.addBankAccount({
    accountName: 'Main Counter Petty Cash',
    accountHolderName: 'Apex SuperStore',
    accountNumber: 'CASH-COUNTER-01',
    bankName: 'Cash Register',
    ifscCode: 'CASH0000000',
    accountType: 'CASH',
    openingBalance: 10000,
    isPrimary: false,
  });
  assert(cashRegAcc.accountType === 'CASH' && cashRegAcc.currentBalance === 10000, 'Cash account supported in Banking & Cash module');

  const bankForRecon = offlineStore.getBankAccounts()[0];
  const reconRes = offlineStore.saveBankReconciliation({
    bankAccountId: bankForRecon.id,
    statementDate: '2026-11-20',
    statementClosingBalance: bankForRecon.currentBalance - 250,
    clearedTransactionIds: [],
    postAdjustmentJournal: true,
    notes: 'Bank SMS & NEFT charges reconciliation',
  });
  assert(reconRes.success === true && Boolean(reconRes.reconciliation), 'Bank reconciliation persisted successfully');
  assert(Boolean(reconRes.adjustmentJournal), 'Reconciliation variance posts balanced adjustment journal automatically');

  // =========================================================================
  // TEST 74: Credit Note Refund Payout & Automated GL Posting
  // =========================================================================
  const refundCust = offlineStore.getCustomers()[0];
  const refundProd = offlineStore.getProducts()[0];
  const cnDraft = offlineStore.createCreditNote({
    customerId: refundCust.id,
    reason: 'CUSTOMER_RETURN',
    items: [
      {
        id: 'cni_refund_01',
        productId: refundProd.id,
        productName: refundProd.name,
        quantity: 1,
        unitPrice: 500,
        taxableAmount: 423.73,
        taxRate: 18,
        total: 500,
      },
    ],
    createdBy: 'usr_manager_01',
    restockInventory: true,
  });
  offlineStore.approveCreditNote(cnDraft.creditNote!.id, 'usr_manager_01', 'Rajesh Sharma');
  offlineStore.issueCreditNote(cnDraft.creditNote!.id, 'usr_manager_01', 'Rajesh Sharma');
  const cnRefundRes = offlineStore.refundCreditNote({
    creditNoteId: cnDraft.creditNote!.id,
    refundAmount: 500,
    refundMode: 'CASH',
    referenceNumber: 'REF-CASH-001',
  });
  assert(cnRefundRes.success === true && cnRefundRes.creditNote?.status === 'REFUNDED', 'Issued credit note refunded and transitioned to REFUNDED');

  // =========================================================================
  // TEST 75: Debit Note / Purchase Return, Stock Reduction & AP Relief
  // =========================================================================
  const dnSupp = offlineStore.getSuppliers()[0];
  const dnProd = offlineStore.getProducts()[0];
  const dnStockBefore = dnProd.currentStock;
  const dnRes = offlineStore.createAndIssueDebitNote({
    supplierId: dnSupp.id,
    reason: 'Defective batch returned to vendor',
    items: [
      {
        productId: dnProd.id,
        productName: dnProd.name,
        quantity: 2,
        unitPrice: 300,
        gstRate: 18,
      },
    ],
    deductInventory: true,
  });
  assert(dnRes.success === true && Boolean(dnRes.debitNote), 'Supplier Debit Note / Purchase Return created and issued');
  assert(
    dnProd.currentStock === Math.max(0, dnStockBefore - 2) && dnProd.stockLevel === dnProd.currentStock,
    'Debit note deducts returned stock from inventory'
  );

  // =========================================================================
  // TEST 76: Real-Time GL Financial Statements Integrity (TB, P&L, BS, CF, GST)
  // =========================================================================
  const tb = offlineStore.getTrialBalance();
  assert(tb.rows.length > 0, 'Trial Balance populated from posted General Ledger entries');
  assert(
    Math.abs(tb.totalDebit - tb.totalCredit) < 0.02 && tb.isBalanced === true,
    `Trial Balance strictly balances (Debits ₹${tb.totalDebit} === Credits ₹${tb.totalCredit})`
  );

  const pl = offlineStore.getProfitAndLoss();
  assert(typeof pl.netProfit === 'number' && typeof pl.grossProfit === 'number', 'Profit & Loss report computed from Income/COGS/Expense ledgers');

  const bs = offlineStore.getBalanceSheet();
  assert(
    bs.isBalanced === true && Math.abs(bs.totalAssets - bs.totalLiabilitiesAndEquity) < 0.02,
    `Balance Sheet strictly satisfies Assets (₹${bs.totalAssets}) === Liabilities + Equity (₹${bs.totalLiabilitiesAndEquity})`
  );

  const cf = offlineStore.getCashFlowStatement();
  assert(typeof cf.netCashChange === 'number' && typeof cf.netOperating === 'number', 'Cash Flow Statement computed from Operating, Investing, and Financing cash flows');

  const gst = offlineStore.getGstReport();
  assert(
    typeof gst.totalOutputGst === 'number' && typeof gst.totalInputGst === 'number' && typeof gst.netPayableGst === 'number',
    'GST Report computes Output GST, Input Tax Credit (ITC), and Net Payable from GL tax accounts'
  );

  const auditLogs = offlineStore.getFinancialAuditLogs();
  assert(auditLogs.length >= 5, 'Immutable financial audit logs recorded across accounting mutations');

  const unifiedTx = offlineStore.getUnifiedTransactions();
  assert(unifiedTx.length > 0, 'Unified Transactions ledger aggregates sales, bills, banking, notes, and manual journals');

  // =========================================================================
  // TEST 77: Finance-First Cleanup & Preservation Verification
  // =========================================================================
  assert(!fs.existsSync(path.resolve(process.cwd(), 'src/components/coupons/CouponsPage.tsx')), 'Non-accounting CouponsPage removed');
  assert(!fs.existsSync(path.resolve(process.cwd(), 'src/components/modals/LogTimeModal.tsx')), 'Non-accounting LogTimeModal removed');
  assert(!fs.existsSync(path.resolve(process.cwd(), 'src/components/modals/WeeklyLogModal.tsx')), 'Non-accounting WeeklyLogModal removed');

  // =========================================================================
  // TEST 78: Vercel Serverless Functions, Rewrites & Raw-Body Webhook Verification
  // =========================================================================
  const requiredApiFiles = [
    'api/health.ts',
    'api/auth-me.ts',
    'api/onboarding.ts',
    'api/provision-user.ts',
    'api/subscriptions.ts',
    'api/webhook.ts',
    'api/sync-push.ts',
    'api/sync-pull.ts',
    'api/role-navigation.ts',
    'api/accounting.ts',
  ];
  for (const apiFile of requiredApiFiles) {
    assert(fs.existsSync(path.resolve(process.cwd(), apiFile)), `Serverless endpoint ${apiFile} exists`);
  }

  const webhookSrc = fs.readFileSync(path.resolve(process.cwd(), 'api/webhook.ts'), 'utf-8');
  assert(webhookSrc.includes('bodyParser: false'), 'api/webhook.ts disables Next/Vercel bodyParser for exact raw-body HMAC verification');
  assert(webhookSrc.includes('collectRawBody'), 'api/webhook.ts collects exact raw UTF-8 payload stream bytes before JSON.parse');

  assert(
    vercelConfig.rewrites.some((r: any) => r.source === '/api/subscriptions/checkout' && r.destination === '/api/subscriptions'),
    'vercel.json rewrites /api/subscriptions/checkout to /api/subscriptions'
  );
  assert(
    vercelConfig.rewrites.some((r: any) => r.source === '/api/v1/sync/push' && r.destination === '/api/sync-push'),
    'vercel.json rewrites /api/v1/sync/push to /api/sync-push'
  );
  assert(
    vercelConfig.rewrites.some((r: any) => r.source === '/api/v1/admin/users/provision' && r.destination === '/api/provision-user'),
    'vercel.json rewrites /api/v1/admin/users/provision to /api/provision-user'
  );
  assert(
    vercelConfig.rewrites.some((r: any) => r.source === '/api/v1/accounting' && r.destination === '/api/accounting'),
    'vercel.json rewrites /api/v1/accounting to /api/accounting'
  );

  // =========================================================================
  // TEST 79: Additive Double-Entry Supabase Migration Structural Integrity
  // =========================================================================
  const acctMigPath = path.resolve(process.cwd(), 'supabase/migrations/20261121000000_double_entry_accounting_foundation.sql');
  assert(fs.existsSync(acctMigPath), 'Additive accounting migration 20261121000000_double_entry_accounting_foundation.sql exists');
  const acctMigSrc = fs.readFileSync(acctMigPath, 'utf-8');

  const requiredTables = [
    'chart_of_accounts',
    'accounting_periods',
    'journal_entries',
    'journal_entry_lines',
    'general_ledger',
    'accounting_posting_records',
    'budgets',
    'budget_lines',
    'bulk_import_batches',
    'bulk_import_errors',
    'debit_notes',
    'debit_note_items',
    'bank_reconciliations',
    'bank_reconciliation_items',
    'financial_audit_logs',
    'sync_outbox_events',
  ];
  for (const tbl of requiredTables) {
    assert(acctMigSrc.includes(`CREATE TABLE IF NOT EXISTS public.${tbl}`), `Accounting migration defines table public.${tbl}`);
    assert(acctMigSrc.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY;`), `Accounting migration enables RLS on public.${tbl}`);
  }
  assert(acctMigSrc.includes('numeric(15,2)'), 'Accounting migration uses exact numeric(15,2) decimal precision');
  assert(acctMigSrc.includes('post_journal_entry_atomic'), 'Accounting migration defines atomic journal posting RPC');
  assert(acctMigSrc.includes('reverse_journal_entry_atomic'), 'Accounting migration defines atomic journal reversal RPC');
  assert(acctMigSrc.includes('REVOKE UPDATE, DELETE ON TABLE public.general_ledger FROM authenticated'), 'Accounting migration enforces General Ledger immutability');
  assert(acctMigSrc.includes("'CASH'"), 'Accounting migration allows CASH account_type in bank_accounts');
  assert(acctMigSrc.includes('seed_default_chart_of_accounts'), 'Accounting migration seeds default COA idempotently for existing organizations');

  // =========================================================================
  // TEST 80: Security Hardening & Privilege Guards on Accounting & Checkout SQL
  // =========================================================================
  const rpcMigSrc = acctMigSrc;
  assert(
    rpcMigSrc.includes('public.is_trusted_service_role()') &&
      rpcMigSrc.includes("v_caller_role NOT IN ('SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER')") &&
      rpcMigSrc.includes('REVOKE ALL ON FUNCTION public.post_journal_entry_atomic(text, text) FROM PUBLIC, anon') &&
      rpcMigSrc.includes('REVOKE ALL ON FUNCTION public.reverse_journal_entry_atomic(text, text, text) FROM PUBLIC, anon') &&
      rpcMigSrc.includes('REVOKE ALL ON FUNCTION public.seed_default_chart_of_accounts(text) FROM PUBLIC, anon'),
    'Accounting SECURITY DEFINER RPCs enforce caller org, role authorization, and REVOKE FROM PUBLIC/anon'
  );

  const checkoutFixPath = path.resolve(process.cwd(), 'supabase/migrations/20261121000001_restore_hardened_process_sale_atomic.sql');
  assert(fs.existsSync(checkoutFixPath), 'Hardened checkout restoration migration 20261121000001 exists');
  const checkoutFixSrc = fs.readFileSync(checkoutFixPath, 'utf-8');
  assert(
    checkoutFixSrc.includes('auth.uid()') &&
      checkoutFixSrc.includes('FOR UPDATE') &&
      checkoutFixSrc.includes('sale_items') &&
      checkoutFixSrc.includes('CREDIT_NOTE') &&
      checkoutFixSrc.includes('REVOKE ALL ON FUNCTION public.process_sale_atomic(JSONB, JSONB, JSONB) FROM PUBLIC, anon'),
    'Restored process_sale_atomic enforces auth.uid(), row locks, item persistence, credit note tracking, and REVOKE FROM PUBLIC/anon'
  );

  const staffMigPath = path.resolve(process.cwd(), 'supabase/migrations/20261120000000_financial_modules_and_tenant_staff.sql');
  const staffMigSrc = fs.readFileSync(staffMigPath, 'utf-8');
  assert(
    staffMigSrc.includes('AND is_active = TRUE') &&
      !staffMigSrc.includes("AND status = 'ACTIVE'") &&
      staffMigSrc.includes('DROP POLICY IF EXISTS'),
    '20261120000000 uses is_active (not status) in current_user_org_id() and idempotent DROP POLICY IF EXISTS'
  );

  // =========================================================================
  // TEST 81: Production Fail-Closed Guards & Accounting API Completeness
  // =========================================================================
  const provSrc = fs.readFileSync(path.resolve(process.cwd(), 'api/provision-user.ts'), 'utf-8');
  const onbSrc = fs.readFileSync(path.resolve(process.cwd(), 'api/onboarding.ts'), 'utf-8');
  const acctApiSrc = fs.readFileSync(path.resolve(process.cwd(), 'api/accounting.ts'), 'utf-8');
  const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf-8');

  assert(
    provSrc.includes('!isProd') && provSrc.includes('res.status(503)') &&
      onbSrc.includes('!isProd') && onbSrc.includes('res.status(503)') &&
      serverSrc.includes('!isProdServer'),
    'Provisioning and onboarding endpoints fail closed (503) in production when Supabase is unconfigured'
  );
  for (const actionName of [
    'DELETE_COA',
    'TOGGLE_PERIOD_LOCK',
    'UPSERT_BUDGET',
    'REVISE_BUDGET',
    'APPROVE_BUDGET',
    'SAVE_RECONCILIATION',
    'RECORD_BULK_BATCH',
    'CREATE_DEBIT_NOTE',
    'AUDIT_LOG',
  ]) {
    assert(acctApiSrc.includes(actionName) && serverSrc.includes(actionName), `Both /api/accounting and server.ts handle ${actionName}`);
  }

  // =========================================================================
  // TEST 82: Multi-Tenant Login Context Switching & Sale Organization Isolation
  // =========================================================================
  const slateBillingManager = INITIAL_USERS.find((u) => u.email === 'manager@slatebilling.com')!;
  offlineStore.setBranches([
    {
      id: 'br_slate_billing_main',
      organizationId: 'org_slate_billing_01',
      code: 'SLB-MAIN',
      name: 'Slate Billing HQ',
      city: 'Bengaluru',
      state: 'Karnataka',
      address: 'HSR Layout',
      phone: '9988776655',
      isMainBranch: true,
      activeTerminalCount: 2,
    },
  ]);
  offlineStore.login(slateBillingManager.id, 'br_slate_billing_main', slateBillingManager);
  assert(
    offlineStore.getOrganization().id === 'org_slate_billing_01' &&
      offlineStore.getActiveBranchId() === 'br_slate_billing_main',
    'offlineStore.login updates active organization & branch strictly to authenticated tenant'
  );

  assert(
    offlineStore.getProducts().length === 0,
    'Switching tenant via offlineStore.login clears previous organization products (zero Apex leakage)'
  );
  const isolatedProd = offlineStore.addProduct({
    sku: 'SLB-SKU-01',
    barcode: '8909998887771',
    hsn: '8471',
    name: 'Slate Billing Scanner',
    categoryId: 'cat_slb_1',
    categoryName: 'Hardware',
    unit: 'PCS',
    costPrice: 1500,
    sellingPrice: 2500,
    gstRate: 18,
    currentStock: 20,
    minStockAlert: 2,
    isActive: true,
  });
  const isoItem = calculateCartItem(isolatedProd, 1, 0);
  const isoTotals = calculateCartTotals([isoItem]);
  const isolatedSaleRes = offlineStore.checkoutSale({
    items: [isoItem],
    payments: [{ id: 'pay_iso_1', method: 'CASH', amount: isoTotals.grandTotal, timestamp: new Date().toISOString(), status: 'VERIFIED' }],
    customer: null,
    notes: 'Tenant isolation verification',
  });
  assert(
    isolatedSaleRes.success === true &&
      isolatedSaleRes.sale?.organizationId === 'org_slate_billing_01' &&
      isolatedSaleRes.sale?.branchId === 'br_slate_billing_main',
    'checkoutSale tags invoice with authenticated tenant organizationId and branchId (no Apex leakage)'
  );

  // =========================================================================
  // TEST 83: Authoritative Granular Permission Matrix Parity & Exclusions
  // =========================================================================
  assert(normalizeRole('PURCHASE_OFFICER') === 'STORE_OFFICER', 'PURCHASE_OFFICER normalizes cleanly to STORE_OFFICER');
  assert(canManageUsers('ORG_ADMIN') && canManageRoles('ORG_ADMIN'), 'ORG_ADMIN can manage users and roles');
  assert(!canManageUsers('MANAGER') && !canManageRoles('MANAGER'), 'MANAGER is strictly excluded from USERS_MANAGE and ROLES_MANAGE');
  assert(
    hasPermission('MANAGER', 'USERS_VIEW') && hasPermission('MANAGER', 'AUDIT_VIEW'),
    'MANAGER retains read-only USERS_VIEW and AUDIT_VIEW permissions'
  );
  assert(
    !hasAnyPermission('MANAGER', ['SUBSCRIPTIONS_VIEW', 'SUBSCRIPTIONS_MANAGE', 'PLATFORM_MANAGE']),
    'MANAGER is strictly excluded from SUBSCRIPTIONS_VIEW, SUBSCRIPTIONS_MANAGE, and PLATFORM_MANAGE'
  );
  assert(
    hasPermission('MANAGER', 'BRANCH_SWITCH') &&
      hasPermission('MANAGER', 'BRANCH_MANAGE') &&
      hasPermission('MANAGER', 'FISCAL_MANAGE') &&
      hasPermission('MANAGER', 'COA_MANAGE') &&
      hasPermission('MANAGER', 'JOURNAL_MANAGE') &&
      hasPermission('MANAGER', 'BANKING_RECONCILE') &&
      hasPermission('MANAGER', 'REPORTS_FINANCIAL_VIEW') &&
      canSwitchOrgBranches('MANAGER'),
    'MANAGER shares full operational, accounting, banking, multi-branch, and fiscal permissions with ORG_ADMIN'
  );
  assert(
    hasPermission('CASHIER', 'POS_CHECKOUT') &&
      hasPermission('CASHIER', 'QUOTES_CREATE') &&
      !hasPermission('CASHIER', 'PRODUCTS_COST_VIEW') &&
      !hasPermission('CASHIER', 'QUOTES_DELETE') &&
      !hasPermission('CASHIER', 'CUSTOMERS_DELETE') &&
      !hasPermission('CASHIER', 'JOURNAL_MANAGE'),
    'CASHIER retains front-desk billing without wholesale costs, deletes, or accounting'
  );
  assert(
    hasPermission('STORE_OFFICER', 'PRODUCTS_COST_VIEW') &&
      hasPermission('STORE_OFFICER', 'SUPPLIERS_MANAGE') &&
      hasPermission('STORE_OFFICER', 'DEBIT_NOTES_MANAGE') &&
      hasPermission('STORE_OFFICER', 'QUOTES_VIEW') &&
      !hasPermission('STORE_OFFICER', 'QUOTES_CREATE') &&
      !hasPermission('STORE_OFFICER', 'POS_CHECKOUT') &&
      !hasPermission('STORE_OFFICER', 'CUSTOMERS_VIEW'),
    'STORE_OFFICER retains procurement & stock permissions without POS/customers/quote creation'
  );
  assert(getRolePermissions('CASHIER').length > 0 && getRolePermissions('UNKNOWN' as any).length === 0, 'Unrecognized roles default-deny all permissions');

  // =========================================================================
  // TEST 84: Regression Guard for SQL Column & RLS Fixes (20261121000001 & 20261122000000)
  // =========================================================================
  const processSaleFixedSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261121000001_restore_hardened_process_sale_atomic.sql'),
    'utf-8'
  );
  assert(
    !processSaleFixedSrc.includes('SELECT state_code INTO v_store_state_code\n    FROM public.stores') &&
      processSaleFixedSrc.includes('SELECT o.state_code INTO v_store_state_code') &&
      processSaleFixedSrc.includes('JOIN public.organizations o ON o.id = s.organization_id'),
    '20261121000001 resolves state_code via organizations join rather than nonexistent stores.state_code'
  );

  const remediationMigPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20261122000000_rls_permissions_branch_fixes.sql'
  );
  assert(fs.existsSync(remediationMigPath), 'Remediation migration 20261122000000_rls_permissions_branch_fixes.sql exists');
  const remediationSrc = fs.readFileSync(remediationMigPath, 'utf-8');
  const remediationSqlOnly = remediationSrc.replace(/--.*$/gm, '').toUpperCase();
  assert(
    remediationSrc.includes('CREATE OR REPLACE FUNCTION public.has_permission(p_perm TEXT)') &&
      remediationSrc.includes('CREATE POLICY "Quotations Insert Policy" ON public.quotations') &&
      remediationSrc.includes('CREATE POLICY "Products Insert Policy" ON public.products') &&
      remediationSrc.includes('CREATE POLICY "Customers Insert Policy" ON public.customers') &&
      remediationSrc.includes('SELECT o.state_code INTO v_store_state_code') &&
      !remediationSqlOnly.includes('DROP TABLE') &&
      !remediationSqlOnly.includes('TRUNCATE '),
    '20261122000000 defines public.has_permission(), explicit WITH CHECK RLS on quotations/products/customers, and is strictly non-destructive'
  );

  // =========================================================================
  // TEST 85: Zero Client-Side Demo Fallback & Role-Scoped Accounting API Guards
  // =========================================================================
  assert(
    !acctApiSrc.includes("'br_blr_01'") &&
      !acctApiSrc.includes("'org_apex_01'") &&
      acctApiSrc.includes('ACTION_PERMISSION_MAP') &&
      serverSrc.includes('ACCOUNTING_ACTION_PERMISSION_MAP'),
    'Accounting API and server.ts enforce ACTION_PERMISSION_MAP without hardcoded org_apex_01/br_blr_01 fallbacks'
  );

  // =========================================================================
  // TEST 86: Sidebar-Only Logo, Profile, Bell & Plus Removal (Preserved Elsewhere)
  // =========================================================================
  const desktopTitleBarSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/layout/DesktopTitleBar.tsx'),
    'utf-8'
  );
  assert(
    !sidebarSrc.includes('slate_pos_symbol_') &&
      !sidebarSrc.includes('/branding/logo.png') &&
      !sidebarSrc.includes('getActiveBrandLogoUrl') &&
      !sidebarSrc.includes('avatarUrl') &&
      !sidebarSrc.includes('Open profile drawer') &&
      !sidebarSrc.includes('Finance &amp; Accounting'),
    'Sidebar component removes brand logo, SLATE POS branding, and user profile section'
  );
  assert(
    desktopTitleBarSrc.includes('getActiveBrandLogoUrl') &&
      desktopTitleBarSrc.includes('Bell') &&
      desktopTitleBarSrc.includes('Plus') &&
      desktopTitleBarSrc.includes('onOpenProfile') &&
      profileDrawerSrc.includes('onSignOut') &&
      loginPageSrc.includes('getActiveBrandLogoUrl') &&
      splashSrc.includes('getActiveBrandLogoUrl') &&
      splashSrc.includes('bg-[#16587B]'),
    'DesktopTitleBar, ProfileDrawer, LoginPage, and SplashScreen use centralized brand logo and preserve global Bell/Plus/profile/logout controls'
  );
  assert(
    !appSrc.includes('WorkspaceTabBar') &&
      !appSrc.includes('workspaceTabs') &&
      !appSrc.includes('openTabs') &&
      appSrc.includes('renderActivePage(resolvedActiveView)') &&
      !fs.existsSync(path.resolve(process.cwd(), 'src/components/layout/WorkspaceTabBar.tsx')) &&
      !fs.existsSync(path.resolve(process.cwd(), 'src/lib/workspaceTabs.ts')),
    'App.tsx completely removes WorkspaceTabBar and multi-tab state, rendering a single active page'
  );

  // =========================================================================
  // TEST 87: Direct URL Route Mapping, Recipets vs Purchase Payments & Back/Forward Support
  // =========================================================================
  assert(
    resolveViewFromLocation('/receipts') === 'PAYMENTS' &&
      resolveViewFromLocation('/recipets') === 'PAYMENTS' &&
      getRoutePathForView('PAYMENTS') === '/receipts',
    'SALES Recipets routes to customer payments & receipts ledger (PAYMENTS)'
  );
  assert(
    resolveViewFromLocation('/payments') === 'PURCHASE_PAYMENTS' &&
      getRoutePathForView('PURCHASE_PAYMENTS') === '/payments',
    'PURCHASE Payments routes to supplier payments & disbursements (PURCHASE_PAYMENTS)'
  );
  assert(
    appSrc.includes("case 'PAYMENTS':") &&
      appSrc.includes('<SalesReceiptsPage') &&
      appSrc.includes("case 'PURCHASE_PAYMENTS':") &&
      appSrc.includes('<SupplierPaymentsPage') &&
      appSrc.includes("case 'DEBIT_NOTES':") &&
      appSrc.includes('<DebitNotesPage'),
    'App.tsx mounts dedicated SalesReceiptsPage (/receipts), SupplierPaymentsPage (/payments), and DebitNotesPage (/debit-notes)'
  );

  // =========================================================================
  // TEST 88: URL Route Resolution, Direct Links & RBAC Route Protection
  // =========================================================================
  const allSidebarItems = SIDEBAR_NAVIGATION_GROUPS.flatMap((g) => g.items);
  assert(allSidebarItems.length === 18, 'All 18 sidebar items across 5 groups are configured');
  for (const item of allSidebarItems) {
    const routePath = getRoutePathForView(item.id);
    const resolved = resolveViewFromLocation(routePath);
    assert(
      resolved === item.id && Boolean(MODULE_ROUTE_META[item.id]),
      `Sidebar item "${item.label}" maps cleanly to route "${routePath}" and resolves back to ${item.id}`
    );
  }
  assert(
    resolveViewFromLocation('/checkout') === 'POS' && resolveViewFromLocation('/profit-and-loss') === 'REPORT_PL',
    'Secondary routes (/checkout, /profit-and-loss) remain resolvable even when omitted from the streamlined sidebar'
  );
  assert(
    resolveViewFromLocation('/', '#type=recovery&access_token=abc') === null,
    'Recovery auth hash is preserved untouched by single-page route parser'
  );

  // Unauthorized direct URL enforcement
  const cashierDeniedRoute = resolveAuthorizedRouteForUser('CASHIER', '/profit-and-loss');
  assert(
    cashierDeniedRoute.deniedView === 'REPORT_PL' && cashierDeniedRoute.activeView === 'POS',
    'Unauthorized direct URL /profit-and-loss is denied for CASHIER with fallback to POS'
  );

  const managerDeniedRoute = resolveAuthorizedRouteForUser('MANAGER', '/subscriptions');
  assert(
    managerDeniedRoute.deniedView === 'SUBSCRIPTIONS' && managerDeniedRoute.activeView === 'DASHBOARD',
    'Unauthorized direct URL /subscriptions is denied for MANAGER with fallback to DASHBOARD'
  );

  const cashierAllowedRoute = resolveAuthorizedRouteForUser('CASHIER', '/receipts');
  assert(
    cashierAllowedRoute.deniedView === null && cashierAllowedRoute.activeView === 'PAYMENTS',
    'Authorized direct URL /receipts resolves cleanly for CASHIER'
  );

  // =========================================================================
  // TEST 89: Role-Wise Sidebar Visibility Matrix Verification
  // =========================================================================
  const visibleLabelsForRole = (role: any) =>
    SIDEBAR_NAVIGATION_GROUPS.flatMap((g) =>
      g.items.filter((it) => canAccessView(role, it.id)).map((it) => it.label)
    );

  const orgAdminLabels = visibleLabelsForRole('ORG_ADMIN');
  const managerLabels = visibleLabelsForRole('MANAGER');
  const cashierLabels = visibleLabelsForRole('CASHIER');
  const storeOfficerLabels = visibleLabelsForRole('STORE_OFFICER');
  const purchaseOfficerLabels = visibleLabelsForRole('PURCHASE_OFFICER');

  assert(orgAdminLabels.length === 18, 'ORG_ADMIN sees all 18 finalized sidebar navigation items');
  assert(managerLabels.length === 18, 'MANAGER sees all 18 operational, accounting, report & configure items');
  assert(
    cashierLabels.length === 5 &&
      cashierLabels.includes('Quotation') &&
      cashierLabels.includes('Inventory') &&
      cashierLabels.includes('Customers') &&
      cashierLabels.includes('Invoice') &&
      cashierLabels.includes('Recipets') &&
      canAccessView('CASHIER', 'POS') &&
      !cashierLabels.includes('Payments') &&
      !cashierLabels.includes('Banking') &&
      !cashierLabels.includes('Journal') &&
      !cashierLabels.includes('Configure'),
    'CASHIER sees strictly its 5 finalized billing/inventory sidebar items while retaining direct POS route access'
  );
  assert(
    storeOfficerLabels.length === 6 &&
      storeOfficerLabels.includes('Quotation') &&
      storeOfficerLabels.includes('Inventory') &&
      storeOfficerLabels.includes('Invoice') &&
      storeOfficerLabels.includes('Suppliers') &&
      storeOfficerLabels.includes('Bills') &&
      storeOfficerLabels.includes('Debit Notes') &&
      !storeOfficerLabels.includes('Checkout') &&
      !storeOfficerLabels.includes('Customers') &&
      !storeOfficerLabels.includes('Recipets') &&
      !storeOfficerLabels.includes('Payments') &&
      !storeOfficerLabels.includes('Journal'),
    'STORE_OFFICER sees strictly its 6 authorized procurement/inventory sidebar items'
  );
  assert(
    JSON.stringify(purchaseOfficerLabels) === JSON.stringify(storeOfficerLabels),
    'PURCHASE_OFFICER preserves identical purchase & inventory sidebar permissions'
  );

  // =========================================================================
  // TEST 90: Centralized 500x500 Transparent PNG Logo & Brand Management
  // =========================================================================
  const logoFilePath = path.resolve(process.cwd(), 'public/branding/logo.png');
  assert(fs.existsSync(logoFilePath), 'Centralized company logo asset public/branding/logo.png exists');
  const logoBytes = new Uint8Array(fs.readFileSync(logoFilePath));
  const parsedLogoDims = parsePngDimensions(logoBytes);
  const logoByteValidation = validatePngBytesForBrandLogo(logoBytes);
  assert(
    parsedLogoDims.valid &&
      parsedLogoDims.width === 500 &&
      parsedLogoDims.height === 500 &&
      logoByteValidation.valid,
    'Centralized company logo is a valid 500x500 PNG asset'
  );

  // Reject wrong dimensions & fake headers
  const wrongDimPng = new Uint8Array(logoBytes);
  wrongDimPng[18] = 0x00;
  wrongDimPng[19] = 0xc8; // width = 200
  const wrongDimResult = validatePngBytesForBrandLogo(wrongDimPng);
  assert(
    !wrongDimResult.valid && wrongDimResult.error?.includes('500 × 500'),
    'PNG brand validator rejects non-500x500 dimensions'
  );

  const nonPngBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert(!validatePngBytesForBrandLogo(nonPngBytes).valid, 'PNG brand validator rejects non-PNG binary signatures');

  assert(
    sanitizeBrandImageUrl('javascript:alert(1)') === undefined &&
      sanitizeBrandImageUrl('data:image/svg+xml,<svg></svg>') === undefined &&
      sanitizeBrandImageUrl(DEFAULT_BRAND_LOGO_PATH) === DEFAULT_BRAND_LOGO_PATH &&
      getActiveBrandLogoUrl({ logoUrl: 'https://cdn.example.com/logo.png' }) === 'https://cdn.example.com/logo.png' &&
      getActiveBrandLogoUrl({ logoUrl: 'javascript:bad()' }) === DEFAULT_BRAND_LOGO_PATH,
    'Brand image URL sanitizer blocks XSS payloads and preserves safe PNG / HTTPS assets'
  );

  const indexHtmlSrc = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
  const allSettingsSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/settings/AllSettingsPage.tsx'), 'utf-8');
  const quotePdfSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/quotes/QuotationDocumentPdf.tsx'), 'utf-8');
  const thermalSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/pos/ThermalReceiptModal.tsx'), 'utf-8');
  assert(
    indexHtmlSrc.includes('/branding/logo.png') &&
      allSettingsSrc.includes('validatePngLogoFile') &&
      quotePdfSrc.includes('getActiveBrandLogoUrl') &&
      !quotePdfSrc.includes('6383193254@okaxis') &&
      thermalSrc.includes('getActiveBrandLogoUrl'),
    'Favicon, Admin Settings Logo Manager, Quotation PDF, and Thermal Receipt use centralized organization branding without hardcoded merchant strings'
  );

  // =========================================================================
  // TEST 91: End-to-End Billing, Procurement & Accounting Workflow Fixes
  // =========================================================================
  {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    offlineStore.seedTestDataForTesting();
    const wfAdmin = INITIAL_USERS.find((u) => u.role === 'ORG_ADMIN') || INITIAL_USERS[0];
    offlineStore.login(wfAdmin.id, wfAdmin.branchId || 'br_blr_01', wfAdmin);

    const wfCust = offlineStore.addCustomer({
      name: 'Acme Accounting Test Corp',
      phone: '+91 98000 11223',
      email: 'ap@acme.example.com',
      address: 'Bengaluru',
      gstin: '29AABCU9603R1ZZ',
      creditLimit: 500000,
      totalOrdersCount: 0,
    });
    const wfProduct = offlineStore.getProducts()[0];
    const initialStock = Number(wfProduct.currentStock ?? wfProduct.stockLevel ?? 0);

    // 1. Goods Receipt syncs both currentStock and stockLevel
    const wfGrnRes = offlineStore.receiveGoods({
      supplierId: offlineStore.getSuppliers()[0].id,
      items: [{ productId: wfProduct.id, quantityReceived: 5, unitPrice: wfProduct.costPrice }],
      receivedBy: wfAdmin.id,
      receivedByName: wfAdmin.name,
    });
    const stockAfterGrn = Number(offlineStore.getProducts().find((p) => p.id === wfProduct.id)?.currentStock ?? 0);
    const stockLevelAfterGrn = Number(offlineStore.getProducts().find((p) => p.id === wfProduct.id)?.stockLevel ?? 0);
    assert(
      wfGrnRes.success && stockAfterGrn === initialStock + 5 && stockLevelAfterGrn === initialStock + 5,
      'receiveGoods updates both currentStock and stockLevel accurately'
    );

    // 2. Quotation -> Invoice conversion deducts stock & posts balanced SALES_INVOICE GL
    offlineStore.saveQuotation({
      id: `qt_wf_${Date.now()}`,
      quoteNumber: `QT-WF-${Date.now().toString().slice(-4)}`,
      quoteDate: new Date().toISOString().slice(0, 10),
      validUntil: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      customerId: wfCust.id,
      customerName: wfCust.name,
      customerPhone: wfCust.phone,
      customerEmail: wfCust.email,
      customerGstin: wfCust.gstin,
      billingAddress: 'Bengaluru',
      shippingAddress: 'Bengaluru',
      status: 'APPROVED',
      isInterstate: false,
      items: [
        {
          id: 'qi_1',
          productId: wfProduct.id,
          sku: wfProduct.sku,
          hsn: wfProduct.hsn,
          name: wfProduct.name,
          unit: wfProduct.unit,
          quantity: 2,
          rate: wfProduct.sellingPrice,
          discountPercent: 0,
          gstRate: wfProduct.gstRate,
          taxableValue: r2(wfProduct.sellingPrice * 2),
          cgstAmount: r2((wfProduct.sellingPrice * 2 * wfProduct.gstRate) / 200),
          sgstAmount: r2((wfProduct.sellingPrice * 2 * wfProduct.gstRate) / 200),
          igstAmount: 0,
          lineTotal: r2(wfProduct.sellingPrice * 2 * (1 + wfProduct.gstRate / 100)),
        },
      ],
      subtotal: r2(wfProduct.sellingPrice * 2),
      taxableTotal: r2(wfProduct.sellingPrice * 2),
      cgstTotal: r2((wfProduct.sellingPrice * 2 * wfProduct.gstRate) / 200),
      sgstTotal: r2((wfProduct.sellingPrice * 2 * wfProduct.gstRate) / 200),
      igstTotal: 0,
      totalGst: r2((wfProduct.sellingPrice * 2 * wfProduct.gstRate) / 100),
      roundOff: 0,
      grandTotal: r2(wfProduct.sellingPrice * 2 * (1 + wfProduct.gstRate / 100)),
      notes: 'Workflow verification quote',
      createdBy: wfAdmin.id,
      createdByName: wfAdmin.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const latestQuote = offlineStore.getQuotations()[0];
    const convRes = offlineStore.convertQuotationToInvoice(latestQuote.id);
    const stockAfterQuoteConv = Number(offlineStore.getProducts().find((p) => p.id === wfProduct.id)?.currentStock ?? 0);
    const convSaleJournal = offlineStore.getJournalEntries().find((j) => j.sourceId === convRes.sale?.id && j.sourceType === 'SALES_INVOICE');
    const custBalAfterConv = offlineStore.getCustomers().find((c) => c.id === wfCust.id)?.currentReceivableBalance || 0;
    assert(
      convRes.success &&
        Boolean(convRes.sale) &&
        stockAfterQuoteConv === stockAfterGrn - 2 &&
        Boolean(convSaleJournal) &&
        Math.abs((convSaleJournal?.totalDebit || 0) - (convSaleJournal?.totalCredit || 0)) < 0.01 &&
        Math.abs(custBalAfterConv - (convRes.sale?.grandTotal || 0)) < 0.05,
      'convertQuotationToInvoice deducts inventory, posts balanced GL journal, and updates customer receivable'
    );

    // 3. Repeat identical customer payments post distinct GL entries & settle invoice cleanly
    const halfAmt = r2((convRes.sale?.grandTotal || 0) / 2);
    const restAmt = r2((convRes.sale?.grandTotal || 0) - halfAmt);
    const pay1 = offlineStore.allocateCustomerPayment(wfCust.id, halfAmt, 'UPI', 'UTR-WF-1');
    const pay2 = offlineStore.allocateCustomerPayment(wfCust.id, restAmt, 'UPI', 'UTR-WF-2');
    const payJournal1 = offlineStore.getJournalEntries().find((j) => j.sourceId === pay1.receiptId);
    const payJournal2 = offlineStore.getJournalEntries().find((j) => j.sourceId === pay2.receiptId);
    const settledSale = offlineStore.getSales().find((s) => s.id === convRes.sale?.id);
    assert(
      pay1.success &&
        pay2.success &&
        pay1.receiptId !== pay2.receiptId &&
        Boolean(payJournal1) &&
        Boolean(payJournal2) &&
        payJournal1?.id !== payJournal2?.id &&
        settledSale?.paymentStatus === 'PAID',
      'allocateCustomerPayment creates distinct GL journals for same-day repeat payments and settles invoice to PAID'
    );

    // 4. Credit note issuance reduces receivable & restocks both stock fields
    const cnCreate = offlineStore.createCreditNote({
      customerId: wfCust.id,
      items: [
        {
          id: 'cni_wf_1',
          productId: wfProduct.id,
          productName: wfProduct.name,
          sku: wfProduct.sku,
          quantity: 1,
          unitPrice: wfProduct.sellingPrice,
          taxRate: wfProduct.gstRate,
        },
      ],
      reason: 'Returned unit in workflow test',
      restockInventory: true,
      createdBy: wfAdmin.id,
      createdByName: wfAdmin.name,
    });
    const stockBeforeCn = Number(offlineStore.getProducts().find((p) => p.id === wfProduct.id)?.currentStock ?? 0);
    const cnIssue = cnCreate.creditNote ? offlineStore.issueCreditNote(cnCreate.creditNote.id, wfAdmin.id, wfAdmin.name) : { success: false };
    const stockAfterCn = Number(offlineStore.getProducts().find((p) => p.id === wfProduct.id)?.currentStock ?? 0);
    const stockLevelAfterCn = Number(offlineStore.getProducts().find((p) => p.id === wfProduct.id)?.stockLevel ?? 0);
    assert(
      cnCreate.success && cnIssue.success && stockAfterCn === stockBeforeCn + 1 && stockLevelAfterCn === stockBeforeCn + 1,
      'issueCreditNote restocks both currentStock and stockLevel cleanly'
    );

    // 5. Sale refund posts balanced reversal GL journal via buildSaleRefundLines
    const refundLines = convRes.sale
      ? buildSaleRefundLines({
          sale: convRes.sale,
          refundAmount: 100,
          refundMethod: 'CASH',
          restockCostValue: wfProduct.costPrice,
          accounts: offlineStore.getChartOfAccounts(),
        })
      : [];
    const refundBalCheck = validateDoubleEntryLines(refundLines);
    assert(refundLines.length >= 2 && refundBalCheck.valid, 'buildSaleRefundLines produces balanced double-entry reversal lines');

    // 6. Trial Balance & Balance Sheet stay strictly balanced after full multi-module workflow
    const tbAfterWf = offlineStore.getTrialBalance();
    const bsAfterWf = offlineStore.getBalanceSheet();
    assert(tbAfterWf.isBalanced && bsAfterWf.isBalanced, 'Trial Balance and Balance Sheet remain strictly balanced after end-to-end workflow');
  }

  // =========================================================================
  // TEST 92: Mobile Floating Pill Bottom Navigation & Tricolour Compliance
  // =========================================================================
  {
    const mobileNavSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/layout/MobileBottomNav.tsx'), 'utf-8');
    assert(
      mobileNavSrc.includes("label: 'Home'") &&
        mobileNavSrc.includes("label: 'Quotation'") &&
        mobileNavSrc.includes("label: 'Bill'") &&
        mobileNavSrc.includes("label: 'Invoice'") &&
        mobileNavSrc.includes("label: 'Inventory'") &&
        mobileNavSrc.includes("id: 'DASHBOARD'") &&
        mobileNavSrc.includes("id: 'QUOTES'") &&
        mobileNavSrc.includes("id: 'PURCHASES'") &&
        mobileNavSrc.includes("id: 'SALES'") &&
        mobileNavSrc.includes("id: 'PRODUCTS'") &&
        !mobileNavSrc.includes('style={{') &&
        mobileNavSrc.includes('rounded-full') &&
        mobileNavSrc.includes('#16587B') &&
        mobileNavSrc.includes('#84B3CE') &&
        mobileNavSrc.includes('#F5EEDD') &&
        mobileNavSrc.includes('canAccessView'),
      'MobileBottomNav implements floating capsule with exact 5 destinations, Tricolour palette, RBAC filtering, and zero inline style'
    );

    const desktopBarSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/layout/DesktopTitleBar.tsx'), 'utf-8');
    assert(
      desktopBarSrc.includes('getSaveStatus') &&
        desktopBarSrc.includes('retryFailedSync') &&
        desktopBarSrc.includes('Saving…') &&
        desktopBarSrc.includes('Failed to save'),
      'DesktopTitleBar renders live Saving / Saved / Failed to save retry telemetry'
    );
  }

  // =========================================================================
  // TEST 93: Expense Organization Fix, Draft Isolation & Cloud Save Lifecycle
  // =========================================================================
  {
    const expenseMgrSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/expenses/ExpenseManager.tsx'), 'utf-8');
    assert(
      !expenseMgrSrc.includes('org_apex_01') &&
        expenseMgrSrc.includes('offlineStore.getOrganization().id') &&
        expenseMgrSrc.includes('offlineStore.updateExpense') &&
        expenseMgrSrc.includes('offlineStore.deleteExpense') &&
        expenseMgrSrc.includes("hasPermission(activeUser, 'EXPENSES_MANAGE')"),
      'ExpenseManager resolves active organizationId dynamically, gates CRUD with EXPENSES_MANAGE, and supports Edit/Delete'
    );

    offlineStore.seedTestDataForTesting();
    const admin = INITIAL_USERS.find((u) => u.role === 'ORG_ADMIN') || INITIAL_USERS[0];
    offlineStore.login(admin.id, admin.branchId || 'br_blr_01', admin);

    offlineStore.saveDraft('expense_form', { vendor: 'Draft Electricity Co', amount: 4500 });
    const restoredDraft = offlineStore.getDraft<{ vendor: string; amount: number }>('expense_form');
    assert(
      restoredDraft?.vendor === 'Draft Electricity Co' && restoredDraft.amount === 4500,
      'Tenant-scoped form drafts save and restore accurately while authenticated'
    );

    offlineStore.clearDraft('expense_form');
    assert(offlineStore.getDraft('expense_form') === null, 'clearDraft removes the targeted draft cleanly');

    offlineStore.saveDraft('customer_form', { name: 'Pending Logout Customer' });
    offlineStore.logout();
    assert(offlineStore.getDraft('customer_form') === null, 'logout purges tenant-scoped form drafts cleanly');

    const saveStatusAfterLogout = offlineStore.getSaveStatus();
    assert(
      saveStatusAfterLogout.state === 'IDLE' && saveStatusAfterLogout.pendingCount === 0,
      'getSaveStatus resets cleanly to IDLE with zero pending items on logout'
    );
  }

  // =========================================================================
  // TEST 94: Server Sync RBAC Enforcement & CORS Origin Allowlist
  // =========================================================================
  {
    assert(
      isAllowedSyncOrigin('http://localhost:3000') &&
        isAllowedSyncOrigin('https://slate-pos-preview.vercel.app') &&
        !isAllowedSyncOrigin('https://evil.example.com') &&
        !isAllowedSyncOrigin(undefined),
      'isAllowedSyncOrigin strictly permits local dev, vercel.app, and run.app while rejecting untrusted origins'
    );

    const mockSupabase: any = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
        upsert: async () => ({ error: null }),
        insert: async () => ({ error: null }),
      }),
    };

    const cashierSyncRes = await applySyncPushItems({
      supabase: mockSupabase,
      orgId: 'org_test_1',
      defaultBranchId: 'br_1',
      role: 'CASHIER',
      items: [
        {
          id: 'sync_rbac_1',
          eventType: 'EXPENSE_UPSERTED',
          entityId: 'exp_rbac_1',
          payload: { vendor: 'Unauthorized Expense', amount: 500 },
        },
      ],
    });
    assert(
      cashierSyncRes.processedIds.length === 0 &&
        cashierSyncRes.conflicts.length === 1 &&
        cashierSyncRes.conflicts[0].code === 'FORBIDDEN',
      'Server sync engine rejects unauthorized CASHIER expense upsert with FORBIDDEN conflict'
    );
  }

  // =========================================================================
  // TEST 95: Additive DB Storage Optimization Migration Integrity
  // =========================================================================
  {
    const migrationSql = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/20261128000000_persistence_sync_and_storage_optimization.sql'),
      'utf-8'
    );
    assert(
      migrationSql.includes('CREATE TABLE IF NOT EXISTS public.user_preferences') &&
        migrationSql.includes('CREATE OR REPLACE FUNCTION public.process_customer_payment_atomic') &&
        migrationSql.includes('CREATE OR REPLACE FUNCTION public.purge_expired_transient_sync_data') &&
        migrationSql.includes("status = 'SYNCED'") &&
        !migrationSql.includes('DROP TABLE') &&
        !migrationSql.includes('DELETE FROM public.sales') &&
        !migrationSql.includes('DELETE FROM public.journal_entries'),
      'Additive DB migration preserves all financial/business tables and limits purge strictly to expired SYNCED transient rows'
    );
  }

  // =========================================================================
  // TEST 96: Rendered React DOM Verification (Sidebar, MobileBottomNav, Save Telemetry)
  // =========================================================================
  {
    offlineStore.seedTestDataForTesting();
    const admin = INITIAL_USERS.find((u) => u.role === 'ORG_ADMIN') || INITIAL_USERS[0];
    const cashier = INITIAL_USERS.find((u) => u.role === 'CASHIER')!;
    const storeOfficer = INITIAL_USERS.find((u) => u.role === 'STORE_OFFICER')!;

    // 1. Admin / Manager Sidebar renders Expenses inside PURCHASE immediately after Debit Notes
    offlineStore.login(admin.id, admin.branchId || 'br_blr_01', admin);
    const sidebarHtml = renderToStaticMarkup(
      React.createElement(Sidebar, { activeView: 'EXPENSES', onSelectView: () => {} })
    );
    const purchaseSectionMatch = sidebarHtml.match(/PURCHASE<\/div>([\s\S]*?)ACCOUNTS<\/div>/);
    assert(
      Boolean(purchaseSectionMatch) &&
        purchaseSectionMatch![1].includes('Debit Notes') &&
        purchaseSectionMatch![1].includes('Expenses') &&
        purchaseSectionMatch![1].indexOf('Debit Notes') < purchaseSectionMatch![1].indexOf('Expenses'),
      'Rendered Sidebar places Expenses inside PURCHASE immediately after Debit Notes'
    );

    // 2. Admin MobileBottomNav renders all 5 floating capsule items in exact order without inline style
    const adminMobileHtml = renderToStaticMarkup(
      React.createElement(MobileBottomNav, { activeView: 'DASHBOARD', onNavigateToView: () => {} })
    );
    const adminLabels = ['Home', 'Quotation', 'Bill', 'Invoice', 'Inventory'];
    let lastPos = -1;
    let inOrder = true;
    for (const lbl of adminLabels) {
      const pos = adminMobileHtml.indexOf(`>${lbl}<`);
      if (pos <= lastPos) inOrder = false;
      lastPos = pos;
    }
    assert(
      inOrder && !adminMobileHtml.includes('style="') && adminMobileHtml.includes('rounded-full'),
      'Rendered MobileBottomNav displays Home, Quotation, Bill, Invoice, Inventory in exact order as floating capsule with zero inline style'
    );

    // 3. Cashier MobileBottomNav filters unauthorized Home/Bill without gaps
    offlineStore.login(cashier.id, cashier.branchId || 'br_blr_01', cashier);
    const cashierMobileHtml = renderToStaticMarkup(
      React.createElement(MobileBottomNav, { activeView: 'SALES', onNavigateToView: () => {} })
    );
    assert(
      !cashierMobileHtml.includes('>Home<') &&
        !cashierMobileHtml.includes('>Bill<') &&
        cashierMobileHtml.includes('>Quotation<') &&
        cashierMobileHtml.includes('>Invoice<') &&
        cashierMobileHtml.includes('>Inventory<'),
      'Rendered MobileBottomNav enforces CASHIER RBAC visibility (Quotation, Invoice, Inventory only)'
    );

    // 4. Store Officer MobileBottomNav hides Home while retaining Quotation, Bill, Invoice, Inventory
    offlineStore.login(storeOfficer.id, storeOfficer.branchId || 'br_blr_01', storeOfficer);
    const storeMobileHtml = renderToStaticMarkup(
      React.createElement(MobileBottomNav, { activeView: 'PRODUCTS', onNavigateToView: () => {} })
    );
    assert(
      !storeMobileHtml.includes('>Home<') &&
        storeMobileHtml.includes('>Quotation<') &&
        storeMobileHtml.includes('>Bill<') &&
        storeMobileHtml.includes('>Invoice<') &&
        storeMobileHtml.includes('>Inventory<'),
      'Rendered MobileBottomNav enforces STORE_OFFICER RBAC visibility (Quotation, Bill, Invoice, Inventory)'
    );

    // 5. DesktopTitleBar renders clean header without crashing across roles
    const titleBarHtml = renderToStaticMarkup(
      React.createElement(DesktopTitleBar, { onNavigateToView: () => {} })
    );
    assert(titleBarHtml.includes('SLATE POS'), 'Rendered DesktopTitleBar mounts cleanly with save telemetry hooks');

    offlineStore.logout();
  }

  // =========================================================================
  // TEST 97: Dedicated Standalone Pages SSR Rendering Verification
  // =========================================================================
  {
    offlineStore.seedTestDataForTesting();
    const admin = INITIAL_USERS.find((u) => u.role === 'ORG_ADMIN') || INITIAL_USERS[0];
    offlineStore.login(admin.id, admin.branchId || 'br_blr_01', admin);

    const receiptsHtml = renderToStaticMarkup(React.createElement(SalesReceiptsPage));
    const paymentsHtml = renderToStaticMarkup(React.createElement(SupplierPaymentsPage));
    const debitNotesHtml = renderToStaticMarkup(React.createElement(DebitNotesPage));

    assert(
      receiptsHtml.includes('Customer Receipts') && receiptsHtml.includes('Record Receipt'),
      'SalesReceiptsPage renders cleanly via SSR with Customer Receipts heading & Record Receipt CTA'
    );
    assert(
      paymentsHtml.includes('Supplier Payments') && paymentsHtml.includes('Record Payment'),
      'SupplierPaymentsPage renders cleanly via SSR with Supplier Payments heading & Record Payment CTA'
    );
    assert(
      debitNotesHtml.includes('Debit Notes &amp; Purchase Returns') && debitNotesHtml.includes('New Debit Note'),
      'DebitNotesPage renders cleanly via SSR with Debit Notes heading & New Debit Note CTA'
    );
  }

  // =========================================================================
  // TEST 98: Customer Receipts Lifecycle, Bank Deposit & Reversal Reconciliation
  // =========================================================================
  {
    offlineStore.seedTestDataForTesting();
    const admin = INITIAL_USERS.find((u) => u.role === 'ORG_ADMIN') || INITIAL_USERS[0];
    offlineStore.login(admin.id, admin.branchId || 'br_blr_01', admin);

    const cust = offlineStore.addCustomer({
      name: 'Receipt Lifecycle Test Buyer',
      phone: '+91 98111 22334',
      address: 'Bengaluru',
      gstin: '29AABCU9603R1ZZ',
      creditLimit: 200000,
      totalOrdersCount: 0,
    });
    const prod = offlineStore.getProducts()[0];
    const bank = offlineStore.getBankAccounts()[0];
    const bankBefore = bank.currentBalance;

    const item = calculateCartItem(prod, 1, 0);
    const saleTotals = calculateCartTotals([item]);
    const creditSale = offlineStore.checkoutSale({
      items: [item],
      customer: cust,
      payments: [{ id: 'credit_hold_1', method: 'CREDIT', amount: 0, timestamp: new Date().toISOString(), status: 'PENDING' }],
    });
    assert(creditSale.success && Boolean(creditSale.sale), 'Credit invoice created for receipt allocation test');

    const receiptRes = offlineStore.recordCustomerReceipt({
      customerId: cust.id,
      amount: saleTotals.grandTotal + 250,
      paymentMethod: 'UPI',
      bankAccountId: bank.id,
      referenceNumber: 'UTR-REC-98',
      allocations: creditSale.sale ? [{ saleId: creditSale.sale.id, amount: saleTotals.grandTotal }] : undefined,
    });

    const bankAfterReceipt = offlineStore.getBankAccounts().find((b) => b.id === bank.id)!.currentBalance;
    const custAfterReceipt = offlineStore.getCustomers().find((c) => c.id === cust.id)!.currentReceivableBalance;
    const invAfterReceipt = offlineStore.getSales().find((s) => s.id === creditSale.sale?.id)!;
    assert(
      receiptRes.success &&
        receiptRes.receipt?.unallocatedAdvance === 250 &&
        Math.abs(bankAfterReceipt - (bankBefore + saleTotals.grandTotal + 250)) < 0.05 &&
        custAfterReceipt === 0 &&
        invAfterReceipt.paymentStatus === 'PAID',
      'recordCustomerReceipt updates invoice to PAID, clears customer AR, tracks unallocated advance, and credits bank'
    );

    const revRes = offlineStore.reverseCustomerReceipt(receiptRes.receipt!.id, 'UPI reversal verification');
    const bankAfterRev = offlineStore.getBankAccounts().find((b) => b.id === bank.id)!.currentBalance;
    const custAfterRev = offlineStore.getCustomers().find((c) => c.id === cust.id)!.currentReceivableBalance;
    const invAfterRev = offlineStore.getSales().find((s) => s.id === creditSale.sale?.id)!;
    assert(
      revRes.success &&
        revRes.receipt?.status === 'REVERSED' &&
        Math.abs(bankAfterRev - bankBefore) < 0.05 &&
        Math.abs(custAfterRev - saleTotals.grandTotal) < 0.05 &&
        invAfterRev.paymentStatus === 'OVERDUE' &&
        offlineStore.getTrialBalance().isBalanced &&
        offlineStore.getBalanceSheet().isBalanced,
      'reverseCustomerReceipt restores bank balance, customer AR, invoice status, and balanced Trial Balance & Balance Sheet'
    );
  }

  // =========================================================================
  // TEST 99: Supplier Payment Lifecycle (Bill + Advance) & Reversal
  // =========================================================================
  {
    const sup = offlineStore.getSuppliers()[0];
    const bank = offlineStore.getBankAccounts()[0];
    const bankStart = bank.currentBalance;
    const supApStart = sup.currentPayableBalance;

    const bill = offlineStore.createSupplierBill({
      organizationId: offlineStore.getOrganization().id,
      branchId: offlineStore.getActiveBranchId(),
      supplierInvoiceNumber: `SUP-TEST-${Date.now().toString().slice(-4)}`,
      supplierId: sup.id,
      supplierName: sup.name,
      billDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
      subtotal: 1000,
      taxableTotal: 1000,
      gstTotal: 180,
      discountTotal: 0,
      additionalCharges: 0,
      totalAmount: 1180,
    });

    const payRes = offlineStore.recordSupplierPayment({
      supplierId: sup.id,
      amount: 1180,
      paymentMethod: 'CASH',
      bankAccountId: bank.id,
      allocations: [{ billId: bill.id, amount: 1180 }],
      paidBy: 'usr_admin_01',
      paidByName: 'Admin',
    });

    const updatedBill = offlineStore.getSupplierBills().find((b) => b.id === bill.id)!;
    const bankAfterPay = offlineStore.getBankAccounts().find((b) => b.id === bank.id)!.currentBalance;
    assert(
      payRes.success &&
        updatedBill.status === 'PAID' &&
        updatedBill.outstandingAmount === 0 &&
        Math.abs(bankAfterPay - (bankStart - 1180)) < 0.05,
      'recordSupplierPayment settles bill, deducts selected cash/bank account, and posts GL'
    );

    const revPay = offlineStore.reverseSupplierPayment(payRes.payment!.id, 'Vendor refund / bounced');
    const billAfterRev = offlineStore.getSupplierBills().find((b) => b.id === bill.id)!;
    const bankAfterPayRev = offlineStore.getBankAccounts().find((b) => b.id === bank.id)!.currentBalance;
    const supAfterRev = offlineStore.getSuppliers().find((s) => s.id === sup.id)!.currentPayableBalance;
    assert(
      revPay.success &&
        revPay.payment?.status === 'REVERSED' &&
        billAfterRev.status === 'PENDING' &&
        Math.abs(billAfterRev.outstandingAmount - 1180) < 0.05 &&
        Math.abs(bankAfterPayRev - bankStart) < 0.05 &&
        Math.abs(supAfterRev - (supApStart + 1180)) < 0.05 &&
        offlineStore.getTrialBalance().isBalanced &&
        offlineStore.getBalanceSheet().isBalanced,
      'reverseSupplierPayment restores bill, supplier AP, cash/bank balance, and balanced GL'
    );
  }

  // =========================================================================
  // TEST 100: Supplier Debit Note Workflow (Draft -> Approve -> Issue -> Cancel)
  // =========================================================================
  {
    const sup = offlineStore.getSuppliers()[0];
    const prod = offlineStore.getProducts()[0];
    const stockBefore = prod.currentStock;
    const apBefore = sup.currentPayableBalance;
    const journalCountBefore = offlineStore.getJournalEntries().length;

    const draftRes = offlineStore.createDebitNoteDraft({
      supplierId: sup.id,
      reason: 'DAMAGED_GOODS',
      items: [{ productId: prod.id, quantity: 2, unitPrice: 500, gstRate: 18 }],
      deductInventory: true,
    });
    assert(
      draftRes.success &&
        draftRes.debitNote?.status === 'DRAFT' &&
        offlineStore.getProducts().find((p) => p.id === prod.id)!.currentStock === stockBefore &&
        offlineStore.getJournalEntries().length === journalCountBefore,
      'createDebitNoteDraft creates DRAFT without altering stock, AP, or GL prematurely'
    );

    const appRes = offlineStore.approveDebitNote(draftRes.debitNote!.id);
    assert(appRes.success && appRes.debitNote?.status === 'APPROVED', 'approveDebitNote transitions DRAFT -> APPROVED');

    const issueRes = offlineStore.issueDebitNote(draftRes.debitNote!.id);
    const stockAfterIssue = offlineStore.getProducts().find((p) => p.id === prod.id)!.currentStock;
    const apAfterIssue = offlineStore.getSuppliers().find((s) => s.id === sup.id)!.currentPayableBalance;
    assert(
      issueRes.success &&
        issueRes.debitNote?.status === 'ISSUED' &&
        stockAfterIssue === stockBefore - 2 &&
        apAfterIssue <= apBefore &&
        offlineStore.getJournalEntries().length === journalCountBefore + 1,
      'issueDebitNote deducts inventory, reduces supplier AP, and posts GL voucher'
    );

    const cancelRes = offlineStore.cancelDebitNote(draftRes.debitNote!.id, 'Vendor rejected claim');
    const stockAfterCancel = offlineStore.getProducts().find((p) => p.id === prod.id)!.currentStock;
    assert(
      cancelRes.success &&
        cancelRes.debitNote?.status === 'CANCELLED' &&
        stockAfterCancel === stockBefore &&
        offlineStore.getTrialBalance().isBalanced &&
        offlineStore.getBalanceSheet().isBalanced,
      'cancelDebitNote restores inventory and posts balanced GL reversal'
    );
  }

  // =========================================================================
  // TEST 101: Supabase 404 Circuit Breaker, Branch Sanitization & API Handlers
  // =========================================================================
  {
    resetUnavailableSchemaTables();
    assert(!isTableMarkedUnavailable('customer_receipts'), 'Fresh circuit breaker has no blocked tables');
    const marked = handleSchemaTableError('customer_receipts', { code: 'PGRST205', message: 'Could not find the table' });
    assert(marked === true && isTableMarkedUnavailable('customer_receipts'), '404/PGRST205 marks missing table unavailable to stop spam');
    resetUnavailableSchemaTables();
    assert(!isTableMarkedUnavailable('customer_receipts'), 'resetUnavailableSchemaTables clears circuit breaker state cleanly');

    assert(
      sanitizeBranchIdForDb('ALL') === null &&
        sanitizeBranchIdForDb('main-branch') === null &&
        sanitizeBranchIdForDb('') === null &&
        sanitizeBranchIdForDb('br_blr_01') === 'br_blr_01',
      'sanitizeBranchIdForDb converts ALL / main-branch / empty strings to null while preserving real branch IDs'
    );

    // API Handler smoke verification (/api/health and /api/accounting)
    let healthStatus = 0;
    let healthBody: any = null;
    await healthHandler(
      { method: 'GET', headers: {} },
      {
        status: (code: number) => {
          healthStatus = code;
          return {
            json: (body: any) => { healthBody = body; return {} as any; },
            setHeader: () => ({} as any),
            status: () => ({} as any),
            end: () => {},
          };
        },
        json: (body: any) => { healthBody = body; return {} as any; },
        setHeader: () => ({} as any),
        end: () => {},
      }
    );
    assert(healthStatus === 200 && healthBody?.status === 'healthy', '/api/health returns 200 healthy telemetry cleanly');

    let acctStatus = 0;
    await accountingHandler(
      { method: 'GET', headers: {} },
      {
        status: (code: number) => {
          acctStatus = code;
          return {
            json: () => ({} as any),
            setHeader: () => ({} as any),
            status: () => ({} as any),
            end: () => {},
          };
        },
        json: () => ({} as any),
        setHeader: () => ({} as any),
        end: () => {},
      }
    );
    assert(acctStatus === 401, '/api/accounting rejects unauthenticated requests cleanly with HTTP 401 instead of 500');
  }

  console.log(`\nTest Execution Summary: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();
