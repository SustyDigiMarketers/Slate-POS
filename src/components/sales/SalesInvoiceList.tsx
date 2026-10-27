/**
 * SLATE POS — Sales & Tax Invoices Ledger with Persistent Detail-Preview
 * Redesigned to match the unified module toolbar, clean 7-column table, and master-detail workspace
 * Poppins typography exclusively & SLATE POS theme (#075E54 / #128C7E / #DCF8C6 / #ECE5DD / #D1D7DB)
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Sale } from '../../types';
import { offlineStore } from '../../lib/offlineStore';
import { formatINR, formatDate } from '../../lib/formatters';
import { THEME } from '../../lib/theme';
import { ThermalReceiptModal } from '../pos/ThermalReceiptModal';
import { QuotationDocumentPdf } from '../quotes/QuotationDocumentPdf';
import {
  Receipt,
  Search,
  Printer,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  FileSpreadsheet,
  Truck,
  Wallet,
  FileText,
  ChevronDown,
  MoreVertical,
  Download,
  Mail,
  Share2,
  ArrowLeft,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  ArrowUpDown,
  Check,
  CreditCard,
  User,
  Building,
  Tag,
} from 'lucide-react';
import { ModuleActionMenu } from '../common/ModuleActionMenu';

interface SalesInvoiceListProps {
  initialAgingBucket?: 'CURRENT' | '1_15' | '16_30' | '31_45' | 'ABOVE_45' | null;
  mode?: 'INVOICES' | 'QUOTES' | 'CHALLANS' | 'PAYMENTS';
  onClearAgingFilter?: () => void;
  onOpenPos?: () => void;
}

const INVOICE_STATUS_OPTIONS = [
  { id: 'ALL', label: 'All Invoices' },
  { id: 'PAID', label: 'Paid' },
  { id: 'PARTIALLY_PAID', label: 'Partially Paid' },
  { id: 'OVERDUE', label: 'Overdue' },
  { id: 'REFUNDED', label: 'Refunded' },
];

export const SalesInvoiceList: React.FC<SalesInvoiceListProps> = ({
  initialAgingBucket,
  mode = 'INVOICES',
  onClearAgingFilter,
  onOpenPos,
}) => {
  const [sales, setSales] = useState<Sale[]>(offlineStore.getSales());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE' | 'REFUNDED'>('ALL');
  const [agingFilter, setAgingFilter] = useState<string | null>(initialAgingBucket || null);

  // Sorting
  const [sortField, setSortField] = useState<'date' | 'invoiceNumber' | 'customerName' | 'grandTotal'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Master-Detail Split Workspace state
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [detailMode, setDetailMode] = useState<'DETAILS' | 'PDF'>('DETAILS');

  // Menus & Modals
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [activeRowMenuId, setActiveRowMenuId] = useState<string | null>(null);

  // Modals
  const [viewingSaleForReceipt, setViewingSaleForReceipt] = useState<Sale | null>(null);
  const [refundingSale, setRefundingSale] = useState<Sale | null>(null);
  const [refundReason, setRefundReason] = useState('Customer returned damaged packaging');
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'UPI'>('CASH');
  const [restockInventory, setRestockInventory] = useState(true);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setSales(offlineStore.getSales());
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (initialAgingBucket) {
      setAgingFilter(initialAgingBucket);
    }
  }, [initialAgingBucket]);

  // Click outside listener for row action menu
  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveRowMenuId(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const nowTime = new Date('2026-10-10T00:00:00Z').getTime();

  const title =
    mode === 'QUOTES'
      ? 'Sales Quotes & Estimates'
      : mode === 'CHALLANS'
      ? 'Delivery Challans & Dispatch Notes'
      : mode === 'PAYMENTS'
      ? 'Customer Payments & Receipts Ledger'
      : 'Sales & Tax Invoices';

  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      if (statusFilter !== 'ALL' && s.paymentStatus !== statusFilter) return false;

      // Filter by Aging Bucket if set
      if (agingFilter) {
        const paid = s.payments.reduce((sum, p) => sum + p.amount, 0);
        const balance = s.grandTotal - paid;
        if (balance <= 0) return false;

        const dueDate = new Date(s.dueDate).getTime();
        const diffDays = Math.floor((nowTime - dueDate) / (1000 * 60 * 60 * 24));

        if (agingFilter === 'CURRENT' && diffDays > 0) return false;
        if (agingFilter === '1_15' && (diffDays <= 0 || diffDays > 15)) return false;
        if (agingFilter === '16_30' && (diffDays <= 15 || diffDays > 30)) return false;
        if (agingFilter === '31_45' && (diffDays <= 30 || diffDays > 45)) return false;
        if (agingFilter === 'ABOVE_45' && diffDays <= 45) return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        return (
          s.receiptNumber.toLowerCase().includes(q) ||
          s.invoiceNumber.toLowerCase().includes(q) ||
          (s.customerName && s.customerName.toLowerCase().includes(q)) ||
          (s.companyName && s.companyName.toLowerCase().includes(q)) ||
          s.cashierName.toLowerCase().includes(q)
        );
      }

      return true;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortField === 'invoiceNumber') {
        comparison = a.invoiceNumber.localeCompare(b.invoiceNumber);
      } else if (sortField === 'customerName') {
        comparison = (a.customerName || '').localeCompare(b.customerName || '');
      } else if (sortField === 'grandTotal') {
        comparison = a.grandTotal - b.grandTotal;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [sales, statusFilter, agingFilter, searchTerm, sortField, sortOrder]);

  const activeSale = useMemo(() => {
    if (!selectedSaleId) return null;
    return filteredSales.find((s) => s.id === selectedSaleId) || sales.find((s) => s.id === selectedSaleId) || null;
  }, [sales, filteredSales, selectedSaleId]);

  const isSplitActive = isPreviewOpen && activeSale !== null;

  const handleSort = (field: 'date' | 'invoiceNumber' | 'customerName' | 'grandTotal') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleIssueRefundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundingSale) return;

    const result = offlineStore.issueRefund({
      saleId: refundingSale.id,
      items: refundingSale.items.map((i) => ({
        productId: i.product.id,
        quantity: i.quantity,
        refundAmount: i.total,
      })),
      reason: refundReason,
      restock: restockInventory,
      refundMethod,
    });

    if (result.success) {
      showToast(`Refund of ₹${refundingSale.grandTotal.toFixed(2)} recorded successfully.`);
      setRefundingSale(null);
    } else {
      alert(result.error || 'Failed to issue refund');
    }
  };

  const handleRowDownloadPdf = (sale: Sale) => {
    setSelectedSaleId(sale.id);
    setDetailMode('PDF');
    setIsPreviewOpen(true);
    showToast(`Opening printable PDF for ${sale.invoiceNumber}...`);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  const handleRowPrint = (sale: Sale) => {
    setViewingSaleForReceipt(sale);
  };

  const handleRowSend = (sale: Sale) => {
    const targetEmail = sale.customerEmail || 'customer@client.in';
    showToast(`Tax invoice ${sale.invoiceNumber} dispatched to ${targetEmail}.`);
  };

  const handleRowShare = (sale: Sale) => {
    const summary = `Tax Invoice ${sale.invoiceNumber} | Customer: ${sale.customerName || 'Walk-in'} | Total: ${formatINR(sale.grandTotal)} | Payment: ${sale.paymentStatus}`;
    if (navigator.share) {
      navigator.share({
        title: `Invoice ${sale.invoiceNumber}`,
        text: summary,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(summary);
      showToast(`Invoice ${sale.invoiceNumber} details copied to clipboard!`);
    }
  };

  const handleExportCsv = () => {
    setIsActionMenuOpen(false);
    const headers = ['Invoice Number', 'Receipt Number', 'Date', 'Customer', 'Company', 'Payment Status', 'Taxable', 'GST', 'Grand Total'];
    const rows = filteredSales.map((s) => [
      s.invoiceNumber,
      s.receiptNumber,
      s.createdAt.split('T')[0],
      `"${(s.customerName || 'Walk-in').replace(/"/g, '""')}"`,
      `"${(s.companyName || '').replace(/"/g, '""')}"`,
      s.paymentStatus,
      s.taxableTotal.toFixed(2),
      (s.cgstTotal + s.sgstTotal).toFixed(2),
      s.grandTotal.toFixed(2),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `SLATE_Invoices_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${filteredSales.length} invoices to CSV.`);
  };

  const currentStatusLabel =
    mode === 'CHALLANS'
      ? 'All Challans'
      : mode === 'PAYMENTS'
      ? 'All Payments'
      : INVOICE_STATUS_OPTIONS.find((o) => o.id === statusFilter)?.label || 'All Invoices';

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto min-h-[calc(100vh-120px)] flex flex-col font-sans">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-[#075E54] text-white px-4 py-2.5 rounded-lg shadow-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-[#DCF8C6]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. UNIFIED MODULE TOOLBAR (Standardized across Modules) */}
      {/* ========================================================================= */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-[#D1D7DB] shadow-2xs flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Status Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#D1D7DB] hover:bg-[#F7F5F2] text-xs font-bold text-[#111B21] transition-colors cursor-pointer"
            >
              <span>{currentStatusLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#667781]" />
            </button>

            {isStatusDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-56 bg-white border border-[#D1D7DB] rounded-lg shadow-xl py-1.5 z-50 animate-in fade-in duration-100">
                <div className="px-3 py-1 text-[10px] font-bold text-[#8696A0] uppercase tracking-wider">
                  Filter by Payment
                </div>
                {INVOICE_STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setStatusFilter(opt.id as any);
                      setIsStatusDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-1.5 text-xs flex items-center justify-between hover:bg-[#F7F5F2] cursor-pointer ${
                      statusFilter === opt.id ? 'bg-[#DCF8C6]/50 text-[#075E54] font-bold' : 'text-[#111B21]'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {statusFilter === opt.id && <Check className="w-3.5 h-3.5 text-[#075E54]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Record Count Badge */}
          <span className="text-xs text-[#667781] tabular-nums font-medium">
            {filteredSales.length}{' '}
            {mode === 'CHALLANS'
              ? filteredSales.length === 1
                ? 'Delivery Challan'
                : 'Delivery Challans'
              : mode === 'PAYMENTS'
              ? filteredSales.length === 1
                ? 'Payment Record'
                : 'Payments Received'
              : filteredSales.length === 1
              ? 'Invoice'
              : 'Invoices'}
          </span>

          {/* Aging Filter Tag if Active */}
          {agingFilter && (
            <div className="flex items-center gap-1.5 bg-[#FEF3C7] border border-[#FDE68A] px-2.5 py-1 rounded-md text-xs text-[#92400E] font-medium">
              <span>Aging: <strong>{agingFilter.replace('_', '–')} Days Overdue</strong></span>
              <button
                onClick={() => {
                  setAgingFilter(null);
                  onClearAgingFilter?.();
                }}
                className="p-0.5 hover:bg-[#FDE68A] rounded cursor-pointer"
                title="Clear aging filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right Tools Group: Search, + New, Action Menu */}
        <div className="flex items-center gap-2">
          {/* Search Control */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#8696A0] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search invoice #, customer..."
              className="w-44 sm:w-60 pl-8 pr-7 py-1.5 text-xs rounded-lg border border-[#D1D7DB] focus:outline-none focus:ring-1 focus:ring-[#075E54] bg-[#F7F5F2]"
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

          {/* Creation Action (+ New) */}
          <button
            onClick={() => onOpenPos?.()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-[#075E54] to-[#128C7E] text-white text-xs font-bold shadow-xs hover:opacity-95 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-white" />
            <span>New</span>
          </button>

          {/* Three-Dot Menu: Standard 6-Action Menu for Challans & Payments; Dedicated Menu for Invoices */}
          {mode === 'CHALLANS' ? (
            <ModuleActionMenu
              moduleKey="CHALLANS"
              filterQuery={searchTerm}
              onRefresh={() => {
                setSales(offlineStore.getSales());
              }}
            />
          ) : mode === 'PAYMENTS' ? (
            <ModuleActionMenu
              moduleKey="PAYMENTS"
              filterQuery={searchTerm}
              onRefresh={() => {
                setSales(offlineStore.getSales());
              }}
            />
          ) : (
            <div className="relative">
              <button
                onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
                className="p-2 text-[#3B4A54] hover:text-[#075E54] hover:bg-[#F7F5F2] rounded-lg transition-colors cursor-pointer border border-[#D1D7DB]"
                title="More Actions"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {isActionMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-48 bg-white border border-[#D1D7DB] rounded-lg shadow-xl py-1.5 z-50 text-xs font-medium animate-in fade-in duration-100">
                  <button
                    onClick={handleExportCsv}
                    className="w-full text-left px-3.5 py-1.5 hover:bg-[#F7F5F2] flex items-center gap-2 cursor-pointer text-[#111B21]"
                  >
                    <Download className="w-3.5 h-3.5 text-[#075E54]" />
                    <span>Export Invoices (CSV)</span>
                  </button>
                  <button
                    onClick={() => {
                      setSales(offlineStore.getSales());
                      setIsActionMenuOpen(false);
                      showToast('Invoices list reloaded from storage.');
                    }}
                    className="w-full text-left px-3.5 py-1.5 hover:bg-[#F7F5F2] flex items-center gap-2 cursor-pointer text-[#111B21]"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#075E54]" />
                    <span>Refresh List</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsActionMenuOpen(false);
                      setSortField('date');
                      setSortOrder('desc');
                      showToast('Ledger sorting reset to latest date.');
                    }}
                    className="w-full text-left px-3.5 py-1.5 hover:bg-[#F7F5F2] flex items-center gap-2 cursor-pointer text-[#111B21]"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 text-[#075E54]" />
                    <span>Reset Sorting</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MASTER-DETAIL WORKSPACE WITH PERSISTENT PREVIEW PANE */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-[750px]">
        {/* LEFT PANE / FULL TABLE: INVOICES LEDGER TABLE */}
        <div
          className={`${
            isSplitActive
              ? 'w-full lg:w-[40%] xl:w-[38%] lg:shrink-0 min-w-0 max-h-[850px]'
              : 'w-full min-w-0'
          } bg-white rounded-xl border border-[#D1D7DB] shadow-2xs overflow-hidden flex flex-col transition-all`}
        >
          {/* Header */}
          <div className="p-3 border-b border-[#D1D7DB] bg-[#F7F5F2] flex items-center justify-between text-xs font-bold text-[#111B21] shrink-0">
            <div className="flex items-center gap-2">
              <span>{currentStatusLabel}</span>
              <span className="tabular-nums text-[#667781] text-[11px] font-normal">
                ({filteredSales.length} {filteredSales.length === 1 ? 'record' : 'records'})
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isSplitActive && (
                <button
                  onClick={() => setIsPreviewOpen(false)}
                  className="px-2.5 py-1 text-[11px] font-semibold text-[#075E54] hover:bg-[#DCF8C6] rounded border border-[#075E54]/20 flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="Expand table to full width"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span className="hidden sm:inline">Expand Table</span>
                </button>
              )}
            </div>
          </div>

          {/* Invoices Table: 7 columns in list mode, 4 columns in split-preview mode */}
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            {filteredSales.length === 0 ? (
              <div className="p-12 text-center text-[#667781] text-xs">
                <FileSpreadsheet className="w-10 h-10 text-[#D1D7DB] mx-auto mb-2" />
                <p className="font-semibold text-sm text-[#111B21]">No invoices found</p>
                <p className="text-xs text-[#667781] mt-0.5">Try clearing filters or search keywords.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#F7F5F2] text-[#3B4A54] border-b border-[#D1D7DB] sticky top-0 z-10 shadow-2xs">
                  <tr>
                    <th
                      onClick={() => handleSort('date')}
                      className="py-2.5 px-3 text-[11px] font-bold text-[#3B4A54] cursor-pointer select-none hover:text-[#075E54] whitespace-nowrap"
                    >
                      <div className="inline-flex items-center gap-1">
                        <span>Date</span>
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'date' ? 'text-[#075E54]' : 'text-[#8696A0] opacity-50'}`} />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('invoiceNumber')}
                      className="py-2.5 px-3 text-[11px] font-bold text-[#3B4A54] cursor-pointer select-none hover:text-[#075E54] whitespace-nowrap"
                    >
                      <div className="inline-flex items-center gap-1">
                        <span>Invoice No</span>
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'invoiceNumber' ? 'text-[#075E54]' : 'text-[#8696A0] opacity-50'}`} />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('customerName')}
                      className="py-2.5 px-3 text-[11px] font-bold text-[#3B4A54] cursor-pointer select-none hover:text-[#075E54] whitespace-nowrap"
                    >
                      <div className="inline-flex items-center gap-1">
                        <span>Customer</span>
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'customerName' ? 'text-[#075E54]' : 'text-[#8696A0] opacity-50'}`} />
                      </div>
                    </th>
                    <th className="py-2.5 px-3 text-[11px] font-bold text-[#3B4A54] whitespace-nowrap">
                      Company Name
                    </th>
                    {!isSplitActive && (
                      <>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-[#3B4A54] text-center whitespace-nowrap">
                          Payment Status
                        </th>
                        <th
                          onClick={() => handleSort('grandTotal')}
                          className="py-2.5 px-3 text-[11px] font-bold text-[#3B4A54] text-right cursor-pointer select-none hover:text-[#075E54] whitespace-nowrap"
                        >
                          <div className="inline-flex items-center gap-1 justify-end">
                            <span>Grand Total</span>
                            <ArrowUpDown className={`w-3 h-3 ${sortField === 'grandTotal' ? 'text-[#075E54]' : 'text-[#8696A0] opacity-50'}`} />
                          </div>
                        </th>
                        <th className="py-2.5 px-3 text-[11px] font-bold text-[#3B4A54] text-right whitespace-nowrap">
                          Actions
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EDEF]">
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={isSplitActive ? 4 : 7} className="py-12 px-4 text-center">
                        <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                          <div className="w-12 h-12 rounded-full bg-[#F7F5F2] border border-[#D1D7DB] flex items-center justify-center text-[#8696A0] mb-3">
                            <Receipt className="w-6 h-6" />
                          </div>
                          <h4 className="text-sm font-bold text-[#111B21]">No transactions found</h4>
                          <p className="text-xs text-[#667781] mt-1">
                            No sales invoices match the current filter or date range.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : filteredSales.map((sale) => {
                    const isSelected = activeSale?.id === sale.id && isSplitActive;
                    return (
                      <tr
                        key={sale.id}
                        onClick={() => {
                          setSelectedSaleId(sale.id);
                          setIsPreviewOpen(true);
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#DCF8C6]/30 font-medium border-l-4 border-l-[#075E54]'
                            : 'border-l-4 border-l-transparent hover:bg-[#F7F5F2]'
                        }`}
                      >
                        {/* 1. Date */}
                        <td className="py-3 px-3 text-[11px] text-[#3B4A54] tabular-nums whitespace-nowrap">
                          {formatDate(sale.createdAt)}
                        </td>

                        {/* 2. Invoice No */}
                        <td className="py-3 px-3 font-bold text-[#075E54] tabular-nums whitespace-nowrap">
                          {sale.invoiceNumber}
                        </td>

                        {/* 3. Customer */}
                        <td
                          className={`py-3 px-3 font-semibold text-[#111B21] truncate ${
                            isSplitActive ? 'max-w-[110px]' : 'max-w-[150px]'
                          }`}
                          title={sale.customerName || 'Walk-in Retail'}
                        >
                          {sale.customerName || 'Walk-in Retail'}
                        </td>

                        {/* 4. Company Name */}
                        <td
                          className={`py-3 px-3 text-[11px] text-[#667781] truncate ${
                            isSplitActive ? 'max-w-[100px]' : 'max-w-[140px]'
                          }`}
                          title={sale.companyName || '—'}
                        >
                          {sale.companyName || '—'}
                        </td>

                        {/* 5, 6, 7. Payment Status, Grand Total, Actions: Hidden in split-preview mode */}
                        {!isSplitActive && (
                          <>
                            {/* 5. Payment Status */}
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tabular-nums border ${
                                  sale.paymentStatus === 'PAID'
                                    ? 'bg-[#DCF8C6] text-[#075E54] border-[#B3EBA0]'
                                    : sale.paymentStatus === 'OVERDUE'
                                    ? 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]'
                                    : sale.paymentStatus === 'PARTIALLY_PAID'
                                    ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]'
                                    : 'bg-purple-100 text-purple-800 border-purple-200'
                                }`}
                              >
                                {sale.paymentStatus === 'PARTIALLY_PAID'
                                  ? 'Partially Paid'
                                  : sale.paymentStatus === 'PAID'
                                  ? 'Paid'
                                  : sale.paymentStatus === 'OVERDUE'
                                  ? 'Overdue'
                                  : 'Refunded'}
                              </span>
                            </td>

                            {/* 6. Grand Total */}
                            <td
                              className="py-3 px-3 text-right font-bold text-[#111B21] tabular-nums whitespace-nowrap"
                              style={{ fontVariantNumeric: 'tabular-nums' }}
                            >
                              {formatINR(sale.grandTotal)}
                            </td>

                            {/* 7. Actions */}
                            <td
                              className="py-3 px-3 text-right whitespace-nowrap relative"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveRowMenuId(activeRowMenuId === sale.id ? null : sale.id);
                                  }}
                                  className="p-1.5 text-[#667781] hover:text-[#075E54] hover:bg-[#DCF8C6]/50 rounded-md transition-colors cursor-pointer"
                                  title="Actions"
                                  aria-label={`Actions for invoice ${sale.invoiceNumber}`}
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>

                                {activeRowMenuId === sale.id && (
                                  <div
                                    className="absolute right-0 mt-1 w-48 bg-white border border-[#D1D7DB] rounded-lg shadow-xl py-1 z-50 text-xs font-medium text-left animate-in fade-in zoom-in-95 duration-100"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      onClick={() => {
                                        setActiveRowMenuId(null);
                                        handleRowDownloadPdf(sale);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-[#F7F5F2] flex items-center gap-2 text-[#111B21] cursor-pointer"
                                    >
                                      <Download className="w-3.5 h-3.5 text-[#075E54]" />
                                      <span>Download A4 PDF</span>
                                    </button>

                                    <button
                                      onClick={() => {
                                        setActiveRowMenuId(null);
                                        handleRowPrint(sale);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-[#F7F5F2] flex items-center gap-2 text-[#111B21] cursor-pointer"
                                    >
                                      <Printer className="w-3.5 h-3.5 text-[#075E54]" />
                                      <span>Print POS Receipt</span>
                                    </button>

                                    <button
                                      onClick={() => {
                                        setActiveRowMenuId(null);
                                        handleRowSend(sale);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-[#F7F5F2] flex items-center gap-2 text-[#111B21] cursor-pointer"
                                    >
                                      <Mail className="w-3.5 h-3.5 text-[#075E54]" />
                                      <span>Email Invoice</span>
                                    </button>

                                    <button
                                      onClick={() => {
                                        setActiveRowMenuId(null);
                                        handleRowShare(sale);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-[#F7F5F2] flex items-center gap-2 text-[#111B21] cursor-pointer"
                                    >
                                      <Share2 className="w-3.5 h-3.5 text-[#075E54]" />
                                      <span>Share Invoice</span>
                                    </button>

                                    {sale.paymentStatus !== 'REFUNDED' && (
                                      <>
                                        <div className="border-t border-[#E9EDEF] my-1" />
                                        <button
                                          onClick={() => {
                                            setActiveRowMenuId(null);
                                            setRefundingSale(sale);
                                          }}
                                          className="w-full text-left px-3 py-1.5 hover:bg-rose-50 flex items-center gap-2 text-rose-700 cursor-pointer"
                                        >
                                          <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                                          <span>Issue Refund</span>
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* RIGHT PANE: PERSISTENT INVOICE DETAIL & PDF PREVIEW */}
        {isSplitActive && activeSale && (
          <div className="w-full lg:w-[60%] xl:w-[62%] min-w-0 bg-white rounded-xl border border-[#D1D7DB] shadow-2xs overflow-hidden flex flex-col">
            <div className="flex-1 flex flex-col overflow-y-auto">
              {/* Mobile Back to List Bar */}
              <div className="lg:hidden p-2.5 bg-[#F7F5F2] border-b border-[#D1D7DB] flex items-center justify-between shrink-0">
                <button
                  onClick={() => setIsPreviewOpen(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#075E54] bg-[#DCF8C6] hover:bg-[#CEF5B4] rounded-lg transition-colors cursor-pointer border border-[#B3EBA0]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Invoices List</span>
                </button>
                <span className="text-xs font-bold text-[#111B21] tabular-nums">{activeSale.invoiceNumber}</span>
              </div>

              {/* Detail Top Toolbar */}
              <div className="p-3.5 sm:p-4 border-b border-[#D1D7DB] bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-bold text-[#111B21] tabular-nums">
                    {activeSale.invoiceNumber}
                  </h2>
                  <span className="text-xs text-[#667781] tabular-nums">
                    ({activeSale.receiptNumber})
                  </span>

                  <div className="h-4 w-px bg-[#D1D7DB] hidden sm:block" />

                  {/* Actions */}
                  <button
                    onClick={() => setViewingSaleForReceipt(activeSale)}
                    className="px-2.5 py-1 text-xs font-semibold text-[#3B4A54] hover:text-[#075E54] hover:bg-[#F7F5F2] rounded border border-[#D1D7DB] flex items-center gap-1 cursor-pointer"
                    title="Print Thermal Receipt"
                  >
                    <Receipt className="w-3 h-3" />
                    <span>Receipt</span>
                  </button>

                  <button
                    onClick={() => handleRowDownloadPdf(activeSale)}
                    className="px-2.5 py-1 text-xs font-semibold text-[#3B4A54] hover:text-[#075E54] hover:bg-[#F7F5F2] rounded border border-[#D1D7DB] flex items-center gap-1 cursor-pointer"
                    title="Download A4 PDF"
                  >
                    <Download className="w-3 h-3" />
                    <span>PDF</span>
                  </button>

                  <button
                    onClick={() => handleRowSend(activeSale)}
                    className="px-2.5 py-1 text-xs font-semibold text-[#3B4A54] hover:text-[#075E54] hover:bg-[#F7F5F2] rounded border border-[#D1D7DB] flex items-center gap-1 cursor-pointer"
                  >
                    <Mail className="w-3 h-3" />
                    <span>Email</span>
                  </button>

                  <button
                    onClick={() => handleRowShare(activeSale)}
                    className="px-2.5 py-1 text-xs font-semibold text-[#3B4A54] hover:text-[#075E54] hover:bg-[#F7F5F2] rounded border border-[#D1D7DB] flex items-center gap-1 cursor-pointer"
                  >
                    <Share2 className="w-3 h-3" />
                    <span>Share</span>
                  </button>

                  {activeSale.paymentStatus !== 'REFUNDED' && (
                    <button
                      onClick={() => setRefundingSale(activeSale)}
                      className="px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded border border-rose-200 flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3 text-rose-600" />
                      <span>Refund</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* View Mode Toggle: Details vs. PDF */}
                  <div className="flex items-center gap-1 bg-[#F7F5F2] p-0.5 rounded-lg border border-[#D1D7DB]">
                    <button
                      onClick={() => setDetailMode('DETAILS')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded cursor-pointer transition-colors ${
                        detailMode === 'DETAILS' ? 'bg-white text-[#075E54] shadow-xs' : 'text-[#667781]'
                      }`}
                    >
                      Details
                    </button>
                    <button
                      onClick={() => setDetailMode('PDF')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded cursor-pointer transition-colors ${
                        detailMode === 'PDF' ? 'bg-white text-[#075E54] shadow-xs' : 'text-[#667781]'
                      }`}
                    >
                      A4 Invoice
                    </button>
                  </div>

                  {/* Close Preview */}
                  <button
                    onClick={() => setIsPreviewOpen(false)}
                    className="p-1.5 text-[#667781] hover:text-[#111B21] hover:bg-[#F7F5F2] rounded-lg transition-colors cursor-pointer"
                    title="Close preview"
                    aria-label="Close preview"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* View Content */}
              {detailMode === 'PDF' ? (
                <div className="p-4 sm:p-6 overflow-y-auto bg-[#F7F5F2]">
                  <QuotationDocumentPdf
                    document={activeSale}
                    type="INVOICE"
                    showToolbar={false}
                  />
                </div>
              ) : (
                <div className="p-4 sm:p-6 space-y-6">
                  {/* KPI Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-[#F7F5F2] rounded-xl border border-[#D1D7DB]">
                      <span className="text-[11px] text-[#667781] block">Grand Total</span>
                      <span className="text-base font-bold text-[#075E54] tabular-nums mt-0.5 block">
                        {formatINR(activeSale.grandTotal)}
                      </span>
                    </div>

                    <div className="p-3 bg-[#F7F5F2] rounded-xl border border-[#D1D7DB]">
                      <span className="text-[11px] text-[#667781] block">Paid Amount</span>
                      <span className="text-base font-bold text-[#111B21] tabular-nums mt-0.5 block">
                        {formatINR(activeSale.payments.reduce((acc, p) => acc + p.amount, 0))}
                      </span>
                    </div>

                    <div className="p-3 bg-[#F7F5F2] rounded-xl border border-[#D1D7DB]">
                      <span className="text-[11px] text-[#667781] block">Balance Due</span>
                      <span className="text-base font-bold text-[#92400E] tabular-nums mt-0.5 block">
                        {formatINR(
                          Math.max(
                            0,
                            activeSale.grandTotal -
                              activeSale.payments.reduce((acc, p) => acc + p.amount, 0)
                          )
                        )}
                      </span>
                    </div>

                    <div className="p-3 bg-[#F7F5F2] rounded-xl border border-[#D1D7DB]">
                      <span className="text-[11px] text-[#667781] block">Sync Status</span>
                      <span className="text-xs font-bold text-[#075E54] mt-1 block">
                        {activeSale.syncStatus === 'SYNCED' ? 'Cloud Synced' : 'Saved Locally'}
                      </span>
                    </div>
                  </div>

                  {/* Customer Information Card */}
                  <div className="p-4 rounded-xl border border-[#D1D7DB] bg-[#F7F5F2] space-y-2">
                    <span className="text-[10px] font-bold text-[#8696A0] uppercase tracking-wider block">
                      Customer &amp; Fiscal Details
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-[#667781] block text-[11px]">Customer</span>
                        <span className="font-bold text-[#111B21]">
                          {activeSale.customerName || 'Walk-in Retail Client'}
                        </span>
                        {activeSale.companyName && (
                          <span className="text-[11px] text-[#3B4A54] block mt-0.5">
                            {activeSale.companyName}
                          </span>
                        )}
                        {activeSale.customerPhone && (
                          <span className="text-[11px] text-[#667781] tabular-nums block">
                            {activeSale.customerPhone}
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="text-[#667781] block text-[11px]">Billing Address</span>
                        <span className="text-[#111B21]">
                          {activeSale.billingAddress || 'Bengaluru Central, Karnataka'}
                        </span>
                        {activeSale.customerGstin && (
                          <span className="text-[10px] text-[#075E54] font-semibold block mt-1">
                            GSTIN: {activeSale.customerGstin}
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="text-[#667781] block text-[11px]">Terminal &amp; Staff</span>
                        <span className="text-[#111B21] font-medium block">
                          Cashier: {activeSale.cashierName}
                        </span>
                        <span className="text-[11px] text-[#667781] block">
                          Branch: {activeSale.branchName}
                        </span>
                        <span className="text-[11px] text-[#8696A0] tabular-nums block mt-0.5">
                          {formatDate(activeSale.createdAt, true)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div>
                    <div className="text-xs font-bold text-[#111B21] mb-2 flex items-center justify-between">
                      <span>Items Breakdown ({activeSale.items.length})</span>
                      <span className="text-[11px] text-[#667781] font-normal">
                        GST Rule 55 Compliant
                      </span>
                    </div>

                    <div className="rounded-lg border border-[#D1D7DB] overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#F7F5F2] border-b border-[#D1D7DB] text-[#667781] font-bold text-[10px] uppercase">
                          <tr>
                            <th className="py-2.5 px-3 w-12">S.No</th>
                            <th className="py-2.5 px-4">Item &amp; SKU</th>
                            <th className="py-2.5 px-3 text-right">Qty</th>
                            <th className="py-2.5 px-3 text-right">Rate</th>
                            <th className="py-2.5 px-3 text-right">Taxable</th>
                            <th className="py-2.5 px-3 text-right">GST</th>
                            <th className="py-2.5 px-4 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E9EDEF]">
                          {activeSale.items.map((item, idx) => (
                            <tr key={`${item.product?.id || 'item'}-${idx}`} className="hover:bg-[#F7F5F2]">
                              <td className="py-2.5 px-3 text-[#667781] tabular-nums">{idx + 1}</td>
                              <td className="py-2.5 px-4">
                                <div className="font-semibold text-[#111B21]">
                                  {item.product.name}
                                </div>
                                <div className="text-[10px] text-[#8696A0] mt-0.5 tabular-nums">
                                  SKU: {item.product.sku} · HSN: {item.product.hsn}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums">
                                {item.quantity}{' '}
                                <span className="text-[10px] text-[#8696A0]">
                                  {item.product.unit.toLowerCase()}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums">
                                {formatINR(item.unitPrice)}
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums text-[#3B4A54]">
                                {formatINR(item.taxableAmount)}
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums text-[#667781]">
                                {formatINR(item.cgstAmount + item.sgstAmount)}
                              </td>
                              <td className="py-2.5 px-4 text-right font-bold tabular-nums text-[#111B21]">
                                {formatINR(item.total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Payment Breakdown & Financial Totals */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    {/* Payments History */}
                    <div className="p-3.5 rounded-xl border border-[#D1D7DB] bg-[#F7F5F2] space-y-2">
                      <span className="text-[10px] font-bold text-[#8696A0] uppercase tracking-wider block">
                        Payment Allocations
                      </span>
                      {activeSale.payments.length === 0 ? (
                        <div className="text-xs text-[#667781]">No payment recorded yet.</div>
                      ) : (
                        <div className="space-y-1.5 text-xs">
                          {activeSale.payments.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between p-2 bg-white rounded border border-[#E9EDEF]"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[#075E54]">{p.method}</span>
                                {p.utrOrRef && (
                                  <span className="text-[11px] text-[#667781] tabular-nums">
                                    Ref: {p.utrOrRef}
                                  </span>
                                )}
                              </div>
                              <span className="font-bold tabular-nums text-[#111B21]">
                                {formatINR(p.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Totals Summary */}
                    <div className="p-3.5 rounded-xl border border-[#D1D7DB] bg-white space-y-2 text-xs tabular-nums">
                      <div className="flex justify-between text-[#667781]">
                        <span>Taxable Amount</span>
                        <span className="font-semibold text-[#111B21]">
                          {formatINR(activeSale.taxableTotal)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[#667781]">
                        <span>CGST + SGST</span>
                        <span className="font-semibold text-[#111B21]">
                          {formatINR(activeSale.cgstTotal + activeSale.sgstTotal)}
                        </span>
                      </div>
                      {activeSale.roundOff !== 0 && (
                        <div className="flex justify-between text-[#667781]">
                          <span>Round Off</span>
                          <span className="font-semibold text-[#111B21]">
                            {activeSale.roundOff.toFixed(2)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-sm text-[#111B21] pt-2 border-t border-[#D1D7DB]">
                        <span>Grand Total</span>
                        <span className="text-[#075E54]">{formatINR(activeSale.grandTotal)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL: VIEW THERMAL RECEIPT */}
      {viewingSaleForReceipt && (
        <ThermalReceiptModal
          sale={viewingSaleForReceipt}
          onClose={() => setViewingSaleForReceipt(null)}
          onNewSale={() => setViewingSaleForReceipt(null)}
        />
      )}

      {/* MODAL: ISSUE REFUND */}
      {refundingSale && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#D1D7DB]">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-600" />
                <h3 className="font-bold text-base text-[#111B21]">Issue Refund &amp; Credit Note</h3>
              </div>
              <button
                onClick={() => setRefundingSale(null)}
                className="text-[#8696A0] hover:text-[#111B21] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleIssueRefundSubmit} className="space-y-4 mt-4 text-xs">
              <div className="p-3 bg-[#F7F5F2] rounded-lg border border-[#D1D7DB]">
                <div className="flex justify-between text-[#3B4A54]">
                  <span>Invoice Number:</span>
                  <strong className="text-[#111B21]">{refundingSale.invoiceNumber}</strong>
                </div>
                <div className="flex justify-between text-[#3B4A54] mt-1">
                  <span>Customer:</span>
                  <strong>{refundingSale.customerName || 'Walk-in Retail'}</strong>
                </div>
                <div className="flex justify-between text-[#3B4A54] mt-1">
                  <span>Total Bill Amount:</span>
                  <strong className="text-[#075E54] tabular-nums font-bold">
                    {formatINR(refundingSale.grandTotal)}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-[#3B4A54] font-semibold mb-1">Refund Reason</label>
                <input
                  type="text"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full p-2.5 border border-[#D1D7DB] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#075E54]"
                  required
                />
              </div>

              <div>
                <label className="block text-[#3B4A54] font-semibold mb-1">Refund Method</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRefundMethod('CASH')}
                    className={`p-2.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                      refundMethod === 'CASH'
                        ? 'border-[#075E54] bg-[#DCF8C6]/40 text-[#075E54]'
                        : 'border-[#D1D7DB] hover:bg-[#F7F5F2] text-[#3B4A54]'
                    }`}
                  >
                    Cash Payout
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundMethod('UPI')}
                    className={`p-2.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                      refundMethod === 'UPI'
                        ? 'border-[#075E54] bg-[#DCF8C6]/40 text-[#075E54]'
                        : 'border-[#D1D7DB] hover:bg-[#F7F5F2] text-[#3B4A54]'
                    }`}
                  >
                    UPI Reversal
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="restock"
                  checked={restockInventory}
                  onChange={(e) => setRestockInventory(e.target.checked)}
                  className="w-4 h-4 text-[#075E54] rounded focus:ring-0 cursor-pointer"
                />
                <label htmlFor="restock" className="text-[#3B4A54] cursor-pointer">
                  Restock product quantities back to live inventory
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#D1D7DB]">
                <button
                  type="button"
                  onClick={() => setRefundingSale(null)}
                  className="px-4 py-2 border border-[#D1D7DB] rounded-lg text-xs font-semibold text-[#3B4A54] hover:bg-[#F7F5F2] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                >
                  Confirm Refund
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
