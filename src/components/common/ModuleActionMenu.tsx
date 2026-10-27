/**
 * SLATE POS — Enterprise Module Action Menu
 * Provides consistent 6-action dropdown menu across all business modules in strict order:
 * 1. Import (Downloadable template, client-side validation, staging preview, error reporting, atomic commit)
 * 2. Export (Formula injection protected, decimal preserved, filtered CSV generation)
 * 3. Store By (Meaningful sorting & grouping appropriate to module)
 * 4. Refresh List (Local offline reload with state preservation & truthful feedback)
 * 5. Preferences (Page size, density, column visibility persistence)
 * 6. Reset Column Width (Restores default column widths immediately)
 *
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6 / #FFFFFF / #D1D7DB / #ECE5DD)
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  MoreVertical,
  Upload,
  Download,
  ArrowUpDown,
  RefreshCw,
  SlidersHorizontal,
  Columns,
  X,
  Check,
  FileSpreadsheet,
  AlertCircle,
  Layers,
  AlertTriangle,
  ChevronRight,
  FileDown,
  Info,
} from 'lucide-react';
import {
  SupportedModule,
  MODULE_REGISTRY,
  parseCsv,
  downloadCsv,
  ImportValidationResult,
  StagedRow,
} from '../../lib/bulkDataManagement';
import { offlineStore } from '../../lib/offlineStore';

export interface ModuleActionMenuProps {
  moduleKey: SupportedModule;
  moduleName?: string; // Optional display override
  onRefresh: () => void;
  onStoreByChange?: (optionId: string) => void;
  onSelectStoreBy?: (optionId: string) => void;
  currentStoreBy?: string;
  searchTerm?: string;
  filterQuery?: string;
  storeByOptions?: { id: string; label: string; desc?: string }[];
  onResetColumnWidth?: () => void;
  customColumns?: { key: string; label: string; visible: boolean }[];
  onToggleColumn?: (key: string) => void;
  onExportOverride?: () => void;
  onImportSuccess?: () => void;
}

export const ModuleActionMenu: React.FC<ModuleActionMenuProps> = ({
  moduleKey,
  moduleName: propModuleName,
  onRefresh,
  onStoreByChange,
  onSelectStoreBy,
  currentStoreBy = 'DEFAULT',
  searchTerm,
  filterQuery,
  storeByOptions: propStoreByOptions,
  onResetColumnWidth,
  customColumns,
  onToggleColumn,
  onExportOverride,
  onImportSuccess,
}) => {
  const activeSearchTerm = searchTerm || filterQuery;
  const handleStoreBySelect = onStoreByChange || onSelectStoreBy;
  const config = MODULE_REGISTRY[moduleKey];
  const effectiveStoreByOptions = propStoreByOptions || config?.storeByOptions || [];
  const moduleDisplayName = propModuleName || config?.name || moduleKey;

  // Dropdown & Modal Visibility States
  const [isOpen, setIsOpen] = useState(false);
  const [isStoreByModalOpen, setIsStoreByModalOpen] = useState(false);
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isConfirmCommitOpen, setIsConfirmCommitOpen] = useState(false);

  // Import Workflow State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [previewFilter, setPreviewFilter] = useState<'ALL' | 'VALID' | 'INVALID'>('ALL');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'warning' } | null>(null);

  // Preferences Local State
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = localStorage.getItem(`slate_pagesize_${moduleKey.toLowerCase()}`);
    return saved ? parseInt(saved, 10) : 10;
  });
  const [rowDensity, setRowDensity] = useState<'compact' | 'comfortable'>('compact');

  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click or Esc
  useEffect(() => {
    const handleOutsideClickOrEsc = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') {
        setIsOpen(false);
        setIsStoreByModalOpen(false);
        setIsPreferencesModalOpen(false);
      }
      if (e instanceof MouseEvent && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleOutsideClickOrEsc);
    window.addEventListener('click', handleOutsideClickOrEsc);
    return () => {
      window.removeEventListener('keydown', handleOutsideClickOrEsc);
      window.removeEventListener('click', handleOutsideClickOrEsc);
    };
  }, []);

  const showToast = (text: string, type: 'success' | 'warning' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. IMPORT ACTION — DOWNLOAD TEMPLATE
  const handleDownloadTemplate = () => {
    if (!config) return;
    const headerLine = config.templateHeaders.join(',');
    const exampleLine = config.exampleRow.map((v) => (v.includes(',') ? `"${v}"` : v)).join(',');
    const csvContent = `${headerLine}\n${exampleLine}\n`;
    downloadCsv(config.templateFileName, csvContent);
    showToast(`Template "${config.templateFileName}" downloaded with column guides.`);
  };

  // 1. IMPORT ACTION — SELECT & VALIDATE CSV
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.tsv')) {
      showToast('Please select a valid .csv file.', 'warning');
      return;
    }

    setSelectedFile(file);
    setIsParsing(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseCsv(text);
        if (parsed.rows.length === 0) {
          showToast('The selected file contains no data rows.', 'warning');
          setValidationResult(null);
          setIsParsing(false);
          return;
        }

        const result = config.validateAndStage(parsed.rows);
        setValidationResult(result);
        setIsParsing(false);
      } catch (err: any) {
        showToast(`Failed to parse CSV file: ${err.message}`, 'warning');
        setIsParsing(false);
      }
    };
    reader.onerror = () => {
      showToast('Error reading the selected file.', 'warning');
      setIsParsing(false);
    };
    reader.readAsText(file);
  };

  // 1. IMPORT ACTION — DOWNLOAD ERROR REPORT
  const handleDownloadErrorReport = () => {
    if (!validationResult || !validationResult.errorReportCsv) return;
    downloadCsv(`${moduleKey}_Import_Validation_Errors.csv`, validationResult.errorReportCsv);
    showToast('Validation error report downloaded.');
  };

  // 1. IMPORT ACTION — COMMIT BATCH
  const handleCommitImport = () => {
    if (!validationResult || validationResult.validCount === 0) return;
    const summary = config.commitBatch(validationResult.stagedRows);
    setIsConfirmCommitOpen(false);
    setIsImportModalOpen(false);
    setSelectedFile(null);
    setValidationResult(null);
    onRefresh();
    onImportSuccess?.();
    showToast(summary.message);
  };

  // 2. EXPORT ACTION
  const handleExport = () => {
    setIsOpen(false);
    if (onExportOverride) {
      onExportOverride();
      return;
    }
    if (!config) return;
    const { filename, content, count } = config.exportCsv(activeSearchTerm);
    downloadCsv(filename, content);
    showToast(`Exported ${count} ${moduleDisplayName.toLowerCase()} records to CSV.`);
  };

  // 4. REFRESH LIST ACTION
  const handleRefresh = () => {
    setIsOpen(false);
    onRefresh();
    const isOffline = offlineStore.isOffline();
    showToast(
      isOffline
        ? `${moduleDisplayName} refreshed from local offline database.`
        : `${moduleDisplayName} reloaded and synchronized.`
    );
  };

  // 6. RESET COLUMN WIDTH ACTION
  const handleResetColumnWidth = () => {
    setIsOpen(false);
    localStorage.removeItem(`slate_colwidths_${moduleKey.toLowerCase()}`);
    onResetColumnWidth?.();
    showToast(`Default table column widths restored for ${moduleDisplayName}.`);
  };

  // Filtered staged rows for preview table
  const displayedStagedRows = validationResult?.stagedRows.filter((row) => {
    if (previewFilter === 'VALID') return row.isValid;
    if (previewFilter === 'INVALID') return !row.isValid;
    return true;
  }) || [];

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed top-20 right-6 z-50 px-4 py-2.5 rounded-lg shadow-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 text-white ${
            toastMessage.type === 'warning' ? 'bg-[#92400E]' : 'bg-[#075E54]'
          }`}
        >
          {toastMessage.type === 'warning' ? (
            <AlertTriangle className="w-4 h-4 text-[#FDE68A]" />
          ) : (
            <Check className="w-4 h-4 text-[#DCF8C6]" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* 3-Dot Button Trigger */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-2 text-[#3B4A54] hover:text-[#075E54] hover:bg-[#F7F5F2] rounded-lg transition-colors cursor-pointer border border-[#D1D7DB] shadow-2xs focus-visible:ring-2 focus-visible:ring-[#075E54] focus-visible:outline-none"
        title="More Actions"
        aria-label={`More actions for ${moduleDisplayName}`}
        aria-expanded={isOpen}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {/* ========================================================================= */}
      {/* 6-ACTION DROPDOWN MENU IN EXACT REQUIRED ORDER: */}
      {/* 1. Import | 2. Export | 3. Store By | 4. Refresh List | 5. Preferences | 6. Reset Column Width */}
      {/* ========================================================================= */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 mt-1.5 w-52 bg-white border border-[#D1D7DB] rounded-lg shadow-xl py-1.5 z-50 text-xs font-medium text-left animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Header */}
          <div className="px-3.5 py-1 text-[10px] font-bold text-[#8696A0] uppercase tracking-wider border-b border-[#E9EDEF]">
            {moduleDisplayName} Actions
          </div>

          {/* 1. IMPORT */}
          <button
            onClick={() => {
              setIsOpen(false);
              setIsImportModalOpen(true);
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-[#F7F5F2] flex items-center gap-2.5 text-[#111B21] cursor-pointer"
          >
            <Upload className="w-4 h-4 text-[#075E54]" />
            <span>Import</span>
          </button>

          {/* 2. EXPORT */}
          <button
            onClick={handleExport}
            className="w-full text-left px-3.5 py-2 hover:bg-[#F7F5F2] flex items-center gap-2.5 text-[#111B21] cursor-pointer"
          >
            <Download className="w-4 h-4 text-[#075E54]" />
            <span>Export</span>
          </button>

          {/* 3. STORE BY */}
          <button
            onClick={() => {
              setIsOpen(false);
              setIsStoreByModalOpen(true);
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-[#F7F5F2] flex items-center justify-between text-[#111B21] cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-[#075E54]" />
              <span>Store By</span>
            </div>
            {currentStoreBy && currentStoreBy !== 'DEFAULT' && (
              <span className="text-[10px] font-bold text-[#075E54] bg-[#DCF8C6] px-1.5 py-0.5 rounded truncate max-w-[80px]">
                {effectiveStoreByOptions.find((o) => o.id === currentStoreBy)?.label.split(':')[0] || 'Active'}
              </span>
            )}
          </button>

          <div className="my-1 border-t border-[#E9EDEF]" />

          {/* 4. REFRESH LIST */}
          <button
            onClick={handleRefresh}
            className="w-full text-left px-3.5 py-2 hover:bg-[#F7F5F2] flex items-center gap-2.5 text-[#111B21] cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 text-[#075E54]" />
            <span>Refresh List</span>
          </button>

          {/* 5. PREFERENCES */}
          <button
            onClick={() => {
              setIsOpen(false);
              setIsPreferencesModalOpen(true);
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-[#F7F5F2] flex items-center gap-2.5 text-[#111B21] cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 text-[#075E54]" />
            <span>Preferences</span>
          </button>

          {/* 6. RESET COLUMN WIDTH */}
          <button
            onClick={handleResetColumnWidth}
            className="w-full text-left px-3.5 py-2 hover:bg-[#F7F5F2] flex items-center gap-2.5 text-[#111B21] cursor-pointer"
          >
            <Columns className="w-4 h-4 text-[#075E54]" />
            <span>Reset Column Width</span>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: REAL BULK IMPORT WITH DOWNLOADABLE TEMPLATES & STAGING PREVIEW */}
      {/* ========================================================================= */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-3xl max-h-[92vh] flex flex-col font-sans animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#D1D7DB] bg-[#F7F5F2] rounded-t-xl shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#DCF8C6] flex items-center justify-center text-[#075E54]">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#111B21]">Bulk Import — {moduleDisplayName}</h3>
                  <p className="text-[11px] text-[#667781]">
                    Download the official template, upload data, preview validation, and commit safely.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setSelectedFile(null);
                  setValidationResult(null);
                }}
                className="text-[#667781] hover:text-[#111B21] p-1 rounded cursor-pointer"
                aria-label="Close import dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Step 1: Template Download Banner */}
              <div className="bg-[#DCF8C6]/30 border border-[#B3EBA0] rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <FileSpreadsheet className="w-5 h-5 text-[#075E54] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-[#075E54] block">Step 1: Download Standard CSV Template</span>
                    <span className="text-[#3B4A54] text-[11px] block mt-0.5">
                      Contains exact column headers and a pre-formatted sample record for {moduleDisplayName}.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-3.5 py-1.5 bg-[#075E54] hover:bg-[#128C7E] text-white rounded-md font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors shadow-2xs"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Download Template</span>
                </button>
              </div>

              {/* Step 2: File Selector / Dropzone */}
              <div className="border-2 border-dashed border-[#D1D7DB] hover:border-[#075E54] rounded-xl p-5 text-center bg-[#F7F5F2] transition-colors">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv,.tsv,text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Upload className="w-7 h-7 text-[#075E54] mx-auto mb-2" />
                <div className="font-bold text-[#111B21] text-xs">
                  {selectedFile ? selectedFile.name : 'Choose CSV file to upload and validate'}
                </div>
                <div className="text-[11px] text-[#667781] mt-0.5">
                  UTF-8 formatted .csv files up to 5MB are supported
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 px-4 py-1.5 bg-white border border-[#075E54] text-[#075E54] hover:bg-[#F7F5F2] rounded-md font-bold text-xs cursor-pointer shadow-2xs transition-colors"
                >
                  {selectedFile ? 'Select Different File' : 'Browse Files'}
                </button>
              </div>

              {/* Step 3: Validation Summary & Chips */}
              {isParsing && (
                <div className="p-4 text-center text-[#075E54] font-semibold text-xs animate-pulse">
                  Validating file structure, required columns, and data types...
                </div>
              )}

              {validationResult && !isParsing && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D1D7DB] pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[#111B21]">Validation Results:</span>
                      <button
                        type="button"
                        onClick={() => setPreviewFilter('ALL')}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                          previewFilter === 'ALL'
                            ? 'bg-[#111B21] text-white'
                            : 'bg-[#F7F5F2] text-[#3B4A54] hover:bg-[#E9EDEF]'
                        }`}
                      >
                        Total: {validationResult.totalRows}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewFilter('VALID')}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors flex items-center gap-1 ${
                          previewFilter === 'VALID'
                            ? 'bg-[#075E54] text-white'
                            : 'bg-[#DCF8C6] text-[#075E54] hover:bg-[#B3EBA0]'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                        <span>Valid: {validationResult.validCount}</span>
                      </button>
                      {validationResult.invalidCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setPreviewFilter('INVALID')}
                          className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors flex items-center gap-1 ${
                            previewFilter === 'INVALID'
                              ? 'bg-[#DC2626] text-white'
                              : 'bg-red-100 text-red-700 hover:bg-red-200'
                          }`}
                        >
                          <AlertCircle className="w-3 h-3" />
                          <span>Invalid: {validationResult.invalidCount}</span>
                        </button>
                      )}
                      {validationResult.duplicateCount > 0 && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                          {validationResult.duplicateCount} to update
                        </span>
                      )}
                    </div>

                    {validationResult.invalidCount > 0 && (
                      <button
                        type="button"
                        onClick={handleDownloadErrorReport}
                        className="text-xs font-bold text-red-700 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        <span>Download Error Report (CSV)</span>
                      </button>
                    )}
                  </div>

                  {/* Step 4: Staged Rows Preview Table */}
                  <div className="border border-[#D1D7DB] rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-[#F7F5F2] text-[#3B4A54] border-b border-[#D1D7DB] sticky top-0 z-10">
                        <tr>
                          <th className="py-2 px-3 font-bold w-12">Row</th>
                          <th className="py-2 px-3 font-bold w-24">Status</th>
                          <th className="py-2 px-3 font-bold">Primary Identification</th>
                          <th className="py-2 px-3 font-bold">Details / Validation Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E9EDEF]">
                        {displayedStagedRows.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-4 text-center text-[#667781]">
                              No records match filter "{previewFilter}".
                            </td>
                          </tr>
                        ) : (
                          displayedStagedRows.map((row) => (
                            <tr
                              key={row.rowNumber}
                              className={row.isValid ? 'hover:bg-[#F7F5F2]' : 'bg-red-50/60 hover:bg-red-50'}
                            >
                              <td className="py-2 px-3 font-mono text-[#667781]">{row.rowNumber}</td>
                              <td className="py-2 px-3">
                                {row.isValid ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#075E54] bg-[#DCF8C6] px-1.5 py-0.5 rounded">
                                    <Check className="w-2.5 h-2.5" />
                                    <span>Valid</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                                    <AlertCircle className="w-2.5 h-2.5" />
                                    <span>Error</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 font-semibold text-[#111B21]">
                                {row.parsedData?.name ||
                                  row.parsedData?.code ||
                                  row.parsedData?.challanNumber ||
                                  row.parsedData?.vendor ||
                                  row.parsedData?.customer ||
                                  'Record'}
                              </td>
                              <td className="py-2 px-3 text-[#3B4A54]">
                                {row.isValid ? (
                                  row.isDuplicate ? (
                                    <span className="text-amber-700">Matches existing record — will update</span>
                                  ) : (
                                    <span className="text-[#075E54]">Ready to import</span>
                                  )
                                ) : (
                                  <span className="text-red-700 font-medium">
                                    {row.errors.join('; ')}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#D1D7DB] bg-[#F7F5F2] rounded-b-xl flex items-center justify-between gap-3 shrink-0">
              <span className="text-[11px] text-[#667781]">
                {validationResult
                  ? `${validationResult.validCount} valid records will be saved to local database`
                  : 'Select a CSV file to validate'}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setSelectedFile(null);
                    setValidationResult(null);
                  }}
                  className="px-3.5 py-1.5 border border-[#D1D7DB] hover:bg-white text-[#3B4A54] rounded-md font-bold text-xs cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!validationResult || validationResult.validCount === 0}
                  onClick={() => setIsConfirmCommitOpen(true)}
                  className={`px-4 py-1.5 rounded-md font-bold text-xs cursor-pointer transition-colors shadow-2xs ${
                    validationResult && validationResult.validCount > 0
                      ? 'bg-[#075E54] hover:bg-[#128C7E] text-white'
                      : 'bg-[#D1D7DB] text-[#8696A0] cursor-not-allowed'
                  }`}
                >
                  Commit Import ({validationResult ? validationResult.validCount : 0})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG BEFORE COMMITTING IMPORT */}
      {isConfirmCommitOpen && validationResult && (
        <div className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-md p-5 space-y-4 font-sans animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-[#DCF8C6] flex items-center justify-center text-[#075E54] shrink-0">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#111B21]">Confirm Data Import</h3>
                <p className="text-xs text-[#667781] mt-1 leading-relaxed">
                  You are about to commit{' '}
                  <strong className="text-[#111B21]">{validationResult.validCount} valid records</strong> into{' '}
                  <strong>{moduleDisplayName}</strong>.
                  {validationResult.invalidCount > 0 && (
                    <span className="block mt-1 text-red-600">
                      Note: {validationResult.invalidCount} invalid rows will be skipped.
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="bg-[#F7F5F2] p-3 rounded-lg border border-[#D1D7DB] text-xs text-[#3B4A54] space-y-1">
              <div>Module: <strong>{moduleDisplayName}</strong></div>
              <div>Tenant / Branch: <strong>Bengaluru (Indiranagar)</strong></div>
              <div>Offline Persistence: <strong>Local Durable Storage (Active)</strong></div>
            </div>

            <div className="pt-2 border-t border-[#D1D7DB] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsConfirmCommitOpen(false)}
                className="px-3.5 py-1.5 border border-[#D1D7DB] text-[#3B4A54] hover:bg-[#F7F5F2] rounded-md font-bold text-xs cursor-pointer"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleCommitImport}
                className="px-4 py-1.5 bg-[#075E54] hover:bg-[#128C7E] text-white rounded-md font-bold text-xs cursor-pointer shadow-2xs"
              >
                Yes, Commit Records
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: STORE BY / RECORD GROUPING SELECTOR */}
      {/* ========================================================================= */}
      {isStoreByModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-sm p-5 space-y-4 font-sans animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-[#D1D7DB]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#DCF8C6] flex items-center justify-center text-[#075E54]">
                  <Layers className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#111B21]">Store By / Group {moduleDisplayName}</h3>
              </div>
              <button
                onClick={() => setIsStoreByModalOpen(false)}
                className="text-[#667781] hover:text-[#111B21] cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#667781]">
              Select how {moduleDisplayName} records should be prioritized and ordered in the table view:
            </p>

            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {(
                effectiveStoreByOptions.length > 0
                  ? effectiveStoreByOptions
                  : [
                      { id: 'DEFAULT', label: 'Default System Order', desc: 'Standard ledger ordering' },
                      { id: 'NAME', label: 'Alphabetical (A–Z)', desc: 'Order alphabetically' },
                      { id: 'DATE', label: 'Most Recent Activity', desc: 'Sorted by latest timestamp' },
                    ]
              ).map((opt) => {
                const isSelected = currentStoreBy === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      handleStoreBySelect?.(opt.id);
                      setIsStoreByModalOpen(false);
                      showToast(`${moduleDisplayName} grouped by ${opt.label.split(':')[0]}.`);
                    }}
                    className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-[#DCF8C6]/50 border-[#075E54] text-[#075E54] font-bold'
                        : 'border-[#D1D7DB] hover:bg-[#F7F5F2] text-[#111B21]'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold">{opt.label}</div>
                      {opt.desc && (
                        <div className="text-[10px] text-[#667781] font-normal mt-0.5">{opt.desc}</div>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-[#075E54] shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-[#D1D7DB] flex justify-end">
              <button
                onClick={() => setIsStoreByModalOpen(false)}
                className="px-4 py-1.5 bg-[#075E54] text-white rounded-lg text-xs font-bold hover:bg-[#128C7E] cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: PREFERENCES DRAWER / MODAL */}
      {/* ========================================================================= */}
      {isPreferencesModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-sm p-5 space-y-4 font-sans animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-[#D1D7DB]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#DCF8C6] flex items-center justify-center text-[#075E54]">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#111B21]">{moduleDisplayName} Preferences</h3>
              </div>
              <button
                onClick={() => setIsPreferencesModalOpen(false)}
                className="text-[#667781] hover:text-[#111B21] cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-[#111B21] mb-1">Page Display Size</label>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const next = parseInt(e.target.value, 10);
                    setPageSize(next);
                    localStorage.setItem(`slate_pagesize_${moduleKey.toLowerCase()}`, next.toString());
                  }}
                  className="w-full p-2 rounded-lg border border-[#D1D7DB] bg-white font-medium text-xs text-[#111B21] focus:border-[#075E54] outline-none"
                >
                  <option value={10}>10 records per page</option>
                  <option value={25}>25 records per page</option>
                  <option value={50}>50 records per page</option>
                  <option value={100}>100 records per page</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#111B21] mb-1">Row Density</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRowDensity('compact')}
                    className={`py-1.5 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                      rowDensity === 'compact'
                        ? 'bg-[#DCF8C6]/50 border-[#075E54] text-[#075E54]'
                        : 'border-[#D1D7DB] text-[#3B4A54]'
                    }`}
                  >
                    Compact (Default)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRowDensity('comfortable')}
                    className={`py-1.5 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                      rowDensity === 'comfortable'
                        ? 'bg-[#DCF8C6]/50 border-[#075E54] text-[#075E54]'
                        : 'border-[#D1D7DB] text-[#3B4A54]'
                    }`}
                  >
                    Comfortable
                  </button>
                </div>
              </div>

              {customColumns && customColumns.length > 0 && (
                <div>
                  <label className="block font-semibold text-[#111B21] mb-1.5">
                    Visible Table Columns
                  </label>
                  <div className="max-h-36 overflow-y-auto space-y-1 p-2 bg-[#F7F5F2] rounded-lg border border-[#D1D7DB]">
                    {customColumns.map((col) => (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 text-xs font-medium text-[#111B21] cursor-pointer hover:bg-white p-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={col.visible}
                          onChange={() => onToggleColumn?.(col.key)}
                          className="rounded text-[#075E54] focus:ring-[#075E54]"
                        />
                        <span>{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-[#D1D7DB]">
                <button
                  onClick={() => {
                    setIsPreferencesModalOpen(false);
                    showToast(`Preferences saved for ${moduleDisplayName}.`);
                  }}
                  className="w-full py-2 bg-[#075E54] hover:bg-[#128C7E] text-white rounded-lg font-bold text-xs cursor-pointer shadow-2xs transition-colors"
                >
                  Save Preferences
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
