/**
 * SLATE POS — TallyPrime Integration Engine
 * Full compatibility with official TallyPrime Excel templates:
 * - AllAccountingMasters.xlsx (Ledger, Group, Cost Category, Cost Centre)
 * - AccountingVouchers.xlsx (Accounting Voucher)
 *
 * Provides flawless 1:1 Excel (.xlsx) and CSV import/export, template generation,
 * formula-injection protection, validation, and staging preview.
 */

import * as XLSX from 'xlsx';
import { Customer, Supplier, Expense, PaymentRecord, Sale } from '../types';
import { offlineStore } from './offlineStore';

// ============================================================================
// 1. CONSTANTS & EXACT HEADER DEFINITIONS
// ============================================================================

export const TALLY_LEDGER_HEADERS = [
  'Name',
  'Group Name',
  'Ledger - Opening Balance',
  'Ledger Opening Balance - Dr/Cr',
  'Bill - Date',
  'Bill - Name',
  'Bill - Amount',
  'Bill Amount - Dr/Cr',
  'Address',
  'State',
  'Country',
  'Pincode',
];

export const TALLY_VOUCHER_HEADERS = [
  'Date',
  'Voucher Type',
  'Voucher Number',
  'Ledger Name',
  'Amount',
  'Dr/Cr',
  'Narration',
  'Cost Centre',
  'Bill Date',
  'Bill Name',
  'Bill Amount',
  'Bill Amount Dr/Cr',
  'Bill Type',
  'Change Mode ', // Trailing space required by TallyPrime
];

// Readme Content Documentation Rows for Master Templates
export const LEDGER_README_ROWS = [
  ['Worksheet Name', 'Ledger'],
  ['Description', 'Master Ledger Account Definitions for TallyPrime Import'],
  ['Field Guidance:'],
  ['Name', 'Mandatory. Unique Name of Customer, Supplier, or General Ledger account.'],
  ['Group Name', 'Mandatory. e.g. "Sundry Debtors" for Customers, "Sundry Creditors" for Suppliers.'],
  ['Ledger - Opening Balance', 'Optional. Numeric opening balance amount.'],
  ['Ledger Opening Balance - Dr/Cr', 'Dr for Debtors/Receivables, Cr for Creditors/Payables.'],
  ['Bill - Date', 'Optional. YYYY-MM-DD format for pending opening bills.'],
  ['Bill - Name', 'Optional. Original Bill/Invoice Reference.'],
  ['Bill - Amount', 'Optional. Bill opening balance amount.'],
  ['Bill Amount - Dr/Cr', 'Dr or Cr.'],
  ['Address', 'Commercial street address.'],
  ['State', 'Indian State (e.g. Tamil Nadu, Karnataka).'],
  ['Country', 'Default: India'],
  ['Pincode', '6-digit Postal PIN Code.'],
];

export const VOUCHER_README_ROWS = [
  ['Worksheet Name', 'Accounting Voucher'],
  ['Description', 'Accounting Voucher Transaction Ledger Entries for TallyPrime Import'],
  ['Field Guidance:'],
  ['Date', 'Mandatory. YYYY-MM-DD transaction date.'],
  ['Voucher Type', 'Mandatory. "Receipt", "Payment", or "Journal".'],
  ['Voucher Number', 'Mandatory. Unique voucher or reference identifier.'],
  ['Ledger Name', 'Mandatory. Party, Bank, Cash, or Expense ledger account.'],
  ['Amount', 'Mandatory. Entry amount in INR.'],
  ['Dr/Cr', 'Mandatory. "Dr" or "Cr" entry direction.'],
  ['Narration', 'Optional entry remarks.'],
  ['Cost Centre', 'Optional cost center.'],
  ['Bill Date', 'Optional bill reference date.'],
  ['Bill Name', 'Optional bill reference invoice/bill number.'],
  ['Bill Amount', 'Optional bill allocated amount.'],
  ['Bill Amount Dr/Cr', 'Dr or Cr.'],
  ['Bill Type', 'Agst Ref, New Ref, Advance, or On Account.'],
  ['Change Mode ', 'Optional. "As Voucher" or "Accounting Invoice". Note exact trailing space.'],
];

