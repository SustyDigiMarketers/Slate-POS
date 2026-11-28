/**
 * SLATE POS — Financial Statements, Tax Reports & Audit Center
 * Renders all 10 accounting reports strictly from posted Double-Entry General Ledger entries:
 * 1. Financial Overview | 2. Profit & Loss | 3. Balance Sheet | 4. Cash Flow | 5. Trial Balance
 * 6. General Ledger | 7. Accounts Receivable | 8. Accounts Payable | 9. GST & Tax Reports | 10. Audit Trail
 */

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { offlineStore } from '../../lib/offlineStore';
import {
  BarChart3,
  Download,
  Printer,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';

export type FinancialReportTab =
  | 'OVERVIEW'
  | 'PL'
  | 'BS'
  | 'CF'
  | 'TB'
  | 'GL'
  | 'AR'
  | 'AP'
  | 'GST'
  | 'AUDIT';

interface FinancialReportsPageProps {
  initialTab?: FinancialReportTab;
}

const REPORT_TABS: Array<{ id: FinancialReportTab; label: string }> = [
  { id: 'OVERVIEW', label: 'Overview' },
  { id: 'PL', label: 'Profit & Loss' },
  { id: 'BS', label: 'Balance Sheet' },
  { id: 'CF', label: 'Cash Flow' },
  { id: 'TB', label: 'Trial Balance' },
  { id: 'GL', label: 'General Ledger' },
  { id: 'AR', label: 'Receivables (AR)' },
  { id: 'AP', label: 'Payables (AP)' },
  { id: 'GST', label: 'GST & Tax' },
  { id: 'AUDIT', label: 'Audit Trail' },
];

const fmtINR = (val: number) =>
  `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const FinancialReportsPage: React.FC<FinancialReportsPageProps> = ({ initialTab = 'OVERVIEW' }) => {
  const [activeTab, setActiveTab] = useState<FinancialReportTab>(initialTab);
  const [tick, setTick] = useState(0);
  const [branchId, setBranchId] = useState('ALL');
  const [startDate, setStartDate] = useState('2026-04-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [glAccountFilter, setGlAccountFilter] = useState('');

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    return offlineStore.subscribe(() => setTick((t) => t + 1));
  }, []);

  const branches = useMemo(() => offlineStore.getBranches(), [tick]);
  const accounts = useMemo(() => offlineStore.getChartOfAccounts(), [tick]);
  const customers = useMemo(() => offlineStore.getCustomers(), [tick]);
  const suppliers = useMemo(() => offlineStore.getSuppliers(), [tick]);
  const sales = useMemo(() => offlineStore.getSales(), [tick]);
  const bills = useMemo(() => offlineStore.getSupplierBills(), [tick]);
  const auditLogs = useMemo(() => offlineStore.getFinancialAuditLogs(), [tick]);

  const opts = useMemo(() => ({ branchId, startDate, endDate }), [branchId, startDate, endDate]);
  const trialBalance = useMemo(() => offlineStore.getTrialBalance(opts), [tick, opts]);
  const pnl = useMemo(() => offlineStore.getProfitAndLoss(opts), [tick, opts]);
  const balanceSheet = useMemo(() => offlineStore.getBalanceSheet({ branchId, asOfDate: endDate }), [tick, branchId, endDate]);
  const cashFlow = useMemo(() => offlineStore.getCashFlowStatement(opts), [tick, opts]);
  const gstReport = useMemo(() => offlineStore.getGstReport(opts), [tick, opts]);
  const glEntries = useMemo(
    () =>
      offlineStore.getGeneralLedger({
        branchId,
        startDate,
        endDate,
        accountId: glAccountFilter || undefined,
      }),
    [tick, branchId, startDate, endDate, glAccountFilter]
  );

  const handleExportCurrentReport = () => {
    let rows: Record<string, any>[] = [];
    if (activeTab === 'TB') {
      rows = trialBalance.rows.map((r) => ({
        Code: r.accountCode,
        Account: r.accountName,
        Class: r.accountClass,
        PeriodDebit: r.periodDebit,
        PeriodCredit: r.periodCredit,
        ClosingDebit: r.closingDebit,
        ClosingCredit: r.closingCredit,
      }));
    } else if (activeTab === 'PL') {
      rows = [
        ...pnl.incomeRows.map((r) => ({ Section: 'Income', Code: r.accountCode, Account: r.accountName, Amount: r.amount })),
        ...pnl.directExpenseRows.map((r) => ({ Section: 'Direct Expense', Code: r.accountCode, Account: r.accountName, Amount: r.amount })),
        ...pnl.operatingExpenseRows.map((r) => ({ Section: 'Operating Expense', Code: r.accountCode, Account: r.accountName, Amount: r.amount })),
        { Section: 'SUMMARY', Code: '', Account: 'Net Profit / (Loss)', Amount: pnl.netProfit },
      ];
    } else if (activeTab === 'BS') {
      rows = [
        ...balanceSheet.assetRows.map((r) => ({ Section: 'Asset', Code: r.accountCode, Account: r.accountName, Amount: r.amount })),
        ...balanceSheet.liabilityRows.map((r) => ({ Section: 'Liability', Code: r.accountCode, Account: r.accountName, Amount: r.amount })),
        ...balanceSheet.equityRows.map((r) => ({ Section: 'Equity', Code: r.accountCode, Account: r.accountName, Amount: r.amount })),
        { Section: 'Equity', Code: 'NET', Account: 'Current Period Net Profit', Amount: balanceSheet.currentPeriodNetProfit },
      ];
    } else if (activeTab === 'GL') {
      rows = glEntries.map((e) => ({
        Date: e.entryDate,
        Journal: e.journalNumber,
        Account: `${e.accountCode} ${e.accountName}`,
        Source: e.sourceType,
        Description: e.description,
        Debit: e.debit,
        Credit: e.credit,
      }));
    } else if (activeTab === 'AR') {
      rows = customers.map((c) => ({
        Customer: c.name,
        Phone: c.phone,
        GSTIN: c.gstin || '',
        CreditLimit: c.creditLimit,
        ReceivableBalance: c.currentReceivableBalance,
      }));
    } else if (activeTab === 'AP') {
      rows = bills.map((b) => ({
        BillNumber: b.billNumber,
        Supplier: b.supplierName,
        BillDate: b.billDate,
        DueDate: b.dueDate,
        Total: b.totalAmount,
        Paid: b.paidAmount,
        Outstanding: b.outstandingAmount,
        Status: b.status,
      }));
    } else if (activeTab === 'GST') {
      rows = [
        { Head: 'Output CGST', Amount: gstReport.outputCgst },
        { Head: 'Output SGST', Amount: gstReport.outputSgst },
        { Head: 'Output IGST', Amount: gstReport.outputIgst },
        { Head: 'Input CGST', Amount: gstReport.inputCgst },
        { Head: 'Input SGST', Amount: gstReport.inputSgst },
        { Head: 'Input IGST', Amount: gstReport.inputIgst },
        { Head: 'Net GST Payable / (Credit)', Amount: gstReport.netPayableGst },
      ];
    } else {
      rows = auditLogs.map((l) => ({
        Timestamp: l.timestamp,
        Module: l.module,
        Action: l.action,
        Entity: l.entityNumber || l.entityId,
        Actor: l.actorName,
        Role: l.actorRole,
        Summary: l.summary,
      }));
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab);
    XLSX.writeFile(wb, `SLATE_POS_${activeTab}_${startDate}_${endDate}.xlsx`);
  };

  const totalAr = customers.reduce((s, c) => s + (c.currentReceivableBalance || 0), 0);
  const totalAp = bills.reduce((s, b) => s + (b.outstandingAmount || 0), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-[#D1D7DB] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[#111B21] flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#16587B]" />
            <span>Financial Statements, Tax Reports &amp; Audit</span>
          </h1>
          <p className="text-xs text-[#667781] mt-0.5">
            Real-time accounting reports generated directly from balanced General Ledger postings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2.5 py-1.5 border border-[#D1D7DB] rounded-lg"
          />
          <span className="text-[#667781]">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2.5 py-1.5 border border-[#D1D7DB] rounded-lg"
          />
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="px-2.5 py-1.5 border border-[#D1D7DB] rounded-lg bg-white"
          >
            <option value="ALL">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleExportCurrentReport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#16587B] hover:bg-[#124866] text-white font-semibold rounded-lg cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#D1D7DB] bg-white hover:bg-[#FAF6EC] font-semibold rounded-lg cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Report Tabs */}
      <div className="bg-white p-1.5 rounded-xl border border-[#D1D7DB] flex items-center gap-1 overflow-x-auto no-scrollbar">
        {REPORT_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === t.id
                ? 'bg-[#16587B] text-white'
                : 'text-[#54656F] hover:text-[#111B21] hover:bg-[#FAF6EC]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 1. FINANCIAL OVERVIEW */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-[#D1D7DB]">
              <div className="text-[11px] text-[#667781]">Net Revenue (GL)</div>
              <div className="text-xl font-bold text-[#16587B] tabular-nums mt-1">{fmtINR(pnl.totalIncome)}</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-[#D1D7DB]">
              <div className="text-[11px] text-[#667781]">Net Profit / (Loss)</div>
              <div className={`text-xl font-bold tabular-nums mt-1 ${pnl.netProfit >= 0 ? 'text-[#16587B]' : 'text-rose-700'}`}>
                {fmtINR(pnl.netProfit)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-[#D1D7DB]">
              <div className="text-[11px] text-[#667781]">Total Assets</div>
              <div className="text-xl font-bold text-[#111B21] tabular-nums mt-1">{fmtINR(balanceSheet.totalAssets)}</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-[#D1D7DB]">
              <div className="text-[11px] text-[#667781]">Net GST Payable</div>
              <div className="text-xl font-bold text-[#111B21] tabular-nums mt-1">{fmtINR(gstReport.netPayableGst)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-xl border border-[#D1D7DB] space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#111B21]">Accounting Integrity Verification</h2>
                {trialBalance.isBalanced && balanceSheet.isBalanced ? (
                  <span className="inline-flex items-center gap-1 text-[#16587B] font-bold">
                    <CheckCircle2 className="w-4 h-4" /> Balanced Books
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                    <AlertTriangle className="w-4 h-4" /> Imbalance Detected
                  </span>
                )}
              </div>
              <div className="divide-y divide-[#E9EDEF]">
                <div className="py-2 flex justify-between">
                  <span className="text-[#667781]">Trial Balance Total Debits</span>
                  <span className="font-bold tabular-nums">{fmtINR(trialBalance.totalDebit)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-[#667781]">Trial Balance Total Credits</span>
                  <span className="font-bold tabular-nums">{fmtINR(trialBalance.totalCredit)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-[#667781]">Balance Sheet Assets</span>
                  <span className="font-bold tabular-nums">{fmtINR(balanceSheet.totalAssets)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-[#667781]">Liabilities + Equity + Net Profit</span>
                  <span className="font-bold tabular-nums">{fmtINR(balanceSheet.totalLiabilitiesAndEquity)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-[#D1D7DB] space-y-3 text-xs">
              <h2 className="text-sm font-bold text-[#111B21]">Working Capital Snapshot</h2>
              <div className="divide-y divide-[#E9EDEF]">
                <div className="py-2 flex justify-between">
                  <span className="text-[#667781]">Accounts Receivable (Customer Dues)</span>
                  <span className="font-bold tabular-nums text-[#16587B]">{fmtINR(totalAr)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-[#667781]">Accounts Payable (Supplier Dues)</span>
                  <span className="font-bold tabular-nums text-rose-700">{fmtINR(totalAp)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-[#667781]">Net Cash Change (Period)</span>
                  <span className="font-bold tabular-nums">{fmtINR(cashFlow.netCashChange)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-[#667781]">Posted GL Entries</span>
                  <span className="font-bold tabular-nums">{glEntries.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. PROFIT & LOSS */}
      {activeTab === 'PL' && (
        <div className="bg-white rounded-xl border border-[#D1D7DB] p-5 space-y-5 text-xs">
          <div className="border-b border-[#E9EDEF] pb-3 flex justify-between items-center">
            <div>
              <h2 className="text-base font-bold text-[#111B21]">Statement of Profit &amp; Loss</h2>
              <p className="text-[11px] text-[#667781]">Period: {pnl.startDate} to {pnl.endDate}</p>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-[#667781]">Net Profit / (Loss)</div>
              <div className={`text-lg font-bold tabular-nums ${pnl.netProfit >= 0 ? 'text-[#16587B]' : 'text-rose-700'}`}>
                {fmtINR(pnl.netProfit)}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="font-bold text-[#16587B] uppercase tracking-wider text-[11px] mb-2">Operating Revenue &amp; Income</div>
              {pnl.incomeRows.length === 0 ? (
                <div className="text-[#667781] py-2">No income accounts posted in this period.</div>
              ) : (
                pnl.incomeRows.map((r) => (
                  <div key={r.accountId} className="flex justify-between py-1.5 border-b border-[#E9EDEF]/60">
                    <span>{r.accountCode} — {r.accountName}</span>
                    <span className="font-semibold tabular-nums">{fmtINR(r.amount)}</span>
                  </div>
                ))
              )}
              <div className="flex justify-between py-2 font-bold bg-[#FAF6EC] px-2 rounded mt-1">
                <span>Total Income</span>
                <span className="tabular-nums">{fmtINR(pnl.totalIncome)}</span>
              </div>
            </div>

            <div>
              <div className="font-bold text-[#54656F] uppercase tracking-wider text-[11px] mb-2">Cost of Goods Sold (Direct Expenses)</div>
              {pnl.directExpenseRows.map((r) => (
                <div key={r.accountId} className="flex justify-between py-1.5 border-b border-[#E9EDEF]/60">
                  <span>{r.accountCode} — {r.accountName}</span>
                  <span className="font-semibold tabular-nums">{fmtINR(r.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 font-bold bg-[#84B3CE]/25 text-[#16587B] px-2 rounded mt-1">
                <span>Gross Profit</span>
                <span className="tabular-nums">{fmtINR(pnl.grossProfit)}</span>
              </div>
            </div>

            <div>
              <div className="font-bold text-[#54656F] uppercase tracking-wider text-[11px] mb-2">Operating &amp; Administrative Expenses</div>
              {pnl.operatingExpenseRows.map((r) => (
                <div key={r.accountId} className="flex justify-between py-1.5 border-b border-[#E9EDEF]/60">
                  <span>{r.accountCode} — {r.accountName}</span>
                  <span className="font-semibold tabular-nums">{fmtINR(r.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 font-bold bg-[#FAF6EC] px-2 rounded mt-1">
                <span>Total Operating Expenses</span>
                <span className="tabular-nums">{fmtINR(pnl.totalOperatingExpenses)}</span>
              </div>
            </div>

            <div className="flex justify-between py-3 px-3 rounded-lg bg-[#16587B] text-white font-bold text-sm">
              <span>Net Profit / (Loss)</span>
              <span className="tabular-nums">{fmtINR(pnl.netProfit)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. BALANCE SHEET */}
      {activeTab === 'BS' && (
        <div className="bg-white rounded-xl border border-[#D1D7DB] p-5 space-y-5 text-xs">
          <div className="border-b border-[#E9EDEF] pb-3 flex justify-between items-center">
            <div>
              <h2 className="text-base font-bold text-[#111B21]">Balance Sheet</h2>
              <p className="text-[11px] text-[#667781]">As of {balanceSheet.asOfDate}</p>
            </div>
            <span className={`font-bold ${balanceSheet.isBalanced ? 'text-[#16587B]' : 'text-rose-700'}`}>
              {balanceSheet.isBalanced ? 'Assets = Liabilities + Equity (Balanced)' : 'Balance Sheet Variance'}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-bold uppercase text-[#16587B] mb-2">Assets</h3>
              <div className="divide-y divide-[#E9EDEF]">
                {balanceSheet.assetRows.map((r) => (
                  <div key={r.accountId} className="py-2 flex justify-between">
                    <span>{r.accountCode} — {r.accountName}</span>
                    <span className="font-semibold tabular-nums">{fmtINR(r.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 p-2.5 bg-[#16587B] text-white rounded-lg font-bold flex justify-between">
                <span>Total Assets</span>
                <span className="tabular-nums">{fmtINR(balanceSheet.totalAssets)}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase text-[#54656F] mb-2">Liabilities</h3>
                <div className="divide-y divide-[#E9EDEF]">
                  {balanceSheet.liabilityRows.map((r) => (
                    <div key={r.accountId} className="py-2 flex justify-between">
                      <span>{r.accountCode} — {r.accountName}</span>
                      <span className="font-semibold tabular-nums">{fmtINR(r.amount)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 p-2 bg-[#FAF6EC] rounded font-bold flex justify-between">
                  <span>Total Liabilities</span>
                  <span className="tabular-nums">{fmtINR(balanceSheet.totalLiabilities)}</span>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase text-[#54656F] mb-2">Equity &amp; Retained Surplus</h3>
                <div className="divide-y divide-[#E9EDEF]">
                  {balanceSheet.equityRows.map((r) => (
                    <div key={r.accountId} className="py-2 flex justify-between">
                      <span>{r.accountCode} — {r.accountName}</span>
                      <span className="font-semibold tabular-nums">{fmtINR(r.amount)}</span>
                    </div>
                  ))}
                  <div className="py-2 flex justify-between font-semibold text-[#16587B]">
                    <span>Current Period Net Profit / (Loss)</span>
                    <span className="tabular-nums">{fmtINR(balanceSheet.currentPeriodNetProfit)}</span>
                  </div>
                </div>
                <div className="mt-3 p-2.5 bg-[#16587B] text-white rounded-lg font-bold flex justify-between">
                  <span>Total Liabilities &amp; Equity</span>
                  <span className="tabular-nums">{fmtINR(balanceSheet.totalLiabilitiesAndEquity)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. CASH FLOW */}
      {activeTab === 'CF' && (
        <div className="bg-white rounded-xl border border-[#D1D7DB] p-5 space-y-4 text-xs">
          <h2 className="text-base font-bold text-[#111B21]">Cash Flow Statement ({cashFlow.startDate} to {cashFlow.endDate})</h2>
          <div className="divide-y divide-[#E9EDEF]">
            <div className="py-2.5 flex justify-between">
              <span>Operating Cash Inflows (Sales &amp; Customer Receipts)</span>
              <span className="font-semibold tabular-nums text-[#16587B]">{fmtINR(cashFlow.operatingInflows)}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span>Operating Cash Outflows (Suppliers, Expenses &amp; Refunds)</span>
              <span className="font-semibold tabular-nums text-rose-700">({fmtINR(cashFlow.operatingOutflows)})</span>
            </div>
            <div className="py-2.5 flex justify-between font-bold bg-[#FAF6EC] px-2">
              <span>Net Cash from Operating Activities</span>
              <span className="tabular-nums">{fmtINR(cashFlow.netOperating)}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span>Net Cash from Investing Activities</span>
              <span className="font-semibold tabular-nums">{fmtINR(cashFlow.netInvesting)}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span>Net Cash from Financing &amp; Opening Capital Activities</span>
              <span className="font-semibold tabular-nums">{fmtINR(cashFlow.netFinancing)}</span>
            </div>
            <div className="py-3 px-3 bg-[#16587B] text-white rounded-lg font-bold flex justify-between text-sm mt-2">
              <span>Net Change in Cash &amp; Bank Balances</span>
              <span className="tabular-nums">{fmtINR(cashFlow.netCashChange)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 5. TRIAL BALANCE */}
      {activeTab === 'TB' && (
        <div className="bg-white rounded-xl border border-[#D1D7DB] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E9EDEF] flex items-center justify-between text-xs">
            <span className="font-bold text-[#111B21]">Trial Balance ({startDate} to {endDate})</span>
            <span className={trialBalance.isBalanced ? 'text-[#16587B] font-bold' : 'text-rose-700 font-bold'}>
              {trialBalance.isBalanced ? 'Balanced: Total Debits = Total Credits' : 'Out of Balance'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[11px] font-semibold text-[#667781] uppercase">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3 text-right">Period Debit</th>
                  <th className="px-4 py-3 text-right">Period Credit</th>
                  <th className="px-4 py-3 text-right">Closing Debit</th>
                  <th className="px-4 py-3 text-right">Closing Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9EDEF]">
                {trialBalance.rows.map((r) => (
                  <tr key={r.accountId}>
                    <td className="px-4 py-2.5 font-mono font-semibold text-[#16587B]">{r.accountCode}</td>
                    <td className="px-4 py-2.5 font-medium text-[#111B21]">{r.accountName}</td>
                    <td className="px-4 py-2.5 text-[#667781]">{r.accountClass}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtINR(r.periodDebit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtINR(r.periodCredit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                      {r.closingDebit > 0 ? fmtINR(r.closingDebit) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                      {r.closingCredit > 0 ? fmtINR(r.closingCredit) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#16587B] text-white font-bold">
                  <td colSpan={5} className="px-4 py-3 text-right">Trial Balance Totals</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtINR(trialBalance.totalDebit)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtINR(trialBalance.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 6. GENERAL LEDGER */}
      {activeTab === 'GL' && (
        <div className="bg-white rounded-xl border border-[#D1D7DB] overflow-hidden">
          <div className="p-3.5 border-b border-[#E9EDEF] flex items-center justify-between gap-3 text-xs">
            <span className="font-bold text-[#111B21]">General Ledger Entries ({glEntries.length})</span>
            <select
              value={glAccountFilter}
              onChange={(e) => setGlAccountFilter(e.target.value)}
              className="px-3 py-1.5 border border-[#D1D7DB] rounded-lg bg-white"
            >
              <option value="">All Accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[11px] font-semibold text-[#667781] uppercase">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Journal #</th>
                  <th className="px-4 py-2.5">Account</th>
                  <th className="px-4 py-2.5">Description</th>
                  <th className="px-4 py-2.5 text-right">Debit</th>
                  <th className="px-4 py-2.5 text-right">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9EDEF]">
                {glEntries.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">{e.entryDate}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#16587B] whitespace-nowrap">{e.journalNumber}</td>
                    <td className="px-4 py-2.5 font-medium">{e.accountCode} — {e.accountName}</td>
                    <td className="px-4 py-2.5 text-[#54656F]">{e.description}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{e.debit > 0 ? fmtINR(e.debit) : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{e.credit > 0 ? fmtINR(e.credit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. ACCOUNTS RECEIVABLE */}
      {activeTab === 'AR' && (
        <div className="bg-white rounded-xl border border-[#D1D7DB] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E9EDEF] flex justify-between text-xs">
            <span className="font-bold text-[#111B21]">Accounts Receivable — Sundry Debtors ({customers.length})</span>
            <span className="font-bold text-[#16587B] tabular-nums">Total Receivable: {fmtINR(totalAr)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[11px] font-semibold text-[#667781] uppercase">
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Phone / GSTIN</th>
                  <th className="px-4 py-2.5 text-right">Invoices</th>
                  <th className="px-4 py-2.5 text-right">Credit Limit</th>
                  <th className="px-4 py-2.5 text-right">Outstanding Receivable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9EDEF]">
                {customers.map((c) => {
                  const invCount = sales.filter((s) => s.customerId === c.id).length;
                  return (
                    <tr key={c.id}>
                      <td className="px-4 py-2.5 font-semibold text-[#111B21]">{c.name}</td>
                      <td className="px-4 py-2.5 text-[#54656F]">{c.phone} {c.gstin ? `· ${c.gstin}` : ''}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{invCount}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtINR(c.creditLimit)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[#16587B]">
                        {fmtINR(c.currentReceivableBalance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8. ACCOUNTS PAYABLE */}
      {activeTab === 'AP' && (
        <div className="bg-white rounded-xl border border-[#D1D7DB] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E9EDEF] flex justify-between text-xs">
            <span className="font-bold text-[#111B21]">Accounts Payable — Supplier Bills ({bills.length} bills · {suppliers.length} suppliers)</span>
            <span className="font-bold text-rose-700 tabular-nums">Total Payable: {fmtINR(totalAp)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[11px] font-semibold text-[#667781] uppercase">
                  <th className="px-4 py-2.5">Bill #</th>
                  <th className="px-4 py-2.5">Supplier</th>
                  <th className="px-4 py-2.5">Due Date</th>
                  <th className="px-4 py-2.5 text-right">Bill Total</th>
                  <th className="px-4 py-2.5 text-right">Paid</th>
                  <th className="px-4 py-2.5 text-right">Outstanding</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9EDEF]">
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-2.5 font-semibold text-[#16587B]">{b.billNumber}</td>
                    <td className="px-4 py-2.5 font-medium text-[#111B21]">{b.supplierName}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[#54656F]">{b.dueDate}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtINR(b.totalAmount)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#16587B]">{fmtINR(b.paidAmount)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-rose-700">{fmtINR(b.outstandingAmount)}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#54656F]">{b.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 9. GST & TAX REPORTS */}
      {activeTab === 'GST' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div className="bg-white p-5 rounded-xl border border-[#D1D7DB] space-y-3">
            <h2 className="text-sm font-bold text-[#111B21]">Output Tax Liability (GSTR-1 Summary)</h2>
            <div className="divide-y divide-[#E9EDEF]">
              <div className="py-2 flex justify-between"><span>Output CGST</span><span className="font-semibold tabular-nums">{fmtINR(gstReport.outputCgst)}</span></div>
              <div className="py-2 flex justify-between"><span>Output SGST</span><span className="font-semibold tabular-nums">{fmtINR(gstReport.outputSgst)}</span></div>
              <div className="py-2 flex justify-between"><span>Output IGST</span><span className="font-semibold tabular-nums">{fmtINR(gstReport.outputIgst)}</span></div>
              <div className="py-2.5 flex justify-between font-bold bg-[#FAF6EC] px-2 rounded">
                <span>Total Output GST</span>
                <span className="tabular-nums">{fmtINR(gstReport.totalOutputGst)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-[#D1D7DB] space-y-3">
            <h2 className="text-sm font-bold text-[#111B21]">Input Tax Credit (GSTR-2B / ITC)</h2>
            <div className="divide-y divide-[#E9EDEF]">
              <div className="py-2 flex justify-between"><span>Input CGST</span><span className="font-semibold tabular-nums">{fmtINR(gstReport.inputCgst)}</span></div>
              <div className="py-2 flex justify-between"><span>Input SGST</span><span className="font-semibold tabular-nums">{fmtINR(gstReport.inputSgst)}</span></div>
              <div className="py-2 flex justify-between"><span>Input IGST</span><span className="font-semibold tabular-nums">{fmtINR(gstReport.inputIgst)}</span></div>
              <div className="py-2.5 flex justify-between font-bold bg-[#FAF6EC] px-2 rounded">
                <span>Total Eligible ITC</span>
                <span className="tabular-nums text-[#16587B]">{fmtINR(gstReport.totalInputGst)}</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-[#16587B] text-white p-5 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-xs text-[#84B3CE] font-semibold uppercase">GSTR-3B Net Tax Position</div>
              <div className="text-sm mt-0.5">
                {gstReport.netPayableGst >= 0 ? 'Net GST Payable to Tax Authority' : 'Net Excess Input Tax Credit Carry-Forward'}
              </div>
            </div>
            <div className="text-2xl font-bold tabular-nums">{fmtINR(Math.abs(gstReport.netPayableGst))}</div>
          </div>
        </div>
      )}

      {/* 10. AUDIT TRAIL */}
      {activeTab === 'AUDIT' && (
        <div className="bg-white rounded-xl border border-[#D1D7DB] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E9EDEF] flex items-center gap-2 text-xs">
            <ShieldCheck className="w-4 h-4 text-[#16587B]" />
            <span className="font-bold text-[#111B21]">Immutable Financial Audit Trail ({auditLogs.length} events)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[11px] font-semibold text-[#667781] uppercase">
                  <th className="px-4 py-2.5">Timestamp</th>
                  <th className="px-4 py-2.5">Module</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Actor</th>
                  <th className="px-4 py-2.5">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9EDEF]">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[#667781]">
                      Financial audit entries are recorded automatically whenever vouchers, accounts, budgets, or periods change.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2.5 tabular-nums whitespace-nowrap text-[#54656F]">
                        {new Date(l.timestamp).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-[#16587B] whitespace-nowrap">{l.module}</td>
                      <td className="px-4 py-2.5 font-medium whitespace-nowrap">{l.action}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {l.actorName} <span className="text-[#667781]">({l.actorRole})</span>
                      </td>
                      <td className="px-4 py-2.5 text-[#111B21]">{l.summary}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
