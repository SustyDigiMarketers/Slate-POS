/**
 * SLATE POS — Coupons & Promotions Module
 * Pure Poppins Typography & SLATE POS Brand Identity (#075E54 / #128C7E / #DCF8C6 / #ECE5DD)
 * 
 * Features:
 * - Campaign overview & coupon performance metrics
 * - Real in-memory coupon CRUD with offlineStore persistence
 * - Filtering by status (Active / Inactive / Expired) and discount type (Percentage / Flat)
 * - Copy coupon code with visual feedback
 * - Interactive Create Coupon modal with full validation
 * - Transparent operational status callout distinguishing implemented features from POS integration roadmap
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Coupon, CouponDiscountType } from '../../types';
import { offlineStore } from '../../lib/offlineStore';
import {
  Ticket,
  Plus,
  Search,
  Copy,
  Check,
  Calendar,
  Percent,
  Coins,
  AlertCircle,
  Tag,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
  Info,
  Clock,
  CheckCircle2,
  SlidersHorizontal,
} from 'lucide-react';
import { ModuleActionMenu } from '../common/ModuleActionMenu';

export const CouponsPage: React.FC = () => {
  const [coupons, setCoupons] = useState<Coupon[]>(offlineStore.getCoupons());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'PERCENTAGE' | 'FIXED_AMOUNT'>('ALL');
  const [storeBy, setStoreBy] = useState('DEFAULT');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Form state for creating a coupon
  const [formCode, setFormCode] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formDiscountType, setFormDiscountType] = useState<CouponDiscountType>('PERCENTAGE');
  const [formDiscountValue, setFormDiscountValue] = useState<string>('10');
  const [formMinOrder, setFormMinOrder] = useState<string>('500');
  const [formMaxCap, setFormMaxCap] = useState<string>('200');
  const [formUsageLimit, setFormUsageLimit] = useState<string>('100');
  const [formValidFrom, setFormValidFrom] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formValidUntil, setFormValidUntil] = useState<string>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [formIsActive, setFormIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setCoupons(offlineStore.getCoupons());
    });
    return unsub;
  }, []);

  const handleCopyCode = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => {
      setCopiedCode(null);
    }, 2000);
  };

  const handleToggleStatus = (id: string) => {
    offlineStore.toggleCouponStatus(id);
  };

  const handleDeleteCoupon = (id: string) => {
    if (confirm('Are you sure you want to remove this coupon campaign?')) {
      offlineStore.deleteCoupon(id);
    }
  };

  const handleCreateCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const codeClean = formCode.trim().toUpperCase();
    if (!codeClean) {
      setFormError('Please enter a valid coupon code.');
      return;
    }

    if (coupons.some((c) => c.code.toUpperCase() === codeClean)) {
      setFormError(`Coupon code "${codeClean}" already exists. Please choose a unique code.`);
      return;
    }

    if (!formTitle.trim()) {
      setFormError('Please enter a campaign title.');
      return;
    }

    const valNum = parseFloat(formDiscountValue);
    if (isNaN(valNum) || valNum <= 0) {
      setFormError('Please enter a positive discount value.');
      return;
    }

    if (formDiscountType === 'PERCENTAGE' && valNum > 100) {
      setFormError('Percentage discount cannot exceed 100%.');
      return;
    }

    const minOrderNum = parseFloat(formMinOrder) || 0;
    const maxCapNum = formDiscountType === 'PERCENTAGE' && formMaxCap ? parseFloat(formMaxCap) : undefined;
    const usageLimitNum = parseInt(formUsageLimit, 10) || 100;

    if (!formValidFrom || !formValidUntil) {
      setFormError('Please select both start and expiry dates.');
      return;
    }

    if (formValidUntil < formValidFrom) {
      setFormError('Expiry date cannot be earlier than the start date.');
      return;
    }

    const newCoupon: Coupon = {
      id: `cpn_${Date.now()}`,
      code: codeClean,
      title: formTitle.trim(),
      description: formDesc.trim() || undefined,
      discountType: formDiscountType,
      discountValue: valNum,
      minOrderValue: minOrderNum,
      maxDiscountCap: maxCapNum,
      usageLimit: usageLimitNum,
      redemptionCount: 0,
      validFrom: formValidFrom,
      validUntil: formValidUntil,
      isActive: formIsActive,
      createdAt: new Date().toISOString(),
    };

    offlineStore.saveCoupon(newCoupon);

    // Reset form and close modal
    setFormCode('');
    setFormTitle('');
    setFormDesc('');
    setFormDiscountValue('10');
    setFormMinOrder('500');
    setFormMaxCap('200');
    setFormUsageLimit('100');
    setIsCreateModalOpen(false);
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const filteredCoupons = useMemo(() => {
    return coupons.filter((coupon) => {
      // Search
      const matchesSearch =
        coupon.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        coupon.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (coupon.description && coupon.description.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      // Status Filter
      const isExpired = coupon.validUntil < todayStr;
      if (statusFilter === 'ACTIVE') {
        if (!coupon.isActive || isExpired) return false;
      } else if (statusFilter === 'INACTIVE') {
        if (coupon.isActive || isExpired) return false;
      } else if (statusFilter === 'EXPIRED') {
        if (!isExpired) return false;
      }

      // Type Filter
      if (typeFilter !== 'ALL' && coupon.discountType !== typeFilter) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      if (storeBy === 'CODE') return a.code.localeCompare(b.code);
      if (storeBy === 'DISCOUNT') return b.discountValue - a.discountValue;
      if (storeBy === 'EXPIRY') return a.validUntil.localeCompare(b.validUntil);
      if (storeBy === 'REDEMPTIONS') return (b.redemptionCount || 0) - (a.redemptionCount || 0);
      return 0; // DEFAULT
    });
  }, [coupons, searchQuery, statusFilter, typeFilter, todayStr, storeBy]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const total = coupons.length;
    const active = coupons.filter((c) => c.isActive && c.validUntil >= todayStr).length;
    const totalRedemptions = coupons.reduce((acc, c) => acc + (c.redemptionCount || 0), 0);
    const estimatedValue = coupons.reduce((acc, c) => {
      const redemptions = c.redemptionCount || 0;
      if (c.discountType === 'FIXED_AMOUNT') {
        return acc + redemptions * c.discountValue;
      } else {
        const avgSaving = Math.min(c.maxDiscountCap || 250, (c.minOrderValue * c.discountValue) / 100);
        return acc + redemptions * avgSaving;
      }
    }, 0);

    return {
      total,
      active,
      totalRedemptions,
      estimatedValue,
    };
  }, [coupons, todayStr]);

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-xl border border-[#D1D7DB] shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#DCF8C6] flex items-center justify-center text-[#075E54]">
              <Ticket className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#111B21]">Coupons &amp; Discounts</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setFormError(null);
              setIsCreateModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-br from-[#075E54] to-[#128C7E] text-white text-xs font-bold shadow-xs hover:opacity-95 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New</span>
          </button>

          <ModuleActionMenu
            moduleKey="COUPONS"
            filterQuery={searchQuery}
            currentStoreBy={storeBy}
            onSelectStoreBy={(opt) => setStoreBy(opt)}
            storeByOptions={[
              { id: 'DEFAULT', label: 'Default Order', desc: 'Standard campaign order' },
              { id: 'CODE', label: 'Coupon Code (A–Z)', desc: 'Alphabetical sorting by code' },
              { id: 'DISCOUNT', label: 'Highest Discount Value', desc: 'Ranked by highest percentage or flat off' },
              { id: 'EXPIRY', label: 'Expiring Soonest', desc: 'Prioritize impending voucher expiry dates' },
              { id: 'REDEMPTIONS', label: 'Most Redemptions', desc: 'Popular customer campaigns' },
            ]}
            onRefresh={() => {
              setCoupons(offlineStore.getCoupons());
            }}
          />
        </div>
      </div>

      {/* Transparent Integration Callout */}
      <div className="bg-[#FFFFFF] border-l-4 border-[#128C7E] p-3.5 sm:p-4 rounded-lg border border-[#D1D7DB] flex items-start gap-3 shadow-2xs">
        <Info className="w-5 h-5 text-[#075E54] shrink-0 mt-0.5" />
        <div className="text-xs text-[#3B4A54] leading-relaxed">
          <span className="font-bold text-[#111B21]">Operational Capability Status: </span>
          Coupon configuration, promotional campaign definitions, usage quotas, and active status toggling are fully functional and persist locally. Automated promo code redemption directly inside the POS Cashier Terminal is currently in preview (cashiers can currently apply equivalent percentage or flat bill discounts directly in POS Checkout [F2]).
        </div>
      </div>

      {/* KPI Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#D1D7DB] shadow-2xs">
          <div className="text-[11px] font-semibold text-[#667781] uppercase tracking-wider">
            Total Campaigns
          </div>
          <div className="text-2xl font-bold text-[#111B21] tabular-nums mt-1">{metrics.total}</div>
          <div className="text-[11px] text-[#667781] mt-1 flex items-center gap-1">
            <span>Created vouchers</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#D1D7DB] shadow-2xs">
          <div className="text-[11px] font-semibold text-[#667781] uppercase tracking-wider">
            Active Campaigns
          </div>
          <div className="text-2xl font-bold text-[#075E54] tabular-nums mt-1">{metrics.active}</div>
          <div className="text-[11px] text-[#075E54] font-medium mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Ready for redemption</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#D1D7DB] shadow-2xs">
          <div className="text-[11px] font-semibold text-[#667781] uppercase tracking-wider">
            Total Redemptions
          </div>
          <div className="text-2xl font-bold text-[#111B21] tabular-nums mt-1">{metrics.totalRedemptions}</div>
          <div className="text-[11px] text-[#667781] mt-1">Times applied by shoppers</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#D1D7DB] shadow-2xs">
          <div className="text-[11px] font-semibold text-[#667781] uppercase tracking-wider">
            Discount Granted
          </div>
          <div className="text-2xl font-bold text-[#128C7E] tabular-nums mt-1">
            ₹{Math.round(metrics.estimatedValue).toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-[#667781] mt-1">Total customer savings</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-[#D1D7DB] shadow-2xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#8696A0] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by coupon code or title..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F7F5F2] border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#075E54] text-[#111B21]"
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

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <div className="flex items-center bg-[#F7F5F2] p-0.5 rounded-lg border border-[#D1D7DB]">
            {(['ALL', 'ACTIVE', 'INACTIVE', 'EXPIRED'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                  statusFilter === status
                    ? 'bg-white text-[#075E54] shadow-2xs font-bold'
                    : 'text-[#667781] hover:text-[#111B21]'
                }`}
              >
                {status === 'ALL'
                  ? 'All Status'
                  : status === 'ACTIVE'
                  ? 'Active'
                  : status === 'INACTIVE'
                  ? 'Inactive'
                  : 'Expired'}
              </button>
            ))}
          </div>

          {/* Type Filter */}
          <div className="flex items-center bg-[#F7F5F2] p-0.5 rounded-lg border border-[#D1D7DB]">
            {(['ALL', 'PERCENTAGE', 'FIXED_AMOUNT'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                  typeFilter === type
                    ? 'bg-white text-[#075E54] shadow-2xs font-bold'
                    : 'text-[#667781] hover:text-[#111B21]'
                }`}
              >
                {type === 'ALL' ? 'All Types' : type === 'PERCENTAGE' ? '% Percentage' : '₹ Flat'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Coupons Table / Grid */}
      <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xs overflow-hidden">
        {filteredCoupons.length === 0 ? (
          <div className="p-12 text-center">
            <Ticket className="w-10 h-10 text-[#8696A0] mx-auto mb-3 opacity-40" />
            <div className="text-sm font-bold text-[#111B21]">No coupon campaigns found</div>
            <p className="text-xs text-[#667781] mt-1">
              Try adjusting your search criteria or create a new coupon voucher.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('ALL');
                setTypeFilter('ALL');
              }}
              className="mt-4 px-3 py-1.5 text-xs text-[#075E54] font-bold hover:underline cursor-pointer"
            >
              Reset all filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F5F2] border-b border-[#D1D7DB] text-[#667781] font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Coupon Code</th>
                  <th className="py-3 px-4">Campaign Name</th>
                  <th className="py-3 px-4">Discount Benefit</th>
                  <th className="py-3 px-4">Min Order</th>
                  <th className="py-3 px-4">Usage &amp; Quota</th>
                  <th className="py-3 px-4">Validity Period</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9EDEF]">
                {filteredCoupons.map((coupon) => {
                  const isExpired = coupon.validUntil < todayStr;
                  const isExhausted = coupon.redemptionCount >= coupon.usageLimit;
                  const usagePercent = Math.min(
                    100,
                    Math.round((coupon.redemptionCount / coupon.usageLimit) * 100)
                  );

                  return (
                    <tr key={coupon.id} className="hover:bg-[#F7F5F2]/60 transition-colors">
                      {/* Code with Copy Button */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[#075E54] bg-[#DCF8C6]/50 border border-[#B3EBA0] px-2 py-0.5 rounded tracking-wide text-xs">
                            {coupon.code}
                          </span>
                          <button
                            onClick={() => handleCopyCode(coupon.code)}
                            title="Copy coupon code"
                            className="p-1 text-[#8696A0] hover:text-[#075E54] rounded transition-colors cursor-pointer"
                          >
                            {copiedCode === coupon.code ? (
                              <Check className="w-3.5 h-3.5 text-[#075E54]" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Title & Description */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-[#111B21]">{coupon.title}</div>
                        {coupon.description && (
                          <div className="text-[11px] text-[#667781] truncate mt-0.5">
                            {coupon.description}
                          </div>
                        )}
                      </td>

                      {/* Discount Benefit */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 font-bold text-[#111B21]">
                          {coupon.discountType === 'PERCENTAGE' ? (
                            <>
                              <Percent className="w-3.5 h-3.5 text-[#128C7E]" />
                              <span>{coupon.discountValue}% OFF</span>
                            </>
                          ) : (
                            <>
                              <Coins className="w-3.5 h-3.5 text-[#075E54]" />
                              <span>₹{coupon.discountValue.toLocaleString('en-IN')} OFF</span>
                            </>
                          )}
                        </div>
                        {coupon.discountType === 'PERCENTAGE' && coupon.maxDiscountCap && (
                          <div className="text-[10px] text-[#667781] mt-0.5">
                            Max savings: ₹{coupon.maxDiscountCap.toLocaleString('en-IN')}
                          </div>
                        )}
                      </td>

                      {/* Min Order */}
                      <td className="py-3 px-4 tabular-nums">
                        {coupon.minOrderValue > 0 ? (
                          <span className="font-medium text-[#111B21]">
                            ₹{coupon.minOrderValue.toLocaleString('en-IN')}
                          </span>
                        ) : (
                          <span className="text-[#8696A0]">No Minimum</span>
                        )}
                      </td>

                      {/* Usage */}
                      <td className="py-3 px-4 min-w-[130px]">
                        <div className="flex items-center justify-between text-[11px] tabular-nums mb-1">
                          <span className="font-semibold text-[#111B21]">{coupon.redemptionCount}</span>
                          <span className="text-[#8696A0]">/ {coupon.usageLimit} uses</span>
                        </div>
                        <div className="w-full bg-[#E9EDEF] rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              usagePercent >= 90
                                ? 'bg-amber-500'
                                : 'bg-[#075E54]'
                            }`}
                            style={{ width: `${usagePercent}%` }}
                          />
                        </div>
                      </td>

                      {/* Validity */}
                      <td className="py-3 px-4 text-[11px] tabular-nums">
                        <div className="text-[#111B21] font-medium">{coupon.validUntil}</div>
                        <div className="text-[10px] text-[#8696A0]">Since {coupon.validFrom}</div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        {isExpired ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#F7F5F2] text-[#8696A0] border border-[#D1D7DB]">
                            Expired
                          </span>
                        ) : isExhausted ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Exhausted
                          </span>
                        ) : coupon.isActive ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#DCF8C6] text-[#075E54] border border-[#B3EBA0]">
                            Active
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            Paused
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleToggleStatus(coupon.id)}
                            title={coupon.isActive ? 'Pause coupon' : 'Activate coupon'}
                            className="p-1 text-[#667781] hover:text-[#075E54] rounded transition-colors cursor-pointer"
                          >
                            {coupon.isActive ? (
                              <ToggleRight className="w-5 h-5 text-[#075E54]" />
                            ) : (
                              <ToggleLeft className="w-5 h-5 text-[#8696A0]" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteCoupon(coupon.id)}
                            title="Delete coupon"
                            className="p-1 text-[#8696A0] hover:text-red-600 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE COUPON MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111B21]/60 backdrop-blur-2xs">
          <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="h-14 px-5 bg-[#075E54] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ticket className="w-4 h-4 text-[#DCF8C6]" />
                <h2 className="font-bold text-sm">Create New Coupon Campaign</h2>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateCoupon} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Code & Title */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#3B4A54] uppercase tracking-wider mb-1">
                    Coupon Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                    placeholder="e.g. DIWALI25"
                    className="w-full px-3 py-1.5 text-xs bg-[#F7F5F2] border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#075E54] font-bold tracking-wide uppercase"
                  />
                  <span className="text-[10px] text-[#8696A0] mt-0.5 block">Alphanumeric, uppercase</span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#3B4A54] uppercase tracking-wider mb-1">
                    Campaign Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Festive Mega Offer"
                    className="w-full px-3 py-1.5 text-xs bg-[#F7F5F2] border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#075E54]"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] font-bold text-[#3B4A54] uppercase tracking-wider mb-1">
                  Description / Terms (Optional)
                </label>
                <textarea
                  rows={2}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Details on coupon eligibility, customer category or exclusions..."
                  className="w-full px-3 py-1.5 text-xs bg-[#F7F5F2] border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#075E54]"
                />
              </div>

              {/* Discount Type & Value */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#3B4A54] uppercase tracking-wider mb-1">
                    Discount Type *
                  </label>
                  <select
                    value={formDiscountType}
                    onChange={(e) => setFormDiscountType(e.target.value as CouponDiscountType)}
                    className="w-full px-3 py-1.5 text-xs bg-[#F7F5F2] border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#075E54]"
                  >
                    <option value="PERCENTAGE">Percentage (% OFF)</option>
                    <option value="FIXED_AMOUNT">Flat Amount (₹ OFF)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#3B4A54] uppercase tracking-wider mb-1">
                    {formDiscountType === 'PERCENTAGE' ? 'Percentage Value (%) *' : 'Discount Amount (₹) *'}
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max={formDiscountType === 'PERCENTAGE' ? '100' : '50000'}
                    value={formDiscountValue}
                    onChange={(e) => setFormDiscountValue(e.target.value)}
                    placeholder={formDiscountType === 'PERCENTAGE' ? '15' : '100'}
                    className="w-full px-3 py-1.5 text-xs bg-[#F7F5F2] border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#075E54] tabular-nums font-semibold"
                  />
                </div>
              </div>

              {/* Min Order & Max Cap */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#3B4A54] uppercase tracking-wider mb-1">
                    Min Order Value (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formMinOrder}
                    onChange={(e) => setFormMinOrder(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-1.5 text-xs bg-[#F7F5F2] border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#075E54] tabular-nums"
                  />
                </div>

                {formDiscountType === 'PERCENTAGE' ? (
                  <div>
                    <label className="block text-[11px] font-bold text-[#3B4A54] uppercase tracking-wider mb-1">
                      Max Discount Cap (₹)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formMaxCap}
                      onChange={(e) => setFormMaxCap(e.target.value)}
                      placeholder="e.g. 250"
                      className="w-full px-3 py-1.5 text-xs bg-[#F7F5F2] border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#075E54] tabular-nums"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-bold text-[#3B4A54] uppercase tracking-wider mb-1">
                      Usage Limit (Total)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formUsageLimit}
                      onChange={(e) => setFormUsageLimit(e.target.value)}
                      placeholder="100"
                      className="w-full px-3 py-1.5 text-xs bg-[#F7F5F2] border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#075E54] tabular-nums"
                    />
                  </div>
                )}
              </div>

              {/* Validity Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#3B4A54] uppercase tracking-wider mb-1">
                    Valid From *
                  </label>
                  <input
                    type="date"
                    required
                    value={formValidFrom}
                    onChange={(e) => setFormValidFrom(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-[#F7F5F2] border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#075E54]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#3B4A54] uppercase tracking-wider mb-1">
                    Valid Until (Expiry) *
                  </label>
                  <input
                    type="date"
                    required
                    value={formValidUntil}
                    onChange={(e) => setFormValidUntil(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-[#F7F5F2] border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#075E54]"
                  />
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="coupon_is_active"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded text-[#075E54] focus:ring-[#075E54] w-4 h-4 cursor-pointer"
                />
                <label htmlFor="coupon_is_active" className="text-xs font-semibold text-[#111B21] cursor-pointer">
                  Activate this campaign immediately upon creation
                </label>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-[#E9EDEF] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#667781] hover:text-[#111B21] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-gradient-to-br from-[#075E54] to-[#128C7E] text-white rounded-lg shadow-xs hover:opacity-95 transition-all cursor-pointer"
                >
                  Save &amp; Publish Coupon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
