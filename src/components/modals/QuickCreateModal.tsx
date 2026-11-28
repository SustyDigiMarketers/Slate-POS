/**
 * SLATE POS — Quick Create Modal
 * Fast shortcuts for Finance, Accounting, Invoicing & Procurement
 * Styled with SLATE POS Theme (#16587B / #84B3CE / #F5EEDD)
 */

import React from 'react';
import {
  ShoppingCart,
  Package,
  Users,
  Wallet,
  X,
  FileSpreadsheet,
  Building2,
  BookOpen,
  FileMinus2,
  ShoppingBag,
} from 'lucide-react';
import { ActiveView } from '../layout/Sidebar';
import { offlineStore } from '../../lib/offlineStore';
import { canAccessView } from '../../lib/roleNavigation';
import { hasPermission, GranularPermission } from '../../lib/permissions';

interface QuickCreateModalProps {
  onClose: () => void;
  onNavigate: (view: ActiveView) => void;
}

export const QuickCreateModal: React.FC<QuickCreateModalProps> = ({
  onClose,
  onNavigate,
}) => {
  const activeUser = offlineStore.getActiveUser();
  const allActions: Array<{
    label: string;
    desc: string;
    icon: React.ReactNode;
    view: ActiveView;
    permission: GranularPermission;
  }> = [
    {
      label: 'New POS Invoice (F2)',
      desc: 'Open checkout billing terminal with auto GL posting',
      icon: <ShoppingCart className="w-5 h-5 text-[#16587B]" />,
      view: 'POS',
      permission: 'POS_CHECKOUT',
    },
    {
      label: 'New Journal Voucher',
      desc: 'Record balanced double-entry manual journal voucher',
      icon: <BookOpen className="w-5 h-5 text-[#16587B]" />,
      view: 'JOURNAL',
      permission: 'JOURNAL_MANAGE',
    },
    {
      label: 'New Purchase Bill / PO',
      desc: 'Create purchase order, GRN, or supplier bill (AP)',
      icon: <ShoppingBag className="w-5 h-5 text-[#16587B]" />,
      view: 'PURCHASES',
      permission: 'SUPPLIER_BILLS_MANAGE',
    },
    {
      label: 'Issue Credit Note',
      desc: 'Record GST sales return, restocking, or customer refund',
      icon: <FileMinus2 className="w-5 h-5 text-[#16587B]" />,
      view: 'CREDIT_NOTES',
      permission: 'CREDIT_NOTES_MANAGE',
    },
    {
      label: 'Create Quotation',
      desc: 'Draft price quote or estimate and convert to invoice',
      icon: <FileSpreadsheet className="w-5 h-5 text-[#16587B]" />,
      view: 'QUOTES',
      permission: 'QUOTES_CREATE',
    },
    {
      label: 'Record Expense',
      desc: 'Log operating expense with GST ITC and GL posting',
      icon: <Wallet className="w-5 h-5 text-[#D97706]" />,
      view: 'EXPENSES',
      permission: 'EXPENSES_MANAGE',
    },
    {
      label: 'Register Customer (AR)',
      desc: 'Add customer accounting master with GSTIN and credit limit',
      icon: <Users className="w-5 h-5 text-[#16587B]" />,
      view: 'CUSTOMERS',
      permission: 'CUSTOMERS_CREATE',
    },
    {
      label: 'Register Supplier (AP)',
      desc: 'Add vendor master with GSTIN and payable terms',
      icon: <Building2 className="w-5 h-5 text-[#16587B]" />,
      view: 'SUPPLIERS',
      permission: 'SUPPLIERS_MANAGE',
    },
    {
      label: 'Add Product / SKU',
      desc: 'Catalogue item with HSN code, GST slab, and valuation',
      icon: <Package className="w-5 h-5 text-[#16587B]" />,
      view: 'PRODUCTS',
      permission: 'PRODUCTS_CREATE',
    },
  ];

  const actions = allActions.filter(
    (act) => canAccessView(activeUser.role, act.view) && hasPermission(activeUser, act.permission)
  );

  return (
    <div className="fixed inset-0 bg-[#0F405B]/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl border border-[#D1D7DB] w-full max-w-md p-5 space-y-4 max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between pb-2 border-b border-[#D1D7DB] shrink-0">
          <h3 className="text-sm font-bold text-[#111B21]">Quick Create Action</h3>
          <button onClick={onClose} className="text-[#667781] hover:text-[#111B21] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 overflow-y-auto pr-1">
          {actions.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#667781]">
              Your current role does not have create permissions in this workspace.
            </div>
          ) : (
            actions.map((act) => (
              <button
                key={act.label}
                onClick={() => {
                  onNavigate(act.view);
                  onClose();
                }}
                className="w-full text-left p-3 rounded-lg border border-[#D1D7DB] hover:border-[#16587B] hover:bg-[#FAF6EC] transition-all flex items-start gap-3 group cursor-pointer"
              >
                <div className="p-2 bg-[#FAF6EC] rounded group-hover:bg-[#84B3CE]/25 transition-colors">
                  {act.icon}
                </div>
                <div>
                  <div className="text-xs font-bold text-[#111B21] group-hover:text-[#16587B] transition-colors">
                    {act.label}
                  </div>
                  <div className="text-[11px] text-[#667781] mt-0.5 leading-snug">
                    {act.desc}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
