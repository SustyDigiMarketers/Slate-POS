/**
 * SLATE POS — Profile Drawer Component
 * Windows Desktop + Cloud SaaS POS Profile Drawer matching the reference specification
 * 
 * Sections:
 * 1. Profile identity: User avatar, User name, User email, User ID, Organization ID, Organization name
 * 2. Account section: My Account, Sign Out, Current plan / trial status, Manage Subscription link
 * 3. Helpful shortcuts: Help & Documents, FAQs or Help Center, Video Tutorials, Explore Features, Accessibility Preferences
 * 4. Need Assistance: Contact Support, Send an Email, Report an Issue, Keyboard Shortcuts, Tips and Guidance
 *
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6 / #ECE5DD / #FFFFFF)
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  User,
  Building,
  Building2,
  Store,
  MapPin,
  Calendar,
  CreditCard,
  LogOut,
  HelpCircle,
  BookOpen,
  Video,
  Compass,
  Sliders,
  Phone,
  Mail,
  AlertTriangle,
  Keyboard,
  Lightbulb,
  CheckCircle2,
  ExternalLink,
  Copy,
  ChevronRight,
  ShieldCheck,
  Check,
  Lock,
} from 'lucide-react';
import { offlineStore } from '../../lib/offlineStore';
import { INITIAL_ORGANIZATION, INITIAL_BRANCHES } from '../../lib/initialData';
import { ActiveView } from '../layout/Sidebar';

interface ProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToView: (view: ActiveView) => void;
  onSignOut: () => void;
  onOpenKeyboardShortcuts?: () => void;
  onOpenHelp?: () => void;
  onOpenFaq?: () => void;
  onOpenReportIssue?: () => void;
  onOpenTips?: () => void;
}

export const ProfileDrawer: React.FC<ProfileDrawerProps> = ({
  isOpen,
  onClose,
  onNavigateToView,
  onSignOut,
  onOpenKeyboardShortcuts,
  onOpenHelp,
  onOpenFaq,
  onOpenReportIssue,
  onOpenTips,
}) => {
  const [activeUser, setActiveUser] = useState(offlineStore.getActiveUser());
  const [activeBranchId, setActiveBranchId] = useState(offlineStore.getActiveBranchId());
  const [organization, setOrganization] = useState(offlineStore.getOrganization());
  const [fiscalYear, setFiscalYear] = useState(offlineStore.getFiscalYear());
  const [activeBranch, setActiveBranch] = useState(offlineStore.getActiveBranch());
  const [branches, setBranches] = useState(offlineStore.getBranches());
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [isAccessibilityModalOpen, setIsAccessibilityModalOpen] = useState(false);
  const [tableDensity, setTableDensity] = useState<'compact' | 'comfortable'>('compact');
  const [highContrast, setHighContrast] = useState(false);

  // Active sub-modals for shortcuts
  const [activeShortcutModal, setActiveShortcutModal] = useState<
    'HELP' | 'FAQ' | 'TUTORIALS' | 'EXPLORE' | 'SHORTCUTS' | 'REPORT' | 'TIPS' | null
  >(null);

  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setActiveUser(offlineStore.getActiveUser());
      setActiveBranchId(offlineStore.getActiveBranchId());
      setOrganization(offlineStore.getOrganization());
      setFiscalYear(offlineStore.getFiscalYear());
      setActiveBranch(offlineStore.getActiveBranch());
      setBranches(offlineStore.getBranches());
    });
    return unsub;
  }, []);

  // Escape key handler and focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSignOutConfirm) {
          setShowSignOutConfirm(false);
        } else if (activeShortcutModal) {
          setActiveShortcutModal(null);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showSignOutConfirm, activeShortcutModal, onClose]);

  if (!isOpen) return null;

  const isCashier = activeUser.role === 'CASHIER';
  const canSwitchBranch = ['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER'].includes(activeUser.role);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in Drawer Container */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-drawer-title"
        className="fixed inset-y-0 right-0 max-w-md w-full bg-[#FFFFFF] shadow-2xl z-50 flex flex-col font-sans border-l border-[#D1D7DB] animate-in slide-in-from-right duration-200"
      >
        {/* ========================================================================= */}
        {/* DRAWER TOP BAR */}
        {/* ========================================================================= */}
        <div className="p-4 border-b border-[#D1D7DB] bg-[#F7F5F2] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#DCF8C6] flex items-center justify-center text-[#075E54]">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 id="profile-drawer-title" className="text-sm font-bold text-[#111B21]">
                User Profile &amp; Account
              </h2>
              <p className="text-[11px] text-[#667781] leading-none">
                Authenticated session &amp; organization context
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-1.5 text-[#667781] hover:text-[#111B21] hover:bg-[#E9EDEF] rounded-lg transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#075E54] focus-visible:outline-none"
            title="Close drawer (Esc)"
            aria-label="Close profile drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* SCROLLABLE DRAWER BODY */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* ========================================================================= */}
          {/* 1. PROFILE IDENTITY SECTION */}
          {/* ========================================================================= */}
          <div className="bg-gradient-to-br from-[#075E54] via-[#0C6E63] to-[#128C7E] rounded-xl p-4 text-white shadow-xs">
            <div className="flex items-start gap-3.5">
              {/* User Avatar */}
              <div className="relative shrink-0">
                {activeUser.avatarUrl ? (
                  <img
                    src={activeUser.avatarUrl}
                    alt={activeUser.name}
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-xs"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-white/20 text-white border-2 border-white/50 text-xl font-bold flex items-center justify-center shadow-xs">
                    {activeUser.name.charAt(0)}
                  </div>
                )}
                <span
                  className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#DCF8C6] border-2 border-[#075E54]"
                  title="Session Active"
                />
              </div>

              {/* User Core Details */}
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base text-white truncate leading-tight">
                  {activeUser.name}
                </h3>
                <p className="text-xs text-[#DCF8C6] truncate mt-0.5">{activeUser.email}</p>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white text-[#075E54] shadow-2xs">
                    {activeUser.role}
                  </span>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-white/20 text-white">
                    {activeBranch.name}
                  </span>
                </div>
              </div>
            </div>

            {/* Identifiers Grid */}
            <div className="mt-4 pt-3 border-t border-white/15 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-black/10 rounded-lg p-2 border border-white/10">
                <span className="text-[10px] text-white/70 block uppercase font-semibold">User ID</span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="font-mono text-[11px] font-bold text-white tabular-nums">
                    {activeUser.id}
                  </span>
                  <button
                    onClick={() => copyToClipboard(activeUser.id, 'User ID')}
                    className="text-white/70 hover:text-white p-0.5 cursor-pointer"
                    title="Copy User ID"
                  >
                    {copiedField === 'User ID' ? (
                      <Check className="w-3 h-3 text-[#DCF8C6]" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-black/10 rounded-lg p-2 border border-white/10">
                <span className="text-[10px] text-white/70 block uppercase font-semibold">Organization ID</span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="font-mono text-[11px] font-bold text-white tabular-nums">
                    {INITIAL_ORGANIZATION.id}
                  </span>
                  <button
                    onClick={() => copyToClipboard(INITIAL_ORGANIZATION.id, 'Org ID')}
                    className="text-white/70 hover:text-white p-0.5 cursor-pointer"
                    title="Copy Organization ID"
                  >
                    {copiedField === 'Org ID' ? (
                      <Check className="w-3 h-3 text-[#DCF8C6]" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

              <div className="col-span-2 bg-black/10 rounded-lg p-2 border border-white/10">
                <span className="text-[10px] text-white/70 block uppercase font-semibold">Organization Name</span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="font-semibold text-xs text-white truncate">
                    {organization.tradeName || organization.name || 'Apex SuperStore & Electronics'}
                  </span>
                  <span className="text-[10px] text-[#DCF8C6] tabular-nums font-mono shrink-0 ml-1">
                    GSTIN: {organization.gstin}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 2. STORE & FISCAL CONTEXT SECTION (Relocated from topbar/header)          */}
          {/* ========================================================================= */}
          <div className="bg-white rounded-xl border border-[#D1D7DB] p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-[#E9EDEF] pb-2">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-[#075E54]" />
                <h4 className="text-xs font-bold text-[#111B21] uppercase tracking-wider">
                  Store &amp; Fiscal Context
                </h4>
              </div>
              <span className="text-[10px] text-[#075E54] bg-[#DCF8C6] px-2 py-0.5 rounded font-bold border border-[#B3EBA0]/60">
                Active Storefront
              </span>
            </div>

            {/* Context Items Grid */}
            <div className="space-y-2.5">
              {/* 1. Organization */}
              <div className="flex items-start justify-between p-2.5 bg-[#F7F5F2] rounded-lg border border-[#E9EDEF]">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="p-1.5 bg-white rounded-md text-[#075E54] border border-[#D1D7DB] shrink-0 mt-0.5 shadow-2xs">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] text-[#667781] block font-semibold uppercase tracking-wider">Organization</span>
                    <span className="text-xs font-bold text-[#111B21] truncate block">
                      {organization.tradeName || 'Apex SuperStore & Electronics'}
                    </span>
                    <span className="text-[11px] text-[#667781] block truncate">
                      {organization.name}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Store / Branch */}
              <div className="flex items-start justify-between p-2.5 bg-[#F7F5F2] rounded-lg border border-[#E9EDEF] gap-2">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div className="p-1.5 bg-white rounded-md text-[#075E54] border border-[#D1D7DB] shrink-0 mt-0.5 shadow-2xs">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] text-[#667781] block font-semibold uppercase tracking-wider">Store / Branch</span>
                    <span className="text-xs font-bold text-[#111B21] block">
                      {activeBranch.name || 'Indiranagar Flagship'} ({activeBranch.city || 'Bengaluru'})
                    </span>
                    <span className="text-[11px] text-[#667781] block truncate">
                      {activeBranch.address}
                    </span>
                  </div>
                </div>

                {/* Branch Switcher / Assigned Status */}
                {branches.length > 1 && canSwitchBranch ? (
                  <select
                    value={activeBranch.id}
                    onChange={(e) => offlineStore.setActiveBranch(e.target.value)}
                    className="text-[11px] font-semibold text-[#075E54] bg-white border border-[#D1D7DB] rounded px-2 py-1 cursor-pointer hover:border-[#075E54] transition-colors shrink-0 focus:ring-1 focus:ring-[#075E54] focus:outline-none"
                    aria-label="Switch store branch"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span
                    className="text-[10px] font-semibold text-[#667781] bg-white border border-[#D1D7DB] px-2 py-1 rounded inline-flex items-center gap-1 shadow-2xs shrink-0"
                    title="User is tied to this assigned branch"
                  >
                    <Lock className="w-3 h-3 text-[#8696A0]" />
                    <span>Assigned</span>
                  </span>
                )}
              </div>

              {/* 3. Fiscal Year */}
              <div className="flex items-center justify-between p-2.5 bg-[#F7F5F2] rounded-lg border border-[#E9EDEF] gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 bg-white rounded-md text-[#075E54] border border-[#D1D7DB] shrink-0 shadow-2xs">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-[#667781] block font-semibold uppercase tracking-wider">Fiscal Year</span>
                    <span className="text-xs font-bold text-[#075E54] tabular-nums">
                      {fiscalYear || '2026–2027'}
                    </span>
                  </div>
                </div>

                {/* Fiscal Year Switcher */}
                <select
                  value={fiscalYear}
                  onChange={(e) => offlineStore.setFiscalYear(e.target.value)}
                  className="text-[11px] font-semibold text-[#075E54] bg-white border border-[#D1D7DB] rounded px-2 py-1 cursor-pointer hover:border-[#075E54] transition-colors shrink-0 focus:ring-1 focus:ring-[#075E54] focus:outline-none tabular-nums"
                  aria-label="Select fiscal year"
                >
                  <option value="2026–2027">2026–2027</option>
                  <option value="2025–2026">2025–2026</option>
                  <option value="2027–2028">2027–2028</option>
                </select>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 3. SESSION & ACTIVE ROLE */}
          {/* ========================================================================= */}
          <div className="bg-white rounded-xl border border-[#D1D7DB] p-4 shadow-2xs space-y-3">
            {/* Authenticated Session Information */}
            <div className="flex items-center justify-between p-2.5 bg-[#F7F5F2] rounded-lg border border-[#E9EDEF]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#075E54]" />
                <div>
                  <span className="text-[10px] text-[#667781] block font-semibold uppercase tracking-wider">
                    Assigned Role
                  </span>
                  <span className="text-xs font-bold text-[#111B21]">
                    {activeUser.role} &bull; Verified Access
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-[#075E54] bg-[#DCF8C6] px-2 py-0.5 rounded font-bold border border-[#B3EBA0]/60 flex items-center gap-1">
                <Check className="w-3 h-3" />
                Active
              </span>
            </div>

              {/* Sign Out Button */}
              <div className="pt-2 border-t border-[#E9EDEF]">
                {!showSignOutConfirm ? (
                  <button
                    onClick={() => setShowSignOutConfirm(true)}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-2.5 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-rose-600" />
                    <span>Sign Out &amp; Lock Session</span>
                  </button>
                ) : (
                  <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 space-y-2">
                    <p className="text-xs font-bold text-rose-900">
                      Lock terminal and sign out of {activeUser.name}?
                    </p>
                    <p className="text-[11px] text-rose-700 leading-snug">
                      Unsaved shopping cart items remain stored locally. Next user will need PIN or password.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => {
                          setShowSignOutConfirm(false);
                          onClose();
                          onSignOut();
                        }}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold transition-colors cursor-pointer"
                      >
                        Yes, Sign Out
                      </button>
                      <button
                        onClick={() => setShowSignOutConfirm(false)}
                        className="px-3 py-1.5 bg-white border border-rose-300 text-rose-800 hover:bg-rose-100 rounded text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

          {/* ========================================================================= */}
          {/* 3. HELPFUL SHORTCUTS SECTION */}
          {/* ========================================================================= */}
          <div className="bg-white rounded-xl border border-[#D1D7DB] p-4 shadow-2xs space-y-3">
            <h4 className="text-[11px] font-bold text-[#667781] uppercase tracking-wider">
              Helpful Shortcuts
            </h4>

            <div className="grid grid-cols-1 gap-1">
              <button
                onClick={() => setActiveShortcutModal('HELP')}
                className="w-full text-left px-3 py-2 text-xs font-medium text-[#111B21] hover:bg-[#F7F5F2] rounded-lg transition-colors flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <BookOpen className="w-4 h-4 text-[#075E54]" />
                  <span>Help &amp; Documents</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#8696A0] group-hover:text-[#075E54] transition-colors" />
              </button>

              <button
                onClick={() => setActiveShortcutModal('FAQ')}
                className="w-full text-left px-3 py-2 text-xs font-medium text-[#111B21] hover:bg-[#F7F5F2] rounded-lg transition-colors flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <HelpCircle className="w-4 h-4 text-[#075E54]" />
                  <span>FAQs &amp; Help Center</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#8696A0] group-hover:text-[#075E54] transition-colors" />
              </button>

              <button
                onClick={() => setActiveShortcutModal('TUTORIALS')}
                className="w-full text-left px-3 py-2 text-xs font-medium text-[#111B21] hover:bg-[#F7F5F2] rounded-lg transition-colors flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <Video className="w-4 h-4 text-[#075E54]" />
                  <span>Video Tutorials</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#8696A0] group-hover:text-[#075E54] transition-colors" />
              </button>

              <button
                onClick={() => setActiveShortcutModal('EXPLORE')}
                className="w-full text-left px-3 py-2 text-xs font-medium text-[#111B21] hover:bg-[#F7F5F2] rounded-lg transition-colors flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <Compass className="w-4 h-4 text-[#075E54]" />
                  <span>Explore Features</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#8696A0] group-hover:text-[#075E54] transition-colors" />
              </button>

              <button
                onClick={() => setIsAccessibilityModalOpen(true)}
                className="w-full text-left px-3 py-2 text-xs font-medium text-[#111B21] hover:bg-[#F7F5F2] rounded-lg transition-colors flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <Sliders className="w-4 h-4 text-[#075E54]" />
                  <span>Accessibility Preferences</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#8696A0] group-hover:text-[#075E54] transition-colors" />
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 4. NEED ASSISTANCE SECTION */}
          {/* ========================================================================= */}
          <div className="bg-white rounded-xl border border-[#D1D7DB] p-4 shadow-2xs space-y-3">
            <h4 className="text-[11px] font-bold text-[#667781] uppercase tracking-wider">
              Need Assistance?
            </h4>

            <div className="grid grid-cols-1 gap-1">
              <div className="px-3 py-2 text-xs font-medium text-[#111B21] bg-[#F7F5F2] rounded-lg border border-[#D1D7DB] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Phone className="w-4 h-4 text-[#075E54]" />
                  <div>
                    <span className="font-semibold block">Contact Support</span>
                    <span className="text-[11px] text-[#667781] tabular-nums font-mono">
                      +91 80 4125 9900 (Mon–Sat 9AM–8PM)
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard('+918041259900', 'Phone')}
                  className="px-2 py-1 bg-white border border-[#D1D7DB] rounded text-[11px] font-bold text-[#075E54] hover:bg-[#DCF8C6]/50 cursor-pointer"
                >
                  {copiedField === 'Phone' ? 'Copied' : 'Copy'}
                </button>
              </div>

              <div className="px-3 py-2 text-xs font-medium text-[#111B21] bg-[#F7F5F2] rounded-lg border border-[#D1D7DB] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-[#075E54]" />
                  <div>
                    <span className="font-semibold block">Send an Email</span>
                    <span className="text-[11px] text-[#667781] font-mono">
                      billing@apexretail.in
                    </span>
                  </div>
                </div>
                <a
                  href="mailto:billing@apexretail.in"
                  className="px-2 py-1 bg-white border border-[#D1D7DB] rounded text-[11px] font-bold text-[#075E54] hover:bg-[#DCF8C6]/50 cursor-pointer inline-flex items-center gap-1"
                >
                  <span>Mail</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>

              <button
                onClick={() => setActiveShortcutModal('REPORT')}
                className="w-full text-left px-3 py-2 text-xs font-medium text-[#111B21] hover:bg-[#F7F5F2] rounded-lg transition-colors flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Report an Issue</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#8696A0] group-hover:text-[#075E54] transition-colors" />
              </button>

              <button
                onClick={() => {
                  if (onOpenKeyboardShortcuts) {
                    onOpenKeyboardShortcuts();
                  } else {
                    setActiveShortcutModal('SHORTCUTS');
                  }
                }}
                className="w-full text-left px-3 py-2 text-xs font-medium text-[#111B21] hover:bg-[#F7F5F2] rounded-lg transition-colors flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <Keyboard className="w-4 h-4 text-[#075E54]" />
                  <span>Keyboard Shortcuts</span>
                </div>
                <span className="text-[10px] bg-[#F7F5F2] px-1.5 py-0.5 rounded border border-[#D1D7DB] text-[#667781] font-mono">
                  F1 / F2 / Esc
                </span>
              </button>

              <button
                onClick={() => setActiveShortcutModal('TIPS')}
                className="w-full text-left px-3 py-2 text-xs font-medium text-[#111B21] hover:bg-[#F7F5F2] rounded-lg transition-colors flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <Lightbulb className="w-4 h-4 text-[#075E54]" />
                  <span>Tips and Guidance</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#8696A0] group-hover:text-[#075E54] transition-colors" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#F7F5F2] border-t border-[#D1D7DB] flex items-center justify-between text-[11px] text-[#667781] shrink-0">
          <span>SLATE POS Windows Desktop</span>
          <span className="font-semibold text-[#075E54]">v2026.10</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: ACCESSIBILITY PREFERENCES */}
      {/* ========================================================================= */}
      {isAccessibilityModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-sm p-5 space-y-4 font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-[#D1D7DB]">
              <h3 className="text-sm font-bold text-[#111B21] flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#075E54]" />
                <span>Accessibility Preferences</span>
              </h3>
              <button
                onClick={() => setIsAccessibilityModalOpen(false)}
                className="text-[#667781] hover:text-[#111B21] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#111B21] mb-1">Table Row Density</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setTableDensity('compact')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                      tableDensity === 'compact'
                        ? 'bg-[#DCF8C6]/50 border-[#075E54] text-[#075E54]'
                        : 'border-[#D1D7DB] text-[#3B4A54]'
                    }`}
                  >
                    Compact (Default)
                  </button>
                  <button
                    onClick={() => setTableDensity('comfortable')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                      tableDensity === 'comfortable'
                        ? 'bg-[#DCF8C6]/50 border-[#075E54] text-[#075E54]'
                        : 'border-[#D1D7DB] text-[#3B4A54]'
                    }`}
                  >
                    Comfortable
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#111B21] mb-1">Contrast Mode</label>
                <button
                  onClick={() => setHighContrast(!highContrast)}
                  className={`w-full py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-between cursor-pointer ${
                    highContrast
                      ? 'bg-[#075E54] text-white border-[#075E54]'
                      : 'border-[#D1D7DB] text-[#3B4A54]'
                  }`}
                >
                  <span>High Contrast Borders</span>
                  <span>{highContrast ? 'Enabled' : 'Disabled'}</span>
                </button>
              </div>

              <div className="pt-2 border-t border-[#E9EDEF]">
                <button
                  onClick={() => setIsAccessibilityModalOpen(false)}
                  className="w-full py-2 bg-[#075E54] hover:bg-[#128C7E] text-white rounded-lg font-bold text-xs cursor-pointer shadow-2xs"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SHORTCUTS / HELP / FAQS / TUTORIALS / REPORT ISSUE */}
      {/* ========================================================================= */}
      {activeShortcutModal && (
        <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-lg p-5 space-y-4 font-sans max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#D1D7DB] shrink-0">
              <h3 className="text-sm font-bold text-[#111B21] flex items-center gap-2">
                {activeShortcutModal === 'HELP' && (
                  <>
                    <BookOpen className="w-4 h-4 text-[#075E54]" />
                    <span>Help &amp; Documents</span>
                  </>
                )}
                {activeShortcutModal === 'FAQ' && (
                  <>
                    <HelpCircle className="w-4 h-4 text-[#075E54]" />
                    <span>Frequently Asked Questions</span>
                  </>
                )}
                {activeShortcutModal === 'TUTORIALS' && (
                  <>
                    <Video className="w-4 h-4 text-[#075E54]" />
                    <span>Video &amp; Workflow Tutorials</span>
                  </>
                )}
                {activeShortcutModal === 'EXPLORE' && (
                  <>
                    <Compass className="w-4 h-4 text-[#075E54]" />
                    <span>Explore SLATE POS Modules</span>
                  </>
                )}
                {activeShortcutModal === 'SHORTCUTS' && (
                  <>
                    <Keyboard className="w-4 h-4 text-[#075E54]" />
                    <span>Keyboard Shortcuts Reference</span>
                  </>
                )}
                {activeShortcutModal === 'REPORT' && (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Report an Issue / Feedback</span>
                  </>
                )}
                {activeShortcutModal === 'TIPS' && (
                  <>
                    <Lightbulb className="w-4 h-4 text-[#075E54]" />
                    <span>Retail Tips &amp; Guidance</span>
                  </>
                )}
              </h3>
              <button
                onClick={() => setActiveShortcutModal(null)}
                className="text-[#667781] hover:text-[#111B21] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 text-xs text-[#3B4A54]">
              {/* HELP & DOCUMENTS */}
              {activeShortcutModal === 'HELP' && (
                <div className="space-y-3">
                  <div className="p-3 bg-[#F7F5F2] rounded-lg border border-[#D1D7DB]">
                    <h5 className="font-bold text-[#111B21] mb-1">1. Invoicing &amp; Quotations</h5>
                    <p className="text-[11px] leading-relaxed">
                      Quotations can be created with 14 status options and converted into tax invoices with one click. Invoices feature split-preview master-detail views, GST 3-slab breakdown, and instant thermal receipt printing.
                    </p>
                  </div>
                  <div className="p-3 bg-[#F7F5F2] rounded-lg border border-[#D1D7DB]">
                    <h5 className="font-bold text-[#111B21] mb-1">2. Offline Checkout &amp; Outbox Engine</h5>
                    <p className="text-[11px] leading-relaxed">
                      Counter billing operates fully offline without internet dependency. Sales are saved locally and synced automatically when the terminal reconnects.
                    </p>
                  </div>
                  <div className="p-3 bg-[#F7F5F2] rounded-lg border border-[#D1D7DB]">
                    <h5 className="font-bold text-[#111B21] mb-1">3. Multi-Branch Tenant Isolation</h5>
                    <p className="text-[11px] leading-relaxed">
                      Each outlet maintains independent cash registers, stock movements, and user sessions under the central GSTIN entity.
                    </p>
                  </div>
                </div>
              )}

              {/* FAQS */}
              {activeShortcutModal === 'FAQ' && (
                <div className="space-y-2.5">
                  <div className="p-2.5 border border-[#E9EDEF] rounded-lg">
                    <span className="font-bold text-[#111B21] block">Q: How do I print thermal POS receipts?</span>
                    <span className="text-[11px] text-[#667781] mt-0.5 block leading-normal">
                      Press F4 on the POS checkout screen to trigger cash tender, or select "Print POS Receipt" from the invoice actions menu.
                    </span>
                  </div>
                  <div className="p-2.5 border border-[#E9EDEF] rounded-lg">
                    <span className="font-bold text-[#111B21] block">Q: Can I apply customer credit limits?</span>
                    <span className="text-[11px] text-[#667781] mt-0.5 block leading-normal">
                      Yes, customer accounts support custom credit limits and aging reports (1–15, 16–30, 31–45, and &gt;45 days overdue).
                    </span>
                  </div>
                  <div className="p-2.5 border border-[#E9EDEF] rounded-lg">
                    <span className="font-bold text-[#111B21] block">Q: How does offline synchronization work?</span>
                    <span className="text-[11px] text-[#667781] mt-0.5 block leading-normal">
                      The outbox queue persists pending sales in local storage. Once online, idempotency keys ensure no duplicate entries are submitted.
                    </span>
                  </div>
                </div>
              )}

              {/* VIDEO TUTORIALS */}
              {activeShortcutModal === 'TUTORIALS' && (
                <div className="space-y-2">
                  <div className="p-3 bg-[#F7F5F2] rounded-lg border border-[#D1D7DB] flex items-center justify-between">
                    <div>
                      <div className="font-bold text-[#111B21]">Fast Counter Billing (3 min)</div>
                      <div className="text-[11px] text-[#667781]">Barcode scanner setup and tender workflow</div>
                    </div>
                    <span className="text-[10px] bg-[#DCF8C6] text-[#075E54] font-bold px-2 py-0.5 rounded">
                      Guide Ready
                    </span>
                  </div>
                  <div className="p-3 bg-[#F7F5F2] rounded-lg border border-[#D1D7DB] flex items-center justify-between">
                    <div>
                      <div className="font-bold text-[#111B21]">Managing Quotations &amp; Conversions</div>
                      <div className="text-[11px] text-[#667781]">Drafting proposals and converting to invoice</div>
                    </div>
                    <span className="text-[10px] bg-[#DCF8C6] text-[#075E54] font-bold px-2 py-0.5 rounded">
                      Guide Ready
                    </span>
                  </div>
                  <div className="p-3 bg-[#F7F5F2] rounded-lg border border-[#D1D7DB] flex items-center justify-between">
                    <div>
                      <div className="font-bold text-[#111B21]">GSTR-1 &amp; GSTR-3B Tax Filing Overview</div>
                      <div className="text-[11px] text-[#667781]">Exporting taxable ledgers and claimable ITC</div>
                    </div>
                    <span className="text-[10px] bg-[#DCF8C6] text-[#075E54] font-bold px-2 py-0.5 rounded">
                      Guide Ready
                    </span>
                  </div>
                </div>
              )}

              {/* EXPLORE MODULES */}
              {activeShortcutModal === 'EXPLORE' && (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'POS Checkout', view: 'POS', desc: 'Scan and bill' },
                    { label: 'Quotes', view: 'QUOTES', desc: 'Proposals & estimates' },
                    { label: 'Invoices', view: 'SALES', desc: 'Sales ledger & returns' },
                    { label: 'Customers', view: 'CUSTOMERS', desc: 'Receivables & ledgers' },
                    { label: 'Suppliers', view: 'SUPPLIERS', desc: 'Vendor payables' },
                    { label: 'Inventory', view: 'PRODUCTS', desc: 'Stock movements' },
                    { label: 'Expenses', view: 'EXPENSES', desc: 'GST ITC claims' },
                    { label: 'Coupons', view: 'COUPONS', desc: 'Vouchers & discounts' },
                  ].map((m) => (
                    <button
                      key={m.label}
                      onClick={() => {
                        setActiveShortcutModal(null);
                        onClose();
                        onNavigateToView(m.view as ActiveView);
                      }}
                      className="p-2.5 rounded-lg border border-[#D1D7DB] hover:border-[#075E54] hover:bg-[#F7F5F2] text-left transition-all cursor-pointer"
                    >
                      <div className="font-bold text-xs text-[#111B21]">{m.label}</div>
                      <div className="text-[10px] text-[#667781] mt-0.5">{m.desc}</div>
                    </button>
                  ))}
                </div>
              )}

              {/* KEYBOARD SHORTCUTS */}
              {activeShortcutModal === 'SHORTCUTS' && (
                <div className="space-y-2">
                  {[
                    { key: 'F1', desc: 'Open Quick Action Menu' },
                    { key: 'F2', desc: 'Navigate directly to POS Checkout' },
                    { key: 'Ctrl + L', desc: 'Lock Terminal / Switch Cashier Shift' },
                    { key: 'Esc', desc: 'Close open modal, preview, or drawer' },
                    { key: 'Enter', desc: 'Confirm search or modal action' },
                  ].map((s) => (
                    <div
                      key={s.key}
                      className="flex items-center justify-between p-2 rounded bg-[#F7F5F2] border border-[#E9EDEF]"
                    >
                      <span className="text-xs text-[#111B21]">{s.desc}</span>
                      <kbd className="px-2 py-0.5 bg-white border border-[#D1D7DB] rounded text-[11px] font-mono font-bold text-[#075E54] shadow-2xs">
                        {s.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              )}

              {/* REPORT ISSUE */}
              {activeShortcutModal === 'REPORT' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    alert('Thank you! Your feedback has been registered and logged for our support engineering team.');
                    setActiveShortcutModal(null);
                  }}
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-xs font-semibold text-[#111B21] mb-1">Issue Topic</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Barcode scanner speed or printer formatting"
                      className="w-full p-2 border border-[#D1D7DB] rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#111B21] mb-1">Description</label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Please describe what occurred..."
                      className="w-full p-2 border border-[#D1D7DB] rounded text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-[#075E54] text-white rounded font-bold text-xs hover:bg-[#128C7E] cursor-pointer"
                  >
                    Submit Issue Report
                  </button>
                </form>
              )}

              {/* TIPS AND GUIDANCE */}
              {activeShortcutModal === 'TIPS' && (
                <div className="space-y-2.5">
                  <div className="p-3 bg-[#DCF8C6]/40 rounded-lg border border-[#B3EBA0]">
                    <span className="font-bold text-[#075E54] block">Tip 1: Day-End Cash Balancing</span>
                    <span className="text-[11px] text-[#3B4A54] mt-0.5 block">
                      Always compare cash in drawer with the "Sales &amp; Cash Flow" dashboard before closing the shift.
                    </span>
                  </div>
                  <div className="p-3 bg-[#F7F5F2] rounded-lg border border-[#D1D7DB]">
                    <span className="font-bold text-[#111B21] block">Tip 2: Instant Quotation Sharing</span>
                    <span className="text-[11px] text-[#667781] mt-0.5 block">
                      Use the "Share" action on Quotes to instantly copy a client summary for WhatsApp or email dispatch.
                    </span>
                  </div>
                  <div className="p-3 bg-[#F7F5F2] rounded-lg border border-[#D1D7DB]">
                    <span className="font-bold text-[#111B21] block">Tip 3: GSTR-3B Input Credit</span>
                    <span className="text-[11px] text-[#667781] mt-0.5 block">
                      Record all supplier transport and utility bills under Expenses to automatically compute your claimable GST ITC.
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#D1D7DB] flex justify-end shrink-0">
              <button
                onClick={() => setActiveShortcutModal(null)}
                className="px-4 py-1.5 bg-[#075E54] text-white rounded-lg text-xs font-bold hover:bg-[#128C7E] cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