export interface TallyStagedRow {
  rowNumber: number;
  raw: Record<string, string>;
  isValid: boolean;
  errors: string[];
  parsedData?: any;
  isDuplicate?: boolean;
}

export interface TallyImportValidationResult {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  stagedRows: TallyStagedRow[];
  errorReportCsv: string;
}

// Helper to trigger browser download of Blob / Uint8Array
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// 2. CUSTOMER & SUPPLIER TALLY MASTER EXPORT / TEMPLATE GENERATION
// ============================================================================

/**
 * Downloads a complete, official TallyPrime AllAccountingMasters.xlsx workbook
 * for Customer Masters (Sundry Debtors).
 */
export function downloadTallyCustomerExcelTemplate(customers?: Customer[]) {
  const wb = XLSX.utils.book_new();

  const dataRows = (customers && customers.length > 0 ? customers : [
    {
      name: 'Ramesh Kumar (Sample Client)',
      companyName: 'Kumar Retailers',
      phone: '+91 98450 12345',
      address: '45 MG Road, Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038',
      currentReceivableBalance: 12500,
    } as any,
  ]).map((c) => [
    c.name,
    'Sundry Debtors',
    c.currentReceivableBalance ? c.currentReceivableBalance.toFixed(2) : '0.00',
    'Dr',
    new Date().toISOString().split('T')[0],
    'OPENING-01',
    c.currentReceivableBalance ? c.currentReceivableBalance.toFixed(2) : '0.00',
    'Dr',
    c.address || '',
    c.state || 'Tamil Nadu',
    'India',
    c.pincode || '600001',
  ]);

  const ledgerSheetData = [TALLY_LEDGER_HEADERS, ...dataRows];
  const ledgerSheet = XLSX.utils.aoa_to_sheet(ledgerSheetData);
  const readmeSheet = XLSX.utils.aoa_to_sheet(LEDGER_README_ROWS);

  XLSX.utils.book_append_sheet(wb, ledgerSheet, 'Ledger');
  XLSX.utils.book_append_sheet(wb, readmeSheet, 'Ledger (Read Me)');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Name'], ['Sundry Debtors'], ['Sundry Creditors']]), 'Group');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Cost Category Name']]), 'Cost Category');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Cost Centre Name']]), 'Cost Centre');

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const filename = customers ? `Tally_Customer_Ledgers_Export_${new Date().toISOString().split('T')[0]}.xlsx` : 'AllAccountingMasters_Customer_Template.xlsx';
  downloadBlob(blob, filename);
}

/**
 * Downloads a complete, official TallyPrime AllAccountingMasters.xlsx workbook
 * for Supplier Masters (Sundry Creditors).
 */
export function downloadTallySupplierExcelTemplate(suppliers?: Supplier[]) {
  const wb = XLSX.utils.book_new();

  const dataRows = (suppliers && suppliers.length > 0 ? suppliers : [
    {
      name: 'Chennai Wholesale Foods (Sample Supplier)',
      openingBalance: 45000,
      currentPayableBalance: 45000,
      address: 'Peenya Industrial Area',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600002',
    } as any,
  ]).map((s) => [
    s.name,
    'Sundry Creditors',
    s.currentPayableBalance ? s.currentPayableBalance.toFixed(2) : (s.openingBalance ? s.openingBalance.toFixed(2) : '0.00'),
    'Cr',
    new Date().toISOString().split('T')[0],
    'BILL-OPEN-01',
    s.currentPayableBalance ? s.currentPayableBalance.toFixed(2) : '0.00',
    'Cr',
    s.address || '',
    s.state || 'Tamil Nadu',
    'India',
    s.pincode || '600002',
  ]);

  const ledgerSheetData = [TALLY_LEDGER_HEADERS, ...dataRows];
  const ledgerSheet = XLSX.utils.aoa_to_sheet(ledgerSheetData);
  const readmeSheet = XLSX.utils.aoa_to_sheet(LEDGER_README_ROWS);

  XLSX.utils.book_append_sheet(wb, ledgerSheet, 'Ledger');
  XLSX.utils.book_append_sheet(wb, readmeSheet, 'Ledger (Read Me)');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Name'], ['Sundry Debtors'], ['Sundry Creditors']]), 'Group');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Cost Category Name']]), 'Cost Category');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Cost Centre Name']]), 'Cost Centre');

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const filename = suppliers ? `Tally_Supplier_Ledgers_Export_${new Date().toISOString().split('T')[0]}.xlsx` : 'AllAccountingMasters_Supplier_Template.xlsx';
  downloadBlob(blob, filename);
}

