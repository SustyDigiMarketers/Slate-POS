/**
 * SLATE POS — Floating Capsule Mobile Bottom Navigation Bar (< 768px)
 *
 * Floating rounded-full capsule matching supplied reference composition,
 * adapted strictly to SLATE POS Tricolour Theme:
 * - Venice Blue (#16587B) primary & center medallion
 * - Rock Blue (#84B3CE) highlight accent
 * - Merino (#F5EEDD) warm ground & medallion icon ink
 *
 * Exact ordered destinations (filtered cleanly via RBAC with zero layout gaps):
 * 1. Home (DASHBOARD)
 * 2. Quotation (QUOTES)
 * 3. Bill (PURCHASES) — prominent circular center medallion
 * 4. Invoice (SALES)
 * 5. Inventory (PRODUCTS)
 */

import React, { useState, useEffect } from 'react';
import { Home, FileSpreadsheet, ShoppingBag, Receipt, Package } from 'lucide-react';
import { ActiveView } from './Sidebar';
import { offlineStore } from '../../lib/offlineStore';
import { canAccessView, subscribeToRoleNavigation } from '../../lib/roleNavigation';

export interface MobileBottomNavProps {
  activeView: ActiveView;
  onNavigateToView: (view: ActiveView) => void;
  onOpenProfile?: () => void;
  onOpenQuickCreate?: () => void;
  isProfileOpen?: boolean;
  isQuickCreateOpen?: boolean;
  userName?: string;
  avatarUrl?: string;
}

interface MobileNavItemConfig {
  id: ActiveView;
  label: string;
  isCenterMedallion?: boolean;
}

export const MOBILE_BOTTOM_NAV_ITEMS: readonly MobileNavItemConfig[] = [
  { id: 'DASHBOARD', label: 'Home' },
  { id: 'QUOTES', label: 'Quotation' },
  { id: 'PURCHASES', label: 'Bill', isCenterMedallion: true },
  { id: 'SALES', label: 'Invoice' },
  { id: 'PRODUCTS', label: 'Inventory' },
];

function renderNavIcon(id: ActiveView, isActive: boolean, isMedallion: boolean): React.ReactNode {
  const baseClass = isMedallion
    ? 'w-5 h-5 stroke-[2.2]'
    : isActive
    ? 'w-5 h-5 stroke-[2.25]'
    : 'w-5 h-5 stroke-[1.8]';

  switch (id) {
    case 'DASHBOARD':
      return <Home className={baseClass} />;
    case 'QUOTES':
      return <FileSpreadsheet className={baseClass} />;
    case 'PURCHASES':
      return <ShoppingBag className={baseClass} />;
    case 'SALES':
      return <Receipt className={baseClass} />;
    case 'PRODUCTS':
      return <Package className={baseClass} />;
    default:
      return <Home className={baseClass} />;
  }
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeView,
  onNavigateToView,
}) => {
  const [activeUser, setActiveUser] = useState(offlineStore.getActiveUser());
  const [, setNavRevision] = useState(0);

  useEffect(() => {
    const unsubStore = offlineStore.subscribe(() => {
      setActiveUser(offlineStore.getActiveUser());
    });
    const unsubNav = subscribeToRoleNavigation(() => {
      setNavRevision((r) => r + 1);
    });
    return () => {
      unsubStore();
      unsubNav();
    };
  }, []);

  const visibleItems = MOBILE_BOTTOM_NAV_ITEMS.filter((item) =>
    canAccessView(activeUser?.role, item.id)
  );

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <nav
      className="md:hidden fixed bottom-[max(12px,env(safe-area-inset-bottom,0px))] left-3 right-3 z-40 pointer-events-none select-none"
      aria-label="Mobile Bottom Navigation"
    >
      <div className="pointer-events-auto max-w-md mx-auto w-full rounded-full bg-white/95 backdrop-blur-md border border-[#16587B]/15 shadow-[0_8px_28px_rgba(22,88,123,0.18)] px-2.5 py-1.5 flex items-center justify-around">
        {visibleItems.map((item) => {
          const isActive =
            activeView === item.id ||
            (item.id === 'PURCHASES' &&
              (activeView === 'PURCHASE_ORDERS' ||
                activeView === 'PURCHASE_PAYMENTS' ||
                activeView === 'DEBIT_NOTES')) ||
            (item.id === 'PRODUCTS' && activeView === 'INVENTORY');

          if (item.isCenterMedallion) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigateToView(item.id)}
                className="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16587B] rounded-full active:scale-95 transition-transform"
                title={item.label}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center bg-[#16587B] text-[#F5EEDD] shadow-md transition-all ${
                    isActive
                      ? 'ring-2 ring-[#84B3CE] ring-offset-2 ring-offset-white scale-105'
                      : 'hover:bg-[#124866]'
                  }`}
                >
                  {renderNavIcon(item.id, isActive, true)}
                </div>
                <span
                  className={`text-[10px] leading-none mt-1 tracking-tight truncate max-w-[60px] ${
                    isActive ? 'text-[#16587B] font-bold' : 'text-[#405D6D] font-semibold'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigateToView(item.id)}
              className={`flex flex-col items-center justify-center gap-1 min-h-[44px] min-w-[44px] px-2 py-1 rounded-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16587B] active:scale-95 transition-colors ${
                isActive
                  ? 'text-[#16587B] font-bold'
                  : 'text-[#647B89] hover:text-[#16587B] font-medium'
              }`}
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <span
                className={`w-8 h-7 rounded-full flex items-center justify-center transition-colors ${
                  isActive ? 'bg-[#84B3CE]/25 text-[#16587B]' : 'text-current'
                }`}
              >
                {renderNavIcon(item.id, isActive, false)}
              </span>
              <span className="text-[10.5px] leading-none tracking-tight truncate max-w-[62px]">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
