/**
 * SLATE POS — Chart of Accounts Module
 * Hierarchical Assets, Liabilities, Equity, Income & Expense ledger structure,
 * configurable numbering, safe deactivation with balance migration, deletion protection,
 * and interactive Account Ledger & CSV statement export.
 */

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { offlineStore } from '../../lib/offlineStore';
import { AccountClass, ChartOfAccount } from '../../types';
import {
  FolderTree,
  Plus,
  Search,
  Edit3,
  BookOpen,
  PowerOff,
  Trash2,
  Download,
  X,
  CheckCircle2,
  AlertCircle,
  Lock,
} from 'lucide-react';

const ACCOUNT_CLASSES: Array<{ id: AccountClass | 'ALL'; label: string }> = [
  { id: 'ALL', label: 'All Classes' },
  { id: 'ASSET', label: 'Assets' },
  { id: 'LIABILITY', label: 'Liabilities' },
  { id: 'EQUITY', label: 'Equity' },
  { id: 'INCOME', label: 'Income' },
  { id: 'EXPENSE', label: 'Expenses' },
];

const fmtINR = (val: number) =>
  `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const ChartOfAccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>(offlineStore.getChartOfAccounts());
  const [branches] = useState(offlineStore.getBranches());
  const [classFilter, setClassFilter] = useState<AccountClass | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [showEditor, setShowEditor] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);
  const [ledgerAccountId, setLedgerAccountId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<ChartOfAccount | null>(null);
  const [migrateToId, setMigrateToId] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [accountClass, setAccountClass] = useState<AccountClass>('EXPENSE');
  const [accountGroup, setAccountGroup] = useState('Operating Expenses');
  const [parentAccountId, setParentAccountId] = useState('');
  const [branchId, setBranchId] = useState('ALL');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [taxApplicable, setTaxApplicable] = useState(false);
  const [description, setDescription] = useState('');

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setAccounts(offlineStore.getChartOfAccounts());
    });
    return unsub;
  }, []);

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (!showInactive && !a.isActive) return false;
      if (classFilter !== 'ALL' && a.accountClass !== classFilter) return false;
      if (q) {
        const hay = `${a.code} ${a.name} ${a.accountGroup} ${a.description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [accounts, classFilter, search, showInactive]);

  const classSummary = useMemo(() => {
    const sumBy = (cls: AccountClass) =>
      accounts.filter((a) => a.accountClass === cls && a.isActive).reduce((s, a) => s + a.currentBalance, 0);
    return {
      assets: sumBy('ASSET'),
      liabilities: sumBy('LIABILITY'),
      equity: sumBy('EQUITY'),
      income: sumBy('INCOME'),
      expenses: sumBy('EXPENSE'),
    };
  }, [accounts]);

  const ledgerData = useMemo(
    () => (ledgerAccountId ? offlineStore.getAccountLedger(ledgerAccountId) : null),
    [ledgerAccountId, accounts]
  );

  const openCreateModal = () => {
    setEditingAccount(null);
    setCode('');
    setName('');
    setAccountClass('EXPENSE');
    setAccountGroup('Operating Expenses');
    setParentAccountId('');
    setBranchId('ALL');
    setOpeningBalance('0');
    setTaxApplicable(false);
    setDescription('');
    setShowEditor(true);
  };

  const openEditModal = (acc: ChartOfAccount) => {
    setEditingAccount(acc);
    setCode(acc.code);
    setName(acc.name);
    setAccountClass(acc.accountClass);
    setAccountGroup(acc.accountGroup);
    setParentAccountId(acc.parentAccountId || '');
    setBranchId(acc.branchId || 'ALL');
    setOpeningBalance(String(acc.openingBalance || 0));
    setTaxApplicable(acc.taxApplicable);
    setDescription(acc.description || '');
    setShowEditor(true);
  };

  const handleSaveAccount = () => {
    setFeedback(null);
    if (editingAccount) {
      const res = offlineStore.updateChartAccount(editingAccount.id, {
        code,
        name,
        accountGroup,
        parentAccountId: parentAccountId || undefined,
        branchId,
        taxApplicable,
        description,
      });
      if (!res.success) {
        setFeedback({ type: 'error', text: res.error || 'Failed to update account.' });
        return;
      }
      setFeedback({ type: 'success', text: `Updated account ${code} — ${name}.` });
      setShowEditor(false);
      return;
    }

    const res = offlineStore.createChartAccount({
      code,
      name,
      accountClass,
      accountGroup,
      parentAccountId: parentAccountId || undefined,
      branchId,
      openingBalance: parseFloat(openingBalance) || 0,
      taxApplicable,
      description,
    });
    if (!res.success) {
      setFeedback({ type: 'error', text: res.error || 'Failed to create account.' });
      return;
    }
    setFeedback({ type: 'success', text: `Created account ${res.account!.code} — ${res.account!.name}.` });
    setShowEditor(false);
  };

  const handleDeleteAccount = (acc: ChartOfAccount) => {
    const res = offlineStore.deleteChartAccount(acc.id);
    if (!res.success) {
      setFeedback({ type: 'error', text: res.error || 'Cannot delete account.' });
    } else {
      setFeedback({ type: 'success', text: `Deleted unused account ${acc.code} — ${acc.name}.` });
    }
  };

  const handleConfirmDeactivate = () => {
    if (!deactivateTarget) return;
    const res = offlineStore.deactivateChartAccount(deactivateTarget.id, migrateToId || undefined);
    if (!res.success) {
      setFeedback({ type: 'error', text: res.error || 'Failed to deactivate account.' });
      return;
    }
    setFeedback({
      type: 'success',
      text: `Deactivated ${deactivateTarget.code} — ${deactivateTarget.name}${
        res.migrationJournal ? ` (balance migrated via ${res.migrationJournal.journalNumber})` : ''
      }.`,
    });
    setDeactivateTarget(null);
    setMigrateToId('');
  };

  const handleExportAccountStatement = () => {
    if (!ledgerData?.account) return;
    const rows = ledgerData.entries.map((e) => ({
      Date: e.entryDate,
      Journal: e.journalNumber,
      Source: e.sourceType,
      Reference: e.sourceNumber || '',
      Description: e.description,
      Debit: e.debit,
      Credit: e.credit,
      RunningBalance: e.runningBalance,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Account_Statement');
    XLSX.writeFile(wb, `Statement_${ledgerData.account.code}_${ledgerData.account.name.replace(/\s+/g, '_')}.xlsx`);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#D1D7DB]">
        <div>
          <h1 className="text-lg font-bold text-[#111B21] flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-[#16587B]" />
            <span>Chart of Accounts</span>
          </h1>
          <p className="text-xs text-[#667781] mt-0.5">
            Hierarchical general ledger master across Assets, Liabilities, Equity, Income &amp; Expenses with safe balance migration.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] text-xs font-semibold rounded-lg cursor-pointer min-h-[42px]"
        >
          <Plus className="w-4 h-4" />
          <span>New Ledger Account</span>
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
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="p-1 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Class Balance Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Assets', value: classSummary.assets },
          { label: 'Liabilities', value: classSummary.liabilities },
          { label: 'Equity', value: classSummary.equity },
          { label: 'Income', value: classSummary.income },
          { label: 'Expenses', value: classSummary.expenses },
        ].map((item) => (
          <div key={item.label} className="bg-white p-3.5 rounded-xl border border-[#D1D7DB]">
            <div className="text-[11px] font-medium text-[#667781]">{item.label}</div>
            <div className="text-base font-bold text-[#111B21] tabular-nums mt-1">{fmtINR(item.value)}</div>
          </div>
        ))}
      </div>

      {/* Filters & Account Tree Table */}
      <div className="bg-white rounded-xl border border-[#D1D7DB] overflow-hidden">
        <div className="p-3.5 border-b border-[#E9EDEF] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {ACCOUNT_CLASSES.map((c) => (
              <button
                key={c.id}
                onClick={() => setClassFilter(c.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  classFilter === c.id
                    ? 'bg-[#16587B] text-[#F5EEDD]'
                    : 'bg-[#FAF6EC] text-[#54656F] hover:text-[#111B21]'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-[#8696A0] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code or account..."
                className="pl-9 pr-3 py-1.5 text-xs border border-[#D1D7DB] rounded-lg w-56"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-[#54656F] cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="accent-[#16587B]"
              />
              <span>Show Inactive</span>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[11px] font-semibold text-[#667781] uppercase">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Account Name &amp; Hierarchy</th>
                <th className="px-4 py-3">Class / Group</th>
                <th className="px-4 py-3">Tax / Scope</th>
                <th className="px-4 py-3 text-right">Current Balance (₹)</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9EDEF]">
              {filteredAccounts.map((acc) => (
                <tr key={acc.id} className={`hover:bg-[#FAF6EC]/60 ${!acc.isActive ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 font-mono font-semibold text-[#16587B] whitespace-nowrap">
                    {acc.code}
                  </td>
                  <td className="px-4 py-3">
                    <div className={`font-semibold text-[#111B21] flex items-center gap-1.5 ${acc.parentCode ? 'pl-4' : ''}`}>
                      {acc.parentCode && <span className="text-[#8696A0]">↳</span>}
                      <span>{acc.name}</span>
                      {acc.isSystem && (
                        <span title="System Control Account">
                          <Lock className="w-3 h-3 text-[#8696A0]" />
                        </span>
                      )}
                      {!acc.isActive && <span className="text-[10px] text-rose-600 font-semibold">(Inactive)</span>}
                    </div>
                    {acc.description && (
                      <div className={`text-[11px] text-[#667781] ${acc.parentCode ? 'pl-4' : ''}`}>
                        {acc.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#111B21]">{acc.accountClass}</div>
                    <div className="text-[11px] text-[#667781]">{acc.accountGroup}</div>
                  </td>
                  <td className="px-4 py-3 text-[#54656F]">
                    <div>{acc.taxApplicable ? 'GST Applicable' : 'Non-Tax'}</div>
                    <div className="text-[11px] text-[#667781]">
                      {acc.branchId === 'ALL' ? 'All Branches' : acc.branchId}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-[#111B21]">
                    {fmtINR(acc.currentBalance)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => setLedgerAccountId(acc.id)}
                        className="p-1.5 text-[#16587B] hover:bg-[#84B3CE]/25 rounded cursor-pointer"
                        title="View Account Ledger"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEditModal(acc)}
                        className="p-1.5 text-[#54656F] hover:text-[#111B21] hover:bg-[#FAF6EC] rounded cursor-pointer"
                        title="Edit Account"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {!acc.isSystem && acc.isActive && (
                        <button
                          onClick={() => {
                            setDeactivateTarget(acc);
                            setMigrateToId('');
                          }}
                          className="p-1.5 text-amber-700 hover:bg-amber-50 rounded cursor-pointer"
                          title="Deactivate / Migrate Balance"
                        >
                          <PowerOff className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {!acc.isSystem && (
                        <button
                          onClick={() => handleDeleteAccount(acc)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                          title="Delete Unused Account"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Account Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E9EDEF] bg-[#FAF6EC] flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#111B21]">
                {editingAccount ? `Edit Account ${editingAccount.code}` : 'Create Ledger Account'}
              </h2>
              <button onClick={() => setShowEditor(false)} className="p-1 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Account Code *</label>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. 5710"
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Account Name *</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Packaging & Consumables"
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Account Class</label>
                  <select
                    value={accountClass}
                    disabled={Boolean(editingAccount)}
                    onChange={(e) => setAccountClass(e.target.value as AccountClass)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg bg-white disabled:bg-[#FAF6EC]"
                  >
                    <option value="ASSET">Asset</option>
                    <option value="LIABILITY">Liability</option>
                    <option value="EQUITY">Equity</option>
                    <option value="INCOME">Income</option>
                    <option value="EXPENSE">Expense</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Account Group</label>
                  <input
                    value={accountGroup}
                    onChange={(e) => setAccountGroup(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Parent Account</label>
                  <select
                    value={parentAccountId}
                    onChange={(e) => setParentAccountId(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg bg-white"
                  >
                    <option value="">None (Top-Level)</option>
                    {accounts
                      .filter((a) => a.accountClass === accountClass && a.id !== editingAccount?.id)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Branch Scope</label>
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg bg-white"
                  >
                    <option value="ALL">All Branches</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {!editingAccount && (
                <div>
                  <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Opening Balance (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg tabular-nums"
                  />
                </div>
              )}
              <div>
                <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={taxApplicable}
                  onChange={(e) => setTaxApplicable(e.target.checked)}
                  className="accent-[#16587B]"
                />
                <span>GST / Tax Applicable Account</span>
              </label>
            </div>
            <div className="px-5 py-3.5 border-t border-[#E9EDEF] bg-[#FAF6EC] flex justify-end gap-2">
              <button
                onClick={() => setShowEditor(false)}
                className="px-4 py-2 text-xs font-semibold border border-[#D1D7DB] bg-white rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAccount}
                className="px-4 py-2 text-xs font-semibold text-[#F5EEDD] bg-[#16587B] hover:bg-[#124866] rounded-lg cursor-pointer"
              >
                {editingAccount ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Ledger Drawer / Modal */}
      {ledgerData?.account && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex justify-end">
          <div className="bg-white w-full max-w-3xl h-full flex flex-col shadow-2xl border-l border-[#D1D7DB]">
            <div className="px-5 py-4 border-b border-[#E9EDEF] bg-[#FAF6EC] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#111B21]">
                  Account Ledger: {ledgerData.account.code} — {ledgerData.account.name}
                </h2>
                <p className="text-[11px] text-[#667781]">
                  {ledgerData.account.accountClass} · {ledgerData.account.accountGroup} · Closing Balance:{' '}
                  <strong className="text-[#16587B]">{fmtINR(ledgerData.closingBalance)}</strong>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportAccountStatement}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-[#D1D7DB] bg-white rounded-lg hover:bg-[#FAF6EC] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#16587B]" />
                  <span>Statement</span>
                </button>
                <button onClick={() => setLedgerAccountId(null)} className="p-1.5 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[11px] text-[#667781] uppercase">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Voucher</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EDEF]">
                  {ledgerData.entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-[#667781]">
                        No posted General Ledger movements for this account yet.
                      </td>
                    </tr>
                  ) : (
                    ledgerData.entries.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{row.entryDate}</td>
                        <td className="px-3 py-2 font-semibold text-[#16587B] whitespace-nowrap">{row.journalNumber}</td>
                        <td className="px-3 py-2 text-[#111B21]">{row.description}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.debit > 0 ? fmtINR(row.debit) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.credit > 0 ? fmtINR(row.credit) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold">{fmtINR(row.runningBalance)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate & Migrate Modal */}
      {deactivateTarget && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xl w-full max-w-md p-5 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-[#111B21]">
              Deactivate {deactivateTarget.code} — {deactivateTarget.name}
            </h3>
            <p className="text-[#667781]">
              Current balance: <strong className="text-[#111B21]">{fmtINR(deactivateTarget.currentBalance)}</strong>.
              {Math.abs(deactivateTarget.currentBalance) > 0.01
                ? ' Select an active destination account to migrate this balance via an automated journal entry.'
                : ' Balance is zero — account can be safely deactivated immediately.'}
            </p>
            {Math.abs(deactivateTarget.currentBalance) > 0.01 && (
              <div>
                <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Migrate Balance To *</label>
                <select
                  value={migrateToId}
                  onChange={(e) => setMigrateToId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg bg-white"
                >
                  <option value="">Select destination account...</option>
                  {accounts
                    .filter((a) => a.isActive && a.id !== deactivateTarget.id && a.accountClass === deactivateTarget.accountClass)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeactivateTarget(null)}
                className="px-3.5 py-2 border border-[#D1D7DB] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeactivate}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg cursor-pointer"
              >
                Confirm Deactivation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
