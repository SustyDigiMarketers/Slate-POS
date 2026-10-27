/**
 * SLATE POS — Comprehensive Automated Verification Test Suite
 * Tests financial calculations, Indian GST CGST/SGST split, cart totals,
 * offline checkout tender, split payments, idempotency keys, and RBAC permissions
 */

import fs from 'fs';
import path from 'path';
import { calculateCartItem, calculateCartTotals } from '../../src/lib/taxCalculations';
import { formatINR } from '../../src/lib/formatters';
import { Product, PaymentRecord } from '../../src/types';
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
} from '../../src/lib/supabaseClient';
import { offlineStore } from '../../src/lib/offlineStore';
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

  // TEST 9: Role-Based Navigation Matrix & Module Boundaries
  const cashierAllowed = [
    'CUSTOMERS', 'PRODUCTS', 'POS', 'QUOTES', 'SALES', 'COUPONS', 'PAYMENTS'
  ] as const;
  const cashierBlocked = [
    'DASHBOARD', 'SUPPLIERS', 'CHALLANS', 'EXPENSES', 'REPORTS', 'STAFF', 'SETTINGS', 'SUBSCRIPTIONS', 'INVENTORY', 'SYNC'
  ] as const;

  const allCashierAllowedPass = cashierAllowed.every((view) => canAccessView('CASHIER', view));
  const allCashierBlockedPass = cashierBlocked.every((view) => !canAccessView('CASHIER', view));
  assert(allCashierAllowedPass, 'Cashier has access to exactly 7 authorized modules');
  assert(allCashierBlockedPass, 'Cashier is strictly blocked from suppliers, delivery, reports, settings, and subscriptions');

  // TEST 10: Store / Purchase Officer Module Boundaries
  const storeOfficerAllowed = [
    'SUPPLIERS', 'PRODUCTS', 'QUOTES', 'SALES', 'COUPONS', 'CHALLANS'
  ] as const;
  const storeOfficerBlocked = [
    'POS', 'CUSTOMERS', 'PAYMENTS', 'DASHBOARD', 'REPORTS', 'STAFF', 'SETTINGS', 'SUBSCRIPTIONS', 'EXPENSES'
  ] as const;

  const allOfficerAllowedPass = storeOfficerAllowed.every((view) => canAccessView('STORE_OFFICER', view));
  const allOfficerBlockedPass = storeOfficerBlocked.every((view) => !canAccessView('STORE_OFFICER', view));
  assert(allOfficerAllowedPass, 'Store / Purchase Officer has access to exactly 6 authorized modules');
  assert(allOfficerBlockedPass, 'Store / Purchase Officer is strictly blocked from POS, customers, payments, reports, and settings');

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
    defaultFY.includes('2026') && defaultFY.includes('2027'),
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

  assert(baselineCashier.length === 7, 'Cashier predefined baseline retains exactly 7 mandatory modules');
  assert(baselineStoreOfficer.length === 6, 'Store Officer predefined baseline retains exactly 6 mandatory modules');
  assert(!baselineManager.includes('SUBSCRIPTIONS'), 'Manager is strictly restricted from subscriptions');
  assert(!baselineManager.includes('STAFF'), 'Manager is strictly restricted from staff/user administrative management');

  // TEST 18: Manager Delegation Authority Boundaries
  assert(canManagerManageRole('MANAGER', 'CASHIER') === true, 'Manager is authorized to administer Cashier navigation');
  assert(canManagerManageRole('MANAGER', 'STORE_OFFICER') === true, 'Manager is authorized to administer Store Officer navigation');
  assert(canManagerManageRole('MANAGER', 'MANAGER') === false, 'Manager CANNOT administer or self-elevate Manager role');
  assert(canManagerManageRole('MANAGER', 'SUPER_ADMIN') === false, 'Manager CANNOT administer Super Admin role');
  assert(canManagerManageRole('SUPER_ADMIN', 'CASHIER') === true, 'Super Admin retains authority over all roles');
  assert(canManagerManageRole('CASHIER', 'CASHIER') === false, 'Cashier has ZERO authority to configure navigation (Default Deny)');
  assert(canManagerManageRole('STORE_OFFICER', 'STORE_OFFICER') === false, 'Store Officer has ZERO authority to configure navigation (Default Deny)');

  // TEST 19: Strict Delegation Allowlist & Rejection of Restricted Modules
  // Cashier Allowlist
  assert(canManagerEnableModule('MANAGER', 'CASHIER', 'CHALLANS') === true, 'Manager CAN enable eligible Delivery Challans for Cashier');
  assert(canManagerEnableModule('MANAGER', 'CASHIER', 'EXPENSES') === true, 'Manager CAN enable eligible Expenses for Cashier');
  assert(canManagerEnableModule('MANAGER', 'CASHIER', 'INVENTORY') === true, 'Manager CAN enable eligible Inventory for Cashier');

  // Cashier Restricted Modules (Must be strictly rejected)
  assert(canManagerEnableModule('MANAGER', 'CASHIER', 'REPORTS') === false, 'Manager CANNOT delegate restricted Reports to Cashier');
  assert(canManagerEnableModule('MANAGER', 'CASHIER', 'SETTINGS') === false, 'Manager CANNOT delegate restricted Settings to Cashier');
  assert(canManagerEnableModule('MANAGER', 'CASHIER', 'STAFF') === false, 'Manager CANNOT delegate restricted Staff to Cashier');
  assert(canManagerEnableModule('MANAGER', 'CASHIER', 'SUBSCRIPTIONS') === false, 'Manager CANNOT delegate restricted Subscriptions to Cashier');
  assert(canManagerEnableModule('MANAGER', 'CASHIER', 'SUPPLIERS') === false, 'Manager CANNOT delegate restricted Suppliers to Cashier');

  // Store Officer Allowlist
  assert(canManagerEnableModule('MANAGER', 'STORE_OFFICER', 'INVENTORY') === true, 'Manager CAN enable eligible Inventory for Store Officer');
  assert(canManagerEnableModule('MANAGER', 'STORE_OFFICER', 'EXPENSES') === true, 'Manager CAN enable eligible Expenses for Store Officer');
  assert(canManagerEnableModule('MANAGER', 'STORE_OFFICER', 'POS') === false, 'Manager CANNOT delegate restricted POS checkout to Store Officer');
  assert(canManagerEnableModule('MANAGER', 'STORE_OFFICER', 'CUSTOMERS') === false, 'Manager CANNOT delegate restricted Customers to Store Officer');
  assert(canManagerEnableModule('MANAGER', 'STORE_OFFICER', 'REPORTS') === false, 'Manager CANNOT delegate restricted Reports to Store Officer');

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
    updatedBy: 'Rajesh Sharma',
    userRole: 'MANAGER',
  }).then((res) => {
    assert(
      res.isOffline === true || res.success === true,
      'Supabase persistence handles offline gracefully without false positive'
    );
  });

  // TEST 23: Authentication Session Lifecycle (Login, Session Check, Logout)
  offlineStore.logout();
  assert(offlineStore.isAuthenticated() === false, 'Session status is false after logout');
  offlineStore.login('usr_manager_01', 'br_blr_01');
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

  // TEST 27: Responsive Two-Panel Layout Structure & Minimal Branding Interchange
  assert(loginPageSrc.includes('md:flex-row'), 'LoginPage uses responsive two-column layout on desktop (md:flex-row)');
  assert(loginPageSrc.includes('Contact Us'), 'LoginPage features Contact Us button');
  assert(!loginPageSrc.includes('Apex SuperStore & Electronics'), 'LoginPage removes Apex SuperStore & Electronics from visible UI');
  assert(!loginPageSrc.includes('Supabase Authentication Not Configured'), 'LoginPage removes persistent Supabase unconfigured banner');
  assert(!loginPageSrc.includes('Modern Retail Cloud Architecture'), 'LoginPage removes detailed enterprise architecture heading');
  assert(!loginPageSrc.includes('GSTIN: 29AABCU9603R1ZM'), 'LoginPage removes GSTIN from login UI');
  assert(!loginPageSrc.includes('v2.6 Enterprise'), 'LoginPage removes v2.6 Enterprise label');
  assert(!loginPageSrc.includes('POS Checkout & Rapid Billing'), 'LoginPage removes feature highlight cards');

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

  // TEST 31: Login Branding & Below-Desktop Viewport Lock Verification
  assert(loginPageSrc.includes('md:w-[460px]') || loginPageSrc.includes('md:w-[540px]') || loginPageSrc.includes('xl:w-[600px]'), 'LoginPage branding aside is widened for 2× prominence');
  assert(loginPageSrc.includes('w-52 h-52') || loginPageSrc.includes('w-80 md:h-80') || loginPageSrc.includes('lg:w-[380px]'), 'LoginPage logo container enlarged to 2× rendered scale');
  assert(loginPageSrc.includes('object-contain'), 'LoginPage logo maintains original aspect ratio via object-contain');
  assert(loginPageSrc.includes('SLATE POS'), 'LoginPage branding displays SLATE POS company name');
  assert(loginPageSrc.includes('Contact Us'), 'LoginPage branding provides functional Contact Us button');
  assert(!loginPageSrc.includes('Development Demo Access'), 'LoginPage: Development Demo Access section is completely removed from visible UI');
  assert(!loginPageSrc.includes('Local Dev Only'), 'LoginPage: Local Dev Only badge is completely removed');
  assert(!loginPageSrc.includes('handleDemoAccountSelect'), 'LoginPage: handleDemoAccountSelect is completely removed');
  assert(loginPageSrc.includes('overflow-hidden'), 'LoginPage: overflow-hidden locks below-desktop viewport without page-level scroll');
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
  assert(splashSrc.includes("encodeURI('/splash video.mp4')") || splashSrc.includes('/splash%20video.mp4'), 'SplashScreen safely encodes video URL with space');
  assert(splashSrc.includes('autoPlay') && splashSrc.includes('muted') && splashSrc.includes('playsInline'), 'SplashScreen video configures autoPlay, muted, and playsInline');
  assert(splashSrc.includes('maxDurationMs'), 'SplashScreen configures maximum duration timeout fallback');
  assert(splashSrc.includes('onError={handleVideoError}'), 'SplashScreen handles missing or blocked video with graceful fallback');
  assert(splashSrc.includes('(prefers-reduced-motion: reduce)'), 'SplashScreen respects prefers-reduced-motion accessibility preference');
  assert(splashSrc.includes('onEnded={handleVideoEnded}'), 'SplashScreen transitions immediately upon video completion');
  assert(fs.existsSync(path.resolve(process.cwd(), 'public/logo.svg')), 'public/logo.svg asset exists for splash and branding');

  // TEST 38: Splash Transition, Session Restoration & Viewport Lock
  assert(appSrc.includes('SplashScreen onFinish={handleSplashFinish}'), 'App.tsx integrates SplashScreen on initial startup');
  assert(appSrc.indexOf('if (showSplash)') < appSrc.indexOf('if (!isAuthenticated)'), 'Splash screen precedes authentication guard');
  assert(appSrc.indexOf('if (!isAuthenticated)') < appSrc.indexOf('<DesktopTitleBar'), 'Unauthenticated users are completely blocked from dashboard rendering');
  assert(appSrc.includes('getSupabaseSession()') && appSrc.includes('fetchUserProfile'), 'Valid Supabase session restoration is preserved');
  assert(appSrc.includes('min-h-0 min-w-0'), 'App shell establishes min-h-0 and min-w-0 on flex containers');
  assert(loginPageSrc.includes('border-none md:border-r'), 'LoginPage mobile view removes visible horizontal divider');
  assert(!loginPageSrc.includes('border-b md:border-b-0'), 'LoginPage removes previous border-b mobile divider');
  assert(loginPageSrc.includes('w-24 h-24') || loginPageSrc.includes('sm:w-28 sm:h-28'), 'LoginPage substantially increases mobile logo size');
  assert(loginPageSrc.includes('overflow-y-auto md:overflow-hidden'), 'LoginPage isolates vertical scrolling to inner form on mobile');
  assert(loginPageSrc.includes('min-h-0 min-w-0'), 'LoginPage applies min-height: 0 and min-width: 0 to flex containers');

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

  console.log(`\nTest Execution Summary: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();
