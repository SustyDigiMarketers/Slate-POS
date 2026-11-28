/**
 * SLATE POS — Auditable Bulk Updates & Master Data Import Module
 * Supports Excel/CSV templates, interactive column mapping, validation, duplicate detection,
 * downloadable error logs, approval confirmation for sensitive financial adjustments, and audit trail.
 */

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { offlineStore } from '../../lib/offlineStore';
import { BulkImportBatch, BulkImportEntityType } from '../../types';
import {
  FileUp,
  Download,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Table2,
  X,
} from 'lucide-react';

interface EntityTemplateDef {
  id: BulkImportEntityType;
  label: string;
  description: string;
  requiresApproval: boolean;
  columns: string[];
  sampleRow: Record<string, string | number>;
}

const ENTITY_TEMPLATES: EntityTemplateDef[] = [
  {
    id: 'CUSTOMERS',
    label: 'Customers',
    description: 'Bulk import customer accounting masters with GSTIN & credit limits.',
    requiresApproval: false,
    columns: ['name', 'companyName', 'phone', 'email', 'gstin', 'city', 'state', 'creditLimit'],
    sampleRow: {
      name: 'Kiran Traders',
      companyName: 'Kiran Retail LLP',
      phone: '9845011223',
      email: 'accounts@kirantraders.in',
      gstin: '29AABCK1234M1Z5',
      city: 'Bengaluru',
      state: 'Karnataka',
      creditLimit: 50000,
    },
  },
  {
    id: 'SUPPLIERS',
    label: 'Suppliers',
    description: 'Bulk import vendor / sundry creditor ledgers.',
    requiresApproval: false,
    columns: ['name', 'contactPerson', 'phone', 'email', 'gstin', 'city', 'state', 'openingBalance'],
    sampleRow: {
      name: 'Deccan Wholesale Pvt Ltd',
      contactPerson: 'Suresh Menon',
      phone: '9845099887',
      email: 'billing@deccanwholesale.in',
      gstin: '29AABCD5678N1Z2',
      city: 'Bengaluru',
      state: 'Karnataka',
      openingBalance: 0,
    },
  },
  {
    id: 'PRODUCTS',
    label: 'Products & Services',
    description: 'Bulk import SKUs, HSN codes, GST slabs, cost & selling prices.',
    requiresApproval: false,
    columns: ['sku', 'name', 'hsn', 'category', 'unit', 'costPrice', 'sellingPrice', 'gstRate', 'stock'],
    sampleRow: {
      sku: 'ELEC-LED-18W',
      name: 'LED Panel Light 18W Cool White',
      hsn: '9405',
      category: 'Lighting',
      unit: 'PCS',
      costPrice: 310,
      sellingPrice: 450,
      gstRate: 18,
      stock: 40,
    },
  },
  {
    id: 'OPENING_BALANCES',
    label: 'Opening Balances (GL Adjustment)',
    description: 'Posts a controlled Opening Balance adjustment journal entry. Never overwrites posted vouchers.',
    requiresApproval: true,
    columns: ['accountCode', 'debit', 'credit'],
    sampleRow: { accountCode: '1200', debit: 150000, credit: 0 },
  },
  {
    id: 'ACCOUNT_CLASSIFICATIONS',
    label: 'Account Classifications',
    description: 'Update Chart of Accounts grouping, tax flags, and descriptions.',
    requiresApproval: false,
    columns: ['accountCode', 'accountGroup', 'taxApplicable', 'description'],
    sampleRow: {
      accountCode: '5600',
      accountGroup: 'Operating Expenses',
      taxApplicable: 'true',
      description: 'Updated administrative expense group',
    },
  },
  {
    id: 'TAX_CLASSIFICATIONS',
    label: 'Tax Classifications (HSN / GST)',
    description: 'Bulk update product HSN codes and GST rates (0/5/12/18/28%).',
    requiresApproval: true,
    columns: ['sku', 'hsn', 'gstRate'],
    sampleRow: { sku: 'ELEC-LED-18W', hsn: '9405', gstRate: 18 },
  },
  {
    id: 'PRODUCT_PRICING',
    label: 'Product Pricing Updates',
    description: 'Bulk update selling and cost prices by SKU with approval control.',
    requiresApproval: true,
    columns: ['sku', 'costPrice', 'sellingPrice'],
    sampleRow: { sku: 'ELEC-LED-18W', costPrice: 325, sellingPrice: 475 },
  },
];

