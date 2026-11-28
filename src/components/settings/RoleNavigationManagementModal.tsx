/**
 * SLATE POS — Settings: Role & Navigation Management
 * 
 * Allows authorized Store Managers and Super Administrators to configure
 * additional role-specific tabs/modules within the strict security allowlist.
 * 
 * Security & Governance Rules:
 * - Predefined navigation is the immutable baseline.
 * - Manager can ONLY administer CASHIER and STORE_OFFICER roles.
 * - Manager CANNOT administer SUPER_ADMIN, ORG_ADMIN, or MANAGER.
 * - Restricted modules (SUBSCRIPTIONS, REPORTS, SETTINGS, STAFF) can NEVER be delegated by a Manager.
 * - Cashier and Store Officer have zero access (Default Deny).
 * - Changes are saved to Supabase (with offline local fallback) and take effect reactively.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Check,
  RefreshCw,
  Save,
  RotateCcw,
  AlertCircle,
  Eye,
  Sliders,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { UserRole } from '../../types';
import { ActiveView } from '../layout/Sidebar';
import { offlineStore } from '../../lib/offlineStore';
import {
  ROLE_NAVIGATION_POLICIES,
  ROLE_DELEGATION_RULES,
  canManagerEnableModule,
  getEffectiveAllowedViews,
  getRoleDisplayName,
} from '../../lib/roleNavigation';
import { canManageRoles } from '../../lib/permissions';
import { saveRoleNavigationConfig } from '../../lib/supabaseClient';

interface RoleNavigationManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ALL_MODULE_METADATA: Record<
  ActiveView,
  { label: string; description: string; category: 'Sales' | 'Operations' | 'Accounts' | 'Reports' | 'Admin' }
> = {
  DASHBOARD: { label: 'Home Dashboard', description: 'Financial KPIs, liquidity trends, and operational overview', category: 'Admin' },
  BANKING: { label: 'Banking & Cash', description: 'Bank & cash accounts, transfers, reconciliation, and statements', category: 'Admin' },
  CUSTOMERS: { label: 'Customers (AR)', description: 'Customer accounting masters, credit limits, and receivables', category: 'Sales' },
  POS: { label: 'Checkout', description: 'Fast counter billing, barcode scanning, and instant receipt posting', category: 'Sales' },
  QUOTES: { label: 'Quotes & Estimates', description: 'Pro-forma quotes and one-click invoice conversion', category: 'Sales' },
  SALES: { label: 'Invoices', description: 'GST tax invoices, AR ledger posting, and historical receipts', category: 'Sales' },
  PAYMENTS: { label: 'Payments Received', description: 'Customer receipt allocation and cash/bank/UPI settlements', category: 'Sales' },
  CREDIT_NOTES: { label: 'Credit Notes', description: 'GST credit notes, receivable adjustments, and customer refunds', category: 'Sales' },
  SALES_RETURNS: { label: 'Sales Returns', description: 'Customer returns with automated stock restocking and GL reversal', category: 'Sales' },
  CHALLANS: { label: 'Delivery Challans', description: 'Dispatch documentation and goods shipment notes', category: 'Sales' },
  SUPPLIERS: { label: 'Suppliers (AP)', description: 'Vendor accounting masters, payment terms, and payables', category: 'Operations' },
  PURCHASE_ORDERS: { label: 'Purchase Orders', description: 'Supplier procurement orders and GRN inward tracking', category: 'Operations' },
  PURCHASES: { label: 'Purchase & Bills', description: 'Supplier bills (AP), GRN receipts, and vendor disbursements', category: 'Operations' },
  PURCHASE_PAYMENTS: { label: 'Supplier Payments', description: 'Vendor bill disbursements and AP bank/cash settlements', category: 'Operations' },
  DEBIT_NOTES: { label: 'Debit Notes', description: 'Purchase returns, input GST reversal, and AP reductions', category: 'Operations' },
  EXPENSES: { label: 'Operating Expenses', description: 'Expense vouchers with GST ITC and direct GL expense posting', category: 'Operations' },
  PRODUCTS: { label: 'Products & Inventory', description: 'Item master, HSN codes, GST slabs, and stock valuation', category: 'Operations' },
  INVENTORY: { label: 'Stock Movements', description: 'Physical stock tracking and inventory batch adjustments', category: 'Operations' },
  JOURNAL: { label: 'Journal Vouchers', description: 'Balanced manual & automated double-entry journal postings', category: 'Accounts' },
  BUDGETS: { label: 'Budgets', description: 'Annual/quarterly/monthly financial budgets and GL variance tracking', category: 'Accounts' },
  BULK_UPDATES: { label: 'Bulk Updates', description: 'Excel/CSV bulk updates, opening balances, and tax/price revisions', category: 'Accounts' },
  CHART_OF_ACCOUNTS: { label: 'Chart of Accounts', description: 'Hierarchical COA across Assets, Liabilities, Equity, Income & Expenses', category: 'Accounts' },
  TRANSACTIONS: { label: 'Transactions Register', description: 'Unified accounting register with GL drilldown across all vouchers', category: 'Accounts' },
  REPORTS: { label: 'Reports Overview', description: 'Financial statements hub and books verification', category: 'Reports' },
  REPORT_PL: { label: 'Profit & Loss', description: 'Income statement computed strictly from posted General Ledger lines', category: 'Reports' },
  REPORT_BS: { label: 'Balance Sheet', description: 'Assets = Liabilities + Equity financial position statement', category: 'Reports' },
  REPORT_CF: { label: 'Cash Flow', description: 'Operating, Investing, and Financing cash movement statement', category: 'Reports' },
  REPORT_TB: { label: 'Trial Balance', description: 'Account-wise debit/credit verification proving balanced books', category: 'Reports' },
  REPORT_GL: { label: 'General Ledger', description: 'Account ledger with chronological entries and running balances', category: 'Reports' },
  REPORT_AR: { label: 'Receivables (AR)', description: 'Customer aging buckets and outstanding receivable summary', category: 'Reports' },
  REPORT_AP: { label: 'Payables (AP)', description: 'Supplier bill aging and outstanding accounts payable summary', category: 'Reports' },
  REPORT_GST: { label: 'GST / Tax Summary', description: 'Output GST, Input Tax Credit (ITC), and net GST payable', category: 'Reports' },
  REPORT_AUDIT: { label: 'Audit Trail', description: 'Immutable financial audit log of postings, reversals, and edits', category: 'Reports' },
  SETTINGS: { label: 'Organization & Tax', description: 'Company GSTIN, PAN, billing defaults, and hardware printers', category: 'Admin' },
  SETTINGS_BRANCHES: { label: 'Branches', description: 'Multi-branch management and active terminal selection', category: 'Admin' },
  SETTINGS_FISCAL: { label: 'Fiscal Year & Locks', description: 'Fiscal year configuration and accounting period lock controls', category: 'Admin' },
  STAFF: { label: 'Users & Roles', description: 'Staff accounts, role assignments, and branch access', category: 'Admin' },
  SUBSCRIPTIONS: { label: 'Subscriptions', description: 'Platform subscription plans and Razorpay billing', category: 'Admin' },
  SYNC: { label: 'Sync & Diagnostics', description: 'Offline queue diagnostics and Supabase cloud synchronization', category: 'Admin' },
};

export const RoleNavigationManagementModal: React.FC<RoleNavigationManagementModalProps> = ({
  isOpen,
  onClose,
}) => {
  const activeUser = offlineStore.getActiveUser();
  const actorRole = activeUser.role;

  // Determine selectable roles based on actor privileges (strictly SUPER_ADMIN / ORG_ADMIN)
  const isAuthorized = canManageRoles(actorRole);
  const manageableRoles: UserRole[] =
    actorRole === 'SUPER_ADMIN'
      ? ['CASHIER', 'STORE_OFFICER', 'MANAGER', 'ORG_ADMIN']
      : actorRole === 'ORG_ADMIN'
      ? ['CASHIER', 'STORE_OFFICER', 'MANAGER']
      : [];

  const [selectedRole, setSelectedRole] = useState<UserRole>(
    manageableRoles[0] || 'CASHIER'
  );

  // Local state for enabled additional modules
  const [enabledModules, setEnabledModules] = useState<ActiveView[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Sync state whenever selected role changes
  useEffect(() => {
    const allOverrides = offlineStore.getRoleNavigationOverrides();
    const roleOverrides = allOverrides[selectedRole] || [];
    setEnabledModules(roleOverrides as ActiveView[]);
    setFeedback(null);
  }, [selectedRole]);

  if (!isOpen) return null;

  // Security gate: only ORG_ADMIN and SUPER_ADMIN are authorized to manage role navigation
  if (!isAuthorized) {
    return (
      <div className="fixed inset-0 bg-[#0F405B]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-md w-full p-6 text-center space-y-4 border border-[#D1D7DB] shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6 stroke-[2.2]" />
          </div>
          <h3 className="text-base font-bold text-[#111B21]">Access Denied</h3>
          <p className="text-xs text-[#667781] leading-relaxed">
            Your role ({getRoleDisplayName(actorRole)}) does not have permission to access Role &amp; Navigation Management.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#16587B] text-white rounded-lg text-xs font-bold hover:bg-[#124866] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const baselineViews = ROLE_NAVIGATION_POLICIES[selectedRole]?.allowedViews || [];
  const delegationRules = ROLE_DELEGATION_RULES[selectedRole];
  const eligibleAdditionalViews = delegationRules?.eligibleAdditionalViews || [];
  const restrictedViews = delegationRules?.restrictedViews || [];

  // Toggle handler for eligible additional modules
  const handleToggleModule = (module: ActiveView) => {
    // Security check: must be allowed by delegation policy
    if (!canManagerEnableModule(actorRole, selectedRole, module)) {
      setFeedback({
        type: 'error',
        message: `Security Policy Violation: Module "${module}" is restricted and cannot be delegated to ${getRoleDisplayName(selectedRole)}.`,
      });
      return;
    }

    setEnabledModules((prev) => {
      if (prev.includes(module)) {
        return prev.filter((m) => m !== module);
      } else {
        return [...prev, module];
      }
    });
  };

  // Save handler: Persists to Supabase and offlineStore
  const handleSave = async () => {
    setIsSaving(true);
    setFeedback(null);

    // Save locally first
    offlineStore.setSingleRoleNavigationOverride(selectedRole, enabledModules);

    // Attempt to persist to Supabase
    const result = await saveRoleNavigationConfig({
      organizationId: offlineStore.getOrganization().id,
      branchId: offlineStore.getActiveBranch().id,
      role: selectedRole,
      enabledAdditionalModules: enabledModules,
      updatedBy: activeUser.name,
      userRole: actorRole,
    });

    setIsSaving(false);
    if (result.success) {
      setFeedback({
        type: 'success',
        message: result.message,
      });
    } else if (result.isOffline) {
      setFeedback({
        type: 'info',
        message: `${result.message} Navigation preferences are active on this terminal.`,
      });
    } else {
      setFeedback({
        type: 'error',
        message: result.message,
      });
    }
  };

  // Restore defaults handler
  const handleRestoreDefaults = () => {
    setEnabledModules([]);
    offlineStore.setSingleRoleNavigationOverride(selectedRole, []);
    setFeedback({
      type: 'info',
      message: `Restored default baseline navigation for ${getRoleDisplayName(selectedRole)}.`,
    });
  };

  // Effective preview views
  const effectiveViews = getEffectiveAllowedViews(selectedRole, {
    [selectedRole]: enabledModules,
  });

  return (
    <div className="fixed inset-0 bg-[#0F405B]/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[92vh] flex flex-col border border-[#D1D7DB] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 bg-[#FAF6EC] border-b border-[#D1D7DB] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#84B3CE]/25 flex items-center justify-center text-[#16587B]">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#111B21]">
                Role &amp; Navigation Management
              </h2>
              <p className="text-[11px] text-[#667781]">
                Configure additional authorized tabs for store operational roles
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#667781] hover:text-[#111B21] hover:bg-[#E9EDEF] rounded-lg transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-xs">
          {/* Feedback Banner */}
          {feedback && (
            <div
              className={`p-3 rounded-lg border flex items-start gap-2.5 text-xs animate-in fade-in duration-150 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : feedback.type === 'error'
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{feedback.message}</div>
            </div>
          )}

          {/* Role Selector Tabs */}
          <div>
            <label className="text-[11px] font-bold text-[#667781] uppercase tracking-wider block mb-1.5">
              Select Role to Configure
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {manageableRoles.map((role) => {
                const isSelected = selectedRole === role;
                return (
                  <button
                    key={role}
                    onClick={() => setSelectedRole(role)}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-[#84B3CE]/20 border-[#16587B] text-[#16587B] font-bold ring-1 ring-[#16587B]/30 shadow-2xs'
                        : 'border-[#D1D7DB] hover:bg-[#FAF6EC] text-[#111B21]'
                    }`}
                  >
                    <div className="font-semibold text-xs">{getRoleDisplayName(role)}</div>
                    <span className="text-[10px] text-[#667781] mt-1 font-mono">
                      {role}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Effective Navigation Preview Bar */}
          <div className="bg-[#FAF6EC] p-3 rounded-xl border border-[#D1D7DB] space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-[#111B21] flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-[#16587B]" />
                Effective Sidebar Navigation ({effectiveViews.length} Tabs)
              </span>
              <span className="text-[10px] text-[#667781]">
                Landing view: <strong>{ROLE_NAVIGATION_POLICIES[selectedRole]?.defaultView}</strong>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {effectiveViews.map((view) => {
                const isAdditional = enabledModules.includes(view);
                return (
                  <span
                    key={view}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 border ${
                      isAdditional
                        ? 'bg-[#84B3CE]/25 text-[#16587B] border-[#84B3CE] font-bold'
                        : 'bg-white text-[#111B21] border-[#D1D7DB]'
                    }`}
                  >
                    {isAdditional && <Check className="w-2.5 h-2.5 text-[#16587B]" />}
                    {ALL_MODULE_METADATA[view]?.label || view}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Configuration Categories */}
          <div className="space-y-4">
            {/* 1. Eligible Additional Modules (Configurable by Manager) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-[#111B21] uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#16587B]" />
                  Eligible Additional Modules (Delegatable)
                </h4>
                <span className="text-[10px] text-[#667781]">
                  Authorized by Organization Admin
                </span>
              </div>

              {eligibleAdditionalViews.length === 0 ? (
                <div className="p-3 bg-[#FAF6EC] rounded-lg text-center text-[#667781] text-xs">
                  No additional modules are eligible for delegation to this role.
                </div>
              ) : (
                <div className="space-y-2">
                  {eligibleAdditionalViews.map((view) => {
                    const isEnabled = enabledModules.includes(view);
                    const meta = ALL_MODULE_METADATA[view];
                    return (
                      <div
                        key={view}
                        onClick={() => handleToggleModule(view)}
                        className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isEnabled
                            ? 'bg-[#84B3CE]/15 border-[#16587B] ring-1 ring-[#16587B]/20'
                            : 'bg-white border-[#D1D7DB] hover:bg-[#FAF6EC]'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#111B21] text-xs">
                              {meta?.label || view}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-[#E9EDEF] text-[#667781]">
                              {view}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#667781] mt-0.5 leading-snug">
                            {meta?.description}
                          </p>
                        </div>

                        {/* Switch Toggle */}
                        <div
                          className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                            isEnabled ? 'bg-[#16587B]' : 'bg-[#D1D7DB]'
                          }`}
                        >
                          <div
                            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                              isEnabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Predefined Baseline Modules (Mandatory Default) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-[#667781] uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#667781]" />
                  Predefined Baseline Modules (Mandatory)
                </h4>
                <span className="text-[10px] text-[#667781]">
                  Cannot be disabled
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {baselineViews.map((view) => {
                  const meta = ALL_MODULE_METADATA[view];
                  return (
                      <div
                      key={view}
                      className="p-2.5 rounded-lg bg-[#FAF6EC] border border-[#E9EDEF] flex items-center justify-between"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-semibold text-[#111B21] text-xs truncate block">
                          {meta?.label || view}
                        </span>
                        <span className="text-[10px] text-[#667781] block truncate font-mono">
                          {view}
                        </span>
                      </div>
                      <span className="text-[10px] bg-white border border-[#D1D7DB] text-[#667781] px-2 py-0.5 rounded font-medium shrink-0 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Baseline
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Restricted Modules (Non-Delegatable) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-700" />
                  Restricted Modules (Security Boundary)
                </h4>
                <span className="text-[10px] text-rose-700 font-semibold">
                  Default Deny Enforced
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {restrictedViews.map((view) => {
                  const meta = ALL_MODULE_METADATA[view];
                  return (
                    <div
                      key={view}
                      className="p-2.5 rounded-lg bg-rose-50/40 border border-rose-100 flex items-center justify-between opacity-80"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-semibold text-rose-900 text-xs truncate block">
                          {meta?.label || view}
                        </span>
                        <span className="text-[10px] text-rose-700/80 block truncate font-mono">
                          {view}
                        </span>
                      </div>
                      <span className="text-[10px] bg-white text-rose-700 border border-rose-200 px-2 py-0.5 rounded font-bold shrink-0">
                        Restricted
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-3 sm:p-4 bg-[#FAF6EC] border-t border-[#D1D7DB] flex items-center justify-between gap-3 shrink-0 flex-wrap">
          <button
            onClick={handleRestoreDefaults}
            className="px-3 py-2 bg-white border border-[#D1D7DB] hover:bg-[#E9EDEF] text-[#667781] hover:text-[#111B21] rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restore Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 bg-white border border-[#D1D7DB] hover:bg-[#E9EDEF] text-[#111B21] rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-[#16587B] hover:bg-[#124866] text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Role Navigation</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
