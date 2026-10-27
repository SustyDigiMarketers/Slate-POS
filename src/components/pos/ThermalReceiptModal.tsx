/**
 * SLATE POS — Thermal Receipt Modal & Printing Engine
 * Supports configurable 58mm and 80mm paper, safe reprint without double-billing
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6)
 */

import React, { useState } from 'react';
import { Sale } from '../../types';
import { offlineStore } from '../../lib/offlineStore';
import { formatINR, formatDate } from '../../lib/formatters';
import { THEME } from '../../lib/theme';
import { Printer, Download, X, CheckCircle2, RotateCw } from 'lucide-react';

interface ThermalReceiptModalProps {
  sale: Sale;
  onClose: () => void;
  onNewSale: () => void;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  sale,
  onClose,
  onNewSale,
}) => {
  const printerConfig = offlineStore.getPrinterConfig();
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>(
    printerConfig.printerType === 'THERMAL_58MM' ? '58mm' : '80mm'
  );

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadText = () => {
    let content = `========================================\n`;
    content += `${printerConfig.storeHeader}\n`;
    content += `${printerConfig.addressLine}\n`;
    content += `${printerConfig.gstinLine}\n`;
    if (printerConfig.fssaiLine) content += `${printerConfig.fssaiLine}\n`;
    content += `========================================\n`;
    content += `Receipt: ${sale.receiptNumber}\n`;
    content += `Invoice: ${sale.invoiceNumber}\n`;
    content += `Date: ${formatDate(sale.createdAt, true)}\n`;
    content += `Cashier: ${sale.cashierName}\n`;
    if (sale.customerName) content += `Customer: ${sale.customerName}\n`;
    content += `----------------------------------------\n`;
    content += `ITEM              QTY   PRICE    TOTAL\n`;
    content += `----------------------------------------\n`;
    for (const it of sale.items) {
      const name = it.product.name.slice(0, 16).padEnd(16, ' ');
      const qty = String(it.quantity).padStart(3, ' ');
      const prc = String(it.unitPrice).padStart(7, ' ');
      const tot = String(it.total).padStart(8, ' ');
      content += `${name} ${qty} ${prc} ${tot}\n`;
    }
    content += `----------------------------------------\n`;
    content += `Subtotal: ₹${sale.subtotal}\n`;
    content += `CGST: ₹${sale.cgstTotal}  SGST: ₹${sale.sgstTotal}\n`;
    content += `Round Off: ₹${sale.roundOff}\n`;
    content += `GRAND TOTAL: ₹${sale.grandTotal}\n`;
    content += `Payment: ${sale.payments.map((p) => `${p.method}: ₹${p.amount}`).join(', ')}\n`;
    content += `========================================\n`;
    content += `${printerConfig.footerGreeting}\n`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt_${sale.receiptNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl border border-[#D1D7DB] w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Bar */}
        <div className="px-5 py-3.5 bg-[#075E54] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#DCF8C6]" />
            <div>
              <div className="text-sm font-bold">Transaction Committed</div>
              <div className="text-[11px] text-[#DCF8C6]/80 tabular-nums">
                {sale.receiptNumber} · {sale.isOfflineCreated ? 'Offline Cached' : 'Cloud Synced'}
              </div>
            </div>
          </div>

          {/* Paper Width Toggle */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[#054C44] p-0.5 rounded text-[11px] tabular-nums">
              <button
                onClick={() => setPaperWidth('58mm')}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  paperWidth === '58mm' ? 'bg-[#128C7E] text-white font-bold' : 'text-white/60 hover:text-white'
                }`}
              >
                58mm
              </button>
              <button
                onClick={() => setPaperWidth('80mm')}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  paperWidth === '80mm' ? 'bg-[#128C7E] text-white font-bold' : 'text-white/60 hover:text-white'
                }`}
              >
                80mm
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1 text-white/70 hover:text-white rounded hover:bg-[#128C7E] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Receipt Body (Paper Surface Simulation) */}
        <div className="p-6 overflow-y-auto bg-[#ECE5DD] flex justify-center">
          <div
            id="thermal-receipt-print-area"
            style={{ width: paperWidth === '58mm' ? '280px' : '360px' }}
            className="bg-white p-4 shadow-sm border border-[#D1D7DB] text-slate-900 text-[11px] leading-tight select-text transition-all"
          >
            {/* Store Branding Header */}
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-400">
              <div className="font-bold text-xs uppercase tracking-tight">{printerConfig.storeHeader}</div>
              <div className="text-[10px] text-slate-600">{printerConfig.addressLine}</div>
              <div className="text-[10px] text-slate-600">{printerConfig.phoneLine}</div>
              <div className="font-semibold text-[10px]">{printerConfig.gstinLine}</div>
              {printerConfig.fssaiLine && (
                <div className="text-[9px] text-slate-600">{printerConfig.fssaiLine}</div>
              )}
            </div>

            {/* Receipt Metadata */}
            <div className="py-2.5 border-b border-dashed border-slate-400 space-y-0.5 text-[10px]">
              <div className="flex justify-between">
                <span>Receipt:</span>
                <span className="font-bold tabular-nums">{sale.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Invoice:</span>
                <span className="tabular-nums">{sale.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Date &amp; Time:</span>
                <span className="tabular-nums">{formatDate(sale.createdAt, true)}</span>
              </div>
              <div className="flex justify-between">
                <span>Cashier:</span>
                <span>{sale.cashierName}</span>
              </div>
              {sale.customerName && (
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <span className="truncate max-w-[150px]">{sale.customerName}</span>
                </div>
              )}
            </div>

            {/* Itemized Table */}
            <div className="py-2.5 border-b border-dashed border-slate-400">
              <div className="flex justify-between font-bold pb-1 text-[10px] border-b border-slate-300">
                <span className="w-1/2">ITEM</span>
                <span className="w-1/6 text-right">QTY</span>
                <span className="w-1/6 text-right">RATE</span>
                <span className="w-1/6 text-right">AMT</span>
              </div>

              <div className="space-y-1.5 pt-1.5">
                {sale.items.map((item, idx) => (
                  <div key={idx} className="space-y-0.5 text-[10px]">
                    <div className="font-medium truncate">{item.product.name}</div>
                    <div className="flex justify-between text-slate-600 text-[9px]">
                      <span className="w-1/2">HSN: {item.product.hsn} · {item.product.gstRate}%</span>
                      <span className="w-1/6 text-right tabular-nums">{item.quantity}</span>
                      <span className="w-1/6 text-right tabular-nums">{formatINR(item.unitPrice)}</span>
                      <span className="w-1/6 text-right font-bold text-slate-900 tabular-nums">{formatINR(item.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[10px]">
              <div className="flex justify-between">
                <span>Subtotal (Net):</span>
                <span className="tabular-nums">{formatINR(sale.subtotal)}</span>
              </div>
              {sale.discountTotal > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount:</span>
                  <span className="tabular-nums">- {formatINR(sale.discountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>CGST:</span>
                <span className="tabular-nums">{formatINR(sale.cgstTotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>SGST:</span>
                <span className="tabular-nums">{formatINR(sale.sgstTotal)}</span>
              </div>
              {sale.roundOff !== 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>Round Off:</span>
                  <span className="tabular-nums">
                    {sale.roundOff > 0 ? `+${formatINR(sale.roundOff)}` : `-${formatINR(Math.abs(sale.roundOff))}`}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-xs font-bold pt-1 border-t border-slate-300">
                <span>GRAND TOTAL:</span>
                <span className="tabular-nums font-bold text-sm text-[#075E54]">{formatINR(sale.grandTotal)}</span>
              </div>
            </div>

            {/* Payment Mode Details */}
            <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[10px]">
              {sale.payments.map((p, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>Payment Mode: {p.method}</span>
                  <span className="font-bold tabular-nums">{formatINR(p.amount)}</span>
                </div>
              ))}
              {sale.payments.some((p) => p.changeReturned && p.changeReturned > 0) && (
                <div className="flex justify-between text-slate-600">
                  <span>Change Returned:</span>
                  <span className="tabular-nums">
                    ₹{sale.payments.find((p) => p.changeReturned)?.changeReturned}
                  </span>
                </div>
              )}
            </div>

            {/* Barcode & Footer Greeting */}
            <div className="pt-3 text-center space-y-2">
              {/* Simulated Thermal Barcode Graphic */}
              <div className="flex justify-center items-center gap-[2px] h-7 mx-auto overflow-hidden">
                {Array.from({ length: 42 }).map((_, i) => (
                  <div
                    key={i}
                    style={{ width: i % 3 === 0 ? '2px' : '1px' }}
                    className="h-full bg-slate-900"
                  />
                ))}
              </div>
              <div className="text-[9px] tracking-widest tabular-nums text-slate-600">
                *{sale.receiptNumber}*
              </div>
              <div className="text-[10px] text-slate-700 italic pt-1">
                {printerConfig.footerGreeting}
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls Bar */}
        <div className="px-5 py-3.5 bg-[#F7F5F2] border-t border-[#D1D7DB] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#075E54] hover:bg-[#128C7E] text-white rounded text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Thermal (Ctrl+P)</span>
            </button>

            <button
              onClick={handleDownloadText}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#ECE5DD] text-[#111B21] border border-[#D1D7DB] rounded text-xs font-medium transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Raw Text</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onNewSale}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#128C7E] hover:bg-[#075E54] text-white rounded text-xs font-bold transition-colors shadow-2xs cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Start Next Sale (F3)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
