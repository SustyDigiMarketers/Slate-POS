/**
 * SLATE POS — Main Application Shell
 * Windows Desktop + Cloud SaaS POS for Indian SMBs & Multi-Branch Retail Chains
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6 / #ECE5DD / #FFFFFF / #D1D7DB)
 */

import React, { useState, useEffect } from 'react';
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
import { QuotesPage } from './components/quotes/QuotesPage';
import { CouponsPage } from './components/coupons/CouponsPage';
import { ExpenseManager } from './components/expenses/ExpenseManager';
import { SyncDiagnostics } from './components/sync/SyncDiagnostics';
import { StaffRolesManager } from './components/staff/StaffRolesManager';
import { SubscriptionPlansView } from './components/subscriptions/SubscriptionPlansView';
import { AllSettingsPage } from './components/settings/AllSettingsPage';
import { QuickCreateModal } from './components/modals/QuickCreateModal';
import { AddUserModal } from './components/modals/AddUserModal';
import { LogTimeModal } from './components/modals/LogTimeModal';
import { WeeklyLogModal } from './components/modals/WeeklyLogModal';
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
import { Sale, Expense } from './types';
import {
  Bell,
  X,
  Check,
  ShieldAlert,
  LayoutDashboard,
  TrendingUp,
  Clock,
  CheckCircle2,
  ShoppingCart,
} from 'lucide-react';
import {
  canAccessView,
  getDefaultViewForRole,
  getRoleDisplayName,
} from './lib/roleNavigation';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(offlineStore.isAuthenticated());
  const [activeUser, setActiveUser] = useState(offlineStore.getActiveUser());
  const [activeView, setActiveView] = useState<ActiveView>(
    getDefaultViewForRole(offlineStore.getActiveUser().role)
  );
  const [previousView, setPreviousView] = useState<ActiveView>(
    getDefaultViewForRole(offlineStore.getActiveUser().role)
  );
  const [dashboardTab, setDashboardTab] = useState<'OVERVIEW' | 'BILLING' | 'INVOICE' | 'ONBOARDING'>('OVERVIEW');
  const [sales, setSales] = useState<Sale[]>(offlineStore.getSales());
  const [expenses, setExpenses] = useState<Expense[]>(offlineStore.getExpenses());
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [selectedAgingBucket, setSelectedAgingBucket] = useState<'CURRENT' | '1_15' | '16_30' | '31_45' | 'ABOVE_45' | null>(null);

  // Navigation & Modals State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isLogTimeOpen, setIsLogTimeOpen] = useState(false);
  const [isWeeklyLogOpen, setIsWeeklyLogOpen] = useState(false);
  const [isMobileNotificationsOpen, setIsMobileNotificationsOpen] = useState(false);

  // Notifications State
  const [notifications, setNotifications] = useState([
    { id: '1', title: 'GST e-Invoice Ready', desc: 'IRN generated for INV-2026-089', time: '10m ago' },
    { id: '2', title: 'Inventory Alert', desc: 'Basmati Rice 5kg low on stock (2 remaining)', time: '1h ago' },
    { id: '3', title: 'Cloud Sync Successful', desc: '14 offline orders uploaded', time: '2h ago' },
  ]);
  const [unreadCount, setUnreadCount] = useState(3);

  const [isLockScreen, setIsLockScreen] = useState(false);
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
            offlineStore.login(profile.id, offlineStore.getActiveBranchId(), profile);
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
            offlineStore.login(profile.id, offlineStore.getActiveBranchId(), profile);
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
    const unsub = offlineStore.subscribe(() => {
      setIsAuthenticated(offlineStore.isAuthenticated());
      setSales(offlineStore.getSales());
      setExpenses(offlineStore.getExpenses());
      const updatedUser = offlineStore.getActiveUser();
      setActiveUser(updatedUser);
      // Immediately enforce role boundaries when authenticated session refreshes
      setActiveView((current) => {
        if (!canAccessView(updatedUser.role, current)) {
          return getDefaultViewForRole(updatedUser.role);
        }
        return current;
      });
    });
    return unsub;
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

      // F1 => Quick Create
      if (e.key === 'F1') {
        e.preventDefault();
        setIsQuickCreateOpen(true);
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
  }, [isMobileMenuOpen, isQuickCreateOpen]);

  const handleNavigate = (view: ActiveView) => {
    // Role-based route guard: Default deny whenever permission is not explicitly granted
    const currentUser = offlineStore.getActiveUser();
    if (!canAccessView(currentUser.role, view)) {
      const fallback = getDefaultViewForRole(currentUser.role);
      setActiveView(fallback);
      return;
    }

    if (activeView !== 'SETTINGS') {
      setPreviousView(activeView);
    }
    setActiveView(view);
    if (view !== 'SALES') {
      setSelectedAgingBucket(null);
    }
    setIsMobileMenuOpen(false);
  };

  // When clicking an aging bucket on the Dashboard, open Sales filtered by that bucket
  const handleSelectAgingBucket = (bucket: 'CURRENT' | '1_15' | '16_30' | '31_45' | 'ABOVE_45') => {
    setSelectedAgingBucket(bucket);
    handleNavigate('SALES');
  };

  const handleLockTerminal = async () => {
    await handleSignOut();
  };

  const handleLoginSuccess = (userId: string, branchId: string) => {
    setIsAuthenticated(true);
    setIsLockScreen(false);
    const user = offlineStore.getActiveUser();
    setActiveView(getDefaultViewForRole(user.role));
  };

  const handleSignOut = async () => {
    await signOutSupabase();
    offlineStore.logout();
    setIsAuthenticated(false);
    setIsProfileOpen(false);
    setIsLockScreen(false);
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

  // 3. AUTHENTICATED DASHBOARD SHELL
  return (
    <div className="flex flex-col h-full h-screen h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-[#ECE5DD] text-[#111B21] antialiased select-none fixed inset-0 min-h-0 min-w-0">
      {/* 1. One Compact Application Header (Shortcut buttons and redundant space removed) */}
      <DesktopTitleBar
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        onNavigateToView={handleNavigate}
      />

      {/* 2. Main Split Body Layout (Main content begins directly below title bar) */}
      <div className="flex-1 flex overflow-hidden min-h-0 min-w-0">
        {/* Sidebar Navigation with Header Plus/Notifications & Footer Profile Control */}
        <Sidebar
          activeView={activeView}
          onSelectView={handleNavigate}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
          onOpenQuickCreate={() => setIsQuickCreateOpen(true)}
          onOpenProfile={() => setIsProfileOpen(true)}
          unreadCount={unreadCount}
          notifications={notifications}
          onDismissAllNotifications={() => {
            setNotifications([]);
            setUnreadCount(0);
          }}
        />

        {/* Scrollable Main Viewport (account for fixed MobileBottomNav + safe-area on phone) */}
        <main className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 md:p-6 pb-[calc(76px+env(safe-area-inset-bottom,0px))] md:pb-6 bg-[#ECE5DD] min-w-0 min-h-0">
          {/* ROUTE GUARD: Strict least privilege view protection */}
          {!canAccessView(activeUser.role, activeView) && (
            <div className="flex flex-col items-center justify-center min-h-[420px] text-center p-6 bg-white rounded-xl border border-[#D1D7DB] shadow-xs max-w-md mx-auto my-8">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
                <ShieldAlert className="w-6 h-6 stroke-[2.2]" />
              </div>
              <h3 className="text-base font-bold text-[#111B21]">Module Access Restricted</h3>
              <p className="text-xs text-[#667781] mt-1.5 mb-4 leading-relaxed">
                Your assigned role (<span className="font-semibold text-[#075E54]">{getRoleDisplayName(activeUser.role)}</span>) does not have authorization to access the <strong>{activeView}</strong> module.
              </p>
              <button
                onClick={() => handleNavigate(getDefaultViewForRole(activeUser.role))}
                className="px-4 py-2 bg-[#075E54] hover:bg-[#128C7E] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Go to Authorized Workspace
              </button>
            </div>
          )}

          {/* VIEW: DASHBOARD (Unified & Restructured Layout) */}
          {canAccessView(activeUser.role, 'DASHBOARD') && activeView === 'DASHBOARD' && (
            <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto">
              {/* Dashboard Action Items Header (Icon-only below desktop breakpoint, icon + text on desktop) */}
              <div className="flex items-center justify-between gap-2.5 sm:gap-3 border-b border-[#D1D7DB] pb-3">
                <div className="flex items-center gap-1 p-1 bg-[#FFFFFF] rounded-lg border border-[#D1D7DB] shadow-2xs overflow-x-auto no-scrollbar max-w-full">
                  {/* 1. Setup Checklist */}
                  <button
                    onClick={() => setDashboardTab('ONBOARDING')}
                    title="Setup Checklist"
                    aria-label="Setup Checklist"
                    className={`px-2.5 sm:px-3.5 py-2 text-xs font-bold rounded-md whitespace-nowrap transition-colors cursor-pointer flex items-center justify-center min-h-[40px] shrink-0 ${
                      dashboardTab === 'ONBOARDING'
                        ? 'bg-[#075E54] text-white shadow-2xs'
                        : 'text-[#667781] hover:text-[#111B21] hover:bg-[#F7F5F2]'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="hidden lg:inline ml-1.5">Setup Checklist</span>
                  </button>

                  {/* 2. Open POS Sale (F2) */}
                  <button
                    onClick={() => handleNavigate('POS')}
                    title="Open POS Sale (F2)"
                    aria-label="Open POS Sale (F2)"
                    className="px-2.5 sm:px-3.5 py-2 text-xs font-bold rounded-md whitespace-nowrap transition-colors cursor-pointer flex items-center justify-center min-h-[40px] shrink-0 text-[#075E54] bg-[#DCF8C6]/60 hover:bg-[#DCF8C6] border border-[#075E54]/30"
                  >
                    <ShoppingCart className="w-4 h-4 shrink-0 text-[#075E54]" />
                    <span className="hidden lg:inline ml-1.5">Open POS Sale (F2)</span>
                  </button>

                  {/* 3. Sales & Cash Flow */}
                  <button
                    onClick={() => setDashboardTab('BILLING')}
                    title="Sales & Cash Flow"
                    aria-label="Sales & Cash Flow"
                    className={`px-2.5 sm:px-3.5 py-2 text-xs font-bold rounded-md whitespace-nowrap transition-colors cursor-pointer flex items-center justify-center min-h-[40px] shrink-0 ${
                      dashboardTab === 'BILLING'
                        ? 'bg-[#075E54] text-white shadow-2xs'
                        : 'text-[#667781] hover:text-[#111B21] hover:bg-[#F7F5F2]'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4 shrink-0" />
                    <span className="hidden lg:inline ml-1.5">Sales &amp; Cash Flow</span>
                  </button>

                  {/* 4. Receivables Aging */}
                  <button
                    onClick={() => setDashboardTab('INVOICE')}
                    title="Receivables Aging"
                    aria-label="Receivables Aging"
                    className={`px-2.5 sm:px-3.5 py-2 text-xs font-bold rounded-md whitespace-nowrap transition-colors cursor-pointer flex items-center justify-center min-h-[40px] shrink-0 ${
                      dashboardTab === 'INVOICE'
                        ? 'bg-[#075E54] text-white shadow-2xs'
                        : 'text-[#667781] hover:text-[#111B21] hover:bg-[#F7F5F2]'
                    }`}
                  >
                    <Clock className="w-4 h-4 shrink-0" />
                    <span className="hidden lg:inline ml-1.5">Receivables Aging</span>
                  </button>

                  {/* 5. Executive Overview */}
                  <button
                    onClick={() => setDashboardTab('OVERVIEW')}
                    title="Executive Overview"
                    aria-label="Executive Overview"
                    className={`px-2.5 sm:px-3.5 py-2 text-xs font-bold rounded-md whitespace-nowrap transition-colors cursor-pointer flex items-center justify-center min-h-[40px] shrink-0 ${
                      dashboardTab === 'OVERVIEW'
                        ? 'bg-[#075E54] text-white shadow-2xs'
                        : 'text-[#667781] hover:text-[#111B21] hover:bg-[#F7F5F2]'
                    }`}
                  >
                    <LayoutDashboard className="w-4 h-4 shrink-0" />
                    <span className="hidden lg:inline ml-1.5">Executive Overview</span>
                  </button>
                </div>
              </div>

              {/* Render Selected Dashboard Sub-Tab */}
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
                <GettingStartedChecklist
                  onNavigate={handleNavigate}
                />
              )}
            </div>
          )}

          {/* VIEW: POS CHECKOUT */}
          {activeView === 'POS' && <PosTerminal />}

          {/* VIEW: PRODUCTS */}
          {activeView === 'PRODUCTS' && <ProductCatalog />}

          {/* VIEW: INVENTORY & STOCK MOVEMENTS */}
          {activeView === 'INVENTORY' && <ProductCatalog />}

          {/* VIEW: CUSTOMERS */}
          {activeView === 'CUSTOMERS' && <CustomerLedger />}

          {/* VIEW: SUPPLIERS */}
          {activeView === 'SUPPLIERS' && <SuppliersPage />}

          {/* VIEW: SALES & INVOICES */}
          {activeView === 'SALES' && (
            <SalesInvoiceList
              initialAgingBucket={selectedAgingBucket}
              onClearAgingFilter={() => setSelectedAgingBucket(null)}
              onOpenPos={() => handleNavigate('POS')}
            />
          )}

          {/* VIEW: COUPONS */}
          {activeView === 'COUPONS' && <CouponsPage />}

          {/* VIEW: QUOTES */}
          {activeView === 'QUOTES' && <QuotesPage />}

          {/* VIEW: CHALLANS */}
          {activeView === 'CHALLANS' && (
            <SalesInvoiceList
              mode="CHALLANS"
              onOpenPos={() => handleNavigate('POS')}
            />
          )}

          {/* VIEW: PAYMENTS */}
          {activeView === 'PAYMENTS' && (
            <SalesInvoiceList
              mode="PAYMENTS"
              onOpenPos={() => handleNavigate('POS')}
            />
          )}

          {/* VIEW: EXPENSES */}
          {activeView === 'EXPENSES' && <ExpenseManager />}

          {/* VIEW: REPORTS */}
          {activeView === 'REPORTS' && (
            <InvoiceDashboard
              sales={sales}
              expenses={expenses}
              onSelectAgingBucket={handleSelectAgingBucket}
            />
          )}

          {/* VIEW: SYNC OUTBOX & DIAGNOSTICS */}
          {activeView === 'SYNC' && <SyncDiagnostics />}

          {/* VIEW: STAFF & RBAC */}
          {activeView === 'STAFF' && <StaffRolesManager />}

          {/* VIEW: SUBSCRIPTIONS & PLANS */}
          {activeView === 'SUBSCRIPTIONS' && <SubscriptionPlansView />}

          {/* VIEW: SETTINGS (All Settings Page matching Reference Screenshot) */}
          {activeView === 'SETTINGS' && (
            <AllSettingsPage
              onClose={() => setActiveView(previousView)}
              onNavigateToView={handleNavigate}
            />
          )}
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR (Phone screens only, < 768px) */}
      <MobileBottomNav
        activeView={activeView}
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
      {isQuickCreateOpen && (
        <QuickCreateModal
          onClose={() => setIsQuickCreateOpen(false)}
          onNavigate={handleNavigate}
        />
      )}

      {/* ADD USER MODAL */}
      <AddUserModal
        isOpen={isAddUserOpen}
        onClose={() => setIsAddUserOpen(false)}
      />

      {/* LOG TIME MODAL */}
      <LogTimeModal
        isOpen={isLogTimeOpen}
        onClose={() => setIsLogTimeOpen(false)}
      />

      {/* WEEKLY LOG MODAL */}
      <WeeklyLogModal
        isOpen={isWeeklyLogOpen}
        onClose={() => setIsWeeklyLogOpen(false)}
        onOpenLogTime={() => {
          setIsWeeklyLogOpen(false);
          setIsLogTimeOpen(true);
        }}
      />

      {/* MOBILE NOTIFICATIONS SHEET / MODAL (< 768px) */}
      {isMobileNotificationsOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full bg-white rounded-t-2xl shadow-2xl border-t border-[#D1D7DB] flex flex-col max-h-[80vh] overflow-hidden animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-[#E9EDEF] flex items-center justify-between bg-[#F7F5F2]">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-[#075E54]" />
                <h3 className="font-bold text-[#111B21] text-sm">Notifications & Alerts</h3>
                {unreadCount > 0 && (
                  <span className="text-[11px] bg-[#DCF8C6] text-[#075E54] font-bold px-2 py-0.5 rounded-full">
                    {unreadCount} New
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsMobileNotificationsOpen(false)}
                className="p-1.5 text-[#54656F] hover:text-[#111B21] rounded-full hover:bg-[#E9EDEF] cursor-pointer"
                aria-label="Close notifications"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notifications List */}
            <div className="p-3 overflow-y-auto space-y-2 flex-1">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#8696A0]">No notifications available</div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-3 bg-[#F0F2F5] rounded-xl border border-[#E9EDEF] flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#111B21]">{n.title}</span>
                      <span className="text-[10px] text-[#8696A0]">{n.time}</span>
                    </div>
                    <p className="text-xs text-[#54656F]">{n.desc}</p>
                  </div>
                ))
              )}
            </div>

            {/* Actions Footer */}
            {notifications.length > 0 && (
              <div className="p-3 border-t border-[#E9EDEF] bg-[#F7F5F2] flex items-center justify-between">
                <button
                  onClick={() => {
                    setNotifications([]);
                    setUnreadCount(0);
                    setIsMobileNotificationsOpen(false);
                  }}
                  className="text-xs text-[#075E54] font-bold hover:underline cursor-pointer"
                >
                  Dismiss all
                </button>
                <button
                  onClick={() => setIsMobileNotificationsOpen(false)}
                  className="px-4 py-2 bg-[#075E54] text-white text-xs font-bold rounded-lg cursor-pointer"
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
