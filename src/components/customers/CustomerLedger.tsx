/**
 * SLATE POS — Customers & Receivables Ledger
 * B2B/B2C Indian customer records, GSTIN identification, credit limit monitoring, and payment collection
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6 / #ECE5DD / #D1D7DB)
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
} from 'lucide-react';
import { ModuleActionMenu } from '../common/ModuleActionMenu';

export const CustomerLedger: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>(offlineStore.getCustomers());
  const [searchTerm, setSearchTerm] = useState('');
  const [storeBy, setStoreBy] = useState('DEFAULT');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
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

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setCustomers(offlineStore.getCustomers());
    });
    return unsub;
  }, []);

  const handleAddCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;

    offlineStore.addCustomer({
      name,
      phone,
      email: email.trim() || undefined,
      gstin: gstin.trim() || undefined,
      address: address.trim() || undefined,
      city: 'Bengaluru',
      state: 'Karnataka',
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
    if (!selectedCustomer || paymentAmount <= 0) return;

    offlineStore.allocateCustomerPayment(
      selectedCustomer.id,
      Number(paymentAmount),
      paymentMode,
      paymentRef || `ALLOC_${Date.now()}`
    );

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
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-[#D1D7DB] shadow-2xs flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <h1 className="text-sm sm:text-base font-bold text-[#111B21]">Customer Accounts</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#8696A0] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search customer, phone, GSTIN..."
              className="w-44 sm:w-64 pl-8 pr-7 py-1.5 text-xs rounded-lg border border-[#D1D7DB] focus:outline-none focus:ring-1 focus:ring-[#075E54] bg-[#F7F5F2]"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8696A0] hover:text-[#111B21]"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* + New Button */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-[#075E54] to-[#128C7E] text-white text-xs font-bold shadow-xs hover:opacity-95 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-white" />
            <span>New</span>
          </button>

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

      {/* Customer Ledger Table */}
      <div className="bg-white rounded-lg border border-[#D1D7DB] overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F7F5F2] text-[#3B4A54] border-b border-[#D1D7DB]">
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
                      <div className="w-12 h-12 rounded-full bg-[#F7F5F2] border border-[#D1D7DB] flex items-center justify-center text-[#8696A0] mb-3">
                        <Users className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-bold text-[#111B21]">No customers found</h4>
                      <p className="text-xs text-[#667781] mt-1">
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
                  <tr key={cust.id} className="hover:bg-[#F7F5F2] transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-[#111B21]">{cust.name}</div>
                      {cust.address && <div className="text-[11px] text-[#667781]">{cust.address}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <div className="tabular-nums text-[#111B21] font-medium">{cust.phone}</div>
                      {cust.gstin ? (
                        <div className="text-[10px] tabular-nums text-[#075E54] font-bold">
                          GSTIN: {cust.gstin}
                        </div>
                      ) : (
                        <div className="text-[10px] text-[#8696A0]">Retail / Unregistered</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-[#3B4A54]">
                      {formatINR(cust.creditLimit)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      <span className={`font-bold ${hasBalance ? 'text-[#B91C1C]' : 'text-[#075E54]'}`}>
                        {formatINR(cust.currentReceivableBalance)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center tabular-nums text-[#111B21]">
                      {cust.totalOrdersCount}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {hasBalance ? (
                        <button
                          onClick={() => {
                            setSelectedCustomer(cust);
                            setPaymentAmount(cust.currentReceivableBalance);
                            setIsReceivePaymentOpen(true);
                          }}
                          className="px-3 py-1 text-[11px] font-bold text-white bg-[#075E54] hover:bg-[#128C7E] rounded shadow-2xs transition-colors cursor-pointer"
                        >
                          Receive Payment
                        </button>
                      ) : (
                        <span className="text-[11px] font-semibold text-[#075E54] bg-[#DCF8C6] px-2 py-0.5 rounded">All Settled</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD CUSTOMER MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl border border-[#D1D7DB] w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#D1D7DB]">
              <h3 className="text-sm font-bold text-[#111B21]">Register New Customer</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-[#667781] hover:text-[#111B21] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCustomerSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Company / Customer Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. SRS Logistics &amp; Supplies"
                  className="w-full px-3 py-1.5 border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">Phone (+91)</label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98450 12345"
                    className="w-full px-3 py-1.5 tabular-nums border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">Email (Optional)</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="billing@company.com"
                    className="w-full px-3 py-1.5 border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">GSTIN (15 Digits for B2B Tax Invoicing)</label>
                <input
                  type="text"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="29AABCU9603R1ZM"
                  className="w-full px-3 py-1.5 tabular-nums uppercase border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Authorized Credit Limit (INR)</label>
                <input
                  type="number"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 tabular-nums border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Billing Address</label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Shop / Office address..."
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
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECEIVE PAYMENT MODAL */}
      {isReceivePaymentOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl border border-[#D1D7DB] w-full max-w-sm p-6 space-y-4">
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
                  className="w-full px-3 py-2 text-base font-bold tabular-nums border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Payment Tender Mode</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as any)}
                  className="w-full px-3 py-1.5 bg-white border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
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
                  className="w-full px-3 py-1.5 tabular-nums border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#D1D7DB]">
                <button
                  type="button"
                  onClick={() => setIsReceivePaymentOpen(false)}
                  className="px-3 py-1.5 text-[#667781] hover:bg-[#F7F5F2] rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-bold bg-[#075E54] text-white rounded hover:bg-[#128C7E] cursor-pointer"
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
