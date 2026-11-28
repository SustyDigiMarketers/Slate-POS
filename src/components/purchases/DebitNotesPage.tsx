/**
 * SLATE POS — Standalone Supplier Debit Notes & Purchase Returns Module (/debit-notes)
 * Strictly handles vendor-side Debit Notes & Purchase Returns (independent from Customer Credit Notes).
 * Supports Draft -> Approved -> Issued -> Cancelled workflow with atomic inventory, AP, Bill, Input GST & GL posting.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  FileMinus2,
  Plus,
  Search,
  Download,
  Printer,
  CheckCircle2,
  X,
  Trash2,
  Building2,
  BookOpen,
  ShieldCheck,
  Send,
  Ban,
} from 'lucide-react';
import { offlineStore } from '../../lib/offlineStore';
import { formatINR, formatDate, amountInWordsINR } from '../../lib/formatters';
import { hasPermission } from '../../lib/permissions';
import {
  DebitNote,
  DebitNoteStatus,
  Product,
  Supplier,
  SupplierBill,
} from '../../types';
import { ModuleEmptyState, InlineErrorState } from '../common/LoadingSkeleton';

export const DebitNotesPage: React.FC = () => {
  const activeUser = offlineStore.getActiveUser();
  const currentOrg = offlineStore.getOrganization();
  const canManage = hasPermission(activeUser, 'DEBIT_NOTES_MANAGE');

  const [debitNotes, setDebitNotes] = useState<DebitNote[]>(() => offlineStore.getDebitNotes());
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => offlineStore.getSuppliers());
  const [bills, setBills] = useState<SupplierBill[]>(() => offlineStore.getSupplierBills());
  const [products, setProducts] = useState<Product[]>(() => offlineStore.getProducts());

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<DebitNoteStatus | 'ALL'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Create Debit Note Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [dnSupplierId, setDnSupplierId] = useState('');
  const [dnBillId, setDnBillId] = useState('');
  const [dnReason, setDnReason] = useState('DAMAGED_GOODS');
  const [dnDeductInventory, setDnDeductInventory] = useState(true);
  const [dnNotes, setDnNotes] = useState('');
  const [dnItems, setDnItems] = useState<Array<{ productId: string; quantity: number; unitPrice: number; gstRate: number }>>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // Cancel / Reverse Modal
  const [cancellingDn, setCancellingDn] = useState<DebitNote | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Print Preview Modal
  const [printingDn, setPrintingDn] = useState<DebitNote | null>(null);

  useEffect(() => {
    const sync = () => {
      setDebitNotes(offlineStore.getDebitNotes());
      setSuppliers(offlineStore.getSuppliers());
      setBills(offlineStore.getSupplierBills());
      setProducts(offlineStore.getProducts());
    };
    sync();
    return offlineStore.subscribe(sync);
  }, []);

  const filteredNotes = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return debitNotes.filter((dn) => {
      if (statusFilter !== 'ALL' && dn.status !== statusFilter) return false;
      if (!q) return true;
      return (
        dn.debitNoteNumber.toLowerCase().includes(q) ||
        dn.supplierName.toLowerCase().includes(q) ||
        (dn.billNumber && dn.billNumber.toLowerCase().includes(q)) ||
        dn.reason.toLowerCase().includes(q)
      );
    });
  }, [debitNotes, searchTerm, statusFilter]);

  const activeNote = useMemo(() => {
    if (!selectedId) return null;
    return debitNotes.find((d) => d.id === selectedId) || null;
  }, [debitNotes, selectedId]);

  const kpis = useMemo(() => {
    const issued = debitNotes.filter((d) => d.status === 'ISSUED');
    const pending = debitNotes.filter((d) => d.status === 'DRAFT' || d.status === 'APPROVED');
    const issuedValue = issued.reduce((s, d) => s + d.totalAmount, 0);
    const gstReversed = issued.reduce((s, d) => s + d.cgstTotal + d.sgstTotal + d.igstTotal, 0);
    return {
      totalCount: debitNotes.length,
      issuedValue,
      pendingCount: pending.length,
      gstReversed,
    };
  }, [debitNotes]);

  const supplierBillsForDropdown = useMemo(
    () => bills.filter((b) => !dnSupplierId || b.supplierId === dnSupplierId),
    [bills, dnSupplierId]
  );

  const previewTotals = useMemo(() => {
    let taxable = 0;
    let gst = 0;
    for (const item of dnItems) {
      const sub = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
      const tax = (sub * (Number(item.gstRate) || 0)) / 100;
      taxable += sub;
      gst += tax;
    }
    return { taxable, gst, total: taxable + gst };
  }, [dnItems]);

  const openCreateModal = () => {
    setDnSupplierId(suppliers[0]?.id || '');
    setDnBillId('');
    setDnReason('DAMAGED_GOODS');
    setDnDeductInventory(true);
    setDnNotes('');
    const firstProd = products[0];
    setDnItems(
      firstProd
        ? [{ productId: firstProd.id, quantity: 1, unitPrice: firstProd.costPrice || 50, gstRate: firstProd.taxRate || 18 }]
        : []
    );
    setFormError(null);
    setIsCreateOpen(true);
  };

  const handleAddLine = () => {
    const p = products[0];
    if (!p) return;
    setDnItems((prev) => [
      ...prev,
      { productId: p.id, quantity: 1, unitPrice: p.costPrice || 50, gstRate: p.taxRate || 18 },
    ]);
  };

  const handleLineChange = (index: number, field: string, value: any) => {
    setDnItems((prev) => {
      const next = [...prev];
      if (field === 'productId') {
        const prod = products.find((p) => p.id === value);
        if (prod) {
          next[index] = {
            ...next[index],
            productId: prod.id,
            unitPrice: prod.costPrice || 50,
            gstRate: prod.taxRate || 18,
          };
        }
      } else {
        next[index] = { ...next[index], [field]: value };
      }
      return next;
    });
  };

  const submitDebitNote = (mode: 'DRAFT' | 'ISSUE') => {
    setFormError(null);
    if (!dnSupplierId || dnItems.length === 0) {
      setFormError('Select a supplier and add at least one return line item.');
      return;
    }
    const payload = {
      supplierId: dnSupplierId,
      supplierBillId: dnBillId || undefined,
      reason: dnReason,
      items: dnItems,
      deductInventory: dnDeductInventory,
      notes: dnNotes.trim() || undefined,
      orgId: currentOrg.id,
      branchId: activeUser?.branchId,
    };

    const res =
      mode === 'DRAFT'
        ? offlineStore.createDebitNoteDraft(payload)
        : offlineStore.createAndIssueDebitNote(payload);

    if (res.success && res.debitNote) {
      setIsCreateOpen(false);
      setSelectedId(res.debitNote.id);
      setFeedback({
        message:
          mode === 'DRAFT'
            ? `Debit Note ${res.debitNote.debitNoteNumber} saved as Draft.`
            : `Debit Note ${res.debitNote.debitNoteNumber} issued (${formatINR(res.debitNote.totalAmount)}), AP & GL updated.`,
        type: 'success',
      });
      setTimeout(() => setFeedback(null), 5000);
    } else {
      setFormError(res.error || 'Failed to save debit note.');
    }
  };

  const handleApprove = (dn: DebitNote) => {
    const res = offlineStore.approveDebitNote(dn.id);
    if (res.success) {
      setFeedback({ message: `Debit Note ${dn.debitNoteNumber} approved.`, type: 'success' });
      setTimeout(() => setFeedback(null), 4000);
    } else {
      setFeedback({ message: res.error || 'Approval failed.', type: 'error' });
    }
  };

  const handleIssue = (dn: DebitNote) => {
    const res = offlineStore.issueDebitNote(dn.id);
    if (res.success) {
      setFeedback({
        message: `Debit Note ${dn.debitNoteNumber} issued! AP, stock & GL voucher posted.`,
        type: 'success',
      });
      setTimeout(() => setFeedback(null), 5000);
    } else {
      setFeedback({ message: res.error || 'Issuance failed.', type: 'error' });
    }
  };

  const handleConfirmCancel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingDn) return;
    if (!cancelReason.trim()) {
      setFeedback({ message: 'Cancellation reason is required.', type: 'error' });
      return;
    }
    const res = offlineStore.cancelDebitNote(cancellingDn.id, cancelReason.trim());
    if (res.success) {
      setCancellingDn(null);
      setCancelReason('');
      setFeedback({
        message: `Debit Note ${cancellingDn.debitNoteNumber} cancelled and financial impact reversed.`,
        type: 'success',
      });
      setTimeout(() => setFeedback(null), 5000);
    } else {
      setFeedback({ message: res.error || 'Cancellation failed.', type: 'error' });
    }
  };

  const handleExportCsv = () => {
    const headers = ['Debit Note #', 'Date', 'Supplier', 'Bill Ref', 'Reason', 'Taxable', 'Input GST Rev', 'Total', 'Status'];
    const rows = filteredNotes.map((d) => [
      d.debitNoteNumber,
      d.issueDate,
      `"${d.supplierName.replace(/"/g, '""')}"`,
      d.billNumber || '',
      d.reason,
      d.taxableTotal.toFixed(2),
      (d.cgstTotal + d.sgstTotal + d.igstTotal).toFixed(2),
      d.totalAmount.toFixed(2),
      d.status,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SLATE_Supplier_Debit_Notes_${new Date().toISOString().slice(0, 10)}.csv`;
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
                <FileMinus2 className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Debit Notes &amp; Purchase Returns</h1>
              <span className="text-xs bg-[#84B3CE] text-[#0F2D3D] font-semibold px-2 py-0.5 rounded">
                {currentOrg.name}
              </span>
            </div>
            <p className="text-xs text-[#F5EEDD]/85 mt-1">
              Manage vendor returns and supplier debit notes with Draft, Approve, Issue, Input GST reversal &amp; GL reconciliation
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
                <span>New Debit Note</span>
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
            <span className="text-xs font-medium text-[#405D6D]">Total Debit Notes</span>
            <div className="mt-2 text-2xl font-bold text-[#111B21] tabular-nums">{kpis.totalCount}</div>
            <div className="text-[11px] text-[#405D6D] mt-1">All purchase return vouchers</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs">
            <span className="text-xs font-medium text-[#405D6D]">Issued Return Value</span>
            <div className="mt-2 text-2xl font-bold text-[#16587B] tabular-nums">{formatINR(kpis.issuedValue)}</div>
            <div className="text-[11px] text-[#405D6D] mt-1">Posted to Supplier AP &amp; GL</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs">
            <span className="text-xs font-medium text-[#405D6D]">Draft / Pending Issue</span>
            <div className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">{kpis.pendingCount}</div>
            <div className="text-[11px] text-[#405D6D] mt-1">Awaiting approval or issuance</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs">
            <span className="text-xs font-medium text-[#405D6D]">Input GST Reversed</span>
            <div className="mt-2 text-2xl font-bold text-emerald-700 tabular-nums">{formatINR(kpis.gstReversed)}</div>
            <div className="text-[11px] text-[#405D6D] mt-1">ITC adjustment on issued notes</div>
          </div>
        </div>

        {/* Status Tabs & Search */}
        <div className="bg-white p-3.5 rounded-xl border border-[#D1D7DB] shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(['ALL', 'DRAFT', 'APPROVED', 'ISSUED', 'CANCELLED'] as const).map((status) => (
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
                {status === 'ALL' ? 'All' : status}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#405D6D] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search debit note #, vendor, bill..."
              className="pl-8 pr-3 py-1.5 border border-[#D1D7DB] rounded-lg bg-[#FAF6EC] w-56 focus:outline-none focus:border-[#16587B]"
            />
          </div>
        </div>

        {/* Master-Detail */}
        <div className="flex flex-col lg:flex-row gap-4">
          <div className={`${activeNote ? 'lg:w-[58%]' : 'w-full'} bg-white rounded-xl border border-[#D1D7DB] shadow-2xs overflow-hidden`}>
            {filteredNotes.length === 0 ? (
              <ModuleEmptyState
                title="No supplier debit notes found"
                description="Create a Debit Note for damaged goods, short supply, or vendor rate adjustments to adjust supplier payables, inventory, and Input GST."
                actionLabel={canManage ? 'Create First Debit Note' : undefined}
                onAction={canManage ? openCreateModal : undefined}
                icon={<FileMinus2 className="w-6 h-6" />}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[11px] font-bold text-[#405D6D] uppercase">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Debit Note #</th>
                      <th className="px-4 py-3">Supplier</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9EDEF]">
                    {filteredNotes.map((dn) => {
                      const isSelected = activeNote?.id === dn.id;
                      return (
                        <tr
                          key={dn.id}
                          onClick={() => setSelectedId(dn.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-[#84B3CE]/20 border-l-4 border-l-[#16587B]' : 'hover:bg-[#FAF6EC]'
                          }`}
                        >
                          <td className="px-4 py-3 tabular-nums whitespace-nowrap text-[#405D6D]">
                            {formatDate(dn.issueDate)}
                          </td>
                          <td className="px-4 py-3 font-bold text-[#16587B] whitespace-nowrap">
                            <div>{dn.debitNoteNumber}</div>
                            {dn.billNumber && <div className="text-[10px] font-normal text-[#405D6D]">Bill: {dn.billNumber}</div>}
                          </td>
                          <td className="px-4 py-3 font-semibold text-[#111B21]">{dn.supplierName}</td>
                          <td className="px-4 py-3 text-[#405D6D]">{dn.reason.replace(/_/g, ' ')}</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-[#111B21]">
                            {formatINR(dn.totalAmount)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                dn.status === 'ISSUED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : dn.status === 'APPROVED'
                                  ? 'bg-blue-100 text-blue-800'
                                  : dn.status === 'CANCELLED'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {dn.status}
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

          {activeNote && (
            <div className="lg:w-[42%] bg-white rounded-xl border border-[#D1D7DB] shadow-2xs p-5 space-y-4 text-xs self-start">
              <div className="flex items-start justify-between border-b border-[#E9EDEF] pb-3">
                <div>
                  <h2 className="text-base font-bold text-[#111B21]">{activeNote.debitNoteNumber}</h2>
                  <p className="text-[11px] text-[#405D6D]">
                    {formatDate(activeNote.issueDate)} · {activeNote.supplierName}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <button
                    type="button"
                    onClick={() => setPrintingDn(activeNote)}
                    className="px-2.5 py-1.5 border border-[#D1D7DB] hover:bg-[#FAF6EC] rounded-lg font-semibold text-[#16587B] flex items-center gap-1 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>
                  {canManage && activeNote.status === 'DRAFT' && (
                    <button
                      type="button"
                      onClick={() => handleApprove(activeNote)}
                      className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                  )}
                  {canManage && (activeNote.status === 'DRAFT' || activeNote.status === 'APPROVED') && (
                    <button
                      type="button"
                      onClick={() => handleIssue(activeNote)}
                      className="px-2.5 py-1.5 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Issue</span>
                    </button>
                  )}
                  {canManage && activeNote.status !== 'CANCELLED' && (
                    <button
                      type="button"
                      onClick={() => {
                        setCancellingDn(activeNote);
                        setCancelReason('');
                      }}
                      className="px-2.5 py-1.5 border border-red-200 bg-red-50 hover:bg-red-100 rounded-lg font-semibold text-red-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Cancel</span>
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
                  <span className="text-[10px] uppercase font-bold text-[#405D6D]">Taxable Return</span>
                  <div className="font-bold text-[#111B21] tabular-nums mt-0.5">{formatINR(activeNote.taxableTotal)}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#405D6D]">Input GST Reversed</span>
                  <div className="font-bold text-[#16587B] tabular-nums mt-0.5">
                    {formatINR(activeNote.cgstTotal + activeNote.sgstTotal + activeNote.igstTotal)}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#405D6D]">Total Debit Note</span>
                  <div className="font-bold text-base text-[#16587B] tabular-nums mt-0.5">{formatINR(activeNote.totalAmount)}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#405D6D]">GL Voucher</span>
                  <div className="font-semibold text-[#111B21] mt-0.5 flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5 text-[#16587B]" />
                    <span>{activeNote.journalNumber || (activeNote.status === 'ISSUED' ? 'Posted' : 'Not Posted Yet')}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-[#111B21] mb-2">Returned Items ({activeNote.items.length})</h3>
                <div className="border border-[#E9EDEF] rounded-lg overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-[#FAF6EC] text-[10px] font-bold text-[#405D6D] uppercase">
                      <tr>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9EDEF]">
                      {activeNote.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-[#111B21]">{item.productName}</div>
                            <div className="text-[10px] text-[#405D6D]">GST {item.gstRate}%</div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatINR(item.unitPrice)}</td>
                          <td className="px-3 py-2 text-right font-bold tabular-nums">{formatINR(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {activeNote.status === 'CANCELLED' && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 space-y-1">
                  <div className="font-bold">Cancelled on {formatDate(activeNote.cancelledAt)}</div>
                  <div>Reason: {activeNote.cancelReason}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Debit Note Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden text-xs">
            <div className="px-5 py-4 bg-[#FAF6EC] border-b border-[#E9EDEF] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileMinus2 className="w-4 h-4 text-[#16587B]" />
                <h2 className="text-sm font-bold text-[#16587B]">New Supplier Debit Note / Purchase Return</h2>
              </div>
              <button onClick={() => setIsCreateOpen(false)} className="p-1 text-[#405D6D] hover:text-[#111B21] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {formError && <InlineErrorState message={formError} onDismiss={() => setFormError(null)} />}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block font-semibold text-[#111B21] mb-1">Supplier *</label>
                  <select
                    value={dnSupplierId}
                    onChange={(e) => {
                      setDnSupplierId(e.target.value);
                      setDnBillId('');
                    }}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg bg-white"
                  >
                    <option value="">Select supplier...</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#111B21] mb-1">Linked Supplier Bill (Optional)</label>
                  <select
                    value={dnBillId}
                    onChange={(e) => setDnBillId(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg bg-white"
                  >
                    <option value="">No specific bill</option>
                    {supplierBillsForDropdown.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.billNumber} (Due: {formatINR(b.outstandingAmount)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#111B21] mb-1">Return Reason *</label>
                  <select
                    value={dnReason}
                    onChange={(e) => setDnReason(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg bg-white"
                  >
                    <option value="DAMAGED_GOODS">Damaged Goods</option>
                    <option value="DEFECTIVE_QUALITY">Defective Quality</option>
                    <option value="SHORT_SUPPLY">Short Supply / Missing Qty</option>
                    <option value="EXCESS_RATE_CHARGED">Rate Overcharge</option>
                    <option value="EXPIRED_STOCK">Expired Stock Return</option>
                    <option value="OTHER">Other Purchase Adjustment</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 font-semibold text-[#111B21] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dnDeductInventory}
                    onChange={(e) => setDnDeductInventory(e.target.checked)}
                  />
                  <span>Deduct stock quantities from active inventory upon issue</span>
                </label>
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="px-3 py-1.5 bg-[#FAF6EC] hover:bg-[#84B3CE]/25 border border-[#D1D7DB] rounded-lg font-semibold text-[#16587B] flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Line Item
                </button>
              </div>

              <div className="border border-[#D1D7DB] rounded-lg overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[10px] font-bold text-[#405D6D] uppercase">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 w-20 text-right">Qty</th>
                      <th className="px-3 py-2 w-28 text-right">Unit Cost (₹)</th>
                      <th className="px-3 py-2 w-20 text-right">GST %</th>
                      <th className="px-3 py-2 w-28 text-right">Line Total</th>
                      <th className="px-3 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9EDEF]">
                    {dnItems.map((line, idx) => {
                      const sub = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
                      const lineTotal = sub + (sub * (Number(line.gstRate) || 0)) / 100;
                      return (
                        <tr key={idx}>
                          <td className="px-3 py-2">
                            <select
                              value={line.productId}
                              onChange={(e) => handleLineChange(idx, 'productId', e.target.value)}
                              className="w-full px-2 py-1 border border-[#D1D7DB] rounded bg-white"
                            >
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="1"
                              value={line.quantity}
                              onChange={(e) => handleLineChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border border-[#D1D7DB] rounded text-right tabular-nums"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.unitPrice}
                              onChange={(e) => handleLineChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border border-[#D1D7DB] rounded text-right tabular-nums"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={line.gstRate}
                              onChange={(e) => handleLineChange(idx, 'gstRate', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border border-[#D1D7DB] rounded text-right tabular-nums"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-bold tabular-nums">{formatINR(lineTotal)}</td>
                          <td className="px-3 py-2 text-center">
                            {dnItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setDnItems((prev) => prev.filter((_, i) => i !== idx))}
                                className="text-red-600 hover:text-red-800 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FAF6EC] p-3.5 rounded-lg border border-[#E9EDEF]">
                <input
                  type="text"
                  value={dnNotes}
                  onChange={(e) => setDnNotes(e.target.value)}
                  placeholder="Optional debit note notes or transport docket #"
                  className="flex-1 px-3 py-2 border border-[#D1D7DB] rounded-lg bg-white"
                />
                <div className="flex items-center gap-4 tabular-nums">
                  <div>Taxable: <strong>{formatINR(previewTotals.taxable)}</strong></div>
                  <div>GST: <strong>{formatINR(previewTotals.gst)}</strong></div>
                  <div className="text-sm font-bold text-[#16587B]">Total: {formatINR(previewTotals.total)}</div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-[#FAF6EC] border-t border-[#E9EDEF] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="px-4 py-2 border border-[#D1D7DB] rounded-lg font-semibold text-[#405D6D] hover:bg-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submitDebitNote('DRAFT')}
                className="px-4 py-2 bg-white border border-[#16587B] text-[#16587B] hover:bg-[#84B3CE]/20 rounded-lg font-bold cursor-pointer"
              >
                Save as Draft
              </button>
              <button
                type="button"
                onClick={() => submitDebitNote('ISSUE')}
                className="px-4 py-2 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] rounded-lg font-bold cursor-pointer shadow-xs"
              >
                Issue &amp; Post Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel / Reverse Modal */}
      {cancellingDn && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xl w-full max-w-md p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#E9EDEF] pb-2">
              <h3 className="text-sm font-bold text-red-700">Cancel Debit Note</h3>
              <button onClick={() => setCancellingDn(null)} className="p-1 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[#405D6D]">
              Cancelling <strong className="text-[#111B21]">{cancellingDn.debitNoteNumber}</strong>
              {cancellingDn.status === 'ISSUED'
                ? ' will restore supplier payables, linked bill balance, returned inventory quantities, and post a reversing General Ledger journal.'
                : ' will mark this draft/approved debit note as CANCELLED.'}
            </p>
            <form onSubmit={handleConfirmCancel} className="space-y-3">
              <div>
                <label className="block font-semibold text-[#111B21] mb-1">Cancellation Reason *</label>
                <input
                  type="text"
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g., Supplier replaced damaged goods directly"
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancellingDn(null)}
                  className="px-3.5 py-1.5 border border-[#D1D7DB] rounded-lg font-semibold cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold cursor-pointer"
                >
                  Confirm Cancellation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Debit Note Voucher Modal */}
      {printingDn && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-xs">
            <div className="px-4 py-3 bg-[#FAF6EC] border-b border-[#E9EDEF] flex items-center justify-between">
              <span className="font-bold text-[#16587B]">Debit Note Preview</span>
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
                  onClick={() => setPrintingDn(null)}
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
                  <div className="font-bold text-sm text-[#111B21]">DEBIT NOTE</div>
                  <div className="font-mono text-[#16587B] font-bold">{printingDn.debitNoteNumber}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-[#405D6D]">Supplier:</span> <strong>{printingDn.supplierName}</strong></div>
                <div className="text-right"><span className="text-[#405D6D]">Date:</span> <strong>{formatDate(printingDn.issueDate)}</strong></div>
                <div><span className="text-[#405D6D]">Reason:</span> <strong>{printingDn.reason.replace(/_/g, ' ')}</strong></div>
                <div className="text-right"><span className="text-[#405D6D]">Status:</span> <strong>{printingDn.status}</strong></div>
              </div>
              <div className="p-3 bg-[#FAF6EC] border border-[#D1D7DB] rounded-lg flex items-center justify-between">
                <span className="font-semibold text-[#111B21]">Total Debit Value</span>
                <span className="text-lg font-bold text-[#16587B] tabular-nums">{formatINR(printingDn.totalAmount)}</span>
              </div>
              <div className="text-[11px] text-[#405D6D]">
                Amount in Words: <strong className="text-[#111B21]">{amountInWordsINR(printingDn.totalAmount)}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