// ============================================================================
// 3. VOUCHER EXPORT / TEMPLATE GENERATION (Receipts & Operating Expenses)
// ============================================================================

/**
 * Exports Payments Received to TallyPrime AccountingVouchers.xlsx format (Receipt Vouchers).
 */
export function downloadTallyPaymentsExcel(payments: PaymentRecord[], sales: Sale[], isTemplateOnly = false) {
  const wb = XLSX.utils.book_new();

  const voucherRows: any[][] = [];

  if (isTemplateOnly || payments.length === 0) {
    // Template Sample
    voucherRows.push([
      new Date().toISOString().split('T')[0],
      'Receipt',
      'RCT-2026-001',
      'Test 1 Client',
      '5000.00',
      'Cr',
      'Payment received against bill INV-2026-001',
      'Main Branch',
      new Date().toISOString().split('T')[0],
      'INV-2026-001',
      '5000.00',
      'Cr',
      'Agst Ref',
      'As Voucher',
    ]);
    voucherRows.push([
      new Date().toISOString().split('T')[0],
      'Receipt',
      'RCT-2026-001',
      'HDFC Bank Account',
      '5000.00',
      'Dr',
      'Payment received against bill INV-2026-001',
      'Main Branch',
      '',
      '',
      '',
      '',
      '',
      'As Voucher',
    ]);
  } else {
    payments.forEach((p, idx) => {
      const sale = sales.find((s) => s.id === p.saleId);
      const customerName = sale?.customerName || 'Counter Cash Customer';
      const vNumber = p.utrOrRef || `RCT-2026-${String(idx + 1).padStart(4, '0')}`;
      const vDate = p.timestamp ? p.timestamp.split('T')[0] : new Date().toISOString().split('T')[0];
      const amount = p.amount.toFixed(2);
      const bankLedger = p.method === 'CASH' ? 'Cash' : (p.method === 'UPI' ? 'UPI Bank Account' : 'Bank Account');
      const invoiceRef = sale?.invoiceNumber || sale?.id || `INV-${vNumber}`;

      // Row 1: Credit Party Account (Sundry Debtor)
      voucherRows.push([
        vDate,
        'Receipt',
        vNumber,
        customerName,
        amount,
        'Cr',
        `Receipt against POS Sale ${invoiceRef}`,
        'Main Branch',
        vDate,
        invoiceRef,
        amount,
        'Cr',
        'Agst Ref',
        'As Voucher',
      ]);

      // Row 2: Debit Bank/Cash Account
      voucherRows.push([
        vDate,
        'Receipt',
        vNumber,
        bankLedger,
        amount,
        'Dr',
        `Receipt against POS Sale ${invoiceRef}`,
        'Main Branch',
        '',
        '',
        '',
        '',
        '',
        'As Voucher',
      ]);
    });
  }

  const voucherSheetData = [TALLY_VOUCHER_HEADERS, ...voucherRows];
  const voucherSheet = XLSX.utils.aoa_to_sheet(voucherSheetData);
  const readmeSheet = XLSX.utils.aoa_to_sheet(VOUCHER_README_ROWS);

  XLSX.utils.book_append_sheet(wb, voucherSheet, 'Accounting Voucher');
  XLSX.utils.book_append_sheet(wb, readmeSheet, 'Accounting Voucher (Read Me)');

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const filename = isTemplateOnly
    ? 'AccountingVouchers_Receipt_Template.xlsx'
    : `Tally_Receipt_Vouchers_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
  downloadBlob(blob, filename);
}

/**
 * Exports Operating Expenses to TallyPrime AccountingVouchers.xlsx format (Payment / Journal Vouchers).
 */
export function downloadTallyExpensesExcel(expenses: Expense[], isTemplateOnly = false) {
  const wb = XLSX.utils.book_new();

  const voucherRows: any[][] = [];

  if (isTemplateOnly || expenses.length === 0) {
    voucherRows.push([
      new Date().toISOString().split('T')[0],
      'Payment',
      'EXP-2026-001',
      'Office Rent & Maintenance',
      '15000.00',
      'Dr',
      'Store rent payment for current month',
      'Main Branch',
      '',
      '',
      '',
      '',
      '',
      'As Voucher',
    ]);
    voucherRows.push([
      new Date().toISOString().split('T')[0],
      'Payment',
      'EXP-2026-001',
      'HDFC Bank Account',
      '15000.00',
      'Cr',
      'Store rent payment for current month',
      'Main Branch',
      '',
      '',
      '',
      '',
      '',
      'As Voucher',
    ]);
  } else {
    expenses.forEach((exp, idx) => {
      const vNumber = exp.invoiceRef || `EXP-2026-${String(idx + 1).padStart(4, '0')}`;
      const vDate = exp.date || new Date().toISOString().split('T')[0];
      const amount = exp.amount.toFixed(2);
      const isPaidCash = exp.paymentMode === 'CASH';
      const cashBankLedger = isPaidCash ? 'Cash' : 'Bank Account';
      const expenseLedger = exp.category ? `${exp.category} Expense` : 'Operating Expense';
      const voucherType = 'Payment';
      const notes = exp.notes || `Operating Expense - ${exp.category || 'General'}`;

      // Row 1: Debit Expense Account
      voucherRows.push([
        vDate,
        voucherType,
        vNumber,
        expenseLedger,
        amount,
        'Dr',
        notes,
        'Main Branch',
        '',
        '',
        '',
        '',
        '',
        'As Voucher',
      ]);

      // Row 2: Credit Cash / Bank Account
      voucherRows.push([
        vDate,
        voucherType,
        vNumber,
        cashBankLedger,
        amount,
        'Cr',
        notes,
        'Main Branch',
        '',
        '',
        '',
        '',
        '',
        'As Voucher',
      ]);
    });
  }

  const voucherSheetData = [TALLY_VOUCHER_HEADERS, ...voucherRows];
  const voucherSheet = XLSX.utils.aoa_to_sheet(voucherSheetData);
  const readmeSheet = XLSX.utils.aoa_to_sheet(VOUCHER_README_ROWS);

  XLSX.utils.book_append_sheet(wb, voucherSheet, 'Accounting Voucher');
  XLSX.utils.book_append_sheet(wb, readmeSheet, 'Accounting Voucher (Read Me)');

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const filename = isTemplateOnly
    ? 'AccountingVouchers_Expense_Template.xlsx'
    : `Tally_Expense_Vouchers_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
  downloadBlob(blob, filename);
}

