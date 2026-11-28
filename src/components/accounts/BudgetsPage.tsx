/**
 * SLATE POS — Budgets & Actual-vs-Budget Variance Analysis Module
 * Supports Annual, Quarterly, and Monthly budgets across Revenue, Expense, and CapEx accounts,
 * approval & revision history, and live General Ledger variance tracking.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { offlineStore } from '../../lib/offlineStore';
import { Budget, BudgetCategory, BudgetPeriodType, ChartOfAccount } from '../../types';
import {
  Target,
  Plus,
  CheckCircle2,
  AlertTriangle,
  History,
  X,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

const fmtINR = (val: number) =>
  `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface DraftBudgetLine {
  key: string;
  accountId: string;
  category: BudgetCategory;
  plannedAmount: string;
  notes: string;
}

export const BudgetsPage: React.FC = () => {
  const [budgets, setBudgets] = useState<Budget[]>(offlineStore.getBudgets());
  const [accounts, setAccounts] = useState<ChartOfAccount[]>(offlineStore.getChartOfAccounts());
  const [branches] = useState(offlineStore.getBranches());
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>(budgets[0]?.id || '');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [reviseReason, setReviseReason] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Composer State
  const [budgetName, setBudgetName] = useState('');
  const [fiscalYear, setFiscalYear] = useState(offlineStore.getFiscalYear() || '2026-2027');
  const [periodType, setPeriodType] = useState<BudgetPeriodType>('ANNUAL');
  const [branchId, setBranchId] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('2026-04-01');
  const [endDate, setEndDate] = useState('2027-03-31');
  const [draftLines, setDraftLines] = useState<DraftBudgetLine[]>([]);

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      const updated = offlineStore.getBudgets();
      setBudgets(updated);
      setAccounts(offlineStore.getChartOfAccounts());
      if (!selectedBudgetId && updated.length > 0) {
        setSelectedBudgetId(updated[0].id);
      }
    });
    return unsub;
  }, [selectedBudgetId]);

  const budgetableAccounts = useMemo(
    () =>
      accounts.filter(
        (a) => a.isActive && (a.accountClass === 'INCOME' || a.accountClass === 'EXPENSE' || a.code === '1500')
      ),
    [accounts]
  );

  const selectedBudget = useMemo(
    () => budgets.find((b) => b.id === selectedBudgetId) || budgets[0],
    [budgets, selectedBudgetId]
  );

  const varianceReport = useMemo(
    () => (selectedBudget ? offlineStore.getBudgetVariance(selectedBudget.id) : null),
    [selectedBudget, budgets]
  );

  const chartData = useMemo(() => {
    if (!varianceReport) return [];
    return varianceReport.rows.map((r) => ({
      name: `${r.accountCode} ${r.accountName.slice(0, 14)}`,
      Planned: r.plannedAmount,
      Actual: r.actualAmount,
    }));
  }, [varianceReport]);

  const openCreateModal = () => {
    const revAcc = accounts.find((a) => a.code === '4000');
    const rentAcc = accounts.find((a) => a.code === '5100');
    const wagesAcc = accounts.find((a) => a.code === '5200');
    setBudgetName(`FY ${fiscalYear} Operating Plan`);
    setPeriodType('ANNUAL');
    setStartDate('2026-04-01');
    setEndDate('2027-03-31');
    setBranchId('ALL');
    setDraftLines([
      { key: '1', accountId: revAcc?.id || '', category: 'REVENUE', plannedAmount: '1500000', notes: 'Annual retail revenue target' },
      { key: '2', accountId: rentAcc?.id || '', category: 'EXPENSE', plannedAmount: '240000', notes: 'Store lease budget' },
      { key: '3', accountId: wagesAcc?.id || '', category: 'EXPENSE', plannedAmount: '360000', notes: 'Staff payroll allocation' },
    ]);
    setShowCreateModal(true);
  };

  const openReviseModal = () => {
    if (!selectedBudget) return;
    setReviseReason('');
    setDraftLines(
      selectedBudget.lines.map((l, idx) => ({
        key: `rev_${idx}`,
        accountId: l.accountId,
        category: l.category,
        plannedAmount: String(l.plannedAmount),
        notes: l.notes || '',
      }))
    );
    setShowReviseModal(true);
  };

  const handleSaveBudget = () => {
    setFeedback(null);
    const parsedLines = draftLines
      .filter((l) => l.accountId && parseFloat(l.plannedAmount) >= 0)
      .map((l) => ({
        accountId: l.accountId,
        category: l.category,
        plannedAmount: parseFloat(l.plannedAmount) || 0,
        notes: l.notes,
      }));

    const res = offlineStore.createBudget({
      name: budgetName,
      fiscalYear,
      periodType,
      startDate,
      endDate,
      branchId,
      lines: parsedLines,
    });

    if (!res.success) {
      setFeedback({ type: 'error', text: res.error || 'Failed to create budget.' });
      return;
    }

    setSelectedBudgetId(res.budget!.id);
    setShowCreateModal(false);
    setFeedback({ type: 'success', text: `Budget "${res.budget!.name}" created in DRAFT state.` });
  };

  const handleSaveRevision = () => {
    if (!selectedBudget) return;
    const parsedLines = draftLines
      .filter((l) => l.accountId)
      .map((l) => ({
        accountId: l.accountId,
        category: l.category,
        plannedAmount: parseFloat(l.plannedAmount) || 0,
        notes: l.notes,
      }));

    const res = offlineStore.reviseBudget(selectedBudget.id, parsedLines, reviseReason);
    if (!res.success) {
      setFeedback({ type: 'error', text: res.error || 'Failed to revise budget.' });
      return;
    }
    setShowReviseModal(false);
    setFeedback({ type: 'success', text: `Budget "${selectedBudget.name}" revised with audit log.` });
  };

  const handleApproveBudget = (id: string) => {
    const res = offlineStore.approveBudget(id);
    if (res.success) {
      setFeedback({ type: 'success', text: `Budget "${res.budget?.name}" approved for live tracking.` });
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#D1D7DB]">
        <div>
          <h1 className="text-lg font-bold text-[#111B21] flex items-center gap-2">
            <Target className="w-5 h-5 text-[#16587B]" />
            <span>Budgets &amp; Variance Control</span>
          </h1>
          <p className="text-xs text-[#667781] mt-0.5">
            Plan annual, quarterly, and monthly budgets by Chart of Accounts and track live General Ledger actuals vs targets.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] text-xs font-semibold rounded-lg cursor-pointer min-h-[42px]"
        >
          <Plus className="w-4 h-4" />
          <span>Create Budget</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`flex items-center justify-between px-4 py-3 rounded-lg border text-xs font-medium ${
            feedback.type === 'success'
              ? 'bg-[#84B3CE]/25 border-[#16587B]/30 text-[#16587B]'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="p-1 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {budgets.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#D1D7DB] p-10 text-center space-y-3">
          <TrendingUp className="w-8 h-8 text-[#16587B] mx-auto" />
          <h2 className="text-sm font-bold text-[#111B21]">No Financial Budgets Configured Yet</h2>
          <p className="text-xs text-[#667781] max-w-md mx-auto">
            Create an annual, quarterly, or monthly budget linked to your Chart of Accounts to monitor revenue targets, operating expense limits, and capital expenditure variance in real time.
          </p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] text-xs font-semibold rounded-lg cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Budget</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Budget Selector */}
          <div className="lg:col-span-4 space-y-2.5">
            {budgets.map((b) => {
              const active = selectedBudget?.id === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => setSelectedBudgetId(b.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#16587B] text-[#F5EEDD] border-[#16587B]'
                      : 'bg-white text-[#111B21] border-[#D1D7DB] hover:bg-[#FAF6EC]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-xs truncate">{b.name}</span>
                    <span
                      className={`text-[10px] font-semibold uppercase ${
                        active ? 'text-[#84B3CE]' : b.status === 'APPROVED' ? 'text-[#16587B]' : 'text-[#667781]'
                      }`}
                    >
                      {b.status}
                    </span>
                  </div>
                  <div className={`text-[11px] mt-1 ${active ? 'text-white/80' : 'text-[#667781]'}`}>
                    {b.periodType} · FY {b.fiscalYear} · {b.startDate} to {b.endDate}
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-current/15 grid grid-cols-2 gap-2 text-[11px] tabular-nums">
                    <div>
                      <div className={active ? 'text-white/70' : 'text-[#667781]'}>Revenue Plan</div>
                      <div className="font-bold">{fmtINR(b.totalPlannedRevenue)}</div>
                    </div>
                    <div>
                      <div className={active ? 'text-white/70' : 'text-[#667781]'}>Expense + CapEx</div>
                      <div className="font-bold">{fmtINR(b.totalPlannedExpense + b.totalPlannedCapex)}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Variance Workbench */}
          {selectedBudget && varianceReport && (
            <div className="lg:col-span-8 space-y-4">
              <div className="bg-white rounded-xl border border-[#D1D7DB] p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-[#111B21]">{selectedBudget.name}</h2>
                  <p className="text-[11px] text-[#667781]">
                    Branch: {selectedBudget.branchId === 'ALL' ? 'All Branches' : selectedBudget.branchId} · Revisions: {selectedBudget.revisions.length}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedBudget.status !== 'APPROVED' && (
                    <button
                      onClick={() => handleApproveBudget(selectedBudget.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#16587B] text-[#F5EEDD] text-xs font-semibold rounded-lg hover:bg-[#124866] cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve Budget</span>
                    </button>
                  )}
                  <button
                    onClick={openReviseModal}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-[#D1D7DB] text-[#111B21] text-xs font-semibold rounded-lg hover:bg-[#FAF6EC] cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Revise Allocations</span>
                  </button>
                </div>
              </div>

              {/* Chart */}
              <div className="bg-white rounded-xl border border-[#D1D7DB] p-4">
                <div className="text-xs font-bold text-[#111B21] mb-3">Planned vs Actual GL Performance (₹)</div>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 16, left: 4, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E9EDEF" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#667781' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#667781' }} />
                      <Tooltip formatter={(v: any) => fmtINR(Number(v || 0))} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Planned" fill="#16587B" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Actual" fill="#84B3CE" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Variance Table */}
              <div className="bg-white rounded-xl border border-[#D1D7DB] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[11px] font-semibold text-[#667781] uppercase">
                        <th className="px-4 py-3">Account</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3 text-right">Planned (₹)</th>
                        <th className="px-4 py-3 text-right">Actual GL (₹)</th>
                        <th className="px-4 py-3 text-right">Variance (₹)</th>
                        <th className="px-4 py-3 text-right">Utilization</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9EDEF]">
                      {varianceReport.rows.map((r) => (
                        <tr key={r.accountId} className="hover:bg-[#FAF6EC]/50">
                          <td className="px-4 py-3 font-medium text-[#111B21]">
                            {r.accountCode} — {r.accountName}
                          </td>
                          <td className="px-4 py-3 text-[#667781]">{r.category}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{fmtINR(r.plannedAmount)}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtINR(r.actualAmount)}</td>
                          <td
                            className={`px-4 py-3 text-right tabular-nums font-semibold ${
                              r.isOverBudget ? 'text-rose-700' : 'text-[#16587B]'
                            }`}
                          >
                            {r.variance >= 0 ? `+${fmtINR(r.variance)}` : fmtINR(r.variance)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5 tabular-nums">
                              {r.isOverBudget && <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />}
                              <span className={r.isOverBudget ? 'text-rose-700 font-bold' : 'text-[#111B21] font-semibold'}>
                                {r.utilizationPercent.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Revision History */}
              {selectedBudget.revisions.length > 0 && (
                <div className="bg-white rounded-xl border border-[#D1D7DB] p-4 space-y-2">
                  <h3 className="text-xs font-bold text-[#111B21]">Revision Audit Trail</h3>
                  <div className="divide-y divide-[#E9EDEF] text-xs">
                    {selectedBudget.revisions.map((rev) => (
                      <div key={rev.version} className="py-2 flex items-center justify-between gap-3">
                        <div>
                          <span className="font-semibold text-[#16587B]">v{rev.version}</span> · {rev.reason}{' '}
                          <span className="text-[#667781]">({rev.revisedBy})</span>
                        </div>
                        <div className="tabular-nums text-[#54656F] whitespace-nowrap">
                          {fmtINR(rev.previousTotal)} → <strong>{fmtINR(rev.newTotal)}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create Budget Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E9EDEF] bg-[#FAF6EC] flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#111B21]">Create Financial Budget</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-1 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Budget Name *</label>
                  <input
                    value={budgetName}
                    onChange={(e) => setBudgetName(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Fiscal Year</label>
                  <input
                    value={fiscalYear}
                    onChange={(e) => setFiscalYear(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Period Type</label>
                  <select
                    value={periodType}
                    onChange={(e) => setPeriodType(e.target.value as BudgetPeriodType)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg bg-white"
                  >
                    <option value="ANNUAL">Annual</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Branch Scope</label>
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg bg-white"
                  >
                    <option value="ALL">All Branches (Consolidated)</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#54656F] mb-1">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#111B21]">Account Allocations</span>
                  <button
                    onClick={() =>
                      setDraftLines((prev) => [
                        ...prev,
                        { key: `b_${Date.now()}`, accountId: '', category: 'EXPENSE', plannedAmount: '', notes: '' },
                      ])
                    }
                    className="text-[#16587B] font-semibold hover:underline cursor-pointer"
                  >
                    + Add Allocation
                  </button>
                </div>
                {draftLines.map((line) => (
                  <div key={line.key} className="grid grid-cols-12 gap-2 items-center">
                    <select
                      value={line.accountId}
                      onChange={(e) =>
                        setDraftLines((prev) =>
                          prev.map((l) => (l.key === line.key ? { ...l, accountId: e.target.value } : l))
                        )
                      }
                      className="col-span-5 px-2.5 py-2 border border-[#D1D7DB] rounded bg-white"
                    >
                      <option value="">Select Account...</option>
                      {budgetableAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={line.category}
                      onChange={(e) =>
                        setDraftLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key ? { ...l, category: e.target.value as BudgetCategory } : l
                          )
                        )
                      }
                      className="col-span-3 px-2.5 py-2 border border-[#D1D7DB] rounded bg-white"
                    >
                      <option value="REVENUE">Revenue</option>
                      <option value="EXPENSE">Expense</option>
                      <option value="CAPEX">CapEx</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      value={line.plannedAmount}
                      onChange={(e) =>
                        setDraftLines((prev) =>
                          prev.map((l) => (l.key === line.key ? { ...l, plannedAmount: e.target.value } : l))
                        )
                      }
                      placeholder="Amount ₹"
                      className="col-span-3 px-2.5 py-2 border border-[#D1D7DB] rounded text-right tabular-nums"
                    />
                    <button
                      onClick={() => setDraftLines((prev) => prev.filter((l) => l.key !== line.key))}
                      className="col-span-1 p-1.5 text-[#667781] hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-3.5 border-t border-[#E9EDEF] bg-[#FAF6EC] flex justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-semibold text-[#54656F] border border-[#D1D7DB] bg-white rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBudget}
                className="px-4 py-2 text-xs font-semibold text-[#F5EEDD] bg-[#16587B] hover:bg-[#124866] rounded-lg cursor-pointer"
              >
                Save Budget
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revise Budget Modal */}
      {showReviseModal && selectedBudget && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xl w-full max-w-2xl p-5 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-[#111B21]">Revise Budget — {selectedBudget.name}</h3>
            <div>
              <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Revision Audit Reason *</label>
              <input
                value={reviseReason}
                onChange={(e) => setReviseReason(e.target.value)}
                placeholder="e.g. Q3 seasonal inventory & festive staffing revision"
                className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg"
              />
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {draftLines.map((line) => {
                const acc = accounts.find((a) => a.id === line.accountId);
                return (
                  <div key={line.key} className="flex items-center justify-between gap-3">
                    <span className="font-medium flex-1 truncate">
                      {acc ? `${acc.code} — ${acc.name}` : line.accountId}
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={line.plannedAmount}
                      onChange={(e) =>
                        setDraftLines((prev) =>
                          prev.map((l) => (l.key === line.key ? { ...l, plannedAmount: e.target.value } : l))
                        )
                      }
                      className="w-36 px-2.5 py-1.5 border border-[#D1D7DB] rounded text-right tabular-nums"
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowReviseModal(false)}
                className="px-3.5 py-2 border border-[#D1D7DB] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRevision}
                disabled={!reviseReason.trim()}
                className="px-4 py-2 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] font-semibold rounded-lg disabled:opacity-40 cursor-pointer"
              >
                Save Revision
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
