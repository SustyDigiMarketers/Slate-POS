/**
 * SLATE POS — Credit Notes & Sales Returns Module
 * Comprehensive GST Credit Notes, Sales Returns, Tax Adjustments, and Inventory Restocking
 * Styled with SLATE POS Tricolour Theme (#16587B / #84B3CE / #FFFFFF / #F5EEDD)
 */

import React, { useState, useEffect } from 'react';
import {
  FileMinus2,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Check,
  X,
  User,
  Package,
  Calendar,
  Eye,
  Trash2,
  Printer,
  ChevronRight,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { offlineStore } from '../../lib/offlineStore';
import { BankAccount, CreditNote, CreditNoteItem, CreditNoteStatus, Customer, Product, Sale } from '../../types';
import { ActiveView } from '../layout/Sidebar';

interface CreditNotesPageProps {
  mode?: 'CREDIT_NOTES' | 'SALES_RETURNS';
  onNavigateToView?: (view: ActiveView) => void;
}

export const CreditNotesPage: React.FC<CreditNotesPageProps> = ({
  mode = 'CREDIT_NOTES',
  onNavigateToView,
}) => {
  const activeUser = offlineStore.getActiveUser();
  const currentOrg = offlineStore.getOrganization();
  const isSalesReturnsMode = mode === 'SALES_RETURNS';

  const [creditNotes, setCreditNotes] = useState<CreditNote[]>(() => offlineStore.getCreditNotes());
  const [customers, setCustomers] = useState<Customer[]>(() => offlineStore.getCustomers());
  const [products, setProducts] = useState<Product[]>(() => offlineStore.getProducts());
  const [sales, setSales] = useState<Sale[]>(() => offlineStore.getSales());
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => offlineStore.getBankAccounts());

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCreditNote, setSelectedCreditNote] = useState<CreditNote | null>(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [refundTarget, setRefundTarget] = useState<CreditNote | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundMode, setRefundMode] = useState<'CASH' | 'BANK' | 'UPI'>('BANK');
  const [refundBankAccountId, setRefundBankAccountId] = useState<string>('');
  const [refundRef, setRefundRef] = useState<string>('');
  const [actionFeedback, setActionFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form states for New Credit Note
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [reason, setReason] = useState<string>(isSalesReturnsMode ? 'CUSTOMER_RETURN' : 'DAMAGED_GOODS');
  const [customReason, setCustomReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [restockInventory, setRestockInventory] = useState<boolean>(true);
  const [items, setItems] = useState<Array<{ productId: string; quantity: number; unitPrice: number; taxRate: number }>>([]);

  useEffect(() => {
    const refreshData = () => {
      setCreditNotes(offlineStore.getCreditNotes());
      setCustomers(offlineStore.getCustomers());
      setProducts(offlineStore.getProducts());
      setSales(offlineStore.getSales());
      setBankAccounts(offlineStore.getBankAccounts());
    };
    refreshData();
    const unsub = offlineStore.subscribe(refreshData);
    return unsub;
  }, []);

  const totalCreditIssued = creditNotes
    .filter((cn) => cn.status === 'ISSUED' || cn.status === 'APPLIED')
    .reduce((sum, cn) => sum + (cn.totalCreditAmount || cn.creditAmount || 0), 0);

  const pendingApprovalsCount = creditNotes.filter((cn) => cn.status === 'DRAFT').length;
  const approvedReadyCount = creditNotes.filter((cn) => cn.status === 'APPROVED').length;

  const filteredCreditNotes = creditNotes.filter((cn) => {
    const matchesStatus = statusFilter === 'ALL' || cn.status === statusFilter;
    const matchesSearch =
      cn.creditNoteNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cn.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (cn.invoiceNumber && cn.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      cn.reason.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const openCreateModal = () => {
    const firstCust = customers[0];
    setSelectedCustomerId(firstCust ? firstCust.id : '');
    setSelectedInvoiceId('');
    setReason('DAMAGED_GOODS');
    setCustomReason('');
    setNotes('');
    setRestockInventory(true);

    const firstProd = products[0];
    if (firstProd) {
      setItems([{ productId: firstProd.id, quantity: 1, unitPrice: firstProd.sellingPrice || 100, taxRate: firstProd.taxRate || firstProd.gstRate || 18 }]);
    } else {
      setItems([]);
    }
    setIsCreateModalOpen(true);
  };

  const handleAddItemRow = () => {
    const firstProd = products[0];
    if (firstProd) {
      setItems([...items, { productId: firstProd.id, quantity: 1, unitPrice: firstProd.sellingPrice || 100, taxRate: firstProd.taxRate || firstProd.gstRate || 18 }]);
    }
  };

  const handleRemoveItemRow = (index: number) => {
    setItems(items.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...items];
    if (field === 'productId') {
      const prod = products.find((p) => p.id === value);
      if (prod) {
        updated[index] = {
          ...updated[index],
          productId: prod.id,
          unitPrice: prod.sellingPrice || 100,
          taxRate: prod.taxRate || prod.gstRate || 18,
        };
      }
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setItems(updated);
  };

  const calculateFormTotals = () => {
    let subtotal = 0;
    let taxTotal = 0;
    let total = 0;

    items.forEach((item) => {
      const lineSub = item.quantity * item.unitPrice;
      const rate = item.taxRate || 0;
      const taxable = (lineSub * 100) / (100 + rate);
      const tax = lineSub - taxable;
      subtotal += taxable;
      taxTotal += tax;
      total += lineSub;
    });

    return {
      taxableSubtotal: Math.round(subtotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      grandTotal: Math.round(total * 100) / 100,
    };
  };

  const handleCreateCreditNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      setActionFeedback({ message: 'Please select a customer', type: 'error' });
      return;
    }
    if (items.length === 0) {
      setActionFeedback({ message: 'Please add at least one line item', type: 'error' });
      return;
    }

    const customer = customers.find((c) => c.id === selectedCustomerId);
    const sale = sales.find((s) => s.id === selectedInvoiceId);

    const creditNoteItems: CreditNoteItem[] = items.map((item, idx) => {
      const prod = products.find((p) => p.id === item.productId);
      const lineTotal = item.quantity * item.unitPrice;
      const taxRate = item.taxRate || 18;
      const taxableAmount = Math.round(((lineTotal * 100) / (100 + taxRate)) * 100) / 100;
      const cgstRate = taxRate / 2;
      const sgstRate = taxRate / 2;
      const cgstAmount = Math.round((taxableAmount * (cgstRate / 100)) * 100) / 100;
      const sgstAmount = Math.round((taxableAmount * (sgstRate / 100)) * 100) / 100;

      return {
        id: `cni_${Date.now()}_${idx}`,
        productId: item.productId,
        productName: prod ? prod.name : 'Item',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxableAmount,
        taxRate,
        cgstRate,
        cgstAmount,
        sgstRate,
        sgstAmount,
        igstRate: 0,
        igstAmount: 0,
        total: lineTotal,
      };
    });

    const finalReason = reason === 'OTHER' ? customReason || 'Other sales adjustment' : reason;

    const result = offlineStore.createCreditNote({
      customerId: selectedCustomerId,
      customerName: customer?.name,
      invoiceId: selectedInvoiceId || undefined,
      invoiceNumber: sale?.invoiceNumber || undefined,
      items: creditNoteItems,
      reason: finalReason,
      notes,
      restockInventory,
      createdBy: activeUser.id,
      createdByName: activeUser.name,
      orgId: currentOrg.id,
    });

    if (result.success && result.creditNote) {
      setIsCreateModalOpen(false);
      setActionFeedback({
        message: `Credit Note ${result.creditNote.creditNoteNumber} created in DRAFT status!`,
        type: 'success',
      });
      setTimeout(() => setActionFeedback(null), 4000);
    } else {
      setActionFeedback({ message: result.error || 'Failed to create Credit Note', type: 'error' });
    }
  };

  const handleApproveCreditNote = (cn: CreditNote) => {
    const res = offlineStore.approveCreditNote(cn.id, activeUser.id, activeUser.name);
    if (res.success) {
      setActionFeedback({ message: `Credit Note ${cn.creditNoteNumber} approved! Ready to issue.`, type: 'success' });
      setTimeout(() => setActionFeedback(null), 4000);
    } else {
      setActionFeedback({ message: res.error || 'Approval failed', type: 'error' });
    }
  };

  const handleIssueCreditNote = (cn: CreditNote) => {
    const res = offlineStore.issueCreditNote(cn.id, activeUser.id, activeUser.name);
    if (res.success) {
      setActionFeedback({
        message: `Credit Note ${cn.creditNoteNumber} issued! Customer receivable reduced by ₹${(cn.totalCreditAmount || cn.creditAmount || 0).toLocaleString('en-IN')}${
          cn.restockInventory ? ' and inventory restocked.' : '.'
        }`,
        type: 'success',
      });
      setTimeout(() => setActionFeedback(null), 4000);
    } else {
      setActionFeedback({ message: res.error || 'Issuance failed', type: 'error' });
    }
  };

  const handleCancelCreditNote = (cn: CreditNote) => {
    const res = offlineStore.cancelCreditNote(cn.id, 'User cancelled from dashboard');
    if (res.success) {
      setActionFeedback({ message: `Credit Note ${cn.creditNoteNumber} has been cancelled.`, type: 'success' });
      setTimeout(() => setActionFeedback(null), 4000);
    } else {
      setActionFeedback({ message: res.error || 'Cancellation failed', type: 'error' });
    }
  };

  const openRefundModal = (cn: CreditNote) => {
    const remaining = cn.remainingAmount ?? cn.totalCreditAmount ?? cn.creditAmount ?? 0;
    setRefundTarget(cn);
    setRefundAmount(remaining.toFixed(2));
    setRefundMode('BANK');
    const primaryBank = bankAccounts.find((b) => b.isPrimary) || bankAccounts[0];
    setRefundBankAccountId(primaryBank?.id || '');
    setRefundRef(`REF-${cn.creditNoteNumber}`);
  };

  const handleExecuteRefund = (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundTarget) return;
    const amt = parseFloat(refundAmount);
    if (isNaN(amt) || amt <= 0) {
      setActionFeedback({ message: 'Enter a valid positive refund amount', type: 'error' });
      return;
    }
    const res = offlineStore.refundCreditNote({
      creditNoteId: refundTarget.id,
      refundAmount: amt,
      refundMode,
      bankAccountId: refundMode !== 'CASH' ? refundBankAccountId : undefined,
      referenceNumber: refundRef,
      processedBy: activeUser.id,
    });
    if (res.success) {
      setRefundTarget(null);
      setActionFeedback({
        message: `Refund of ₹${amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })} posted to General Ledger & Bank/Cash!`,
        type: 'success',
      });
      setTimeout(() => setActionFeedback(null), 4500);
    } else {
      setActionFeedback({ message: res.error || 'Refund failed', type: 'error' });
    }
  };

  const formTotals = calculateFormTotals();

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F5EEDD] overflow-y-auto">
      {/* Top Banner */}
      <div className="bg-[#16587B] text-[#F5EEDD] px-4 sm:px-6 py-4 shrink-0 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-[#0F405B] rounded-md text-[#84B3CE]">
                <FileMinus2 className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                {isSalesReturnsMode ? 'Sales Returns & Restocking' : 'Credit Notes & Refunds'}
              </h1>
              <span className="text-xs bg-[#84B3CE] text-[#0F2D3D] font-semibold px-2 py-0.5 rounded">
                {currentOrg.name}
              </span>
            </div>
            <p className="text-xs text-[#84B3CE] mt-1">
              {isSalesReturnsMode
                ? 'Process customer goods returns, restock inventory batches, reverse GST output liability, and post automated GL vouchers'
                : 'Sales adjustments, GST credit notes, customer receivables deductions, and direct cash/bank refund disbursements'}
            </p>
          </div>

          <button
            onClick={openCreateModal}
            className="px-3.5 py-2 bg-[#84B3CE] hover:bg-[#9AC2D8] text-[#0F2D3D] text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 text-[#0F2D3D]" />
            {isSalesReturnsMode ? 'New Sales Return' : 'New Credit Note'}
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-5">
        {/* Feedback Alert */}
        {actionFeedback && (
          <div
            className={`p-3.5 rounded-lg text-xs font-medium flex items-center justify-between border ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {actionFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{actionFeedback.message}</span>
            </div>
            <button onClick={() => setActionFeedback(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Financial Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs">
            <span className="text-xs font-medium text-[#667781]">Total Issued Credit</span>
            <div className="mt-2 text-2xl font-bold text-[#16587B]">
              ₹{totalCreditIssued.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-[#667781] mt-1">Adjusted against sales & invoices</div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs">
            <span className="text-xs font-medium text-[#667781]">Draft Notes (Pending Approval)</span>
            <div className="mt-2 text-2xl font-bold text-amber-600">{pendingApprovalsCount}</div>
            <div className="text-[11px] text-[#667781] mt-1">Awaiting store manager review</div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs">
            <span className="text-xs font-medium text-[#667781]">Approved (Ready to Issue)</span>
            <div className="mt-2 text-2xl font-bold text-blue-600">{approvedReadyCount}</div>
            <div className="text-[11px] text-[#667781] mt-1">Approved for customer balance adjustment</div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs">
            <span className="text-xs font-medium text-[#667781]">Total Credit Notes</span>
            <div className="mt-2 text-2xl font-bold text-[#111B21]">{creditNotes.length}</div>
            <div className="text-[11px] text-[#667781] mt-1">Across all branches</div>
          </div>
        </div>

        {/* Credit Notes Table & Filtering */}
        <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xs overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E9EDEF] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#FAF6EC]">
            {/* Status Pills */}
            <div className="flex items-center gap-1 overflow-x-auto">
              {['ALL', 'DRAFT', 'APPROVED', 'ISSUED', 'CANCELLED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    statusFilter === st
                      ? 'bg-[#16587B] text-white shadow-2xs'
                      : 'text-[#667781] hover:bg-[#F5EEDD] hover:text-[#111B21]'
                  }`}
                >
                  {st === 'ALL' ? `All (${creditNotes.length})` : st}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#667781] absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search by CN #, customer, invoice..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B] w-64"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#FAF6EC] text-[#667781] border-b border-[#E9EDEF]">
                  <th className="py-2.5 px-4 font-semibold">Credit Note #</th>
                  <th className="py-2.5 px-4 font-semibold">Date</th>
                  <th className="py-2.5 px-4 font-semibold">Customer</th>
                  <th className="py-2.5 px-4 font-semibold">Ref Invoice</th>
                  <th className="py-2.5 px-4 font-semibold">Reason</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Taxable</th>
                  <th className="py-2.5 px-4 font-semibold text-right">GST Total</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Credit Amount</th>
                  <th className="py-2.5 px-4 font-semibold text-center">Restock</th>
                  <th className="py-2.5 px-4 font-semibold text-center">Status</th>
                  <th className="py-2.5 px-4 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9EDEF]">
                {filteredCreditNotes.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-[#667781]">
                      No credit notes match the filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredCreditNotes.map((cn) => (
                    <tr key={cn.id} className="hover:bg-[#FAF6EC] transition-colors">
                      <td className="py-2.5 px-4 font-mono font-medium text-[#111B21]">{cn.creditNoteNumber}</td>
                      <td className="py-2.5 px-4 text-[#667781] whitespace-nowrap">{cn.issueDate || cn.createdAt.slice(0, 10)}</td>
                      <td className="py-2.5 px-4 font-medium text-[#111B21]">{cn.customerName}</td>
                      <td className="py-2.5 px-4 font-mono text-[#667781]">{cn.invoiceNumber || '—'}</td>
                      <td className="py-2.5 px-4 text-[#667781]">{cn.reason}</td>
                      <td className="py-2.5 px-4 text-right font-medium">₹{cn.taxableTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2.5 px-4 text-right text-[#667781]">₹{(cn.totalTax || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-[#16587B]">
                        ₹{(cn.totalCreditAmount || cn.creditAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {cn.restockInventory ? (
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Yes</span>
                        ) : (
                          <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">No</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            cn.status === 'ISSUED' || cn.status === 'APPLIED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : cn.status === 'APPROVED'
                              ? 'bg-blue-100 text-blue-800'
                              : cn.status === 'DRAFT'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {cn.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedCreditNote(cn)}
                            title="View Details"
                            className="p-1 text-gray-500 hover:text-[#16587B] hover:bg-[#FAF6EC] rounded transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {cn.status === 'DRAFT' && (
                            <button
                              onClick={() => handleApproveCreditNote(cn)}
                              title="Approve Credit Note"
                              className="px-2 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded text-[10px] font-bold transition-colors"
                            >
                              Approve
                            </button>
                          )}

                          {cn.status === 'APPROVED' && (
                            <button
                              onClick={() => handleIssueCreditNote(cn)}
                              title="Issue & Apply to Balance"
                              className="px-2 py-0.5 bg-[#84B3CE]/30 text-[#16587B] hover:bg-[#84B3CE]/45 rounded text-[10px] font-bold transition-colors cursor-pointer"
                            >
                              Issue
                            </button>
                          )}

                          {cn.status === 'ISSUED' && (cn.remainingAmount ?? cn.totalCreditAmount ?? cn.creditAmount ?? 0) > 0.01 && (
                            <button
                              onClick={() => openRefundModal(cn)}
                              title="Process Cash/Bank Refund"
                              className="px-2 py-0.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded text-[10px] font-bold transition-colors cursor-pointer"
                            >
                              Refund
                            </button>
                          )}

                          {cn.status !== 'CANCELLED' && cn.status !== 'ISSUED' && cn.status !== 'APPLIED' && (
                            <button
                              onClick={() => handleCancelCreditNote(cn)}
                              title="Cancel"
                              className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL: CREATE CREDIT NOTE */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full overflow-hidden border border-[#D1D7DB]">
            <div className="bg-[#16587B] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileMinus2 className="w-5 h-5 text-[#84B3CE]" />
                <h2 className="text-base font-bold">Issue New Credit Note</h2>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCreditNote} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Customer *</label>
                  <select
                    required
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  >
                    <option value="">-- Select Customer --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ''} — Bal: ₹{c.outstandingReceivable || 0}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Original Invoice Reference (Optional)</label>
                  <select
                    value={selectedInvoiceId}
                    onChange={(e) => setSelectedInvoiceId(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  >
                    <option value="">-- None / Standalone Credit Note --</option>
                    {sales
                      .filter((s) => !selectedCustomerId || s.customerId === selectedCustomerId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.invoiceNumber} — {(s.date || s.createdAt || '').slice(0, 10)} (₹{s.grandTotal.toLocaleString('en-IN')})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Reason for Credit Note *</label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  >
                    <option value="DAMAGED_GOODS">Damaged / Defective Goods</option>
                    <option value="CUSTOMER_RETURN">Customer Return / Exchange</option>
                    <option value="PRICING_ERROR">Pricing / Rate Difference</option>
                    <option value="ORDER_CANCELLATION">Order Cancelled After Invoicing</option>
                    <option value="DISCOUNT_REBATE">Post-Sale Volume Rebate</option>
                    <option value="OTHER">Other Reason</option>
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={restockInventory}
                      onChange={(e) => setRestockInventory(e.target.checked)}
                      className="w-4 h-4 text-[#16587B] rounded border-[#D1D7DB]"
                    />
                    <span className="font-medium text-[#111B21]">Restock returned items to branch inventory</span>
                  </label>
                </div>
              </div>

              {reason === 'OTHER' && (
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Specify Reason *</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter custom justification"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  />
                </div>
              )}

              {/* Items Section */}
              <div className="border border-[#D1D7DB] rounded-xl p-3.5 bg-[#FAF6EC] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-[#111B21]">Returned Items</span>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="px-2.5 py-1 bg-[#16587B] text-[#F5EEDD] rounded text-[11px] font-semibold hover:bg-[#124866] transition-colors"
                  >
                    + Add Item
                  </button>
                </div>

                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-lg border border-[#E9EDEF]">
                    <div className="col-span-5">
                      <label className="block text-[10px] text-[#667781] mb-0.5">Product</label>
                      <select
                        value={item.productId}
                        onChange={(e) => handleItemChange(idx, 'productId', e.target.value)}
                        className="w-full px-2 py-1.5 border border-[#D1D7DB] rounded text-xs focus:outline-none"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Stock: {p.stockLevel})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10px] text-[#667781] mb-0.5">Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                        className="w-full px-2 py-1.5 border border-[#D1D7DB] rounded text-xs text-center font-bold"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10px] text-[#667781] mb-0.5">Rate (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 border border-[#D1D7DB] rounded text-xs text-right font-mono"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10px] text-[#667781] mb-0.5">Total</label>
                      <div className="font-bold text-xs text-[#16587B] pt-1">
                        ₹{(item.quantity * item.unitPrice).toFixed(2)}
                      </div>
                    </div>

                    <div className="col-span-1 text-center pt-3">
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(idx)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-3.5 h-3.5 mx-auto" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Form Calculation Summary */}
                <div className="p-3 bg-white rounded-lg border border-[#E9EDEF] space-y-1 text-xs">
                  <div className="flex justify-between text-[#667781]">
                    <span>Taxable Subtotal:</span>
                    <span className="font-mono">₹{formTotals.taxableSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[#667781]">
                    <span>GST (CGST + SGST):</span>
                    <span className="font-mono">₹{formTotals.taxTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[#111B21] font-bold text-sm pt-1 border-t border-[#E9EDEF]">
                    <span>Total Credit Note Amount:</span>
                    <span className="text-[#16587B] font-mono">₹{formTotals.grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#111B21] mb-1">Remarks / Internal Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional audit remarks"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                />
              </div>

              <div className="pt-3 border-t border-[#E9EDEF] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 border border-[#D1D7DB] rounded-lg text-[#667781] hover:bg-gray-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#16587B] hover:bg-[#124866] text-white rounded-lg font-bold shadow-xs transition-colors"
                >
                  Save Draft Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL: VIEW CREDIT NOTE */}
      {selectedCreditNote && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden border border-[#D1D7DB]">
            <div className="bg-[#16587B] text-white px-5 py-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-[#84B3CE] font-mono">GST Credit Note</span>
                <h2 className="text-base font-bold">{selectedCreditNote.creditNoteNumber}</h2>
              </div>
              <button onClick={() => setSelectedCreditNote(null)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              <div className="p-3 bg-[#FAF6EC] rounded-lg border border-[#E9EDEF] space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[#667781]">Customer:</span>
                  <span className="font-bold text-[#111B21]">{selectedCreditNote.customerName}</span>
                </div>
                {selectedCreditNote.customerGstin && (
                  <div className="flex justify-between">
                    <span className="text-[#667781]">GSTIN:</span>
                    <span className="font-mono text-[#111B21]">{selectedCreditNote.customerGstin}</span>
                  </div>
                )}
                {selectedCreditNote.invoiceNumber && (
                  <div className="flex justify-between">
                    <span className="text-[#667781]">Reference Invoice:</span>
                    <span className="font-mono text-[#111B21]">{selectedCreditNote.invoiceNumber}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[#667781]">Status:</span>
                  <span className="font-bold text-[#16587B]">{selectedCreditNote.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667781]">Reason:</span>
                  <span className="text-[#111B21]">{selectedCreditNote.reason}</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-xs text-[#111B21] mb-2">Item Breakdown</h4>
                <div className="border border-[#E9EDEF] rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#FAF6EC] text-[#667781] border-b border-[#E9EDEF]">
                      <tr>
                        <th className="py-2 px-3">Item</th>
                        <th className="py-2 px-3 text-center">Qty</th>
                        <th className="py-2 px-3 text-right">Taxable</th>
                        <th className="py-2 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9EDEF]">
                      {selectedCreditNote.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-medium text-[#111B21]">{item.productName}</td>
                          <td className="py-2 px-3 text-center">{item.quantity || item.returnedQuantity || 1}</td>
                          <td className="py-2 px-3 text-right font-mono">₹{(item.taxableAmount || 0).toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-[#16587B]">₹{item.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-3 bg-[#FAF6EC] rounded-lg border border-[#E9EDEF] space-y-1">
                <div className="flex justify-between text-[#667781]">
                  <span>Subtotal:</span>
                  <span className="font-mono">₹{selectedCreditNote.taxableTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[#667781]">
                  <span>Total Tax (GST):</span>
                  <span className="font-mono">₹{(selectedCreditNote.totalTax || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[#111B21] font-bold text-sm pt-1 border-t border-[#E9EDEF]">
                  <span>Credit Amount:</span>
                  <span className="text-[#16587B] font-mono">₹{(selectedCreditNote.totalCreditAmount || selectedCreditNote.creditAmount || 0).toFixed(2)}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setSelectedCreditNote(null)}
                  className="px-4 py-1.5 bg-[#16587B] text-white rounded-lg font-semibold hover:bg-[#124866] transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REFUND PAYOUT MODAL */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-[#D1D7DB]">
            <div className="bg-[#16587B] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-[#84B3CE]" />
                <h2 className="text-base font-bold">Refund Credit Note</h2>
              </div>
              <button onClick={() => setRefundTarget(null)} className="text-white/80 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleExecuteRefund} className="p-5 space-y-3.5 text-xs">
              <div className="p-3 bg-[#FAF6EC] rounded-lg border border-[#E9EDEF] space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#667781]">Credit Note:</span>
                  <span className="font-mono font-bold text-[#111B21]">{refundTarget.creditNoteNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667781]">Customer:</span>
                  <span className="font-semibold text-[#111B21]">{refundTarget.customerName}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-[#667781]">Refundable Credit:</span>
                  <span className="text-[#16587B] font-mono tabular-nums">
                    ₹{(refundTarget.remainingAmount ?? refundTarget.totalCreditAmount ?? refundTarget.creditAmount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#111B21] mb-1">Refund Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={refundTarget.remainingAmount ?? refundTarget.totalCreditAmount ?? refundTarget.creditAmount ?? 0}
                  required
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B] font-mono font-bold text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Refund Mode</label>
                  <select
                    value={refundMode}
                    onChange={(e) => setRefundMode(e.target.value as 'CASH' | 'BANK' | 'UPI')}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  >
                    <option value="BANK">Bank Transfer (NEFT/IMPS)</option>
                    <option value="UPI">UPI Refund</option>
                    <option value="CASH">Cash Counter Refund</option>
                  </select>
                </div>
                {refundMode !== 'CASH' && (
                  <div>
                    <label className="block font-medium text-[#111B21] mb-1">Source Account</label>
                    <select
                      value={refundBankAccountId}
                      onChange={(e) => setRefundBankAccountId(e.target.value)}
                      className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                    >
                      {bankAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.bankName} (₹{acc.currentBalance.toLocaleString('en-IN')})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-medium text-[#111B21] mb-1">Reference / UTR #</label>
                <input
                  type="text"
                  value={refundRef}
                  onChange={(e) => setRefundRef(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B] font-mono"
                />
              </div>

              <div className="pt-3 border-t border-[#E9EDEF] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRefundTarget(null)}
                  className="px-4 py-2 border border-[#D1D7DB] rounded-lg text-[#667781] hover:bg-gray-50 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#16587B] hover:bg-[#124866] text-white rounded-lg font-bold shadow-xs transition-colors cursor-pointer"
                >
                  Authorize Refund &amp; Post GL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
