/**
 * SLATE POS — Finance & Accounting Settings Portal
 * Dedicated Organization & Tax Settings, Branches & Terminals, Fiscal Year & Accounting Period Locking,
 * Role & Navigation Governance, and Accounting Module Settings.
 * Styled with SLATE POS Theme (#16587B / #84B3CE / #F5EEDD)
 */

import React, { useState, useMemo, useEffect } from 'react';
import { ActiveView } from '../layout/Sidebar';
import { offlineStore } from '../../lib/offlineStore';
import { canAccessView } from '../../lib/roleNavigation';
import { hasPermission } from '../../lib/permissions';
import { AccountingPeriod, Branch, Organization } from '../../types';
import { HardwareSettings } from './HardwareSettings';
import { RoleNavigationManagementModal } from './RoleNavigationManagementModal';
import { ChangePasswordModal } from './ChangePasswordModal';
import {
  DEFAULT_BRAND_LOGO_PATH,
  getActiveBrandLogoUrl,
  REQUIRED_LOGO_DIMENSION,
  validatePngLogoFile,
} from '../../lib/branding';
import {
  Search,
  X,
  Building,
  Building2,
  Users,
  CheckSquare,
  Sliders,
  BookOpen,
  LayoutGrid,
  CreditCard,
  ShoppingBag,
  ShoppingCart,
  ChevronRight,
  CheckCircle2,
  Save,
  Printer,
  Lock,
  Unlock,
  Plus,
  Calendar,
  MapPin,
  Landmark,
  Upload,
  RotateCcw,
  Image as ImageIcon,
  AlertCircle,
} from 'lucide-react';

interface AllSettingsPageProps {
  initialSection?: 'OVERVIEW' | 'ORG' | 'BRANCHES' | 'FISCAL';
  onClose: () => void;
  onNavigateToView: (view: ActiveView) => void;
}

interface SettingItem {
  id: string;
  name: string;
  targetView?: ActiveView;
  sectionTarget?: 'ORG' | 'BRANCHES' | 'FISCAL';
  specialAction?: 'HARDWARE_PRINTER' | 'CONFIG_DRAWER' | 'ROLE_NAVIGATION' | 'CHANGE_PASSWORD';
}

interface SettingCategory {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: SettingItem[];
}

