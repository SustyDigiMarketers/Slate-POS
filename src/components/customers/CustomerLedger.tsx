/**
 * SLATE POS — Customers & Receivables Ledger
 * B2B/B2C Indian customer records, GSTIN identification, credit limit monitoring, and payment collection
 * Styled with SLATE POS Tricolour Theme (#16587B / #84B3CE / #F5EEDD / #FAF6EC / #C9D6DF)
 */

import React, { useState, useEffect } from 'react';
import { Customer } from '../../types';
import { offlineStore } from '../../lib/offlineStore';
import { formatINR } from '../../lib/formatters';
import { THEME } from '../../lib/theme';
import {
  Users,
  Plus,
  Search,
  CreditCard,
  Phone,
  FileText,
  CheckCircle,
  X,
  ArrowDownLeft,
  Pencil,
  Trash2,
} from 'lucide-react';
import { ModuleActionMenu } from '../common/ModuleActionMenu';
import { AddCustomerModal } from './AddCustomerModal';
import { hasPermission } from '../../lib/permissions';

export const CustomerLedger: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>(offlineStore.getCustomers());
  const [activeUser, setActiveUser] = useState(offlineStore.getActiveUser());
  const [searchTerm, setSearchTerm] = useState('');
  const [storeBy, setStoreBy] = useState('DEFAULT');

  const canCreateCustomer = hasPermission(activeUser, 'CUSTOMERS_CREATE');
  const canEditCustomer = hasPermission(activeUser, 'CUSTOMERS_EDIT');
  const canDeleteCustomer = hasPermission(activeUser, 'CUSTOMERS_DELETE');
  const canCollectPayment = hasPermission(activeUser, 'PAYMENTS_COLLECT');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isReceivePaymentOpen, setIsReceivePaymentOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Add Customer Form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState(50000);

  // Receive Payment Form
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<'UPI' | 'CASH' | 'NEFT/RTGS'>('UPI');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentFeedback, setPaymentFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setCustomers(offlineStore.getCustomers());
      setActiveUser(offlineStore.getActiveUser());
    });
    return unsub;
  }, []);

  const handleAddCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;

    const activeBranch = offlineStore.getActiveBranch();
    const activeOrg = offlineStore.getOrganization();
    offlineStore.addCustomer({
      name,
      phone,
      email: email.trim() || undefined,
      gstin: gstin.trim() || undefined,
      address: address.trim() || undefined,
      city: activeBranch?.city || activeOrg?.city || '',
      state: activeOrg?.state || activeBranch?.state || '',
      creditLimit: Number(creditLimit) || 0,
    });

    setIsAddModalOpen(false);
    setName('');
    setPhone('');
    setEmail('');
    setGstin('');
    setAddress('');
  };

  const handleReceivePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || paymentAmount <= 0) {
      setPaymentFeedback({ type: 'error', msg: 'Enter a valid positive payment amount.' });
      return;
    }

    const res = offlineStore.allocateCustomerPayment(
      selectedCustomer.id,
      Number(paymentAmount),
      paymentMode,
      paymentRef || `ALLOC_${Date.now()}`
    );

    if (!res.success) {
      setPaymentFeedback({ type: 'error', msg: res.error || 'Unable to record receipt.' });
      return;
    }

    setPaymentFeedback({
      type: 'success',
      msg: `Receipt recorded for ${selectedCustomer.name} (${formatINR(Number(paymentAmount))}) and posted to General Ledger.`,
    });
    setTimeout(() => setPaymentFeedback(null), 5000);

    setIsReceivePaymentOpen(false);
    setSelectedCustomer(null);
    setPaymentAmount(0);
    setPaymentRef('');
  };

  const filtered = customers
    .filter((c) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          (c.gstin && c.gstin.toLowerCase().includes(q))
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (storeBy === 'NAME') return a.name.localeCompare(b.name);
      if (storeBy === 'RECEIVABLE') return b.currentReceivableBalance - a.currentReceivableBalance;
      if (storeBy === 'ORDERS') return b.totalOrdersCount - a.totalOrdersCount;
      return 0; // DEFAULT
    });

  const totalOutstandingAll = customers.reduce((acc, c) => acc + c.currentReceivableBalance, 0);

  return (
    <div className="space-y-4 font-sans">
      {/* UNIFIED MODULE TOOLBAR */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-[#16587B]/15 shadow-2xs flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <h1 className="text-sm sm:text-base font-bold text-[#111B21]">Customer Accounts</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#405D6D] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search customer, phone, GSTIN..."
              className="w-44 sm:w-64 pl-8 pr-7 py-1.5 text-xs rounded-lg border border-[#C9D6DF] focus:outline-none focus:ring-1 focus:ring-[#16587B] bg-[#FAF6EC]"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#405D6D] hover:text-[#111B21]"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* + New Button */}
          {canCreateCustomer && (
            <button
              onClick={() => {
                setEditingCustomer(null);
                setIsAddModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#F5EEDD]" />
              <span>New</span>
            </button>
          )}

          {/* Module Action Menu */}
          <ModuleActionMenu
            moduleKey="CUSTOMERS"
            filterQuery={searchTerm}
            currentStoreBy={storeBy}
            onSelectStoreBy={(opt) => setStoreBy(opt)}
            storeByOptions={[
              { id: 'DEFAULT', label: 'Default Order', desc: 'Standard ledger ordering' },
              { id: 'NAME', label: 'Customer Name (A–Z)', desc: 'Alphabetical sorting by customer name' },
              { id: 'RECEIVABLE', label: 'Highest Outstanding Balance', desc: 'Ranked by uncollected dues' },
              { id: 'ORDERS', label: 'Most Lifetime Orders', desc: 'Ranked by highest order volume' },
            ]}
            onRefresh={() => {
              setCustomers(offlineStore.getCustomers());
            }}
          />
        </div>
      </div>

      {paymentFeedback && (
        <div
          className={`px-3.5 py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-between ${
            paymentFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{paymentFeedback.msg}</span>
          <button type="button" onClick={() => setPaymentFeedback(null)} className="cursor-pointer p-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Customer Ledger Table */}
      <div className="bg-white rounded-lg border border-[#16587B]/15 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF6EC] text-[#405D6D] border-b border-[#C9D6DF]">
              <tr>
                <th className="py-3 px-4 font-bold">Customer / Company</th>
                <th className="py-3 px-4 font-bold">Contact &amp; GSTIN</th>
                <th className="py-3 px-4 font-bold text-right">Credit Limit</th>
                <th className="py-3 px-4 font-bold text-right">Outstanding Balance</th>
                <th className="py-3 px-4 font-bold text-center">Lifetime Orders</th>
                <th className="py-3 px-4 font-bold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9EDEF]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 px-4 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="w-12 h-12 rounded-full bg-[#FAF6EC] border border-[#C9D6DF] flex items-center justify-center text-[#16587B] mb-3">
                        <Users className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-bold text-[#111B21]">No customers found</h4>
                      <p className="text-xs text-[#405D6D] mt-1">
                        {customers.length === 0
                          ? 'No customers have been registered yet. Click "+ New Customer" to register your first client.'
                          : 'No customers match the current search filter.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map((cust) => {
                const hasBalance = cust.currentReceivableBalance > 0;
                return (
                  <tr key={cust.id} className="hover:bg-[#FAF6EC] transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-[#111B21]">{cust.name}</div>
                      {cust.address && <div className="text-[11px] text-[#405D6D]">{cust.address}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <div className="tabular-nums text-[#111B21] font-medium">{cust.phone}</div>
                      {cust.gstin ? (
                        <div className="text-[10px] tabular-nums text-[#16587B] font-bold">
                          GSTIN: {cust.gstin}
                        </div>
                      ) : (
                        <div className="text-[10px] text-[#405D6D]">Retail / Unregistered</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-[#405D6D]">
                      {formatINR(cust.creditLimit)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      <span className={`font-bold ${hasBalance ? 'text-[#B91C1C]' : 'text-[#16587B]'}`}>
                        {formatINR(cust.currentReceivableBalance)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center tabular-nums text-[#111B21]">
                      {cust.totalOrdersCount}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                        {hasBalance ? (
                          canCollectPayment ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCustomer(cust);
                                setPaymentAmount(cust.currentReceivableBalance);
                                setIsReceivePaymentOpen(true);
                              }}
                              className="px-3 py-1 text-[11px] font-bold text-[#F5EEDD] bg-[#16587B] hover:bg-[#124866] rounded shadow-2xs transition-colors cursor-pointer"
                            >
                              Receive Payment
                            </button>
                          ) : (
                            <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                              Balance Due
                            </span>
                          )
                        ) : (
                          <span className="text-[11px] font-semibold text-[#16587B] bg-[#84B3CE]/25 px-2 py-0.5 rounded">All Settled</span>
                        )}
                        {canEditCustomer && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCustomer(cust);
                              setIsAddModalOpen(true);
                            }}
                            className="p-1.5 text-[#16587B] hover:bg-[#84B3CE]/25 rounded border border-[#16587B]/30 cursor-pointer"
                            title="Edit customer"
                            aria-label={`Edit ${cust.name}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDeleteCustomer && (
                          confirmDeleteId === cust.id ? (
                            <button
                              type="button"
                              onClick={() => {
                                offlineStore.deleteCustomer(cust.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2 py-1 text-[10px] font-bold bg-rose-600 text-white rounded hover:bg-rose-700 cursor-pointer"
                            >
                              Confirm Delete
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(cust.id)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded border border-rose-200 cursor-pointer"
                              title="Delete customer"
                              aria-label={`Delete ${cust.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT CUSTOMER MODAL */}
      <AddCustomerModal
        isOpen={isAddModalOpen && (editingCustomer ? canEditCustomer : canCreateCustomer)}
        customerToEdit={editingCustomer}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingCustomer(null);
        }}
        onSuccess={() => {
          setCustomers(offlineStore.getCustomers());
        }}
      />

      {/* RECEIVE PAYMENT MODAL */}
      {isReceivePaymentOpen && canCollectPayment && selectedCustomer && (
        <div className="fixed inset-0 bg-[#0F405B]/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl border border-[#16587B]/20 w-full max-w-sm p-6 space-y-4">
            <h3 className="text-sm font-bold text-[#111B21]">
              Collect Receivables: {selectedCustomer.name}
            </h3>

            <div className="p-3 bg-[#FEF3C7] border border-[#FDE68A] rounded text-xs space-y-0.5">
              <div className="text-[#92400E] font-semibold">Total Unpaid Balance:</div>
              <div className="text-lg font-bold tabular-nums text-[#92400E]">
                {formatINR(selectedCustomer.currentReceivableBalance)}
              </div>
            </div>

            <form onSubmit={handleReceivePaymentSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Amount Collected (INR)</label>
                <input
                  type="number"
                  required
                  value={paymentAmount || ''}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-base font-bold tabular-nums border border-[#C9D6DF] rounded focus:border-[#16587B] outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Payment Tender Mode</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as any)}
                  className="w-full px-3 py-1.5 bg-white border border-[#C9D6DF] rounded focus:border-[#16587B] outline-none"
                >
                  <option value="UPI">UPI (Google Pay / PhonePe / Paytm)</option>
                  <option value="NEFT/RTGS">NEFT / RTGS / Bank Wire</option>
                  <option value="CASH">Counter Cash</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Bank Reference / UTR Number</label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="e.g. UTR6281094812"
                  className="w-full px-3 py-1.5 tabular-nums border border-[#C9D6DF] rounded focus:border-[#16587B] outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#C9D6DF]">
                <button
                  type="button"
                  onClick={() => setIsReceivePaymentOpen(false)}
                  className="px-3 py-1.5 text-[#405D6D] hover:bg-[#FAF6EC] rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-bold bg-[#16587B] text-[#F5EEDD] rounded hover:bg-[#124866] cursor-pointer"
                >
                  Confirm &amp; Allocate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