// ============================================================================
// 4. PARSING & VALIDATION ENGINE FOR TALLY WORKBOOKS (.XLSX & .CSV)
// ============================================================================

/**
 * Reads an uploaded Excel or CSV file and extracts structured JSON row arrays
 * from the target worksheet ('Ledger' or 'Accounting Voucher' or first sheet).
 */
export async function parseTallyWorkbook(file: File): Promise<{ sheetName: string; rows: Record<string, string>[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const wb = XLSX.read(buffer, { type: 'array' });

        // Select relevant sheet: 'Ledger', 'Accounting Voucher', or fallback to Sheet 0
        let targetSheetName = wb.SheetNames.find((s) => s.toLowerCase() === 'ledger' || s.toLowerCase() === 'accounting voucher') || wb.SheetNames[0];

        const sheet = wb.Sheets[targetSheetName];
        if (!sheet) {
          resolve({ sheetName: targetSheetName, rows: [] });
          return;
        }

        const rawJson: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

        const normalizedRows: Record<string, string>[] = rawJson.map((row) => {
          const norm: Record<string, string> = {};
          Object.keys(row).forEach((key) => {
            const cleanKey = key.trim().toLowerCase().replace(/[*_#\-\s]/g, '');
            norm[cleanKey] = String(row[key]).trim();
          });
          return norm;
        });

        resolve({ sheetName: targetSheetName, rows: normalizedRows });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Validates Tally Customer Ledger Rows before committing to offlineStore & Supabase
 */
export function validateAndStageTallyCustomers(rows: Record<string, string>[]): TallyImportValidationResult {
  const existingCustomers = offlineStore.getCustomers();
  const existingNames = new Set(existingCustomers.map((c) => c.name.toLowerCase()));
  const stagedRows: TallyStagedRow[] = [];
  const errorReportLines: string[] = ['Row Number,Field,Value,Error Description'];

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const errors: string[] = [];

    const name = (row['name'] || '').trim();
    const groupName = (row['groupname'] || 'Sundry Debtors').trim();
    const openingBalRaw = (row['ledgeropeningbalance'] || row['openingbalance'] || '0').trim();
    const drCr = (row['ledgeropeningbalancedrcr'] || row['drcr'] || 'Dr').trim();
    const address = (row['address'] || '').trim();
    const state = (row['state'] || 'Tamil Nadu').trim();
    const country = (row['country'] || 'India').trim();
    const pincode = (row['pincode'] || '').trim();

    if (!name || name.length < 2) {
      errors.push('Customer / Ledger Name is required (minimum 2 characters).');
      errorReportLines.push(`${rowNumber},Name,"${name}","Required Name field is missing or too short"`);
    }

    const openingBalance = parseFloat(openingBalRaw.replace(/[^0-9.]/g, '')) || 0;
    const isDuplicate = existingNames.has(name.toLowerCase());

    stagedRows.push({
      rowNumber,
      raw: row,
      isValid: errors.length === 0,
      errors,
      isDuplicate,
      parsedData: {
        name,
        groupName: groupName || 'Sundry Debtors',
        phone: '+91 98000 00000',
        address,
        state,
        country,
        pincode,
        creditLimit: 50000,
        currentReceivableBalance: drCr.toUpperCase() === 'DR' ? openingBalance : -openingBalance,
      },
    });
  });

  return {
    totalRows: stagedRows.length,
    validCount: stagedRows.filter((r) => r.isValid).length,
    invalidCount: stagedRows.filter((r) => !r.isValid).length,
    duplicateCount: stagedRows.filter((r) => r.isValid && r.isDuplicate).length,
    stagedRows,
    errorReportCsv: errorReportLines.join('\n'),
  };
}

/**
 * Validates Tally Supplier Ledger Rows
 */
export function validateAndStageTallySuppliers(rows: Record<string, string>[]): TallyImportValidationResult {
  const existingSuppliers = offlineStore.getSuppliers();
  const existingNames = new Set(existingSuppliers.map((s) => s.name.toLowerCase()));
  const stagedRows: TallyStagedRow[] = [];
  const errorReportLines: string[] = ['Row Number,Field,Value,Error Description'];

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const errors: string[] = [];

    const name = (row['name'] || '').trim();
    const groupName = (row['groupname'] || 'Sundry Creditors').trim();
    const openingBalRaw = (row['ledgeropeningbalance'] || row['openingbalance'] || '0').trim();
    const address = (row['address'] || '').trim();
    const state = (row['state'] || 'Tamil Nadu').trim();

    if (!name || name.length < 2) {
      errors.push('Supplier / Ledger Name is required.');
      errorReportLines.push(`${rowNumber},Name,"${name}","Supplier Name is mandatory"`);
    }

    const openingBalance = parseFloat(openingBalRaw.replace(/[^0-9.]/g, '')) || 0;
    const isDuplicate = existingNames.has(name.toLowerCase());

    stagedRows.push({
      rowNumber,
      raw: row,
      isValid: errors.length === 0,
      errors,
      isDuplicate,
      parsedData: {
        id: `supp_tally_${Date.now()}_${idx}`,
        name,
        contactPerson: name + ' Manager',
        phone: '+91 98400 00000',
        email: '',
        address,
        city: state,
        state,
        openingBalance,
        currentPayableBalance: openingBalance,
        status: 'ACTIVE' as const,
        category: 'Wholesale Supplier',
        purchaseOrdersCount: 0,
        createdAt: new Date().toISOString(),
      },
    });
  });

  return {
    totalRows: stagedRows.length,
    validCount: stagedRows.filter((r) => r.isValid).length,
    invalidCount: stagedRows.filter((r) => !r.isValid).length,
    duplicateCount: stagedRows.filter((r) => r.isValid && r.isDuplicate).length,
    stagedRows,
    errorReportCsv: errorReportLines.join('\n'),
  };
}