export const AllSettingsPage: React.FC<AllSettingsPageProps> = ({
  initialSection = 'OVERVIEW',
  onClose,
  onNavigateToView,
}) => {
  const [activeSection, setActiveSection] = useState<'OVERVIEW' | 'ORG' | 'BRANCHES' | 'FISCAL'>(initialSection);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModalItem, setActiveModalItem] = useState<{ id: string; name: string; category: string } | null>(null);
  const [showHardwareDrawer, setShowHardwareDrawer] = useState(false);
  const [showRoleNavModal, setShowRoleNavModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [savedSuccessMsg, setSavedSuccessMsg] = useState<string | null>(null);

  // Live store data
  const [activeUser, setActiveUser] = useState(() => offlineStore.getActiveUser());
  const [org, setOrg] = useState<Organization>(() => offlineStore.getOrganization());
  const [branches, setBranches] = useState<Branch[]>(() => offlineStore.getBranches());
  const [activeBranchId, setActiveBranchId] = useState<string>(() => offlineStore.getActiveBranchId());
  const [fiscalYear, setFiscalYear] = useState<string>(() => offlineStore.getFiscalYear());
  const [periods, setPeriods] = useState<AccountingPeriod[]>(() => offlineStore.getAccountingPeriods());

  const canManageOrg = hasPermission(activeUser, 'ORG_SETTINGS_MANAGE');
  const canManageBranches = hasPermission(activeUser, 'BRANCH_MANAGE');
  const canManageFiscal = hasPermission(activeUser, 'FISCAL_MANAGE');
  const canManageRoleNav = hasPermission(activeUser, 'ROLES_MANAGE');

  // Editable Organization & Tax Form
  const [legalName, setLegalName] = useState(org.name);
  const [tradeName, setTradeName] = useState(org.tradeName);
  const [gstin, setGstin] = useState(org.gstin);
  const [pan, setPan] = useState(org.pan);
  const [stateName, setStateName] = useState(org.state);
  const [pincode, setPincode] = useState(org.pincode || '');
  const [address, setAddress] = useState(org.address);
  const [phone, setPhone] = useState(org.phone);
  const [email, setEmail] = useState(org.email);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string>(() => getActiveBrandLogoUrl(org));
  const [pendingLogoDataUrl, setPendingLogoDataUrl] = useState<string | undefined>(org.logoUrl);
  const [logoError, setLogoError] = useState<string | null>(null);

  // New Branch Form
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchCode, setNewBranchCode] = useState('');
  const [newBranchCity, setNewBranchCity] = useState('');
  const [newBranchState, setNewBranchState] = useState(org.state || '');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [newBranchPhone, setNewBranchPhone] = useState('');

  // Quick parameter drawer fields
  const [invoicePrefix, setInvoicePrefix] = useState('INV-2026-');
  const [paymentTermsDays, setPaymentTermsDays] = useState('30');
  const [msmeUdyam, setMsmeUdyam] = useState('');

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    const sync = () => {
      setActiveUser(offlineStore.getActiveUser());
      const currentOrg = offlineStore.getOrganization();
      setOrg(currentOrg);
      setLegalName(currentOrg.name);
      setTradeName(currentOrg.tradeName);
      setGstin(currentOrg.gstin);
      setPan(currentOrg.pan);
      setStateName(currentOrg.state);
      setPincode(currentOrg.pincode || '');
      setAddress(currentOrg.address);
      setPhone(currentOrg.phone);
      setEmail(currentOrg.email);
      setLogoPreviewUrl(getActiveBrandLogoUrl(currentOrg));
      setPendingLogoDataUrl(currentOrg.logoUrl);
      setBranches(offlineStore.getBranches());
      setActiveBranchId(offlineStore.getActiveBranchId());
      setFiscalYear(offlineStore.getFiscalYear());
      setPeriods(offlineStore.getAccountingPeriods());
    };
    const unsub = offlineStore.subscribe(sync);
    return unsub;
  }, []);

  const flashSuccess = (msg: string) => {
    setSavedSuccessMsg(msg);
    setTimeout(() => setSavedSuccessMsg(null), 3500);
  };

  const handleLogoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogoError(null);
    const file = e.target.files?.[0];
    if (!file || !canManageOrg) return;

    const validation = await validatePngLogoFile(file);
    if (!validation.valid || !validation.dataUrl) {
      setLogoError(validation.error || `Logo must be a PNG file measuring ${REQUIRED_LOGO_DIMENSION} × ${REQUIRED_LOGO_DIMENSION} px.`);
      e.target.value = '';
      return;
    }

    setPendingLogoDataUrl(validation.dataUrl);
    setLogoPreviewUrl(validation.dataUrl);
    offlineStore.setOrganization({ logoUrl: validation.dataUrl });
    flashSuccess('Centralized 500 × 500 PNG company logo updated across app header, login, splash, PDFs & favicon.');
    e.target.value = '';
  };

  const handleResetBrandLogo = () => {
    if (!canManageOrg) return;
    setLogoError(null);
    setPendingLogoDataUrl(undefined);
    setLogoPreviewUrl(DEFAULT_BRAND_LOGO_PATH);
    offlineStore.setOrganization({ logoUrl: undefined });
    flashSuccess('Company logo reset to centralized default 500 × 500 PNG asset.');
  };

  const handleSaveOrgSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageOrg) return;
    offlineStore.setOrganization({
      name: legalName.trim() || org.name,
      tradeName: tradeName.trim() || org.tradeName,
      gstin: gstin.trim().toUpperCase(),
      pan: pan.trim().toUpperCase(),
      state: stateName.trim(),
      pincode: pincode.trim(),
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
      logoUrl: pendingLogoDataUrl,
    });
    flashSuccess('Organization profile and GST tax registration saved.');
  };

  const handleAddBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageBranches) return;
    if (!newBranchName.trim() || !newBranchCode.trim()) return;
    offlineStore.addBranch({
      name: newBranchName.trim(),
      code: newBranchCode.trim().toUpperCase(),
      address: newBranchAddress.trim(),
      city: newBranchCity.trim(),
      state: newBranchState.trim() || org.state || '',
      phone: newBranchPhone.trim() || org.phone,
      isMainBranch: false,
      activeTerminalCount: 1,
    });
    setNewBranchName('');
    setNewBranchCode('');
    setNewBranchCity('');
    setNewBranchAddress('');
    setNewBranchPhone('');
    flashSuccess('New branch terminal added and synced to workspace.');
  };

  const handleTogglePeriodLock = (period: AccountingPeriod) => {
    if (!canManageFiscal) return;
    const currentlyLocked = period.status === 'LOCKED' || period.status === 'CLOSED';
    const res = offlineStore.toggleAccountingPeriodLock(period.id, !currentlyLocked);
    if (res.success && res.period) {
      const nowLocked = res.period.status === 'LOCKED' || res.period.status === 'CLOSED';
      flashSuccess(
        nowLocked
          ? `Accounting period "${res.period.name}" locked — backdated journal postings blocked.`
          : `Accounting period "${res.period.name}" unlocked for entries.`
      );
    }
  };

  // ===========================================================================
  // SECTION 1: ORGANIZATION & GOVERNANCE SETTINGS
  // ===========================================================================
  const organizationCategories: SettingCategory[] = [
    {
      id: 'org_main',
      title: 'Organization & Tax',
      icon: Building,
      items: [
        { id: 'org_profile', name: 'Organization Profile & GSTIN', sectionTarget: 'ORG' },
        { id: 'org_locations', name: 'Branches & Terminals', sectionTarget: 'BRANCHES' },
        { id: 'org_fiscal', name: 'Fiscal Year & Period Locking', sectionTarget: 'FISCAL' },
        { id: 'org_manage_sub', name: 'Manage Subscription', targetView: 'SUBSCRIPTIONS' },
      ],
    },
    {
      id: 'users_roles',
      title: 'Users, Roles & Security',
      icon: Users,
      items: [
        { id: 'ur_role_navigation', name: 'Role & Navigation Management', specialAction: 'ROLE_NAVIGATION' },
        { id: 'ur_users', name: 'Staff Directory & Roles', targetView: 'STAFF' },
        { id: 'ur_change_password', name: 'Change Password & Security', specialAction: 'CHANGE_PASSWORD' },
      ],
    },
    {
      id: 'tasks_compliance',
      title: 'Tax & Statutory Compliance',
      icon: CheckSquare,
      items: [
        { id: 'tc_gst_reports', name: 'GST Filing Summary (GSTR-1 / 3B)', targetView: 'REPORT_GST' },
        { id: 'tc_audit', name: 'Financial Audit Trail', targetView: 'REPORT_AUDIT' },
        { id: 'tc_msme', name: 'MSME / Udyam Registration', specialAction: 'CONFIG_DRAWER' },
      ],
    },
    {
      id: 'setup_configs',
      title: 'Terminals, Print & Sync',
      icon: Sliders,
      items: [
        { id: 'sc_general', name: 'Thermal Printer & Receipt Templates', specialAction: 'HARDWARE_PRINTER' },
        { id: 'sc_sync', name: 'Cloud Sync & Outbox Diagnostics', targetView: 'SYNC' },
        { id: 'sc_payment_terms', name: 'Default Credit & Payment Terms', specialAction: 'CONFIG_DRAWER' },
        { id: 'sc_number_series', name: 'Voucher & Invoice Number Series', specialAction: 'CONFIG_DRAWER' },
      ],
    },
  ];

  // ===========================================================================
  // SECTION 2: ACCOUNTING & FINANCE MODULE SETTINGS
  // ===========================================================================
  const moduleCategories: SettingCategory[] = [
    {
      id: 'mod_accounting',
      title: 'General Ledger & Accounts',
      icon: BookOpen,
      items: [
        { id: 'ma_coa', name: 'Chart of Accounts', targetView: 'CHART_OF_ACCOUNTS' },
        { id: 'ma_journal', name: 'Manual Journal Vouchers', targetView: 'JOURNAL' },
        { id: 'ma_budgets', name: 'Budgets & Variance Tracking', targetView: 'BUDGETS' },
        { id: 'ma_bulk', name: 'Bulk Updates & Opening Balances', targetView: 'BULK_UPDATES' },
        { id: 'ma_tx', name: 'Unified Transactions Register', targetView: 'TRANSACTIONS' },
      ],
    },
    {
      id: 'mod_sales',
      title: 'Sales & Receivables',
      icon: ShoppingBag,
      items: [
        { id: 'ms_customers', name: 'Customers Ledger (AR)', targetView: 'CUSTOMERS' },
        { id: 'ms_quotes', name: 'Quotes & Estimates', targetView: 'QUOTES' },
        { id: 'ms_invoices', name: 'Tax Invoices', targetView: 'SALES' },
        { id: 'ms_payments_recv', name: 'Payments Received', targetView: 'PAYMENTS' },
        { id: 'ms_credit_notes', name: 'Credit Notes & Refunds', targetView: 'CREDIT_NOTES' },
        { id: 'ms_challans', name: 'Delivery Challans', targetView: 'CHALLANS' },
      ],
    },
    {
      id: 'mod_purchases',
      title: 'Purchases, Payables & Banking',
      icon: ShoppingCart,
      items: [
        { id: 'mp_suppliers', name: 'Suppliers Ledger (AP)', targetView: 'SUPPLIERS' },
        { id: 'mp_bills', name: 'Purchase Orders & Supplier Bills', targetView: 'PURCHASES' },
        { id: 'mp_debit', name: 'Debit Notes & Purchase Returns', targetView: 'DEBIT_NOTES' },
        { id: 'mp_expenses', name: 'Operating Expenses', targetView: 'EXPENSES' },
        { id: 'mp_banking', name: 'Banking, Cash & Reconciliation', targetView: 'BANKING' },
        { id: 'mp_products', name: 'Products & Inventory Master', targetView: 'PRODUCTS' },
      ],
    },
    {
      id: 'mod_reports',
      title: 'Financial Statements',
      icon: LayoutGrid,
      items: [
        { id: 'mr_pl', name: 'Profit & Loss Statement', targetView: 'REPORT_PL' },
        { id: 'mr_bs', name: 'Balance Sheet', targetView: 'REPORT_BS' },
        { id: 'mr_cf', name: 'Cash Flow Statement', targetView: 'REPORT_CF' },
        { id: 'mr_tb', name: 'Trial Balance', targetView: 'REPORT_TB' },
        { id: 'mr_gl', name: 'General Ledger Report', targetView: 'REPORT_GL' },
      ],
    },
  ];

  const canShowSettingItem = (item: SettingItem): boolean => {
    if (item.sectionTarget === 'ORG') return canManageOrg;
    if (item.sectionTarget === 'BRANCHES') return canManageBranches;
    if (item.sectionTarget === 'FISCAL') return canManageFiscal;
    if (item.specialAction === 'ROLE_NAVIGATION') return canManageRoleNav;
    if (item.specialAction === 'CHANGE_PASSWORD') return true;
    if (item.targetView) return canAccessView(activeUser.role, item.targetView);
    return canManageOrg;
  };

  const filterCategories = (categories: SettingCategory[]) => {
    const permitted = categories
      .map((category) => ({
        ...category,
        items: category.items.filter(canShowSettingItem),
      }))
      .filter((category) => category.items.length > 0);

    if (!searchQuery.trim()) return permitted;
    const query = searchQuery.toLowerCase().trim();
    return permitted
      .map((category) => {
        if (category.title.toLowerCase().includes(query)) return category;
        const matchingItems = category.items.filter((item) => item.name.toLowerCase().includes(query));
        return matchingItems.length > 0 ? { ...category, items: matchingItems } : null;
      })
      .filter(Boolean) as SettingCategory[];
  };

  const filteredOrgCategories = useMemo(
    () => filterCategories(organizationCategories),
    [searchQuery, activeUser.role]
  );
  const filteredModuleCategories = useMemo(
    () => filterCategories(moduleCategories),
    [searchQuery, activeUser.role]
  );
  const totalMatches = filteredOrgCategories.length + filteredModuleCategories.length;

  const handleItemClick = (item: SettingItem, categoryTitle: string) => {
    if (!canShowSettingItem(item)) return;
    if (item.sectionTarget) {
      setActiveSection(item.sectionTarget);
    } else if (item.specialAction === 'ROLE_NAVIGATION') {
      if (canManageRoleNav) setShowRoleNavModal(true);
    } else if (item.specialAction === 'CHANGE_PASSWORD') {
      setShowChangePasswordModal(true);
    } else if (item.targetView) {
      onNavigateToView(item.targetView);
    } else if (item.specialAction === 'HARDWARE_PRINTER') {
      setShowHardwareDrawer(true);
    } else {
      setActiveModalItem({ id: item.id, name: item.name, category: categoryTitle });
    }
  };

  const handleSaveModalSettings = (e: React.FormEvent) => {
    e.preventDefault();
    flashSuccess(`Configuration updated for ${activeModalItem?.name}`);
    setActiveModalItem(null);
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white p-5 rounded-lg border border-[#D1D7DB] shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#111B21] tracking-tight">Settings &amp; Fiscal Governance</h1>
            <p className="text-xs text-[#667781] mt-0.5">
              Organization GST registration, branch terminals, fiscal year period locking, roles, and accounting preferences
            </p>
          </div>
          <div className="flex items-center gap-3">
            {activeSection === 'OVERVIEW' && (
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-[#8696A0] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search finance settings..."
                  className="w-full pl-9 pr-8 py-1.5 text-xs bg-[#FAF6EC] hover:bg-white focus:bg-white border border-[#D1D7DB] focus:border-[#16587B] rounded-md outline-none transition-colors text-[#111B21]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8696A0] hover:text-[#111B21] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#3B4A54] hover:text-[#111B21] hover:bg-[#FAF6EC] border border-[#D1D7DB] rounded-md transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Close</span>
            </button>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-[#E9EDEF] pt-3">
          {[
            { id: 'OVERVIEW', label: 'All Settings', allowed: true },
            { id: 'ORG', label: 'Organization & Tax', allowed: canManageOrg },
            { id: 'BRANCHES', label: `Branches (${branches.length})`, allowed: canManageBranches },
            { id: 'FISCAL', label: 'Fiscal Year & Period Locks', allowed: canManageFiscal },
          ]
            .filter((tab) => tab.allowed)
            .map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id as any)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  activeSection === tab.id
                    ? 'bg-[#16587B] text-white'
                    : 'text-[#667781] hover:bg-[#FAF6EC] hover:text-[#111B21]'
                }`}
              >
                {tab.label}
              </button>
            ))}
        </div>
      </div>

      {/* Feedback Toast */}
      {savedSuccessMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{savedSuccessMsg}</span>
          </div>
          <button onClick={() => setSavedSuccessMsg(null)} className="text-emerald-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TAB: ORGANIZATION & GST TAX */}
      {activeSection === 'ORG' && canManageOrg && (
        <form onSubmit={handleSaveOrgSettings} className="bg-white rounded-lg border border-[#D1D7DB] p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-[#E9EDEF] pb-3">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-[#16587B]" />
              <h2 className="text-sm font-bold text-[#111B21]">Organization Profile &amp; GST Tax Configuration</h2>
            </div>
            <span className="font-mono text-[11px] text-[#667781]">Org ID: {org.id}</span>
          </div>

          {/* Centralized 500x500 PNG Brand Logo Manager */}
          <div className="p-4 rounded-xl bg-[#FAF6EC] border border-[#D1D7DB] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-16 h-16 rounded-xl bg-[#16587B] border border-[#0F405B] p-1.5 flex items-center justify-center shrink-0 shadow-xs">
                  <img
                    src={logoPreviewUrl}
                    alt="Active Company Logo"
                    className="w-full h-full object-contain rounded-lg"
                  />
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-bold text-[#111B21] text-xs">
                    <ImageIcon className="w-3.5 h-3.5 text-[#16587B]" />
                    <span>Centralized Company Logo (500 × 500 PNG)</span>
                  </div>
                  <p className="text-[11px] text-[#667781] leading-snug max-w-md">
                    Applied uniformly across the top application bar, splash screen, login page, browser favicon, quotations, and receipts. Upload a transparent or clean square 500 × 500 PNG asset (max 2 MB).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <label className="px-3.5 py-2 rounded-lg bg-[#16587B] hover:bg-[#124866] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload 500×500 PNG</span>
                  <input
                    type="file"
                    accept="image/png,.png"
                    onChange={handleLogoFileSelected}
                    className="sr-only"
                    aria-label="Upload 500x500 PNG company logo"
                  />
                </label>

                {pendingLogoDataUrl && (
                  <button
                    type="button"
                    onClick={handleResetBrandLogo}
                    className="px-3 py-2 rounded-lg bg-white border border-[#D1D7DB] text-[#3B4A54] hover:bg-[#F5EEDD] font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Default</span>
                  </button>
                )}
              </div>
            </div>

            {logoError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{logoError}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-[#111B21] mb-1">Registered Legal Name *</label>
              <input
                type="text"
                required
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                className="w-full px-3 py-2 border border-[#D1D7DB] rounded-md focus:border-[#16587B] outline-none"
              />
            </div>
            <div>
              <label className="block font-bold text-[#111B21] mb-1">Trade / Brand Name *</label>
              <input
                type="text"
                required
                value={tradeName}
                onChange={(e) => setTradeName(e.target.value)}
                className="w-full px-3 py-2 border border-[#D1D7DB] rounded-md focus:border-[#16587B] outline-none"
              />
            </div>
            <div>
              <label className="block font-bold text-[#111B21] mb-1">GSTIN (15-digit)</label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                className="w-full px-3 py-2 border border-[#D1D7DB] rounded-md font-mono uppercase focus:border-[#16587B] outline-none"
              />
            </div>
            <div>
              <label className="block font-bold text-[#111B21] mb-1">PAN Number</label>
              <input
                type="text"
                value={pan}
                onChange={(e) => setPan(e.target.value)}
                className="w-full px-3 py-2 border border-[#D1D7DB] rounded-md font-mono uppercase focus:border-[#16587B] outline-none"
              />
            </div>
            <div>
              <label className="block font-bold text-[#111B21] mb-1">Home State (Place of Supply)</label>
              <input
                type="text"
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
                className="w-full px-3 py-2 border border-[#D1D7DB] rounded-md focus:border-[#16587B] outline-none"
              />
            </div>
            <div>
              <label className="block font-bold text-[#111B21] mb-1">Registered Pincode (GST Code: {gstin.slice(0, 2) || '29'})</label>
              <input
                type="text"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                className="w-full px-3 py-2 border border-[#D1D7DB] rounded-md font-mono focus:border-[#16587B] outline-none"
              />
            </div>
            <div>
              <label className="block font-bold text-[#111B21] mb-1">Finance Contact Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-[#D1D7DB] rounded-md focus:border-[#16587B] outline-none"
              />
            </div>
            <div>
              <label className="block font-bold text-[#111B21] mb-1">Primary Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-[#D1D7DB] rounded-md font-mono focus:border-[#16587B] outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-[#111B21] mb-1">Registered Office Address</label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 border border-[#D1D7DB] rounded-md focus:border-[#16587B] outline-none"
            />
          </div>

          <div className="pt-3 border-t border-[#E9EDEF] flex justify-end">
            <button
              type="submit"
              className="px-5 py-2 bg-[#16587B] hover:bg-[#124866] text-white font-bold rounded-md flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Save Organization &amp; Tax Settings
            </button>
          </div>
        </form>
      )}

      {/* TAB: BRANCHES & TERMINALS */}
      {activeSection === 'BRANCHES' && canManageBranches && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 text-xs">
          <div className="lg:col-span-2 bg-white rounded-lg border border-[#D1D7DB] p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-[#E9EDEF] pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#16587B]" />
                <h2 className="text-sm font-bold text-[#111B21]">Configured Branches ({branches.length})</h2>
              </div>
            </div>
            <div className="space-y-2.5">
              {branches.map((b) => {
                const isActive = b.id === activeBranchId;
                return (
                  <div
                    key={b.id}
                    className={`p-3.5 rounded-lg border flex items-center justify-between gap-3 ${
                      isActive ? 'bg-[#84B3CE]/20 border-[#16587B]' : 'bg-[#FAF6EC] border-[#E9EDEF]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#111B21]">{b.name}</span>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 bg-white border border-[#D1D7DB] rounded text-[#667781]">
                          {b.code}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#667781] mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span>
                          {b.address}, {b.city}, {b.state}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        offlineStore.setActiveBranch(b.id);
                        flashSuccess(`Switched active accounting branch to ${b.name}.`);
                      }}
                      className={`px-3 py-1.5 rounded-md font-bold text-[11px] shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-[#16587B] text-white'
                          : 'bg-white border border-[#D1D7DB] text-[#16587B] hover:bg-[#84B3CE]/20'
                      }`}
                    >
                      {isActive ? 'Active Branch' : 'Switch To'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleAddBranch} className="bg-white rounded-lg border border-[#D1D7DB] p-5 space-y-3 h-fit">
            <div className="flex items-center gap-2 border-b border-[#E9EDEF] pb-3">
              <Plus className="w-4 h-4 text-[#16587B]" />
              <h3 className="text-sm font-bold text-[#111B21]">Add New Branch</h3>
            </div>
            <div>
              <label className="block font-bold text-[#111B21] mb-1">Branch Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Whitefield Accounting Hub"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                className="w-full px-3 py-2 border border-[#D1D7DB] rounded-md focus:border-[#16587B] outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-[#111B21] mb-1">Branch Code *</label>
                <input
                  type="text"
                  required
                  placeholder="BLR-WFD"
                  value={newBranchCode}
                  onChange={(e) => setNewBranchCode(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-md font-mono uppercase focus:border-[#16587B] outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-[#111B21] mb-1">City</label>
                <input
                  type="text"
                  placeholder="Bengaluru"
                  value={newBranchCity}
                  onChange={(e) => setNewBranchCity(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-md focus:border-[#16587B] outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block font-bold text-[#111B21] mb-1">Address</label>
              <input
                type="text"
                placeholder="Street & landmark"
                value={newBranchAddress}
                onChange={(e) => setNewBranchAddress(e.target.value)}
                className="w-full px-3 py-2 border border-[#D1D7DB] rounded-md focus:border-[#16587B] outline-none"
              />
            </div>
            <div>
              <label className="block font-bold text-[#111B21] mb-1">Phone</label>
              <input
                type="text"
                placeholder="+91 80 ..."
                value={newBranchPhone}
                onChange={(e) => setNewBranchPhone(e.target.value)}
                className="w-full px-3 py-2 border border-[#D1D7DB] rounded-md font-mono focus:border-[#16587B] outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 bg-[#16587B] hover:bg-[#124866] text-white font-bold rounded-md cursor-pointer"
            >
              Create Branch
            </button>
          </form>
        </div>
      )}

      {/* TAB: FISCAL YEAR & ACCOUNTING PERIOD LOCKING */}
      {activeSection === 'FISCAL' && canManageFiscal && (
        <div className="bg-white rounded-lg border border-[#D1D7DB] p-5 space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E9EDEF] pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#16587B]" />
              <div>
                <h2 className="text-sm font-bold text-[#111B21]">Fiscal Year &amp; Period Lock Controls</h2>
                <p className="text-[11px] text-[#667781]">
                  Locked periods strictly reject any new journal postings or reversals dated inside the closed window.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#667781]">Active Fiscal Year:</span>
              <select
                value={fiscalYear}
                onChange={(e) => {
                  offlineStore.setFiscalYear(e.target.value);
                  flashSuccess(`Active fiscal year switched to FY ${e.target.value}.`);
                }}
                className="px-3 py-1.5 border border-[#D1D7DB] rounded-md font-bold text-[#16587B] bg-white cursor-pointer"
              >
                <option value="2025–2026">FY 2025–2026</option>
                <option value="2026–2027">FY 2026–2027</option>
                <option value="2027–2028">FY 2027–2028</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF6EC] text-[#667781] border-b border-[#E9EDEF]">
                  <th className="py-2.5 px-3 font-semibold">Period</th>
                  <th className="py-2.5 px-3 font-semibold">Start Date</th>
                  <th className="py-2.5 px-3 font-semibold">End Date</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Lock Status</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9EDEF]">
                {periods.map((period) => {
                  const isLocked = period.status === 'LOCKED' || period.status === 'CLOSED';
                  return (
                    <tr key={period.id} className="hover:bg-[#FAF6EC]">
                      <td className="py-2.5 px-3 font-semibold text-[#111B21]">{period.name}</td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-[#667781]">{period.startDate}</td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-[#667781]">{period.endDate}</td>
                      <td className="py-2.5 px-3 text-center">
                        {isLocked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                            <Lock className="w-3 h-3" /> {period.status}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            <Unlock className="w-3 h-3" /> OPEN
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleTogglePeriodLock(period)}
                          className={`px-3 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                            isLocked
                              ? 'bg-white border border-[#D1D7DB] text-[#16587B] hover:bg-[#84B3CE]/20'
                              : 'bg-rose-600 text-white hover:bg-rose-700'
                          }`}
                        >
                          {isLocked ? 'Unlock Period' : 'Lock Period'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: OVERVIEW DIRECTORY */}
      {activeSection === 'OVERVIEW' && (
        <>
          {totalMatches === 0 && (
            <div className="bg-white p-12 rounded-lg border border-[#D1D7DB] text-center space-y-3">
              <Search className="w-8 h-8 text-[#8696A0] mx-auto opacity-50" />
              <h2 className="text-sm font-bold text-[#111B21]">No settings found matching "{searchQuery}"</h2>
              <button
                onClick={() => setSearchQuery('')}
                className="px-4 py-1.5 text-xs font-bold bg-[#16587B] hover:bg-[#124866] text-white rounded-md cursor-pointer"
              >
                Clear Search
              </button>
            </div>
          )}

          {filteredOrgCategories.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-bold text-[#667781] uppercase tracking-wider px-1">
                Organization &amp; Governance
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredOrgCategories.map((category) => {
                  const IconComp = category.icon;
                  return (
                    <div
                      key={category.id}
                      className="bg-white rounded-lg border border-[#D1D7DB] hover:border-[#16587B]/60 p-4 transition-all shadow-2xs"
                    >
                      <div className="flex items-center gap-2 pb-2.5 mb-2.5 border-b border-[#E9EDEF]">
                        <div className="p-1.5 rounded-md bg-[#84B3CE]/25 text-[#16587B] border border-[#84B3CE]/60 shrink-0">
                          <IconComp className="w-4 h-4" />
                        </div>
                        <h3 className="font-bold text-sm text-[#111B21] tracking-tight">{category.title}</h3>
                      </div>
                      <ul className="space-y-1">
                        {category.items.map((item) => (
                          <li key={item.id}>
                            <button
                              onClick={() => handleItemClick(item, category.title)}
                              className="w-full text-left py-1 px-1.5 rounded text-xs text-[#3B4A54] hover:text-[#16587B] hover:bg-[#FAF6EC] font-medium flex items-center justify-between group transition-colors cursor-pointer"
                            >
                              <span className="truncate">{item.name}</span>
                              <ChevronRight className="w-3 h-3 text-[#8696A0] opacity-0 group-hover:opacity-100 shrink-0" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {filteredModuleCategories.length > 0 && (
            <div className="space-y-3 pt-1">
              <h2 className="text-xs font-bold text-[#667781] uppercase tracking-wider px-1">
                Finance &amp; Accounting Modules
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredModuleCategories.map((category) => {
                  const IconComp = category.icon;
                  return (
                    <div
                      key={category.id}
                      className="bg-white rounded-lg border border-[#D1D7DB] hover:border-[#16587B]/60 p-4 transition-all shadow-2xs"
                    >
                      <div className="flex items-center gap-2 pb-2.5 mb-2.5 border-b border-[#E9EDEF]">
                        <div className="p-1.5 rounded-md bg-[#84B3CE]/25 text-[#16587B] border border-[#84B3CE]/60 shrink-0">
                          <IconComp className="w-4 h-4" />
                        </div>
                        <h3 className="font-bold text-sm text-[#111B21] tracking-tight">{category.title}</h3>
                      </div>
                      <ul className="space-y-1">
                        {category.items.map((item) => (
                          <li key={item.id}>
                            <button
                              onClick={() => handleItemClick(item, category.title)}
                              className="w-full text-left py-1 px-1.5 rounded text-xs text-[#3B4A54] hover:text-[#16587B] hover:bg-[#FAF6EC] font-medium flex items-center justify-between group transition-colors cursor-pointer"
                            >
                              <span className="truncate">{item.name}</span>
                              <ChevronRight className="w-3 h-3 text-[#8696A0] opacity-0 group-hover:opacity-100 shrink-0" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* HARDWARE & THERMAL PRINTER SETTINGS MODAL */}
      {showHardwareDrawer && (
        <div className="fixed inset-0 bg-[#0F405B]/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-[#D1D7DB] w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E9EDEF] pb-3">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-[#16587B]" />
                <h3 className="font-bold text-base text-[#111B21]">
                  Hardware, Peripherals &amp; Thermal Printer Configuration
                </h3>
              </div>
              <button
                onClick={() => setShowHardwareDrawer(false)}
                className="p-1 text-[#8696A0] hover:text-[#111B21] cursor-pointer rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <HardwareSettings />
          </div>
        </div>
      )}

      {/* EDITABLE CONFIGURATION MODAL */}
      {activeModalItem && (
        <div className="fixed inset-0 bg-[#0F405B]/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-[#D1D7DB] w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E9EDEF] pb-3">
              <div>
                <span className="text-[10px] font-bold text-[#16587B] uppercase tracking-wider">
                  {activeModalItem.category}
                </span>
                <h3 className="font-bold text-base text-[#111B21]">{activeModalItem.name}</h3>
              </div>
              <button
                onClick={() => setActiveModalItem(null)}
                className="p-1 text-[#8696A0] hover:text-[#111B21] cursor-pointer rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModalSettings} className="space-y-4 text-xs">
              {activeModalItem.id === 'tc_msme' ? (
                <div>
                  <label className="font-bold text-[#111B21] block mb-1">Udyam Registration Number</label>
                  <input
                    type="text"
                    value={msmeUdyam}
                    onChange={(e) => setMsmeUdyam(e.target.value)}
                    className="w-full px-3 py-1.5 font-mono border border-[#D1D7DB] rounded focus:border-[#16587B] outline-none"
                  />
                </div>
              ) : activeModalItem.id === 'sc_payment_terms' ? (
                <div>
                  <label className="font-bold text-[#111B21] block mb-1">Default Credit Period (Days)</label>
                  <input
                    type="number"
                    value={paymentTermsDays}
                    onChange={(e) => setPaymentTermsDays(e.target.value)}
                    className="w-full px-3 py-1.5 font-mono border border-[#D1D7DB] rounded focus:border-[#16587B] outline-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="font-bold text-[#111B21] block mb-1">Tax Invoice Prefix Series</label>
                  <input
                    type="text"
                    value={invoicePrefix}
                    onChange={(e) => setInvoicePrefix(e.target.value)}
                    className="w-full px-3 py-1.5 font-mono border border-[#D1D7DB] rounded focus:border-[#16587B] outline-none"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E9EDEF]">
                <button
                  type="button"
                  onClick={() => setActiveModalItem(null)}
                  className="px-3 py-1.5 text-xs text-[#667781] hover:bg-[#FAF6EC] rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold bg-[#16587B] hover:bg-[#124866] text-white rounded flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {canManageRoleNav && (
        <RoleNavigationManagementModal
          isOpen={showRoleNavModal}
          onClose={() => setShowRoleNavModal(false)}
        />
      )}

      <ChangePasswordModal
        isOpen={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
      />
    </div>
  );
};
