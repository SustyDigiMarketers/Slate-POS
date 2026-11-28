/**
 * SLATE POS — Expenses Ledger & GST Input Tax Credit (ITC)
 * Tracks commercial rent, utilities, vendor logistics, wages, and operating overheads
 * Styled with SLATE POS Tricolour Theme (#16587B / #84B3CE / #F5EEDD)
 */

import React, { useState, useEffect, useRef } from 'react';
import { Expense } from '../../types';
import { offlineStore } from '../../lib/offlineStore';
import { formatINR, formatDate } from '../../lib/formatters';
import { hasPermission } from '../../lib/permissions';
import {
  Plus,
  Search,
  Receipt,
  X,
  Pencil,
  Trash2,
} from 'lucide-react';
import { ModuleActionMenu } from '../common/ModuleActionMenu';

const EXPENSE_DRAFT_KEY = 'expense_form';

interface ExpenseDraft {
  category: Expense['category'];
  vendor: string;
  date: string;
  amount: number;
  gstPaid: number;
  isGstInputEligible: boolean;
  paymentMode: Expense['paymentMode'];
  invoiceRef: string;
  notes: string;
}

export const ExpenseManager: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>(offlineStore.getExpenses());
  const [activeUser, setActiveUser] = useState(offlineStore.getActiveUser());
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [storeBy, setStoreBy] = useState('DEFAULT');

  const canManageExpenses = hasPermission(activeUser, 'EXPENSES_MANAGE');

  // Add / Edit Expense Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  const [category, setCategory] = useState<Expense['category']>('Rent');
  const [vendor, setVendor] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<number>(0);
  const [gstPaid, setGstPaid] = useState<number>(0);
  const [isGstInputEligible, setIsGstInputEligible] = useState(true);
  const [paymentMode, setPaymentMode] = useState<Expense['paymentMode']>('UPI');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [notes, setNotes] = useState('');

  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setExpenses(offlineStore.getExpenses());
      setActiveUser(offlineStore.getActiveUser());
    });
    return unsub;
  }, []);

  // Debounced autosave for new expense form drafts
  useEffect(() => {
    if (!isAddModalOpen || editingExpense) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      const hasInput = Boolean(vendor.trim() || amount > 0 || gstPaid > 0 || invoiceRef.trim() || notes.trim());
      if (hasInput) {
        offlineStore.saveDraft(EXPENSE_DRAFT_KEY, {
          category,
          vendor,
          date,
          amount,
          gstPaid,
          isGstInputEligible,
          paymentMode,
          invoiceRef,
          notes,
        });
      }
    }, 350);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [isAddModalOpen, editingExpense, category, vendor, date, amount, gstPaid, isGstInputEligible, paymentMode, invoiceRef, notes]);

  const resetForm = () => {
    setCategory('Rent');
    setVendor('');
    setDate(new Date().toISOString().split('T')[0]);
    setAmount(0);
    setGstPaid(0);
    setIsGstInputEligible(true);
    setPaymentMode('UPI');
    setInvoiceRef('');
    setNotes('');
    setDraftRestored(false);
  };

  const openCreateModal = () => {
    setEditingExpense(null);
    const saved = offlineStore.getDraft<ExpenseDraft>(EXPENSE_DRAFT_KEY);
    if (saved) {
      setCategory(saved.category || 'Rent');
      setVendor(saved.vendor || '');
      setDate(saved.date || new Date().toISOString().split('T')[0]);
      setAmount(Number(saved.amount) || 0);
      setGstPaid(Number(saved.gstPaid) || 0);
      setIsGstInputEligible(saved.isGstInputEligible ?? true);
      setPaymentMode(saved.paymentMode || 'UPI');
      setInvoiceRef(saved.invoiceRef || '');
      setNotes(saved.notes || '');
      setDraftRestored(true);
    } else {
      resetForm();
    }
    setIsAddModalOpen(true);
  };

  const openEditModal = (exp: Expense) => {
    setEditingExpense(exp);
    setDraftRestored(false);
    setCategory(exp.category);
    setVendor(exp.vendor);
    setDate(exp.date || new Date().toISOString().split('T')[0]);
    setAmount(exp.amount);
    setGstPaid(exp.gstPaid);
    setIsGstInputEligible(exp.isGstInputEligible);
    setPaymentMode(exp.paymentMode);
    setInvoiceRef(exp.invoiceRef || '');
    setNotes(exp.notes || '');
    setIsAddModalOpen(true);
  };

  const handleSaveExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageExpenses || !vendor.trim() || amount <= 0) return;

    const activeOrgId = offlineStore.getOrganization().id;
    const activeBranchId = offlineStore.getActiveBranchId();

    if (editingExpense) {
      offlineStore.updateExpense(editingExpense.id, {
        organizationId: editingExpense.organizationId || activeOrgId,
        branchId: editingExpense.branchId || activeBranchId,
        category,
        vendor: vendor.trim(),
        date: date || editingExpense.date,
        amount: Number(amount),
        gstPaid: Number(gstPaid),
        isGstInputEligible,
        paymentMode,
        invoiceRef: invoiceRef.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    } else {
      offlineStore.addExpense({
        organizationId: activeOrgId,
        branchId: activeBranchId,
        category,
        vendor: vendor.trim(),
        date: date || new Date().toISOString().split('T')[0],
        amount: Number(amount),
        gstPaid: Number(gstPaid),
        isGstInputEligible,
        paymentMode,
        invoiceRef: invoiceRef.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      offlineStore.clearDraft(EXPENSE_DRAFT_KEY);
    }

    setIsAddModalOpen(false);
    setEditingExpense(null);
    resetForm();
  };

  const filtered = expenses
    .filter((e) => {
      if (categoryFilter !== 'ALL' && e.category !== categoryFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return (
          e.vendor.toLowerCase().includes(q) ||
          (e.notes && e.notes.toLowerCase().includes(q)) ||
          (e.invoiceRef && e.invoiceRef.toLowerCase().includes(q))
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (storeBy === 'DATE') return b.date.localeCompare(a.date);
      if (storeBy === 'AMOUNT') return b.amount - a.amount;
      if (storeBy === 'VENDOR') return a.vendor.localeCompare(b.vendor);
      if (storeBy === 'CATEGORY') return a.category.localeCompare(b.category);
      return 0; // DEFAULT
    });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-[#D1D7DB] shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-[#111B21] flex items-center gap-2">
            <span>Operating Expenses</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {canManageExpenses && (
            <button
              type="button"
              onClick={openCreateModal}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-[#F5EEDD] bg-[#16587B] hover:bg-[#124866] rounded-md transition-colors shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New</span>
            </button>
          )}

          <ModuleActionMenu
            moduleKey="EXPENSES"
            filterQuery={searchTerm}
            currentStoreBy={storeBy}
            onSelectStoreBy={(opt) => setStoreBy(opt)}
            storeByOptions={[
              { id: 'DEFAULT', label: 'Default Order', desc: 'Standard expense ledger order' },
              { id: 'DATE', label: 'Most Recent Date', desc: 'Sort by latest expense transaction' },
              { id: 'AMOUNT', label: 'Highest Amount', desc: 'Ranked by highest monetary outlays' },
              { id: 'VENDOR', label: 'Vendor / Payee (A–Z)', desc: 'Alphabetical sorting by vendor name' },
              { id: 'CATEGORY', label: 'Expense Category', desc: 'Grouped by accounting category' },
            ]}
            onRefresh={() => {
              setExpenses(offlineStore.getExpenses());
            }}
          />
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-lg border border-[#D1D7DB] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#8696A0] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search vendor, invoice reference, or notes..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#FAF6EC] border border-[#D1D7DB] rounded focus:border-[#16587B] outline-none"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="text-xs bg-[#FAF6EC] border border-[#D1D7DB] rounded px-3 py-1.5 text-[#111B21] focus:border-[#16587B] outline-none"
        >
          <option value="ALL">All Categories</option>
          <option value="Rent">Rent</option>
          <option value="Staff Wages">Staff Wages</option>
          <option value="Utilities & Power">Utilities &amp; Power</option>
          <option value="Inventory Logistics">Inventory Logistics</option>
          <option value="Store Maintenance">Store Maintenance</option>
          <option value="Marketing">Marketing</option>
        </select>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-lg border border-[#D1D7DB] overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF6EC] text-[#3B4A54] border-b border-[#D1D7DB]">
              <tr>
                <th className="py-3 px-4 font-bold">Date</th>
                <th className="py-3 px-4 font-bold">Category</th>
                <th className="py-3 px-4 font-bold">Vendor / Payee</th>
                <th className="py-3 px-4 font-bold">Payment Mode</th>
                <th className="py-3 px-4 font-bold text-right">Amount (Gross)</th>
                <th className="py-3 px-4 font-bold text-right">GST Paid (ITC)</th>
                <th className="py-3 px-4 font-bold">Invoice Ref &amp; Notes</th>
                {canManageExpenses && (
                  <th className="py-3 px-4 font-bold text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9EDEF]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canManageExpenses ? 8 : 7} className="py-12 text-center text-[#667781]">
                    <Receipt className="w-10 h-10 mx-auto text-[#D1D7DB] mb-2" />
                    <p className="font-semibold text-sm text-[#111B21]">No expenses recorded</p>
                    <p className="text-xs mt-0.5">Click &quot;+ New&quot; to log operational overheads.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((exp) => (
                  <tr key={exp.id} className="hover:bg-[#FAF6EC] transition-colors">
                    <td className="py-3 px-4 tabular-nums text-[#3B4A54] text-[11px]">
                      {formatDate(exp.date)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-[#111B21]">{exp.category}</span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#111B21]">
                      {exp.vendor}
                    </td>
                    <td className="py-3 px-4 text-[#3B4A54] tabular-nums text-[11px]">
                      {exp.paymentMode}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums font-bold text-[#92400E]">
                      {formatINR(exp.amount)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-[#16587B]">
                      {exp.gstPaid > 0 ? (
                        <div>
                          <span className="font-bold">{formatINR(exp.gstPaid)}</span>
                          {exp.isGstInputEligible && (
                            <span className="block text-[10px] text-[#16587B] font-semibold">Eligible ITC</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#8696A0]">₹0.00</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[#667781] text-[11px]">
                      {exp.invoiceRef && <span className="tabular-nums text-[#111B21] block font-semibold">{exp.invoiceRef}</span>}
                      <span>{exp.notes || '—'}</span>
                    </td>
                    {canManageExpenses && (
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(exp)}
                            className="p-1.5 text-[#16587B] hover:bg-[#84B3CE]/25 rounded border border-[#16587B]/30 cursor-pointer"
                            title="Edit expense"
                            aria-label={`Edit ${exp.vendor}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {confirmDeleteId === exp.id ? (
                            <button
                              type="button"
                              onClick={() => {
                                offlineStore.deleteExpense(exp.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2 py-1 text-[10px] font-bold bg-rose-600 text-white rounded hover:bg-rose-700 cursor-pointer"
                            >
                              Confirm Delete
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(exp.id)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded border border-rose-200 cursor-pointer"
                              title="Delete expense"
                              aria-label={`Delete ${exp.vendor}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RECORD / EDIT EXPENSE MODAL */}
      {isAddModalOpen && canManageExpenses && (
        <div className="fixed inset-0 bg-[#0F405B]/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl border border-[#D1D7DB] w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#D1D7DB]">
              <div>
                <h3 className="text-sm font-bold text-[#111B21]">
                  {editingExpense ? 'Edit Business Expense' : 'Record Business Expense'}
                </h3>
                {draftRestored && !editingExpense && (
                  <p className="text-[10px] text-[#16587B] font-semibold mt-0.5">
                    Unsaved draft restored ·{' '}
                    <button
                      type="button"
                      onClick={() => {
                        offlineStore.clearDraft(EXPENSE_DRAFT_KEY);
                        resetForm();
                      }}
                      className="underline cursor-pointer"
                    >
                      Discard draft
                    </button>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingExpense(null);
                }}
                className="text-[#667781] hover:text-[#111B21] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveExpenseSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">Expense Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Expense['category'])}
                    className="w-full px-3 py-1.5 bg-white border border-[#D1D7DB] rounded focus:border-[#16587B] outline-none"
                  >
                    <option value="Rent">Rent</option>
                    <option value="Staff Wages">Staff Wages</option>
                    <option value="Utilities & Power">Utilities &amp; Power</option>
                    <option value="Inventory Logistics">Inventory Logistics</option>
                    <option value="Store Maintenance">Store Maintenance</option>
                    <option value="Marketing">Marketing</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as Expense['paymentMode'])}
                    className="w-full px-3 py-1.5 bg-white border border-[#D1D7DB] rounded focus:border-[#16587B] outline-none"
                  >
                    <option value="UPI">UPI</option>
                    <option value="NEFT/RTGS">NEFT / RTGS</option>
                    <option value="CASH">Cash</option>
                    <option value="CARD">Debit/Credit Card</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="font-semibold text-[#111B21] block mb-1">Vendor / Payee</label>
                  <input
                    type="text"
                    required
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    placeholder="e.g. BESCOM Electricity Board"
                    className="w-full px-3 py-1.5 border border-[#D1D7DB] rounded focus:border-[#16587B] outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-[#D1D7DB] rounded focus:border-[#16587B] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">Gross Amount (INR)</label>
                  <input
                    type="number"
                    required
                    value={amount || ''}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    placeholder="₹0"
                    className="w-full px-3 py-1.5 tabular-nums text-sm font-bold border border-[#D1D7DB] rounded focus:border-[#16587B] outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">GST Component Paid</label>
                  <input
                    type="number"
                    value={gstPaid || ''}
                    onChange={(e) => setGstPaid(parseFloat(e.target.value) || 0)}
                    placeholder="₹0"
                    className="w-full px-3 py-1.5 tabular-nums border border-[#D1D7DB] rounded focus:border-[#16587B] outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="gstEligible"
                  checked={isGstInputEligible}
                  onChange={(e) => setIsGstInputEligible(e.target.checked)}
                  className="rounded accent-[#16587B]"
                />
                <label htmlFor="gstEligible" className="text-[#111B21]">
                  Eligible for GST Input Tax Credit (ITC) claim
                </label>
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Vendor Invoice # / Reference</label>
                <input
                  type="text"
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                  placeholder="INV/2026/089"
                  className="w-full px-3 py-1.5 tabular-nums border border-[#D1D7DB] rounded focus:border-[#16587B] outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Notes / Description</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Monthly billing details..."
                  className="w-full px-3 py-1.5 border border-[#D1D7DB] rounded focus:border-[#16587B] outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#D1D7DB]">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingExpense(null);
                  }}
                  className="px-3 py-1.5 text-[#667781] hover:bg-[#FAF6EC] rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-bold bg-[#16587B] text-[#F5EEDD] rounded hover:bg-[#124866] cursor-pointer"
                >
                  {editingExpense ? 'Update Expense' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
