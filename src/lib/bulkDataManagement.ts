/**
 * SLATE POS — Enterprise Bulk Data Management Engine
 * Robust CSV template generation, client-side validation, error reporting, formula-injection protection,
 * and durable offline-first data import/export for all business modules.
 */

import { offlineStore } from './offlineStore';
import { Customer, Supplier, Product, Coupon, Expense, Sale, CartItem } from '../types';
import { INITIAL_ORGANIZATION, INITIAL_CATEGORIES } from './initialData';

export type SupportedModule =
  | 'CUSTOMERS'
  | 'SUPPLIERS'
  | 'PRODUCTS'
  | 'COUPONS'
  | 'CHALLANS'
  | 'PAYMENTS'
  | 'EXPENSES';

export interface RowValidationError {
  rowNumber: number;
  field: string;
  value: string;
  message: string;
}

export interface StagedRow {
  rowNumber: number;
  raw: Record<string, string>;
  isValid: boolean;
  errors: string[];
  parsedData?: any;
  isDuplicate?: boolean;
}

export interface ImportValidationResult {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  stagedRows: StagedRow[];
  headers: string[];
  errorReportCsv: string;
}

export interface StoreByOption {
  id: string;
  label: string;
  desc: string;
}

/**
 * Formula Injection Prevention:
 * If a text cell starts with '=', '+', '-', or '@', prepend a single quote (')
 * so spreadsheet applications (Excel, Google Sheets) interpret it safely as literal text.
 */
export function sanitizeCsvField(value: any): string {
  if (value === null || value === undefined) return '';
  let str = String(value);

  // Strip formula injection triggers
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }

  // If contains comma, quote, or newline, escape quotes and wrap in quotes
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Robust CSV parser that handles delimiters, quoted strings, escaped quotes, and newlines.
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Strip UTF-8 BOM if present
  let cleanText = text.replace(/^\uFEFF/, '').trim();
  if (!cleanText) return { headers: [], rows: [] };

  // Detect delimiter (comma vs semicolon vs tab)
  const firstLine = cleanText.split(/\r\n|\n|\r/)[0];
  let delimiter = ',';
  if (firstLine.includes('\t') && !firstLine.includes(',')) delimiter = '\t';
  else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';

  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip next quote
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentField.trim());
        if (currentRow.some((c) => c.length > 0)) lines.push(currentRow);
        currentRow = [];
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some((c) => c.length > 0)) lines.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((c) => c.length > 0)) lines.push(currentRow);
  }

  if (lines.length === 0) return { headers: [], rows: [] };

  // Normalize header keys (lowercase, remove spaces, asterisks, and non-alphanumerics)
  const rawHeaders = lines[0];
  const normalizedHeaders = rawHeaders.map((h) =>
    h.toLowerCase().replace(/[*_#\-\s]/g, '')
  );

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < lines.length; r++) {
    const line = lines[r];
    if (line.every((cell) => !cell || cell.trim() === '')) continue;
    const rowObj: Record<string, string> = {};
    for (let c = 0; c < rawHeaders.length; c++) {
      const key = normalizedHeaders[c] || `col_${c}`;
      rowObj[key] = line[c] !== undefined ? line[c] : '';
    }
    rows.push(rowObj);
  }

  return { headers: rawHeaders, rows };
}

/**
 * Triggers browser download of a CSV file with UTF-8 BOM for flawless Excel & Sheets rendering.
 */
