/**
 * SLATE POS — Responsive Application Header (Topbar)
 *
 * - Displays centralized 500x500 PNG Company Logo & organization title
 * - Preserves Quick Add, interactive Notifications popover, Settings link, Profile trigger, and desktop window controls
 */

import React, { useState, useEffect, useRef } from 'react';
import { offlineStore } from '../../lib/offlineStore';
import { getActiveBrandLogoUrl } from '../../lib/branding';
import {
  RefreshCw,
  Minus,
  Square,
  Copy,
  X,
  Menu,
  Plus,
  Bell,
  Settings,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { ActiveView } from './Sidebar';
import {
  isDesktopRuntime,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
} from '../../lib/desktopBridge';
import { canAccessView } from '../../lib/roleNavigation';
import { hasAnyPermission, GranularPermission } from '../../lib/permissions';

const QUICK_CREATE_PERMS: readonly GranularPermission[] = [
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

export interface DesktopTitleBarProps {
  onToggleMobileMenu?: () => void;
  onNavigateToView?: (view: ActiveView) => void;
  onOpenProfile?: () => void;
  onOpenQuickCreate?: () => void;
  unreadCount?: number;
  notifications?: Array<{ id: string; title: string; desc: string; time: string }>;
  onDismissAllNotifications?: () => void;
}

export const DesktopTitleBar: React.FC<DesktopTitleBarProps> = ({
  onToggleMobileMenu,
  onNavigateToView,
  onOpenProfile,
  onOpenQuickCreate,
  unreadCount = 0,
  notifications = [],
  onDismissAllNotifications,
}) => {
  const [pendingCount, setPendingCount] = useState(offlineStore.getPendingOutboxCount());
  const [saveStatus, setSaveStatus] = useState(offlineStore.getSaveStatus());
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [activeUser, setActiveUser] = useState(offlineStore.getActiveUser());
  const [currentOrg, setCurrentOrg] = useState(offlineStore.getOrganization());
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsDesktop(isDesktopRuntime());
    const unsub = offlineStore.subscribe(() => {
      setPendingCount(offlineStore.getPendingOutboxCount());
      setSaveStatus(offlineStore.getSaveStatus());
      setActiveUser(offlineStore.getActiveUser());
      setCurrentOrg(offlineStore.getOrganization());
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setIsNotificationOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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

  const canQuickCreate = hasAnyPermission(activeUser, QUICK_CREATE_PERMS);
  const canOpenSettings = canAccessView(activeUser.role, 'SETTINGS');
  const brandLogoUrl = getActiveBrandLogoUrl(currentOrg);

  const handleClose = () => {
    closeWindow();
  };

  const handleMaximizeRestore = () => {
    const nextState = toggleMaximizeWindow();
    setIsMaximized(nextState);
  };

  const handleMinimize = () => {
    minimizeWindow();
  };

  return (
    <header
      className="bg-[#16587B] text-[#F5EEDD] text-xs px-2.5 sm:px-4 h-12 flex items-center justify-between border-b border-[#0F405B] select-none shrink-0 gap-2 z-30 relative shadow-xs"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* 1. LEFT SIDE: Centralized Company Logo & Organization Strip */}
      <div
        className="flex items-center gap-2.5 shrink-0 min-w-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Mobile Header Left Side (< 768px) */}
        <div className="md:hidden flex items-center gap-2 shrink-0 select-none">
          <img
            src={brandLogoUrl}
            alt="SLATE POS"
            className="w-7 h-7 rounded-lg object-contain border border-[#84B3CE]/45 shadow-2xs bg-white/10"
          />
          <div>
            <div className="font-bold text-[#F5EEDD] text-xs tracking-tight leading-none">SLATE POS</div>
            <div className="text-[10px] text-[#84B3CE] font-medium leading-none mt-0.5">{currentOrg.name || 'Workspace'}</div>
          </div>
        </div>

        {/* Tablet & Desktop Header Left Side (>= 768px) */}
        <div className="hidden md:flex items-center gap-2.5 shrink-0 select-none">
          <img
            src={brandLogoUrl}
            alt="SLATE POS"
            className="w-7 h-7 rounded-lg object-contain border border-[#84B3CE]/45 shadow-2xs bg-white/10"
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-bold text-[#F5EEDD] text-xs tracking-tight">SLATE POS</span>
              <span className="text-[#84B3CE]/75 text-[10px]">·</span>
              <span className="text-[11px] text-[#84B3CE] font-semibold">{currentOrg.name || 'Workspace'}</span>
            </div>
            <span className="text-[10px] text-[#F5EEDD]/75 font-normal mt-0.5">Finance &amp; Accounting Suite</span>
          </div>
        </div>
      </div>

      {/* 2. CENTER: Clean Draggable Title Strip */}
      <div className="flex-1 h-full min-w-4 flex items-center justify-center">
        <div className="w-12 h-1 rounded-full bg-[#F5EEDD]/15 hidden lg:block" />
      </div>

      {/* 3. RIGHT SIDE: Quick Actions, Notifications, Settings, Profile & Window Controls */}
      <div
        className="flex items-center gap-2 sm:gap-2.5 shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Honest Cloud Save Status Telemetry */}
        {saveStatus.state === 'SAVING' && (
          <div
            className="flex items-center gap-1 text-[11px] bg-[#124866] text-[#F5EEDD] border border-[#84B3CE]/40 px-2 py-1 rounded-md"
            role="status"
            aria-live="polite"
          >
            <RefreshCw className="w-3 h-3 animate-spin shrink-0 text-[#84B3CE]" />
            <span className="hidden sm:inline font-medium">Saving…</span>
          </div>
        )}

        {saveStatus.state === 'FAILED' && (
          <button
            type="button"
            onClick={() => offlineStore.retryFailedSync()}
            title={saveStatus.lastError || 'Cloud save failed — click to retry'}
            className="flex items-center gap-1 text-[11px] bg-rose-600/95 hover:bg-rose-700 text-white border border-rose-300/40 px-2 py-1 rounded-md transition-colors cursor-pointer"
            role="status"
            aria-live="assertive"
          >
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span className="font-semibold">Failed to save · Retry</span>
          </button>
        )}

        {saveStatus.state === 'SAVED' && pendingCount === 0 && (
          <div
            className="hidden sm:flex items-center gap-1 text-[11px] text-[#84B3CE] px-1.5 py-1"
            title={
              saveStatus.lastSavedAt
                ? `Saved to cloud at ${new Date(saveStatus.lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Saved to cloud'
            }
            role="status"
            aria-live="polite"
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span className="font-medium">
              Saved
              {saveStatus.lastSavedAt
                ? ` ${new Date(saveStatus.lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : ''}
            </span>
          </div>
        )}

        {/* Sync Telemetry Button (when pending outbox exists) */}
        {pendingCount > 0 && (
          <button
            type="button"
            onClick={() => offlineStore.retryFailedSync()}
            title="Click to sync pending transactions with cloud database now"
            className="flex items-center gap-1 text-[11px] bg-[#124866] text-[#F5EEDD] border border-[#84B3CE]/50 px-2 py-1 rounded-md hover:bg-[#0F405B] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3 animate-spin shrink-0 text-[#84B3CE]" />
            <span className="tabular-nums font-semibold">{pendingCount}</span>
            <span className="hidden sm:inline">Pending</span>
          </button>
        )}

        {/* Quick Add '+' Button */}
        {onOpenQuickCreate && canQuickCreate && (
          <button
            type="button"
            onClick={onOpenQuickCreate}
            title="Quick Add (Invoice, Product, Customer, Expense)"
            className="hidden sm:flex items-center gap-1 px-2.5 py-1 bg-[#84B3CE] hover:bg-[#9AC2D8] text-[#0F2D3D] rounded-md text-xs font-semibold shadow-2xs transition-colors cursor-pointer border border-[#F5EEDD]/25"
          >
            <Plus className="w-3.5 h-3.5 text-[#0F2D3D]" />
            <span className="hidden md:inline">Quick Add</span>
          </button>
        )}

        {/* Interactive Notifications Popover */}
        <div className="relative" ref={notificationRef}>
          <button
            type="button"
            onClick={() => setIsNotificationOpen((open) => !open)}
            title="Notifications"
            aria-label="Notifications"
            className="p-1.5 text-[#F5EEDD]/90 hover:text-white hover:bg-[#124866] rounded-md transition-colors cursor-pointer relative"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-[#84B3CE] rounded-full ring-2 ring-[#16587B]" />
            )}
          </button>

          {isNotificationOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white border border-[#16587B]/20 rounded-lg shadow-2xl py-2 z-50 text-[#111B21]">
              <div className="px-3.5 py-1.5 flex items-center justify-between border-b border-[#16587B]/12">
                <span className="text-xs font-bold text-[#16587B]">System Notifications</span>
                {unreadCount > 0 && (
                  <span className="text-[10px] bg-[#84B3CE]/30 text-[#16587B] font-bold px-1.5 py-0.2 rounded">
                    {unreadCount} New
                  </span>
                )}
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-[#16587B]/10">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[#405D6D]">No notifications</div>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className="p-3 hover:bg-[#FAF6EC] transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#111B21]">{n.title}</span>
                        <span className="text-[10px] text-[#405D6D]">{n.time}</span>
                      </div>
                      <p className="text-[11px] text-[#405D6D] mt-0.5">{n.desc}</p>
                    </div>
                  ))
                )}
              </div>
              {notifications.length > 0 && onDismissAllNotifications && (
                <div className="p-2 border-t border-[#16587B]/12 bg-[#FAF6EC] text-center">
                  <button
                    type="button"
                    onClick={() => {
                      onDismissAllNotifications();
                      setIsNotificationOpen(false);
                    }}
                    className="text-[11px] text-[#16587B] font-bold hover:underline cursor-pointer"
                  >
                    Dismiss all notifications
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Settings Gear Icon */}
        {canOpenSettings && (
          <button
            type="button"
            onClick={() => onNavigateToView?.('SETTINGS')}
            title="All Settings & Preferences"
            aria-label="Configure Settings"
            className="p-1.5 text-white/90 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}

        {/* Profile Avatar with Role Badge */}
        <button
          type="button"
          onClick={onOpenProfile}
          title="User Profile & Role Controls"
          className="flex items-center gap-2 pl-1 pr-2 py-0.5 rounded-full hover:bg-[#124866] transition-colors cursor-pointer border border-[#84B3CE]/30"
        >
          {activeUser.avatarUrl ? (
            <img
              src={activeUser.avatarUrl}
              alt={activeUser.name}
              className="w-6 h-6 rounded-full object-cover border border-[#84B3CE]/50 shadow-2xs"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-[#84B3CE] text-[#0F2D3D] flex items-center justify-center font-bold text-[11px]">
              {activeUser.name ? activeUser.name.charAt(0).toUpperCase() : 'U'}
            </div>
          )}
          <div className="hidden lg:flex flex-col text-left leading-tight">
            <span className="font-semibold text-[#F5EEDD] text-[11px] truncate max-w-[100px]">{activeUser.name}</span>
            <span className="text-[9px] text-[#84B3CE] font-bold uppercase">{activeUser.role}</span>
          </div>
        </button>

        {/* Desktop Native Window Controls: Only shown in supported Electron desktop runtime */}
        {isDesktop && (
          <div className="hidden md:flex items-center gap-1 shrink-0 ml-1">
            <button
              type="button"
              onClick={handleMinimize}
              className="p-1 hover:bg-[#124866] text-[#F5EEDD]/80 hover:text-white rounded transition-colors cursor-pointer"
              title="Minimize"
              aria-label="Minimize Window"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleMaximizeRestore}
              className="p-1 hover:bg-[#124866] text-[#F5EEDD]/80 hover:text-white rounded transition-colors cursor-pointer"
              title={isMaximized ? 'Restore Down' : 'Maximize'}
              aria-label={isMaximized ? 'Restore Window' : 'Maximize Window'}
            >
              {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="p-1 hover:bg-red-600/90 text-[#F5EEDD]/80 hover:text-white rounded transition-colors cursor-pointer"
              title="Close"
              aria-label="Close Window"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Mobile Drawer Toggle (< 768px phone screens: on extreme right) */}
        {onToggleMobileMenu && (
          <div className="md:hidden flex items-center shrink-0">
            <button
              type="button"
              onClick={onToggleMobileMenu}
              className="p-1.5 text-[#F5EEDD]/85 hover:text-white hover:bg-[#124866] rounded transition-colors cursor-pointer"
              title="Toggle Navigation Menu"
              aria-label="Toggle navigation drawer"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
