/**
 * SLATE POS — Navigation Sidebar
 * Primary Venice Blue (#16587B), active item Rock Blue (#84B3CE / #0F2D3D), text Merino (#F5EEDD), grouped strictly into:
 * MAIN, SALES, PURCHASE, ACCOUNTS, SETTING
 *
 * - Clean sidebar header without Navigation label, Plus icon, or Bell icon
 * - Sidebar-only removal of brand logo/wordmark and user profile section
 * - Independently scrollable navigation items (min-h-0 flex-1 overflow-y-auto)
 * - Role-based navigation filtering via canAccessView()
 * - Responsive desktop collapse/expand & mobile slide-over drawer
 */

import React, { useState, useEffect, useRef } from 'react';
import { offlineStore } from '../../lib/offlineStore';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  Building2,
  Lock,
} from 'lucide-react';
import { canAccessView, subscribeToRoleNavigation } from '../../lib/roleNavigation';
import { canSwitchOrgBranches } from '../../lib/permissions';
import { SIDEBAR_NAVIGATION_GROUPS } from '../../lib/navigationRoutes';
import { getViewIcon } from './viewIcons';

export type ActiveView =
  | 'DASHBOARD'
  | 'BANKING'
  | 'CUSTOMERS'
  | 'POS'
  | 'QUOTES'
  | 'SALES'
  | 'PAYMENTS'
  | 'CREDIT_NOTES'
  | 'SALES_RETURNS'
  | 'CHALLANS'
  | 'SUPPLIERS'
  | 'PURCHASE_ORDERS'
  | 'PURCHASES'
  | 'PURCHASE_PAYMENTS'
  | 'DEBIT_NOTES'
  | 'EXPENSES'
  | 'PRODUCTS'
  | 'INVENTORY'
  | 'JOURNAL'
  | 'BUDGETS'
  | 'BULK_UPDATES'
  | 'CHART_OF_ACCOUNTS'
  | 'TRANSACTIONS'
  | 'REPORTS'
  | 'REPORT_PL'
  | 'REPORT_BS'
  | 'REPORT_CF'
  | 'REPORT_TB'
  | 'REPORT_GL'
  | 'REPORT_AR'
  | 'REPORT_AP'
  | 'REPORT_GST'
  | 'REPORT_AUDIT'
  | 'SETTINGS'
  | 'SETTINGS_BRANCHES'
  | 'SETTINGS_FISCAL'
  | 'STAFF'
  | 'SUBSCRIPTIONS'
  | 'SYNC';

