/**
 * SLATE POS — Invoice & Receivables Dashboard (Screenshot 2 Reference)
 * Exact recreation of Total Receivables aging breakdown and Sales & Expenses comparison
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6 / #ECE5DD / #FFFFFF / #D1D7DB)
 */

import React, { useMemo } from 'react';
import { Sale, Expense } from '../../types';
import { formatINR } from '../../lib/formatters';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Clock, ArrowRight, TrendingUp, AlertTriangle } from 'lucide-react';
import { GrayChartPlaceholder } from '../common/GrayChartPlaceholder';
import { computeMonthlyComparativeData } from '../../lib/chartAnalytics';

interface InvoiceDashboardProps {
  sales: Sale[];
  expenses: Expense[];
  onSelectAgingBucket: (bucket: 'CURRENT' | '1_15' | '16_30' | '31_45' | 'ABOVE_45') => void;
}

export const InvoiceDashboard: React.FC<InvoiceDashboardProps> = ({
  sales,
  expenses,
  onSelectAgingBucket,
}) => {
  // Authoritative Aging Bucket calculation based on due dates & unpaid invoice balances
  const agingData = useMemo(() => {
    const now = Date.now();

    let current = 0;
    let days1To15 = 0;
    let days16To30 = 0;
    let days31To45 = 0;
    let daysAbove45 = 0;

    for (const sale of sales) {
      const paid = sale.payments.reduce((sum, p) => sum + p.amount, 0);
      const balance = sale.grandTotal - paid;
      if (balance <= 0) continue;

      const dueDate = new Date(sale.dueDate).getTime();
      const diffDays = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        current += balance;
      } else if (diffDays <= 15) {
        days1To15 += balance;
      } else if (diffDays <= 30) {
        days16To30 += balance;
      } else if (diffDays <= 45) {
        days31To45 += balance;
      } else {
        daysAbove45 += balance;
      }
    }

    const total = current + days1To15 + days16To30 + days31To45 + daysAbove45;

    return {
      total,
      current,
      days1To15,
      days16To30,
      days31To45,
      daysAbove45,
      currentPct: total > 0 ? (current / total) * 100 : 0,
      d1Pct: total > 0 ? (days1To15 / total) * 100 : 0,
      d2Pct: total > 0 ? (days16To30 / total) * 100 : 0,
      d3Pct: total > 0 ? (days31To45 / total) * 100 : 0,
      d4Pct: total > 0 ? (daysAbove45 / total) * 100 : 0,
    };
  }, [sales]);

  // Total Summary Figures
  const totalSalesFigure = useMemo(() => {
    return sales.reduce((acc, s) => acc + s.grandTotal, 0);
  }, [sales]);

  const totalReceiptsFigure = useMemo(() => {
    return sales.reduce((acc, s) => {
      const paid = s.payments.reduce((pAcc, p) => pAcc + p.amount, 0);
      return acc + paid;
    }, 0);
  }, [sales]);

  const totalExpensesFigure = useMemo(() => {
    return expenses.reduce((acc, e) => acc + e.amount, 0);
  }, [expenses]);

  // Dynamic Monthly Sales vs Expenses Chart Data
  const monthlyData = useMemo(() => {
    return computeMonthlyComparativeData(sales, expenses);
  }, [sales, expenses]);

  const hasMonthlyData = useMemo(() => {
    return monthlyData.some((d) => d.sales > 0 || d.receipts > 0 || d.expenses > 0);
  }, [monthlyData]);

  return (
    <div className="space-y-6">
      {/* SECTION 1: Total Receivables Aging Buckets (Screenshot 2 Top Half) */}
      <div className="bg-white p-6 rounded-lg border border-[#D1D7DB] shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#667781] font-bold">
              Financial Status &amp; Credit Aging
            </div>
            <div className="flex items-baseline gap-3 mt-0.5">
              <h2 className="text-xl font-bold text-[#111B21]">
                Total Receivables
              </h2>
              <span className="tabular-nums text-2xl font-black text-[#111B21]">
                {formatINR(agingData.total)}
              </span>
            </div>
          </div>

          <div className="text-xs text-[#3B4A54] flex items-center gap-1.5 bg-[#F7F5F2] border border-[#D1D7DB] px-3 py-1.5 rounded-md">
            <Clock className="w-3.5 h-3.5 text-[#075E54]" />
            <span>As of {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · Click any bucket to view overdue invoices</span>
          </div>
        </div>

        {/* Visual Multi-Segment Aging Progress Bar with Theme Gradients and Rounded Ends */}
        <div className="h-4 sm:h-4.5 w-full bg-[#ECE5DD] rounded-full overflow-hidden flex mb-6 border border-[#D1D7DB] p-0.5 shadow-inner gap-0.5">
          <div
            style={{ width: `${agingData.currentPct}%` }}
            className="bg-gradient-to-r from-[#00A884] via-[#128C7E] to-[#075E54] rounded-l-full transition-all duration-300"
            title={`Current: ${agingData.currentPct.toFixed(1)}%`}
          />
          <div
            style={{ width: `${agingData.d1Pct}%` }}
            className="bg-gradient-to-r from-[#FBBF24] via-[#F59E0B] to-[#D97706] transition-all duration-300"
            title={`1-15 Days: ${agingData.d1Pct.toFixed(1)}%`}
          />
          <div
            style={{ width: `${agingData.d2Pct}%` }}
            className="bg-gradient-to-r from-[#FB923C] via-[#EA580C] to-[#C2410C] transition-all duration-300"
            title={`16-30 Days: ${agingData.d2Pct.toFixed(1)}%`}
          />
          <div
            style={{ width: `${agingData.d3Pct}%` }}
            className="bg-gradient-to-r from-[#F87171] via-[#DC2626] to-[#B91C1C] transition-all duration-300"
            title={`31-45 Days: ${agingData.d3Pct.toFixed(1)}%`}
          />
          <div
            style={{ width: `${agingData.d4Pct}%` }}
            className="bg-gradient-to-r from-[#E11D48] via-[#BE123C] to-[#881337] rounded-r-full transition-all duration-300"
            title={`> 45 Days: ${agingData.d4Pct.toFixed(1)}%`}
          />
        </div>

        {/* 5 Interactive Aging Bucket Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* Bucket 1: Current */}
          <button
            onClick={() => onSelectAgingBucket('CURRENT')}
            className="text-left p-3.5 rounded-lg border border-[#B3EBA0] bg-[#DCF8C6]/30 hover:bg-[#DCF8C6]/60 transition-colors group cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-[#075E54] font-bold mb-1">
              <span>Current</span>
              <span className="text-[11px] tabular-nums">{agingData.currentPct.toFixed(1)}%</span>
            </div>
            <div className="text-base font-bold text-[#111B21] tabular-nums">
              {formatINR(agingData.current)}
            </div>
            <div className="text-[11px] text-[#075E54] mt-1 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform font-medium">
              <span>Not due yet</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>

          {/* Bucket 2: 1-15 Days Overdue */}
          <button
            onClick={() => onSelectAgingBucket('1_15')}
            className="text-left p-3.5 rounded-lg border border-[#FDE68A] bg-[#FEF3C7]/40 hover:bg-[#FEF3C7]/80 transition-colors group cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-[#92400E] font-bold mb-1">
              <span>1–15 Days</span>
              <span className="text-[11px] tabular-nums">{agingData.d1Pct.toFixed(1)}%</span>
            </div>
            <div className="text-base font-bold text-[#111B21] tabular-nums">
              {formatINR(agingData.days1To15)}
            </div>
            <div className="text-[11px] text-[#92400E] mt-1 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform font-medium">
              <span>Grace period</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>

          {/* Bucket 3: 16-30 Days Overdue */}
          <button
            onClick={() => onSelectAgingBucket('16_30')}
            className="text-left p-3.5 rounded-lg border border-orange-200 bg-orange-50/50 hover:bg-orange-50 transition-colors group cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-orange-800 font-bold mb-1">
              <span>16–30 Days</span>
              <span className="text-[11px] tabular-nums">{agingData.d2Pct.toFixed(1)}%</span>
            </div>
            <div className="text-base font-bold text-[#111B21] tabular-nums">
              {formatINR(agingData.days16To30)}
            </div>
            <div className="text-[11px] text-orange-700 mt-1 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform font-medium">
              <span>Follow up sent</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>

          {/* Bucket 4: 31-45 Days Overdue */}
          <button
            onClick={() => onSelectAgingBucket('31_45')}
            className="text-left p-3.5 rounded-lg border border-red-200 bg-red-50/50 hover:bg-red-50 transition-colors group cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-red-800 font-bold mb-1">
              <span>31–45 Days</span>
              <span className="text-[11px] tabular-nums">{agingData.d3Pct.toFixed(1)}%</span>
            </div>
            <div className="text-base font-bold text-[#111B21] tabular-nums">
              {formatINR(agingData.days31To45)}
            </div>
            <div className="text-[11px] text-red-700 mt-1 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform font-medium">
              <span>Credit lock warn</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>

          {/* Bucket 5: > 45 Days Overdue */}
          <button
            onClick={() => onSelectAgingBucket('ABOVE_45')}
            className="text-left p-3.5 rounded-lg border border-rose-300 bg-rose-50/70 hover:bg-rose-100/70 transition-colors group cursor-pointer col-span-2 md:col-span-1"
          >
            <div className="flex items-center justify-between text-xs text-rose-900 font-bold mb-1">
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> &gt; 45 Days
              </span>
              <span className="text-[11px] tabular-nums">{agingData.d4Pct.toFixed(1)}%</span>
            </div>
            <div className="text-base font-bold text-rose-900 tabular-nums">
              {formatINR(agingData.daysAbove45)}
            </div>
            <div className="text-[11px] text-rose-800 mt-1 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform font-medium">
              <span>Critical overdue</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>
        </div>
      </div>

      {/* SECTION 2: Sales and Expenses Bar Chart & Summary Strip (Screenshot 2 Bottom Half) */}
      <div className="bg-white p-6 rounded-lg border border-[#D1D7DB] shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-base font-bold text-[#111B21]">Sales, Receipts &amp; Expenses</h2>
            <div className="text-xs text-[#667781] mt-0.5">
              Monthly accrual sales compared with operational cash outflows and overheads
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#667781]">Fiscal Year:</span>
            <span className="text-xs font-semibold bg-[#F7F5F2] text-[#075E54] px-2.5 py-1 rounded border border-[#D1D7DB]">
              FY 2026-2027
            </span>
          </div>
        </div>

        {/* Grouped Bar Chart */}
        <div className="h-72 w-full">
          {!hasMonthlyData ? (
            <GrayChartPlaceholder
              type="bar"
              title="Sales & Expenses Comparison"
              message="No data available yet"
              subtext="Monthly sales, collections, and expense bars will populate here."
              height={288}
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="invSalesBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#075E54" />
                    <stop offset="100%" stopColor="#043832" />
                  </linearGradient>
                  <linearGradient id="invReceiptsBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#25D366" />
                    <stop offset="100%" stopColor="#128C7E" />
                  </linearGradient>
                  <linearGradient id="invExpensesBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F59E0B" />
                    <stop offset="100%" stopColor="#D97706" />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="#8696A0" fontSize={11} tickLine={false} tick={{ fontFamily: 'Poppins, sans-serif' }} />
                <YAxis stroke="#8696A0" fontSize={11} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontFamily: 'Poppins, sans-serif' }} />
                <Tooltip
                  formatter={(val: any) => formatINR(Number(val))}
                  contentStyle={{ backgroundColor: '#075E54', border: '1px solid #128C7E', borderRadius: '6px', color: '#fff', fontSize: '12px', fontFamily: 'Poppins, sans-serif' }}
                  itemStyle={{ fontFamily: 'Poppins, sans-serif' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px', fontFamily: 'Poppins, sans-serif' }} />
                <Bar dataKey="sales" name="Sales" fill="url(#invSalesBarGrad)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="receipts" name="Receipts" fill="url(#invReceiptsBarGrad)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="url(#invExpensesBarGrad)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 3 Prominent Metric Cards below Chart (Screenshot 2 Exact Layout) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-[#E9EDEF]">
          <div className="bg-[#F7F5F2] p-4 rounded-lg border border-[#D1D7DB]">
            <div className="text-xs text-[#667781] mb-1">Total Sales (FY 26-27)</div>
            <div className="text-xl font-bold text-[#111B21] tabular-nums">
              {formatINR(totalSalesFigure)}
            </div>
            <div className="text-[11px] text-[#8696A0] mt-1">Invoiced retail turnover</div>
          </div>

          <div className="bg-[#DCF8C6]/40 p-4 rounded-lg border border-[#B3EBA0]">
            <div className="text-xs text-[#075E54] font-semibold mb-1">Total Receipts (Cash in Hand)</div>
            <div className="text-xl font-bold text-[#075E54] tabular-nums">
              {formatINR(totalReceiptsFigure)}
            </div>
            <div className="text-[11px] text-[#075E54]/80 mt-1">Realized payments collected</div>
          </div>

          <div className="bg-amber-50/60 p-4 rounded-lg border border-amber-200">
            <div className="text-xs text-amber-900 font-semibold mb-1">Total Expenses</div>
            <div className="text-xl font-bold text-amber-800 tabular-nums">
              {formatINR(totalExpensesFigure)}
            </div>
            <div className="text-[11px] text-amber-700/80 mt-1">Rent, payroll, power &amp; logistics</div>
          </div>
        </div>
      </div>
    </div>
  );
};
