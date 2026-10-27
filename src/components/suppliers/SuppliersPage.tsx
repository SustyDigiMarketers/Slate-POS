/**
 * SLATE POS — Suppliers & Vendors Management Module
 * Production-ready procurement directory, vendor ledgers, and payables management
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6 / #ECE5DD / #FFFFFF)
 * Poppins Typography exclusively with Tabular figures
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Supplier } from '../../types';
import { offlineStore } from '../../lib/offlineStore';
import { formatINR } from '../../lib/formatters';
import {
  Building2,
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  FileText,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  CreditCard,
  Layers,
  ArrowUpRight,
  ExternalLink,
  DollarSign,
  Filter,
} from 'lucide-react';
import { ModuleActionMenu } from '../common/ModuleActionMenu';

export const SuppliersPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>(offlineStore.getSuppliers());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [storeBy, setStoreBy] = useState('DEFAULT');

  // Modals state
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null);
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentRef, setPaymentRef] = useState('');

  // Form State
  const [formName, setFormName] = useState('');
  const [formContactPerson, setFormContactPerson] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formGstin, setFormGstin] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formCity, setFormCity] = useState('Bengaluru');
  const [formState, setFormState] = useState('Karnataka');
  const [formCategory, setFormCategory] = useState('FMCG & Groceries');
  const [formOpeningBalance, setFormOpeningBalance] = useState('0');
  const [formStatus, setFormStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setSuppliers(offlineStore.getSuppliers());
    });
    return unsub;
  }, []);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const total = suppliers.length;
    const active = suppliers.filter((s) => s.status === 'ACTIVE').length;
    const totalPayables = suppliers.reduce((acc, s) => acc + s.currentPayableBalance, 0);
    const totalOrders = suppliers.reduce((acc, s) => acc + (s.purchaseOrdersCount || 0), 0);
    return { total, active, totalPayables, totalOrders };
  }, [suppliers]);

  // Categories list
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    suppliers.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return ['ALL', ...Array.from(set)];
  }, [suppliers]);

  // Filtered Suppliers
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (categoryFilter !== 'ALL' && s.category !== categoryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = s.name.toLowerCase().includes(q);
        const matchesContact = s.contactPerson.toLowerCase().includes(q);
        const matchesPhone = s.phone.includes(q);
        const matchesEmail = s.email.toLowerCase().includes(q);
        const matchesGstin = s.gstin ? s.gstin.toLowerCase().includes(q) : false;
        if (!matchesName && !matchesContact && !matchesPhone && !matchesEmail && !matchesGstin) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      if (storeBy === 'NAME') return a.name.localeCompare(b.name);
      if (storeBy === 'PAYABLE') return b.currentPayableBalance - a.currentPayableBalance;
      if (storeBy === 'ORDERS') return b.purchaseOrdersCount - a.purchaseOrdersCount;
      return 0; // DEFAULT
    });
  }, [suppliers, statusFilter, categoryFilter, searchQuery, storeBy]);

  const handleOpenAddModal = () => {
    setEditingSupplier(null);
    setFormName('');
    setFormContactPerson('');
    setFormPhone('');
    setFormEmail('');
    setFormGstin('');
    setFormAddress('');
    setFormCity('Bengaluru');
    setFormState('Karnataka');
    setFormCategory('FMCG & Groceries');
    setFormOpeningBalance('0');
    setFormStatus('ACTIVE');
    setFormError(null);
    setIsAddEditModalOpen(true);
  };

  const handleOpenEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormName(supplier.name);
    setFormContactPerson(supplier.contactPerson);
    setFormPhone(supplier.phone);
    setFormEmail(supplier.email);
    setFormGstin(supplier.gstin || '');
    setFormAddress(supplier.address || '');
    setFormCity(supplier.city || 'Bengaluru');
    setFormState(supplier.state || 'Karnataka');
    setFormCategory(supplier.category || 'FMCG & Groceries');
    setFormOpeningBalance(String(supplier.openingBalance));
    setFormStatus(supplier.status);
    setFormError(null);
    setIsAddEditModalOpen(true);
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim()) {
      setFormError('Please enter the supplier / company name.');
      return;
    }
    if (!formContactPerson.trim()) {
      setFormError('Please enter the contact person name.');
      return;
    }
    if (!formPhone.trim()) {
      setFormError('Please enter a phone number.');
      return;
    }

    const openingBal = parseFloat(formOpeningBalance) || 0;

    const supplierPayload: Supplier = {
      id: editingSupplier ? editingSupplier.id : `sup_${Date.now()}`,
      name: formName.trim(),
      contactPerson: formContactPerson.trim(),
      phone: formPhone.trim(),
      email: formEmail.trim() || `vendor@${formName.toLowerCase().replace(/[^a-z0-9]/g, '')}.in`,
      gstin: formGstin.trim() ? formGstin.trim().toUpperCase() : undefined,
      address: formAddress.trim() || undefined,
      city: formCity.trim() || 'Bengaluru',
      state: formState.trim() || 'Karnataka',
      openingBalance: openingBal,
      currentPayableBalance: editingSupplier ? editingSupplier.currentPayableBalance : openingBal,
      status: formStatus,
      category: formCategory,
      purchaseOrdersCount: editingSupplier ? editingSupplier.purchaseOrdersCount : 0,
      createdAt: editingSupplier ? editingSupplier.createdAt : new Date().toISOString(),
    };

    offlineStore.saveSupplier(supplierPayload);
    setIsAddEditModalOpen(false);
  };

  const handleDeleteSupplier = (id: string, name: string) => {
    if (confirm(`Are you sure you want to remove supplier "${name}"?`)) {
      offlineStore.deleteSupplier(id);
      if (viewingSupplier?.id === id) {
        setViewingSupplier(null);
      }
    }
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingSupplier) return;
    const amountNum = parseFloat(paymentAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Please enter a positive payment amount');
      return;
    }

    const newPayable = Math.max(0, viewingSupplier.currentPayableBalance - amountNum);
    const updated: Supplier = {
      ...viewingSupplier,
      currentPayableBalance: newPayable,
    };
    offlineStore.saveSupplier(updated);
    setViewingSupplier(updated);
    setIsRecordPaymentOpen(false);
    setPaymentAmount('');
    setPaymentRef('');
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-xl border border-[#D1D7DB] shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#DCF8C6] flex items-center justify-center text-[#075E54]">
              <Building2 className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#111B21]">Suppliers</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenAddModal}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-br from-[#075E54] to-[#128C7E] text-white text-xs font-bold shadow-xs hover:opacity-95 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New</span>
          </button>

          <ModuleActionMenu
            moduleKey="SUPPLIERS"
            filterQuery={searchQuery}
            currentStoreBy={storeBy}
            onSelectStoreBy={(opt) => setStoreBy(opt)}
            storeByOptions={[
              { id: 'DEFAULT', label: 'Default Order', desc: 'Standard supplier directory order' },
              { id: 'NAME', label: 'Supplier Name (A–Z)', desc: 'Alphabetical sorting by company name' },
              { id: 'PAYABLE', label: 'Highest Payable Balance', desc: 'Ranked by outstanding vendor dues' },
              { id: 'ORDERS', label: 'Most Purchase Orders', desc: 'Ranked by total historical orders' },
            ]}
            onRefresh={() => {
              setSuppliers(offlineStore.getSuppliers());
            }}
          />
        </div>
      </div>

      {/* 2. KPI Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-[#D1D7DB] shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[#667781]">
            <span>Total Suppliers</span>
            <Building2 className="w-4 h-4 text-[#075E54]" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-[#111B21] mt-1 tabular-nums">
            {metrics.total}
          </div>
          <div className="text-[11px] text-[#667781] mt-0.5">
            Registered wholesale vendors
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-[#D1D7DB] shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[#667781]">
            <span>Active Vendors</span>
            <CheckCircle2 className="w-4 h-4 text-[#128C7E]" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-[#075E54] mt-1 tabular-nums">
            {metrics.active}
          </div>
          <div className="text-[11px] text-[#667781] mt-0.5">
            Eligible for purchase orders
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-[#D1D7DB] shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[#667781]">
            <span>Total Outstanding Payables</span>
            <CreditCard className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-[#92400E] mt-1 tabular-nums">
            {formatINR(metrics.totalPayables)}
          </div>
          <div className="text-[11px] text-[#667781] mt-0.5">
            Accrued vendor dues
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-[#D1D7DB] shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[#667781]">
            <span>Purchase Orders</span>
            <Layers className="w-4 h-4 text-[#075E54]" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-[#111B21] mt-1 tabular-nums">
            {metrics.totalOrders}
          </div>
          <div className="text-[11px] text-[#667781] mt-0.5">
            Fulfilled &amp; in-transit orders
          </div>
        </div>
      </div>

      {/* 3. Search and Filters Toolbar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-[#D1D7DB] shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#8696A0] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by supplier name, contact, phone, GSTIN..."
              className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-[#D1D7DB] focus:outline-none focus:ring-1 focus:ring-[#075E54] focus:border-[#075E54] bg-[#F7F5F2]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8696A0] hover:text-[#111B21]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Status Filter */}
            <div className="flex items-center gap-1.5 text-xs text-[#667781]">
              <span className="font-semibold">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="text-xs bg-[#F7F5F2] border border-[#D1D7DB] rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#075E54] font-medium text-[#111B21]"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-1.5 text-xs text-[#667781]">
              <span className="font-semibold">Category:</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="text-xs bg-[#F7F5F2] border border-[#D1D7DB] rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#075E54] font-medium text-[#111B21]"
              >
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'ALL' ? 'All Categories' : cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Suppliers Table */}
      <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F7F5F2] border-b border-[#D1D7DB] text-[#667781] uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Supplier / Firm</th>
                <th className="py-3 px-3 hidden lg:table-cell">Contact Person</th>
                <th className="py-3 px-3 hidden lg:table-cell">Phone &amp; Email</th>
                <th className="py-3 px-3 hidden lg:table-cell">GSTIN / Tax ID</th>
                <th className="py-3 px-3">Location</th>
                <th className="py-3 px-3 text-right">Outstanding Payable</th>
                <th className="py-3 px-3 text-center hidden lg:table-cell">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9EDEF]">
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#667781]">
                    <Building2 className="w-10 h-10 mx-auto text-[#D1D7DB] mb-2" />
                    <p className="font-semibold text-sm text-[#111B21]">No suppliers found</p>
                    <p className="text-xs mt-0.5">Try adjusting your search criteria or register a new vendor.</p>
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((sup) => (
                  <tr key={sup.id} className="hover:bg-[#F7F5F2] transition-colors group">
                    <td className="py-3 px-4">
                      <button
                        onClick={() => setViewingSupplier(sup)}
                        className="font-bold text-[#075E54] hover:underline text-left block"
                      >
                        {sup.name}
                      </button>
                      {sup.category && (
                        <span className="text-[10px] text-[#667781] mt-0.5 block">
                          {sup.category}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-medium text-[#111B21] hidden lg:table-cell">
                      {sup.contactPerson}
                    </td>
                    <td className="py-3 px-3 text-[#3B4A54] hidden lg:table-cell">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-[#8696A0] shrink-0" />
                        <span className="tabular-nums">{sup.phone}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-[#667781] mt-0.5">
                        <Mail className="w-3 h-3 text-[#8696A0] shrink-0" />
                        <span className="truncate max-w-[150px]">{sup.email}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 hidden lg:table-cell">
                      {sup.gstin ? (
                        <span className="font-mono text-[11px] bg-[#ECE5DD]/50 text-[#111B21] px-1.5 py-0.5 rounded border border-[#D1D7DB]">
                          {sup.gstin}
                        </span>
                      ) : (
                        <span className="text-[#8696A0] italic text-[11px]">Unregistered</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-[#667781]">
                      {sup.city}, {sup.state}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div
                        className={`font-bold tabular-nums ${
                          sup.currentPayableBalance > 0 ? 'text-[#92400E]' : 'text-[#075E54]'
                        }`}
                      >
                        {formatINR(sup.currentPayableBalance)}
                      </div>
                      <div className="text-[10px] text-[#8696A0] tabular-nums">
                        Opening: {formatINR(sup.openingBalance)}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center hidden lg:table-cell">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          sup.status === 'ACTIVE'
                            ? 'bg-[#DCF8C6] text-[#075E54] border border-[#B3EBA0]'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {sup.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setViewingSupplier(sup)}
                          title="View Supplier Details"
                          className="p-1.5 text-[#3B4A54] hover:text-[#075E54] hover:bg-white rounded transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(sup)}
                          title="Edit Supplier"
                          className="p-1.5 text-[#3B4A54] hover:text-[#075E54] hover:bg-white rounded transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSupplier(sup.id, sup.name)}
                          title="Delete Supplier"
                          className="p-1.5 text-[#3B4A54] hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Create / Edit Supplier Modal */}
      {isAddEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-[#F7F5F2] border-b border-[#D1D7DB] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#075E54]" />
                <h3 className="text-sm font-bold text-[#111B21]">
                  {editingSupplier ? 'Edit Supplier' : 'Register New Supplier'}
                </h3>
              </div>
              <button
                onClick={() => setIsAddEditModalOpen(false)}
                className="p-1 rounded text-[#667781] hover:text-[#111B21]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-4 space-y-3.5 overflow-y-auto flex-1">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#111B21] mb-1">
                  Supplier / Company Trade Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Metro Cash &amp; Carry Wholesale"
                  className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#111B21] mb-1">
                    Contact Person <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formContactPerson}
                    onChange={(e) => setFormContactPerson(e.target.value)}
                    placeholder="e.g. Suresh Narang"
                    className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#111B21] mb-1">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+91 98450 11223"
                    className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#111B21] mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="orders@supplier.in"
                    className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#111B21] mb-1">
                    GSTIN / Tax ID
                  </label>
                  <input
                    type="text"
                    value={formGstin}
                    onChange={(e) => setFormGstin(e.target.value)}
                    placeholder="29AABCM1928K1ZU"
                    className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none uppercase font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111B21] mb-1">
                  Registered Address
                </label>
                <textarea
                  rows={2}
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Street, Industrial Estate, Landmark..."
                  className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#111B21] mb-1">City</label>
                  <input
                    type="text"
                    value={formCity}
                    onChange={(e) => setFormCity(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#111B21] mb-1">State</label>
                  <input
                    type="text"
                    value={formState}
                    onChange={(e) => setFormState(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#111B21] mb-1">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none bg-white"
                  >
                    <option value="FMCG &amp; Groceries">FMCG &amp; Groceries</option>
                    <option value="Beverages &amp; Foods">Beverages &amp; Foods</option>
                    <option value="Staples &amp; Oils">Staples &amp; Oils</option>
                    <option value="Hardware &amp; Thermal Rolls">Hardware &amp; Thermal Rolls</option>
                    <option value="Packaging Materials">Packaging Materials</option>
                    <option value="General Merchandising">General Merchandising</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#111B21] mb-1">
                    Opening Balance (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formOpeningBalance}
                    onChange={(e) => setFormOpeningBalance(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#111B21] mb-1">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none bg-white font-medium"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-[#E9EDEF] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#3B4A54] hover:bg-[#F7F5F2] rounded-lg border border-[#D1D7DB] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-[#075E54] hover:bg-[#128C7E] rounded-lg transition-colors shadow-xs cursor-pointer"
                >
                  {editingSupplier ? 'Save Changes' : 'Register Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Supplier Details Modal / Drawer */}
      {viewingSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-[#F7F5F2] border-b border-[#D1D7DB] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#DCF8C6] flex items-center justify-center text-[#075E54]">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#111B21] leading-tight">
                    {viewingSupplier.name}
                  </h3>
                  <div className="text-[11px] text-[#667781] flex items-center gap-2 mt-0.5">
                    <span>{viewingSupplier.category}</span>
                    <span>·</span>
                    <span
                      className={`font-bold ${
                        viewingSupplier.status === 'ACTIVE' ? 'text-[#075E54]' : 'text-slate-500'
                      }`}
                    >
                      {viewingSupplier.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenEditModal(viewingSupplier)}
                  className="px-3 py-1.5 rounded-lg border border-[#D1D7DB] bg-white text-xs font-semibold text-[#3B4A54] hover:text-[#075E54] flex items-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => setViewingSupplier(null)}
                  className="p-1 rounded text-[#667781] hover:text-[#111B21]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
              {/* Financial Balance Summary Card */}
              <div className="bg-[#F7F5F2] p-4 rounded-xl border border-[#D1D7DB] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[#667781] font-medium text-[11px]">Current Outstanding Payable</span>
                  <div className="text-2xl font-bold text-[#92400E] tabular-nums mt-0.5">
                    {formatINR(viewingSupplier.currentPayableBalance)}
                  </div>
                  <div className="text-[10px] text-[#8696A0] tabular-nums mt-0.5">
                    Opening Balance: {formatINR(viewingSupplier.openingBalance)}
                  </div>
                </div>

                <button
                  onClick={() => setIsRecordPaymentOpen(true)}
                  className="px-3.5 py-2 rounded-lg bg-[#075E54] hover:bg-[#128C7E] text-white font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Record Vendor Payment</span>
                </button>
              </div>

              {/* Vendor Information Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3.5 rounded-lg border border-[#E9EDEF] bg-white space-y-2">
                  <span className="text-[10px] font-bold text-[#8696A0] uppercase tracking-wider block">
                    Contact Details
                  </span>
                  <div>
                    <span className="text-[#667781] block text-[11px]">Contact Person</span>
                    <span className="font-semibold text-[#111B21]">{viewingSupplier.contactPerson}</span>
                  </div>
                  <div>
                    <span className="text-[#667781] block text-[11px]">Phone</span>
                    <span className="font-semibold text-[#111B21] tabular-nums">{viewingSupplier.phone}</span>
                  </div>
                  <div>
                    <span className="text-[#667781] block text-[11px]">Email</span>
                    <span className="font-semibold text-[#111B21]">{viewingSupplier.email}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg border border-[#E9EDEF] bg-white space-y-2">
                  <span className="text-[10px] font-bold text-[#8696A0] uppercase tracking-wider block">
                    Tax &amp; Address Details
                  </span>
                  <div>
                    <span className="text-[#667781] block text-[11px]">GSTIN</span>
                    <span className="font-mono font-semibold text-[#111B21]">
                      {viewingSupplier.gstin || 'Not Provided (Unregistered)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#667781] block text-[11px]">Registered Address</span>
                    <span className="text-[#111B21] leading-relaxed">
                      {viewingSupplier.address || '—'}, {viewingSupplier.city}, {viewingSupplier.state}
                    </span>
                  </div>
                </div>
              </div>

              {/* Purchase History Ledger */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#111B21]">Recent Purchase Orders &amp; Invoices</span>
                  <span className="text-[11px] text-[#667781] tabular-nums font-medium">
                    {viewingSupplier.purchaseOrdersCount} Orders Recorded
                  </span>
                </div>
                <div className="rounded-lg border border-[#D1D7DB] overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F7F5F2] border-b border-[#D1D7DB] text-[#667781] text-[10px] uppercase font-bold">
                      <tr>
                        <th className="py-2 px-3">PO Reference</th>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3 text-right">Invoice Total</th>
                        <th className="py-2 px-3 text-center">Payment Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9EDEF]">
                      <tr className="hover:bg-[#F7F5F2]">
                        <td className="py-2.5 px-3 font-semibold text-[#075E54]">PO-2026-0881</td>
                        <td className="py-2.5 px-3 text-[#667781]">28 Sep 2026</td>
                        <td className="py-2.5 px-3 text-right font-bold tabular-nums">₹48,200.00</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                            Unpaid
                          </span>
                        </td>
                      </tr>
                      <tr className="hover:bg-[#F7F5F2]">
                        <td className="py-2.5 px-3 font-semibold text-[#075E54]">PO-2026-0742</td>
                        <td className="py-2.5 px-3 text-[#667781]">14 Sep 2026</td>
                        <td className="py-2.5 px-3 text-right font-bold tabular-nums">₹34,200.00</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#DCF8C6] text-[#075E54]">
                            Paid
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. Record Vendor Payment Modal */}
      {isRecordPaymentOpen && viewingSupplier && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/60 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-sm overflow-hidden">
            <div className="p-3.5 bg-[#F7F5F2] border-b border-[#D1D7DB] flex items-center justify-between">
              <h4 className="text-xs font-bold text-[#111B21]">Record Payment to Vendor</h4>
              <button onClick={() => setIsRecordPaymentOpen(false)} className="text-[#667781]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleRecordPayment} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block text-xs font-semibold text-[#111B21] mb-1">
                  Payable Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder={`Max: ₹${viewingSupplier.currentPayableBalance}`}
                  className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#111B21] mb-1">
                  Payment Reference / UTR
                </label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="e.g. NEFT-HDFC-991823"
                  className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRecordPaymentOpen(false)}
                  className="px-3 py-1.5 text-xs rounded border border-[#D1D7DB] text-[#3B4A54]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#075E54] rounded shadow-xs"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
