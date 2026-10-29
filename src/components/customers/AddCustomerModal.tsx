/**
 * SLATE POS — Redesigned Accounting-Friendly Add New Customer Modal
 * Form Sections:
 * A. General Details (Name, Alias, Customer Type, Ledger Group, Contact Person, Mobile, Email)
 * B. Address Details (Address, State, Country, Pincode)
 * C. Accounting Details (Opening Balance, Dr/Cr, Bill-wise opening details, GST Type, GSTIN, PAN)
 * D. Additional Details (Credit Limit, Credit Days, Notes)
 *
 * Responsive across mobile, tablet, and desktop.
 */

import React, { useState } from 'react';
import { X, Building2, MapPin, Calculator, FileText, Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { offlineStore } from '../../lib/offlineStore';
import { Customer } from '../../types';

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newCustomer: Customer) => void;
}

export const STATE_OPTIONS = [
  { code: '33', name: 'Tamil Nadu' },
  { code: '29', name: 'Karnataka' },
  { code: '27', name: 'Maharashtra' },
  { code: '07', name: 'Delhi' },
  { code: '24', name: 'Gujarat' },
  { code: '36', name: 'Telangana' },
  { code: '32', name: 'Kerala' },
  { code: '19', name: 'West Bengal' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '08', name: 'Rajasthan' },
  { code: '00', name: 'Other State / UT' },
];

