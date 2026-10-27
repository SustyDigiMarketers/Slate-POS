/**
 * SLATE POS — Navigation Sidebar
 * Primary dark green (#075E54), selected item (#128C7E), grouped into Main, Sales, Operations
 *
 * Requirements:
 * - Fixed Brand Header
 * - Independently scrollable navigation items (min-h-0 flex-1 overflow-y-auto)
 * - No visible Store Status section
 * - Expanded sidebar: Collapse control displayed at bottom beside Buildings selector
 * - Collapsed sidebar: Hide Buildings icon/control completely, show ONLY the expand control
 * - Responsive mobile drawer with backdrop, scrollable nav, and dismiss controls
 */

import React, { useState, useEffect, useRef } from 'react';
import { offlineStore } from '../../lib/offlineStore';
import {
  LayoutDashboard,
  Users,
  Package,
  FileSpreadsheet,
  Receipt,
  CreditCard,
  Truck,
  Wallet,
  ShoppingCart,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  Ticket,
  Building2,
  Settings,
  Plus,
  Bell,
} from 'lucide-react';
import { INITIAL_BRANCHES } from '../../lib/initialData';
import { canAccessView, subscribeToRoleNavigation } from '../../lib/roleNavigation';

export type ActiveView =
  | 'DASHBOARD'
  | 'CUSTOMERS'
  | 'SUPPLIERS'
  | 'PRODUCTS'
  | 'QUOTES'
  | 'SALES'
  | 'COUPONS'
  | 'SUBSCRIPTIONS'
  | 'CHALLANS'
  | 'PAYMENTS'
  | 'POS'
  | 'EXPENSES'
  | 'INVENTORY'
  | 'REPORTS'
  | 'STAFF'
  | 'SETTINGS'
  | 'SYNC';

export interface SidebarProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onOpenQuickCreate?: () => void;
  onOpenProfile?: () => void;
  unreadCount?: number;
  notifications?: Array<{ id: string; title: string; desc: string; time: string }>;
  onDismissAllNotifications?: () => void;
}