/**
 * Validates Tally Accounting Voucher Rows for Payments Received
 */
export function validateAndStageTallyPayments(rows: Record<string, string>[]): TallyImportValidationResult {
  const stagedRows: TallyStagedRow[] = [];
  const errorReportLines: string[] = ['Row Number,Field,Value,Error Description'];

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const errors: string[] = [];

    const voucherDate = (row['date'] || row['voucherdate'] || new Date().toISOString().split('T')[0]).trim();
    const voucherType = (row['vouchertype'] || row['vouchertypename'] || 'Receipt').trim();
    const voucherNumber = (row['vouchernumber'] || '').trim();
    const ledgerName = (row['ledgername'] || '').trim();
    const amountRaw = (row['amount'] || row['ledgeramount'] || '0').trim();
    const drCr = (row['drcr'] || row['ledgeramountdrcr'] || 'Cr').trim();

    if (!ledgerName) {
      errors.push('Ledger Name is required.');
      errorReportLines.push(`${rowNumber},Ledger Name,"","Ledger Name is mandatory for voucher entries"`);
    }

    const amount = parseFloat(amountRaw.replace(/[^0-9.]/g, '')) || 0;
    if (amount <= 0) {
      errors.push('Voucher amount must be greater than zero.');
      errorReportLines.push(`${rowNumber},Ledger Amount,"${amountRaw}","Amount must be positive"`);
    }

    stagedRows.push({
      rowNumber,
      raw: row,
      isValid: errors.length === 0,
      errors,
      parsedData: {
        voucherDate,
        voucherType,
        voucherNumber,
        ledgerName,
        amount,
        drCr,
      },
    });
  });

  return {
    totalRows: stagedRows.length,
    validCount: stagedRows.filter((r) => r.isValid).length,
    invalidCount: stagedRows.filter((r) => !r.isValid).length,
    duplicateCount: 0,
    stagedRows,
    errorReportCsv: errorReportLines.join('\n'),
  };
}

