/**
 * SLATE POS — Hardware & Thermal Printer Settings
 * Configurable 58mm / 80mm thermal receipt printing, cash drawer kick, and legal headers
 * Styled with SLATE POS Theme (#16587B / #84B3CE / #F5EEDD)
 */

import React, { useState } from 'react';
import { HardwarePrinterConfig } from '../../types';
import { offlineStore } from '../../lib/offlineStore';
import { THEME } from '../../lib/theme';
import { Printer, Save, CheckCircle, Sliders, Receipt } from 'lucide-react';

export const HardwareSettings: React.FC = () => {
  const initialConfig = offlineStore.getPrinterConfig();
  const [config, setConfig] = useState<HardwarePrinterConfig>(initialConfig);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    offlineStore.updatePrinterConfig(config);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handlePrintTest = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-[#D1D7DB] shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-[#111B21] flex items-center gap-2">
            <span>Hardware &amp; POS Thermal Printer</span>
          </h1>
          <p className="text-xs text-[#667781] mt-0.5">
            Configure ESC/POS thermal printers, receipt dimensions, store headers, and cash drawer triggers.
          </p>
        </div>

        <button
          onClick={handlePrintTest}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-[#16587B] bg-[#FAF6EC] hover:bg-[#F5EEDD] border border-[#16587B] rounded-md transition-colors cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Print Test Slip</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="bg-white p-6 rounded-lg border border-[#D1D7DB] shadow-2xs space-y-5 text-xs">
        {/* Paper Size Option */}
        <div>
          <label className="font-bold text-[#111B21] block mb-2">Thermal Paper Width Format</label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'THERMAL_80MM', label: '80 mm (Standard POS Roll)', desc: 'Best for supermarkets & electronics' },
              { id: 'THERMAL_58MM', label: '58 mm (Compact Roll)', desc: 'Ideal for small cafes & kiosk counters' },
              { id: 'STANDARD_A4', label: 'A4 Tax Invoice Sheet', desc: 'Full-page B2B tax invoice delivery' },
            ].map((opt) => (
              <label
                key={opt.id}
                className={`p-3.5 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                  config.printerType === opt.id
                    ? 'border-[#16587B] bg-[#84B3CE]/20 ring-1 ring-[#16587B]'
                    : 'border-[#D1D7DB] hover:border-[#84B3CE]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-[#111B21]">{opt.label}</span>
                  <input
                    type="radio"
                    name="printerType"
                    checked={config.printerType === opt.id}
                    onChange={() => setConfig({ ...config, printerType: opt.id as any })}
                    className="text-[#16587B] accent-[#16587B]"
                  />
                </div>
                <span className="text-[11px] text-[#667781]">{opt.desc}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Store Header Details */}
        <div className="pt-3 border-t border-[#E9EDEF] space-y-3.5">
          <h2 className="font-bold text-[#111B21]">Receipt Header &amp; Compliance Details</h2>

          <div>
            <label className="font-semibold text-[#111B21] block mb-1">Store / Business Header Title</label>
            <input
              type="text"
              required
              value={config.storeHeader}
              onChange={(e) => setConfig({ ...config, storeHeader: e.target.value })}
              className="w-full px-3 py-1.5 border border-[#D1D7DB] rounded focus:border-[#16587B] outline-none font-bold"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-[#111B21] block mb-1">Address Line</label>
              <input
                type="text"
                value={config.addressLine}
                onChange={(e) => setConfig({ ...config, addressLine: e.target.value })}
                className="w-full px-3 py-1.5 border border-[#D1D7DB] rounded focus:border-[#16587B] outline-none"
              />
            </div>
            <div>
              <label className="font-semibold text-[#111B21] block mb-1">Phone Line</label>
              <input
                type="text"
                value={config.phoneLine}
                onChange={(e) => setConfig({ ...config, phoneLine: e.target.value })}
                className="w-full px-3 py-1.5 border border-[#D1D7DB] rounded focus:border-[#16587B] outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-[#111B21] block mb-1">GSTIN Display Line</label>
              <input
                type="text"
                value={config.gstinLine}
                onChange={(e) => setConfig({ ...config, gstinLine: e.target.value })}
                className="w-full px-3 py-1.5 tabular-nums border border-[#D1D7DB] rounded focus:border-[#16587B] outline-none"
              />
            </div>
            <div>
              <label className="font-semibold text-[#111B21] block mb-1">FSSAI License Display Line (Food/Beverages)</label>
              <input
                type="text"
                value={config.fssaiLine || ''}
                onChange={(e) => setConfig({ ...config, fssaiLine: e.target.value })}
                className="w-full px-3 py-1.5 tabular-nums border border-[#D1D7DB] rounded focus:border-[#16587B] outline-none"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-[#111B21] block mb-1">Footer Greeting / Terms</label>
            <input
              type="text"
              value={config.footerGreeting}
              onChange={(e) => setConfig({ ...config, footerGreeting: e.target.value })}
              className="w-full px-3 py-1.5 border border-[#D1D7DB] rounded focus:border-[#16587B] outline-none italic"
            />
          </div>
        </div>

        {/* Hardware Control Flags */}
        <div className="pt-3 border-t border-[#E9EDEF] space-y-2.5">
          <h2 className="font-bold text-[#111B21]">Hardware &amp; ESC/POS Peripherals</h2>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="kickDrawer"
              checked={config.kickCashDrawer}
              onChange={(e) => setConfig({ ...config, kickCashDrawer: e.target.checked })}
              className="rounded text-[#16587B] accent-[#16587B]"
            />
            <label htmlFor="kickDrawer" className="text-[#111B21]">
              Trigger RJ11 Cash Drawer Kick pulse on Cash sales
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="cutPaper"
              checked={config.autoCutPaper}
              onChange={(e) => setConfig({ ...config, autoCutPaper: e.target.checked })}
              className="rounded text-[#16587B] accent-[#16587B]"
            />
            <label htmlFor="cutPaper" className="text-[#111B21]">
              Send Auto-Cut Paper command after receipt print
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showHsn"
              checked={config.showHsnSummary}
              onChange={(e) => setConfig({ ...config, showHsnSummary: e.target.checked })}
              className="rounded text-[#16587B] accent-[#16587B]"
            />
            <label htmlFor="showHsn" className="text-[#111B21]">
              Print HSN breakdown and CGST/SGST tax slabs on receipt
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E9EDEF]">
          {savedSuccess && (
            <span className="text-xs text-[#16587B] flex items-center gap-1 font-bold">
              <CheckCircle className="w-4 h-4" /> Configuration saved!
            </span>
          )}
          <button
            type="submit"
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-[#16587B] hover:bg-[#124866] rounded-md transition-colors shadow-2xs cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save Printer Configuration</span>
          </button>
        </div>
      </form>
    </div>
  );
};
