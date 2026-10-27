/**
 * SLATE POS — Mobile Bottom Navigation Bar (Phone screens only, < 768px)
 * Fixed to viewport bottom across all mobile pages and scroll states
 * Dynamic Role-Aware Layout:
 * - Cashier: Products | Customers | POS Checkout (Center) | New | Profile
 * - Store Officer: Suppliers | Quotes | Products (Center) | Delivery | Profile
 * - Manager / Admin: Settings | Customers | POS Checkout (Center) | New | Profile
 *
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6 / #FFFFFF / #D1D7DB)
 */

import React from 'react';
import { Settings, Users, Receipt, Plus, User, Package, Building2, Truck, FileSpreadsheet } from 'lucide-react';
import { ActiveView } from './Sidebar';
import { offlineStore } from '../../lib/offlineStore';

export interface MobileBottomNavProps {
  activeView: ActiveView;
  onNavigateToView: (view: ActiveView) => void;
  onOpenProfile: () => void;
  onOpenQuickCreate: () => void;
  isProfileOpen?: boolean;
  isQuickCreateOpen?: boolean;
  userName?: string;
  avatarUrl?: string;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeView,
  onNavigateToView,
  onOpenProfile,
  onOpenQuickCreate,
  isProfileOpen = false,
  isQuickCreateOpen = false,
  userName = 'User',
  avatarUrl,
}) => {
  const activeUser = offlineStore.getActiveUser();
  const role = activeUser?.role || 'CASHIER';

  // Role-appropriate 5-slot bottom navigation
  if (role === 'STORE_OFFICER' || role === 'PURCHASE_OFFICER') {
    return (
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#D1D7DB] shadow-[0_-3px_12px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom,0px)] select-none"
        aria-label="Mobile Bottom Navigation"
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0 }}
      >
        <div className="h-[68px] sm:h-[72px] grid grid-cols-5 items-center px-0.5 max-w-md mx-auto w-full">
          {/* 1. Suppliers */}
          <button
            onClick={() => onNavigateToView('SUPPLIERS')}
            className={`flex flex-col items-center justify-center gap-1 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54] rounded-lg active:scale-95 transition-colors ${
              activeView === 'SUPPLIERS' ? 'text-[#075E54] font-bold' : 'text-[#54656F] hover:text-[#075E54]'
            }`}
            title="Suppliers"
          >
            <div className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${activeView === 'SUPPLIERS' ? 'bg-[#DCF8C6] text-[#075E54]' : ''}`}>
              <Building2 className="w-5 h-5" />
            </div>
            <span className="text-[11px] sm:text-[12px] leading-tight truncate max-w-full px-0.5">Suppliers</span>
          </button>

          {/* 2. Quotes */}
          <button
            onClick={() => onNavigateToView('QUOTES')}
            className={`flex flex-col items-center justify-center gap-1 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54] rounded-lg active:scale-95 transition-colors ${
              activeView === 'QUOTES' ? 'text-[#075E54] font-bold' : 'text-[#54656F] hover:text-[#075E54]'
            }`}
            title="Quotes"
          >
            <div className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${activeView === 'QUOTES' ? 'bg-[#DCF8C6] text-[#075E54]' : ''}`}>
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <span className="text-[11px] sm:text-[12px] leading-tight truncate max-w-full px-0.5">Quotes</span>
          </button>

          {/* 3. Products Catalogue (Center) */}
          <button
            onClick={() => onNavigateToView('PRODUCTS')}
            className="flex flex-col items-center justify-center gap-0.5 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54] rounded-lg active:scale-95 transition-transform text-[#075E54]"
            title="Product Catalogue"
          >
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shadow-xs transition-colors ${
              activeView === 'PRODUCTS'
                ? 'bg-[#075E54] text-[#DCF8C6] ring-2 ring-[#075E54]/30 shadow-md scale-105'
                : 'bg-gradient-to-br from-[#075E54] to-[#128C7E] text-white hover:opacity-95'
            }`}>
              <Package className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-[10.5px] sm:text-[11.5px] font-bold leading-tight text-[#075E54] truncate max-w-full px-0.5">Items</span>
          </button>

          {/* 4. Delivery */}
          <button
            onClick={() => onNavigateToView('CHALLANS')}
            className={`flex flex-col items-center justify-center gap-1 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54] rounded-lg active:scale-95 transition-colors ${
              activeView === 'CHALLANS' ? 'text-[#075E54] font-bold' : 'text-[#54656F] hover:text-[#075E54]'
            }`}
            title="Delivery Challans"
          >
            <div className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${activeView === 'CHALLANS' ? 'bg-[#DCF8C6] text-[#075E54]' : ''}`}>
              <Truck className="w-5 h-5" />
            </div>
            <span className="text-[11px] sm:text-[12px] leading-tight truncate max-w-full px-0.5">Delivery</span>
          </button>

          {/* 5. Profile */}
          <button
            onClick={onOpenProfile}
            className={`flex flex-col items-center justify-center gap-1 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54] rounded-lg active:scale-95 transition-colors ${
              isProfileOpen ? 'text-[#075E54] font-bold' : 'text-[#54656F] hover:text-[#075E54]'
            }`}
            title="User Profile"
          >
            <div className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${isProfileOpen ? 'ring-2 ring-[#075E54] bg-[#DCF8C6]/50' : ''}`}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover border border-[#D1D7DB]" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-[#075E54] text-white text-[11px] font-bold flex items-center justify-center">
                  {userName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <span className="text-[11px] sm:text-[12px] leading-tight truncate max-w-full px-0.5">Profile</span>
          </button>
        </div>
      </nav>
    );
  }

  // Cashier Role View
  if (role === 'CASHIER') {
    return (
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#D1D7DB] shadow-[0_-3px_12px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom,0px)] select-none"
        aria-label="Mobile Bottom Navigation"
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0 }}
      >
        <div className="h-[68px] sm:h-[72px] grid grid-cols-5 items-center px-0.5 max-w-md mx-auto w-full">
          {/* 1. Products */}
          <button
            onClick={() => onNavigateToView('PRODUCTS')}
            className={`flex flex-col items-center justify-center gap-1 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54] rounded-lg active:scale-95 transition-colors ${
              activeView === 'PRODUCTS' ? 'text-[#075E54] font-bold' : 'text-[#54656F] hover:text-[#075E54]'
            }`}
            title="Products"
          >
            <div className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${activeView === 'PRODUCTS' ? 'bg-[#DCF8C6] text-[#075E54]' : ''}`}>
              <Package className="w-5 h-5" />
            </div>
            <span className="text-[11px] sm:text-[12px] leading-tight truncate max-w-full px-0.5">Items</span>
          </button>

          {/* 2. Customers */}
          <button
            onClick={() => onNavigateToView('CUSTOMERS')}
            className={`flex flex-col items-center justify-center gap-1 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54] rounded-lg active:scale-95 transition-colors ${
              activeView === 'CUSTOMERS' ? 'text-[#075E54] font-bold' : 'text-[#54656F] hover:text-[#075E54]'
            }`}
            title="Customers"
          >
            <div className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${activeView === 'CUSTOMERS' ? 'bg-[#DCF8C6] text-[#075E54]' : ''}`}>
              <Users className="w-5 h-5" />
            </div>
            <span className="text-[11px] sm:text-[12px] leading-tight truncate max-w-full px-0.5">Customers</span>
          </button>

          {/* 3. POS Checkout (Central) */}
          <button
            onClick={() => onNavigateToView('POS')}
            className="flex flex-col items-center justify-center gap-0.5 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54] rounded-lg active:scale-95 transition-transform text-[#075E54]"
            title="POS Checkout"
          >
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shadow-xs transition-colors ${
              activeView === 'POS'
                ? 'bg-[#075E54] text-[#DCF8C6] ring-2 ring-[#075E54]/30 shadow-md scale-105'
                : 'bg-gradient-to-br from-[#075E54] to-[#128C7E] text-white hover:opacity-95'
            }`}>
              <Receipt className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-[10.5px] sm:text-[11.5px] font-bold leading-tight text-[#075E54] truncate max-w-full px-0.5">POS</span>
          </button>

          {/* 4. New (Quick Create) */}
          <button
            onClick={onOpenQuickCreate}
            className={`flex flex-col items-center justify-center gap-1 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54] rounded-lg active:scale-95 transition-colors ${
              isQuickCreateOpen ? 'text-[#075E54] font-bold' : 'text-[#54656F] hover:text-[#075E54]'
            }`}
            title="Quick Create (+)"
          >
            <div className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${isQuickCreateOpen ? 'bg-[#DCF8C6] text-[#075E54]' : ''}`}>
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <span className="text-[11px] sm:text-[12px] leading-tight truncate max-w-full px-0.5">New</span>
          </button>

          {/* 5. Profile */}
          <button
            onClick={onOpenProfile}
            className={`flex flex-col items-center justify-center gap-1 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54] rounded-lg active:scale-95 transition-colors ${
              isProfileOpen ? 'text-[#075E54] font-bold' : 'text-[#54656F] hover:text-[#075E54]'
            }`}
            title="User Profile"
          >
            <div className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${isProfileOpen ? 'ring-2 ring-[#075E54] bg-[#DCF8C6]/50' : ''}`}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover border border-[#D1D7DB]" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-[#075E54] text-white text-[11px] font-bold flex items-center justify-center">
                  {userName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <span className="text-[11px] sm:text-[12px] leading-tight truncate max-w-full px-0.5">Profile</span>
          </button>
        </div>
      </nav>
    );
  }

  // Super Admin, Org Admin & Manager
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#D1D7DB] shadow-[0_-3px_12px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom,0px)] select-none"
      aria-label="Mobile Bottom Navigation"
      style={{ position: 'fixed', left: 0, right: 0, bottom: 0 }}
    >
      <div className="h-[68px] sm:h-[72px] grid grid-cols-5 items-center px-0.5 max-w-md mx-auto w-full">
        {/* 1. Settings */}
        <button
          onClick={() => onNavigateToView('SETTINGS')}
          className={`flex flex-col items-center justify-center gap-1 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54] rounded-lg active:scale-95 transition-colors ${
            activeView === 'SETTINGS' ? 'text-[#075E54] font-bold' : 'text-[#54656F] hover:text-[#075E54]'
          }`}
          title="Settings"
        >
          <div className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${activeView === 'SETTINGS' ? 'bg-[#DCF8C6] text-[#075E54]' : ''}`}>
            <Settings className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <span className="text-[11px] sm:text-[12px] leading-tight truncate max-w-full px-0.5">Settings</span>
        </button>

        {/* 2. Customers */}
        <button
          onClick={() => onNavigateToView('CUSTOMERS')}
          className={`flex flex-col items-center justify-center gap-1 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54] rounded-lg active:scale-95 transition-colors ${
            activeView === 'CUSTOMERS' ? 'text-[#075E54] font-bold' : 'text-[#54656F] hover:text-[#075E54]'
          }`}
          title="Customers"
        >
          <div className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${activeView === 'CUSTOMERS' ? 'bg-[#DCF8C6] text-[#075E54]' : ''}`}>
            <Users className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <span className="text-[11px] sm:text-[12px] leading-tight truncate max-w-full px-0.5">Customers</span>
        </button>

        {/* 3. POS Checkout (Central) */}
        <button
          onClick={() => onNavigateToView('POS')}
          className="flex flex-col items-center justify-center gap-0.5 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54] rounded-lg active:scale-95 transition-transform text-[#075E54]"
          title="POS Checkout"
        >
          <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shadow-xs transition-colors ${
            activeView === 'POS'
              ? 'bg-[#075E54] text-[#DCF8C6] ring-2 ring-[#075E54]/30 shadow-md scale-105'
              : 'bg-gradient-to-br from-[#075E54] to-[#128C7E] text-white hover:opacity-95'
          }`}>
            <Receipt className="w-5 h-5 sm:w-5.5 sm:h-5.5 stroke-[2.2]" />
          </div>
          <span className="text-[10.5px] sm:text-[11.5px] font-bold leading-tight text-[#075E54] truncate max-w-full px-0.5">POS</span>
        </button>

        {/* 4. New (Quick Create) */}
        <button
          onClick={onOpenQuickCreate}
          className={`flex flex-col items-center justify-center gap-1 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54] rounded-lg active:scale-95 transition-colors ${
            isQuickCreateOpen ? 'text-[#075E54] font-bold' : 'text-[#54656F] hover:text-[#075E54]'
          }`}
          title="Quick Create (+)"
        >
          <div className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${isQuickCreateOpen ? 'bg-[#DCF8C6] text-[#075E54]' : ''}`}>
            <Plus className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
          </div>
          <span className="text-[11px] sm:text-[12px] leading-tight truncate max-w-full px-0.5">New</span>
        </button>

        {/* 5. Profile */}
        <button
          onClick={onOpenProfile}
          className={`flex flex-col items-center justify-center gap-1 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075E54] rounded-lg active:scale-95 transition-colors ${
            isProfileOpen ? 'text-[#075E54] font-bold' : 'text-[#54656F] hover:text-[#075E54]'
          }`}
          title="User Profile"
        >
          <div className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${isProfileOpen ? 'ring-2 ring-[#075E54] bg-[#DCF8C6]/50' : ''}`}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover border border-[#D1D7DB]" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[#075E54] text-white text-[11px] font-bold flex items-center justify-center">
                {userName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <span className="text-[11px] sm:text-[12px] leading-tight truncate max-w-full px-0.5">Profile</span>
        </button>
      </div>
    </nav>
  );
};