export function downloadCsv(filename: string, content: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// =========================================================================
// MODULE CONFIGURATIONS & SCHEMAS
// =========================================================================

export interface ModuleConfig {
  name: string;
  slug: SupportedModule;
  templateFileName: string;
  templateHeaders: string[];
  exampleRow: string[];
  storeByOptions: StoreByOption[];
  validateAndStage: (rows: Record<string, string>[]) => ImportValidationResult;
  commitBatch: (stagedRows: StagedRow[]) => { successCount: number; updatedCount: number; errorCount: number; message: string };
  exportCsv: (searchTerm?: string) => { filename: string; content: string; count: number };
}

export const MODULE_REGISTRY: Record<SupportedModule, ModuleConfig> = {
  CUSTOMERS: {
    name: 'Customers',
    slug: 'CUSTOMERS',
    templateFileName: 'SLATE_Customers_Import_Template.csv',
    templateHeaders: [
      'Customer Name*',
      'Phone*',
      'Email',
      'Company Name',
      'GSTIN',
      'Billing Address',
      'Shipping Address',
      'Credit Limit',
    ],
    exampleRow: [
      'Ramesh Kumar',
      '+91 98450 12345',
      'ramesh@kumarretail.in',
      'Kumar Retailers',
      '29AABCU9603R1ZM',
      '45 MG Road, Indiranagar, Bengaluru',
      '45 MG Road, Indiranagar, Bengaluru',
      '50000',
    ],
    storeByOptions: [
      { id: 'NAME', label: 'Customer Name (A–Z)', desc: 'Alphabetical sorting by client name' },
      { id: 'BALANCE_DESC', label: 'Highest Outstanding Balance', desc: 'Prioritize uncollected credit balances' },
      { id: 'ORDERS_DESC', label: 'Most Lifetime Orders', desc: 'Rank top repeat purchasing customers' },
      { id: 'RECENT', label: 'Recently Added', desc: 'Latest customer registrations' },
    ],
    validateAndStage: (rows: Record<string, string>[]): ImportValidationResult => {
      const existingCustomers = offlineStore.getCustomers();
      const existingPhones = new Set(existingCustomers.map((c) => c.phone.replace(/\D/g, '')));
      const existingGstins = new Set(existingCustomers.filter((c) => c.gstin).map((c) => c.gstin!.toUpperCase()));

      const stagedRows: StagedRow[] = [];
      const errorReportLines: string[] = ['Row Number,Field,Provided Value,Error Description'];

      rows.forEach((row, idx) => {
        const rowNumber = idx + 2; // +1 for 0-index, +1 for header
        const errors: string[] = [];

        // Match normalized keys
        const name = (row['customername'] || row['name'] || '').trim();
        const phone = (row['phone'] || row['phonenumber'] || row['mobile'] || '').trim();
        const email = (row['email'] || row['emailaddress'] || '').trim();
        const company = (row['companyname'] || row['company'] || '').trim();
        const gstin = (row['gstin'] || row['gst'] || '').trim().toUpperCase();
        const billingAddress = (row['billingaddress'] || row['address'] || '').trim();
        const shippingAddress = (row['shippingaddress'] || billingAddress || '').trim();
        const creditLimitRaw = (row['creditlimit'] || '0').trim();

        if (!name || name.length < 2) {
          errors.push('Customer Name is required (minimum 2 characters).');
          errorReportLines.push(`${rowNumber},Customer Name,"${sanitizeCsvField(name)}","Required field missing or too short"`);
        }

        const cleanPhone = phone.replace(/\D/g, '');
        if (!cleanPhone || cleanPhone.length < 7) {
          errors.push('Valid Phone number is required (at least 7 digits).');
          errorReportLines.push(`${rowNumber},Phone,"${sanitizeCsvField(phone)}","Invalid phone number format"`);
        }

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errors.push('Invalid email address format.');
          errorReportLines.push(`${rowNumber},Email,"${sanitizeCsvField(email)}","Malformed email address"`);
        }

        if (gstin && gstin.length !== 15) {
          errors.push('Indian GSTIN must be exactly 15 characters.');
          errorReportLines.push(`${rowNumber},GSTIN,"${sanitizeCsvField(gstin)}","GSTIN must have 15 alphanumeric characters"`);
        }

        const creditLimit = parseFloat(creditLimitRaw.replace(/[^0-9.]/g, '')) || 0;
        if (isNaN(creditLimit) || creditLimit < 0) {
          errors.push('Credit Limit must be a non-negative number.');
          errorReportLines.push(`${rowNumber},Credit Limit,"${sanitizeCsvField(creditLimitRaw)}","Invalid numeric amount"`);
        }

        const isDuplicate = existingPhones.has(cleanPhone) || (gstin && existingGstins.has(gstin));

        stagedRows.push({
          rowNumber,
          raw: row,
          isValid: errors.length === 0,
          errors,
          isDuplicate: Boolean(isDuplicate),
          parsedData: {
            name,
            phone: phone || cleanPhone,
            email: email || undefined,
            companyName: company || undefined,
            gstin: gstin || undefined,
            address: billingAddress || undefined,
            shippingAddress: shippingAddress || undefined,
            creditLimit,
          },
        });
      });

      const validCount = stagedRows.filter((r) => r.isValid).length;
      const invalidCount = stagedRows.filter((r) => !r.isValid).length;
      const duplicateCount = stagedRows.filter((r) => r.isValid && r.isDuplicate).length;

      return {
        totalRows: stagedRows.length,
        validCount,
        invalidCount,
        duplicateCount,
        stagedRows,
        headers: MODULE_REGISTRY.CUSTOMERS.templateHeaders,
        errorReportCsv: errorReportLines.join('\n'),
      };
    },
    commitBatch: (stagedRows: StagedRow[]) => {
      const validRows = stagedRows.filter((r) => r.isValid);
      let successCount = 0;
      let updatedCount = 0;
      const existingCustomers = offlineStore.getCustomers();

      validRows.forEach((r) => {
        const data = r.parsedData;
        const cleanPhone = data.phone.replace(/\D/g, '');
        const existing = existingCustomers.find(
          (c) => c.phone.replace(/\D/g, '') === cleanPhone || (data.gstin && c.gstin?.toUpperCase() === data.gstin)
        );

        if (existing) {
          // Safe update without overwriting financial balances
          existing.name = data.name;
          if (data.companyName) existing.companyName = data.companyName;
          if (data.email) existing.email = data.email;
          if (data.address) existing.address = data.address;
          if (data.shippingAddress) existing.shippingAddress = data.shippingAddress;
          if (data.creditLimit > 0) existing.creditLimit = data.creditLimit;
          updatedCount++;
        } else {
          offlineStore.addCustomer({
            name: data.name,
            phone: data.phone,
            email: data.email,
            companyName: data.companyName,
            gstin: data.gstin,
            address: data.address,
            shippingAddress: data.shippingAddress,
            creditLimit: data.creditLimit,
          });
          successCount++;
        }
      });

      return {
        successCount,
        updatedCount,
        errorCount: stagedRows.length - validRows.length,
        message: `Successfully processed ${validRows.length} customer records (${successCount} added, ${updatedCount} updated).`,
      };
    },
    exportCsv: (searchTerm?: string) => {
      let customers = offlineStore.getCustomers();
      if (searchTerm?.trim()) {
        const q = searchTerm.toLowerCase().trim();
        customers = customers.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.phone.includes(q) ||
            (c.companyName && c.companyName.toLowerCase().includes(q)) ||
            (c.gstin && c.gstin.toLowerCase().includes(q))
        );
      }

      const headers = [
        'Customer Name',
        'Company Name',
        'Phone',
        'Email',
        'GSTIN',
        'Billing Address',
        'Shipping Address',
        'Credit Limit (INR)',
        'Outstanding Balance (INR)',
        'Lifetime Orders',
        'Registration Date',
      ];

      const rows = customers.map((c) => [
        sanitizeCsvField(c.name),
        sanitizeCsvField(c.companyName || ''),
        sanitizeCsvField(c.phone),
        sanitizeCsvField(c.email || ''),
        sanitizeCsvField(c.gstin || ''),
        sanitizeCsvField(c.address || ''),
        sanitizeCsvField(c.shippingAddress || ''),
        c.creditLimit.toFixed(2),
        c.currentReceivableBalance.toFixed(2),
        c.totalOrdersCount,
        c.createdAt ? c.createdAt.split('T')[0] : '',
      ]);

      const content = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      return {
        filename: `SLATE_Customers_Export_${new Date().toISOString().split('T')[0]}.csv`,
        content,
        count: customers.length,
      };
    },
  },

  SUPPLIERS: {
    name: 'Suppliers',
    slug: 'SUPPLIERS',
    templateFileName: 'SLATE_Suppliers_Import_Template.csv',
    templateHeaders: [
      'Supplier Name*',
      'Contact Person*',
      'Phone*',
      'Email',
      'GSTIN',
      'Address',
      'City',
      'State',
      'Opening Balance',
      'Category',
    ],
    exampleRow: [
      'Karnataka Wholesale Beverages',
      'Suresh Gowda',
      '+91 98451 98765',
      'sales@kwbwholesale.in',
      '29AABCK1234F1Z5',
      'Plot 12 Peenya Industrial Area',
      'Bengaluru',
      'Karnataka',
      '25000.00',
      'FMCG & Beverages',
    ],
    storeByOptions: [
      { id: 'NAME', label: 'Supplier Name (A–Z)', desc: 'Alphabetical sorting by vendor name' },
      { id: 'PAYABLE_DESC', label: 'Highest Payable Balance', desc: 'Prioritize unpaid trade payables' },
      { id: 'CATEGORY', label: 'Vendor Category', desc: 'Group by wholesale supply trade sector' },
      { id: 'RECENT', label: 'Recently Registered', desc: 'Latest supplier directory additions' },
    ],
    validateAndStage: (rows: Record<string, string>[]): ImportValidationResult => {
      const stagedRows: StagedRow[] = [];
      const errorReportLines: string[] = ['Row Number,Field,Provided Value,Error Description'];

      rows.forEach((row, idx) => {
        const rowNumber = idx + 2;
        const errors: string[] = [];

        const name = (row['suppliername'] || row['name'] || '').trim();
        const contactPerson = (row['contactperson'] || row['contact'] || '').trim();
        const phone = (row['phone'] || row['mobile'] || '').trim();
        const email = (row['email'] || '').trim();
        const gstin = (row['gstin'] || row['gst'] || '').trim().toUpperCase();
        const address = (row['address'] || '').trim();
        const city = (row['city'] || 'Bengaluru').trim();
        const state = (row['state'] || 'Karnataka').trim();
        const openingBalanceRaw = (row['openingbalance'] || '0').trim();
        const category = (row['category'] || 'General Wholesale').trim();

        if (!name || name.length < 2) {
          errors.push('Supplier Name is required (min 2 chars).');
          errorReportLines.push(`${rowNumber},Supplier Name,"${sanitizeCsvField(name)}","Required field missing or too short"`);
        }

        if (!contactPerson) {
          errors.push('Contact Person name is required.');
          errorReportLines.push(`${rowNumber},Contact Person,"","Required field missing"`);
        }

        const cleanPhone = phone.replace(/\D/g, '');
        if (!cleanPhone || cleanPhone.length < 7) {
          errors.push('Valid Phone number is required.');
          errorReportLines.push(`${rowNumber},Phone,"${sanitizeCsvField(phone)}","Invalid phone number format"`);
        }

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errors.push('Invalid email format.');
          errorReportLines.push(`${rowNumber},Email,"${sanitizeCsvField(email)}","Malformed email address"`);
        }

        if (gstin && gstin.length !== 15) {
          errors.push('GSTIN must be 15 characters.');
          errorReportLines.push(`${rowNumber},GSTIN,"${sanitizeCsvField(gstin)}","GSTIN must have 15 characters"`);
        }

        const openingBalance = parseFloat(openingBalanceRaw.replace(/[^0-9.-]/g, '')) || 0;

        stagedRows.push({
          rowNumber,
          raw: row,
          isValid: errors.length === 0,
          errors,
          parsedData: {
            id: `supp_${Date.now()}_${idx}`,
            name,
            contactPerson,
            phone,
            email,
            gstin: gstin || undefined,
            address: address || undefined,
            city,
            state,
            openingBalance,
            currentPayableBalance: openingBalance,
            status: 'ACTIVE' as const,
            category,
            purchaseOrdersCount: 0,
            createdAt: new Date().toISOString(),
          },
        });
      });

      return {
        totalRows: stagedRows.length,
        validCount: stagedRows.filter((r) => r.isValid).length,
        invalidCount: stagedRows.filter((r) => !r.isValid).length,
        duplicateCount: 0,
        stagedRows,
        headers: MODULE_REGISTRY.SUPPLIERS.templateHeaders,
        errorReportCsv: errorReportLines.join('\n'),
      };
    },
    commitBatch: (stagedRows: StagedRow[]) => {
      const validRows = stagedRows.filter((r) => r.isValid);
      validRows.forEach((r) => {
        offlineStore.saveSupplier(r.parsedData as Supplier);
      });
      return {
        successCount: validRows.length,
        updatedCount: 0,
        errorCount: stagedRows.length - validRows.length,
        message: `Successfully registered ${validRows.length} wholesale suppliers.`,
      };
    },
    exportCsv: (searchTerm?: string) => {
      let suppliers = offlineStore.getSuppliers();
      if (searchTerm?.trim()) {
        const q = searchTerm.toLowerCase().trim();
        suppliers = suppliers.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.contactPerson.toLowerCase().includes(q) ||
            s.phone.includes(q) ||
            (s.gstin && s.gstin.toLowerCase().includes(q))
        );
      }

      const headers = [
        'Supplier Name',
        'Contact Person',
        'Phone',
        'Email',
        'GSTIN',
        'Address',
        'City',
        'State',
        'Opening Balance (INR)',
        'Current Payable Balance (INR)',
        'Category',
        'Status',
      ];

      const rows = suppliers.map((s) => [
        sanitizeCsvField(s.name),
        sanitizeCsvField(s.contactPerson),
        sanitizeCsvField(s.phone),
        sanitizeCsvField(s.email || ''),
        sanitizeCsvField(s.gstin || ''),
        sanitizeCsvField(s.address || ''),
        sanitizeCsvField(s.city || ''),
        sanitizeCsvField(s.state || ''),
        s.openingBalance.toFixed(2),
        s.currentPayableBalance.toFixed(2),
        sanitizeCsvField(s.category || 'General Wholesale'),
        s.status,
      ]);

      const content = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      return {
        filename: `SLATE_Suppliers_Export_${new Date().toISOString().split('T')[0]}.csv`,
        content,
        count: suppliers.length,
      };
    },
  },

  PRODUCTS: {
    name: 'Product Catalogue',
    slug: 'PRODUCTS',
    templateFileName: 'SLATE_Products_Import_Template.csv',
    templateHeaders: [
      'Product Name*',
      'SKU*',
      'Barcode',
      'HSN',
      'Category*',
      'Description',
      'Unit*',
      'Selling Price*',
      'Cost Price*',
      'GST Rate*',
      'Opening Stock',
      'Min Stock Alert',
    ],
    exampleRow: [
      'Organic Toor Dal 1kg',
      'DAL-TOOR-01',
      '8901234567890',
      '0713',
      'Pulses & Grains',
      'Premium unpolished organic toor dal',
      'KG',
      '160.00',
      '120.00',
      '5',
      '50',
      '10',
    ],
    storeByOptions: [
      { id: 'NAME', label: 'Product Name (A–Z)', desc: 'Alphabetical catalog listing' },
      { id: 'CATEGORY', label: 'Category & Department', desc: 'Group by retail merchandise section' },
      { id: 'STOCK_LOW', label: 'Stock Level: Low to High', desc: 'Identify depleted items requiring reorder' },
      { id: 'PRICE_DESC', label: 'Selling Price: High to Low', desc: 'Rank premium catalogue merchandise' },
    ],
    validateAndStage: (rows: Record<string, string>[]): ImportValidationResult => {
      const existingProducts = offlineStore.getProducts();
      const existingSkus = new Set(existingProducts.map((p) => p.sku.toUpperCase()));
      const stagedRows: StagedRow[] = [];
      const errorReportLines: string[] = ['Row Number,Field,Provided Value,Error Description'];

      const validUnits = ['PCS', 'KG', 'LTR', 'BOX', 'PACK'];
      const validGstRates = [0, 5, 12, 18, 28];

      rows.forEach((row, idx) => {
        const rowNumber = idx + 2;
        const errors: string[] = [];

        const name = (row['productname'] || row['name'] || '').trim();
        const sku = (row['sku'] || '').trim().toUpperCase();
        const barcode = (row['barcode'] || sku || '').trim();
        const hsn = (row['hsn'] || '0000').trim();
        const categoryName = (row['category'] || 'General Merchandise').trim();
        const description = (row['description'] || '').trim();
        let unit = (row['unit'] || 'PCS').trim().toUpperCase() as Product['unit'];
        if (!validUnits.includes(unit)) unit = 'PCS';

        const sellingPrice = parseFloat((row['sellingprice'] || row['price'] || '0').replace(/[^0-9.]/g, ''));
        const costPrice = parseFloat((row['costprice'] || row['cost'] || '0').replace(/[^0-9.]/g, ''));
        const gstRate = parseInt((row['gstrate'] || row['gst'] || '18').replace(/[^0-9]/g, ''), 10);
        const openingStock = parseInt((row['openingstock'] || row['stock'] || '0').replace(/[^0-9-]/g, ''), 10) || 0;
        const minStockAlert = parseInt((row['minstockalert'] || row['minalert'] || '5').replace(/[^0-9]/g, ''), 10) || 5;

        if (!name || name.length < 2) {
          errors.push('Product Name is required.');
          errorReportLines.push(`${rowNumber},Product Name,"${sanitizeCsvField(name)}","Missing or too short"`);
        }

        if (!sku) {
          errors.push('SKU is required.');
          errorReportLines.push(`${rowNumber},SKU,"","SKU code is mandatory"`);
        }

        if (isNaN(sellingPrice) || sellingPrice < 0) {
          errors.push('Selling price must be a valid positive amount.');
          errorReportLines.push(`${rowNumber},Selling Price,"${sanitizeCsvField(row['sellingprice'])}","Invalid selling price"`);
        }

        if (isNaN(costPrice) || costPrice < 0) {
          errors.push('Cost price must be a valid positive amount.');
          errorReportLines.push(`${rowNumber},Cost Price,"${sanitizeCsvField(row['costprice'])}","Invalid cost price"`);
        }

        if (!validGstRates.includes(gstRate)) {
          errors.push(`GST rate must be an Indian GST slab: ${validGstRates.join(', ')}%.`);
          errorReportLines.push(`${rowNumber},GST Rate,"${gstRate}","Invalid GST rate slab"`);
        }

        const isDuplicate = existingSkus.has(sku);

        stagedRows.push({
          rowNumber,
          raw: row,
          isValid: errors.length === 0,
          errors,
          isDuplicate,
          parsedData: {
            name,
            sku,
            barcode,
            hsn,
            categoryId: 'cat_gen',
            categoryName,
            unit,
            sellingPrice: isNaN(sellingPrice) ? 0 : sellingPrice,
            costPrice: isNaN(costPrice) ? 0 : costPrice,
            gstRate: validGstRates.includes(gstRate) ? gstRate : 18,
            currentStock: openingStock,
            minStockAlert,
            isActive: true,
          },
        });
      });

      return {
        totalRows: stagedRows.length,
        validCount: stagedRows.filter((r) => r.isValid).length,
        invalidCount: stagedRows.filter((r) => !r.isValid).length,
        duplicateCount: stagedRows.filter((r) => r.isValid && r.isDuplicate).length,
        stagedRows,
        headers: MODULE_REGISTRY.PRODUCTS.templateHeaders,
        errorReportCsv: errorReportLines.join('\n'),
      };
    },
    commitBatch: (stagedRows: StagedRow[]) => {
      const validRows = stagedRows.filter((r) => r.isValid);
      let successCount = 0;
      let updatedCount = 0;
      const existingProducts = offlineStore.getProducts();

      validRows.forEach((r) => {
        const data = r.parsedData;
        const existing = existingProducts.find((p) => p.sku.toUpperCase() === data.sku.toUpperCase());
        if (existing) {
          offlineStore.updateProduct(existing.id, {
            name: data.name,
            sellingPrice: data.sellingPrice,
            costPrice: data.costPrice,
            gstRate: data.gstRate,
            categoryName: data.categoryName,
            unit: data.unit,
            minStockAlert: data.minStockAlert,
          });
          updatedCount++;
        } else {
          offlineStore.addProduct({
            name: data.name,
            sku: data.sku,
            barcode: data.barcode,
            hsn: data.hsn,
            categoryId: data.categoryId,
            categoryName: data.categoryName,
            unit: data.unit,
            costPrice: data.costPrice,
            sellingPrice: data.sellingPrice,
            gstRate: data.gstRate,
            currentStock: data.currentStock,
            minStockAlert: data.minStockAlert,
            isActive: true,
          });
          successCount++;
        }
      });

      return {
        successCount,
        updatedCount,
        errorCount: stagedRows.length - validRows.length,
        message: `Successfully processed ${validRows.length} products (${successCount} added, ${updatedCount} updated).`,
      };
    },
    exportCsv: (searchTerm?: string) => {
      let products = offlineStore.getProducts();
      if (searchTerm?.trim()) {
        const q = searchTerm.toLowerCase().trim();
        products = products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            p.barcode.includes(q) ||
            p.categoryName.toLowerCase().includes(q)
        );
      }

      const headers = [
        'Product Name',
        'SKU',
        'Barcode',
        'HSN Code',
        'Category',
        'Unit',
        'Selling Price (INR)',
        'Cost Price (INR)',
        'GST Rate (%)',
        'Current Stock',
        'Min Stock Alert',
        'Active Status',
      ];

      const rows = products.map((p) => [
        sanitizeCsvField(p.name),
        sanitizeCsvField(p.sku),
        sanitizeCsvField(p.barcode),
        sanitizeCsvField(p.hsn),
        sanitizeCsvField(p.categoryName),
        p.unit,
        p.sellingPrice.toFixed(2),
        p.costPrice.toFixed(2),
        p.gstRate,
        p.currentStock,
        p.minStockAlert,
        p.isActive ? 'Active' : 'Inactive',
      ]);

      const content = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      return {
        filename: `SLATE_Products_Catalog_${new Date().toISOString().split('T')[0]}.csv`,
        content,
        count: products.length,
      };
    },
  },

  COUPONS: {
    name: 'Coupons',
    slug: 'COUPONS',
    templateFileName: 'SLATE_Coupons_Import_Template.csv',
    templateHeaders: [
      'Coupon Code*',
      'Title*',
      'Discount Type*',
      'Discount Value*',
      'Minimum Order Value',
      'Maximum Discount',
      'Usage Limit',
      'Start Date',
      'Expiry Date',
      'Status',
    ],
    exampleRow: [
      'DIWALI2026',
      'Festive Mega Savings',
      'PERCENTAGE',
      '15',
      '1000',
      '300',
      '100',
      '2026-10-01',
      '2026-11-15',
      'ACTIVE',
    ],
    storeByOptions: [
      { id: 'EXPIRY', label: 'Expiry Date: Soonest First', desc: 'Identify impending voucher expiration' },
      { id: 'DISCOUNT_DESC', label: 'Discount Value: High to Low', desc: 'Rank highest discount promotions' },
      { id: 'USAGE_DESC', label: 'Most Redeemed Vouchers', desc: 'Track popular promotional campaigns' },
      { id: 'CODE_ASC', label: 'Coupon Code (A–Z)', desc: 'Alphabetical voucher code listing' },
    ],
    validateAndStage: (rows: Record<string, string>[]): ImportValidationResult => {
      const stagedRows: StagedRow[] = [];
      const errorReportLines: string[] = ['Row Number,Field,Provided Value,Error Description'];

      rows.forEach((row, idx) => {
        const rowNumber = idx + 2;
        const errors: string[] = [];

        const code = (row['couponcode'] || row['code'] || '').trim().toUpperCase();
        const title = (row['title'] || code).trim();
        let discountType = (row['discounttype'] || 'PERCENTAGE').trim().toUpperCase() as Coupon['discountType'];
        if (discountType !== 'FIXED_AMOUNT' && discountType !== 'PERCENTAGE') discountType = 'PERCENTAGE';

        const discountValue = parseFloat((row['discountvalue'] || '10').replace(/[^0-9.]/g, '')) || 0;
        const minOrderValue = parseFloat((row['minimumordervalue'] || row['minorder'] || '0').replace(/[^0-9.]/g, '')) || 0;
        const maxDiscount = parseFloat((row['maximumdiscount'] || row['maxdiscount'] || '0').replace(/[^0-9.]/g, '')) || undefined;
        const usageLimit = parseInt((row['usagelimit'] || '100').replace(/[^0-9]/g, ''), 10) || 100;
        const validFrom = (row['startdate'] || new Date().toISOString().split('T')[0]).trim();
        const validUntil = (row['expirydate'] || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]).trim();
        const status = (row['status'] || 'ACTIVE').trim().toUpperCase();
        const isActive = status !== 'INACTIVE';

        if (!code || code.length < 3) {
          errors.push('Coupon Code is required (min 3 characters).');
          errorReportLines.push(`${rowNumber},Coupon Code,"${sanitizeCsvField(code)}","Code must have at least 3 characters"`);
        }

        if (discountValue <= 0) {
          errors.push('Discount Value must be greater than zero.');
          errorReportLines.push(`${rowNumber},Discount Value,"${discountValue}","Discount value must be positive"`);
        }

        if (discountType === 'PERCENTAGE' && discountValue > 100) {
          errors.push('Percentage discount cannot exceed 100%.');
          errorReportLines.push(`${rowNumber},Discount Value,"${discountValue}","Percentage cannot exceed 100%"`);
        }

        stagedRows.push({
          rowNumber,
          raw: row,
          isValid: errors.length === 0,
          errors,
          parsedData: {
            id: `cpn_${Date.now()}_${idx}`,
            code,
            title,
            discountType,
            discountValue,
            minOrderValue,
            maxDiscountCap: maxDiscount,
            usageLimit,
            redemptionCount: 0,
            validFrom,
            validUntil,
            isActive,
            createdAt: new Date().toISOString(),
          },
        });
      });

      return {
        totalRows: stagedRows.length,
        validCount: stagedRows.filter((r) => r.isValid).length,
        invalidCount: stagedRows.filter((r) => !r.isValid).length,
        duplicateCount: 0,
        stagedRows,
        headers: MODULE_REGISTRY.COUPONS.templateHeaders,
        errorReportCsv: errorReportLines.join('\n'),
      };
    },
    commitBatch: (stagedRows: StagedRow[]) => {
      const validRows = stagedRows.filter((r) => r.isValid);
      validRows.forEach((r) => {
        offlineStore.saveCoupon(r.parsedData as Coupon);
      });
      return {
        successCount: validRows.length,
        updatedCount: 0,
        errorCount: stagedRows.length - validRows.length,
        message: `Successfully configured ${validRows.length} promo coupons.`,
      };
    },
    exportCsv: (searchTerm?: string) => {
      let coupons = offlineStore.getCoupons();
      if (searchTerm?.trim()) {
        const q = searchTerm.toLowerCase().trim();
        coupons = coupons.filter(
          (c) => c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
        );
      }

      const headers = [
        'Coupon Code',
        'Title',
        'Discount Type',
        'Discount Value',
        'Minimum Order Value (INR)',
        'Maximum Discount Cap (INR)',
        'Usage Limit',
        'Redemption Count',
        'Start Date',
        'Expiry Date',
        'Status',
      ];

      const rows = coupons.map((c) => [
        sanitizeCsvField(c.code),
        sanitizeCsvField(c.title),
        c.discountType,
        c.discountType === 'PERCENTAGE' ? `${c.discountValue}%` : c.discountValue.toFixed(2),
        c.minOrderValue.toFixed(2),
        c.maxDiscountCap ? c.maxDiscountCap.toFixed(2) : 'No Cap',
        c.usageLimit,
        c.redemptionCount,
        c.validFrom,
        c.validUntil,
        c.isActive ? 'Active' : 'Inactive',
      ]);

      const content = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      return {
        filename: `SLATE_Coupons_Export_${new Date().toISOString().split('T')[0]}.csv`,
        content,
        count: coupons.length,
      };
    },
  },

  CHALLANS: {
    name: 'Delivery Challans',
    slug: 'CHALLANS',
    templateFileName: 'SLATE_Delivery_Challans_Import_Template.csv',
    templateHeaders: [
      'Challan Number*',
      'Date*',
      'Customer Reference*',
      'Company Name',
      'Delivery Address*',
      'Customer Phone',
      'Item SKU',
      'Item Name*',
      'Quantity*',
      'Unit Price*',
      'Notes',
    ],
    exampleRow: [
      'DC-26-0042',
      '2026-10-15',
      'Ramesh Kumar',
      'Kumar Retailers',
      '45 MG Road, Bengaluru',
      '+91 98450 12345',
      'DAL-TOOR-01',
      'Organic Toor Dal 1kg',
      '10',
      '160.00',
      'Standard dispatch via Indiranagar Hub',
    ],
    storeByOptions: [
      { id: 'DATE_DESC', label: 'Challan Date: Most Recent First', desc: 'Dispatch chronological sequence' },
      { id: 'CUSTOMER', label: 'Customer Name (A–Z)', desc: 'Group challans by destination recipient' },
      { id: 'TOTAL_DESC', label: 'Highest Dispatch Value', desc: 'Rank shipments by total consignment worth' },
      { id: 'STATUS', label: 'Delivery & Payment Status', desc: 'Group by dispatch verification stage' },
    ],
    validateAndStage: (rows: Record<string, string>[]): ImportValidationResult => {
      const stagedRows: StagedRow[] = [];
      const errorReportLines: string[] = ['Row Number,Field,Provided Value,Error Description'];

      rows.forEach((row, idx) => {
        const rowNumber = idx + 2;
        const errors: string[] = [];

        const challanNumber = (row['challannumber'] || row['challan'] || '').trim().toUpperCase();
        const date = (row['date'] || new Date().toISOString().split('T')[0]).trim();
        const customer = (row['customerreference'] || row['customer'] || '').trim();
        const company = (row['companyname'] || row['company'] || '').trim();
        const deliveryAddress = (row['deliveryaddress'] || row['address'] || '').trim();
        const phone = (row['customerphone'] || row['phone'] || '').trim();
        const itemSku = (row['itemsku'] || row['sku'] || 'SKU-GEN').trim();
        const itemName = (row['itemname'] || row['item'] || 'General Retail Good').trim();
        const qty = parseFloat((row['quantity'] || row['qty'] || '1').replace(/[^0-9.]/g, '')) || 0;
        const price = parseFloat((row['unitprice'] || row['price'] || '0').replace(/[^0-9.]/g, '')) || 0;
        const notes = (row['notes'] || '').trim();

        if (!challanNumber) {
          errors.push('Challan Number is required.');
          errorReportLines.push(`${rowNumber},Challan Number,"","Challan number cannot be empty"`);
        }

        if (!customer) {
          errors.push('Customer Reference is required.');
          errorReportLines.push(`${rowNumber},Customer Reference,"","Recipient customer name is mandatory"`);
        }

        if (!deliveryAddress) {
          errors.push('Delivery Address is required for dispatch.');
          errorReportLines.push(`${rowNumber},Delivery Address,"","Destination address missing"`);
        }

        if (qty <= 0) {
          errors.push('Dispatch quantity must be greater than zero.');
          errorReportLines.push(`${rowNumber},Quantity,"${qty}","Quantity must be positive"`);
        }

        stagedRows.push({
          rowNumber,
          raw: row,
          isValid: errors.length === 0,
          errors,
          parsedData: {
            challanNumber,
            date,
            customer,
            company,
            deliveryAddress,
            phone,
            itemSku,
            itemName,
            qty,
            price,
            notes,
          },
        });
      });

      return {
        totalRows: stagedRows.length,
        validCount: stagedRows.filter((r) => r.isValid).length,
        invalidCount: stagedRows.filter((r) => !r.isValid).length,
        duplicateCount: 0,
        stagedRows,
        headers: MODULE_REGISTRY.CHALLANS.templateHeaders,
        errorReportCsv: errorReportLines.join('\n'),
      };
    },
    commitBatch: (stagedRows: StagedRow[]) => {
      const validRows = stagedRows.filter((r) => r.isValid);
      // Group items by challan number to build composite dispatch sales
      const challanMap = new Map<string, any[]>();
      validRows.forEach((r) => {
        const cNum = r.parsedData.challanNumber;
        if (!challanMap.has(cNum)) challanMap.set(cNum, []);
        challanMap.get(cNum)!.push(r.parsedData);
      });

      let successCount = 0;
      challanMap.forEach((items, cNum) => {
        const first = items[0];
        const lineItems: CartItem[] = items.map((it, idx) => ({
          product: {
            id: `prod_ch_${Date.now()}_${idx}`,
            sku: it.itemSku,
            barcode: it.itemSku,
            hsn: '9983',
            name: it.itemName,
            categoryId: 'cat_gen',
            categoryName: 'General Goods',
            unit: 'PCS',
            costPrice: it.price * 0.7,
            sellingPrice: it.price,
            gstRate: 18,
            currentStock: 100,
            minStockAlert: 5,
            isActive: true,
            updatedAt: new Date().toISOString(),
          },
          quantity: it.qty,
          unitPrice: it.price,
          discountPercent: 0,
          discountAmount: 0,
          taxableAmount: it.qty * it.price,
          cgstAmount: (it.qty * it.price * 0.18) / 2,
          sgstAmount: (it.qty * it.price * 0.18) / 2,
          igstAmount: 0,
          total: it.qty * it.price * 1.18,
        }));

        const subtotal = lineItems.reduce((s, i) => s + i.taxableAmount, 0);
        const cgst = lineItems.reduce((s, i) => s + i.cgstAmount, 0);
        const sgst = lineItems.reduce((s, i) => s + i.sgstAmount, 0);
        const grandTotal = Math.round(subtotal + cgst + sgst);

        const newSale: Sale = {
          id: `sale_dc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          receiptNumber: cNum,
          invoiceNumber: cNum,
          organizationId: INITIAL_ORGANIZATION.id,
          branchId: 'branch_indiranagar',
          branchName: 'Bengaluru Indiranagar Hub',
          cashierId: 'usr_manager_01',
          cashierName: 'Rajesh Sharma',
          customerName: first.customer,
          companyName: first.company || undefined,
          customerPhone: first.phone || undefined,
          shippingAddress: first.deliveryAddress,
          billingAddress: first.deliveryAddress,
          items: lineItems,
          subtotal,
          discountTotal: 0,
          taxableTotal: subtotal,
          cgstTotal: cgst,
          sgstTotal: sgst,
          igstTotal: 0,
          roundOff: grandTotal - (subtotal + cgst + sgst),
          grandTotal,
          paymentStatus: 'PAID',
          dueDate: first.date,
          payments: [
            {
              id: `pay_dc_${Date.now()}`,
              saleId: `sale_dc_${Date.now()}`,
              method: 'CASH',
              amount: grandTotal,
              gatewayStatus: 'VERIFIED',
              timestamp: new Date().toISOString(),
            },
          ],
          notes: `Delivery Challan dispatch: ${first.notes || 'Dispatched via local transport'}`,
          isOfflineCreated: true,
          syncStatus: 'SYNCED',
          createdAt: new Date(first.date).toISOString(),
        };

        offlineStore.saveInvoice(newSale);
        successCount++;
      });

      return {
        successCount,
        updatedCount: 0,
        errorCount: stagedRows.length - validRows.length,
        message: `Successfully registered ${successCount} delivery challans with line-item dispatch records.`,
      };
    },
    exportCsv: (searchTerm?: string) => {
      let sales = offlineStore.getSales();
      if (searchTerm?.trim()) {
        const q = searchTerm.toLowerCase().trim();
        sales = sales.filter(
          (s) =>
            s.receiptNumber.toLowerCase().includes(q) ||
            s.invoiceNumber.toLowerCase().includes(q) ||
            (s.customerName && s.customerName.toLowerCase().includes(q)) ||
            (s.shippingAddress && s.shippingAddress.toLowerCase().includes(q))
        );
      }

      const headers = [
        'Challan Number',
        'Dispatch Date',
        'Customer Name',
        'Company Name',
        'Delivery Address',
        'Phone',
        'Consignment Total Items',
        'Dispatch Value (INR)',
        'Delivery Verification Status',
        'Notes',
      ];

      const rows = sales.map((s) => [
        sanitizeCsvField(s.receiptNumber),
        s.createdAt.split('T')[0],
        sanitizeCsvField(s.customerName || 'Walk-in Client'),
        sanitizeCsvField(s.companyName || ''),
        sanitizeCsvField(s.shippingAddress || s.billingAddress || 'Local Indiranagar Counter'),
        sanitizeCsvField(s.customerPhone || ''),
        s.items.reduce((cnt, i) => cnt + i.quantity, 0),
        s.grandTotal.toFixed(2),
        s.paymentStatus === 'PAID' ? 'Delivered & Settled' : 'Out for Dispatch',
        sanitizeCsvField(s.notes || ''),
      ]);

      const content = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      return {
        filename: `SLATE_Delivery_Challans_Export_${new Date().toISOString().split('T')[0]}.csv`,
        content,
        count: sales.length,
      };
    },
  },

  PAYMENTS: {
    name: 'Payments Received',
    slug: 'PAYMENTS',
    templateFileName: 'SLATE_Payments_Received_Import_Template.csv',
    templateHeaders: [
      'Payment Date*',
      'Customer Reference*',
      'Customer Phone',
      'Payment Method*',
      'Amount*',
      'Transaction Reference',
      'Invoice Number',
      'Notes',
    ],
    exampleRow: [
      '2026-10-15',
      'Ramesh Kumar',
      '+91 98450 12345',
      'UPI',
      '5000.00',
      'UPI-20261015-8899',
      'INV-26-0450',
      'Partial settlement of pending credit balance',
    ],
    storeByOptions: [
      { id: 'DATE_DESC', label: 'Payment Date: Most Recent', desc: 'Chronological receipt audit trail' },
      { id: 'AMOUNT_DESC', label: 'Payment Amount: High to Low', desc: 'Rank largest financial inward settlements' },
      { id: 'METHOD', label: 'Payment Method (UPI, Cash, Card)', desc: 'Group by banking or cash drawer channel' },
      { id: 'CUSTOMER', label: 'Customer Name (A–Z)', desc: 'Alphabetical recipient grouping' },
    ],
    validateAndStage: (rows: Record<string, string>[]): ImportValidationResult => {
      const stagedRows: StagedRow[] = [];
      const errorReportLines: string[] = ['Row Number,Field,Provided Value,Error Description'];
      const validMethods = ['CASH', 'UPI', 'CARD', 'NEFT/RTGS', 'CREDIT'];

      rows.forEach((row, idx) => {
        const rowNumber = idx + 2;
        const errors: string[] = [];

        const date = (row['paymentdate'] || row['date'] || new Date().toISOString().split('T')[0]).trim();
        const customer = (row['customerreference'] || row['customer'] || row['name'] || '').trim();
        const phone = (row['customerphone'] || row['phone'] || '').trim();
        let method = (row['paymentmethod'] || row['method'] || 'UPI').trim().toUpperCase();
        if (!validMethods.includes(method)) method = 'UPI';

        const amount = parseFloat((row['amount'] || '0').replace(/[^0-9.]/g, '')) || 0;
        const ref = (row['transactionreference'] || row['reference'] || row['utr'] || `REC-${Date.now()}-${idx}`).trim();
        const invoiceRef = (row['invoicenumber'] || row['invoice'] || '').trim();
        const notes = (row['notes'] || '').trim();

        if (!customer) {
          errors.push('Customer Reference is required.');
          errorReportLines.push(`${rowNumber},Customer Reference,"","Payer customer name is mandatory"`);
        }

        if (amount <= 0) {
          errors.push('Payment Amount must be greater than zero.');
          errorReportLines.push(`${rowNumber},Amount,"${amount}","Amount must be positive number"`);
        }

        stagedRows.push({
          rowNumber,
          raw: row,
          isValid: errors.length === 0,
          errors,
          parsedData: {
            date,
            customer,
            phone,
            method,
            amount,
            ref,
            invoiceRef,
            notes,
          },
        });
      });

      return {
        totalRows: stagedRows.length,
        validCount: stagedRows.filter((r) => r.isValid).length,
        invalidCount: stagedRows.filter((r) => !r.isValid).length,
        duplicateCount: 0,
        stagedRows,
        headers: MODULE_REGISTRY.PAYMENTS.templateHeaders,
        errorReportCsv: errorReportLines.join('\n'),
      };
    },
    commitBatch: (stagedRows: StagedRow[]) => {
      const validRows = stagedRows.filter((r) => r.isValid);
      const customers = offlineStore.getCustomers();

      validRows.forEach((r) => {
        const data = r.parsedData;
        const matchedCust = customers.find(
          (c) =>
            c.name.toLowerCase() === data.customer.toLowerCase() ||
            (data.phone && c.phone.replace(/\D/g, '') === data.phone.replace(/\D/g, ''))
        );

        if (matchedCust) {
          offlineStore.allocateCustomerPayment(
            matchedCust.id,
            data.amount,
            data.method === 'NEFT/RTGS' ? 'NEFT/RTGS' : data.method,
            data.ref
          );
        }
      });

      return {
        successCount: validRows.length,
        updatedCount: 0,
        errorCount: stagedRows.length - validRows.length,
        message: `Successfully allocated and recorded ${validRows.length} customer payment receipts.`,
      };
    },
    exportCsv: (searchTerm?: string) => {
      const sales = offlineStore.getSales();
      const paymentsList: {
        date: string;
        id: string;
        customer: string;
        phone: string;
        method: string;
        amount: number;
        ref: string;
        invoice: string;
      }[] = [];

      sales.forEach((s) => {
        s.payments.forEach((p) => {
          paymentsList.push({
            date: p.timestamp ? p.timestamp.split('T')[0] : s.createdAt.split('T')[0],
            id: p.id,
            customer: s.customerName || 'Walk-in Client',
            phone: s.customerPhone || '',
            method: p.method,
            amount: p.amount,
            ref: p.utrOrRef || s.receiptNumber,
            invoice: s.invoiceNumber,
          });
        });
      });

      let filtered = paymentsList;
      if (searchTerm?.trim()) {
        const q = searchTerm.toLowerCase().trim();
        filtered = filtered.filter(
          (p) =>
            p.customer.toLowerCase().includes(q) ||
            p.invoice.toLowerCase().includes(q) ||
            p.ref.toLowerCase().includes(q)
        );
      }

      const headers = [
        'Payment Date',
        'Transaction ID',
        'Customer Name',
        'Customer Phone',
        'Payment Method',
        'Amount (INR)',
        'Reference / UTR',
        'Linked Invoice Number',
        'Status',
      ];

      const rows = filtered.map((p) => [
        p.date,
        p.id,
        sanitizeCsvField(p.customer),
        sanitizeCsvField(p.phone),
        p.method,
        p.amount.toFixed(2),
        sanitizeCsvField(p.ref),
        sanitizeCsvField(p.invoice),
        'Verified & Settled',
      ]);

      const content = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      return {
        filename: `SLATE_Payments_Received_${new Date().toISOString().split('T')[0]}.csv`,
        content,
        count: filtered.length,
      };
    },
  },

  EXPENSES: {
    name: 'Operating Expenses',
    slug: 'EXPENSES',
    templateFileName: 'SLATE_Expenses_Import_Template.csv',
    templateHeaders: [
      'Date*',
      'Category*',
      'Vendor*',
      'Amount*',
      'GST Paid',
      'Payment Mode*',
      'Invoice Reference',
      'Notes',
    ],
    exampleRow: [
      '2026-10-12',
      'Store Maintenance',
      'Apex Facility Solutions',
      '4500.00',
      '810.00',
      'UPI',
      'INV-APEX-9921',
      'Quarterly deep cleaning and store air conditioning servicing',
    ],
    storeByOptions: [
      { id: 'DATE_DESC', label: 'Expense Date: Most Recent', desc: 'Chronological audit outflow ledger' },
      { id: 'AMOUNT_DESC', label: 'Highest Amount', desc: 'Prioritize largest overhead expenses' },
      { id: 'CATEGORY', label: 'Expense Category', desc: 'Group by Rent, Utilities, Wages, Logistics, etc.' },
      { id: 'VENDOR', label: 'Vendor Name (A–Z)', desc: 'Alphabetical pay-to vendor ranking' },
    ],
    validateAndStage: (rows: Record<string, string>[]): ImportValidationResult => {
      const stagedRows: StagedRow[] = [];
      const errorReportLines: string[] = ['Row Number,Field,Provided Value,Error Description'];
      const validCategories = [
        'Rent',
        'Staff Wages',
        'Utilities & Power',
        'Inventory Logistics',
        'Store Maintenance',
        'Marketing',
      ];
      const validModes = ['UPI', 'NEFT/RTGS', 'CASH', 'CARD'];

      rows.forEach((row, idx) => {
        const rowNumber = idx + 2;
        const errors: string[] = [];

        const date = (row['date'] || new Date().toISOString().split('T')[0]).trim();
        let category = (row['category'] || 'Store Maintenance').trim() as Expense['category'];
        if (!validCategories.includes(category)) category = 'Store Maintenance';

        const vendor = (row['vendor'] || row['vendorname'] || '').trim();
        const amount = parseFloat((row['amount'] || '0').replace(/[^0-9.]/g, '')) || 0;
        const gstPaid = parseFloat((row['gstpaid'] || row['gst'] || '0').replace(/[^0-9.]/g, '')) || 0;
        let mode = (row['paymentmode'] || row['mode'] || 'UPI').trim().toUpperCase() as Expense['paymentMode'];
        if (!validModes.includes(mode)) mode = 'UPI';

        const invoiceRef = (row['invoicereference'] || row['invoiceref'] || '').trim();
        const notes = (row['notes'] || '').trim();

        if (!vendor || vendor.length < 2) {
          errors.push('Vendor Name is required.');
          errorReportLines.push(`${rowNumber},Vendor,"${sanitizeCsvField(vendor)}","Vendor name is mandatory"`);
        }

        if (amount <= 0) {
          errors.push('Expense Amount must be greater than zero.');
          errorReportLines.push(`${rowNumber},Amount,"${amount}","Amount must be positive number"`);
        }

        stagedRows.push({
          rowNumber,
          raw: row,
          isValid: errors.length === 0,
          errors,
          parsedData: {
            organizationId: INITIAL_ORGANIZATION.id,
            branchId: 'branch_indiranagar',
            category,
            vendor,
            date,
            amount,
            gstPaid,
            isGstInputEligible: gstPaid > 0,
            paymentMode: mode,
            invoiceRef: invoiceRef || undefined,
            notes: notes || undefined,
          },
        });
      });

      return {
        totalRows: stagedRows.length,
        validCount: stagedRows.filter((r) => r.isValid).length,
        invalidCount: stagedRows.filter((r) => !r.isValid).length,
        duplicateCount: 0,
        stagedRows,
        headers: MODULE_REGISTRY.EXPENSES.templateHeaders,
        errorReportCsv: errorReportLines.join('\n'),
      };
    },
    commitBatch: (stagedRows: StagedRow[]) => {
      const validRows = stagedRows.filter((r) => r.isValid);
      validRows.forEach((r) => {
        offlineStore.addExpense(r.parsedData as Omit<Expense, 'id'>);
      });
      return {
        successCount: validRows.length,
        updatedCount: 0,
        errorCount: stagedRows.length - validRows.length,
        message: `Successfully booked ${validRows.length} operating expenses to store ledger.`,
      };
    },
    exportCsv: (searchTerm?: string) => {
      let expenses = offlineStore.getExpenses();
      if (searchTerm?.trim()) {
        const q = searchTerm.toLowerCase().trim();
        expenses = expenses.filter(
          (e) =>
            e.vendor.toLowerCase().includes(q) ||
            e.category.toLowerCase().includes(q) ||
            (e.invoiceRef && e.invoiceRef.toLowerCase().includes(q))
        );
      }

      const headers = [
        'Expense Date',
        'Category',
        'Vendor',
        'Gross Amount (INR)',
        'GST Paid (INR)',
        'Claimable GSTR-3B ITC',
        'Payment Mode',
        'Invoice Reference',
        'Notes',
      ];

      const rows = expenses.map((e) => [
        e.date,
        sanitizeCsvField(e.category),
        sanitizeCsvField(e.vendor),
        e.amount.toFixed(2),
        e.gstPaid.toFixed(2),
        e.isGstInputEligible ? 'Yes (Eligible)' : 'No',
        e.paymentMode,
        sanitizeCsvField(e.invoiceRef || ''),
        sanitizeCsvField(e.notes || ''),
      ]);

      const content = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      return {
        filename: `SLATE_Expenses_Export_${new Date().toISOString().split('T')[0]}.csv`,
        content,
        count: expenses.length,
      };
    },
  },
};