export const BulkUpdatesPage: React.FC = () => {
  const [batches, setBatches] = useState<BulkImportBatch[]>(offlineStore.getBulkImportBatches());
  const [selectedEntity, setSelectedEntity] = useState<BulkImportEntityType>('CUSTOMERS');
  const [fileName, setFileName] = useState<string>('');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [approvalChecked, setApprovalChecked] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setBatches(offlineStore.getBulkImportBatches());
    });
    return unsub;
  }, []);

  const templateDef = useMemo(
    () => ENTITY_TEMPLATES.find((t) => t.id === selectedEntity) || ENTITY_TEMPLATES[0],
    [selectedEntity]
  );

  const handleDownloadTemplate = (format: 'xlsx' | 'csv') => {
    const ws = XLSX.utils.json_to_sheet([templateDef.sampleRow], { header: templateDef.columns });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, templateDef.id);
    if (format === 'xlsx') {
      XLSX.writeFile(wb, `SLATE_POS_${templateDef.id}_Template.xlsx`);
    } else {
      XLSX.writeFile(wb, `SLATE_POS_${templateDef.id}_Template.csv`, { bookType: 'csv' });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFeedback(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { defval: '' });
        if (json.length === 0) {
          setFeedback({ type: 'error', text: 'Uploaded file contains no data rows.' });
          return;
        }
        const headers = Object.keys(json[0]);
        setRawHeaders(headers);
        setRawRows(json);

        // Auto-map matching column names (case-insensitive)
        const autoMap: Record<string, string> = {};
        templateDef.columns.forEach((col) => {
          const match = headers.find((h) => h.trim().toLowerCase() === col.toLowerCase());
          if (match) autoMap[col] = match;
        });
        setColumnMap(autoMap);
        setApprovalChecked(false);
      } catch (err: any) {
        setFeedback({ type: 'error', text: `Unable to parse file: ${err?.message || 'Invalid workbook'}` });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const mappedPreviewRows = useMemo(() => {
    return rawRows.map((raw) => {
      const mapped: Record<string, any> = {};
      templateDef.columns.forEach((col) => {
        const sourceCol = columnMap[col];
        mapped[col] = sourceCol ? raw[sourceCol] : raw[col];
      });
      return mapped;
    });
  }, [rawRows, columnMap, templateDef]);

  const handleCommitImport = () => {
    setFeedback(null);
    if (mappedPreviewRows.length === 0) {
      setFeedback({ type: 'error', text: 'Upload an Excel/CSV file first.' });
      return;
    }

    const res = offlineStore.commitBulkImportBatch({
      entityType: selectedEntity,
      fileName: fileName || `${selectedEntity}_import.xlsx`,
      rows: mappedPreviewRows,
      requiresApproval: templateDef.requiresApproval,
      approved: approvalChecked,
    });

    if (!res.success) {
      setFeedback({ type: 'error', text: res.error || 'Bulk import failed.' });
      return;
    }

    const b = res.batch!;
    setFeedback({
      type: 'success',
      text: `Import committed: ${b.importedRows} created, ${b.updatedRows} updated, ${b.skippedDuplicates} duplicates skipped, ${b.errorCount} row errors.`,
    });
    setRawRows([]);
    setRawHeaders([]);
    setFileName('');
    setApprovalChecked(false);
  };

  const handleDownloadErrors = (batch: BulkImportBatch) => {
    if (batch.errors.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(batch.errors);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Errors');
    XLSX.writeFile(wb, `Error_Report_${batch.entityType}_${batch.id}.csv`, { bookType: 'csv' });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="bg-white p-4 rounded-xl border border-[#D1D7DB] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[#111B21] flex items-center gap-2">
            <FileUp className="w-5 h-5 text-[#16587B]" />
            <span>Bulk Updates &amp; Controlled Data Import</span>
          </h1>
          <p className="text-xs text-[#667781] mt-0.5">
            Download validated Excel/CSV templates, map columns, detect duplicates, and commit auditable updates without overwriting posted transactions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleDownloadTemplate('xlsx')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#D1D7DB] bg-white hover:bg-[#FAF6EC] rounded-lg cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#16587B]" />
            <span>Excel Template</span>
          </button>
          <button
            onClick={() => handleDownloadTemplate('csv')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#D1D7DB] bg-white hover:bg-[#FAF6EC] rounded-lg cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#16587B]" />
            <span>CSV Template</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center justify-between px-4 py-3 rounded-lg border text-xs font-medium ${
            feedback.type === 'success'
              ? 'bg-[#84B3CE]/25 border-[#16587B]/30 text-[#16587B]'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="p-1 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Step 1: Select Operation & Upload */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 bg-white p-4 rounded-xl border border-[#D1D7DB] space-y-3">
          <h2 className="text-xs font-bold text-[#111B21] uppercase tracking-wider">1. Choose Bulk Update Target</h2>
          <div className="space-y-1.5">
            {ENTITY_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedEntity(t.id);
                  setRawRows([]);
                  setRawHeaders([]);
                  setFileName('');
                  setApprovalChecked(false);
                }}
                className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                  selectedEntity === t.id
                    ? 'bg-[#84B3CE]/25 border-[#16587B] text-[#16587B]'
                    : 'bg-white border-[#E9EDEF] text-[#111B21] hover:bg-[#FAF6EC]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">{t.label}</span>
                  {t.requiresApproval && (
                    <span className="text-[10px] font-semibold text-amber-700">Approval Required</span>
                  )}
                </div>
                <p className="text-[11px] text-[#667781] mt-0.5">{t.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 bg-white p-4 rounded-xl border border-[#D1D7DB] space-y-4">
          <h2 className="text-xs font-bold text-[#111B21] uppercase tracking-wider">
            2. Upload File, Map Columns &amp; Preview ({templateDef.label})
          </h2>

          <div className="p-4 border border-dashed border-[#16587B]/40 rounded-lg bg-[#FAF6EC]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-[#111B21]">
                {fileName ? `Loaded: ${fileName} (${rawRows.length} rows)` : 'Select .xlsx, .xls, or .csv workbook'}
              </div>
              <div className="text-[11px] text-[#667781] mt-0.5">
                Expected fields: {templateDef.columns.join(', ')}
              </div>
            </div>
            <label className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] text-xs font-semibold rounded-lg cursor-pointer shrink-0">
              <FileUp className="w-3.5 h-3.5" />
              <span>Choose File</span>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          {/* Column Mapping */}
          {rawHeaders.length > 0 && (
            <div className="space-y-3">
              <div className="text-[11px] font-bold text-[#54656F] uppercase">Column Mapping</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {templateDef.columns.map((col) => (
                  <div key={col} className="flex items-center gap-2 text-xs">
                    <span className="w-32 font-medium text-[#111B21] truncate">{col}</span>
                    <select
                      value={columnMap[col] || ''}
                      onChange={(e) => setColumnMap((prev) => ({ ...prev, [col]: e.target.value }))}
                      className="flex-1 px-2.5 py-1.5 border border-[#D1D7DB] rounded bg-white text-xs"
                    >
                      <option value="">-- Unmapped --</option>
                      {rawHeaders.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview Table (first 5 rows) */}
              <div className="border border-[#D1D7DB] rounded-lg overflow-x-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[#667781]">
                      {templateDef.columns.map((c) => (
                        <th key={c} className="px-2.5 py-2 font-semibold">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9EDEF]">
                    {mappedPreviewRows.slice(0, 5).map((r, idx) => (
                      <tr key={idx}>
                        {templateDef.columns.map((c) => (
                          <td key={c} className="px-2.5 py-1.5 text-[#111B21] whitespace-nowrap">
                            {String(r[c] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {templateDef.requiresApproval && (
                <label className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={approvalChecked}
                    onChange={(e) => setApprovalChecked(e.target.checked)}
                    className="mt-0.5 accent-[#16587B]"
                  />
                  <span>
                    <strong>Manager / Accountant Approval:</strong> I confirm this sensitive financial bulk update ({templateDef.label}) has been reviewed. Opening balance imports will post a balanced adjustment journal without altering historical posted vouchers.
                  </span>
                </label>
              )}

              <div className="flex justify-end">
                <button
                  onClick={handleCommitImport}
                  disabled={templateDef.requiresApproval && !approvalChecked}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] text-xs font-semibold rounded-lg disabled:opacity-40 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Validate &amp; Commit {rawRows.length} Rows</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Audit History of Bulk Batches */}
      <div className="bg-white rounded-xl border border-[#D1D7DB] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E9EDEF] flex items-center gap-2">
          <Table2 className="w-4 h-4 text-[#16587B]" />
          <h2 className="text-xs font-bold text-[#111B21]">Bulk Import History &amp; Audit Log</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[11px] font-semibold text-[#667781] uppercase">
                <th className="px-4 py-2.5">Timestamp</th>
                <th className="px-4 py-2.5">Target</th>
                <th className="px-4 py-2.5">File</th>
                <th className="px-4 py-2.5 text-right">Created</th>
                <th className="px-4 py-2.5 text-right">Updated</th>
                <th className="px-4 py-2.5 text-right">Duplicates</th>
                <th className="px-4 py-2.5 text-right">Errors</th>
                <th className="px-4 py-2.5">Performed By</th>
                <th className="px-4 py-2.5 text-right">Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9EDEF]">
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-[#667781]">
                    No bulk update batches have been executed yet.
                  </td>
                </tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.id} className="hover:bg-[#FAF6EC]/60">
                    <td className="px-4 py-2.5 tabular-nums text-[#54656F]">
                      {new Date(b.createdAt).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-[#16587B]">{b.entityType.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5 text-[#111B21]">{b.fileName}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#16587B]">{b.importedRows}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{b.updatedRows}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#667781]">{b.skippedDuplicates}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-rose-700">{b.errorCount}</td>
                    <td className="px-4 py-2.5 text-[#54656F]">{b.performedByName}</td>
                    <td className="px-4 py-2.5 text-right">
                      {b.errorCount > 0 ? (
                        <button
                          onClick={() => handleDownloadErrors(b)}
                          className="text-[11px] font-semibold text-rose-700 hover:underline cursor-pointer"
                        >
                          Download Errors
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#16587B] font-semibold">Clean</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