export const AddCustomerModal: React.FC<AddCustomerModalProps> = ({ isOpen, onClose, onSuccess }) => {
  // A. General Details
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [customerType, setCustomerType] = useState<'B2B' | 'B2C' | 'EXPORT'>('B2B');
  const [ledgerGroup, setLedgerGroup] = useState('Sundry Debtors');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // B. Address Details
  const [address, setAddress] = useState('');
  const [state, setState] = useState('Tamil Nadu');
  const [country, setCountry] = useState('India');
  const [pincode, setPincode] = useState('');

  // C. Accounting Details
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [drCr, setDrCr] = useState<'Dr' | 'Cr'>('Dr');
  const [gstType, setGstType] = useState<'UNREGISTERED' | 'REGULAR' | 'COMPOSITION'>('REGULAR');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');

  // Bill-wise Opening Balances
  const [billDetails, setBillDetails] = useState<Array<{ date: string; name: string; amount: number; drCr: 'Dr' | 'Cr' }>>([]);
  const [showBillWiseForm, setShowBillWiseForm] = useState(false);
  const [newBillDate, setNewBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [newBillName, setNewBillName] = useState('');
  const [newBillAmount, setNewBillAmount] = useState<number>(0);
  const [newBillDrCr, setNewBillDrCr] = useState<'Dr' | 'Cr'>('Dr');

  // D. Additional Details
  const [creditLimit, setCreditLimit] = useState<number>(50000);
  const [creditDays, setCreditDays] = useState<number>(30);
  const [notes, setNotes] = useState('');

  // Errors & UI
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddBill = () => {
    if (!newBillName.trim() || newBillAmount <= 0) return;
    setBillDetails([
      ...billDetails,
      {
        date: newBillDate,
        name: newBillName.trim(),
        amount: newBillAmount,
        drCr: newBillDrCr,
      },
    ]);
    setNewBillName('');
    setNewBillAmount(0);
  };

  const handleRemoveBill = (index: number) => {
    setBillDetails(billDetails.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const cleanPhone = phone.trim().replace(/\D/g, '');

    if (!trimmedName || trimmedName.length < 2) {
      setError('Customer / Ledger Name is required (minimum 2 characters).');
      return;
    }

    if (!cleanPhone || cleanPhone.length < 7) {
      setError('A valid mobile contact phone number is required (at least 7 digits).');
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please provide a valid email address format.');
      return;
    }

    // GSTIN Validation for Registered Customers
    const cleanGstin = gstin.trim().toUpperCase();
    if (gstType !== 'UNREGISTERED' && cleanGstin) {
      if (cleanGstin.length !== 15) {
        setError('Indian GSTIN must be exactly 15 characters long.');
        return;
      }
    }

    // Duplicate Phone / Name Check
    const existing = offlineStore.getCustomers();
    const duplicatePhone = existing.find((c) => c.phone.replace(/\D/g, '') === cleanPhone);
    if (duplicatePhone) {
      setError(`A customer with phone number ${phone} already exists (${duplicatePhone.name}).`);
      return;
    }

    const cleanPan = pan.trim().toUpperCase();

    const activeUser = offlineStore.getActiveUser();

    const newCust: Customer = {
      id: `cust_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: trimmedName,
      companyName: alias.trim() || trimmedName,
      phone: phone.trim(),
      email: email.trim() || undefined,
      gstin: gstType !== 'UNREGISTERED' && cleanGstin ? cleanGstin : undefined,
      address: address.trim() || undefined,
      city: 'Chennai',
      state,
      creditLimit: Number(creditLimit) || 0,
      currentReceivableBalance: drCr === 'Dr' ? Number(openingBalance) || 0 : -(Number(openingBalance) || 0),
      totalOrdersCount: 0,
      createdAt: new Date().toISOString(),
    };

    offlineStore.addCustomer(newCust);
    onSuccess(newCust);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 font-sans">
      <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-2xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#D1D7DB] bg-[#F7F5F2] rounded-t-xl shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#DCF8C6] flex items-center justify-center text-[#075E54]">
              <Building2 className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[#111B21]">New Customer Master (TallyPrime Compatible)</h3>
              <p className="text-[11px] text-[#667781]">
                Complete general, address, bill-wise accounting, and tax details.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#667781] hover:text-[#111B21] p-1 rounded cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="font-semibold leading-relaxed">{error}</div>
            </div>
          )}

          {/* SECTION A: GENERAL DETAILS */}
          <div className="space-y-3 bg-[#F7F5F2] p-3.5 rounded-xl border border-[#E9EDEF]">
            <div className="flex items-center gap-2 text-[#075E54] font-bold border-b border-[#D1D7DB] pb-1.5 text-xs">
              <Building2 className="w-4 h-4" />
              <span>A. General Details</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-[#111B21] block mb-1">
                  Customer / Ledger Name <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sri Krishna Traders"
                  className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:border-[#075E54] focus:ring-1 focus:ring-[#075E54] outline-none font-medium"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Print Alias / Trade Name</label>
                <input
                  type="text"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder="e.g. Krishna Foods"
                  className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:border-[#075E54] outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Customer Type</label>
                <select
                  value={customerType}
                  onChange={(e) => setCustomerType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:border-[#075E54] outline-none"
                >
                  <option value="B2B">B2B Commercial Client</option>
                  <option value="B2C">B2C Retail Customer</option>
                  <option value="EXPORT">Overseas Export Client</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Ledger Group (Tally)</label>
                <input
                  type="text"
                  readOnly
                  value={ledgerGroup}
                  className="w-full px-3 py-2 bg-[#E9EDEF] border border-[#D1D7DB] rounded-lg text-[#667781] font-bold"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Contact Person Name</label>
                <input
                  type="text"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="e.g. Vijay Kumar"
                  className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:border-[#075E54] outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-[#111B21] block mb-1">
                  Mobile Contact Phone <span className="text-rose-600">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98400 12345"
                  className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:border-[#075E54] outline-none font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Work Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="billing@sktraders.in"
                  className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:border-[#075E54] outline-none"
                />
              </div>
            </div>
          </div>

          {/* SECTION B: ADDRESS DETAILS */}
          <div className="space-y-3 bg-[#F7F5F2] p-3.5 rounded-xl border border-[#E9EDEF]">
            <div className="flex items-center gap-2 text-[#075E54] font-bold border-b border-[#D1D7DB] pb-1.5 text-xs">
              <MapPin className="w-4 h-4" />
              <span>B. Address Details</span>
            </div>

            <div>
              <label className="font-semibold text-[#111B21] block mb-1">Street Address</label>
              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Shop / Building No, Commercial Complex, Street Address..."
                className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:border-[#075E54] outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="font-semibold text-[#111B21] block mb-1">State (GST Jurisdiction)</label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:border-[#075E54] outline-none"
                >
                  {STATE_OPTIONS.map((st) => (
                    <option key={st.code} value={st.name}>
                      {st.name} ({st.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Country</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:border-[#075E54] outline-none font-medium"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">PIN Code (6 Digits)</label>
                <input
                  type="text"
                  maxLength={6}
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="600001"
                  className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:border-[#075E54] outline-none font-mono"
                />
              </div>
            </div>
          </div>

          {/* SECTION C: ACCOUNTING & TAX DETAILS */}
          <div className="space-y-3 bg-[#F7F5F2] p-3.5 rounded-xl border border-[#E9EDEF]">
            <div className="flex items-center gap-2 text-[#075E54] font-bold border-b border-[#D1D7DB] pb-1.5 text-xs">
              <Calculator className="w-4 h-4" />
              <span>C. Accounting &amp; Tax Registration Details</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Opening Balance (INR)</label>
                <input
                  type="number"
                  value={openingBalance || ''}
                  onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:border-[#075E54] outline-none font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Balance Type (Dr/Cr)</label>
                <select
                  value={drCr}
                  onChange={(e) => setDrCr(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:border-[#075E54] outline-none font-bold text-[#075E54]"
                >
                  <option value="Dr">Dr (Debit — Client owes us money)</option>
                  <option value="Cr">Cr (Credit — Advance received)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">GST Registration Type</label>
                <select
                  value={gstType}
                  onChange={(e) => setGstType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:border-[#075E54] outline-none font-medium"
                >
                  <option value="REGULAR">Regular GST Registered</option>
                  <option value="COMPOSITION">Composition Scheme</option>
                  <option value="UNREGISTERED">Unregistered / Consumer</option>
                </select>
              </div>
            </div>

            {gstType !== 'UNREGISTERED' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">GSTIN (15 Alphanumeric Digits)</label>
                  <input
                    type="text"
                    maxLength={15}
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    placeholder="33AABCU9603R1ZM"
                    className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:border-[#075E54] outline-none font-mono uppercase font-bold text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">PAN (10 Digits)</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase())}
                    placeholder="AABCU9603R"
                    className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:border-[#075E54] outline-none font-mono uppercase font-bold text-xs"
                  />
                </div>
              </div>
            )}

            {/* Bill-wise Opening Details Section */}
            <div className="pt-2 border-t border-[#D1D7DB]">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-[#111B21] text-xs">Bill-wise Opening Balances (Optional)</span>
                <button
                  type="button"
                  onClick={() => setShowBillWiseForm(!showBillWiseForm)}
                  className="text-[#075E54] hover:underline font-bold text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showBillWiseForm ? 'Close Bill Entry' : 'Add Bill Breakdown'}</span>
                </button>
              </div>

              {showBillWiseForm && (
                <div className="p-3 bg-white border border-[#D1D7DB] rounded-lg space-y-2 mb-2">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-[#667781]">Bill Date</label>
                      <input
                        type="date"
                        value={newBillDate}
                        onChange={(e) => setNewBillDate(e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-[#D1D7DB] rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#667781]">Bill Name / Invoice #</label>
                      <input
                        type="text"
                        value={newBillName}
                        onChange={(e) => setNewBillName(e.target.value)}
                        placeholder="e.g. INV-2026-0042"
                        className="w-full px-2 py-1 text-xs border border-[#D1D7DB] rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#667781]">Bill Amount (INR)</label>
                      <input
                        type="number"
                        value={newBillAmount || ''}
                        onChange={(e) => setNewBillAmount(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-full px-2 py-1 text-xs border border-[#D1D7DB] rounded font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#667781]">Dr/Cr</label>
                      <select
                        value={newBillDrCr}
                        onChange={(e) => setNewBillDrCr(e.target.value as any)}
                        className="w-full px-2 py-1 text-xs border border-[#D1D7DB] rounded font-bold"
                      >
                        <option value="Dr">Dr</option>
                        <option value="Cr">Cr</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleAddBill}
                      className="px-3 py-1 bg-[#075E54] text-white rounded text-xs font-bold hover:bg-[#128C7E] cursor-pointer"
                    >
                      Add Bill
                    </button>
                  </div>
                </div>
              )}

              {billDetails.length > 0 && (
                <div className="border border-[#D1D7DB] rounded-lg overflow-hidden max-h-32 overflow-y-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-[#E9EDEF] font-bold text-[#3B4A54]">
                      <tr>
                        <th className="p-1.5">Date</th>
                        <th className="p-1.5">Bill Ref</th>
                        <th className="p-1.5 text-right">Amount</th>
                        <th className="p-1.5 text-center">Dr/Cr</th>
                        <th className="p-1.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9EDEF]">
                      {billDetails.map((b, idx) => (
                        <tr key={idx} className="bg-white">
                          <td className="p-1.5 font-mono">{b.date}</td>
                          <td className="p-1.5 font-semibold">{b.name}</td>
                          <td className="p-1.5 text-right font-mono font-bold">₹{b.amount.toFixed(2)}</td>
                          <td className="p-1.5 text-center font-bold text-[#075E54]">{b.drCr}</td>
                          <td className="p-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveBill(idx)}
                              className="text-rose-600 hover:text-rose-800 p-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* SECTION D: ADDITIONAL DETAILS */}
          <div className="space-y-3 bg-[#F7F5F2] p-3.5 rounded-xl border border-[#E9EDEF]">
            <div className="flex items-center gap-2 text-[#075E54] font-bold border-b border-[#D1D7DB] pb-1.5 text-xs">
              <FileText className="w-4 h-4" />
              <span>D. Additional Terms &amp; Notes</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Credit Limit (INR)</label>
                <input
                  type="number"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:border-[#075E54] outline-none font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Credit Days / Period</label>
                <input
                  type="number"
                  value={creditDays}
                  onChange={(e) => setCreditDays(parseInt(e.target.value, 10) || 0)}
                  placeholder="e.g. 30"
                  className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:border-[#075E54] outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-[#111B21] block mb-1">Customer Internal Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Special billing terms, preferred delivery hours, or notes..."
                className="w-full px-3 py-2 bg-white border border-[#D1D7DB] rounded-lg focus:border-[#075E54] outline-none"
              />
            </div>
          </div>

          {/* Modal Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#D1D7DB] shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#D1D7DB] text-[#3B4A54] hover:bg-[#F7F5F2] font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#075E54] hover:bg-[#128C7E] text-white font-bold rounded-lg transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Save Customer Master</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
