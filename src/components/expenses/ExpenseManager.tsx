/**
 * SLATE POS — Expenses Ledger & GST Input Tax Credit (ITC)
 * Tracks commercial rent, utilities, vendor logistics, wages, and operating overheads
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6 / #ECE5DD / #D1D7DB)
 */

import React, { useState, useEffect } from 'react';
import { Expense } from '../../types';
import { offlineStore } from '../../lib/offlineStore';
import { formatINR, formatDate } from '../../lib/formatters';
import { THEME } from '../../lib/theme';
import {
  Wallet,
  Plus,
  Search,
  Receipt,
  Building,
  Zap,
  Truck,
  Wrench,
  X,
} from 'lucide-react';
import { ModuleActionMenu } from '../common/ModuleActionMenu';

export const ExpenseManager: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>(offlineStore.getExpenses());
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [storeBy, setStoreBy] = useState('DEFAULT');

  // Add Expense Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [category, setCategory] = useState<Expense['category']>('Rent');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [gstPaid, setGstPaid] = useState<number>(0);
  const [isGstInputEligible, setIsGstInputEligible] = useState(true);
  const [paymentMode, setPaymentMode] = useState<Expense['paymentMode']>('UPI');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setExpenses(offlineStore.getExpenses());
    });
    return unsub;
  }, []);

  const handleAddExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor || amount <= 0) return;

    offlineStore.addExpense({
      organizationId: 'org_apex_01',
      branchId: offlineStore.getActiveBranchId(),
      category,
      vendor,
      date: new Date().toISOString().split('T')[0],
      amount: Number(amount),
      gstPaid: Number(gstPaid),
      isGstInputEligible,
      paymentMode,
      invoiceRef: invoiceRef.trim() || undefined,
      notes: notes.trim() || undefined,
    });

    setIsAddModalOpen(false);
    setVendor('');
    setAmount(0);
    setGstPaid(0);
    setInvoiceRef('');
    setNotes('');
  };

  const totalExpenseSum = expenses.reduce((acc, e) => acc + e.amount, 0);
  const totalGstItcSum = expenses
    .filter((e) => e.isGstInputEligible)
    .reduce((acc, e) => acc + e.gstPaid, 0);

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

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#075E54] hover:bg-[#128C7E] rounded-md transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New</span>
          </button>

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
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F7F5F2] border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="text-xs bg-[#F7F5F2] border border-[#D1D7DB] rounded px-3 py-1.5 text-[#111B21] focus:border-[#128C7E] outline-none"
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
            <thead className="bg-[#F7F5F2] text-[#3B4A54] border-b border-[#D1D7DB]">
              <tr>
                <th className="py-3 px-4 font-bold">Date</th>
                <th className="py-3 px-4 font-bold">Category</th>
                <th className="py-3 px-4 font-bold">Vendor / Payee</th>
                <th className="py-3 px-4 font-bold">Payment Mode</th>
                <th className="py-3 px-4 font-bold text-right">Amount (Gross)</th>
                <th className="py-3 px-4 font-bold text-right">GST Paid (ITC)</th>
                <th className="py-3 px-4 font-bold">Invoice Ref &amp; Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9EDEF]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#667781]">
                    <Receipt className="w-10 h-10 mx-auto text-[#D1D7DB] mb-2" />
                    <p className="font-semibold text-sm text-[#111B21]">No expenses recorded</p>
                    <p className="text-xs mt-0.5">Click "+ Record Expense" to log operational overheads.</p>
                  </td>
                </tr>
              ) : filtered.map((exp) => (
                <tr key={exp.id} className="hover:bg-[#F7F5F2] transition-colors">
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
                  <td className="py-3 px-4 text-right tabular-nums text-[#075E54]">
                    {exp.gstPaid > 0 ? (
                      <div>
                        <span className="font-bold">{formatINR(exp.gstPaid)}</span>
                        {exp.isGstInputEligible && (
                          <span className="block text-[10px] text-[#075E54] font-semibold">Eligible ITC</span>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* RECORD EXPENSE MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl border border-[#D1D7DB] w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#D1D7DB]">
              <h3 className="text-sm font-bold text-[#111B21]">Record Business Expense</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-[#667781] hover:text-[#111B21] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddExpenseSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">Expense Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-white border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
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
                    onChange={(e) => setPaymentMode(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-white border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                  >
                    <option value="UPI">UPI</option>
                    <option value="NEFT/RTGS">NEFT / RTGS</option>
                    <option value="CASH">Cash</option>
                    <option value="CARD">Debit/Credit Card</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Vendor / Payee</label>
                <input
                  type="text"
                  required
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="e.g. BESCOM Electricity Board"
                  className="w-full px-3 py-1.5 border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                />
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
                    className="w-full px-3 py-1.5 tabular-nums text-sm font-bold border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">GST Component Paid</label>
                  <input
                    type="number"
                    value={gstPaid || ''}
                    onChange={(e) => setGstPaid(parseFloat(e.target.value) || 0)}
                    placeholder="₹0"
                    className="w-full px-3 py-1.5 tabular-nums border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="gstEligible"
                  checked={isGstInputEligible}
                  onChange={(e) => setIsGstInputEligible(e.target.checked)}
                  className="rounded text-[#075E54]"
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
                  className="w-full px-3 py-1.5 tabular-nums border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Notes / Description</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Monthly billing details..."
                  className="w-full px-3 py-1.5 border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#D1D7DB]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-[#667781] hover:bg-[#F7F5F2] rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-bold bg-[#075E54] text-white rounded hover:bg-[#128C7E] cursor-pointer"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