interface NavItem {
  id: ActiveView;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  badge?: number | string;
  restrictedForCashier?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  isMobileOpen = false,
  onCloseMobile,
  onOpenQuickCreate,
  onOpenProfile,
  unreadCount = 0,
  notifications = [],
  onDismissAllNotifications,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeUser, setActiveUser] = useState(offlineStore.getActiveUser());
  const [activeBranchId, setActiveBranchId] = useState(offlineStore.getActiveBranchId());
  const [isBuildingDropdownOpen, setIsBuildingDropdownOpen] = useState(false);
  const [isMobileBuildingOpen, setIsMobileBuildingOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const buildingDropdownRef = useRef<HTMLDivElement>(null);
  const mobileBuildingDropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

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
      if (buildingDropdownRef.current && !buildingDropdownRef.current.contains(target)) {
        setIsBuildingDropdownOpen(false);
      }
      if (mobileBuildingDropdownRef.current && !mobileBuildingDropdownRef.current.contains(target)) {
        setIsMobileBuildingOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(target)) {
        setIsNotificationOpen(false);
      }
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsBuildingDropdownOpen(false);
        setIsMobileBuildingOpen(false);
        setIsNotificationOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const activeBranch =
    INITIAL_BRANCHES.find((b) => b.id === activeBranchId) || INITIAL_BRANCHES[0];

  const isCashier = activeUser.role === 'CASHIER';

  const navGroups: { title: string; items: NavItem[] }[] = [
    {
      title: 'Main',
      items: [
        {
          id: 'DASHBOARD',
          label: 'Home',
          icon: <LayoutDashboard className="w-4 h-4 shrink-0" />,
          restrictedForCashier: true,
        },
        {
          id: 'CUSTOMERS',
          label: 'Customers',
          icon: <Users className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'SUPPLIERS',
          label: 'Suppliers',
          icon: <Building2 className="w-4 h-4 shrink-0" />,
          restrictedForCashier: true,
        },
        {
          id: 'PRODUCTS',
          label: 'Product Catalogue',
          icon: <Package className="w-4 h-4 shrink-0" />,
        },
      ],
    },
    {
      title: 'Sales',
      items: [
        {
          id: 'POS',
          label: 'POS Checkout',
          icon: <ShoppingCart className="w-4 h-4 shrink-0" />,
          shortcut: 'F2',
        },
        {
          id: 'QUOTES',
          label: 'Quotes',
          icon: <FileSpreadsheet className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'SALES',
          label: 'Invoices',
          icon: <Receipt className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'COUPONS',
          label: 'Coupons',
          icon: <Ticket className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'CHALLANS',
          label: 'Delivery Challans',
          icon: <Truck className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'PAYMENTS',
          label: 'Payments Received',
          icon: <Wallet className="w-4 h-4 shrink-0" />,
        },
      ],
    },
    {
      title: 'Operations',
      items: [
        {
          id: 'EXPENSES',
          label: 'Operating Expenses',
          icon: <Wallet className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'REPORTS',
          label: 'Reports & Analytics',
          icon: <BarChart3 className="w-4 h-4 shrink-0" />,
        },
      ],
    },
    {
      title: 'Administration',
      items: [
        {
          id: 'SETTINGS',
          label: 'Settings Portal',
          icon: <Settings className="w-4 h-4 shrink-0" />,
        },
      ],
    },
  ];

  const handleItemClick = (id: ActiveView) => {
    onSelectView(id);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const renderNavContent = (isMobile: boolean = false) => (
    <nav className="space-y-4">
      {navGroups.map((group) => {
        const visibleItems = group.items.filter((item) =>
          canAccessView(activeUser.role, item.id)
        );

        if (visibleItems.length === 0) return null;

        return (
          <div key={group.title} className="space-y-1">
            {(!collapsed || isMobile) && (
              <div className="px-3 pt-1 pb-0.5 text-[10px] font-bold text-[#A4B5BD] uppercase tracking-wider">
                {group.title}
              </div>
            )}
            {visibleItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <div key={item.id} className="relative group">
                  <button
                    onClick={() => handleItemClick(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs transition-colors cursor-pointer ${
                      isMobile ? 'min-h-[42px]' : ''
                    } ${
                      isActive
                        ? 'bg-[#DCF8C6] text-[#075E54] shadow-xs font-semibold'
                        : 'text-[#E9EDEF] hover:bg-[#064E46] hover:text-white'
                    }`}
                    title={collapsed && !isMobile ? item.label : undefined}
                    aria-label={item.label}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <span className={isActive ? 'text-[#075E54]' : 'text-[#A4B5BD]'}>
                        {item.icon}
                      </span>
                      {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
                    </div>

                    {(!collapsed || isMobile) && (
                      <div className="flex items-center gap-1.5 ml-2">
                        {item.shortcut && (
                          <kbd
                            className={`text-[10px] tabular-nums px-1 py-0.2 rounded ${
                              isActive
                                ? 'bg-[#075E54]/10 text-[#075E54] border border-[#075E54]/20'
                                : 'bg-[#054C44] text-[#A4B5BD] border border-[#064E46]'
                            }`}
                          >
                            {item.shortcut}
                          </kbd>
                        )}
                        {item.badge !== undefined && (
                          <span
                            className={`text-[10px] tabular-nums px-1.5 py-0.2 font-bold rounded ${
                              isActive
                                ? 'bg-[#075E54] text-[#DCF8C6]'
                                : 'bg-[#DCF8C6] text-[#075E54]'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
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
                      {item.badge !== undefined && (
                        <span className="text-[9px] tabular-nums px-1 py-0.2 bg-[#DCF8C6] text-[#075E54] font-bold rounded">
                          {item.badge}
                        </span>
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
      {/* 1. DESKTOP & TABLET PERMANENT SIDEBAR */}
      {/* ========================================================================= */}
      <aside
        className={`hidden md:flex bg-[#075E54] text-white flex-col h-full border-r border-[#054C44] select-none shrink-0 transition-[width] duration-200 ease-in-out relative ${
          collapsed ? 'w-16' : 'w-52 lg:w-60'
        }`}
      >
        {/* FIXED HEADER: Logo, Brand & Action Controls (Plus & Notifications) */}
        <div className="h-14 px-3 flex items-center justify-between border-b border-[#064E46]/80 shrink-0 bg-[#075E54] z-20 relative">
          <div className="flex items-center gap-2 overflow-hidden min-w-0">
            <img
              src="/src/assets/images/slate_pos_symbol_1791618547129.jpg"
              alt="SLATE POS"
              className="w-7 h-7 rounded object-cover shadow-xs shrink-0"
              title="SLATE POS"
            />
            {!collapsed && (
              <div className="min-w-0">
                <div className="font-bold text-white text-sm tracking-tight leading-none truncate">
                  SLATE POS
                </div>
                <div className="text-[10px] text-[#A4B5BD] tabular-nums mt-0.5 truncate">
                  Offline Desktop
                </div>
              </div>
            )}
          </div>

          {/* Header Action Icons (Tablet & Desktop): Plus Quick-Create & Notifications */}
          {!collapsed ? (
            <div className="flex items-center gap-1 shrink-0">
              {/* Plus quick-create icon */}
              <button
                onClick={onOpenQuickCreate}
                className="w-7 h-7 rounded-md bg-[#064E46] hover:bg-[#128C7E] text-white flex items-center justify-center transition-colors cursor-pointer border border-[#0A6C61] shadow-2xs focus-visible:ring-2 focus-visible:ring-[#DCF8C6]"
                title="Quick Create (F1)"
                aria-label="Quick Create"
              >
                <Plus className="w-4 h-4 text-white stroke-[2.5]" />
              </button>

              {/* Notifications Icon with Popover */}
              <div className="relative" ref={notificationRef}>
                <button
                  onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                  className="w-7 h-7 rounded-md bg-[#064E46] hover:bg-[#128C7E] text-[#E9EDEF] hover:text-white flex items-center justify-center transition-colors relative cursor-pointer border border-[#0A6C61] shadow-2xs focus-visible:ring-2 focus-visible:ring-[#DCF8C6]"
                  title="Notifications & Alerts"
                  aria-label="Notifications"
                >
                  <Bell className="w-3.5 h-3.5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#DCF8C6] ring-2 ring-[#075E54]" />
                  )}
                </button>

                {isNotificationOpen && (
                  <div className="absolute left-0 top-full mt-2 w-72 sm:w-80 bg-white border border-[#D1D7DB] rounded-lg shadow-2xl py-2 z-50 text-[#111B21] animate-in fade-in duration-100">
                    <div className="px-3.5 py-1.5 flex items-center justify-between border-b border-[#E9EDEF]">
                      <span className="text-xs font-bold text-[#111B21]">System Notifications</span>
                      {unreadCount > 0 && (
                        <span className="text-[10px] bg-[#DCF8C6] text-[#075E54] font-bold px-1.5 py-0.2 rounded">
                          {unreadCount} New
                        </span>
                      )}
                    </div>
                    <div className="max-h-60 overflow-y-auto divide-y divide-[#E9EDEF]">
                      {notifications.length === 0 ? (
                        <div className="p-4 text-center text-xs text-[#8696A0]">No notifications</div>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            className="p-3 hover:bg-[#F7F5F2] transition-colors cursor-pointer"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[#111B21]">{n.title}</span>
                              <span className="text-[10px] text-[#8696A0]">{n.time}</span>
                            </div>
                            <p className="text-[11px] text-[#667781] mt-0.5">{n.desc}</p>
                          </div>
                        ))
                      )}
                    </div>
                    {notifications.length > 0 && onDismissAllNotifications && (
                      <div className="p-2 border-t border-[#E9EDEF] bg-[#F7F5F2] text-center">
                        <button
                          onClick={() => {
                            onDismissAllNotifications();
                            setIsNotificationOpen(false);
                          }}
                          className="text-[11px] text-[#075E54] font-bold hover:underline cursor-pointer"
                        >
                          Dismiss all notifications
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Collapsed mode header: Display icons only with accessible tooltips */
            <div className="flex items-center gap-1">
              <button
                onClick={onOpenQuickCreate}
                className="w-6 h-6 rounded-md bg-[#064E46] hover:bg-[#128C7E] text-white flex items-center justify-center transition-colors cursor-pointer border border-[#0A6C61]"
                title="Quick Create (F1)"
                aria-label="Quick Create"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>

              <div className="relative" ref={notificationRef}>
                <button
                  onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                  className="w-6 h-6 rounded-md bg-[#064E46] hover:bg-[#128C7E] text-[#E9EDEF] hover:text-white flex items-center justify-center transition-colors relative cursor-pointer border border-[#0A6C61]"
                  title="Notifications & Alerts"
                  aria-label="Notifications"
                >
                  <Bell className="w-3 h-3" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#DCF8C6] ring-1.5 ring-[#075E54]" />
                  )}
                </button>

                {isNotificationOpen && (
                  <div className="absolute left-full top-0 ml-2 w-72 sm:w-80 bg-white border border-[#D1D7DB] rounded-lg shadow-2xl py-2 z-50 text-[#111B21] animate-in fade-in duration-100">
                    <div className="px-3.5 py-1.5 flex items-center justify-between border-b border-[#E9EDEF]">
                      <span className="text-xs font-bold text-[#111B21]">System Notifications</span>
                      {unreadCount > 0 && (
                        <span className="text-[10px] bg-[#DCF8C6] text-[#075E54] font-bold px-1.5 py-0.2 rounded">
                          {unreadCount} New
                        </span>
                      )}
                    </div>
                    <div className="max-h-60 overflow-y-auto divide-y divide-[#E9EDEF]">
                      {notifications.length === 0 ? (
                        <div className="p-4 text-center text-xs text-[#8696A0]">No notifications</div>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            className="p-3 hover:bg-[#F7F5F2] transition-colors cursor-pointer"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[#111B21]">{n.title}</span>
                              <span className="text-[10px] text-[#8696A0]">{n.time}</span>
                            </div>
                            <p className="text-[11px] text-[#667781] mt-0.5">{n.desc}</p>
                          </div>
                        ))
                      )}
                    </div>
                    {notifications.length > 0 && onDismissAllNotifications && (
                      <div className="p-2 border-t border-[#E9EDEF] bg-[#F7F5F2] text-center">
                        <button
                          onClick={() => {
                            onDismissAllNotifications();
                            setIsNotificationOpen(false);
                          }}
                          className="text-[11px] text-[#075E54] font-bold hover:underline cursor-pointer"
                        >
                          Dismiss all notifications
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* SCROLLABLE NAVIGATION CONTAINER (Scrolls independently between fixed header & footer) */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar p-2 space-y-4">
          {renderNavContent(false)}
        </div>

        {/* FIXED FOOTER: Profile Control & Sidebar Collapse/Expand Toggle */}
        <div className="border-t border-[#064E46]/80 bg-[#043832]/80 shrink-0 flex flex-col pb-[env(safe-area-inset-bottom,0px)] relative">
          <div className="p-2">
            {!collapsed ? (
              /* Expanded State: Profile control on left + Collapse control beside it on right */
              <div className="flex items-center justify-between gap-1.5">
                <button
                  onClick={onOpenProfile}
                  className="flex-1 min-w-0 flex items-center gap-2 py-1.5 px-2 rounded-md bg-[#064E46] hover:bg-[#075E54] text-white text-xs transition-colors cursor-pointer border border-[#075E54] shadow-2xs group text-left"
                  title={`Profile Drawer: ${activeUser?.name || 'User'} (${activeUser?.role || 'User'})`}
                  aria-label="Open profile drawer"
                >
                  {activeUser?.avatarUrl ? (
                    <img
                      src={activeUser.avatarUrl}
                      alt={activeUser.name}
                      referrerPolicy="no-referrer"
                      className="w-6 h-6 rounded-full object-cover border border-[#DCF8C6] shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-[#128C7E] text-white text-[11px] font-bold flex items-center justify-center border border-[#DCF8C6]/60 shrink-0">
                      {activeUser?.name ? activeUser.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 truncate">
                    <div className="truncate font-semibold text-xs leading-tight text-white group-hover:text-[#DCF8C6]">
                      {activeUser?.name || 'User Profile'}
                    </div>
                    <div className="truncate text-[10px] text-[#A4B5BD] leading-tight mt-0.5">
                      {activeUser?.role?.replace('_', ' ')} · {activeBranch?.name?.split(' ')[0]}
                    </div>
                  </div>
                </button>

                {/* Sidebar Collapse Toggle - Positioned beside Profile Control */}
                <button
                  onClick={() => setCollapsed(true)}
                  className="shrink-0 p-2 rounded-md bg-[#064E46] hover:bg-[#128C7E] text-white text-xs font-semibold transition-colors cursor-pointer shadow-2xs flex items-center justify-center border border-[#075E54]"
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                >
                  <ChevronLeft className="w-4 h-4 text-[#DCF8C6]" />
                </button>
              </div>
            ) : (
              /* Collapsed State: Display avatar/initials with tooltip, beside expand control */
              <div className="flex items-center justify-center gap-1.5">
                <button
                  onClick={onOpenProfile}
                  className="p-1 rounded-full hover:ring-2 hover:ring-[#DCF8C6] transition-all cursor-pointer focus-visible:outline-none"
                  title={`Profile: ${activeUser?.name || 'User'} (${activeUser?.role || 'User'})`}
                  aria-label="Open profile drawer"
                >
                  {activeUser?.avatarUrl ? (
                    <img
                      src={activeUser.avatarUrl}
                      alt={activeUser.name}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 rounded-full object-cover border border-[#DCF8C6]"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[#128C7E] text-white text-xs font-bold flex items-center justify-center border border-[#DCF8C6]/60">
                      {activeUser?.name ? activeUser.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                </button>

                <button
                  onClick={() => setCollapsed(false)}
                  className="p-1.5 rounded-md bg-[#064E46] hover:bg-[#128C7E] text-white transition-colors cursor-pointer border border-[#075E54]"
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-[#DCF8C6]" />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. MOBILE DRAWER NAVIGATION (Visible on < 768px when toggled) */}
      {/* ========================================================================= */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop Overlay */}
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-[#111B21]/70 backdrop-blur-2xs transition-opacity animate-in fade-in duration-150"
          />

          {/* Slide-over Drawer Panel */}
          <div className="relative w-72 max-w-[85vw] bg-[#075E54] text-white h-full flex flex-col shadow-2xl z-10 animate-in slide-in-from-left duration-200 pb-[env(safe-area-inset-bottom,0px)]">
            {/* FIXED DRAWER HEADER */}
            <div className="h-14 px-4 flex items-center justify-between border-b border-[#064E46]/80 shrink-0 bg-[#075E54]">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <img
                  src="/src/assets/images/slate_pos_symbol_1791618547129.jpg"
                  alt="SLATE POS"
                  className="w-8 h-8 rounded object-cover shadow-xs shrink-0"
                />
                <div>
                  <div className="font-bold text-white text-sm tracking-tight leading-none">
                    SLATE POS
                  </div>
                  <div className="text-[10px] text-[#A4B5BD] tabular-nums mt-0.5">
                    Retail Operations
                  </div>
                </div>
              </div>

              <button
                onClick={onCloseMobile}
                className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-[#128C7E] transition-colors cursor-pointer"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* SCROLLABLE NAV ITEMS */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar p-3 space-y-4">
              {renderNavContent(true)}
            </div>

            {/* FIXED DRAWER FOOTER (No Store Status) */}
            <div
              className="border-t border-[#064E46]/80 bg-[#043832]/80 shrink-0 flex flex-col relative"
              ref={mobileBuildingDropdownRef}
            >
              <div className="p-2.5 flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <button
                    onClick={() => setIsMobileBuildingOpen(!isMobileBuildingOpen)}
                    className="w-full flex items-center justify-between gap-1.5 py-2 px-2.5 rounded-md bg-[#064E46] hover:bg-[#075E54] text-white text-xs font-semibold transition-colors cursor-pointer border border-[#075E54] truncate"
                    aria-label="Select building or retail branch"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 truncate">
                      <Building2 className="w-3.5 h-3.5 text-[#DCF8C6] shrink-0" />
                      <span className="truncate text-left text-xs">{activeBranch.name}</span>
                    </div>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-[#A4B5BD] shrink-0 transition-transform ${
                        isMobileBuildingOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isMobileBuildingOpen && (
                    <div className="absolute left-0 bottom-full mb-1.5 w-full bg-[#111B21] border border-[#064E46] rounded-lg shadow-2xl py-1.5 z-50">
                      <div className="px-3 py-1 text-[10px] font-bold text-[#A4B5BD] uppercase tracking-wider border-b border-[#064E46]/60">
                        Retail Buildings &amp; Branches
                      </div>
                      <div className="max-h-48 overflow-y-auto py-1">
                        {INITIAL_BRANCHES.map((b) => (
                          <button
                            key={b.id}
                            onClick={() => {
                              offlineStore.setActiveBranch(b.id);
                              setIsMobileBuildingOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-[#064E46] cursor-pointer ${
                              b.id === activeBranchId
                                ? 'bg-[#064E46] text-[#DCF8C6] font-bold'
                                : 'text-[#E9EDEF]'
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <div className="truncate font-medium">{b.name}</div>
                              <div className="text-[10px] text-[#A4B5BD] truncate">
                                {b.code} · {b.city}
                              </div>
                            </div>
                            {b.id === activeBranchId && (
                              <Check className="w-3.5 h-3.5 text-[#DCF8C6]" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={onCloseMobile}
                  className="shrink-0 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md bg-[#064E46] hover:bg-[#128C7E] text-white text-xs font-semibold transition-colors cursor-pointer border border-[#075E54]"
                  aria-label="Collapse Navigation"
                >
                  <ChevronLeft className="w-4 h-4 text-[#DCF8C6]" />
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
