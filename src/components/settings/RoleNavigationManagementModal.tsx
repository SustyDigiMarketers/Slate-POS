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
  canManagerManageRole,
  canManagerEnableModule,
  getEffectiveAllowedViews,
  getRoleDisplayName,
} from '../../lib/roleNavigation';
import { saveRoleNavigationConfig } from '../../lib/supabaseClient';

interface RoleNavigationManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ALL_MODULE_METADATA: Record<
  ActiveView,
  { label: string; description: string; category: 'Sales' | 'Operations' | 'Admin' }
> = {
  DASHBOARD: { label: 'Executive Dashboard', description: 'Financial KPIs, revenue trends, and operational overview', category: 'Admin' },
  CUSTOMERS: { label: 'Customer Directory', description: 'Customer profiles, credit limit, and receivables ledger', category: 'Sales' },
  PRODUCTS: { label: 'Product Catalogue', description: 'Item master, HSN codes, GST rates, and price sheets', category: 'Operations' },
  POS: { label: 'POS Terminal', description: 'Touchscreen checkout, barcode scanning, and receipt printing', category: 'Sales' },
  QUOTES: { label: 'Quotations & Estimates', description: 'Pro-forma invoices and sales proposals', category: 'Sales' },
  SALES: { label: 'Invoices & Receipts', description: 'Completed sales invoices and historical tax receipts', category: 'Sales' },
  COUPONS: { label: 'Coupons & Promos', description: 'Discount campaigns, percentage vouchers, and promo codes', category: 'Sales' },
  CHALLANS: { label: 'Delivery Challans', description: 'Dispatch documentation and goods shipment notes', category: 'Operations' },
  PAYMENTS: { label: 'Payments Tender', description: 'Cash drawer settlements and UPI reconciliation', category: 'Sales' },
  EXPENSES: { label: 'Expenses Manager', description: 'Petty cash recording and daily branch operational overheads', category: 'Operations' },
  INVENTORY: { label: 'Stock Movements', description: 'Physical audits, stock adjustments, and shrinkage tracking', category: 'Operations' },
  REPORTS: { label: 'Reports & P&L', description: 'Executive sales performance and tax audit reports', category: 'Admin' },
  SUPPLIERS: { label: 'Wholesale Suppliers', description: 'Procurement vendor directory and supplier purchase terms', category: 'Operations' },
  STAFF: { label: 'Staff & Roles', description: 'Employee accounts, user permissions, and branch access', category: 'Admin' },
  SETTINGS: { label: 'Settings Portal', description: 'System setup, hardware printer, and tax configuration', category: 'Admin' },
  SUBSCRIPTIONS: { label: 'Subscriptions & Billing', description: 'Enterprise platform subscription and SaaS billing', category: 'Admin' },
  SYNC: { label: 'Sync & Diagnostics', description: 'Offline queue status, outbox telemetry, and cloud sync', category: 'Admin' },
};

export const RoleNavigationManagementModal: React.FC<RoleNavigationManagementModalProps> = ({
  isOpen,
  onClose,
}) => {
  const activeUser = offlineStore.getActiveUser();
  const actorRole = activeUser.role;

  // Determine selectable roles based on actor privileges
  const manageableRoles: UserRole[] =
    actorRole === 'SUPER_ADMIN' || actorRole === 'ORG_ADMIN'
      ? ['CASHIER', 'STORE_OFFICER', 'MANAGER']
      : actorRole === 'MANAGER'
      ? ['CASHIER', 'STORE_OFFICER']
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

  // Security gate: Cashier and Store Officer have zero authorization to view this interface
  const isAuthorized = canManagerManageRole(actorRole, 'CASHIER');
  if (!isAuthorized) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
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
            className="px-4 py-2 bg-[#075E54] text-white rounded-lg text-xs font-bold hover:bg-[#128C7E] transition-colors cursor-pointer"
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[92vh] flex flex-col border border-[#D1D7DB] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 bg-[#F7F5F2] border-b border-[#D1D7DB] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#DCF8C6] flex items-center justify-center text-[#075E54]">
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
                        ? 'bg-[#DCF8C6]/50 border-[#075E54] text-[#075E54] font-bold ring-1 ring-[#075E54]/30 shadow-2xs'
                        : 'border-[#D1D7DB] hover:bg-[#F7F5F2] text-[#111B21]'
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
          <div className="bg-[#F7F5F2] p-3 rounded-xl border border-[#D1D7DB] space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-[#111B21] flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-[#075E54]" />
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
                        ? 'bg-[#DCF8C6] text-[#075E54] border-[#075E54]/40 font-bold'
                        : 'bg-white text-[#111B21] border-[#D1D7DB]'
                    }`}
                  >
                    {isAdditional && <Check className="w-2.5 h-2.5 text-[#075E54]" />}
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
                  <ShieldCheck className="w-4 h-4 text-[#075E54]" />
                  Eligible Additional Modules (Delegatable)
                </h4>
                <span className="text-[10px] text-[#667781]">
                  Authorized by Store Manager
                </span>
              </div>

              {eligibleAdditionalViews.length === 0 ? (
                <div className="p-3 bg-[#F7F5F2] rounded-lg text-center text-[#667781] text-xs">
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
                            ? 'bg-emerald-50/60 border-emerald-300 ring-1 ring-emerald-400/20'
                            : 'bg-white border-[#D1D7DB] hover:bg-[#F7F5F2]'
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
                            isEnabled ? 'bg-[#075E54]' : 'bg-[#D1D7DB]'
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
                      className="p-2.5 rounded-lg bg-[#F7F5F2] border border-[#E9EDEF] flex items-center justify-between"
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
        <div className="p-3 sm:p-4 bg-[#F7F5F2] border-t border-[#D1D7DB] flex items-center justify-between gap-3 shrink-0 flex-wrap">
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
              className="px-4 py-2 bg-[#075E54] hover:bg-[#128C7E] text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
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
