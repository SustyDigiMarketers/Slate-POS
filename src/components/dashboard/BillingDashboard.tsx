/**
 * SLATE POS — Billing Dashboard (Screenshot 1 Reference)
 * Personalized greeting, Revenue timeline chart, Receivable summary, and SaaS subscription metrics
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6 / #ECE5DD / #FFFFFF / #D1D7DB)
 */

import React, { useState, useMemo } from 'react';
import { Sale, Expense } from '../../types';
import { INITIAL_ORGANIZATION, INITIAL_BRANCHES } from '../../lib/initialData';
import { formatINR } from '../../lib/formatters';
import {
  TrendingUp,
  CreditCard,
  Users,
  Receipt,
  FileCheck2,
  Calendar,
  Layers,
  ArrowUpRight,
  ShoppingCart,
  CheckCircle2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { GrayChartPlaceholder } from '../common/GrayChartPlaceholder';
import { computeRevenueChartData } from '../../lib/chartAnalytics';
import { offlineStore } from '../../lib/offlineStore';

interface BillingDashboardProps {
  sales: Sale[];
  expenses: Expense[];
  onOpenGettingStarted: () => void;
  onOpenPos: () => void;
  onFilterAgingInvoices?: (bucket: string) => void;
}

export const BillingDashboard: React.FC<BillingDashboardProps> = ({
  sales,
  onOpenGettingStarted,
  onOpenPos,
}) => {
  const [timelinePeriod, setTimelinePeriod] = useState<'7D' | '30D' | 'FY'>('30D');

  // Authoritative calculations from persistent sales data
  const totalSalesRevenue = useMemo(() => {
    return sales.reduce((acc, s) => acc + s.grandTotal, 0);
  }, [sales]);

  const totalReceiptsCollected = useMemo(() => {
    return sales.reduce((acc, s) => {
      const paid = s.payments.reduce((pAcc, p) => pAcc + p.amount, 0);
      return acc + paid;
    }, 0);
  }, [sales]);

  const totalOutstandingReceivables = useMemo(() => {
    return Math.max(0, totalSalesRevenue - totalReceiptsCollected);
  }, [totalSalesRevenue, totalReceiptsCollected]);

  const totalTransactionsCount = sales.length;
  const avgBasketSize = totalTransactionsCount > 0 ? Math.round(totalSalesRevenue / totalTransactionsCount) : 0;

  const totalGstCollected = useMemo(() => {
    return sales.reduce((acc, s) => acc + (s.cgstTotal + s.sgstTotal + s.igstTotal), 0);
  }, [sales]);

  // Dynamic chart data points based on persistent sales
  const revenueChartData = useMemo(() => {
    return computeRevenueChartData(sales, timelinePeriod);
  }, [sales, timelinePeriod]);

  const hasRevenueData = useMemo(() => {
    return revenueChartData.some((d) => d.revenue > 0 || d.receipts > 0);
  }, [revenueChartData]);

  const activeUser = offlineStore.getActiveUser();

  return (
    <div className="space-y-6">
      {/* 1. Personalized Greeting Header & Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-lg border border-[#D1D7DB] shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-[#111B21] tracking-tight">
            Hello, {activeUser?.name || 'Authorized User'}
          </h1>
          <div className="flex items-center gap-2 text-xs text-[#667781] mt-1 font-medium">
            <span>{INITIAL_ORGANIZATION.tradeName}</span>
            <span aria-hidden="true" className="text-[#8696A0]">·</span>
            <span>{INITIAL_BRANCHES[0].name}</span>
            <span aria-hidden="true" className="text-[#8696A0]">·</span>
            <span className="tabular-nums text-[#075E54] font-semibold">{INITIAL_ORGANIZATION.currentFiscalYear}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenGettingStarted}
            className="px-3.5 py-1.5 text-xs font-semibold text-[#075E54] bg-white hover:bg-[#F7F5F2] border border-[#075E54] rounded-md transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-[#075E54]" />
            <span>Getting Started Checklist</span>
          </button>
          <button
            onClick={onOpenPos}
            className="px-4 py-1.5 text-xs font-bold text-white bg-[#075E54] hover:bg-[#128C7E] rounded-md transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>+ New (F2)</span>
          </button>
        </div>
      </div>

      {/* 2. Top Metric Cards: Net Revenue, Receivable Summary, SaaS Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Net Revenue */}
        <div className="bg-white p-5 rounded-lg border border-[#D1D7DB] shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[#667781] mb-2">
            <span className="font-medium">Net Revenue</span>
            {totalSalesRevenue > 0 ? (
              <span className="text-[#075E54] bg-[#DCF8C6] px-2 py-0.5 rounded text-[11px] font-bold flex items-center border border-[#B3EBA0]">
                <TrendingUp className="w-3 h-3 mr-0.5 text-[#075E54]" /> Realized
              </span>
            ) : (
              <span className="text-[#6B7280] bg-[#F3F4F6] px-2 py-0.5 rounded text-[11px] font-semibold border border-[#E5E7EB]">
                No transactions
              </span>
            )}
          </div>
          <div className="text-2xl font-bold text-[#111B21] tabular-nums">
            {totalSalesRevenue > 0 ? formatINR(totalSalesRevenue) : '—'}
          </div>
          <div className="text-xs text-[#667781] mt-2 flex items-center justify-between pt-2 border-t border-[#E9EDEF]">
            <span>GST Included</span>
            <span className="tabular-nums text-[#111B21] font-medium">{totalGstCollected > 0 ? formatINR(totalGstCollected) : '—'}</span>
          </div>
        </div>

        {/* Card 2: Total Receivables Summary */}
        <div className="bg-white p-5 rounded-lg border border-[#D1D7DB] shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[#667781] mb-2">
            <span className="font-medium">Receivables Summary</span>
            <span className="text-[#92400E] bg-[#FEF3C7] px-2 py-0.5 rounded text-[11px] font-bold border border-[#FDE68A]">
              Uncollected
            </span>
          </div>
          <div className="text-2xl font-bold text-[#111B21] tabular-nums">
            {totalOutstandingReceivables > 0 ? formatINR(totalOutstandingReceivables) : '—'}
          </div>
          <div className="text-xs text-[#667781] mt-2 flex items-center justify-between pt-2 border-t border-[#E9EDEF]">
            <span>Cash Realized</span>
            <span className="tabular-nums text-[#075E54] font-semibold">{totalReceiptsCollected > 0 ? formatINR(totalReceiptsCollected) : '—'}</span>
          </div>
        </div>

        {/* Card 3: Active Outlets */}
        <div className="bg-white p-5 rounded-lg border border-[#D1D7DB] shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[#667781] mb-2">
            <span className="font-medium">Active Outlets</span>
            <span className="text-[#075E54] bg-[#DCF8C6] px-2 py-0.5 rounded text-[11px] font-bold border border-[#B3EBA0]">
              Live
            </span>
          </div>
          <div className="text-2xl font-bold text-[#111B21] tabular-nums tracking-tight">
            {offlineStore.getBranches().length} {offlineStore.getBranches().length === 1 ? 'Outlet' : 'Outlets'}
          </div>
          <div className="text-xs text-[#667781] mt-2 flex items-center justify-between pt-2 border-t border-[#E9EDEF]">
            <span>Current Terminal</span>
            <span className="tabular-nums font-semibold text-[#111B21]">{offlineStore.getActiveBranch().name}</span>
          </div>
        </div>

        {/* Card 4: Order Volume & Basket Size */}
        <div className="bg-white p-5 rounded-lg border border-[#D1D7DB] shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[#667781] mb-2">
            <span className="font-medium">Avg Basket Value</span>
            <span className="text-[#667781] tabular-nums text-[11px]">{offlineStore.getFiscalYear()}</span>
          </div>
          <div className="text-2xl font-bold text-[#111B21] tabular-nums tracking-tight">
            {avgBasketSize > 0 ? formatINR(avgBasketSize) : '—'}
          </div>
          <div className="text-xs text-[#667781] mt-2 flex items-center justify-between pt-2 border-t border-[#E9EDEF]">
            <span>Total Invoices</span>
            <span className="tabular-nums font-semibold text-[#111B21]">{totalTransactionsCount} Orders</span>
          </div>
        </div>
      </div>

      {/* 3. Main Chart: Revenue & Cash Flow Trend with Segmented Period Tabs */}
      <div className="bg-white p-6 rounded-lg border border-[#D1D7DB] shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-base font-bold text-[#111B21]">Sales Revenue &amp; Cash Collections</h2>
            <div className="text-xs text-[#667781] mt-0.5">
              Comparison between posted sales invoices and actual cash realized in hand
            </div>
          </div>

          {/* Segmented Filter Control */}
          <div className="flex items-center gap-1 p-1 bg-[#F7F5F2] rounded-md border border-[#D1D7DB]">
            <button
              onClick={() => setTimelinePeriod('7D')}
              className={`px-3 py-1 text-xs font-semibold rounded transition-colors cursor-pointer ${
                timelinePeriod === '7D'
                  ? 'bg-[#075E54] text-white shadow-2xs'
                  : 'text-[#667781] hover:text-[#111B21]'
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setTimelinePeriod('30D')}
              className={`px-3 py-1 text-xs font-semibold rounded transition-colors cursor-pointer ${
                timelinePeriod === '30D'
                  ? 'bg-[#075E54] text-white shadow-2xs'
                  : 'text-[#667781] hover:text-[#111B21]'
              }`}
            >
              Last 30 Days
            </button>
            <button
              onClick={() => setTimelinePeriod('FY')}
              className={`px-3 py-1 text-xs font-semibold rounded transition-colors cursor-pointer ${
                timelinePeriod === 'FY'
                  ? 'bg-[#075E54] text-white shadow-2xs'
                  : 'text-[#667781] hover:text-[#111B21]'
              }`}
            >
              Fiscal Year
            </button>
          </div>
        </div>

        <div className="h-72 w-full">
          {!hasRevenueData ? (
            <GrayChartPlaceholder
              type="area"
              title="Revenue & Receipts Trend"
              message="No data available yet"
              subtext="Real sales and cash collections will populate this chart."
              height={288}
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGradBilling" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#075E54" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#075E54" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="receiptGradBilling" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#128C7E" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#128C7E" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#8696A0" fontSize={11} tickLine={false} tick={{ fontFamily: 'Poppins, sans-serif' }} />
                <YAxis stroke="#8696A0" fontSize={11} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontFamily: 'Poppins, sans-serif' }} />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    formatINR(Number(value)),
                    name === 'revenue' ? 'Invoiced Sales' : 'Receipts Realized',
                  ]}
                  contentStyle={{ backgroundColor: '#075E54', border: '1px solid #128C7E', borderRadius: '6px', color: '#fff', fontSize: '12px', fontFamily: 'Poppins, sans-serif' }}
                  itemStyle={{ fontFamily: 'Poppins, sans-serif' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#075E54" strokeWidth={2.5} fillOpacity={1} fill="url(#revenueGradBilling)" name="revenue" />
                <Area type="monotone" dataKey="receipts" stroke="#128C7E" strokeWidth={2} strokeDasharray="4 4" fillOpacity={1} fill="url(#receiptGradBilling)" name="receipts" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="flex items-center justify-end gap-6 text-xs text-[#667781] mt-4 border-t border-[#E9EDEF] pt-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-1 bg-[#075E54] rounded-full" />
            <span className="font-medium text-[#111B21]">Invoiced Sales (Accrual)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-1 bg-[#128C7E] rounded-full border border-dashed border-[#128C7E]" />
            <span className="font-medium text-[#111B21]">Actual Cash Realized</span>
          </div>
        </div>
      </div>
    </div>
  );
};