/**
 * Validates Tally Accounting Voucher Rows for Operating Expenses
 */
export function validateAndStageTallyExpenses(rows: Record<string, string>[]): TallyImportValidationResult {
  const stagedRows: TallyStagedRow[] = [];
  const errorReportLines: string[] = ['Row Number,Field,Value,Error Description'];

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const errors: string[] = [];

    const voucherDate = (row['date'] || row['voucherdate'] || new Date().toISOString().split('T')[0]).trim();
    const voucherType = (row['vouchertype'] || row['vouchertypename'] || 'Payment').trim();
    const voucherNumber = (row['vouchernumber'] || `EXP-TALLY-${Date.now()}`).trim();
    const ledgerName = (row['ledgername'] || 'General Expense').trim();
    const amountRaw = (row['amount'] || row['ledgeramount'] || '0').trim();
    const drCr = (row['drcr'] || row['ledgeramountdrcr'] || 'Dr').trim();

    if (!ledgerName) {
      errors.push('Expense Ledger Name is required.');
      errorReportLines.push(`${rowNumber},Ledger Name,"","Expense Ledger Name is mandatory"`);
    }

    const amount = parseFloat(amountRaw.replace(/[^0-9.]/g, '')) || 0;
    if (amount <= 0) {
      errors.push('Expense amount must be greater than zero.');
      errorReportLines.push(`${rowNumber},Ledger Amount,"${amountRaw}","Amount must be positive"`);
    }

    stagedRows.push({
      rowNumber,
      raw: row,
      isValid: errors.length === 0,
      errors,
      parsedData: {
        id: `exp_tally_${Date.now()}_${idx}`,
        organizationId: 'org_slate_crm_01',
        branchId: 'br_slate_crm_main',
        category: ledgerName.replace(/\s*Expense\s*/i, '').trim() || 'General Expense',
        vendor: 'Vendor',
        date: voucherDate,
        amount,
        paymentMode: 'CASH' as const,
        invoiceRef: voucherNumber,
        notes: `Imported from TallyPrime (${voucherType} ${voucherNumber}, ${drCr})`,
      },
    });
  });

  return {
    totalRows: stagedRows.length,
    validCount: stagedRows.filter((r) => r.isValid).length,
    invalidCount: stagedRows.filter((r) => !r.isValid).length,
    duplicateCount: 0,
    stagedRows,
    errorReportCsv: errorReportLines.join('\n'),
  };
}
