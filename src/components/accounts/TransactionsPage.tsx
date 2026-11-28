/**
 * SLATE POS — Unified Accounting Transactions Register
 * Single searchable ledger across all sales, receipts, purchases, supplier payments,
 * credit notes, debit notes, expenses, banking, and manual journals with GL line drilldown.
 */

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { offlineStore } from '../../lib/offlineStore';
import { AccountingSourceType, UnifiedTransactionRow } from '../../types';
import { ArrowLeftRight, Search, Download, Eye, X, FileSpreadsheet } from 'lucide-react';

const SOURCE_TYPES: Array<{ id: AccountingSourceType | 'ALL'; label: string }> = [
  { id: 'ALL', label: 'All Transaction Types' },
  { id: 'SALES_INVOICE', label: 'Sales Invoices' },
  { id: 'CUSTOMER_PAYMENT', label: 'Customer Payments' },
  { id: 'CUSTOMER_RECEIPT', label: 'Customer Receipts' },
  { id: 'CUSTOMER_RECEIPT_REVERSAL', label: 'Customer Receipt Reversals' },
  { id: 'PURCHASE_BILL', label: 'Supplier Bills' },
  { id: 'SUPPLIER_PAYMENT', label: 'Supplier Payments' },
  { id: 'SUPPLIER_PAYMENT_REVERSAL', label: 'Supplier Payment Reversals' },
  { id: 'CREDIT_NOTE', label: 'Credit Notes' },
  { id: 'CREDIT_NOTE_REFUND', label: 'Credit Note Refunds' },
  { id: 'DEBIT_NOTE', label: 'Debit Notes / Purchase Returns' },
  { id: 'DEBIT_NOTE_REVERSAL', label: 'Debit Note Reversals' },
  { id: 'EXPENSE', label: 'Operating Expenses' },
  { id: 'BANK_TRANSACTION', label: 'Banking Movements' },
  { id: 'BANK_RECONCILIATION', label: 'Bank Reconciliation Adjustments' },
  { id: 'MANUAL_JOURNAL', label: 'Manual Journals' },
  { id: 'OPENING_BALANCE', label: 'Opening Balances' },
  { id: 'REVERSAL', label: 'Reversals' },
];

