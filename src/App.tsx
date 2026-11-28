/**
 * SLATE POS — Main Application Shell
 * Windows Desktop + Cloud SaaS POS for Indian SMBs & Multi-Branch Retail Chains
 * Styled with SLATE POS Tricolour Theme (#16587B / #84B3CE / #F5EEDD)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DesktopTitleBar } from './components/layout/DesktopTitleBar';
import { Sidebar, ActiveView } from './components/layout/Sidebar';
import { DashboardOverview } from './components/dashboard/DashboardOverview';
import { BillingDashboard } from './components/dashboard/BillingDashboard';
import { InvoiceDashboard } from './components/dashboard/InvoiceDashboard';
import { GettingStartedChecklist } from './components/dashboard/GettingStartedChecklist';
import { PosTerminal } from './components/pos/PosTerminal';
import { ProductCatalog } from './components/products/ProductCatalog';
import { CustomerLedger } from './components/customers/CustomerLedger';
import { SuppliersPage } from './components/suppliers/SuppliersPage';
import { SalesInvoiceList } from './components/sales/SalesInvoiceList';
import { SalesReceiptsPage } from './components/sales/SalesReceiptsPage';
import { QuotesPage } from './components/quotes/QuotesPage';
import { ExpenseManager } from './components/expenses/ExpenseManager';
import { BankingPage } from './components/banking/BankingPage';
import { CreditNotesPage } from './components/creditNotes/CreditNotesPage';
import { PurchasesPage } from './components/purchases/PurchasesPage';
import { SupplierPaymentsPage } from './components/purchases/SupplierPaymentsPage';
import { DebitNotesPage } from './components/purchases/DebitNotesPage';
import { JournalPage } from './components/accounts/JournalPage';
import { BudgetsPage } from './components/accounts/BudgetsPage';
import { BulkUpdatesPage } from './components/accounts/BulkUpdatesPage';
import { ChartOfAccountsPage } from './components/accounts/ChartOfAccountsPage';
import { TransactionsPage } from './components/accounts/TransactionsPage';
import { FinancialReportsPage } from './components/reports/FinancialReportsPage';
import { SyncDiagnostics } from './components/sync/SyncDiagnostics';
import { StaffRolesManager } from './components/staff/StaffRolesManager';
import { SubscriptionPlansView } from './components/subscriptions/SubscriptionPlansView';
import { AllSettingsPage } from './components/settings/AllSettingsPage';
import { QuickCreateModal } from './components/modals/QuickCreateModal';
import { AddUserModal } from './components/modals/AddUserModal';
import { ProfileDrawer } from './components/profile/ProfileDrawer';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { LoginPage } from './components/auth/LoginPage';
import { SplashScreen } from './components/auth/SplashScreen';
import { ResetPasswordPage } from './components/auth/ResetPasswordPage';
import { offlineStore } from './lib/offlineStore';
import {
  isSupabaseConfigured,
  getSupabaseSession,
  subscribeToAuthChanges,
  fetchUserProfile,
  signOutSupabase,
} from './lib/supabaseClient';
import { Sale, Expense, UserProfile } from './types';
import {
  Bell,
  X,
  ShieldAlert,
  LayoutDashboard,
  TrendingUp,
  Clock,
  ShoppingCart,
} from 'lucide-react';
import {
  canAccessView,
  getDefaultViewForRole,
  getRoleDisplayName,
  subscribeToRoleNavigation,
} from './lib/roleNavigation';
import {
  canManageUsers,
  hasAnyPermission,
  GranularPermission,
} from './lib/permissions';
import {
  resolveViewFromLocation,
  getRoutePathForView,
  resolveAuthorizedRouteForUser,
} from './lib/navigationRoutes';
import { applyDocumentFavicon, getActiveBrandLogoUrl } from './lib/branding';

const QUICK_CREATE_PERMISSIONS: readonly GranularPermission[] = [
  'POS_CHECKOUT',
  'JOURNAL_MANAGE',
  'SUPPLIER_BILLS_MANAGE',
  'CREDIT_NOTES_MANAGE',
  'QUOTES_CREATE',
  'EXPENSES_MANAGE',
  'CUSTOMERS_CREATE',
  'SUPPLIERS_MANAGE',
  'PRODUCTS_CREATE',
];

function isRecoveryOrAuthHash(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  return (
    hash.includes('reset-password') ||
    hash.includes('type=recovery') ||
    hash.includes('access_token=') ||
    search.includes('type=recovery')
  );
}

function computeInitialRouteForUser(user: UserProfile): {
  activeView: ActiveView;
  deniedView: ActiveView | null;
} {
  if (typeof window === 'undefined') {
    return { activeView: getDefaultViewForRole(user.role), deniedView: null };
  }

  return resolveAuthorizedRouteForUser(
    user.role,
    window.location.pathname,
    window.location.hash,
    window.location.search
  );
}

export default function App() {
  const initialAuth = offlineStore.isAuthenticated();
  const initialUser = offlineStore.getActiveUser();
  const initialRoute = initialAuth
    ? computeInitialRouteForUser(initialUser)
    : {
        activeView: getDefaultViewForRole(initialUser.role),
        deniedView: null as ActiveView | null,
      };

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(initialAuth);
  const [activeUser, setActiveUser] = useState(initialUser);
  const [activeView, setActiveView] = useState<ActiveView>(initialRoute.activeView);
  const [deniedRouteView, setDeniedRouteView] = useState<ActiveView | null>(initialRoute.deniedView);
  const [previousView, setPreviousView] = useState<ActiveView>(initialRoute.activeView);
  const mainViewportRef = useRef<HTMLElement>(null);
  const [dashboardTab, setDashboardTab] = useState<'OVERVIEW' | 'BILLING' | 'INVOICE' | 'ONBOARDING'>('OVERVIEW');
  const [sales, setSales] = useState<Sale[]>(offlineStore.getSales());
  const [expenses, setExpenses] = useState<Expense[]>(offlineStore.getExpenses());
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [selectedAgingBucket, setSelectedAgingBucket] = useState<'CURRENT' | '1_15' | '16_30' | '31_45' | 'ABOVE_45' | null>(null);

  // Navigation & Modals State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isMobileNotificationsOpen, setIsMobileNotificationsOpen] = useState(false);

  // Notifications State (populated dynamically by real events, no placeholder alerts)
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; desc: string; time: string }>>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [isResetPasswordMode, setIsResetPasswordMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      return (
        hash.includes('reset-password') ||
        hash.includes('type=recovery') ||
        search.includes('type=recovery')
      );
    }
    return false;
  });

  const [showSplash, setShowSplash] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && (window as any).__SLATE_POS_SKIP_SPLASH__) {
      return false;
    }
    return true;
  });

  const lastSessionKeyRef = useRef<string>(
    initialAuth && initialUser.id ? `${initialUser.id}:${initialUser.organizationId}` : ''
  );

  const syncBrowserHistory = useCallback((view: ActiveView, mode: 'push' | 'replace' = 'push') => {
    if (typeof window === 'undefined' || isRecoveryOrAuthHash()) return;
    const nextPath = getRoutePathForView(view);
    if (window.location.pathname === nextPath && !window.location.hash.startsWith('#/')) {
      return;
    }
    try {
      if (mode === 'replace') {
        window.history.replaceState({ slateView: view }, '', nextPath);
      } else {
        window.history.pushState({ slateView: view }, '', nextPath);
      }
    } catch {
      // Ignore history API errors in restricted sandbox environments
    }
  }, []);

  const handleSplashFinish = () => {
    setShowSplash(false);
  };

  useEffect(() => {
    const handleHashChange = () => {
      if (typeof window !== 'undefined') {
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        if (
          hash.includes('reset-password') ||
          hash.includes('type=recovery') ||
          search.includes('type=recovery')
        ) {
          setIsResetPasswordMode(true);
        }
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    // If Supabase is configured, check active session and subscribe to auth state changes
    if (isSupabaseConfigured()) {
      getSupabaseSession().then(async ({ session }) => {
        if (session?.user) {
          const profile = await fetchUserProfile(session.user.id, session.user.email);
          if (profile) {
            const activeBranch = offlineStore.getActiveBranch();
            const safeBranchId =
              activeBranch && activeBranch.organizationId === profile.organizationId
                ? activeBranch.id
                : profile.branchId;
            offlineStore.login(profile.id, safeBranchId, profile);
            setIsAuthenticated(true);
            offlineStore.hydrateFromSupabase().catch((e) => console.warn('Supabase hydration error:', e));
          }
        } else {
          offlineStore.logout();
          setIsAuthenticated(false);
        }
      });

      const unsubAuth = subscribeToAuthChanges(async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          setIsResetPasswordMode(true);
          return;
        }

        if (event === 'SIGNED_OUT' || !session) {
          offlineStore.logout();
          setIsAuthenticated(false);
        } else if (event === 'SIGNED_IN' && session?.user) {
          const profile = await fetchUserProfile(session.user.id, session.user.email);
          if (profile) {
            const activeBranch = offlineStore.getActiveBranch();
            const safeBranchId =
              activeBranch && activeBranch.organizationId === profile.organizationId
                ? activeBranch.id
                : profile.branchId;
            offlineStore.login(profile.id, safeBranchId, profile);
            setIsAuthenticated(true);
            offlineStore.hydrateFromSupabase().catch((e) => console.warn('Supabase hydration error:', e));
          }
        }
      });

      return () => {
        unsubAuth();
      };
    } else {
      // Unconfigured environment: ensure state is cleanly logged out
      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
        offlineStore.logout();
        setIsAuthenticated(false);
      }
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      offlineStore.startAutoSyncLifecycle();
    } else {
      offlineStore.stopAutoSyncLifecycle();
    }
    return () => {
      offlineStore.stopAutoSyncLifecycle();
    };
  }, [isAuthenticated]);

  useEffect(() => {
    applyDocumentFavicon(getActiveBrandLogoUrl(offlineStore.getOrganization()));
    const reconcileRouteState = () => {
      applyDocumentFavicon(getActiveBrandLogoUrl(offlineStore.getOrganization()));
      const authed = offlineStore.isAuthenticated();
      setIsAuthenticated(authed);
      setSales(offlineStore.getSales());
      setExpenses(offlineStore.getExpenses());
      const updatedUser = offlineStore.getActiveUser();
      setActiveUser(updatedUser);

      if (!authed || !updatedUser.id) {
        lastSessionKeyRef.current = '';
        setDeniedRouteView(null);
        return;
      }

      const sessionKey = `${updatedUser.id}:${updatedUser.organizationId}`;
      if (lastSessionKeyRef.current !== sessionKey) {
        lastSessionKeyRef.current = sessionKey;
        const initialized = computeInitialRouteForUser(updatedUser);
        setActiveView(initialized.activeView);
        setPreviousView(initialized.activeView);
        setDeniedRouteView(initialized.deniedView);
        if (!initialized.deniedView) {
          syncBrowserHistory(initialized.activeView, 'replace');
        }
        return;
      }

      // Same session: re-enforce RBAC boundaries on the active route
      setActiveView((currentView) => {
        if (canAccessView(updatedUser.role, currentView)) {
          return currentView;
        }
        const fallback = getDefaultViewForRole(updatedUser.role);
        syncBrowserHistory(fallback, 'replace');
        return fallback;
      });
    };

    const unsubStore = offlineStore.subscribe(reconcileRouteState);
    const unsubNav = subscribeToRoleNavigation(reconcileRouteState);
    return () => {
      unsubStore();
      unsubNav();
    };
  }, [syncBrowserHistory]);

  // Browser back / forward navigation support
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (!offlineStore.isAuthenticated()) return;
      const currentUser = offlineStore.getActiveUser();
      if (!currentUser.id) return;

      const stateView = e.state?.slateView as ActiveView | undefined;
      const targetView =
        stateView ||
        resolveViewFromLocation(
          window.location.pathname,
          window.location.hash,
          window.location.search
        ) ||
        getDefaultViewForRole(currentUser.role);

      if (!canAccessView(currentUser.role, targetView)) {
        setDeniedRouteView(targetView);
        return;
      }

      setDeniedRouteView(null);
      setActiveView(targetView);
      mainViewportRef.current?.scrollTo({ top: 0 });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = useCallback(
    (view: ActiveView) => {
      const currentUser = offlineStore.getActiveUser();
      if (!canAccessView(currentUser.role, view)) {
        setDeniedRouteView(view);
        setIsMobileMenuOpen(false);
        return;
      }

      setDeniedRouteView(null);
      if (view !== 'SALES') {
        setSelectedAgingBucket(null);
      }
      if (
        activeView !== 'SETTINGS' &&
        activeView !== 'SETTINGS_BRANCHES' &&
        activeView !== 'SETTINGS_FISCAL'
      ) {
        setPreviousView(activeView);
      }

      setActiveView(view);
      syncBrowserHistory(view, 'push');
      setIsMobileMenuOpen(false);
      mainViewportRef.current?.scrollTo({ top: 0 });
    },
    [activeView, syncBrowserHistory]
  );

  const handleLockTerminal = useCallback(async () => {
    await signOutSupabase();
    offlineStore.logout();
    lastSessionKeyRef.current = '';
    setDeniedRouteView(null);
    setIsAuthenticated(false);
    setIsProfileOpen(false);
  }, []);

  // Global desktop & POS keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl+L or Cmd+L => Lock Terminal
      if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        handleLockTerminal();
        return;
      }

      // F1 => Quick Create (only if role has at least one creation permission)
      if (e.key === 'F1') {
        e.preventDefault();
        const currentUser = offlineStore.getActiveUser();
        if (hasAnyPermission(currentUser, QUICK_CREATE_PERMISSIONS)) {
          setIsQuickCreateOpen(true);
        }
        return;
      }

      // F2 => Direct POS Terminal (only if role has POS access)
      if (e.key === 'F2') {
        e.preventDefault();
        const currentUser = offlineStore.getActiveUser();
        if (canAccessView(currentUser.role, 'POS')) {
          handleNavigate('POS');
        }
        return;
      }

      // Escape => Close open overlays
      if (e.key === 'Escape') {
        if (isMobileMenuOpen) {
          setIsMobileMenuOpen(false);
        }
        if (isQuickCreateOpen) {
          setIsQuickCreateOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isMobileMenuOpen, isQuickCreateOpen, handleNavigate, handleLockTerminal]);

  // When clicking an aging bucket on the Dashboard, open Invoice tab filtered by that bucket
  const handleSelectAgingBucket = (bucket: 'CURRENT' | '1_15' | '16_30' | '31_45' | 'ABOVE_45') => {
    setSelectedAgingBucket(bucket);
    handleNavigate('SALES');
  };

  const handleLoginSuccess = (_userId: string, _branchId: string) => {
    const user = offlineStore.getActiveUser();
    lastSessionKeyRef.current = `${user.id}:${user.organizationId}`;
    const initialized = computeInitialRouteForUser(user);
    setActiveUser(user);
    setActiveView(initialized.activeView);
    setPreviousView(initialized.activeView);
    setDeniedRouteView(initialized.deniedView);
    setIsAuthenticated(true);
    if (!initialized.deniedView) {
      syncBrowserHistory(initialized.activeView, 'replace');
    }
  };

  const handleSignOut = async () => {
    await signOutSupabase();
    offlineStore.logout();
    lastSessionKeyRef.current = '';
    setDeniedRouteView(null);
    setIsAuthenticated(false);
    setIsProfileOpen(false);
    if (typeof window !== 'undefined' && !isRecoveryOrAuthHash()) {
      try {
        window.history.replaceState({}, '', '/');
      } catch {
        // Ignore
      }
    }
  };

  // 1. STARTUP SPLASH: Branded video / logo animation with graceful timeout & fallback
  if (showSplash) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  // 2. PASSWORD RECOVERY GUARD: Arriving from Supabase recovery email link
  if (isResetPasswordMode) {
    return (
      <ResetPasswordPage
        onPasswordResetSuccess={() => {
          setIsResetPasswordMode(false);
          if (typeof window !== 'undefined') {
            window.location.hash = '';
          }
        }}
      />
    );
  }

  // 3. AUTH GUARD: Unauthenticated users cannot view or access protected screens
  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // Enforce strict RBAC on resolved single-page view
  const resolvedActiveView = canAccessView(activeUser.role, activeView)
    ? activeView
    : getDefaultViewForRole(activeUser.role);

  const safeBackTarget =
    previousView !== 'SETTINGS' &&
    previousView !== 'SETTINGS_BRANCHES' &&
    previousView !== 'SETTINGS_FISCAL' &&
    canAccessView(activeUser.role, previousView)
      ? previousView
      : getDefaultViewForRole(activeUser.role);

  const renderActivePage = (view: ActiveView) => {
    switch (view) {
      case 'DASHBOARD':
        return (
          <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between gap-2.5 sm:gap-3 border-b border-[#16587B]/15 pb-3">
              <div className="flex items-center gap-1 p-1 bg-[#FFFFFF] rounded-lg border border-[#16587B]/15 shadow-2xs overflow-x-auto no-scrollbar max-w-full">
                {canAccessView(activeUser.role, 'POS') && (
                  <button
                    onClick={() => handleNavigate('POS')}
                    title="Open POS Sale (F2)"
                    aria-label="Open POS Sale (F2)"
                    className="px-2.5 sm:px-3.5 py-2 text-xs font-bold rounded-md whitespace-nowrap transition-colors cursor-pointer flex items-center justify-center min-h-[40px] shrink-0 text-[#16587B] bg-[#84B3CE]/30 hover:bg-[#84B3CE]/45 border border-[#16587B]/25"
                  >
                    <ShoppingCart className="w-4 h-4 shrink-0 text-[#16587B]" />
                    <span className="hidden lg:inline ml-1.5">Open POS Sale (F2)</span>
                  </button>
                )}

                <button
                  onClick={() => setDashboardTab('BILLING')}
                  title="Sales & Cash Flow"
                  aria-label="Sales & Cash Flow"
                  className={`px-2.5 sm:px-3.5 py-2 text-xs font-bold rounded-md whitespace-nowrap transition-colors cursor-pointer flex items-center justify-center min-h-[40px] shrink-0 ${
                    dashboardTab === 'BILLING'
                      ? 'bg-[#16587B] text-[#F5EEDD] shadow-2xs'
                      : 'text-[#405D6D] hover:text-[#16587B] hover:bg-[#FAF6EC]'
                  }`}
                >
                  <TrendingUp className="w-4 h-4 shrink-0" />
                  <span className="hidden lg:inline ml-1.5">Sales &amp; Cash Flow</span>
                </button>

                <button
                  onClick={() => setDashboardTab('INVOICE')}
                  title="Receivables Aging"
                  aria-label="Receivables Aging"
                  className={`px-2.5 sm:px-3.5 py-2 text-xs font-bold rounded-md whitespace-nowrap transition-colors cursor-pointer flex items-center justify-center min-h-[40px] shrink-0 ${
                    dashboardTab === 'INVOICE'
                      ? 'bg-[#16587B] text-[#F5EEDD] shadow-2xs'
                      : 'text-[#405D6D] hover:text-[#16587B] hover:bg-[#FAF6EC]'
                  }`}
                >
                  <Clock className="w-4 h-4 shrink-0" />
                  <span className="hidden lg:inline ml-1.5">Receivables Aging</span>
                </button>

                <button
                  onClick={() => setDashboardTab('OVERVIEW')}
                  title="Executive Overview"
                  aria-label="Executive Overview"
                  className={`px-2.5 sm:px-3.5 py-2 text-xs font-bold rounded-md whitespace-nowrap transition-colors cursor-pointer flex items-center justify-center min-h-[40px] shrink-0 ${
                    dashboardTab === 'OVERVIEW'
                      ? 'bg-[#16587B] text-[#F5EEDD] shadow-2xs'
                      : 'text-[#405D6D] hover:text-[#16587B] hover:bg-[#FAF6EC]'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4 shrink-0" />
                  <span className="hidden lg:inline ml-1.5">Executive Overview</span>
                </button>
              </div>
            </div>

            {dashboardTab === 'OVERVIEW' && (
              <DashboardOverview
                sales={sales}
                expenses={expenses}
                onOpenPos={() => handleNavigate('POS')}
                onOpenChecklist={() => setDashboardTab('ONBOARDING')}
                onSelectAgingBucket={handleSelectAgingBucket}
              />
            )}

            {dashboardTab === 'BILLING' && (
              <BillingDashboard
                sales={sales}
                expenses={expenses}
                onOpenGettingStarted={() => setDashboardTab('ONBOARDING')}
                onOpenPos={() => handleNavigate('POS')}
              />
            )}

            {dashboardTab === 'INVOICE' && (
              <InvoiceDashboard
                sales={sales}
                expenses={expenses}
                onSelectAgingBucket={handleSelectAgingBucket}
              />
            )}

            {dashboardTab === 'ONBOARDING' && (
              <GettingStartedChecklist onNavigate={handleNavigate} />
            )}
          </div>
        );

      case 'BANKING':
        return <BankingPage onNavigateToView={handleNavigate} />;
      case 'CREDIT_NOTES':
        return <CreditNotesPage mode="CREDIT_NOTES" onNavigateToView={handleNavigate} />;
      case 'SALES_RETURNS':
        return <CreditNotesPage mode="SALES_RETURNS" onNavigateToView={handleNavigate} />;
      case 'PURCHASE_ORDERS':
        return <PurchasesPage initialTab="PO" onNavigateToView={handleNavigate} />;
      case 'PURCHASES':
        return <PurchasesPage initialTab="BILLS" onNavigateToView={handleNavigate} />;
      case 'PURCHASE_PAYMENTS':
        return <SupplierPaymentsPage />;
      case 'DEBIT_NOTES':
        return <DebitNotesPage />;
      case 'POS':
        return <PosTerminal />;
      case 'PRODUCTS':
      case 'INVENTORY':
        return <ProductCatalog />;
      case 'CUSTOMERS':
        return <CustomerLedger />;
      case 'SUPPLIERS':
        return <SuppliersPage />;
      case 'SALES':
        return (
          <SalesInvoiceList
            initialAgingBucket={selectedAgingBucket}
            onClearAgingFilter={() => setSelectedAgingBucket(null)}
            onOpenPos={() => handleNavigate('POS')}
          />
        );
      case 'QUOTES':
        return <QuotesPage />;
      case 'CHALLANS':
        return <SalesInvoiceList mode="CHALLANS" onOpenPos={() => handleNavigate('POS')} />;
      case 'PAYMENTS':
        return <SalesReceiptsPage />;
      case 'EXPENSES':
        return <ExpenseManager />;
      case 'JOURNAL':
        return <JournalPage />;
      case 'BUDGETS':
        return <BudgetsPage />;
      case 'BULK_UPDATES':
        return <BulkUpdatesPage />;
      case 'CHART_OF_ACCOUNTS':
        return <ChartOfAccountsPage />;
      case 'TRANSACTIONS':
        return <TransactionsPage />;
      case 'REPORTS':
        return <FinancialReportsPage initialTab="OVERVIEW" />;
      case 'REPORT_PL':
        return <FinancialReportsPage initialTab="PL" />;
      case 'REPORT_BS':
        return <FinancialReportsPage initialTab="BS" />;
      case 'REPORT_CF':
        return <FinancialReportsPage initialTab="CF" />;
      case 'REPORT_TB':
        return <FinancialReportsPage initialTab="TB" />;
      case 'REPORT_GL':
        return <FinancialReportsPage initialTab="GL" />;
      case 'REPORT_AR':
        return <FinancialReportsPage initialTab="AR" />;
      case 'REPORT_AP':
        return <FinancialReportsPage initialTab="AP" />;
      case 'REPORT_GST':
        return <FinancialReportsPage initialTab="GST" />;
      case 'REPORT_AUDIT':
        return <FinancialReportsPage initialTab="AUDIT" />;
      case 'SYNC':
        return <SyncDiagnostics />;
      case 'STAFF':
        return <StaffRolesManager />;
      case 'SUBSCRIPTIONS':
        return <SubscriptionPlansView />;
      case 'SETTINGS':
        return (
          <AllSettingsPage
            initialSection="OVERVIEW"
            onClose={() => handleNavigate(safeBackTarget)}
            onNavigateToView={handleNavigate}
          />
        );
      case 'SETTINGS_BRANCHES':
        return (
          <AllSettingsPage
            initialSection="BRANCHES"
            onClose={() => handleNavigate(safeBackTarget)}
            onNavigateToView={handleNavigate}
          />
        );
      case 'SETTINGS_FISCAL':
        return (
          <AllSettingsPage
            initialSection="FISCAL"
            onClose={() => handleNavigate(safeBackTarget)}
            onNavigateToView={handleNavigate}
          />
        );
      default:
        return null;
    }
  };

  // 4. AUTHENTICATED DASHBOARD SHELL
  return (
    <div className="flex flex-col h-full h-screen h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-[#F5EEDD] text-[#111B21] antialiased select-none fixed inset-0 min-h-0 min-w-0">
      {/* 1. Compact Application Header (Preserves branding, quick add, notifications, settings, profile) */}
      <DesktopTitleBar
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        onNavigateToView={handleNavigate}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenQuickCreate={() => setIsQuickCreateOpen(true)}
        unreadCount={unreadCount}
        notifications={notifications}
        onDismissAllNotifications={() => {
          setNotifications([]);
          setUnreadCount(0);
        }}
      />

      {/* 2. Main Split Body Layout */}
      <div className="flex-1 flex overflow-hidden min-h-0 min-w-0">
        {/* Finalized 5-Group Sidebar (No Navigation label, Plus, Bell, Logo or Profile) */}
        <Sidebar
          activeView={resolvedActiveView}
          onSelectView={handleNavigate}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />

        {/* Single-Page Route Viewport (No Workspace Tab Bar) */}
        <main
          ref={mainViewportRef}
          className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 md:p-6 pb-[calc(92px+env(safe-area-inset-bottom,0px))] md:pb-6 bg-[#F5EEDD] min-w-0 min-h-0"
        >
          {/* ROUTE GUARD: Strict least privilege view protection for direct unauthorized URLs */}
          {deniedRouteView || !canAccessView(activeUser.role, resolvedActiveView) ? (
            <div className="flex flex-col items-center justify-center min-h-[420px] text-center p-6 bg-white rounded-xl border border-[#16587B]/15 shadow-xs max-w-md mx-auto my-8">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
                <ShieldAlert className="w-6 h-6 stroke-[2.2]" />
              </div>
              <h3 className="text-base font-bold text-[#111B21]">Module Access Restricted</h3>
              <p className="text-xs text-[#405D6D] mt-1.5 mb-4 leading-relaxed">
                Your assigned role (<span className="font-semibold text-[#16587B]">{getRoleDisplayName(activeUser.role)}</span>) does not have authorization to access the <strong>{deniedRouteView || resolvedActiveView}</strong> module.
              </p>
              <button
                type="button"
                onClick={() => {
                  const fallback = getDefaultViewForRole(activeUser.role);
                  setDeniedRouteView(null);
                  handleNavigate(fallback);
                }}
                className="px-4 py-2 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Go to Authorized Workspace
              </button>
            </div>
          ) : (
            renderActivePage(resolvedActiveView)
          )}
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR (Phone screens only, < 768px) */}
      <MobileBottomNav
        activeView={resolvedActiveView}
        onNavigateToView={handleNavigate}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenQuickCreate={() => setIsQuickCreateOpen(true)}
        isProfileOpen={isProfileOpen}
        isQuickCreateOpen={isQuickCreateOpen}
        userName={offlineStore.getActiveUser().name}
        avatarUrl={offlineStore.getActiveUser().avatarUrl}
      />

      {/* PROFILE DRAWER (Slide-over drawer for user details, branch info & actions) */}
      <ProfileDrawer
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        onNavigateToView={handleNavigate}
        onSignOut={handleSignOut}
      />

      {/* QUICK CREATE MODAL */}
      {isQuickCreateOpen && hasAnyPermission(activeUser, QUICK_CREATE_PERMISSIONS) && (
        <QuickCreateModal
          onClose={() => setIsQuickCreateOpen(false)}
          onNavigate={handleNavigate}
        />
      )}

      {/* ADD USER MODAL */}
      {isAddUserOpen && canManageUsers(activeUser) && (
        <AddUserModal
          isOpen={isAddUserOpen}
          onClose={() => setIsAddUserOpen(false)}
        />
      )}

      {/* MOBILE NOTIFICATIONS SHEET / MODAL (< 768px) */}
      {isMobileNotificationsOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end bg-[#0F405B]/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full bg-white rounded-t-2xl shadow-2xl border-t border-[#16587B]/20 flex flex-col max-h-[80vh] overflow-hidden animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-[#16587B]/12 flex items-center justify-between bg-[#FAF6EC]">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-[#16587B]" />
                <h3 className="font-bold text-[#16587B] text-sm">Notifications &amp; Alerts</h3>
                {unreadCount > 0 && (
                  <span className="text-[11px] bg-[#84B3CE]/30 text-[#16587B] font-bold px-2 py-0.5 rounded-full">
                    {unreadCount} New
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsMobileNotificationsOpen(false)}
                className="p-1.5 text-[#405D6D] hover:text-[#16587B] rounded-full hover:bg-[#84B3CE]/25 cursor-pointer"
                aria-label="Close notifications"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notifications List */}
            <div className="p-3 overflow-y-auto space-y-2 flex-1">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#405D6D]">No notifications available</div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-3 bg-[#FAF6EC] rounded-xl border border-[#16587B]/12 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#111B21]">{n.title}</span>
                      <span className="text-[10px] text-[#405D6D]">{n.time}</span>
                    </div>
                    <p className="text-xs text-[#405D6D]">{n.desc}</p>
                  </div>
                ))
              )}
            </div>

            {/* Actions Footer */}
            {notifications.length > 0 && (
              <div className="p-3 border-t border-[#16587B]/12 bg-[#FAF6EC] flex items-center justify-between">
                <button
                  onClick={() => {
                    setNotifications([]);
                    setUnreadCount(0);
                    setIsMobileNotificationsOpen(false);
                  }}
                  className="text-xs text-[#16587B] font-bold hover:underline cursor-pointer"
                >
                  Dismiss all
                </button>
                <button
                  onClick={() => setIsMobileNotificationsOpen(false)}
                  className="px-4 py-2 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] text-xs font-bold rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
