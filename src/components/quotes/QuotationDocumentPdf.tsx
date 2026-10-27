/**
 * SLATE POS — Professional A4 Quotation & Invoice Printable Document
 * Designed to faithfully reproduce the uploaded Zoho Billing reference layout:
 * - Legal Company Header with contacts & GSTIN
 * - Bill To customer details
 * - Standard 5-column financial item table with descriptions and units
 * - Sub Total, Taxes, Adjustments, Grand Total, and Balance Due
 * - Amount in Words (Indian Rupee conventions)
 * - Notes & Terms and Conditions
 * - Payment options & Authorized Signature line
 * - Powered by Prontavle vector branding footer
 */

import React from 'react';
import { Quotation, Sale } from '../../types';
import { INITIAL_ORGANIZATION, INITIAL_BRANCHES } from '../../lib/initialData';
import { formatINR, formatDate, amountInWordsINR } from '../../lib/formatters';
import { Printer, Download, ArrowLeft } from 'lucide-react';

interface QuotationDocumentPdfProps {
  document: Quotation | Sale;
  type?: 'QUOTATION' | 'INVOICE';
  onBack?: () => void;
  showToolbar?: boolean;
}

export const QuotationDocumentPdf: React.FC<QuotationDocumentPdfProps> = ({
  document,
  type = 'QUOTATION',
  onBack,
  showToolbar = true,
}) => {
  const isQuote = type === 'QUOTATION' || 'quoteNumber' in document;
  const quote = isQuote ? (document as Quotation) : null;
  const sale = !isQuote ? (document as Sale) : null;

  const docNumber = quote ? quote.quoteNumber : sale ? sale.invoiceNumber : 'DOC-000001';
  const docTitle = isQuote ? 'QUOTATION' : 'TAX INVOICE';
  const docDate = quote ? quote.date : sale ? sale.createdAt.split('T')[0] : '2026-10-13';
  const dueDate = quote ? quote.expiryDate : sale ? sale.dueDate : '2026-10-28';
  const terms = quote ? (quote.termsAndConditions || 'Valid for 30 Days') : (sale?.termsAndConditions || 'Due on Receipt');

  const customerName = quote ? quote.customerName : sale ? (sale.customerName || 'Cash Customer') : '';
  const companyName = quote ? quote.companyName : sale ? sale.companyName : '';
  const customerAddress = quote ? (quote.billingAddress || quote.shippingAddress) : sale ? sale.billingAddress : '';
  const customerEmail = quote ? quote.customerEmail : sale ? sale.customerEmail : '';
  const customerPhone = quote ? quote.customerPhone : sale ? sale.customerPhone : '';
  const customerGstin = quote ? quote.customerGstin : sale ? sale.customerGstin : '';

  // Items normalized
  const lineItems = quote
    ? quote.items.map((i, idx) => ({
        sno: idx + 1,
        name: i.name,
        description: i.description,
        qty: i.quantity,
        unit: i.unit || 'pcs',
        rate: i.rate,
        amount: i.total,
      }))
    : sale
    ? sale.items.map((i, idx) => ({
        sno: idx + 1,
        name: i.product.name,
        description: i.product.sku,
        qty: i.quantity,
        unit: i.product.unit.toLowerCase(),
        rate: i.unitPrice,
        amount: i.total,
      }))
    : [];

  const subtotal = quote ? quote.subtotal : sale ? sale.subtotal : 0;
  const adjustment = quote ? quote.adjustment : 0;
  const grandTotal = quote ? quote.grandTotal : sale ? sale.grandTotal : 0;
  const balanceDue = isQuote ? grandTotal : sale ? (grandTotal - sale.payments.reduce((acc, p) => acc + p.amount, 0)) : grandTotal;
  const notes = quote?.notes || sale?.notes || 'Thanks for your business.';

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* Document Toolbar (Hidden when printing) */}
      {showToolbar && (
        <div className="no-print flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[#D1D7DB] shadow-2xs">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1.5 rounded-lg border border-[#D1D7DB] text-[#3B4A54] hover:bg-[#F7F5F2] cursor-pointer"
                title="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <span className="text-xs font-bold text-[#111B21]">
                Print Preview — {docTitle} {docNumber}
              </span>
              <span className="text-[11px] text-[#667781] block">
                Standard A4 Document Layout (8.27 × 11.69 inches)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              className="px-3 py-1.5 rounded-lg border border-[#075E54] text-[#075E54] hover:bg-[#DCF8C6]/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 rounded-lg bg-[#075E54] hover:bg-[#128C7E] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Document</span>
            </button>
          </div>
        </div>
      )}

      {/* Printable Sheet (Standard A4 White Surface) */}
      <div
        id="printable-quotation"
        className="bg-white mx-auto border border-[#D1D7DB] shadow-md p-8 sm:p-12 text-[#111B21] max-w-[800px] min-h-[1050px] flex flex-col justify-between font-['Poppins'] text-xs leading-relaxed print:m-0 print:p-8 print:border-none print:shadow-none print:max-w-none print:w-full"
      >
        <div>
          {/* 1. Header Grid: Organization Details & Document Title */}
          <div className="flex justify-between items-start gap-4 pb-6 border-b border-[#D1D7DB]">
            <div className="space-y-1 max-w-[340px]">
              <h2 className="text-base font-bold text-[#111B21] tracking-tight">
                {companyName && isQuote ? companyName : INITIAL_ORGANIZATION.tradeName}
              </h2>
              <div className="text-[11px] text-[#3B4A54] space-y-0.5">
                <p>Tamil Nadu, India</p>
                <p>Phone: 91-6383193254</p>
                <p>Email: santhosh.brandmgr@gmail.com</p>
                <p className="font-mono text-[10px]">GSTIN: {INITIAL_ORGANIZATION.gstin}</p>
              </div>
            </div>

            <div className="text-right">
              <h1 className="text-2xl font-bold tracking-tight text-[#111B21] uppercase">
                {docTitle}
              </h1>
              <div className="mt-2 text-[11px] space-y-0.5 tabular-nums text-[#3B4A54]">
                <p className="flex justify-end gap-2">
                  <span className="font-semibold text-[#667781]"># :</span>
                  <span className="font-bold text-[#111B21]">{docNumber}</span>
                </p>
                <p className="flex justify-end gap-2">
                  <span className="font-semibold text-[#667781]">{isQuote ? 'Quote Date :' : 'Invoice Date :'}</span>
                  <span>{formatDate(docDate)}</span>
                </p>
                <p className="flex justify-end gap-2">
                  <span className="font-semibold text-[#667781]">Terms :</span>
                  <span>{terms}</span>
                </p>
                <p className="flex justify-end gap-2">
                  <span className="font-semibold text-[#667781]">{isQuote ? 'Expiry Date :' : 'Due Date :'}</span>
                  <span>{formatDate(dueDate)}</span>
                </p>
              </div>
            </div>
          </div>

          {/* 2. Customer Bill To Section */}
          <div className="py-5 border-b border-[#D1D7DB]">
            <div className="text-[10px] font-bold text-[#667781] uppercase tracking-wider mb-1">
              Bill To
            </div>
            <div className="text-sm font-bold text-[#111B21] uppercase">
              {customerName}
            </div>
            {companyName && companyName !== customerName && (
              <div className="text-xs font-semibold text-[#3B4A54]">
                {companyName}
              </div>
            )}
            {customerAddress && (
              <div className="text-[11px] text-[#667781] mt-0.5">
                {customerAddress}
              </div>
            )}
            <div className="flex items-center gap-3 text-[11px] text-[#667781] mt-0.5">
              {customerEmail && <span>{customerEmail}</span>}
              {customerPhone && <span>· {customerPhone}</span>}
              {customerGstin && <span className="font-mono">· GSTIN: {customerGstin}</span>}
            </div>
          </div>

          {/* 3. Line Items Table */}
          <div className="py-4">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-[#111B21] text-[11px] font-bold text-[#111B21]">
                  <th className="py-2.5 px-2 w-8">#</th>
                  <th className="py-2.5 px-3">Item &amp; Description</th>
                  <th className="py-2.5 px-3 text-right w-20">Qty</th>
                  <th className="py-2.5 px-3 text-right w-24">Rate</th>
                  <th className="py-2.5 px-3 text-right w-28">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9EDEF]">
                {lineItems.map((item) => (
                  <tr key={item.sno}>
                    <td className="py-3 px-2 text-[#667781] tabular-nums align-top">
                      {item.sno}
                    </td>
                    <td className="py-3 px-3 align-top">
                      <div className="font-bold text-[#111B21]">{item.name}</div>
                      {item.description && (
                        <div className="text-[11px] text-[#667781] mt-0.5 leading-snug">
                          {item.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums align-top">
                      <div className="font-medium text-[#111B21]">{item.qty.toFixed(2)}</div>
                      <div className="text-[10px] text-[#8696A0]">{item.unit}</div>
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums align-top text-[#111B21]">
                      {item.rate.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums align-top font-semibold text-[#111B21]">
                      {item.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 4. Financial Totals & Amount In Words */}
          <div className="pt-4 border-t border-[#D1D7DB] flex flex-col sm:flex-row justify-between gap-6">
            {/* Left Column: Total In Words & Notes */}
            <div className="flex-1 space-y-4">
              <div>
                <span className="text-[10px] font-bold text-[#667781] uppercase tracking-wider block">
                  Total In Words
                </span>
                <p className="text-xs font-semibold text-[#111B21] italic mt-0.5">
                  {amountInWordsINR(grandTotal)}
                </p>
              </div>

              <div>
                <span className="text-[10px] font-bold text-[#667781] uppercase tracking-wider block">
                  Notes
                </span>
                <p className="text-xs text-[#3B4A54] mt-0.5">
                  {notes}
                </p>
              </div>

              <div>
                <span className="text-[10px] font-bold text-[#667781] uppercase tracking-wider block">
                  Payment Options
                </span>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-[#3B4A54]">
                  <div className="px-2 py-1 bg-[#F7F5F2] border border-[#D1D7DB] rounded font-medium">
                    UPI: 6383193254@okaxis
                  </div>
                  <div className="px-2 py-1 bg-[#F7F5F2] border border-[#D1D7DB] rounded font-medium">
                    NEFT / IMPS Available
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Financial Calculation Box */}
            <div className="w-full sm:w-64 space-y-1.5 text-xs text-[#3B4A54] tabular-nums">
              <div className="flex justify-between py-1">
                <span>Sub Total</span>
                <span className="font-semibold text-[#111B21]">{subtotal.toFixed(2)}</span>
              </div>

              {adjustment !== 0 && (
                <div className="flex justify-between py-1">
                  <span>Adjustment</span>
                  <span className="font-semibold text-[#111B21]">{adjustment.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between py-1.5 border-t border-b border-[#D1D7DB] font-bold text-sm text-[#111B21]">
                <span>Total</span>
                <span>{formatINR(grandTotal)}</span>
              </div>

              <div className="flex justify-between py-1 font-bold text-xs text-[#111B21]">
                <span>Balance Due</span>
                <span>{formatINR(balanceDue)}</span>
              </div>

              {/* Authorized Signature Box */}
              <div className="pt-8 text-center">
                <div className="border-t border-[#111B21] pt-1.5 text-[11px] font-semibold text-[#111B21]">
                  Authorized Signature
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Document Footer & Powered By Logo Branding */}
        <div className="pt-8 mt-12 border-t border-[#E9EDEF] flex items-center justify-between text-[10px] text-[#8696A0]">
          <div className="flex items-center gap-2">
            <span className="font-bold tracking-wider text-[#667781] uppercase text-[9px]">
              POWERED BY
            </span>
            <img
              src="/prontavle-logo.svg"
              alt="Prontavle"
              className="h-5 w-auto object-contain"
              onError={(e) => {
                // Fallback to inline text badge if SVG loading fails
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <div className="tabular-nums font-medium">
            Page 1 of 1
          </div>
        </div>
      </div>
    </div>
  );
};
