/**
 * SLATE POS — Responsive Application Header (Topbar)
 * 
 * Layout:
 * - Left Corner Mobile (< 768px): SLATE POS Brand Icon and Wordmark
 * - Left Corner Desktop (>= 768px): SLATE POS Brand Badge
 * - Center: Native Window Drag Strip (no empty toolbars or redundant buttons)
 * - Right Corner: Sync Telemetry Indicator & Desktop Window Controls (in Electron runtime)
 * - Right Corner Mobile: Mobile Drawer Menu Toggle
 * 
 * Requirements Met:
 * - Shortcut buttons (Setup Checklist, Open POS Sale, Sales & Cash Flow, Receivables Aging, Executive Overview) removed from topbar
 * - Notifications & Plus moved to Sidebar header
 * - Settings gear icon removed from topbar (accessible via Sidebar and Mobile Nav)
 * - Profile avatar moved to Sidebar footer
 */

import React, { useState, useEffect } from 'react';
import { offlineStore } from '../../lib/offlineStore';
import {
  RefreshCw,
  Minus,
  Square,
  Copy,
  X,
  Menu,
} from 'lucide-react';
import { ActiveView } from './Sidebar';
import {
  isDesktopRuntime,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
} from '../../lib/desktopBridge';

export interface DesktopTitleBarProps {
  onToggleMobileMenu?: () => void;
  onNavigateToView?: (view: ActiveView) => void;
  onOpenProfile?: () => void;
  onOpenAddUser?: () => void;
  onOpenLogTime?: () => void;
  onOpenWeeklyLog?: () => void;
  onOpenQuickCreate?: () => void;
  onLockTerminal?: () => void;
  onOpenChecklist?: () => void;
  onOpenPosSale?: () => void;
  onOpenSalesCashFlow?: () => void;
  onOpenReceivablesAging?: () => void;
  onOpenExecutiveOverview?: () => void;
  activeDashboardTab?: 'OVERVIEW' | 'BILLING' | 'INVOICE' | 'ONBOARDING';
  currentActiveView?: ActiveView;
  unreadCount?: number;
  notifications?: Array<{ id: string; title: string; desc: string; time: string }>;
  onDismissAllNotifications?: () => void;
}

export const DesktopTitleBar: React.FC<DesktopTitleBarProps> = ({
  onToggleMobileMenu,
}) => {
  const [pendingCount, setPendingCount] = useState(offlineStore.getPendingOutboxCount());
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setIsDesktop(isDesktopRuntime());
    const unsub = offlineStore.subscribe(() => {
      setPendingCount(offlineStore.getPendingOutboxCount());
    });
    return unsub;
  }, []);

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
      className="bg-[#054C44] text-[#E9EDEF] text-xs px-2.5 sm:px-3 h-10 flex items-center justify-between border-b border-[#075E54] select-none shrink-0 gap-2 z-30 relative shadow-2xs"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* ========================================================================= */}
      {/* 1. LEFT SIDE: Brand Logo & Title Strip                                    */}
      {/* ========================================================================= */}
      <div
        className="flex items-center gap-2 shrink-0 min-w-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Mobile Header Left Side (< 768px): SLATE POS Brand Icon & Wordmark */}
        <div className="md:hidden flex items-center gap-1.5 shrink-0 select-none">
          <img
            src="/src/assets/images/slate_pos_symbol_1791618547129.jpg"
            alt="SLATE POS"
            className="w-6 h-6 rounded object-cover border border-[#128C7E]/60 shadow-2xs"
          />
          <span className="font-bold text-white text-xs tracking-tight">SLATE POS</span>
        </div>

        {/* Tablet & Desktop Header Left Side (>= 768px): Brand Breadcrumb Strip */}
        <div className="hidden md:flex items-center gap-2 shrink-0 select-none">
          <span className="font-bold text-white text-xs tracking-tight">SLATE POS</span>
          <span className="text-[#128C7E] font-bold">·</span>
          <span className="text-[11px] text-[#DCF8C6]/85 font-medium">Enterprise Counter</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. CENTER: Clean Draggable Title Strip (No Redundant Shortcut Buttons)     */}
      {/* ========================================================================= */}
      <div className="flex-1 h-full min-w-4 flex items-center justify-center">
        <div className="w-12 h-1 rounded-full bg-white/10 hidden lg:block" />
      </div>

      {/* ========================================================================= */}
      {/* 3. RIGHT SIDE: Sync Status, Window Controls (Desktop) & Menu (Mobile)     */}
      {/* ========================================================================= */}
      <div
        className="flex items-center gap-1.5 sm:gap-2 shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Sync Telemetry Button (when pending outbox exists) */}
        {pendingCount > 0 && (
          <button
            onClick={() => offlineStore.synchronizeOutbox()}
            title="Click to sync pending transactions with cloud database now"
            className="flex items-center gap-1 text-[11px] bg-[#128C7E]/40 text-white border border-[#128C7E] px-1.5 py-0.5 rounded hover:bg-[#128C7E]/60 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
            <span className="tabular-nums font-semibold">{pendingCount}</span>
            <span className="hidden sm:inline">Pending</span>
          </button>
        )}

        {/* Desktop Native Window Controls: Only shown in supported Electron desktop runtime */}
        {isDesktop && (
          <div className="hidden md:flex items-center gap-1 shrink-0 ml-1">
            {/* Minimize */}
            <button
              onClick={handleMinimize}
              className="p-1 hover:bg-[#075E54] text-[#A4B5BD] hover:text-white rounded transition-colors cursor-pointer"
              title="Minimize"
              aria-label="Minimize Window"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            {/* Maximize / Restore */}
            <button
              onClick={handleMaximizeRestore}
              className="p-1 hover:bg-[#075E54] text-[#A4B5BD] hover:text-white rounded transition-colors cursor-pointer"
              title={isMaximized ? 'Restore Down' : 'Maximize'}
              aria-label={isMaximized ? 'Restore Window' : 'Maximize Window'}
            >
              {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
            </button>

            {/* Close (X) */}
            <button
              onClick={handleClose}
              className="p-1 hover:bg-red-600/90 text-[#A4B5BD] hover:text-white rounded transition-colors cursor-pointer"
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
              onClick={onToggleMobileMenu}
              className="p-1.5 text-[#A4B5BD] hover:text-white hover:bg-[#075E54] rounded transition-colors cursor-pointer"
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