export interface SidebarProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeUser, setActiveUser] = useState(offlineStore.getActiveUser());
  const [activeBranchId, setActiveBranchId] = useState(offlineStore.getActiveBranchId());
  const [isMobileBuildingOpen, setIsMobileBuildingOpen] = useState(false);

  const mobileBuildingDropdownRef = useRef<HTMLDivElement>(null);

  const [, setNavRevision] = useState(0);

  useEffect(() => {
    const unsubStore = offlineStore.subscribe(() => {
      setActiveUser(offlineStore.getActiveUser());
      setActiveBranchId(offlineStore.getActiveBranchId());
    });
    const unsubNav = subscribeToRoleNavigation(() => {
      setNavRevision((r) => r + 1);
    });
    return () => {
      unsubStore();
      unsubNav();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (mobileBuildingDropdownRef.current && !mobileBuildingDropdownRef.current.contains(target)) {
        setIsMobileBuildingOpen(false);
      }
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileBuildingOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const branches = offlineStore.getBranches();
  const activeBranch = branches.find((b) => b.id === activeBranchId) || branches[0];
  const canSwitchBranch = branches.length > 1 && canSwitchOrgBranches(activeUser);

  const handleItemClick = (id: ActiveView) => {
    onSelectView(id);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const renderNavContent = (isMobile: boolean = false) => (
    <nav className="space-y-4" aria-label="Workspace Modules">
      {SIDEBAR_NAVIGATION_GROUPS.map((group) => {
        const visibleItems = group.items.filter((item) =>
          canAccessView(activeUser.role, item.id)
        );

        if (visibleItems.length === 0) return null;

        return (
          <div key={group.title} className="space-y-1">
            {(!collapsed || isMobile) && (
              <div className="px-3 pt-1 pb-0.5 text-[10px] font-bold text-[#F5EEDD]/75 uppercase tracking-wider">
                {group.title}
              </div>
            )}
            {visibleItems.map((item, idx) => {
              const isActive = activeView === item.id;
              return (
                <div
                  key={item.id}
                  className={`relative group ${item.spacerBefore && idx > 0 ? 'mt-4 pt-1' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => handleItemClick(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs transition-colors cursor-pointer ${
                      isMobile ? 'min-h-[42px]' : ''
                    } ${
                      collapsed && !isMobile ? 'justify-center px-2' : ''
                    } ${
                      isActive
                        ? 'bg-[#84B3CE] text-[#0F2D3D] shadow-xs font-semibold'
                        : 'text-[#F5EEDD] hover:bg-[#124866] hover:text-white'
                    }`}
                    title={collapsed && !isMobile ? item.label : undefined}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <div className={`flex items-center gap-3 min-w-0 ${collapsed && !isMobile ? 'justify-center' : 'truncate'}`}>
                      <span className={isActive ? 'text-[#0F2D3D]' : 'text-[#84B3CE]'}>
                        {getViewIcon(item.id, 'w-4 h-4 shrink-0')}
                      </span>
                      {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
                    </div>

                    {(!collapsed || isMobile) && item.shortcut && (
                      <div className="flex items-center gap-1.5 ml-2 shrink-0">
                        <kbd
                          className={`text-[10px] tabular-nums px-1 py-0.2 rounded ${
                            isActive
                              ? 'bg-[#16587B]/15 text-[#0F2D3D] border border-[#16587B]/25'
                              : 'bg-[#0F405B] text-[#F5EEDD]/80 border border-[#124866]'
                          }`}
                        >
                          {item.shortcut}
                        </kbd>
                      </div>
                    )}
                  </button>

                  {/* Desktop Tooltip for collapsed mode */}
                  {collapsed && !isMobile && (
                    <div className="hidden group-hover:flex absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-[#111B21] text-white text-xs font-medium rounded shadow-lg whitespace-nowrap z-50 pointer-events-none items-center gap-1.5">
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <kbd className="text-[9px] tabular-nums px-1 py-0.2 bg-white/20 text-white rounded">
                          {item.shortcut}
                        </kbd>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. DESKTOP & TABLET PERMANENT SIDEBAR (Clean, No Logo/Profile/Bell/Plus) */}
      {/* ========================================================================= */}
      <aside
        className={`hidden md:flex bg-[#16587B] text-[#F5EEDD] flex-col h-full border-r border-[#0F405B] select-none shrink-0 transition-[width] duration-200 ease-in-out relative ${
          collapsed ? 'w-16' : 'w-52 lg:w-60'
        }`}
      >
        {/* SCROLLABLE NAVIGATION CONTAINER */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar px-2 pt-3 pb-2 space-y-4">
          {renderNavContent(false)}
        </div>

        {/* SLIM FOOTER: Collapse / Expand Toggle Only */}
        <div className="border-t border-[#124866]/80 bg-[#0F405B]/85 shrink-0 pb-[env(safe-area-inset-bottom,0px)]">
          <div className="p-2 flex items-center justify-center">
            {!collapsed ? (
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="w-full py-1.5 px-2.5 rounded-md bg-[#124866] hover:bg-[#0F405B] text-[#F5EEDD] hover:text-white text-xs font-medium transition-colors cursor-pointer shadow-2xs flex items-center justify-between border border-[#84B3CE]/25"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <span className="truncate">Collapse Menu</span>
                <ChevronLeft className="w-4 h-4 text-[#84B3CE] shrink-0" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="p-1.5 rounded-md bg-[#124866] hover:bg-[#0F405B] text-[#F5EEDD] transition-colors cursor-pointer border border-[#84B3CE]/25"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                <ChevronRight className="w-4 h-4 text-[#84B3CE]" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. MOBILE DRAWER NAVIGATION (Visible on < 768px when toggled)             */}
      {/* ========================================================================= */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop Overlay */}
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-[#111B21]/70 backdrop-blur-2xs transition-opacity animate-in fade-in duration-150"
          />

          {/* Slide-over Drawer Panel */}
          <div className="relative w-72 max-w-[85vw] bg-[#16587B] text-[#F5EEDD] h-full flex flex-col shadow-2xl z-10 animate-in slide-in-from-left duration-200 pb-[env(safe-area-inset-bottom,0px)]">
            {/* Slim Drawer Top Close Strip (No Navigation title / icons / logo / profile) */}
            <div className="h-11 px-3 flex items-center justify-end border-b border-[#124866]/80 shrink-0 bg-[#16587B]">
              <button
                type="button"
                onClick={onCloseMobile}
                className="p-2 rounded-lg text-[#F5EEDD]/85 hover:text-white hover:bg-[#124866] transition-colors cursor-pointer"
                aria-label="Close drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* SCROLLABLE NAV ITEMS */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar p-3 space-y-4">
              {renderNavContent(true)}
            </div>

            {/* FIXED DRAWER FOOTER: Branch Switcher & Close */}
            <div
              className="border-t border-[#124866]/80 bg-[#0F405B]/85 shrink-0 flex flex-col relative"
              ref={mobileBuildingDropdownRef}
            >
              <div className="p-2.5 flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  {canSwitchBranch ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsMobileBuildingOpen(!isMobileBuildingOpen)}
                        className="w-full flex items-center justify-between gap-1.5 py-2 px-2.5 rounded-md bg-[#124866] hover:bg-[#0F405B] text-[#F5EEDD] text-xs font-semibold transition-colors cursor-pointer border border-[#84B3CE]/25 truncate"
                        aria-label="Select building or retail branch"
                      >
                        <div className="flex items-center gap-1.5 min-w-0 truncate">
                          <Building2 className="w-3.5 h-3.5 text-[#84B3CE] shrink-0" />
                          <span className="truncate text-left text-xs">{activeBranch?.name || 'Assigned Branch'}</span>
                        </div>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-[#F5EEDD]/75 shrink-0 transition-transform ${
                            isMobileBuildingOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      {isMobileBuildingOpen && (
                        <div className="absolute left-0 bottom-full mb-1.5 w-full bg-[#0F2D3D] border border-[#16587B] rounded-lg shadow-2xl py-1.5 z-50">
                          <div className="px-3 py-1 text-[10px] font-bold text-[#84B3CE] uppercase tracking-wider border-b border-[#16587B]/60">
                            Retail Buildings &amp; Branches
                          </div>
                          <div className="max-h-48 overflow-y-auto py-1">
                            {branches.map((b) => (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => {
                                  offlineStore.setActiveBranch(b.id);
                                  setIsMobileBuildingOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-[#124866] cursor-pointer ${
                                  b.id === activeBranchId
                                    ? 'bg-[#16587B] text-[#F5EEDD] font-bold'
                                    : 'text-[#F5EEDD]/90'
                                }`}
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="truncate font-medium">{b.name}</div>
                                  <div className="text-[10px] text-[#84B3CE] truncate">
                                    {b.code} · {b.city}
                                  </div>
                                </div>
                                {b.id === activeBranchId && (
                                  <Check className="w-3.5 h-3.5 text-[#84B3CE]" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div
                      className="w-full flex items-center justify-between gap-1.5 py-2 px-2.5 rounded-md bg-[#124866]/80 text-[#F5EEDD] text-xs font-semibold border border-[#84B3CE]/25 truncate"
                      title="Assigned branch"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 truncate">
                        <Building2 className="w-3.5 h-3.5 text-[#84B3CE] shrink-0" />
                        <span className="truncate text-left text-xs">{activeBranch?.name || 'Assigned Branch'}</span>
                      </div>
                      <Lock className="w-3 h-3 text-[#F5EEDD]/70 shrink-0" />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onCloseMobile}
                  className="shrink-0 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md bg-[#124866] hover:bg-[#0F405B] text-[#F5EEDD] text-xs font-semibold transition-colors cursor-pointer border border-[#84B3CE]/25"
                  aria-label="Collapse Drawer"
                >
                  <ChevronLeft className="w-4 h-4 text-[#84B3CE]" />
                  <span>Collapse</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