const fmtINR = (val: number) =>
  `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const TransactionsPage: React.FC = () => {
  const [tick, setTick] = useState(0);
  const [search, setSearch] = useState('');
  const [sourceType, setSourceType] = useState<AccountingSourceType | 'ALL'>('ALL');
  const [accountId, setAccountId] = useState('');
  const [branchId, setBranchId] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTx, setSelectedTx] = useState<UnifiedTransactionRow | null>(null);

  useEffect(() => {
    return offlineStore.subscribe(() => setTick((t) => t + 1));
  }, []);

  const accounts = useMemo(() => offlineStore.getChartOfAccounts(), [tick]);
  const branches = useMemo(() => offlineStore.getBranches(), [tick]);

  const rows = useMemo(
    () =>
      offlineStore.getUnifiedTransactions({
        search,
        sourceType,
        accountId: accountId || undefined,
        branchId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    [tick, search, sourceType, accountId, branchId, startDate, endDate]
  );

  const summary = useMemo(() => {
    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    return { count: rows.length, totalDebit, totalCredit };
  }, [rows]);

  const handleExport = (format: 'xlsx' | 'csv') => {
    const data = rows.map((r) => ({
      Date: r.date,
      VoucherNumber: r.voucherNumber,
      JournalNumber: r.journalNumber,
      Type: r.sourceType,
      Party: r.partyName || '',
      Description: r.description,
      Accounts: r.accountSummary,
      Debit: r.debit,
      Credit: r.credit,
      Status: r.status,
      PostedBy: r.postedBy || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    XLSX.writeFile(wb, `SLATE_POS_Transactions.${format}`, format === 'csv' ? { bookType: 'csv' } : undefined);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="bg-white p-4 rounded-xl border border-[#D1D7DB] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[#111B21] flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-[#16587B]" />
            <span>Unified Transactions Register</span>
          </h1>
          <p className="text-xs text-[#667781] mt-0.5">
            Every posted accounting event across Sales, Purchases, Banking, Expenses, Returns &amp; Journals linked directly to the General Ledger.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('xlsx')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#D1D7DB] bg-white hover:bg-[#FAF6EC] rounded-lg cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#16587B]" />
            <span>Export Excel</span>
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#D1D7DB] bg-white hover:bg-[#FAF6EC] rounded-lg cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#16587B]" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-xl border border-[#D1D7DB]">
          <div className="text-[11px] text-[#667781]">Matching Transactions</div>
          <div className="text-xl font-bold text-[#111B21] tabular-nums mt-1">{summary.count}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-[#D1D7DB]">
          <div className="text-[11px] text-[#667781]">Total Debits Posted</div>
          <div className="text-xl font-bold text-[#16587B] tabular-nums mt-1">{fmtINR(summary.totalDebit)}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-[#D1D7DB]">
          <div className="text-[11px] text-[#667781]">Total Credits Posted</div>
          <div className="text-xl font-bold text-[#16587B] tabular-nums mt-1">{fmtINR(summary.totalCredit)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-3.5 rounded-xl border border-[#D1D7DB] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs">
        <div className="relative lg:col-span-2">
          <Search className="w-4 h-4 text-[#8696A0] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search voucher, party, account, narration..."
            className="w-full pl-9 pr-3 py-2 border border-[#D1D7DB] rounded-lg"
          />
        </div>
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as any)}
          className="px-2.5 py-2 border border-[#D1D7DB] rounded-lg bg-white"
        >
          {SOURCE_TYPES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="px-2.5 py-2 border border-[#D1D7DB] rounded-lg bg-white"
        >
          <option value="">All Accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} — {a.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="px-2.5 py-2 border border-[#D1D7DB] rounded-lg"
          aria-label="Start Date"
        />
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="px-2.5 py-2 border border-[#D1D7DB] rounded-lg bg-white"
        >
          <option value="ALL">All Branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {/* Register Table */}
      <div className="bg-white rounded-xl border border-[#D1D7DB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[11px] font-semibold text-[#667781] uppercase">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Voucher / Journal</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Description &amp; Ledger Mapping</th>
                <th className="px-4 py-3 text-right">Debit (₹)</th>
                <th className="px-4 py-3 text-right">Credit (₹)</th>
                <th className="px-4 py-3 text-right">GL Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9EDEF]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[#667781]">
                    No accounting transactions match the selected filters.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-[#FAF6EC]/80">
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap text-[#54656F]">{r.date}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold text-[#16587B]">{r.voucherNumber}</div>
                      <div className="text-[10px] text-[#667781]">{r.journalNumber}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-[#111B21]">
                      {r.sourceType.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3 max-w-md">
                      <div className="font-medium text-[#111B21] truncate">{r.description}</div>
                      <div className="text-[11px] text-[#667781] truncate">{r.accountSummary}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtINR(r.debit)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtINR(r.credit)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedTx(r)}
                        className="p-1.5 text-[#16587B] hover:bg-[#84B3CE]/25 rounded cursor-pointer"
                        title="View General Ledger Breakdown"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* GL Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E9EDEF] bg-[#FAF6EC] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#111B21]">
                  {selectedTx.voucherNumber} ({selectedTx.journalNumber})
                </h3>
                <p className="text-[11px] text-[#667781]">
                  {selectedTx.sourceType.replace(/_/g, ' ')} · {selectedTx.date} · Posted by {selectedTx.postedBy || 'System'}
                </p>
              </div>
              <button onClick={() => setSelectedTx(null)} className="p-1 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <p className="text-[#111B21] font-medium">{selectedTx.description}</p>
              <div className="border border-[#D1D7DB] rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[11px] text-[#667781]">
                      <th className="px-3 py-2">Account</th>
                      <th className="px-3 py-2">Memo</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9EDEF]">
                    {selectedTx.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2 font-semibold">
                          {l.accountCode} — {l.accountName}
                        </td>
                        <td className="px-3 py-2 text-[#54656F]">{l.description}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.debit > 0 ? fmtINR(l.debit) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.credit > 0 ? fmtINR(l.credit) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
