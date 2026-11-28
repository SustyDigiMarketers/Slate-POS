/**
 * SLATE POS — Unified Restructured Executive Dashboard
 * Matches reference layout hierarchy:
 * 1. Personalized greeting & branch context banner
 * 2. 4 Top Metric KPI cards (Net Revenue, Total Receivables, SaaS MRR, ARPU)
 * 3. Total Receivables Hero & Interactive 5-Bucket Aging Breakdown
 * 4. Side-by-side Financial Performance Visualizations:
 *    - Sales Revenue & Cash Collections (Area Chart)
 *    - Monthly Sales vs Receipts vs Expenses (Grouped Bar Chart)
 * 5. Outbox Synchronizer & Quick Action bar
 *
 * Tricolour Theme:
 * - Primary Venice Blue: #16587B
 * - Secondary Rock Blue: #84B3CE
 * - Background Merino: #F5EEDD
 * - White Surfaces: #FFFFFF
 */

import React, { useState, useMemo } from 'react';
import { Sale, Expense } from '../../types';
import { INITIAL_ORGANIZATION, INITIAL_BRANCHES } from '../../lib/initialData';
import { formatINR } from '../../lib/formatters';
import { offlineStore } from '../../lib/offlineStore';
import {
  TrendingUp,
  Receipt,
  Clock,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  ShoppingCart,
  PlusCircle,
  Wifi,
  WifiOff,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { GrayChartPlaceholder } from '../common/GrayChartPlaceholder';
import { computeRevenueChartData, computeMonthlyComparativeData } from '../../lib/chartAnalytics';

interface DashboardOverviewProps {
  sales: Sale[];
  expenses: Expense[];
  onOpenPos: () => void;
  onOpenChecklist: () => void;
  onSelectAgingBucket: (bucket: 'CURRENT' | '1_15' | '16_30' | '31_45' | 'ABOVE_45') => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  sales,
  expenses,
  onOpenPos,
  onOpenChecklist,
  onSelectAgingBucket,
}) => {
  const [timelinePeriod, setTimelinePeriod] = useState<'7D' | '30D' | 'FY'>('30D');
  const [isOffline, setIsOffline] = useState(offlineStore.isOffline());
  const [pendingCount, setPendingCount] = useState(offlineStore.getPendingOutboxCount());

  // Subscribe to offline state
  React.useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setIsOffline(offlineStore.isOffline());
      setPendingCount(offlineStore.getPendingOutboxCount());
    });
    return unsub;
  }, []);

  // 1. Authoritative Revenue & Receipts
  const totalSalesRevenue = useMemo(() => {
    return sales.reduce((acc, s) => acc + s.grandTotal, 0);
  }, [sales]);

  const totalReceiptsCollected = useMemo(() => {
    return sales.reduce((acc, s) => {
      const paid = s.payments.reduce((pAcc, p) => pAcc + p.amount, 0);
      return acc + paid;
    }, 0);
  }, [sales]);

  const totalExpenses = useMemo(() => {
    return expenses.reduce((acc, e) => acc + e.amount, 0);
  }, [expenses]);

  const totalGstCollected = useMemo(() => {
    return sales.reduce((acc, s) => acc + (s.cgstTotal + s.sgstTotal + s.igstTotal), 0);
  }, [sales]);

  const totalTransactionsCount = sales.length;
  const avgBasketSize = totalTransactionsCount > 0 ? Math.round(totalSalesRevenue / totalTransactionsCount) : 0;

  // 2. Authoritative Aging Bucket calculations
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

  // 3. Dynamic Revenue Trend Chart Data (Area Chart)
  const revenueChartData = useMemo(() => {
    return computeRevenueChartData(sales, timelinePeriod);
  }, [sales, timelinePeriod]);

  const hasRevenueData = useMemo(() => {
    return revenueChartData.some((d) => d.revenue > 0 || d.receipts > 0);
  }, [revenueChartData]);

  // 4. Monthly Bar Chart Data (Sales vs Receipts vs Expenses)
  const monthlyData = useMemo(() => {
    return computeMonthlyComparativeData(sales, expenses);
  }, [sales, expenses]);

  const hasMonthlyData = useMemo(() => {
    return monthlyData.some((d) => d.sales > 0 || d.receipts > 0 || d.expenses > 0);
  }, [monthlyData]);

  const activeUser = offlineStore.getActiveUser();

  return (
    <div className="space-y-6">
      {/* 1. HERO GREETING BANNER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-lg border border-[#16587B]/15 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-[#16587B] tracking-tight">
            Hello, {activeUser?.name || 'Authorized User'}
          </h1>
          <div className="flex items-center gap-2 text-xs text-[#405D6D] mt-1 font-medium flex-wrap">
            <span>{offlineStore.getOrganization().tradeName || INITIAL_ORGANIZATION.tradeName}</span>
            <span aria-hidden="true" className="text-[#84B3CE]">·</span>
            <span>{offlineStore.getActiveBranch().name} ({offlineStore.getActiveBranch().city})</span>
            <span aria-hidden="true" className="text-[#84B3CE]">·</span>
            <span className="tabular-nums text-[#16587B] font-semibold">{offlineStore.getFiscalYear()}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onOpenPos}
            title="Open POS Sale (F2)"
            aria-label="Open POS Sale (F2)"
            className="px-3 sm:px-4 py-2 sm:py-1.5 text-xs font-bold text-[#F5EEDD] bg-[#16587B] hover:bg-[#124866] rounded-md transition-colors shadow-2xs cursor-pointer flex items-center justify-center min-h-[40px] gap-1.5"
          >
            <ShoppingCart className="w-4 h-4 shrink-0 text-[#F5EEDD]" />
            <span className="hidden lg:inline">Open POS Sale (F2)</span>
          </button>
        </div>
      </div>

      {/* 2. TOP KPI METRIC CARDS (4 CARDS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Net Revenue */}
        <div className="bg-white p-5 rounded-lg border border-[#16587B]/15 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[#405D6D] mb-2">
            <span className="font-medium">Net Revenue</span>
            {totalSalesRevenue > 0 ? (
              <span className="text-[#16587B] bg-[#84B3CE]/25 px-2 py-0.5 rounded text-[11px] font-bold flex items-center border border-[#84B3CE]/55">
                <TrendingUp className="w-3 h-3 mr-0.5 text-[#16587B]" /> Realized
              </span>
            ) : (
              <span className="text-[#405D6D] bg-[#FAF6EC] px-2 py-0.5 rounded text-[11px] font-semibold border border-[#16587B]/15">
                No transactions
              </span>
            )}
          </div>
          <div className="text-2xl font-bold text-[#111B21] tabular-nums">
            {totalSalesRevenue > 0 ? formatINR(totalSalesRevenue) : '—'}
          </div>
          <div className="text-xs text-[#405D6D] mt-2 flex items-center justify-between pt-2 border-t border-[#16587B]/10">
            <span>GST Included</span>
            <span className="tabular-nums text-[#111B21] font-medium">{totalGstCollected > 0 ? formatINR(totalGstCollected) : '—'}</span>
          </div>
        </div>

        {/* Card 2: Receivables Summary */}
        <div className="bg-white p-5 rounded-lg border border-[#16587B]/15 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[#405D6D] mb-2">
            <span className="font-medium">Total Receivables</span>
            <span className="text-[#92400E] bg-[#FEF3C7] px-2 py-0.5 rounded text-[11px] font-bold border border-[#FDE68A]">
              Uncollected
            </span>
          </div>
          <div className="text-2xl font-bold text-[#111B21] tabular-nums">
            {agingData.total > 0 ? formatINR(agingData.total) : '—'}
          </div>
          <div className="text-xs text-[#405D6D] mt-2 flex items-center justify-between pt-2 border-t border-[#16587B]/10">
            <span>Cash Realized</span>
            <span className="tabular-nums text-[#16587B] font-semibold">{totalReceiptsCollected > 0 ? formatINR(totalReceiptsCollected) : '—'}</span>
          </div>
        </div>

        {/* Card 3: Retail Network Outlets */}
        <div className="bg-white p-5 rounded-lg border border-[#16587B]/15 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[#405D6D] mb-2">
            <span className="font-medium">Active Outlets</span>
            <span className="text-[#16587B] bg-[#84B3CE]/25 px-2 py-0.5 rounded text-[11px] font-bold border border-[#84B3CE]/55">
              Live
            </span>
          </div>
          <div className="text-2xl font-bold text-[#111B21] tabular-nums tracking-tight">
            {offlineStore.getBranches().length} {offlineStore.getBranches().length === 1 ? 'Outlet' : 'Outlets'}
          </div>
          <div className="text-xs text-[#405D6D] mt-2 flex items-center justify-between pt-2 border-t border-[#16587B]/10">
            <span>Current Terminal</span>
            <span className="tabular-nums font-semibold text-[#111B21]">{offlineStore.getActiveBranch().name}</span>
          </div>
        </div>

        {/* Card 4: Order Volume & Basket Size */}
        <div className="bg-white p-5 rounded-lg border border-[#16587B]/15 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[#405D6D] mb-2">
            <span className="font-medium">Avg Basket Value</span>
            <span className="text-[#405D6D] tabular-nums text-[11px]">{offlineStore.getFiscalYear()}</span>
          </div>
          <div className="text-2xl font-bold text-[#111B21] tabular-nums tracking-tight">
            {avgBasketSize > 0 ? formatINR(avgBasketSize) : '—'}
          </div>
          <div className="text-xs text-[#405D6D] mt-2 flex items-center justify-between pt-2 border-t border-[#16587B]/10">
            <span>Total Invoices</span>
            <span className="tabular-nums font-semibold text-[#111B21]">{totalTransactionsCount} Orders</span>
          </div>
        </div>
      </div>

      {/* 3. TOTAL RECEIVABLES HERO & AGING BREAKDOWN CARD */}
      <div className="bg-white p-6 rounded-lg border border-[#16587B]/15 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#405D6D] font-bold">
              Financial Status &amp; Credit Aging
            </div>
            <div className="flex items-baseline gap-3 mt-0.5">
              <h2 className="text-lg font-bold text-[#16587B]">
                Total Receivables
              </h2>
              <span className="tabular-nums text-2xl font-bold text-[#111B21]">
                {agingData.total > 0 ? formatINR(agingData.total) : '—'}
              </span>
            </div>
          </div>

          <div className="text-xs text-[#405D6D] flex items-center gap-1.5 bg-[#FAF6EC] border border-[#16587B]/15 px-3 py-1.5 rounded-md">
            <Clock className="w-3.5 h-3.5 text-[#16587B]" />
            <span>As of {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · Click any bucket to view overdue invoices</span>
          </div>
        </div>

        {/* Visual Multi-Segment Aging Progress Bar */}
        <div className="h-4 sm:h-4.5 w-full bg-[#F5EEDD] rounded-full overflow-hidden flex mb-5 border border-[#16587B]/15 p-0.5 shadow-inner gap-0.5">
          <div
            style={{ width: `${agingData.currentPct}%` }}
            className="bg-gradient-to-r from-[#84B3CE] via-[#1B6A94] to-[#16587B] rounded-l-full transition-all duration-300"
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
            className="text-left p-3.5 rounded-lg border border-[#84B3CE]/60 bg-[#84B3CE]/20 hover:bg-[#84B3CE]/35 transition-colors group cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-[#16587B] font-bold mb-1">
              <span>Current</span>
              <span className="text-[11px] tabular-nums">{agingData.currentPct.toFixed(1)}%</span>
            </div>
            <div className="text-base font-bold text-[#111B21] tabular-nums">
              {formatINR(agingData.current)}
            </div>
            <div className="text-[11px] text-[#16587B] mt-1 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform font-medium">
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

      {/* 4. DUAL CHARTS GRID: Sales Revenue Timeline (Left) & Sales vs Expenses (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CHART 1: Sales Revenue & Cash Collections Area Chart */}
        <div className="bg-white p-6 rounded-lg border border-[#16587B]/15 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-bold text-[#16587B]">Sales Revenue &amp; Cash Collections</h2>
                <div className="text-xs text-[#405D6D] mt-0.5">
                  Accrual invoiced sales vs realized cash in hand
                </div>
              </div>

              {/* Segmented Filter Pills */}
              <div className="flex items-center gap-1 p-1 bg-[#FAF6EC] rounded-md border border-[#16587B]/15">
                <button
                  onClick={() => setTimelinePeriod('7D')}
                  className={`px-2.5 py-0.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                    timelinePeriod === '7D'
                      ? 'bg-[#16587B] text-[#F5EEDD] shadow-2xs'
                      : 'text-[#405D6D] hover:text-[#16587B]'
                  }`}
                >
                  7 Days
                </button>
                <button
                  onClick={() => setTimelinePeriod('30D')}
                  className={`px-2.5 py-0.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                    timelinePeriod === '30D'
                      ? 'bg-[#16587B] text-[#F5EEDD] shadow-2xs'
                      : 'text-[#405D6D] hover:text-[#16587B]'
                  }`}
                >
                  30 Days
                </button>
                <button
                  onClick={() => setTimelinePeriod('FY')}
                  className={`px-2.5 py-0.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                    timelinePeriod === 'FY'
                      ? 'bg-[#16587B] text-[#F5EEDD] shadow-2xs'
                      : 'text-[#405D6D] hover:text-[#16587B]'
                  }`}
                >
                  Fiscal Year
                </button>
              </div>
            </div>

            <div className="h-64 w-full">
              {!hasRevenueData ? (
                <GrayChartPlaceholder
                  type="area"
                  title="Revenue & Receipts Trend"
                  message="No data available yet"
                  subtext="Real sales and cash collections will populate this chart."
                  height={256}
                />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGradUnified" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#16587B" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#16587B" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="recGradUnified" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#84B3CE" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#84B3CE" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" stroke="#405D6D" fontSize={11} tickLine={false} tick={{ fontFamily: 'Poppins, sans-serif' }} />
                    <YAxis stroke="#405D6D" fontSize={11} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontFamily: 'Poppins, sans-serif' }} />
                    <Tooltip
                      formatter={(value: any, name: any) => [
                        formatINR(Number(value)),
                        name === 'revenue' ? 'Invoiced Sales' : 'Receipts Realized',
                      ]}
                      contentStyle={{ backgroundColor: '#16587B', border: '1px solid #84B3CE', borderRadius: '6px', color: '#F5EEDD', fontSize: '12px', fontFamily: 'Poppins, sans-serif' }}
                      itemStyle={{ fontFamily: 'Poppins, sans-serif', color: '#F5EEDD' }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#16587B" strokeWidth={2.5} fillOpacity={1} fill="url(#revGradUnified)" name="revenue" />
                    <Area type="monotone" dataKey="receipts" stroke="#84B3CE" strokeWidth={2.2} strokeDasharray="4 4" fillOpacity={1} fill="url(#recGradUnified)" name="receipts" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-[#405D6D] mt-4 border-t border-[#16587B]/10 pt-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-1 bg-[#16587B] rounded-full" />
              <span className="font-medium text-[#111B21]">Invoiced Sales</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-1 bg-[#84B3CE] rounded-full border border-dashed border-[#16587B]" />
              <span className="font-medium text-[#111B21]">Cash Realized</span>
            </div>
          </div>
        </div>

        {/* CHART 2: Sales and Expenses Grouped Bar Chart */}
        <div className="bg-white p-6 rounded-lg border border-[#16587B]/15 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-bold text-[#16587B]">Sales, Receipts &amp; Expenses</h2>
                <div className="text-xs text-[#405D6D] mt-0.5">
                  Monthly cash inflow versus operating overheads
                </div>
              </div>
              <span className="text-[11px] tabular-nums bg-[#FAF6EC] text-[#16587B] px-2 py-0.5 rounded border border-[#16587B]/20 font-bold">
                FY 2026-2027
              </span>
            </div>

            <div className="h-64 w-full">
              {!hasMonthlyData ? (
                <GrayChartPlaceholder
                  type="bar"
                  title="Monthly Breakdown"
                  message="No data available yet"
                  subtext="Sales, receipts, and expenses will appear here once recorded."
                  height={256}
                />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="slateSalesBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#16587B" />
                        <stop offset="100%" stopColor="#0F405B" />
                      </linearGradient>
                      <linearGradient id="slateReceiptsBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#84B3CE" />
                        <stop offset="100%" stopColor="#5D96B8" />
                      </linearGradient>
                      <linearGradient id="slateExpensesBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#F59E0B" />
                        <stop offset="100%" stopColor="#D97706" />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" stroke="#405D6D" fontSize={11} tickLine={false} tick={{ fontFamily: 'Poppins, sans-serif' }} />
                    <YAxis stroke="#405D6D" fontSize={11} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontFamily: 'Poppins, sans-serif' }} />
                    <Tooltip
                      formatter={(val: any) => formatINR(Number(val))}
                      contentStyle={{ backgroundColor: '#16587B', border: '1px solid #84B3CE', borderRadius: '6px', color: '#F5EEDD', fontSize: '12px', fontFamily: 'Poppins, sans-serif' }}
                      itemStyle={{ fontFamily: 'Poppins, sans-serif', color: '#F5EEDD' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px', fontFamily: 'Poppins, sans-serif' }} />
                    <Bar dataKey="sales" name="Sales" fill="url(#slateSalesBarGrad)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="receipts" name="Receipts" fill="url(#slateReceiptsBarGrad)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="Expenses" fill="url(#slateExpensesBarGrad)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* 3 Summary strip cards */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-[#16587B]/10">
            <div className="bg-[#FAF6EC] p-2 rounded text-center border border-[#16587B]/15">
              <div className="text-[10px] text-[#405D6D] font-medium">Sales</div>
              <div className="text-xs font-bold text-[#16587B] tabular-nums">{formatINR(totalSalesRevenue, { compact: true })}</div>
            </div>
            <div className="bg-[#84B3CE]/25 p-2 rounded text-center border border-[#84B3CE]/55">
              <div className="text-[10px] text-[#16587B] font-bold">Receipts</div>
              <div className="text-xs font-bold text-[#16587B] tabular-nums">{formatINR(totalReceiptsCollected, { compact: true })}</div>
            </div>
            <div className="bg-amber-50/60 p-2 rounded text-center border border-amber-200">
              <div className="text-[10px] text-amber-800 font-bold">Expenses</div>
              <div className="text-xs font-bold text-amber-800 tabular-nums">{formatINR(totalExpenses, { compact: true })}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. OUTBOX TELEMETRY & QUICK RECENT ACTIVITY STRIP */}
      <div className="bg-white p-5 rounded-lg border border-[#16587B]/15 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${isOffline ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#84B3CE]/30 text-[#16587B]'}`}>
            {isOffline ? <WifiOff className="w-5 h-5" /> : <Wifi className="w-5 h-5" />}
          </div>
          <div>
            <div className="text-xs font-bold text-[#111B21] flex items-center gap-2">
              <span>Local Checkout Storage Engine: Active</span>
              <span className={`text-[10px] tabular-nums px-2 py-0.2 rounded font-bold ${
                isOffline ? 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]' : 'bg-[#84B3CE]/30 text-[#16587B] border border-[#84B3CE]/60'
              }`}>
                {isOffline ? 'Offline Mode' : 'Cloud Connected'}
              </span>
            </div>
            <div className="text-[11px] text-[#405D6D] mt-0.5">
              {pendingCount > 0
                ? `${pendingCount} transactions awaiting cloud synchronization.`
                : 'All local sales transactions are synchronized and up to date.'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <button
              onClick={() => offlineStore.synchronizeOutbox()}
              className="px-3 py-1.5 text-xs font-bold bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] rounded-md shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync {pendingCount} Outbox Events</span>
            </button>
          )}
          <button
            onClick={() => offlineStore.toggleSimulatedOffline()}
            className="px-3 py-1.5 text-xs font-semibold text-[#16587B] bg-[#FAF6EC] hover:bg-[#F5EEDD] border border-[#16587B]/20 rounded-md transition-colors cursor-pointer"
          >
            {isOffline ? 'Switch to Online Mode' : 'Simulate Offline POS'}
          </button>
        </div>
      </div>
    </div>
  );
};
