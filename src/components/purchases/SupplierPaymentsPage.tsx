/**
 * SLATE POS — Standalone Supplier Payments & Vendor Disbursements Module (/payments)
 * Independent AP settlement ledger supporting:
 * - Single/multi-bill allocations OR on-account advance vendor payments
 * - Cash drawer & bank account balance deduction + General Ledger posting
 * - Printable Supplier Payment Voucher & CSV export
 * - RBAC-gated reversal restoring AP, bill balances, cash/bank & GL
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  Plus,
  Search,
  Download,
  Printer,
  RotateCcw,
  CheckCircle2,
  X,
  Building2,
  BookOpen,
  CreditCard,
} from 'lucide-react';
import { offlineStore } from '../../lib/offlineStore';
import { formatINR, formatDate, amountInWordsINR } from '../../lib/formatters';
import { hasPermission } from '../../lib/permissions';
import {
  Supplier,
  SupplierBill,
  SupplierPayment,
  BankAccount,
  PaymentMode,
} from '../../types';
import { ModuleEmptyState, InlineErrorState } from '../common/LoadingSkeleton';

export const SupplierPaymentsPage: React.FC = () => {
  const activeUser = offlineStore.getActiveUser();
  const currentOrg = offlineStore.getOrganization();
  const canManage = hasPermission(activeUser, 'SUPPLIER_BILLS_MANAGE');

  const [payments, setPayments] = useState<SupplierPayment[]>(() => offlineStore.getSupplierPayments());
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => offlineStore.getSuppliers());
  const [bills, setBills] = useState<SupplierBill[]>(() => offlineStore.getSupplierBills());
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => offlineStore.getBankAccounts());

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'REVERSED'>('ALL');
  const [modeFilter, setModeFilter] = useState<string>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Create Payment Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formIsAdvance, setFormIsAdvance] = useState(false);
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formMethod, setFormMethod] = useState<PaymentMode | 'NEFT/RTGS' | 'CHEQUE'>('BANK');
  const [formBankAccountId, setFormBankAccountId] = useState('');
  const [formReference, setFormReference] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [billAllocations, setBillAllocations] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Reversal Modal State
  const [reversingPayment, setReversingPayment] = useState<SupplierPayment | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  // Print Modal State
  const [printingPayment, setPrintingPayment] = useState<SupplierPayment | null>(null);

  useEffect(() => {
    const sync = () => {
      setPayments(offlineStore.getSupplierPayments());
      setSuppliers(offlineStore.getSuppliers());
      setBills(offlineStore.getSupplierBills());
      setBankAccounts(offlineStore.getBankAccounts());
    };
    sync();
    return offlineStore.subscribe(sync);
  }, []);

  const filteredPayments = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return payments.filter((p) => {
      const status = p.status || 'COMPLETED';
      if (statusFilter !== 'ALL' && status !== statusFilter) return false;
      if (modeFilter !== 'ALL' && p.paymentMethod !== modeFilter) return false;
      if (!q) return true;
      return (
        p.paymentNumber.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q) ||
        (p.billNumber && p.billNumber.toLowerCase().includes(q)) ||
        (p.referenceNumber && p.referenceNumber.toLowerCase().includes(q))
      );
    });
  }, [payments, searchTerm, statusFilter, modeFilter]);

  const activePayment = useMemo(() => {
    if (!selectedId) return null;
    return payments.find((p) => p.id === selectedId) || null;
  }, [payments, selectedId]);

  const kpis = useMemo(() => {
    const completed = payments.filter((p) => (p.status || 'COMPLETED') === 'COMPLETED');
    const totalDisbursed = completed.reduce((s, p) => s + p.amount, 0);
    const totalAdvances = completed.filter((p) => p.isAdvance).reduce((s, p) => s + p.amount, 0);
    const settledAgainstBills = Math.max(0, totalDisbursed - totalAdvances);
    const totalOpenAp = bills.reduce((s, b) => s + b.outstandingAmount, 0);
    return { totalDisbursed, settledAgainstBills, totalAdvances, totalOpenAp };
  }, [payments, bills]);

  const openSupplierBills = useMemo(() => {
    if (!formSupplierId) return [];
    return bills.filter((b) => b.supplierId === formSupplierId && b.status !== 'PAID' && b.outstandingAmount > 0.01);
  }, [bills, formSupplierId]);

  const openCreateModal = () => {
    const defaultSup =
      suppliers.find((s) => (s.currentPayableBalance ?? s.outstandingBalance ?? 0) > 0) || suppliers[0];
    setFormSupplierId(defaultSup?.id || '');
    setFormIsAdvance(false);
    setFormAmount(
      defaultSup && (defaultSup.currentPayableBalance ?? defaultSup.outstandingBalance ?? 0) > 0
        ? String(defaultSup.currentPayableBalance ?? defaultSup.outstandingBalance ?? 0)
        : ''
    );
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormMethod('BANK');
    const primaryBank = bankAccounts.find((b) => b.isPrimary) || bankAccounts[0];
    setFormBankAccountId(primaryBank?.id || '');
    setFormReference(`NEFT-${Date.now().toString().slice(-6)}`);
    setFormNotes('');
    setBillAllocations({});
    setFormError(null);
    setIsCreateOpen(true);
  };

  const handleToggleBillAlloc = (bill: SupplierBill, checked: boolean) => {
    setBillAllocations((prev) => {
      const next = { ...prev };
      if (checked) {
        next[bill.id] = bill.outstandingAmount.toFixed(2);
      } else {
        delete next[bill.id];
      }
      const sum = Object.values(next).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      if (sum > 0) {
        setFormAmount(sum.toFixed(2));
      }
      return next;
    });
  };

  const handleCreatePayment = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const amt = parseFloat(formAmount);
    if (!formSupplierId) {
      setFormError('Please select a supplier.');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError('Enter a valid payment amount greater than ₹0.');
      return;
    }

    const allocations = !formIsAdvance
      ? Object.entries(billAllocations)
          .map(([billId, val]) => ({ billId, amount: parseFloat(val) || 0 }))
          .filter((a) => a.amount > 0)
      : [];

    const res = offlineStore.recordSupplierPayment({
      supplierId: formSupplierId,
      amount: amt,
      paymentMethod: formMethod,
      paymentDate: formDate,
      bankAccountId: formBankAccountId || undefined,
      referenceNumber: formReference.trim() || undefined,
      notes: formNotes.trim() || undefined,
      allocations: allocations.length > 0 ? allocations : undefined,
      isAdvance: formIsAdvance || allocations.length === 0,
      paidBy: activeUser?.id || 'usr_system',
      paidByName: activeUser?.name || 'Accounts Officer',
      orgId: currentOrg.id,
      branchId: activeUser?.branchId,
    });

    if (res.success && res.payment) {
      setIsCreateOpen(false);
      setSelectedId(res.payment.id);
      setFeedback({
        message: `Supplier payment ${res.payment.paymentNumber} (${formatINR(res.payment.amount)}) recorded and posted to GL.`,
        type: 'success',
      });
      setTimeout(() => setFeedback(null), 5000);
    } else {
      setFormError(res.error || 'Failed to record supplier payment.');
    }
  };

  const handleConfirmReversal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingPayment) return;
    if (!reversalReason.trim()) {
      setFeedback({ message: 'Please provide a reason for reversing this payment.', type: 'error' });
      return;
    }
    const res = offlineStore.reverseSupplierPayment(reversingPayment.id, reversalReason.trim());
    if (res.success) {
      setReversingPayment(null);
      setReversalReason('');
      setFeedback({
        message: `Payment ${reversingPayment.paymentNumber} reversed across AP, bills, bank/cash & GL.`,
        type: 'success',
      });
      setTimeout(() => setFeedback(null), 5000);
    } else {
      setFeedback({ message: res.error || 'Failed to reverse supplier payment.', type: 'error' });
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Payment #',
      'Date',
      'Supplier',
      'Bills Settled',
      'Mode',
      'Paid From Account',
      'Reference',
      'Amount',
      'Advance',
      'Status',
    ];
    const rows = filteredPayments.map((p) => [
      p.paymentNumber,
      p.paymentDate,
      `"${p.supplierName.replace(/"/g, '""')}"`,
      `"${(p.billNumber || 'Advance').replace(/"/g, '""')}"`,
      p.paymentMethod,
      `"${(p.bankAccountName || 'Direct').replace(/"/g, '""')}"`,
      p.referenceNumber || '',
      p.amount.toFixed(2),
      p.isAdvance ? 'YES' : 'NO',
      p.status || 'COMPLETED',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SLATE_Supplier_Payments_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F5EEDD] overflow-y-auto">
      {/* Header */}
      <div className="bg-[#16587B] text-[#F5EEDD] px-4 sm:px-6 py-4 shrink-0 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-[#124866] rounded-md text-[#84B3CE]">
                <Wallet className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Supplier Payments</h1>
              <span className="text-xs bg-[#84B3CE] text-[#0F2D3D] font-semibold px-2 py-0.5 rounded">
                {currentOrg.name}
              </span>
            </div>
            <p className="text-xs text-[#F5EEDD]/85 mt-1">
              Disburse vendor payments against pending bills or on-account advances with real-time bank, AP &amp; GL reconciliation
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
            {canManage && (
              <button
                type="button"
                onClick={openCreateModal}
                className="px-3.5 py-2 bg-[#84B3CE] hover:bg-[#9AC2D8] text-[#0F2D3D] text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Record Payment</span>
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
            <span className="text-xs font-medium text-[#405D6D]">Total Vendor Payouts</span>
            <div className="mt-2 text-2xl font-bold text-[#16587B] tabular-nums">{formatINR(kpis.totalDisbursed)}</div>
            <div className="text-[11px] text-[#405D6D] mt-1">Completed disbursements</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs">
            <span className="text-xs font-medium text-[#405D6D]">Settled Against Bills</span>
            <div className="mt-2 text-2xl font-bold text-emerald-700 tabular-nums">{formatINR(kpis.settledAgainstBills)}</div>
            <div className="text-[11px] text-[#405D6D] mt-1">Matched to supplier bills</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs">
            <span className="text-xs font-medium text-[#405D6D]">Vendor Advances</span>
            <div className="mt-2 text-2xl font-bold text-[#111B21] tabular-nums">{formatINR(kpis.totalAdvances)}</div>
            <div className="text-[11px] text-[#405D6D] mt-1">On-account prepayments</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs">
            <span className="text-xs font-medium text-[#405D6D]">Open Accounts Payable</span>
            <div className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">{formatINR(kpis.totalOpenAp)}</div>
            <div className="text-[11px] text-[#405D6D] mt-1">Remaining unpaid bills</div>
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
                {status === 'ALL' ? 'All Payments' : status === 'COMPLETED' ? 'Completed' : 'Reversed'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-[#D1D7DB] rounded-lg bg-white text-[#111B21]"
              aria-label="Filter by payment method"
            >
              <option value="ALL">All Payment Methods</option>
              <option value="BANK">Bank Transfer</option>
              <option value="NEFT/RTGS">NEFT / RTGS</option>
              <option value="UPI">UPI</option>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CARD">Card</option>
            </select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#405D6D] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search payment #, vendor, bill..."
                className="pl-8 pr-3 py-1.5 border border-[#D1D7DB] rounded-lg bg-[#FAF6EC] w-56 focus:outline-none focus:border-[#16587B]"
              />
            </div>
          </div>
        </div>

        {/* Master-Detail */}
        <div className="flex flex-col lg:flex-row gap-4">
          <div className={`${activePayment ? 'lg:w-[60%]' : 'w-full'} bg-white rounded-xl border border-[#D1D7DB] shadow-2xs overflow-hidden`}>
            {filteredPayments.length === 0 ? (
              <ModuleEmptyState
                title="No supplier payments recorded"
                description="Pay pending vendor bills or log advance disbursements to keep supplier payables, bank accounts, and the General Ledger reconciled."
                actionLabel={canManage ? 'Record First Payment' : undefined}
                onAction={canManage ? openCreateModal : undefined}
                icon={<Wallet className="w-6 h-6" />}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[11px] font-bold text-[#405D6D] uppercase">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Payment #</th>
                      <th className="px-4 py-3">Supplier</th>
                      <th className="px-4 py-3">Bill Ref</th>
                      <th className="px-4 py-3">Paid From</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9EDEF]">
                    {filteredPayments.map((p) => {
                      const isSelected = activePayment?.id === p.id;
                      const status = p.status || 'COMPLETED';
                      return (
                        <tr
                          key={p.id}
                          onClick={() => setSelectedId(p.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-[#84B3CE]/20 border-l-4 border-l-[#16587B]' : 'hover:bg-[#FAF6EC]'
                          }`}
                        >
                          <td className="px-4 py-3 tabular-nums whitespace-nowrap text-[#405D6D]">
                            {formatDate(p.paymentDate)}
                          </td>
                          <td className="px-4 py-3 font-bold text-[#16587B] whitespace-nowrap">{p.paymentNumber}</td>
                          <td className="px-4 py-3 font-semibold text-[#111B21]">{p.supplierName}</td>
                          <td className="px-4 py-3 font-mono text-[#405D6D]">{p.billNumber || 'Advance'}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#84B3CE]/25 text-[#16587B]">
                              {p.paymentMethod}
                            </span>
                            {p.bankAccountName && (
                              <div className="text-[10px] text-[#405D6D] mt-0.5 truncate max-w-[140px]">
                                {p.bankAccountName}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-[#111B21]">
                            {formatINR(p.amount)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                status === 'COMPLETED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {status}
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

          {activePayment && (
            <div className="lg:w-[40%] bg-white rounded-xl border border-[#D1D7DB] shadow-2xs p-5 space-y-4 text-xs self-start">
              <div className="flex items-start justify-between border-b border-[#E9EDEF] pb-3">
                <div>
                  <h2 className="text-base font-bold text-[#111B21]">{activePayment.paymentNumber}</h2>
                  <p className="text-[11px] text-[#405D6D]">
                    {formatDate(activePayment.paymentDate)} · Paid by {activePayment.createdByName || 'Staff'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPrintingPayment(activePayment)}
                    className="px-2.5 py-1.5 border border-[#D1D7DB] hover:bg-[#FAF6EC] rounded-lg font-semibold text-[#16587B] flex items-center gap-1 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Voucher</span>
                  </button>
                  {canManage && (activePayment.status || 'COMPLETED') === 'COMPLETED' && (
                    <button
                      type="button"
                      onClick={() => {
                        setReversingPayment(activePayment);
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
                  <span className="text-[10px] uppercase font-bold text-[#405D6D]">Supplier</span>
                  <div className="font-bold text-[#111B21] mt-0.5">{activePayment.supplierName}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#405D6D]">Disbursed Amount</span>
                  <div className="font-bold text-[#16587B] text-base tabular-nums mt-0.5">
                    {formatINR(activePayment.amount)}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#405D6D]">Paid From</span>
                  <div className="font-semibold text-[#111B21] mt-0.5">
                    {activePayment.bankAccountName || activePayment.paymentMethod}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#405D6D]">Reference #</span>
                  <div className="font-mono text-[#111B21] mt-0.5">{activePayment.referenceNumber || '—'}</div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-[#111B21] mb-2">Settled Supplier Bills</h3>
                {activePayment.allocatedBills && activePayment.allocatedBills.length > 0 ? (
                  <div className="border border-[#E9EDEF] rounded-lg overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-[#FAF6EC] text-[10px] font-bold text-[#405D6D] uppercase">
                        <tr>
                          <th className="px-3 py-2">Bill #</th>
                          <th className="px-3 py-2 text-right">Settled</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E9EDEF]">
                        {activePayment.allocatedBills.map((b) => (
                          <tr key={b.billId}>
                            <td className="px-3 py-2 font-mono font-semibold text-[#16587B]">{b.billNumber}</td>
                            <td className="px-3 py-2 text-right font-bold tabular-nums">{formatINR(b.allocatedAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-3 bg-[#FAF6EC] rounded-lg border border-[#E9EDEF] text-[#405D6D]">
                    {activePayment.billNumber && activePayment.billNumber !== 'ADVANCE'
                      ? `Bill Reference: ${activePayment.billNumber}`
                      : 'Advance / On-Account Supplier Payment'}
                  </div>
                )}
              </div>

              {activePayment.status === 'REVERSED' && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 space-y-1">
                  <div className="font-bold">Reversed on {formatDate(activePayment.reversedAt)}</div>
                  <div>By: {activePayment.reversedBy || 'Manager'}</div>
                  <div>Reason: {activePayment.reversalReason}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Record Payment Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-xs">
            <div className="px-5 py-4 bg-[#FAF6EC] border-b border-[#E9EDEF] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#16587B]" />
                <h2 className="text-sm font-bold text-[#16587B]">Record Supplier Payment</h2>
              </div>
              <button onClick={() => setIsCreateOpen(false)} className="p-1 text-[#405D6D] hover:text-[#111B21] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePayment} className="p-5 space-y-4 overflow-y-auto flex-1">
              {formError && <InlineErrorState message={formError} onDismiss={() => setFormError(null)} />}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-semibold text-[#111B21] mb-1">Supplier *</label>
                  <select
                    required
                    value={formSupplierId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setFormSupplierId(id);
                      setBillAllocations({});
                      const s = suppliers.find((item) => item.id === id);
                      const due = s?.currentPayableBalance ?? s?.outstandingBalance ?? 0;
                      if (due > 0) setFormAmount(String(due));
                    }}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg bg-white"
                  >
                    <option value="">Select supplier...</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — AP: {formatINR(s.currentPayableBalance ?? s.outstandingBalance ?? 0)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#111B21] mb-1">Payment Amount (₹) *</label>
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
                  <label className="block font-semibold text-[#111B21] mb-1">Payment Date *</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#111B21] mb-1">Payment Method *</label>
                  <select
                    value={formMethod}
                    onChange={(e) => setFormMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg bg-white"
                  >
                    <option value="BANK">Bank Transfer</option>
                    <option value="NEFT/RTGS">NEFT / RTGS</option>
                    <option value="UPI">UPI</option>
                    <option value="CASH">Cash</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CARD">Corporate Card</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#111B21] mb-1">Paid From Bank / Cash Account</label>
                  <select
                    value={formBankAccountId}
                    onChange={(e) => setFormBankAccountId(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg bg-white"
                  >
                    <option value="">Direct Ledger Settlement</option>
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bankName} ({b.accountType}) — {formatINR(b.currentBalance)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#111B21] mb-1">Reference / Cheque #</label>
                  <input
                    type="text"
                    value={formReference}
                    onChange={(e) => setFormReference(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 font-semibold text-[#16587B] cursor-pointer">
                <input
                  type="checkbox"
                  checked={formIsAdvance}
                  onChange={(e) => setFormIsAdvance(e.target.checked)}
                />
                <span>Record as Advance / On-Account Payment (not tied to specific bills)</span>
              </label>

              {!formIsAdvance && openSupplierBills.length > 0 && (
                <div className="border border-[#D1D7DB] rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-[#FAF6EC] border-b border-[#E9EDEF] font-bold text-[#16587B]">
                    Pending Supplier Bills ({openSupplierBills.length})
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-[#E9EDEF]">
                    {openSupplierBills.map((bill) => {
                      const isChecked = bill.id in billAllocations;
                      return (
                        <div key={bill.id} className="px-3 py-2 flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => handleToggleBillAlloc(bill, e.target.checked)}
                            />
                            <span className="font-mono font-semibold text-[#111B21]">{bill.billNumber}</span>
                            <span className="text-[#405D6D]">Outstanding: {formatINR(bill.outstandingAmount)}</span>
                          </label>
                          {isChecked && (
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={bill.outstandingAmount}
                              value={billAllocations[bill.id]}
                              onChange={(e) =>
                                setBillAllocations((prev) => ({ ...prev, [bill.id]: e.target.value }))
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
                  Save &amp; Post Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reversal Modal */}
      {reversingPayment && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xl w-full max-w-md p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#E9EDEF] pb-2">
              <h3 className="text-sm font-bold text-red-700">Reverse Supplier Payment</h3>
              <button onClick={() => setReversingPayment(null)} className="p-1 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[#405D6D]">
              Reversing <strong className="text-[#111B21]">{reversingPayment.paymentNumber}</strong> ({formatINR(reversingPayment.amount)}) restores supplier payable balances, re-opens settled bills, refunds the bank/cash drawer, and posts a reversing GL voucher.
            </p>
            <form onSubmit={handleConfirmReversal} className="space-y-3">
              <div>
                <label className="block font-semibold text-[#111B21] mb-1">Reversal Reason *</label>
                <input
                  type="text"
                  required
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g., Bounced cheque / Incorrect vendor"
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReversingPayment(null)}
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

      {/* Printable Payment Voucher Modal */}
      {printingPayment && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-xs">
            <div className="px-4 py-3 bg-[#FAF6EC] border-b border-[#E9EDEF] flex items-center justify-between">
              <span className="font-bold text-[#16587B]">Payment Voucher Preview</span>
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
                  onClick={() => setPrintingPayment(null)}
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
                  <div className="font-bold text-sm text-[#111B21]">PAYMENT VOUCHER</div>
                  <div className="font-mono text-[#16587B] font-bold">{printingPayment.paymentNumber}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-[#405D6D]">Paid To:</span> <strong>{printingPayment.supplierName}</strong></div>
                <div className="text-right"><span className="text-[#405D6D]">Date:</span> <strong>{formatDate(printingPayment.paymentDate)}</strong></div>
                <div><span className="text-[#405D6D]">Mode:</span> <strong>{printingPayment.paymentMethod}</strong></div>
                <div className="text-right"><span className="text-[#405D6D]">Bill Ref:</span> <strong>{printingPayment.billNumber || 'Advance'}</strong></div>
              </div>
              <div className="p-3 bg-[#FAF6EC] border border-[#D1D7DB] rounded-lg flex items-center justify-between">
                <span className="font-semibold text-[#111B21]">Amount Paid</span>
                <span className="text-lg font-bold text-[#16587B] tabular-nums">{formatINR(printingPayment.amount)}</span>
              </div>
              <div className="text-[11px] text-[#405D6D]">
                Amount in Words: <strong className="text-[#111B21]">{amountInWordsINR(printingPayment.amount)}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
