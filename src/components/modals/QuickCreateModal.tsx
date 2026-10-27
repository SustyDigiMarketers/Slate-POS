/**
 * SLATE POS — Quick Create Modal
 * Fast shortcuts to launch New Sale, New Product, New Customer, or Record Expense
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6)
 */

import React from 'react';
import { ShoppingCart, Package, Users, Wallet, X, FileSpreadsheet, Building2 } from 'lucide-react';
import { ActiveView } from '../layout/Sidebar';
import { offlineStore } from '../../lib/offlineStore';
import { canAccessView } from '../../lib/roleNavigation';

interface QuickCreateModalProps {
  onClose: () => void;
  onNavigate: (view: ActiveView) => void;
}

export const QuickCreateModal: React.FC<QuickCreateModalProps> = ({
  onClose,
  onNavigate,
}) => {
  const activeUser = offlineStore.getActiveUser();
  const allActions = [
    {
      label: 'New POS Sale (F2)',
      desc: 'Open counter checkout terminal and scan barcode',
      icon: <ShoppingCart className="w-5 h-5 text-[#075E54]" />,
      view: 'POS' as ActiveView,
    },
    {
      label: 'Create Quotation',
      desc: 'Draft price quote or subscription estimate for client',
      icon: <FileSpreadsheet className="w-5 h-5 text-[#075E54]" />,
      view: 'QUOTES' as ActiveView,
    },
    {
      label: 'Register Supplier',
      desc: 'Add wholesale distributor or procurement vendor',
      icon: <Building2 className="w-5 h-5 text-[#128C7E]" />,
      view: 'SUPPLIERS' as ActiveView,
    },
    {
      label: 'Add Retail Product',
      desc: 'Catalogue new SKU with HSN code, GST slab, and prices',
      icon: <Package className="w-5 h-5 text-[#128C7E]" />,
      view: 'PRODUCTS' as ActiveView,
    },
    {
      label: 'Register Customer',
      desc: 'Add customer account with GSTIN and credit limits',
      icon: <Users className="w-5 h-5 text-[#075E54]" />,
      view: 'CUSTOMERS' as ActiveView,
    },
    {
      label: 'Record Expense',
      desc: 'Log store rent, staff wages, power, or vendor logistics',
      icon: <Wallet className="w-5 h-5 text-[#D97706]" />,
      view: 'EXPENSES' as ActiveView,
    },
  ];

  const actions = allActions.filter((act) => canAccessView(activeUser.role, act.view));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl border border-[#D1D7DB] w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#D1D7DB]">
          <h3 className="text-sm font-bold text-[#111B21]">Quick Create Action</h3>
          <button onClick={onClose} className="text-[#667781] hover:text-[#111B21] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {actions.map((act) => (
            <button
              key={act.label}
              onClick={() => {
                onNavigate(act.view);
                onClose();
              }}
              className="w-full text-left p-3 rounded-lg border border-[#D1D7DB] hover:border-[#128C7E] hover:bg-[#F7F5F2] transition-all flex items-start gap-3 group cursor-pointer"
            >
              <div className="p-2 bg-[#F7F5F2] rounded group-hover:bg-[#DCF8C6]/50 transition-colors">
                {act.icon}
              </div>
              <div>
                <div className="text-xs font-bold text-[#111B21] group-hover:text-[#075E54] transition-colors">
                  {act.label}
                </div>
                <div className="text-[11px] text-[#667781] mt-0.5 leading-snug">
                  {act.desc}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
