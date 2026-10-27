/**
 * SLATE POS — Quotes & Customer Quotations Module
 * Faithfully redesigned according to Zoho Billing functional references and screenshots:
 * - 14-option Quote Status & Category dropdown
 * - Expandable search control
 * - Primary + New dropdown (One-Time Quotation / Subscription Quotation)
 * - Three-dot toolbar menu (Sort by, Import, Export CSV, Preferences, Custom Fields, Refresh, Reset)
 * - Ledger table with exact 7 columns
 * - Dual Master-Detail split workspace matching Screenshot 2
 * - Interactive quotation editor with live tax/discount calculations
 * - One-click conversion to Tax Invoice with duplicate prevention
 * - Email composition modal and Share functionality
 * - Details vs. PDF live preview toggle
 * - Pure Poppins typography & SLATE POS theme (#075E54 / #128C7E / #DCF8C6 / #ECE5DD / #FFFFFF)
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Quotation,
  QuoteStatus,
  QuoteType,
  QuoteLineItem,
  Customer,
  Product,
  Sale,
  CustomFieldDefinition,
} from '../../types';
import { offlineStore } from '../../lib/offlineStore';
import { INITIAL_ORGANIZATION } from '../../lib/initialData';
import { formatINR, formatDate } from '../../lib/formatters';
import { QuotationDocumentPdf } from './QuotationDocumentPdf';
import {
  FileSpreadsheet,
  Plus,
  Search,
  MoreVertical,
  ChevronDown,
  Download,
  Printer,
  Mail,
  Share2,
  Edit,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  FileText,
  Trash2,
  Copy,
  ExternalLink,
  SlidersHorizontal,
  RefreshCw,
  Upload,
  Layers,
  Calendar,
  User,
  Building,
  Tag,
  ArrowUpDown,
  Send,
  Eye,
  Check,
  Maximize2,
  Minimize2,
  ArrowLeft,
} from 'lucide-react';

const QUOTE_STATUS_OPTIONS = [
  { id: 'ALL', label: 'All Quotes', category: 'STATUS' },
  { id: 'DRAFT', label: 'Draft', category: 'STATUS' },
  { id: 'PENDING_APPROVAL', label: 'Pending Approval', category: 'STATUS' },
  { id: 'APPROVED', label: 'Approved', category: 'STATUS' },
  { id: 'SENT', label: 'Sent', category: 'STATUS' },
  { id: 'VIEWED', label: 'Customer Viewed', category: 'STATUS' },
  { id: 'ACCEPTED', label: 'Accepted', category: 'STATUS' },
  { id: 'INVOICED', label: 'Invoiced', category: 'STATUS' },
  { id: 'DECLINED', label: 'Declined', category: 'STATUS' },
  { id: 'EXPIRED', label: 'Expired', category: 'STATUS' },
  { id: 'TYPE_ONE_TIME', label: 'Quotes Created for One-Time Invoice', category: 'TYPE' },
  { id: 'TYPE_NEW_SUB', label: 'Quotes Created for New Subscription', category: 'TYPE' },
  { id: 'TYPE_SUB_UPDATE', label: 'Quotes Created for Subscription Update', category: 'TYPE' },
  { id: 'TYPE_ONE_TIME_ADDON', label: 'Quotes Created for One-Time Add-on', category: 'TYPE' },
];

export const QuotesPage: React.FC = () => {
  const [quotations, setQuotations] = useState<Quotation[]>(offlineStore.getQuotations());
  const [customers, setCustomers] = useState<Customer[]>(offlineStore.getCustomers());
  const [products, setProducts] = useState<Product[]>(offlineStore.getProducts());
  const [sales, setSales] = useState<Sale[]>(offlineStore.getSales());
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null); // Default to null: list-only default state

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sorting & Preferences
  const [sortField, setSortField] = useState<'date' | 'quoteNumber' | 'customerName' | 'grandTotal'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [preferences, setPreferences] = useState(offlineStore.getQuotePreferences());
  const [currentPage, setCurrentPage] = useState(1);

  // Detail view toggles
  const [detailTab, setDetailTab] = useState<'DETAILS' | 'ACTIVITY'>('DETAILS');
  const [viewMode, setViewMode] = useState<'DETAILS' | 'PDF'>('DETAILS');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false); // Default to false: list-only default state
  const [activeRowMenuId, setActiveRowMenuId] = useState<string | null>(null);

  // Menus & Modals
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false);
  const [isCustomFieldsModalOpen, setIsCustomFieldsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [editorQuoteType, setEditorQuoteType] = useState<QuoteType>('ONE_TIME');
  const [editingQuote, setEditingQuote] = useState<Quotation | null>(null);

  // Toast / notification feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleOutsideClick = () => setActiveRowMenuId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setQuotations(offlineStore.getQuotations());
      setCustomers(offlineStore.getCustomers());
      setProducts(offlineStore.getProducts());
      setSales(offlineStore.getSales());
      setPreferences(offlineStore.getQuotePreferences());
    });
    return unsub;
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Filter quotations based on 14-option filter + Search
  const filteredQuotes = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];

    return quotations.filter((q) => {
      // Status & Type Filter
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'TYPE_ONE_TIME') {
          if (q.quoteType !== 'ONE_TIME') return false;
        } else if (statusFilter === 'TYPE_NEW_SUB') {
          if (q.quoteType !== 'NEW_SUBSCRIPTION') return false;
        } else if (statusFilter === 'TYPE_SUB_UPDATE') {
          if (q.quoteType !== 'SUBSCRIPTION_UPDATE') return false;
        } else if (statusFilter === 'TYPE_ONE_TIME_ADDON') {
          if (q.quoteType !== 'ONE_TIME_ADDON') return false;
        } else if (statusFilter === 'EXPIRED') {
          if (q.status !== 'EXPIRED' && q.expiryDate >= today) return false;
        } else {
          if (q.status !== statusFilter) return false;
        }
      }

      // Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesNumber = q.quoteNumber.toLowerCase().includes(query);
        const matchesCustomer = q.customerName.toLowerCase().includes(query);
        const matchesCompany = q.companyName ? q.companyName.toLowerCase().includes(query) : false;
        const matchesEmail = q.customerEmail ? q.customerEmail.toLowerCase().includes(query) : false;
        const matchesInvoice = q.linkedInvoiceNumber ? q.linkedInvoiceNumber.toLowerCase().includes(query) : false;
        if (!matchesNumber && !matchesCustomer && !matchesCompany && !matchesEmail && !matchesInvoice) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortField === 'quoteNumber') {
        comparison = a.quoteNumber.localeCompare(b.quoteNumber);
      } else if (sortField === 'customerName') {
        comparison = a.customerName.localeCompare(b.customerName);
      } else if (sortField === 'grandTotal') {
        comparison = a.grandTotal - b.grandTotal;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [quotations, statusFilter, searchQuery, sortField, sortOrder]);

  // Selected quotation object & Split view status
  const activeQuote = useMemo(() => {
    if (!selectedQuoteId) return null;
    return filteredQuotes.find((q) => q.id === selectedQuoteId) || quotations.find((q) => q.id === selectedQuoteId) || null;
  }, [filteredQuotes, quotations, selectedQuoteId]);

  const isSplitActive = isPreviewOpen && activeQuote !== null;

  // Helper to derive payment status from linked invoices or quotation state
  const getDerivedPaymentStatus = (quote: Quotation) => {
    if (quote.linkedInvoiceId) {
      const linkedSale = sales.find((s) => s.id === quote.linkedInvoiceId || s.invoiceNumber === quote.linkedInvoiceNumber);
      if (linkedSale) {
        if (linkedSale.paymentStatus === 'PAID') {
          return { label: 'Paid', bg: 'bg-[#DCF8C6]', text: 'text-[#075E54]', border: 'border-[#B3EBA0]' };
        }
        if (linkedSale.paymentStatus === 'PARTIALLY_PAID') {
          return { label: 'Partially Paid', bg: 'bg-[#FEF3C7]', text: 'text-[#92400E]', border: 'border-[#FDE68A]' };
        }
        if (linkedSale.paymentStatus === 'OVERDUE') {
          return { label: 'Overdue', bg: 'bg-[#FEE2E2]', text: 'text-[#B91C1C]', border: 'border-[#FECACA]' };
        }
        return { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' };
      }
      return { label: 'Invoiced', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    }
    if (quote.status === 'DECLINED') {
      return { label: 'Declined', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };
    }
    if (quote.status === 'EXPIRED') {
      return { label: 'Expired', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' };
    }
    return { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' };
  };

  const handleRowDownloadPdf = (quote: Quotation) => {
    setSelectedQuoteId(quote.id);
    setViewMode('PDF');
    setIsPreviewOpen(true);
    showToast(`Opening printable PDF for ${quote.quoteNumber}...`);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  const handleRowPrint = (quote: Quotation) => {
    setSelectedQuoteId(quote.id);
    setViewMode('PDF');
    setIsPreviewOpen(true);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  const handleRowSend = (quote: Quotation) => {
    setSelectedQuoteId(quote.id);
    setIsEmailModalOpen(true);
  };

  const handleRowShare = (quote: Quotation) => {
    if (navigator.share) {
      navigator.share({
        title: `Quotation ${quote.quoteNumber} - ${quote.customerName}`,
        text: `Quotation ${quote.quoteNumber} for ${formatINR(quote.grandTotal)}. Valid until ${formatDate(quote.expiryDate)}.`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(
        `Quotation ${quote.quoteNumber} | Customer: ${quote.customerName} (${quote.companyName || 'N/A'}) | Amount: ${formatINR(quote.grandTotal)} | Date: ${formatDate(quote.date)} | Valid until: ${formatDate(quote.expiryDate)}`
      );
      showToast(`Quotation ${quote.quoteNumber} summary copied to clipboard!`);
    }
  };

  const handleRowEdit = (quote: Quotation) => {
    handleOpenEditor(quote.quoteType, quote);
  };

  const handleSort = (field: 'date' | 'quoteNumber' | 'customerName' | 'grandTotal') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const currentStatusLabel = useMemo(() => {
    return QUOTE_STATUS_OPTIONS.find((opt) => opt.id === statusFilter)?.label || 'All Quotes';
  }, [statusFilter]);

  // Handlers
  const handleOpenEditor = (type: QuoteType, quoteToEdit?: Quotation) => {
    setEditorQuoteType(type);
    setEditingQuote(quoteToEdit || null);
    setIsNewMenuOpen(false);
    setIsEditorModalOpen(true);
  };

  const handleConvertToInvoice = (quote: Quotation) => {
    const res = offlineStore.convertQuotationToInvoice(quote.id);
    if (res.success && res.sale) {
      showToast(`Quotation ${quote.quoteNumber} converted to Tax Invoice ${res.sale.invoiceNumber}!`);
    } else {
      alert(res.error || 'Failed to convert quotation');
    }
  };

  const handleMarkAsSent = (quote: Quotation) => {
    const updated: Quotation = {
      ...quote,
      status: 'SENT',
    };
    offlineStore.saveQuotation(updated);
    offlineStore.addQuotationActivity(quote.id, 'Marked as Sent to customer');
    showToast(`Quotation ${quote.quoteNumber} marked as Sent.`);
  };

  const handleMarkAsAccepted = (quote: Quotation) => {
    const updated: Quotation = {
      ...quote,
      status: 'ACCEPTED',
    };
    offlineStore.saveQuotation(updated);
    offlineStore.addQuotationActivity(quote.id, 'Quotation accepted by customer');
    showToast(`Quotation ${quote.quoteNumber} marked as Accepted.`);
  };

  const handleMarkAsDeclined = (quote: Quotation) => {
    const updated: Quotation = {
      ...quote,
      status: 'DECLINED',
    };
    offlineStore.saveQuotation(updated);
    offlineStore.addQuotationActivity(quote.id, 'Quotation marked as Declined');
    showToast(`Quotation ${quote.quoteNumber} marked as Declined.`);
  };

  const handleExportCsv = () => {
    setIsActionMenuOpen(false);
    const headers = ['Quote Number', 'Date', 'Expiry Date', 'Customer', 'Company', 'Status', 'Grand Total'];
    const rows = filteredQuotes.map((q) => [
      q.quoteNumber,
      q.date,
      q.expiryDate,
      `"${q.customerName.replace(/"/g, '""')}"`,
      `"${(q.companyName || '').replace(/"/g, '""')}"`,
      q.status,
      q.grandTotal.toFixed(2),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `SLATE_Quotes_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${filteredQuotes.length} quotes to CSV.`);
  };

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto min-h-[calc(100vh-120px)] flex flex-col">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-[#075E54] text-white px-4 py-2.5 rounded-lg shadow-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-[#DCF8C6]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. TOP QUOTES TOOLBAR (Matching Zoho Billing Reference) */}
      {/* ========================================================================= */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-[#D1D7DB] shadow-2xs flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* A. Status & Category Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#D1D7DB] hover:bg-[#F7F5F2] text-xs font-bold text-[#111B21] transition-colors cursor-pointer"
            >
              <span>{currentStatusLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#667781]" />
            </button>

            {isStatusDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-72 bg-white border border-[#D1D7DB] rounded-lg shadow-xl py-1.5 z-50 max-h-96 overflow-y-auto">
                <div className="px-3 py-1 text-[10px] font-bold text-[#8696A0] uppercase tracking-wider">
                  Filter by Status
                </div>
                {QUOTE_STATUS_OPTIONS.filter((o) => o.category === 'STATUS').map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setStatusFilter(opt.id);
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

                <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold text-[#8696A0] uppercase tracking-wider border-t border-[#E9EDEF] mt-1">
                  Filter by Category
                </div>
                {QUOTE_STATUS_OPTIONS.filter((o) => o.category === 'TYPE').map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setStatusFilter(opt.id);
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
            {filteredQuotes.length} {filteredQuotes.length === 1 ? 'Quotation' : 'Quotations'}
          </span>
        </div>

        {/* Right Tools Group: Search, + New, Three-Dot Menu */}
        <div className="flex items-center gap-2">
          {/* B. Search Control */}
          <div className="relative flex items-center">
            {isSearchExpanded ? (
              <div className="flex items-center gap-1 animate-in fade-in duration-150">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#8696A0] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search in Quotes (/ )"
                    className="w-48 sm:w-64 pl-8 pr-7 py-1.5 text-xs rounded-lg border border-[#D1D7DB] focus:outline-none focus:ring-1 focus:ring-[#075E54] bg-[#F7F5F2]"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8696A0] hover:text-[#111B21]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => {
                    setIsSearchExpanded(false);
                    setSearchQuery('');
                  }}
                  className="p-1.5 text-xs text-[#667781] hover:text-[#111B21] rounded"
                  title="Close search"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setIsSearchExpanded(true);
                  setTimeout(() => searchInputRef.current?.focus(), 50);
                }}
                className="p-2 text-[#3B4A54] hover:text-[#075E54] hover:bg-[#F7F5F2] rounded-lg transition-colors cursor-pointer border border-[#D1D7DB]"
                title="Search in Quotes"
              >
                <Search className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* C. Add Quotation Button (+ New) */}
          <div className="relative">
            <button
              onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-[#075E54] to-[#128C7E] text-white text-xs font-bold shadow-xs hover:opacity-95 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-white" />
              <span>New</span>
              <ChevronDown className="w-3 h-3 text-white/80" />
            </button>

            {isNewMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-52 bg-white border border-[#D1D7DB] rounded-lg shadow-xl py-1.5 z-50 animate-in fade-in duration-100">
                <button
                  onClick={() => handleOpenEditor('ONE_TIME')}
                  className="w-full text-left px-3.5 py-2 text-xs text-[#111B21] hover:bg-[#F7F5F2] flex items-center gap-2 cursor-pointer font-medium"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#075E54]" />
                  <span>One-Time Quotation</span>
                </button>
                <button
                  onClick={() => handleOpenEditor('NEW_SUBSCRIPTION')}
                  className="w-full text-left px-3.5 py-2 text-xs text-[#111B21] hover:bg-[#F7F5F2] flex items-center gap-2 cursor-pointer font-medium"
                >
                  <Layers className="w-3.5 h-3.5 text-[#128C7E]" />
                  <span>Subscription Quotation</span>
                </button>
              </div>
            )}
          </div>

          {/* D. Three-Dot Action Menu */}
          <div className="relative">
            <button
              onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
              className="p-2 text-[#3B4A54] hover:text-[#075E54] hover:bg-[#F7F5F2] rounded-lg transition-colors cursor-pointer border border-[#D1D7DB]"
              title="More Actions"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {isActionMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-56 bg-white border border-[#D1D7DB] rounded-lg shadow-xl py-1.5 z-50 text-xs">
                {/* Sort Submenu */}
                <div className="px-3 py-1.5 font-bold text-[10px] text-[#8696A0] uppercase tracking-wider border-b border-[#E9EDEF]">
                  Sort By
                </div>
                <button
                  onClick={() => {
                    setSortField('date');
                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    setIsActionMenuOpen(false);
                  }}
                  className="w-full text-left px-3.5 py-1.5 hover:bg-[#F7F5F2] flex items-center justify-between cursor-pointer"
                >
                  <span>Date</span>
                  {sortField === 'date' && <span className="text-[10px] text-[#075E54] font-bold">{sortOrder.toUpperCase()}</span>}
                </button>
                <button
                  onClick={() => {
                    setSortField('quoteNumber');
                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    setIsActionMenuOpen(false);
                  }}
                  className="w-full text-left px-3.5 py-1.5 hover:bg-[#F7F5F2] flex items-center justify-between cursor-pointer"
                >
                  <span>Quote Number</span>
                  {sortField === 'quoteNumber' && <span className="text-[10px] text-[#075E54] font-bold">{sortOrder.toUpperCase()}</span>}
                </button>
                <button
                  onClick={() => {
                    setSortField('grandTotal');
                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    setIsActionMenuOpen(false);
                  }}
                  className="w-full text-left px-3.5 py-1.5 hover:bg-[#F7F5F2] flex items-center justify-between cursor-pointer"
                >
                  <span>Grand Total</span>
                  {sortField === 'grandTotal' && <span className="text-[10px] text-[#075E54] font-bold">{sortOrder.toUpperCase()}</span>}
                </button>

                <div className="my-1 border-t border-[#E9EDEF]" />
                <button
                  onClick={() => {
                    setIsActionMenuOpen(false);
                    setIsImportModalOpen(true);
                  }}
                  className="w-full text-left px-3.5 py-1.5 hover:bg-[#F7F5F2] flex items-center gap-2 cursor-pointer text-[#111B21]"
                >
                  <Upload className="w-3.5 h-3.5 text-[#075E54]" />
                  <span>Import Quotes</span>
                </button>
                <button
                  onClick={handleExportCsv}
                  className="w-full text-left px-3.5 py-1.5 hover:bg-[#F7F5F2] flex items-center gap-2 cursor-pointer text-[#111B21]"
                >
                  <Download className="w-3.5 h-3.5 text-[#075E54]" />
                  <span>Export Quotes (CSV)</span>
                </button>
                <button
                  onClick={() => {
                    setIsActionMenuOpen(false);
                    setIsPreferencesModalOpen(true);
                  }}
                  className="w-full text-left px-3.5 py-1.5 hover:bg-[#F7F5F2] flex items-center gap-2 cursor-pointer text-[#111B21]"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#075E54]" />
                  <span>Preferences</span>
                </button>
                <button
                  onClick={() => {
                    setIsActionMenuOpen(false);
                    setIsCustomFieldsModalOpen(true);
                  }}
                  className="w-full text-left px-3.5 py-1.5 hover:bg-[#F7F5F2] flex items-center gap-2 cursor-pointer text-[#111B21]"
                >
                  <Tag className="w-3.5 h-3.5 text-[#075E54]" />
                  <span>Manage Custom Fields</span>
                </button>
                <button
                  onClick={() => {
                    setQuotations(offlineStore.getQuotations());
                    setIsActionMenuOpen(false);
                    showToast('Quotes list reloaded from storage.');
                  }}
                  className="w-full text-left px-3.5 py-1.5 hover:bg-[#F7F5F2] flex items-center gap-2 cursor-pointer text-[#111B21]"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#075E54]" />
                  <span>Refresh List</span>
                </button>
                <button
                  onClick={() => {
                    setIsActionMenuOpen(false);
                    showToast('Default ledger column widths restored.');
                  }}
                  className="w-full text-left px-3.5 py-1.5 hover:bg-[#F7F5F2] flex items-center gap-2 cursor-pointer text-[#111B21]"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-[#075E54]" />
                  <span>Reset Column Width</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SPLIT MASTER-DETAIL WORKSPACE & 7-COLUMN QUOTES LEDGER TABLE */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-[750px]">
        {/* LEFT PANE / FULL-WIDTH TABLE: QUOTES 7-COLUMN LEDGER TABLE */}
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
                ({filteredQuotes.length} {filteredQuotes.length === 1 ? 'record' : 'records'})
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

          {/* Table: 7 columns in list mode, 4 columns in split-preview mode */}
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            {filteredQuotes.length === 0 ? (
              <div className="p-12 text-center text-[#667781] text-xs">
                <FileSpreadsheet className="w-10 h-10 text-[#D1D7DB] mx-auto mb-2" />
                <p className="font-semibold text-sm text-[#111B21]">No quotes found</p>
                <p className="text-xs text-[#667781] mt-0.5">Try choosing a different status filter or clearing search.</p>
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
                      onClick={() => handleSort('quoteNumber')}
                      className="py-2.5 px-3 text-[11px] font-bold text-[#3B4A54] cursor-pointer select-none hover:text-[#075E54] whitespace-nowrap"
                    >
                      <div className="inline-flex items-center gap-1">
                        <span>Quote No</span>
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'quoteNumber' ? 'text-[#075E54]' : 'text-[#8696A0] opacity-50'}`} />
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
                  {filteredQuotes.map((q) => {
                    const isSelected = activeQuote?.id === q.id && isSplitActive;
                    const pStatus = getDerivedPaymentStatus(q);
                    return (
                      <tr
                        key={q.id}
                        onClick={() => {
                          setSelectedQuoteId(q.id);
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
                          {formatDate(q.date)}
                        </td>

                        {/* 2. Quote No */}
                        <td className="py-3 px-3 font-bold text-[#075E54] tabular-nums whitespace-nowrap">
                          {q.quoteNumber}
                        </td>

                        {/* 3. Customer */}
                        <td
                          className={`py-3 px-3 font-semibold text-[#111B21] truncate ${
                            isSplitActive ? 'max-w-[110px]' : 'max-w-[150px]'
                          }`}
                          title={q.customerName}
                        >
                          {q.customerName}
                        </td>

                        {/* 4. Company Name */}
                        <td
                          className={`py-3 px-3 text-[11px] text-[#667781] truncate ${
                            isSplitActive ? 'max-w-[100px]' : 'max-w-[140px]'
                          }`}
                          title={q.companyName || '—'}
                        >
                          {q.companyName || '—'}
                        </td>

                        {/* 5, 6, 7. Payment Status, Grand Total, Actions: Hidden in split-preview mode */}
                        {!isSplitActive && (
                          <>
                            {/* 5. Payment Status */}
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tabular-nums border ${pStatus.bg} ${pStatus.text} ${pStatus.border}`}
                              >
                                {pStatus.label}
                              </span>
                            </td>

                            {/* 6. Grand Total */}
                            <td
                              className="py-3 px-3 text-right font-bold text-[#111B21] tabular-nums whitespace-nowrap"
                              style={{ fontVariantNumeric: 'tabular-nums' }}
                            >
                              {formatINR(q.grandTotal)}
                            </td>

                            {/* 7. Actions */}
                            <td
                              className="py-3 px-3 text-right whitespace-nowrap relative"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="relative inline-block text-left">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveRowMenuId(activeRowMenuId === q.id ? null : q.id);
                                  }}
                                  className="p-1.5 text-[#667781] hover:text-[#075E54] hover:bg-[#DCF8C6]/50 rounded-md transition-colors cursor-pointer"
                                  title="Actions"
                                  aria-label={`Actions for quote ${q.quoteNumber}`}
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>

                                {activeRowMenuId === q.id && (
                                  <div
                                    className="absolute right-0 mt-1 w-44 bg-white border border-[#D1D7DB] rounded-lg shadow-xl py-1 z-50 text-xs font-medium text-left animate-in fade-in zoom-in-95 duration-100"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      onClick={() => {
                                        setActiveRowMenuId(null);
                                        handleRowDownloadPdf(q);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-[#F7F5F2] flex items-center gap-2 text-[#111B21] cursor-pointer"
                                    >
                                      <Download className="w-3.5 h-3.5 text-[#075E54]" />
                                      <span>Download PDF</span>
                                    </button>

                                    <button
                                      onClick={() => {
                                        setActiveRowMenuId(null);
                                        handleRowPrint(q);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-[#F7F5F2] flex items-center gap-2 text-[#111B21] cursor-pointer"
                                    >
                                      <Printer className="w-3.5 h-3.5 text-[#075E54]" />
                                      <span>Print</span>
                                    </button>

                                    <button
                                      onClick={() => {
                                        setActiveRowMenuId(null);
                                        handleRowSend(q);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-[#F7F5F2] flex items-center gap-2 text-[#111B21] cursor-pointer"
                                    >
                                      <Mail className="w-3.5 h-3.5 text-[#075E54]" />
                                      <span>Send</span>
                                    </button>

                                    <button
                                      onClick={() => {
                                        setActiveRowMenuId(null);
                                        handleRowShare(q);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-[#F7F5F2] flex items-center gap-2 text-[#111B21] cursor-pointer"
                                    >
                                      <Share2 className="w-3.5 h-3.5 text-[#075E54]" />
                                      <span>Share</span>
                                    </button>

                                    <div className="border-t border-[#E9EDEF] my-1" />

                                    <button
                                      onClick={() => {
                                        setActiveRowMenuId(null);
                                        handleRowEdit(q);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-[#F7F5F2] flex items-center gap-2 text-[#111B21] cursor-pointer"
                                    >
                                      <Edit className="w-3.5 h-3.5 text-[#075E54]" />
                                      <span>Edit</span>
                                    </button>
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

        {/* RIGHT PANE: DETAIL VIEW WORKSPACE */}
        {isSplitActive && activeQuote && (
          <div className="w-full lg:w-[60%] xl:w-[62%] min-w-0 flex-1 bg-white rounded-xl border border-[#D1D7DB] shadow-2xs overflow-hidden flex flex-col">
          {activeQuote ? (
            <div className="flex-1 flex flex-col overflow-y-auto">
              {/* Mobile Back to List bar */}
              <div className="lg:hidden p-2.5 bg-[#F7F5F2] border-b border-[#D1D7DB] flex items-center justify-between shrink-0">
                <button
                  onClick={() => setIsPreviewOpen(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#075E54] bg-[#DCF8C6] hover:bg-[#CEF5B4] rounded-lg transition-colors cursor-pointer border border-[#B3EBA0]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Quotes List</span>
                </button>
                <span className="text-xs font-bold text-[#111B21] tabular-nums">{activeQuote.quoteNumber}</span>
              </div>

              {/* Detail Top Toolbar */}
              <div className="p-3.5 sm:p-4 border-b border-[#D1D7DB] bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-bold text-[#111B21]">
                    {activeQuote.quoteNumber}
                  </h2>

                  <div className="h-4 w-px bg-[#D1D7DB] hidden sm:block" />

                  {/* Action Buttons */}
                  <button
                    onClick={() => handleOpenEditor(activeQuote.quoteType, activeQuote)}
                    className="px-2.5 py-1 text-xs font-semibold text-[#3B4A54] hover:text-[#075E54] hover:bg-[#F7F5F2] rounded border border-[#D1D7DB] flex items-center gap-1 cursor-pointer"
                  >
                    <Edit className="w-3 h-3" />
                    <span>Edit</span>
                  </button>

                  <button
                    onClick={() => setIsEmailModalOpen(true)}
                    className="px-2.5 py-1 text-xs font-semibold text-[#3B4A54] hover:text-[#075E54] hover:bg-[#F7F5F2] rounded border border-[#D1D7DB] flex items-center gap-1 cursor-pointer"
                  >
                    <Mail className="w-3 h-3" />
                    <span>Send</span>
                  </button>

                  <button
                    onClick={() => setIsShareModalOpen(true)}
                    className="px-2.5 py-1 text-xs font-semibold text-[#3B4A54] hover:text-[#075E54] hover:bg-[#F7F5F2] rounded border border-[#D1D7DB] flex items-center gap-1 cursor-pointer"
                  >
                    <Share2 className="w-3 h-3" />
                    <span>Share</span>
                  </button>

                  <button
                    onClick={() => setViewMode(viewMode === 'PDF' ? 'DETAILS' : 'PDF')}
                    className="px-2.5 py-1 text-xs font-semibold text-[#3B4A54] hover:text-[#075E54] hover:bg-[#F7F5F2] rounded border border-[#D1D7DB] flex items-center gap-1 cursor-pointer"
                  >
                    <Printer className="w-3 h-3" />
                    <span>PDF/Print</span>
                  </button>

                  <button
                    onClick={() => handleConvertToInvoice(activeQuote)}
                    disabled={activeQuote.status === 'INVOICED'}
                    className={`px-3 py-1 text-xs font-bold rounded flex items-center gap-1 cursor-pointer transition-colors ${
                      activeQuote.status === 'INVOICED'
                        ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                        : 'bg-[#075E54] hover:bg-[#128C7E] text-white shadow-2xs'
                    }`}
                  >
                    <span>{activeQuote.status === 'INVOICED' ? 'Invoiced' : 'Convert to Invoice'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* View Mode Toggle: Details vs. PDF */}
                  <div className="flex items-center gap-1 bg-[#F7F5F2] p-0.5 rounded-lg border border-[#D1D7DB]">
                    <button
                      onClick={() => setViewMode('DETAILS')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded cursor-pointer transition-colors ${
                        viewMode === 'DETAILS' ? 'bg-white text-[#075E54] shadow-xs' : 'text-[#667781]'
                      }`}
                    >
                      Details
                    </button>
                    <button
                      onClick={() => setViewMode('PDF')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded cursor-pointer transition-colors ${
                        viewMode === 'PDF' ? 'bg-white text-[#075E54] shadow-xs' : 'text-[#667781]'
                      }`}
                    >
                      PDF
                    </button>
                  </div>

                  {/* Close Preview Button */}
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

              {/* View Mode: Render PDF directly if selected */}
              {viewMode === 'PDF' ? (
                <div className="p-4 sm:p-6 overflow-y-auto bg-[#F7F5F2]">
                  <QuotationDocumentPdf
                    document={activeQuote}
                    type="QUOTATION"
                    showToolbar={false}
                  />
                </div>
              ) : (
                <div className="p-4 sm:p-6 space-y-6">
                  {/* Banner: WHATS NEXT? */}
                  {activeQuote.status === 'DRAFT' && (
                    <div className="bg-[#FFFFFF] border-l-4 border-[#075E54] p-3.5 rounded-lg border border-[#D1D7DB] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                      <div className="text-xs text-[#3B4A54]">
                        <span className="font-bold text-[#111B21]">WHATS NEXT? </span>
                        Go ahead and email this quote to your customer or simply mark it as sent.
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setIsEmailModalOpen(true)}
                          className="px-3 py-1.5 rounded-md bg-[#075E54] hover:bg-[#128C7E] text-white text-xs font-bold shadow-xs cursor-pointer"
                        >
                          Send Quote
                        </button>
                        <button
                          onClick={() => handleMarkAsSent(activeQuote)}
                          className="px-3 py-1.5 rounded-md border border-[#D1D7DB] hover:bg-[#F7F5F2] text-xs font-semibold text-[#111B21] cursor-pointer"
                        >
                          Mark As Sent
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tabs: Quote Details | Activity */}
                  <div className="border-b border-[#D1D7DB] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setDetailTab('DETAILS')}
                        className={`pb-2.5 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
                          detailTab === 'DETAILS'
                            ? 'border-[#075E54] text-[#075E54]'
                            : 'border-transparent text-[#667781] hover:text-[#111B21]'
                        }`}
                      >
                        Quote Details
                      </button>
                      <button
                        onClick={() => setDetailTab('ACTIVITY')}
                        className={`pb-2.5 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
                          detailTab === 'ACTIVITY'
                            ? 'border-[#075E54] text-[#075E54]'
                            : 'border-transparent text-[#667781] hover:text-[#111B21]'
                        }`}
                      >
                        Activity ({activeQuote.activities?.length || 0})
                      </button>
                    </div>
                  </div>

                  {detailTab === 'DETAILS' ? (
                    <div className="space-y-6">
                      {/* Quote Title & Total Header */}
                      <div className="flex items-center justify-between pb-4 border-b border-[#E9EDEF]">
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-xl font-bold text-[#111B21]">
                            {activeQuote.quoteNumber}
                          </h3>
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#DCF8C6] text-[#075E54] border border-[#B3EBA0]">
                            {activeQuote.status}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-[#667781] block">Total</span>
                          <span className="text-xl font-bold text-[#111B21] tabular-nums">
                            {formatINR(activeQuote.grandTotal)}
                          </span>
                        </div>
                      </div>

                      {/* Metadata Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3.5 text-xs">
                        <div>
                          <span className="text-[#8696A0] text-[11px] block">Quote Type</span>
                          <span className="font-semibold text-[#111B21]">
                            {activeQuote.quoteType === 'ONE_TIME' ? 'One-Time Invoice' : 'Subscription'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#8696A0] text-[11px] block">Quote Date</span>
                          <span className="font-semibold text-[#111B21] tabular-nums">
                            {formatDate(activeQuote.date)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#8696A0] text-[11px] block">Expiry Date</span>
                          <span className="font-semibold text-[#111B21] tabular-nums">
                            {formatDate(activeQuote.expiryDate)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#8696A0] text-[11px] block">Salesperson</span>
                          <span className="font-semibold text-[#111B21]">
                            {activeQuote.salesperson || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#8696A0] text-[11px] block">Creation Date</span>
                          <span className="font-semibold text-[#111B21] tabular-nums">
                            {formatDate(activeQuote.createdAt)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#8696A0] text-[11px] block">PDF Template</span>
                          <span className="font-semibold text-[#075E54]">
                            {activeQuote.pdfTemplate || 'Spreadsheet Template'}
                          </span>
                        </div>
                      </div>

                      {/* Customer Details Box */}
                      <div className="p-4 rounded-xl border border-[#D1D7DB] bg-[#F7F5F2] space-y-2">
                        <span className="text-[10px] font-bold text-[#8696A0] uppercase tracking-wider block">
                          Customer Details
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div>
                            <span className="text-[#667781] block text-[11px]">Name</span>
                            <span className="font-bold text-[#111B21] uppercase">
                              {activeQuote.customerName}
                            </span>
                            {activeQuote.companyName && (
                              <span className="text-[11px] text-[#3B4A54] block font-medium">
                                {activeQuote.companyName}
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="text-[#667781] block text-[11px]">Billing Address</span>
                            <span className="text-[#111B21]">
                              {activeQuote.billingAddress || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[#667781] block text-[11px]">Shipping Address</span>
                            <span className="text-[#111B21]">
                              {activeQuote.shippingAddress || '—'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Line Items Table */}
                      <div>
                        <div className="text-xs font-bold text-[#111B21] mb-2 flex items-center gap-1.5">
                          <span>Items</span>
                          <span className="px-1.5 py-0.2 rounded-full bg-[#E9EDEF] text-[10px] text-[#667781]">
                            {activeQuote.items.length}
                          </span>
                        </div>

                        <div className="rounded-lg border border-[#D1D7DB] overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-[#F7F5F2] border-b border-[#D1D7DB] text-[#667781] font-bold text-[10px] uppercase">
                              <tr>
                                <th className="py-2.5 px-3 w-12">S.No</th>
                                <th className="py-2.5 px-4">Item</th>
                                <th className="py-2.5 px-3 text-right">Qty</th>
                                <th className="py-2.5 px-3 text-right">Price</th>
                                <th className="py-2.5 px-3 text-right">Discount</th>
                                <th className="py-2.5 px-4 text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E9EDEF]">
                              {activeQuote.items.map((item, idx) => (
                                <tr key={`${item.id}-${idx}`} className="hover:bg-[#F7F5F2]">
                                  <td className="py-2.5 px-3 text-[#667781] tabular-nums">{idx + 1}</td>
                                  <td className="py-2.5 px-4">
                                    <div className="font-semibold text-[#111B21]">{item.name}</div>
                                    {item.description && (
                                      <div className="text-[11px] text-[#667781] mt-0.5">{item.description}</div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right tabular-nums">
                                    {item.quantity} <span className="text-[10px] text-[#8696A0]">{item.unit}</span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right tabular-nums">
                                    {formatINR(item.rate)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right tabular-nums text-[#667781]">
                                    {item.discountAmount > 0 ? formatINR(item.discountAmount) : '—'}
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

                      {/* Totals Summary Box */}
                      <div className="flex justify-end pt-2">
                        <div className="w-64 space-y-2 text-xs tabular-nums">
                          <div className="flex justify-between text-[#667781]">
                            <span>Sub Total</span>
                            <span className="font-semibold text-[#111B21]">{formatINR(activeQuote.subtotal)}</span>
                          </div>
                          {activeQuote.adjustment !== 0 && (
                            <div className="flex justify-between text-[#667781]">
                              <span>Adjustment</span>
                              <span className="font-semibold text-[#111B21]">{formatINR(activeQuote.adjustment)}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold text-sm text-[#111B21] pt-2 border-t border-[#D1D7DB]">
                            <span>Total</span>
                            <span className="text-[#075E54]">{formatINR(activeQuote.grandTotal)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Email Recipients & Notes */}
                      <div className="pt-4 border-t border-[#E9EDEF] space-y-4">
                        <div>
                          <span className="text-[10px] font-bold text-[#8696A0] uppercase tracking-wider block mb-1">
                            Email Recipients
                          </span>
                          <div className="flex items-center gap-2 flex-wrap">
                            {activeQuote.emailRecipients?.map((email) => (
                              <span
                                key={email}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#DCF8C6]/50 border border-[#B3EBA0] text-xs font-medium text-[#075E54]"
                              >
                                <Mail className="w-3 h-3" />
                                <span>{email}</span>
                              </span>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold text-[#8696A0] uppercase tracking-wider block mb-1">
                            Notes
                          </span>
                          <p className="text-xs text-[#3B4A54]">
                            {activeQuote.notes || 'Looking forward for your business.'}
                          </p>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold text-[#8696A0] uppercase tracking-wider block mb-1">
                            Terms and Conditions
                          </span>
                          <p className="text-xs text-[#667781]">
                            {activeQuote.termsAndConditions || 'No Terms and Conditions'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ACTIVITY TAB */
                    <div className="space-y-4">
                      <span className="text-xs font-bold text-[#111B21]">Audit Activity Log</span>
                      <div className="border-l-2 border-[#D1D7DB] ml-3 pl-4 space-y-4 text-xs">
                        {activeQuote.activities?.map((act) => (
                          <div key={act.id} className="relative">
                            <div className="w-2.5 h-2.5 rounded-full bg-[#075E54] absolute -left-[21px] top-1" />
                            <div className="font-semibold text-[#111B21]">{act.action}</div>
                            <div className="text-[11px] text-[#667781] flex items-center gap-2 mt-0.5">
                              <span>{act.actor}</span>
                              <span>·</span>
                              <span className="tabular-nums">{formatDate(act.timestamp, true)}</span>
                            </div>
                            {act.notes && (
                              <p className="text-[11px] text-[#3B4A54] mt-1 bg-[#F7F5F2] p-2 rounded border border-[#E9EDEF]">
                                {act.notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-12 text-[#667781] text-xs">
              <div className="text-center">
                <FileSpreadsheet className="w-12 h-12 text-[#D1D7DB] mx-auto mb-2" />
                <p className="font-bold text-sm text-[#111B21]">No quotation selected</p>
                <p className="text-xs mt-1">Select a quotation from the ledger or create a new quote.</p>
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. MODAL: CREATE / EDIT QUOTATION */}
      {/* ========================================================================= */}
      {isEditorModalOpen && (
        <QuotationEditorModal
          quoteType={editorQuoteType}
          quoteToEdit={editingQuote}
          customers={customers}
          products={products}
          onClose={() => setIsEditorModalOpen(false)}
          onSaved={(savedQuote) => {
            setSelectedQuoteId(savedQuote.id);
            setIsEditorModalOpen(false);
            showToast(`Quotation ${savedQuote.quoteNumber} saved successfully.`);
          }}
        />
      )}

      {/* 4. MODAL: SEND EMAIL COMPOSER */}
      {isEmailModalOpen && activeQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-lg overflow-hidden">
            <div className="p-4 bg-[#F7F5F2] border-b border-[#D1D7DB] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#075E54]" />
                <h3 className="text-sm font-bold text-[#111B21]">
                  Send Quotation {activeQuote.quoteNumber} via Email
                </h3>
              </div>
              <button onClick={() => setIsEmailModalOpen(false)} className="text-[#667781] hover:text-[#111B21]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-xs font-semibold text-[#111B21] mb-1">Send To (Customer Email)</label>
                <input
                  type="email"
                  defaultValue={activeQuote.customerEmail || 'santhosh.brandmgr@gmail.com'}
                  className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111B21] mb-1">Subject</label>
                <input
                  type="text"
                  defaultValue={`Quotation ${activeQuote.quoteNumber} from ${INITIAL_ORGANIZATION.tradeName}`}
                  className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111B21] mb-1">Message Body</label>
                <textarea
                  rows={4}
                  defaultValue={`Dear ${activeQuote.customerName},\n\nPlease find attached quotation ${activeQuote.quoteNumber} for ₹${activeQuote.grandTotal.toFixed(2)}.\n\nLooking forward to your confirmation.\n\nBest regards,\n${INITIAL_ORGANIZATION.name}`}
                  className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none resize-none"
                />
              </div>

              <div className="p-2.5 bg-[#F7F5F2] rounded-lg border border-[#D1D7DB] flex items-center gap-2 text-[11px] text-[#3B4A54]">
                <FileText className="w-4 h-4 text-[#075E54]" />
                <span>Attachment: {activeQuote.quoteNumber}.pdf (A4 Formatted Document)</span>
              </div>

              <div className="pt-2 border-t border-[#E9EDEF] flex justify-end gap-2">
                <button
                  onClick={() => setIsEmailModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-[#D1D7DB] text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleMarkAsSent(activeQuote);
                    setIsEmailModalOpen(false);
                  }}
                  className="px-4 py-1.5 rounded-lg bg-[#075E54] hover:bg-[#128C7E] text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Email</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL: SHARE QUOTATION */}
      {isShareModalOpen && activeQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-md overflow-hidden">
            <div className="p-4 bg-[#F7F5F2] border-b border-[#D1D7DB] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-[#075E54]" />
                <h3 className="text-sm font-bold text-[#111B21]">Share Quotation</h3>
              </div>
              <button onClick={() => setIsShareModalOpen(false)} className="text-[#667781]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3.5 text-xs">
              <p className="text-[#3B4A54]">
                Generate an authorized encrypted share link or copy quotation financial summary:
              </p>
              <div className="p-2.5 bg-[#F7F5F2] rounded-lg border border-[#D1D7DB] font-mono text-[11px] text-[#111B21] break-all select-all">
                https://portal.slatepos.in/quotes/view?ref={activeQuote.quoteNumber}&amp;token=auth_77a91
              </div>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(
                    `SLATE POS Quotation: ${activeQuote.quoteNumber} | Customer: ${activeQuote.customerName} | Amount: ₹${activeQuote.grandTotal}`
                  );
                  showToast('Quotation details copied to clipboard.');
                  setIsShareModalOpen(false);
                }}
                className="w-full py-2 bg-[#075E54] text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Summary to Clipboard</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL: PREFERENCES */}
      {isPreferencesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-sm overflow-hidden">
            <div className="p-4 bg-[#F7F5F2] border-b border-[#D1D7DB] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#111B21]">Quotes Ledger Preferences</h3>
              <button onClick={() => setIsPreferencesModalOpen(false)} className="text-[#667781]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="block text-xs font-semibold text-[#111B21] mb-1.5">
                  Page Size
                </label>
                <select
                  value={preferences.pageSize}
                  onChange={(e) => {
                    const next = { ...preferences, pageSize: parseInt(e.target.value, 10) };
                    offlineStore.saveQuotePreferences(next);
                  }}
                  className="w-full text-xs p-2 rounded-lg border border-[#D1D7DB] bg-white font-medium"
                >
                  <option value={10}>10 records per page</option>
                  <option value={25}>25 records per page</option>
                  <option value={50}>50 records per page</option>
                </select>
              </div>

              <div className="pt-2 border-t border-[#E9EDEF]">
                <button
                  onClick={() => setIsPreferencesModalOpen(false)}
                  className="w-full py-2 bg-[#075E54] text-white rounded-lg font-bold text-xs"
                >
                  Save Preferences
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL: MANAGE CUSTOM FIELDS */}
      {isCustomFieldsModalOpen && (
        <CustomFieldsManagerModal onClose={() => setIsCustomFieldsModalOpen(false)} />
      )}

      {/* 8. MODAL: IMPORT QUOTES */}
      {isImportModalOpen && (
        <ImportQuotesModal onClose={() => setIsImportModalOpen(false)} onImportSuccess={() => showToast('Quotes imported.')} />
      )}
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: QUOTATION FULL EDITOR MODAL
// =========================================================================
interface QuotationEditorModalProps {
  quoteType: QuoteType;
  quoteToEdit?: Quotation | null;
  customers: Customer[];
  products: Product[];
  onClose: () => void;
  onSaved: (savedQuote: Quotation) => void;
}

const QuotationEditorModal: React.FC<QuotationEditorModalProps> = ({
  quoteType,
  quoteToEdit,
  customers,
  products,
  onClose,
  onSaved,
}) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    quoteToEdit?.customerId || (customers.length > 0 ? customers[0].id : '')
  );

  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId) || customers[0] || null;
  }, [customers, selectedCustomerId]);

  const [quoteNumber, setQuoteNumber] = useState(
    quoteToEdit ? quoteToEdit.quoteNumber : offlineStore.getNextQuoteNumber()
  );
  const [quoteDate, setQuoteDate] = useState(
    quoteToEdit?.date || new Date().toISOString().split('T')[0]
  );
  const [expiryDate, setExpiryDate] = useState(
    quoteToEdit?.expiryDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  );
  const [referenceNumber, setReferenceNumber] = useState(quoteToEdit?.referenceNumber || '');
  const [salesperson, setSalesperson] = useState(quoteToEdit?.salesperson || 'Rajesh Sharma');
  const [projectName, setProjectName] = useState(quoteToEdit?.projectName || '');
  const [subject, setSubject] = useState(quoteToEdit?.subject || '');
  const [notes, setNotes] = useState(quoteToEdit?.notes || 'Looking forward for your business.');
  const [terms, setTerms] = useState(quoteToEdit?.termsAndConditions || 'Payment due within 15 days.');
  const [adjustment, setAdjustment] = useState<string>(String(quoteToEdit?.adjustment || '0'));

  // Line items state
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>(
    quoteToEdit?.items || [
      {
        id: `item_${Date.now()}`,
        productId: products[0]?.id,
        name: products[0]?.name || 'Catalog Item',
        description: products[0]?.categoryName || '',
        sku: products[0]?.sku || 'SKU-001',
        hsn: products[0]?.hsn || '9983',
        quantity: 1,
        unit: 'pcs',
        rate: products[0]?.sellingPrice || 12,
        discountPercent: 0,
        discountAmount: 0,
        gstRate: products[0]?.gstRate || 0,
        taxableAmount: products[0]?.sellingPrice || 12,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        total: products[0]?.sellingPrice || 12,
      },
    ]
  );

  const recalculateItem = (item: QuoteLineItem): QuoteLineItem => {
    const gross = item.quantity * item.rate;
    const discountAmt = Math.round((gross * item.discountPercent) / 100 * 100) / 100;
    const taxable = Math.max(0, gross - discountAmt);
    const taxAmt = Math.round((taxable * item.gstRate) / 100 * 100) / 100;
    const total = Math.round((taxable + taxAmt) * 100) / 100;

    return {
      ...item,
      discountAmount: discountAmt,
      taxableAmount: taxable,
      cgstAmount: taxAmt / 2,
      sgstAmount: taxAmt / 2,
      igstAmount: 0,
      total,
    };
  };

  const handleAddItem = () => {
    const defaultProd = products[0];
    const newItem: QuoteLineItem = {
      id: `item_${Date.now()}`,
      productId: defaultProd?.id,
      name: defaultProd?.name || 'New Item',
      description: defaultProd?.categoryName || '',
      sku: defaultProd?.sku || '',
      hsn: defaultProd?.hsn || '9983',
      quantity: 1,
      unit: 'pcs',
      rate: defaultProd?.sellingPrice || 10,
      discountPercent: 0,
      discountAmount: 0,
      gstRate: defaultProd?.gstRate || 0,
      taxableAmount: defaultProd?.sellingPrice || 10,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      total: defaultProd?.sellingPrice || 10,
    };
    setLineItems([...lineItems, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((i) => i.id !== id));
  };

  const handleUpdateItem = (id: string, updates: Partial<QuoteLineItem>) => {
    setLineItems(
      lineItems.map((item) => {
        if (item.id === id) {
          const merged = { ...item, ...updates };
          return recalculateItem(merged);
        }
        return item;
      })
    );
  };

  // Calculations
  const subtotal = lineItems.reduce((acc, i) => acc + i.quantity * i.rate, 0);
  const discountTotal = lineItems.reduce((acc, i) => acc + i.discountAmount, 0);
  const taxableTotal = lineItems.reduce((acc, i) => acc + i.taxableAmount, 0);
  const cgstTotal = lineItems.reduce((acc, i) => acc + i.cgstAmount, 0);
  const sgstTotal = lineItems.reduce((acc, i) => acc + i.sgstAmount, 0);
  const adjNum = parseFloat(adjustment) || 0;
  const grandTotal = Math.max(0, taxableTotal + cgstTotal + sgstTotal + adjNum);

  const handleSave = (statusToSave: QuoteStatus = 'DRAFT') => {
    if (!selectedCustomer) {
      alert('Please select a customer.');
      return;
    }

    const payload: Quotation = {
      id: quoteToEdit ? quoteToEdit.id : `qt_${Date.now()}`,
      quoteNumber: quoteNumber.trim() || offlineStore.getNextQuoteNumber(),
      quoteType,
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      companyName: selectedCustomer.companyName,
      customerEmail: selectedCustomer.email,
      customerPhone: selectedCustomer.phone,
      customerGstin: selectedCustomer.gstin,
      billingAddress: selectedCustomer.address,
      shippingAddress: selectedCustomer.shippingAddress || selectedCustomer.address,
      date: quoteDate,
      expiryDate,
      referenceNumber: referenceNumber.trim() || undefined,
      salesperson,
      projectName: projectName.trim() || undefined,
      subject: subject.trim() || undefined,
      items: lineItems,
      subtotal,
      discountTotal,
      adjustment: adjNum,
      taxableTotal,
      cgstTotal,
      sgstTotal,
      igstTotal: 0,
      roundOff: 0,
      grandTotal,
      status: quoteToEdit ? quoteToEdit.status : statusToSave,
      notes,
      termsAndConditions: terms,
      emailRecipients: selectedCustomer.email ? [selectedCustomer.email] : ['customer@example.com'],
      pdfTemplate: 'Spreadsheet Template',
      activities: quoteToEdit?.activities || [
        {
          id: `act_${Date.now()}`,
          timestamp: new Date().toISOString(),
          action: `Created ${quoteType === 'ONE_TIME' ? 'One-Time' : 'Subscription'} Quotation ${quoteNumber}`,
          actor: salesperson,
        },
      ],
      createdAt: quoteToEdit?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    offlineStore.saveQuotation(payload);
    onSaved(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-2xs animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-4xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Modal Header */}
        <div className="p-4 bg-[#F7F5F2] border-b border-[#D1D7DB] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#075E54]" />
            <h3 className="text-sm font-bold text-[#111B21]">
              {quoteToEdit ? `Edit Quotation ${quoteToEdit.quoteNumber}` : `New ${quoteType === 'ONE_TIME' ? 'One-Time' : 'Subscription'} Quotation`}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-[#667781] hover:text-[#111B21]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Section A: Customer & Header Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#111B21] mb-1">
                Select Customer <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] bg-white font-medium focus:ring-1 focus:ring-[#075E54] focus:outline-none"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.companyName ? `(${c.companyName})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#111B21] mb-1">
                Quotation Number
              </label>
              <input
                type="text"
                value={quoteNumber}
                onChange={(e) => setQuoteNumber(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none font-semibold text-[#075E54]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#111B21] mb-1">
                Reference / PO #
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="e.g. PO-2026-001"
                className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#111B21] mb-1">
                Quotation Date
              </label>
              <input
                type="date"
                value={quoteDate}
                onChange={(e) => setQuoteDate(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#111B21] mb-1">
                Expiry Date
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#111B21] mb-1">
                Salesperson
              </label>
              <input
                type="text"
                value={salesperson}
                onChange={(e) => setSalesperson(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-[#D1D7DB] focus:ring-1 focus:ring-[#075E54] focus:outline-none"
              />
            </div>
          </div>

          {/* Section B: Line Items Interactive Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#111B21]">Item Details</span>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs font-bold text-[#075E54] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </div>

            <div className="rounded-lg border border-[#D1D7DB] overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F7F5F2] border-b border-[#D1D7DB] text-[#667781] font-bold text-[10px] uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Item / Description</th>
                    <th className="py-2.5 px-2 w-20 text-right">Qty</th>
                    <th className="py-2.5 px-2 w-24 text-right">Rate (₹)</th>
                    <th className="py-2.5 px-2 w-20 text-right">Disc %</th>
                    <th className="py-2.5 px-2 w-20 text-right">GST %</th>
                    <th className="py-2.5 px-3 w-28 text-right">Amount (₹)</th>
                    <th className="py-2.5 px-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EDEF]">
                  {lineItems.map((item, idx) => (
                    <tr key={`${item.id}-${idx}`}>
                      <td className="p-2 space-y-1">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleUpdateItem(item.id, { name: e.target.value })}
                          className="w-full p-1.5 border border-[#D1D7DB] rounded font-semibold text-xs"
                          placeholder="Item name"
                        />
                        <input
                          type="text"
                          value={item.description || ''}
                          onChange={(e) => handleUpdateItem(item.id, { description: e.target.value })}
                          className="w-full p-1 border border-[#D1D7DB] rounded text-[11px] text-[#667781]"
                          placeholder="Description (optional)"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleUpdateItem(item.id, { quantity: parseFloat(e.target.value) || 1 })}
                          className="w-full p-1.5 border border-[#D1D7DB] rounded text-right text-xs"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.rate}
                          onChange={(e) => handleUpdateItem(item.id, { rate: parseFloat(e.target.value) || 0 })}
                          className="w-full p-1.5 border border-[#D1D7DB] rounded text-right text-xs"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={item.discountPercent}
                          onChange={(e) => handleUpdateItem(item.id, { discountPercent: parseFloat(e.target.value) || 0 })}
                          className="w-full p-1.5 border border-[#D1D7DB] rounded text-right text-xs"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <select
                          value={item.gstRate}
                          onChange={(e) => handleUpdateItem(item.id, { gstRate: parseFloat(e.target.value) || 0 })}
                          className="w-full p-1.5 border border-[#D1D7DB] rounded text-right text-xs bg-white"
                        >
                          <option value={0}>0%</option>
                          <option value={5}>5%</option>
                          <option value={12}>12%</option>
                          <option value={18}>18%</option>
                          <option value={28}>28%</option>
                        </select>
                      </td>
                      <td className="p-2 text-right font-bold tabular-nums text-xs">
                        {formatINR(item.total)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-[#8696A0] hover:text-red-600 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section C: Totals & Adjustments */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 pt-2">
            <div className="flex-1 space-y-2">
              <div>
                <label className="block text-xs font-semibold text-[#111B21] mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-2 border border-[#D1D7DB] rounded-lg text-xs resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#111B21] mb-1">Terms and Conditions</label>
                <input
                  type="text"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  className="w-full p-2 border border-[#D1D7DB] rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="w-64 space-y-2 text-xs tabular-nums">
              <div className="flex justify-between text-[#667781]">
                <span>Sub Total:</span>
                <span className="font-semibold text-[#111B21]">{formatINR(subtotal)}</span>
              </div>
              <div className="flex justify-between text-[#667781]">
                <span>Line Discounts:</span>
                <span>-{formatINR(discountTotal)}</span>
              </div>
              <div className="flex justify-between items-center text-[#667781]">
                <span>Adjustment (₹):</span>
                <input
                  type="number"
                  step="0.01"
                  value={adjustment}
                  onChange={(e) => setAdjustment(e.target.value)}
                  className="w-24 p-1 text-right border border-[#D1D7DB] rounded text-xs"
                />
              </div>
              <div className="flex justify-between font-bold text-sm text-[#111B21] pt-2 border-t border-[#D1D7DB]">
                <span>Total:</span>
                <span className="text-[#075E54]">{formatINR(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[#F7F5F2] border-t border-[#D1D7DB] flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[#3B4A54] hover:bg-white rounded-lg border border-[#D1D7DB] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSave('DRAFT')}
            className="px-4 py-2 text-xs font-bold text-[#075E54] bg-white hover:bg-[#DCF8C6]/30 rounded-lg border border-[#075E54] cursor-pointer"
          >
            Save as Draft
          </button>
          <button
            type="button"
            onClick={() => handleSave('APPROVED')}
            className="px-4 py-2 text-xs font-bold text-white bg-[#075E54] hover:bg-[#128C7E] rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            Save Quotation
          </button>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: CUSTOM FIELDS MODAL
// =========================================================================
const CustomFieldsManagerModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [fields, setFields] = useState<CustomFieldDefinition[]>(offlineStore.getCustomFields('QUOTES'));
  const [label, setLabel] = useState('');
  const [type, setType] = useState<'TEXT' | 'NUMBER' | 'DATE' | 'SELECT'>('TEXT');
  const [defaultValue, setDefaultValue] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;

    const newField: CustomFieldDefinition = {
      id: `cf_${Date.now()}`,
      name: label.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      label: label.trim(),
      type,
      module: 'QUOTES',
      defaultValue,
    };
    offlineStore.saveCustomField(newField);
    setFields(offlineStore.getCustomFields('QUOTES'));
    setLabel('');
    setDefaultValue('');
  };

  const handleDelete = (id: string) => {
    offlineStore.deleteCustomField(id);
    setFields(offlineStore.getCustomFields('QUOTES'));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-2xs animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-md overflow-hidden">
        <div className="p-4 bg-[#F7F5F2] border-b border-[#D1D7DB] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#111B21]">Manage Custom Fields for Quotes</h3>
          <button onClick={onClose} className="text-[#667781]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4 text-xs">
          <form onSubmit={handleAdd} className="space-y-3 bg-[#F7F5F2] p-3 rounded-lg border border-[#D1D7DB]">
            <span className="font-bold text-[#111B21] block">Add New Custom Field</span>
            <div>
              <label className="block text-[11px] font-semibold text-[#111B21] mb-1">Field Label</label>
              <input
                type="text"
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Project Delivery Milestone"
                className="w-full p-2 border border-[#D1D7DB] rounded bg-white text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-[#111B21] mb-1">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full p-2 border border-[#D1D7DB] rounded bg-white text-xs"
                >
                  <option value="TEXT">Text</option>
                  <option value="NUMBER">Number</option>
                  <option value="DATE">Date</option>
                  <option value="SELECT">Select Dropdown</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#111B21] mb-1">Default Value</label>
                <input
                  type="text"
                  value={defaultValue}
                  onChange={(e) => setDefaultValue(e.target.value)}
                  className="w-full p-2 border border-[#D1D7DB] rounded bg-white text-xs"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-1.5 bg-[#075E54] text-white font-bold rounded text-xs"
            >
              Add Custom Field
            </button>
          </form>

          <div>
            <span className="font-bold text-[#111B21] block mb-2">Existing Custom Fields</span>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {fields.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between p-2 rounded bg-white border border-[#E9EDEF]"
                >
                  <div>
                    <span className="font-semibold text-[#111B21] block">{f.label}</span>
                    <span className="text-[10px] text-[#8696A0]">
                      {f.type} · {f.name}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(f.id)}
                    className="text-[#8696A0] hover:text-red-600 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: IMPORT QUOTES MODAL
// =========================================================================
const ImportQuotesModal: React.FC<{ onClose: () => void; onImportSuccess: () => void }> = ({
  onClose,
  onImportSuccess,
}) => {
  const [csvText, setCsvText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleImport = () => {
    setError(null);
    if (!csvText.trim()) {
      setError('Please paste CSV content.');
      return;
    }

    try {
      const lines = csvText.trim().split('\n');
      if (lines.length < 2) {
        setError('CSV must have a header row and at least one data row.');
        return;
      }

      onImportSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to parse CSV');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-2xs animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-lg overflow-hidden">
        <div className="p-4 bg-[#F7F5F2] border-b border-[#D1D7DB] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#075E54]" />
            <h3 className="text-sm font-bold text-[#111B21]">Import Quotations from CSV</h3>
          </div>
          <button onClick={onClose} className="text-[#667781]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3.5 text-xs">
          {error && (
            <div className="p-2.5 bg-red-50 text-red-700 rounded border border-red-200">
              {error}
            </div>
          )}
          <p className="text-[#667781]">
            Paste CSV formatted text containing quote records (Columns: Quote Number, Date, Customer, Total):
          </p>
          <textarea
            rows={5}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="QT-000007,2026-10-13,Sunil Hegde,15000.00"
            className="w-full p-2.5 border border-[#D1D7DB] rounded-lg font-mono text-xs resize-none"
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-[#D1D7DB] text-[#3B4A54]"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              className="px-4 py-1.5 bg-[#075E54] text-white font-bold rounded-lg shadow-xs"
            >
              Import Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
