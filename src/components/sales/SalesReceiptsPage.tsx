/**
 * SLATE POS — Standalone Sales Receipts & Customer Collections Module (/receipts)
 * Independent customer payment collection ledger supporting:
 * - Single/multi-invoice allocations & FIFO or unallocated advance tracking
 * - Atomic bank/cash drawer deposits & General Ledger double-entry posting
 * - Printable GST Payment Receipts & CSV export
 * - RBAC-gated receipt reversal with full AR, invoice, bank & GL reversal
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Receipt,
  Plus,
  Search,
  Download,
  Printer,
  RotateCcw,
  CheckCircle2,
  X,
  Building2,
  ArrowLeft,
  CreditCard,
  BookOpen,
} from 'lucide-react';
import { offlineStore } from '../../lib/offlineStore';
import { formatINR, formatDate, amountInWordsINR } from '../../lib/formatters';
import { hasPermission } from '../../lib/permissions';
import {
  Customer,
  CustomerReceipt,
  PaymentMode,
  Sale,
  BankAccount,
} from '../../types';
import { ModuleEmptyState, InlineErrorState } from '../common/LoadingSkeleton';

export const SalesReceiptsPage: React.FC = () => {
  const activeUser = offlineStore.getActiveUser();
  const currentOrg = offlineStore.getOrganization();
  const canCollect = hasPermission(activeUser, 'PAYMENTS_COLLECT');
  const canReverse = hasPermission(activeUser, 'REFUNDS_APPROVE');

  const [receipts, setReceipts] = useState<CustomerReceipt[]>(() => offlineStore.getCustomerReceipts());
  const [customers, setCustomers] = useState<Customer[]>(() => offlineStore.getCustomers());
  const [sales, setSales] = useState<Sale[]>(() => offlineStore.getSales());
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => offlineStore.getBankAccounts());

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'REVERSED'>('ALL');
  const [modeFilter, setModeFilter] = useState<string>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Create Receipt Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formCustomerId, setFormCustomerId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formMethod, setFormMethod] = useState<PaymentMode | 'NEFT/RTGS'>('UPI');
  const [formBankAccountId, setFormBankAccountId] = useState('');
  const [formReference, setFormReference] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [manualAllocations, setManualAllocations] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Reversal Modal State
  const [reversingReceipt, setReversingReceipt] = useState<CustomerReceipt | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  // Print Modal State
  const [printingReceipt, setPrintingReceipt] = useState<CustomerReceipt | null>(null);

  useEffect(() => {
    const sync = () => {
      setReceipts(offlineStore.getCustomerReceipts());
      setCustomers(offlineStore.getCustomers());
      setSales(offlineStore.getSales());
      setBankAccounts(offlineStore.getBankAccounts());
    };
    sync();
    return offlineStore.subscribe(sync);
  }, []);

  const filteredReceipts = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return receipts.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (modeFilter !== 'ALL' && r.paymentMethod !== modeFilter) return false;
      if (!q) return true;
      return (
        r.receiptNumber.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        (r.referenceNumber && r.referenceNumber.toLowerCase().includes(q)) ||
        (r.journalNumber && r.journalNumber.toLowerCase().includes(q))
      );
    });
  }, [receipts, searchTerm, statusFilter, modeFilter]);

  const activeReceipt = useMemo(() => {
    if (!selectedId) return null;
    return receipts.find((r) => r.id === selectedId) || null;
  }, [receipts, selectedId]);

  const kpis = useMemo(() => {
    const completed = receipts.filter((r) => r.status === 'COMPLETED');
    const totalCollected = completed.reduce((s, r) => s + r.amount, 0);
    const totalAllocated = completed.reduce((s, r) => s + (r.allocatedAmount || 0), 0);
    const totalAdvance = completed.reduce((s, r) => s + (r.unallocatedAdvance || 0), 0);
    const reversedCount = receipts.filter((r) => r.status === 'REVERSED').length;
    return { totalCollected, totalAllocated, totalAdvance, reversedCount };
  }, [receipts]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === formCustomerId) || null,
    [customers, formCustomerId]
  );

  const openCustomerInvoices = useMemo(() => {
    if (!formCustomerId) return [];
    return sales
      .filter((s) => {
        if (s.customerId !== formCustomerId) return false;
        if (s.paymentStatus === 'REFUNDED' || s.paymentStatus === 'PAID') return false;
        const paid = (s.payments || []).reduce((sum, p) => sum + p.amount, 0);
        return s.grandTotal - paid > 0.01;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [sales, formCustomerId]);

  const openCreateModal = () => {
    const defaultCust =
      customers.find((c) => (c.currentReceivableBalance ?? 0) > 0) || customers[0];
    setFormCustomerId(defaultCust?.id || '');
    setFormAmount(
      defaultCust && (defaultCust.currentReceivableBalance ?? 0) > 0
        ? String(defaultCust.currentReceivableBalance)
        : ''
    );
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormMethod('UPI');
    const primaryBank = bankAccounts.find((b) => b.isPrimary) || bankAccounts[0];
    setFormBankAccountId(primaryBank?.id || '');
    setFormReference(`RCPT-${Date.now().toString().slice(-6)}`);
    setFormNotes('');
    setManualAllocations({});
    setFormError(null);
    setIsCreateOpen(true);
  };

  const handleToggleInvoiceAllocation = (sale: Sale, checked: boolean) => {
    const paid = (sale.payments || []).reduce((s, p) => s + p.amount, 0);
    const unpaid = Math.max(0, Math.round((sale.grandTotal - paid) * 100) / 100);
    setManualAllocations((prev) => {
      const next = { ...prev };
      if (checked) {
        next[sale.id] = unpaid.toFixed(2);
      } else {
        delete next[sale.id];
      }
      const totalSelected = Object.values(next).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      if (totalSelected > 0) {
        setFormAmount(totalSelected.toFixed(2));
      }
      return next;
    });
  };

  const handleCreateReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const amt = parseFloat(formAmount);
    if (!formCustomerId) {
      setFormError('Please select a customer.');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError('Enter a valid receipt amount greater than ₹0.');
      return;
    }

    const explicitAllocs = Object.entries(manualAllocations)
      .map(([saleId, val]) => ({ saleId, amount: parseFloat(val) || 0 }))
      .filter((a) => a.amount > 0);

    const res = offlineStore.recordCustomerReceipt({
      customerId: formCustomerId,
      amount: amt,
      paymentMethod: formMethod,
      bankAccountId: formBankAccountId || undefined,
      receiptDate: formDate,
      referenceNumber: formReference.trim() || undefined,
      notes: formNotes.trim() || undefined,
      allocations: explicitAllocs.length > 0 ? explicitAllocs : undefined,
      receivedBy: activeUser?.id,
      receivedByName: activeUser?.name,
      orgId: currentOrg.id,
      branchId: activeUser?.branchId,
      sourceType: 'CUSTOMER_PAYMENT',
    });

    if (res.success && res.receipt) {
      setIsCreateOpen(false);
      setSelectedId(res.receipt.id);
      setFeedback({
        message: `Receipt ${res.receipt.receiptNumber} collected (${formatINR(res.receipt.amount)}) and posted to GL.`,
        type: 'success',
      });
      setTimeout(() => setFeedback(null), 5000);
    } else {
      setFormError(res.error || 'Failed to save customer receipt.');
    }
  };

  const handleConfirmReversal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingReceipt) return;
    if (!reversalReason.trim()) {
      setFeedback({ message: 'Please provide a clear reason for reversing this receipt.', type: 'error' });
      return;
    }

    const res = offlineStore.reverseCustomerReceipt(reversingReceipt.id, reversalReason.trim());
    if (res.success) {
      setReversingReceipt(null);
      setReversalReason('');
      setFeedback({
        message: `Receipt ${reversingReceipt.receiptNumber} reversed across customer AR, invoices, bank & GL.`,
        type: 'success',
      });
      setTimeout(() => setFeedback(null), 5000);
    } else {
      setFeedback({ message: res.error || 'Failed to reverse receipt.', type: 'error' });
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Receipt Number',
      'Date',
      'Customer',
      'Mode',
      'Deposit Account',
      'Reference',
      'Amount',
      'Allocated to Invoices',
      'Advance',
      'Status',
      'Journal #',
    ];
    const rows = filteredReceipts.map((r) => [
      r.receiptNumber,
      r.receiptDate,
      `"${r.customerName.replace(/"/g, '""')}"`,
      r.paymentMethod,
      `"${(r.bankAccountName || 'Counter Cash / Direct').replace(/"/g, '""')}"`,
      r.referenceNumber || '',
      r.amount.toFixed(2),
      (r.allocatedAmount || 0).toFixed(2),
      (r.unallocatedAdvance || 0).toFixed(2),
      r.status,
      r.journalNumber || '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SLATE_Customer_Receipts_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F5EEDD] overflow-y-auto">
      {/* Page Header */}
      <div className="bg-[#16587B] text-[#F5EEDD] px-4 sm:px-6 py-4 shrink-0 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-[#124866] rounded-md text-[#84B3CE]">
                <Receipt className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Customer Receipts</h1>
              <span className="text-xs bg-[#84B3CE] text-[#0F2D3D] font-semibold px-2 py-0.5 rounded">
                {currentOrg.name}
              </span>
            </div>
            <p className="text-xs text-[#F5EEDD]/85 mt-1">
              Record customer payments against open invoices or advance balances with instant bank &amp; General Ledger posting
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-2 bg-[#124866] hover:bg-[#0F405B] text-[#F5EEDD] text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer border border-[#84B3CE]/30"
            >
              <Download className="w-4 h-4 text-[#84B3CE]" />
              <span>Export CSV</span>
            </button>
            {canCollect && (
              <button
                type="button"
                onClick={openCreateModal}
                className="px-3.5 py-2 bg-[#84B3CE] hover:bg-[#9AC2D8] text-[#0F2D3D] text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Record Receipt</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-5 flex-1">
        {feedback && feedback.type === 'error' && (
          <InlineErrorState message={feedback.message} onDismiss={() => setFeedback(null)} />
        )}
        {feedback && feedback.type === 'success' && (
          <div className="p-3.5 rounded-lg text-xs font-medium flex items-center justify-between border bg-emerald-50 text-emerald-800 border-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{feedback.message}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs">
            <span className="text-xs font-medium text-[#405D6D]">Total Receipts Collected</span>
            <div className="mt-2 text-2xl font-bold text-[#16587B] tabular-nums">{formatINR(kpis.totalCollected)}</div>
            <div className="text-[11px] text-[#405D6D] mt-1">Completed customer collections</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs">
            <span className="text-xs font-medium text-[#405D6D]">Allocated to Invoices</span>
            <div className="mt-2 text-2xl font-bold text-emerald-700 tabular-nums">{formatINR(kpis.totalAllocated)}</div>
            <div className="text-[11px] text-[#405D6D] mt-1">Settled against open sales</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs">
            <span className="text-xs font-medium text-[#405D6D]">Customer Advances</span>
            <div className="mt-2 text-2xl font-bold text-[#111B21] tabular-nums">{formatINR(kpis.totalAdvance)}</div>
            <div className="text-[11px] text-[#405D6D] mt-1">Unallocated advance deposits</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs">
            <span className="text-xs font-medium text-[#405D6D]">Reversed Receipts</span>
            <div className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">{kpis.reversedCount}</div>
            <div className="text-[11px] text-[#405D6D] mt-1">Audited payment reversals</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-3.5 rounded-xl border border-[#D1D7DB] shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            {(['ALL', 'COMPLETED', 'REVERSED'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors ${
                  statusFilter === status
                    ? 'bg-[#16587B] text-[#F5EEDD]'
                    : 'bg-[#FAF6EC] text-[#405D6D] hover:bg-[#F5EEDD]'
                }`}
              >
                {status === 'ALL' ? 'All Receipts' : status === 'COMPLETED' ? 'Completed' : 'Reversed'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-[#D1D7DB] rounded-lg bg-white text-[#111B21]"
              aria-label="Filter by payment mode"
            >
              <option value="ALL">All Payment Modes</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="BANK">Bank Transfer</option>
              <option value="NEFT/RTGS">NEFT / RTGS</option>
              <option value="CARD">Card</option>
            </select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#405D6D] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search receipt #, customer, ref..."
                className="pl-8 pr-3 py-1.5 border border-[#D1D7DB] rounded-lg bg-[#FAF6EC] w-56 focus:outline-none focus:border-[#16587B]"
              />
            </div>
          </div>
        </div>

        {/* Master-Detail Ledger */}
        <div className="flex flex-col lg:flex-row gap-4">
          <div className={`${activeReceipt ? 'lg:w-[60%]' : 'w-full'} bg-white rounded-xl border border-[#D1D7DB] shadow-2xs overflow-hidden`}>
            {filteredReceipts.length === 0 ? (
              <ModuleEmptyState
                title="No customer receipts recorded"
                description="Collect payments against customer receivables or advance deposits to automatically update invoices, bank balances, and the General Ledger."
                actionLabel={canCollect ? 'Record First Receipt' : undefined}
                onAction={canCollect ? openCreateModal : undefined}
                icon={<Receipt className="w-6 h-6" />}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[11px] font-bold text-[#405D6D] uppercase">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Receipt #</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Mode / Account</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9EDEF]">
                    {filteredReceipts.map((r) => {
                      const isSelected = activeReceipt?.id === r.id;
                      return (
                        <tr
                          key={r.id}
                          onClick={() => setSelectedId(r.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-[#84B3CE]/20 border-l-4 border-l-[#16587B]' : 'hover:bg-[#FAF6EC]'
                          }`}
                        >
                          <td className="px-4 py-3 tabular-nums whitespace-nowrap text-[#405D6D]">
                            {formatDate(r.receiptDate)}
                          </td>
                          <td className="px-4 py-3 font-bold text-[#16587B] whitespace-nowrap">
                            <div>{r.receiptNumber}</div>
                            {r.journalNumber && (
                              <div className="text-[10px] font-normal text-[#405D6D]">{r.journalNumber}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold text-[#111B21]">
                            <div>{r.customerName}</div>
                            <div className="text-[10px] font-normal text-[#405D6D]">
                              {r.allocations.length > 0
                                ? `${r.allocations.length} invoice(s) settled`
                                : 'On-account / Opening AR'}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#84B3CE]/25 text-[#16587B]">
                              {r.paymentMethod}
                            </span>
                            {r.bankAccountName && (
                              <div className="text-[10px] text-[#405D6D] mt-0.5 truncate max-w-[140px]">
                                {r.bankAccountName}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-[#111B21]">
                            {formatINR(r.amount)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                r.status === 'COMPLETED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {activeReceipt && (
            <div className="lg:w-[40%] bg-white rounded-xl border border-[#D1D7DB] shadow-2xs p-5 space-y-4 text-xs self-start">
              <div className="flex items-start justify-between border-b border-[#E9EDEF] pb-3">
                <div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="lg:hidden inline-flex items-center gap-1 text-[#16587B] font-semibold mb-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                  </button>
                  <h2 className="text-base font-bold text-[#111B21]">{activeReceipt.receiptNumber}</h2>
                  <p className="text-[11px] text-[#405D6D]">
                    {formatDate(activeReceipt.receiptDate)} · Collected by {activeReceipt.createdByName || 'Staff'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPrintingReceipt(activeReceipt)}
                    className="px-2.5 py-1.5 border border-[#D1D7DB] hover:bg-[#FAF6EC] rounded-lg font-semibold text-[#16587B] flex items-center gap-1 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>
                  {canReverse && activeReceipt.status === 'COMPLETED' && (
                    <button
                      type="button"
                      onClick={() => {
                        setReversingReceipt(activeReceipt);
                        setReversalReason('');
                      }}
                      className="px-2.5 py-1.5 border border-red-200 bg-red-50 hover:bg-red-100 rounded-lg font-semibold text-red-700 flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reverse</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="p-1.5 text-[#405D6D] hover:text-[#111B21] cursor-pointer"
                    aria-label="Close detail pane"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-[#FAF6EC] p-3 rounded-lg border border-[#E9EDEF]">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#405D6D]">Customer</span>
                  <div className="font-bold text-[#111B21] mt-0.5">{activeReceipt.customerName}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#405D6D]">Amount Collected</span>
                  <div className="font-bold text-[#16587B] text-base tabular-nums mt-0.5">
                    {formatINR(activeReceipt.amount)}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#405D6D]">Deposit Account</span>
                  <div className="font-semibold text-[#111B21] mt-0.5">
                    {activeReceipt.bankAccountName || `${activeReceipt.paymentMethod} Register`}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#405D6D]">GL Voucher</span>
                  <div className="font-semibold text-[#16587B] mt-0.5 flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>{activeReceipt.journalNumber || 'Posted'}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-[#111B21] mb-2">Invoice Allocation Breakdown</h3>
                {activeReceipt.allocations.length === 0 ? (
                  <div className="p-3 bg-[#FAF6EC] rounded-lg border border-[#E9EDEF] text-[#405D6D]">
                    Settled against opening receivable balance / customer advance ({formatINR(activeReceipt.unallocatedAdvance || 0)} advance).
                  </div>
                ) : (
                  <div className="border border-[#E9EDEF] rounded-lg overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-[#FAF6EC] text-[10px] font-bold text-[#405D6D] uppercase">
                        <tr>
                          <th className="px-3 py-2">Invoice #</th>
                          <th className="px-3 py-2 text-right">Applied Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E9EDEF]">
                        {activeReceipt.allocations.map((a) => (
                          <tr key={a.saleId}>
                            <td className="px-3 py-2 font-semibold text-[#16587B]">{a.invoiceNumber}</td>
                            <td className="px-3 py-2 text-right font-bold tabular-nums">{formatINR(a.allocatedAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {activeReceipt.status === 'REVERSED' && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 space-y-1">
                  <div className="font-bold">Reversed on {formatDate(activeReceipt.reversedAt)}</div>
                  <div>By: {activeReceipt.reversedBy || 'Manager'}</div>
                  <div>Reason: {activeReceipt.reversalReason}</div>
                </div>
              )}

              {activeReceipt.notes && (
                <div className="text-[#405D6D]">
                  <span className="font-semibold text-[#111B21]">Notes:</span> {activeReceipt.notes}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Record Customer Receipt Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-xs">
            <div className="px-5 py-4 bg-[#FAF6EC] border-b border-[#E9EDEF] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#16587B]" />
                <h2 className="text-sm font-bold text-[#16587B]">Record Customer Receipt</h2>
              </div>
              <button onClick={() => setIsCreateOpen(false)} className="p-1 text-[#405D6D] hover:text-[#111B21] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateReceipt} className="p-5 space-y-4 overflow-y-auto flex-1">
              {formError && <InlineErrorState message={formError} onDismiss={() => setFormError(null)} />}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-semibold text-[#111B21] mb-1">Customer *</label>
                  <select
                    required
                    value={formCustomerId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setFormCustomerId(nextId);
                      setManualAllocations({});
                      const c = customers.find((item) => item.id === nextId);
                      if (c && (c.currentReceivableBalance ?? 0) > 0) {
                        setFormAmount(String(c.currentReceivableBalance));
                      }
                    }}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg bg-white"
                  >
                    <option value="">Select customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — Due: {formatINR(c.currentReceivableBalance ?? 0)}
                      </option>
                    ))}
                  </select>
                  {selectedCustomer && (
                    <div className="text-[11px] text-[#16587B] mt-1 font-medium tabular-nums">
                      Open Receivable: {formatINR(selectedCustomer.currentReceivableBalance ?? 0)}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-[#111B21] mb-1">Receipt Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg font-bold tabular-nums"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#111B21] mb-1">Receipt Date *</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#111B21] mb-1">Payment Mode *</label>
                  <select
                    value={formMethod}
                    onChange={(e) => setFormMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg bg-white"
                  >
                    <option value="UPI">UPI</option>
                    <option value="CASH">Cash</option>
                    <option value="BANK">Bank Transfer</option>
                    <option value="NEFT/RTGS">NEFT / RTGS</option>
                    <option value="CARD">Card</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#111B21] mb-1">Deposit To Bank / Cash Account</label>
                  <select
                    value={formBankAccountId}
                    onChange={(e) => setFormBankAccountId(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg bg-white"
                  >
                    <option value="">Default Ledger Account</option>
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bankName} ({b.accountType}) — {formatINR(b.currentBalance)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#111B21] mb-1">UTR / Reference #</label>
                  <input
                    type="text"
                    value={formReference}
                    onChange={(e) => setFormReference(e.target.value)}
                    placeholder="UTR, Cheque #, or Receipt Ref"
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg"
                  />
                </div>
              </div>

              {openCustomerInvoices.length > 0 && (
                <div className="border border-[#D1D7DB] rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-[#FAF6EC] border-b border-[#E9EDEF] font-bold text-[#16587B] flex items-center justify-between">
                    <span>Open Invoices for Allocation (Optional — FIFO if left unchecked)</span>
                    <span className="text-[10px] font-normal text-[#405D6D]">
                      {openCustomerInvoices.length} unpaid invoice(s)
                    </span>
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-[#E9EDEF]">
                    {openCustomerInvoices.map((inv) => {
                      const paid = (inv.payments || []).reduce((s, p) => s + p.amount, 0);
                      const unpaid = Math.max(0, Math.round((inv.grandTotal - paid) * 100) / 100);
                      const isChecked = inv.id in manualAllocations;
                      return (
                        <div key={inv.id} className="px-3 py-2 flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => handleToggleInvoiceAllocation(inv, e.target.checked)}
                            />
                            <span className="font-semibold text-[#111B21]">{inv.invoiceNumber}</span>
                            <span className="text-[#405D6D]">Due: {formatINR(unpaid)}</span>
                          </label>
                          {isChecked && (
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={unpaid}
                              value={manualAllocations[inv.id]}
                              onChange={(e) =>
                                setManualAllocations((prev) => ({ ...prev, [inv.id]: e.target.value }))
                              }
                              className="w-28 px-2 py-1 border border-[#D1D7DB] rounded text-right tabular-nums"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-[#111B21] mb-1">Notes</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Optional payment narration"
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-[#E9EDEF] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 border border-[#D1D7DB] rounded-lg font-semibold text-[#405D6D] hover:bg-[#FAF6EC] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] rounded-lg font-bold cursor-pointer shadow-xs"
                >
                  Save &amp; Post Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reversal Modal */}
      {reversingReceipt && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xl w-full max-w-md p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#E9EDEF] pb-2">
              <h3 className="text-sm font-bold text-red-700">Reverse Customer Receipt</h3>
              <button onClick={() => setReversingReceipt(null)} className="p-1 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[#405D6D]">
              Reversing <strong className="text-[#111B21]">{reversingReceipt.receiptNumber}</strong> ({formatINR(reversingReceipt.amount)}) will restore the customer receivable balance, re-open linked invoices, reverse the bank deposit, and post a reversing General Ledger journal.
            </p>
            <form onSubmit={handleConfirmReversal} className="space-y-3">
              <div>
                <label className="block font-semibold text-[#111B21] mb-1">Reversal Reason *</label>
                <input
                  type="text"
                  required
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g., Cheque dishonoured / Duplicate entry"
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReversingReceipt(null)}
                  className="px-3.5 py-1.5 border border-[#D1D7DB] rounded-lg font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold cursor-pointer"
                >
                  Confirm Reversal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable GST Payment Receipt Modal */}
      {printingReceipt && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-xs">
            <div className="px-4 py-3 bg-[#FAF6EC] border-b border-[#E9EDEF] flex items-center justify-between">
              <span className="font-bold text-[#16587B]">Payment Receipt Preview</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1 bg-[#16587B] text-[#F5EEDD] rounded font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
                <button
                  type="button"
                  onClick={() => setPrintingReceipt(null)}
                  className="p-1 text-[#405D6D] hover:text-[#111B21] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div id="thermal-receipt-print-area" className="p-6 space-y-4">
              <div className="flex justify-between items-start border-b border-[#D1D7DB] pb-3">
                <div>
                  <div className="text-base font-bold text-[#16587B] flex items-center gap-1.5">
                    <Building2 className="w-4 h-4" />
                    <span>{currentOrg.name}</span>
                  </div>
                  {currentOrg.gstin && <div className="text-[11px] text-[#405D6D]">GSTIN: {currentOrg.gstin}</div>}
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm text-[#111B21]">PAYMENT RECEIPT</div>
                  <div className="font-mono text-[#16587B] font-bold">{printingReceipt.receiptNumber}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-[#405D6D]">Received From:</span> <strong>{printingReceipt.customerName}</strong></div>
                <div className="text-right"><span className="text-[#405D6D]">Date:</span> <strong>{formatDate(printingReceipt.receiptDate)}</strong></div>
                <div><span className="text-[#405D6D]">Mode:</span> <strong>{printingReceipt.paymentMethod}</strong></div>
                <div className="text-right"><span className="text-[#405D6D]">Reference:</span> <strong>{printingReceipt.referenceNumber || '—'}</strong></div>
              </div>
              <div className="p-3 bg-[#FAF6EC] border border-[#D1D7DB] rounded-lg flex items-center justify-between">
                <span className="font-semibold text-[#111B21]">Amount Received</span>
                <span className="text-lg font-bold text-[#16587B] tabular-nums">{formatINR(printingReceipt.amount)}</span>
              </div>
              <div className="text-[11px] text-[#405D6D]">
                Amount in Words: <strong className="text-[#111B21]">{amountInWordsINR(printingReceipt.amount)}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
