/**
 * SLATE POS — Centralized Double-Entry Accounting Engine & Financial Statement Calculator
 *
 * Enforces strict double-entry invariants across the full business financial lifecycle:
 * - Every posted accounting event satisfies Sum(Debits) === Sum(Credits) to 2 decimal places
 * - Immutable posted entries; corrections use explicit reversing journal entries
 * - Idempotency keys guarantee zero duplicate GL postings on retries or offline syncs
 * - Real-time computation of Trial Balance, Profit & Loss, Balance Sheet, Cash Flow, GST & Budgets
 */

import {
  AccountClass,
  ChartOfAccount,
  JournalEntry,
  JournalEntryLine,
  GeneralLedgerEntry,
  TrialBalanceRow,
  ProfitAndLossReport,
  BalanceSheetReport,
  CashFlowReport,
  GstReportSummary,
  Budget,
  BudgetVarianceRow,
  Sale,
  Expense,
  CreditNote,
  SupplierBill,
  SupplierPayment,
  BankTransaction,
  DebitNote,
} from '../types';

// Standard system account codes used for automated posting across all organizations
export const SYSTEM_ACCOUNT_CODES = {
  CASH: '1010',
  BANK: '1020',
  ACCOUNTS_RECEIVABLE: '1100',
  INVENTORY: '1200',
  INPUT_CGST: '1310',
  INPUT_SGST: '1320',
  INPUT_IGST: '1330',
  FIXED_ASSETS: '1500',
  ACCOUNTS_PAYABLE: '2000',
  OUTPUT_CGST: '2110',
  OUTPUT_SGST: '2120',
  OUTPUT_IGST: '2130',
  CUSTOMER_CREDIT: '2200',
  TERM_LOANS: '2500',
  OWNERS_EQUITY: '3000',
  RETAINED_EARNINGS: '3100',
  OPENING_BALANCE_OFFSET: '3200',
  SALES_REVENUE: '4000',
  SALES_RETURNS: '4100',
  OTHER_INCOME: '4200',
  COGS: '5000',
  PURCHASE_RETURNS: '5050',
  RENT_EXPENSE: '5100',
  STAFF_WAGES: '5200',
  UTILITIES_EXPENSE: '5300',
  LOGISTICS_EXPENSE: '5400',
  MAINTENANCE_EXPENSE: '5500',
  OPERATING_EXPENSE_OTHER: '5600',
  BANK_CHARGES: '5900',
} as const;

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function sumMoney(values: number[]): number {
  return roundMoney(values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0));
}

export function getNormalBalanceSide(accountClass: AccountClass): 'DEBIT' | 'CREDIT' {
  return accountClass === 'ASSET' || accountClass === 'EXPENSE' ? 'DEBIT' : 'CREDIT';
}

/**
 * Generates the default Indian SMB / Retail Chart of Accounts for a given organization.
 */
export function createDefaultChartOfAccounts(organizationId: string, branchId = 'ALL'): ChartOfAccount[] {
  const now = '2026-04-01T00:00:00.000Z';
  const defs: Array<{
    code: string;
    name: string;
    accountClass: AccountClass;
    accountGroup: string;
    parentCode?: string;
    taxApplicable?: boolean;
    gstTag?: ChartOfAccount['gstTag'];
    isSystem?: boolean;
    description: string;
  }> = [
    // ASSETS (1000-1999)
    { code: '1000', name: 'Current Assets', accountClass: 'ASSET', accountGroup: 'Current Assets', isSystem: true, description: 'Parent group for liquid & short-term assets' },
    { code: '1010', name: 'Cash on Hand', accountClass: 'ASSET', accountGroup: 'Cash & Bank', parentCode: '1000', isSystem: true, description: 'Counter cash drawers and petty cash' },
    { code: '1020', name: 'Bank Accounts', accountClass: 'ASSET', accountGroup: 'Cash & Bank', parentCode: '1000', isSystem: true, description: 'Primary operating business bank accounts' },
    { code: '1100', name: 'Accounts Receivable (Sundry Debtors)', accountClass: 'ASSET', accountGroup: 'Accounts Receivable', parentCode: '1000', isSystem: true, description: 'Outstanding balances owed by customers' },
    { code: '1200', name: 'Inventory Asset (Stock-in-Hand)', accountClass: 'ASSET', accountGroup: 'Inventory', parentCode: '1000', isSystem: true, description: 'Merchandise and finished goods held for sale' },
    { code: '1300', name: 'Input Tax Credit (GST Input)', accountClass: 'ASSET', accountGroup: 'Tax Assets', parentCode: '1000', isSystem: true, description: 'GST paid on purchases & eligible expenses' },
    { code: '1310', name: 'Input CGST', accountClass: 'ASSET', accountGroup: 'Tax Assets', parentCode: '1300', taxApplicable: true, gstTag: 'INPUT_CGST', isSystem: true, description: 'Central GST Input Tax Credit' },
    { code: '1320', name: 'Input SGST', accountClass: 'ASSET', accountGroup: 'Tax Assets', parentCode: '1300', taxApplicable: true, gstTag: 'INPUT_SGST', isSystem: true, description: 'State GST Input Tax Credit' },
    { code: '1330', name: 'Input IGST', accountClass: 'ASSET', accountGroup: 'Tax Assets', parentCode: '1300', taxApplicable: true, gstTag: 'INPUT_IGST', isSystem: true, description: 'Integrated GST Input Tax Credit' },
    { code: '1500', name: 'Fixed Assets & Equipment', accountClass: 'ASSET', accountGroup: 'Fixed Assets', isSystem: true, description: 'POS hardware, fixtures, computers, and store equipment' },

    // LIABILITIES (2000-2999)
    { code: '2000', name: 'Accounts Payable (Sundry Creditors)', accountClass: 'LIABILITY', accountGroup: 'Accounts Payable', isSystem: true, description: 'Unpaid supplier bills and trade creditors' },
    { code: '2100', name: 'Duties & Taxes Payable (GST Output)', accountClass: 'LIABILITY', accountGroup: 'Tax Liabilities', isSystem: true, description: 'GST collected on sales payable to authorities' },
    { code: '2110', name: 'Output CGST', accountClass: 'LIABILITY', accountGroup: 'Tax Liabilities', parentCode: '2100', taxApplicable: true, gstTag: 'OUTPUT_CGST', isSystem: true, description: 'Central GST Output Tax Liability' },
    { code: '2120', name: 'Output SGST', accountClass: 'LIABILITY', accountGroup: 'Tax Liabilities', parentCode: '2100', taxApplicable: true, gstTag: 'OUTPUT_SGST', isSystem: true, description: 'State GST Output Tax Liability' },
    { code: '2130', name: 'Output IGST', accountClass: 'LIABILITY', accountGroup: 'Tax Liabilities', parentCode: '2100', taxApplicable: true, gstTag: 'OUTPUT_IGST', isSystem: true, description: 'Integrated GST Output Tax Liability' },
    { code: '2200', name: 'Customer Credit Balances & Advances', accountClass: 'LIABILITY', accountGroup: 'Current Liabilities', isSystem: true, description: 'Unapplied customer credit notes and advances' },
    { code: '2500', name: 'Long-Term Borrowings & Loans', accountClass: 'LIABILITY', accountGroup: 'Long-Term Liabilities', isSystem: true, description: 'Working capital facilities and business term loans' },

    // EQUITY (3000-3999)
    { code: '3000', name: 'Owner Capital / Share Capital', accountClass: 'EQUITY', accountGroup: 'Capital', isSystem: true, description: 'Subscribed capital and owner investments' },
    { code: '3100', name: 'Retained Earnings', accountClass: 'EQUITY', accountGroup: 'Reserves & Surplus', isSystem: true, description: 'Accumulated net profits retained in the business' },
    { code: '3200', name: 'Opening Balance Equity', accountClass: 'EQUITY', accountGroup: 'Opening Adjustments', isSystem: true, description: 'Contra equity account for opening balance migrations' },

    // INCOME (4000-4999)
    { code: '4000', name: 'Sales Revenue', accountClass: 'INCOME', accountGroup: 'Direct Income', taxApplicable: true, isSystem: true, description: 'Gross retail and wholesale invoice revenue' },
    { code: '4100', name: 'Sales Returns & Allowances', accountClass: 'INCOME', accountGroup: 'Direct Income', parentCode: '4000', isSystem: true, description: 'Contra-revenue account for customer credit notes and returns' },
    { code: '4200', name: 'Other Operating Income', accountClass: 'INCOME', accountGroup: 'Indirect Income', isSystem: true, description: 'Interest received, freight recovered, and miscellaneous income' },

    // EXPENSES (5000-5999)
    { code: '5000', name: 'Cost of Goods Sold (COGS)', accountClass: 'EXPENSE', accountGroup: 'Direct Expenses', isSystem: true, description: 'Direct cost of inventory sold to customers' },
    { code: '5050', name: 'Purchase Returns & Rebates', accountClass: 'EXPENSE', accountGroup: 'Direct Expenses', parentCode: '5000', isSystem: true, description: 'Contra-expense for supplier debit notes and purchase returns' },
    { code: '5100', name: 'Store & Office Rent', accountClass: 'EXPENSE', accountGroup: 'Operating Expenses', isSystem: true, description: 'Commercial lease and warehouse rental costs' },
    { code: '5200', name: 'Staff Salaries & Wages', accountClass: 'EXPENSE', accountGroup: 'Operating Expenses', isSystem: true, description: 'Payroll, staff allowances, and store incentives' },
    { code: '5300', name: 'Utilities, Power & Internet', accountClass: 'EXPENSE', accountGroup: 'Operating Expenses', isSystem: true, description: 'Electricity, water, broadband, and telecom expenses' },
    { code: '5400', name: 'Freight & Inventory Logistics', accountClass: 'EXPENSE', accountGroup: 'Operating Expenses', isSystem: true, description: 'Inward/outward courier, transport, and warehousing' },
    { code: '5500', name: 'Repairs & Store Maintenance', accountClass: 'EXPENSE', accountGroup: 'Operating Expenses', isSystem: true, description: 'Equipment servicing, upkeep, and facility repairs' },
    { code: '5600', name: 'General & Administrative Expenses', accountClass: 'EXPENSE', accountGroup: 'Operating Expenses', isSystem: true, description: 'Office supplies, professional fees, and misc expenses' },
    { code: '5900', name: 'Bank Charges & Reconciliation Adjustments', accountClass: 'EXPENSE', accountGroup: 'Financial Charges', isSystem: true, description: 'Payment gateway fees, bank charges, and reconciliation variances' },
  ];

  const byCode = new Map<string, string>();
  const accounts: ChartOfAccount[] = defs.map((def) => {
    const id = `coa_${organizationId}_${def.code}`;
    byCode.set(def.code, id);
    return {
      id,
      organizationId,
      branchId,
      code: def.code,
      name: def.name,
      accountClass: def.accountClass,
      accountGroup: def.accountGroup,
      parentAccountId: undefined,
      parentCode: def.parentCode,
      normalBalance: getNormalBalanceSide(def.accountClass),
      openingBalance: 0,
      currentBalance: 0,
      taxApplicable: Boolean(def.taxApplicable),
      gstTag: def.gstTag,
      isSystem: Boolean(def.isSystem),
      isActive: true,
      description: def.description,
      createdAt: now,
      updatedAt: now,
    };
  });

  // Resolve parentAccountId references
  return accounts.map((acc) => ({
    ...acc,
    parentAccountId: acc.parentCode ? byCode.get(acc.parentCode) : undefined,
  }));
}

export function findAccountByCode(
  accounts: ChartOfAccount[],
  organizationId: string,
  code: string
): ChartOfAccount | undefined {
  return (
    accounts.find((a) => a.organizationId === organizationId && a.code === code) ||
    accounts.find((a) => a.code === code)
  );
}

export function mapExpenseCategoryToAccountCode(category: Expense['category']): string {
  switch (category) {
    case 'Rent':
      return SYSTEM_ACCOUNT_CODES.RENT_EXPENSE;
    case 'Staff Wages':
      return SYSTEM_ACCOUNT_CODES.STAFF_WAGES;
    case 'Utilities & Power':
      return SYSTEM_ACCOUNT_CODES.UTILITIES_EXPENSE;
    case 'Inventory Logistics':
      return SYSTEM_ACCOUNT_CODES.LOGISTICS_EXPENSE;
    case 'Store Maintenance':
      return SYSTEM_ACCOUNT_CODES.MAINTENANCE_EXPENSE;
    default:
      return SYSTEM_ACCOUNT_CODES.OPERATING_EXPENSE_OTHER;
  }
}

export interface DoubleEntryValidationResult {
  valid: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  error?: string;
}

/**
 * Validates that a set of journal lines strictly satisfies double-entry accounting rules.
 */
export function validateDoubleEntryLines(
  lines: Array<{ accountId: string; debit: number; credit: number }>,
  accounts?: ChartOfAccount[]
): DoubleEntryValidationResult {
  if (!Array.isArray(lines) || lines.length < 2) {
    return {
      valid: false,
      totalDebit: 0,
      totalCredit: 0,
      difference: 0,
      error: 'A journal entry must contain at least two lines (debit and credit).',
    };
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dr = roundMoney(Number(line.debit || 0));
    const cr = roundMoney(Number(line.credit || 0));

    if (!line.accountId) {
      return {
        valid: false,
        totalDebit,
        totalCredit,
        difference: roundMoney(totalDebit - totalCredit),
        error: `Line ${i + 1}: Account selection is required.`,
      };
    }

    if (accounts) {
      const account = accounts.find((a) => a.id === line.accountId);
      if (!account) {
        return {
          valid: false,
          totalDebit,
          totalCredit,
          difference: roundMoney(totalDebit - totalCredit),
          error: `Line ${i + 1}: Selected account does not exist in Chart of Accounts.`,
        };
      }
      if (!account.isActive) {
        return {
          valid: false,
          totalDebit,
          totalCredit,
          difference: roundMoney(totalDebit - totalCredit),
          error: `Line ${i + 1}: Account "${account.code} ${account.name}" is inactive and cannot accept postings.`,
        };
      }
    }

    if (dr < 0 || cr < 0) {
      return {
        valid: false,
        totalDebit,
        totalCredit,
        difference: roundMoney(totalDebit - totalCredit),
        error: `Line ${i + 1}: Debit and credit amounts cannot be negative.`,
      };
    }

    if (dr === 0 && cr === 0) {
      return {
        valid: false,
        totalDebit,
        totalCredit,
        difference: roundMoney(totalDebit - totalCredit),
        error: `Line ${i + 1}: Line must have either a positive debit or credit amount.`,
      };
    }

    if (dr > 0 && cr > 0) {
      return {
        valid: false,
        totalDebit,
        totalCredit,
        difference: roundMoney(totalDebit - totalCredit),
        error: `Line ${i + 1}: A single line cannot contain both debit and credit values.`,
      };
    }

    totalDebit = roundMoney(totalDebit + dr);
    totalCredit = roundMoney(totalCredit + cr);
  }

  const difference = roundMoney(Math.abs(totalDebit - totalCredit));
  if (totalDebit <= 0 || difference > 0.01) {
    return {
      valid: false,
      totalDebit,
      totalCredit,
      difference,
      error: `Unbalanced entry: Total Debits (₹${totalDebit.toFixed(2)}) must equal Total Credits (₹${totalCredit.toFixed(2)}). Difference: ₹${difference.toFixed(2)}.`,
    };
  }

  return {
    valid: true,
    totalDebit,
    totalCredit,
    difference: 0,
  };
}

/**
 * Helper to create a JournalEntryLine from a ChartOfAccount.
 */
function makeLine(
  account: ChartOfAccount,
  debit: number,
  credit: number,
  description: string,
  partyType?: JournalEntryLine['partyType'],
  partyId?: string,
  partyName?: string
): JournalEntryLine {
  return {
    id: `jl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    accountId: account.id,
    accountCode: account.code,
    accountName: account.name,
    accountClass: account.accountClass,
    debit: roundMoney(debit),
    credit: roundMoney(credit),
    description,
    partyType,
    partyId,
    partyName,
  };
}

/**
 * Builds balanced double-entry lines for a Sales Invoice (+ COGS/Inventory movement).
 */
export function buildSaleJournalLines(sale: Sale, accounts: ChartOfAccount[]): JournalEntryLine[] {
  const orgId = sale.organizationId;
  const cashAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.CASH);
  const bankAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.BANK);
  const arAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
  const revAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.SALES_REVENUE);
  const cgstAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.OUTPUT_CGST);
  const sgstAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.OUTPUT_SGST);
  const igstAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.OUTPUT_IGST);
  const cogsAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.COGS);
  const invAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.INVENTORY);

  if (!cashAcc || !bankAcc || !arAcc || !revAcc) return [];

  const lines: JournalEntryLine[] = [];
  const cashPaid = sumMoney(sale.payments.filter((p) => p.method === 'CASH').map((p) => p.amount));
  const bankPaid = sumMoney(
    sale.payments.filter((p) => p.method === 'UPI' || p.method === 'CARD' || p.method === 'SPLIT').map((p) => p.amount)
  );
  const totalCollected = roundMoney(cashPaid + bankPaid);
  const receivablePortion = roundMoney(Math.max(0, sale.grandTotal - totalCollected));

  if (cashPaid > 0) {
    lines.push(makeLine(cashAcc, cashPaid, 0, `Cash receipt on ${sale.invoiceNumber}`, 'CUSTOMER', sale.customerId, sale.customerName));
  }
  if (bankPaid > 0) {
    lines.push(makeLine(bankAcc, bankPaid, 0, `UPI/Card receipt on ${sale.invoiceNumber}`, 'CUSTOMER', sale.customerId, sale.customerName));
  }
  if (receivablePortion > 0) {
    lines.push(makeLine(arAcc, receivablePortion, 0, `Accounts Receivable on ${sale.invoiceNumber}`, 'CUSTOMER', sale.customerId, sale.customerName));
  }

  const taxSum = roundMoney((sale.cgstTotal || 0) + (sale.sgstTotal || 0) + (sale.igstTotal || 0));
  const revenueCredit = roundMoney(Math.max(0, sale.grandTotal - taxSum));

  if (revenueCredit > 0) {
    lines.push(makeLine(revAcc, 0, revenueCredit, `Sales revenue ${sale.invoiceNumber}`, 'CUSTOMER', sale.customerId, sale.customerName));
  }
  if ((sale.cgstTotal || 0) > 0 && cgstAcc) {
    lines.push(makeLine(cgstAcc, 0, sale.cgstTotal, `Output CGST on ${sale.invoiceNumber}`));
  }
  if ((sale.sgstTotal || 0) > 0 && sgstAcc) {
    lines.push(makeLine(sgstAcc, 0, sale.sgstTotal, `Output SGST on ${sale.invoiceNumber}`));
  }
  if ((sale.igstTotal || 0) > 0 && igstAcc) {
    lines.push(makeLine(igstAcc, 0, sale.igstTotal, `Output IGST on ${sale.invoiceNumber}`));
  }

  // Reconcile any minor sub-rupee rounding diff on debit side if cash+bank+ar differs from grandTotal
  const debitTotal = sumMoney(lines.map((l) => l.debit));
  const creditTotal = sumMoney(lines.map((l) => l.credit));
  const diff = roundMoney(debitTotal - creditTotal);
  if (Math.abs(diff) > 0 && Math.abs(diff) <= 1) {
    if (diff > 0) {
      lines.push(makeLine(revAcc, 0, diff, `Rounding adjustment on ${sale.invoiceNumber}`));
    } else {
      lines.push(makeLine(arAcc, Math.abs(diff), 0, `Rounding adjustment on ${sale.invoiceNumber}`));
    }
  }

  // Perpetual inventory COGS recognition
  const cogsTotal = sumMoney(
    (sale.items || []).map((item) => roundMoney((item.product?.costPrice || 0) * (item.quantity || 0)))
  );
  if (cogsTotal > 0 && cogsAcc && invAcc) {
    lines.push(makeLine(cogsAcc, cogsTotal, 0, `COGS for ${sale.invoiceNumber}`));
    lines.push(makeLine(invAcc, 0, cogsTotal, `Inventory reduction for ${sale.invoiceNumber}`));
  }

  return lines;
}

/**
 * Builds balanced double-entry lines for an Invoice / POS Sale Refund (+ Inventory Restock).
 */
export function buildSaleRefundLines(params: {
  sale: Sale;
  refundAmount: number;
  refundMethod: 'CASH' | 'UPI' | 'BANK';
  restockCostValue?: number;
  accounts: ChartOfAccount[];
}): JournalEntryLine[] {
  const { sale, refundAmount, refundMethod, restockCostValue = 0, accounts } = params;
  const orgId = sale.organizationId;
  const salesRetAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.SALES_RETURNS);
  const cashAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.CASH);
  const bankAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.BANK);
  const arAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
  const cgstAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.OUTPUT_CGST);
  const sgstAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.OUTPUT_SGST);
  const igstAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.OUTPUT_IGST);
  const invAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.INVENTORY);
  const cogsAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.COGS);

  const amt = roundMoney(refundAmount);
  if (!salesRetAcc || amt <= 0) return [];

  const ratio = sale.grandTotal > 0 ? Math.min(1, amt / sale.grandTotal) : 1;
  const cgstRev = roundMoney((sale.cgstTotal || 0) * ratio);
  const sgstRev = roundMoney((sale.sgstTotal || 0) * ratio);
  const igstRev = roundMoney((sale.igstTotal || 0) * ratio);
  const netReturn = roundMoney(Math.max(0, amt - cgstRev - sgstRev - igstRev));

  const lines: JournalEntryLine[] = [];
  if (netReturn > 0) {
    lines.push(makeLine(salesRetAcc, netReturn, 0, `Sales refund on ${sale.invoiceNumber}`, 'CUSTOMER', sale.customerId, sale.customerName));
  }
  if (cgstRev > 0 && cgstAcc) {
    lines.push(makeLine(cgstAcc, cgstRev, 0, `Output CGST refund on ${sale.invoiceNumber}`));
  }
  if (sgstRev > 0 && sgstAcc) {
    lines.push(makeLine(sgstAcc, sgstRev, 0, `Output SGST refund on ${sale.invoiceNumber}`));
  }
  if (igstRev > 0 && igstAcc) {
    lines.push(makeLine(igstAcc, igstRev, 0, `Output IGST refund on ${sale.invoiceNumber}`));
  }

  const paidTotal = sumMoney((sale.payments || []).map((p) => p.amount));
  const settlementAcc =
    paidTotal <= 0 && arAcc
      ? arAcc
      : refundMethod === 'CASH'
        ? cashAcc
        : bankAcc;

  if (!settlementAcc) return [];
  const totalDr = sumMoney(lines.map((l) => l.debit));
  lines.push(makeLine(settlementAcc, 0, totalDr, `Refund payout (${paidTotal <= 0 ? 'AR Credit' : refundMethod}) on ${sale.invoiceNumber}`, 'CUSTOMER', sale.customerId, sale.customerName));

  const restockCost = roundMoney(restockCostValue);
  if (restockCost > 0 && invAcc && cogsAcc) {
    lines.push(makeLine(invAcc, restockCost, 0, `Inventory restock from ${sale.invoiceNumber} refund`));
    lines.push(makeLine(cogsAcc, 0, restockCost, `COGS reversal on ${sale.invoiceNumber} refund`));
  }

  return lines;
}

/**
 * Builds balanced double-entry lines for Customer Payment Allocation & Advance Credits.
 */
export function buildCustomerPaymentLines(params: {
  organizationId: string;
  customerId: string;
  customerName: string;
  amount: number;
  allocatedToInvoices?: number;
  unallocatedAdvance?: number;
  method: string;
  reference: string;
  accounts: ChartOfAccount[];
}): JournalEntryLine[] {
  const {
    organizationId,
    customerId,
    customerName,
    amount,
    allocatedToInvoices,
    unallocatedAdvance,
    method,
    reference,
    accounts,
  } = params;
  const settlementCode = method === 'CASH' ? SYSTEM_ACCOUNT_CODES.CASH : SYSTEM_ACCOUNT_CODES.BANK;
  const settlementAcc = findAccountByCode(accounts, organizationId, settlementCode);
  const arAcc = findAccountByCode(accounts, organizationId, SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
  const advanceAcc = findAccountByCode(accounts, organizationId, SYSTEM_ACCOUNT_CODES.CUSTOMER_CREDIT);
  const totalAmt = roundMoney(amount);
  if (!settlementAcc || !arAcc || totalAmt <= 0) return [];

  const advAmt = roundMoney(Math.max(0, Math.min(totalAmt, unallocatedAdvance ?? 0)));
  const arAmt = roundMoney(
    allocatedToInvoices !== undefined
      ? Math.max(0, Math.min(totalAmt, allocatedToInvoices))
      : Math.max(0, totalAmt - advAmt)
  );
  const remaining = roundMoney(Math.max(0, totalAmt - arAmt));

  const lines: JournalEntryLine[] = [
    makeLine(settlementAcc, totalAmt, 0, `Customer receipt (${method}) ref ${reference}`, 'CUSTOMER', customerId, customerName),
  ];

  if (arAmt > 0) {
    lines.push(makeLine(arAcc, 0, arAmt, `AR settlement from ${customerName} (${reference})`, 'CUSTOMER', customerId, customerName));
  }
  if (remaining > 0) {
    const targetAdvanceAcc = advanceAcc || arAcc;
    lines.push(
      makeLine(
        targetAdvanceAcc,
        0,
        remaining,
        `Customer advance / unallocated credit from ${customerName} (${reference})`,
        'CUSTOMER',
        customerId,
        customerName
      )
    );
  }

  return lines;
}

/**
 * Builds balanced reversing lines by flipping Debit and Credit sides of an existing journal.
 */
export function buildReversalJournalLines(
  originalLines: JournalEntryLine[],
  reason: string
): JournalEntryLine[] {
  return (originalLines || []).map((line) => ({
    id: `jl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    accountId: line.accountId,
    accountCode: line.accountCode,
    accountName: line.accountName,
    accountClass: line.accountClass,
    debit: roundMoney(line.credit),
    credit: roundMoney(line.debit),
    description: `Reversal (${reason}): ${line.description || line.accountName}`,
    partyType: line.partyType,
    partyId: line.partyId,
    partyName: line.partyName,
  }));
}

/**
 * Builds balanced double-entry lines for Credit Note Issuance (Sales Return / Credit).
 */
export function buildCreditNoteLines(
  creditNote: CreditNote,
  accounts: ChartOfAccount[],
  productCostLookup: (productId: string) => number
): JournalEntryLine[] {
  const orgId = creditNote.organizationId;
  const salesRetAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.SALES_RETURNS);
  const arAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
  const cgstAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.OUTPUT_CGST);
  const sgstAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.OUTPUT_SGST);
  const igstAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.OUTPUT_IGST);
  const invAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.INVENTORY);
  const cogsAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.COGS);

  const totalCredit = roundMoney(creditNote.totalCreditAmount ?? creditNote.creditAmount ?? 0);
  if (!salesRetAcc || !arAcc || totalCredit <= 0) return [];

  const cgst = roundMoney(creditNote.cgstTotal || 0);
  const sgst = roundMoney(creditNote.sgstTotal || 0);
  const igst = roundMoney(creditNote.igstTotal || 0);
  const netReturn = roundMoney(Math.max(0, totalCredit - cgst - sgst - igst));

  const lines: JournalEntryLine[] = [];
  if (netReturn > 0) {
    lines.push(makeLine(salesRetAcc, netReturn, 0, `Sales return ${creditNote.creditNoteNumber}`, 'CUSTOMER', creditNote.customerId, creditNote.customerName));
  }
  if (cgst > 0 && cgstAcc) {
    lines.push(makeLine(cgstAcc, cgst, 0, `Output CGST reversal on ${creditNote.creditNoteNumber}`));
  }
  if (sgst > 0 && sgstAcc) {
    lines.push(makeLine(sgstAcc, sgst, 0, `Output SGST reversal on ${creditNote.creditNoteNumber}`));
  }
  if (igst > 0 && igstAcc) {
    lines.push(makeLine(igstAcc, igst, 0, `Output IGST reversal on ${creditNote.creditNoteNumber}`));
  }

  const totalDebits = sumMoney(lines.map((l) => l.debit));
  lines.push(makeLine(arAcc, 0, totalDebits, `Credit note applied to ${creditNote.customerName}`, 'CUSTOMER', creditNote.customerId, creditNote.customerName));

  // If inventory restocked, reverse COGS
  if (creditNote.restockInventory !== false && invAcc && cogsAcc) {
    const restockValue = sumMoney(
      (creditNote.items || []).map((item) => {
        const qty = item.quantity || item.returnedQuantity || 0;
        return roundMoney(productCostLookup(item.productId) * qty);
      })
    );
    if (restockValue > 0) {
      lines.push(makeLine(invAcc, restockValue, 0, `Inventory restock from ${creditNote.creditNoteNumber}`));
      lines.push(makeLine(cogsAcc, 0, restockValue, `COGS reversal for ${creditNote.creditNoteNumber}`));
    }
  }

  return lines;
}

/**
 * Builds balanced double-entry lines for Refunding a Credit Note in Cash/Bank.
 */
export function buildCreditNoteRefundLines(params: {
  creditNote: CreditNote;
  refundAmount: number;
  refundMode: 'CASH' | 'BANK' | 'UPI';
  accounts: ChartOfAccount[];
}): JournalEntryLine[] {
  const { creditNote, refundAmount, refundMode, accounts } = params;
  const arAcc = findAccountByCode(accounts, creditNote.organizationId, SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
  const payAcc = findAccountByCode(
    accounts,
    creditNote.organizationId,
    refundMode === 'CASH' ? SYSTEM_ACCOUNT_CODES.CASH : SYSTEM_ACCOUNT_CODES.BANK
  );
  if (!arAcc || !payAcc || refundAmount <= 0) return [];

  return [
    makeLine(arAcc, refundAmount, 0, `Refund payout settlement for ${creditNote.creditNoteNumber}`, 'CUSTOMER', creditNote.customerId, creditNote.customerName),
    makeLine(payAcc, 0, refundAmount, `Cash/Bank refund for ${creditNote.creditNoteNumber}`, 'CUSTOMER', creditNote.customerId, creditNote.customerName),
  ];
}

/**
 * Builds balanced double-entry lines for a Supplier Bill (Purchase Invoice).
 */
export function buildSupplierBillLines(bill: SupplierBill, accounts: ChartOfAccount[]): JournalEntryLine[] {
  const orgId = bill.organizationId;
  const invAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.INVENTORY);
  const apAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE);
  const inCgstAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.INPUT_CGST);
  const inSgstAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.INPUT_SGST);

  if (!invAcc || !apAcc || bill.totalAmount <= 0) return [];

  const gst = roundMoney(bill.gstTotal || 0);
  const halfGst = roundMoney(gst / 2);
  const remGst = roundMoney(gst - halfGst);
  const netPurchase = roundMoney(Math.max(0, bill.totalAmount - gst));

  const lines: JournalEntryLine[] = [];
  if (netPurchase > 0) {
    lines.push(makeLine(invAcc, netPurchase, 0, `Inventory purchase ${bill.billNumber} (${bill.supplierInvoiceNumber})`, 'SUPPLIER', bill.supplierId, bill.supplierName));
  }
  if (halfGst > 0 && inCgstAcc) {
    lines.push(makeLine(inCgstAcc, halfGst, 0, `Input CGST on ${bill.billNumber}`));
  }
  if (remGst > 0 && inSgstAcc) {
    lines.push(makeLine(inSgstAcc, remGst, 0, `Input SGST on ${bill.billNumber}`));
  }

  const debitTotal = sumMoney(lines.map((l) => l.debit));
  lines.push(makeLine(apAcc, 0, debitTotal, `Accounts Payable to ${bill.supplierName} (${bill.billNumber})`, 'SUPPLIER', bill.supplierId, bill.supplierName));
  return lines;
}

/**
 * Builds balanced double-entry lines for a Supplier Payment.
 */
export function buildSupplierPaymentLines(payment: SupplierPayment, accounts: ChartOfAccount[]): JournalEntryLine[] {
  const orgId = payment.organizationId;
  const apAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE);
  const payCode = payment.paymentMethod === 'CASH' ? SYSTEM_ACCOUNT_CODES.CASH : SYSTEM_ACCOUNT_CODES.BANK;
  const payAcc = findAccountByCode(accounts, orgId, payCode);
  if (!apAcc || !payAcc || payment.amount <= 0) return [];

  return [
    makeLine(apAcc, payment.amount, 0, `AP settlement ${payment.paymentNumber} (${payment.billNumber || ''})`, 'SUPPLIER', payment.supplierId, payment.supplierName),
    makeLine(payAcc, 0, payment.amount, `Payment disbursed via ${payment.paymentMethod} to ${payment.supplierName}`, 'SUPPLIER', payment.supplierId, payment.supplierName),
  ];
}

/**
 * Builds balanced double-entry lines for a Purchase Return / Debit Note.
 */
export function buildDebitNoteLines(debitNote: DebitNote, accounts: ChartOfAccount[]): JournalEntryLine[] {
  const orgId = debitNote.organizationId;
  const apAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE);
  const invAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.INVENTORY);
  const inCgstAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.INPUT_CGST);
  const inSgstAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.INPUT_SGST);
  const inIgstAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.INPUT_IGST);

  if (!apAcc || !invAcc || debitNote.totalAmount <= 0) return [];

  const cgst = roundMoney(debitNote.cgstTotal || 0);
  const sgst = roundMoney(debitNote.sgstTotal || 0);
  const igst = roundMoney(debitNote.igstTotal || 0);
  const netReturn = roundMoney(Math.max(0, debitNote.totalAmount - cgst - sgst - igst));

  const lines: JournalEntryLine[] = [
    makeLine(apAcc, debitNote.totalAmount, 0, `AP reduction via Debit Note ${debitNote.debitNoteNumber}`, 'SUPPLIER', debitNote.supplierId, debitNote.supplierName),
  ];
  if (netReturn > 0) {
    lines.push(makeLine(invAcc, 0, netReturn, `Purchase return stock reduction ${debitNote.debitNoteNumber}`, 'SUPPLIER', debitNote.supplierId, debitNote.supplierName));
  }
  if (cgst > 0 && inCgstAcc) {
    lines.push(makeLine(inCgstAcc, 0, cgst, `Input CGST reversal ${debitNote.debitNoteNumber}`));
  }
  if (sgst > 0 && inSgstAcc) {
    lines.push(makeLine(inSgstAcc, 0, sgst, `Input SGST reversal ${debitNote.debitNoteNumber}`));
  }
  if (igst > 0 && inIgstAcc) {
    lines.push(makeLine(inIgstAcc, 0, igst, `Input IGST reversal ${debitNote.debitNoteNumber}`));
  }

  return lines;
}

/**
 * Builds balanced double-entry lines for an Operating Expense.
 */
export function buildExpenseJournalLines(expense: Expense, accounts: ChartOfAccount[]): JournalEntryLine[] {
  const orgId = expense.organizationId;
  const expCode = mapExpenseCategoryToAccountCode(expense.category);
  const expAcc = findAccountByCode(accounts, orgId, expCode) || findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.OPERATING_EXPENSE_OTHER);
  const payAcc = findAccountByCode(
    accounts,
    orgId,
    expense.paymentMode === 'CASH' ? SYSTEM_ACCOUNT_CODES.CASH : SYSTEM_ACCOUNT_CODES.BANK
  );
  const inCgstAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.INPUT_CGST);
  const inSgstAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.INPUT_SGST);

  if (!expAcc || !payAcc || expense.amount <= 0) return [];

  const gstInput = expense.isGstInputEligible ? roundMoney(expense.gstPaid || 0) : 0;
  const totalOutflow = roundMoney(expense.amount + gstInput);
  const halfGst = roundMoney(gstInput / 2);
  const remGst = roundMoney(gstInput - halfGst);

  const lines: JournalEntryLine[] = [
    makeLine(expAcc, expense.amount, 0, `${expense.category} — ${expense.vendor}`),
  ];
  if (halfGst > 0 && inCgstAcc) {
    lines.push(makeLine(inCgstAcc, halfGst, 0, `Input CGST on ${expense.vendor}`));
  }
  if (remGst > 0 && inSgstAcc) {
    lines.push(makeLine(inSgstAcc, remGst, 0, `Input SGST on ${expense.vendor}`));
  }
  lines.push(makeLine(payAcc, 0, totalOutflow, `Paid via ${expense.paymentMode} to ${expense.vendor}`));
  return lines;
}

/**
 * Builds balanced double-entry lines for a standalone Bank Deposit / Withdrawal / Transfer.
 */
export function buildBankTransactionLines(
  tx: BankTransaction,
  accounts: ChartOfAccount[],
  isCashAccount = false
): JournalEntryLine[] {
  const orgId = tx.organizationId;
  const bankAcc = findAccountByCode(accounts, orgId, isCashAccount ? SYSTEM_ACCOUNT_CODES.CASH : SYSTEM_ACCOUNT_CODES.BANK);
  const cashAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.CASH);
  const bankMainAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.BANK);
  const openingEqAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.OPENING_BALANCE_OFFSET);
  const otherIncAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.OTHER_INCOME);
  const otherExpAcc = findAccountByCode(accounts, orgId, SYSTEM_ACCOUNT_CODES.OPERATING_EXPENSE_OTHER);

  if (!bankAcc || !cashAcc || !bankMainAcc || tx.amount <= 0) return [];

  if (tx.category === 'Opening Balance' && openingEqAcc) {
    return [
      makeLine(bankAcc, tx.amount, 0, `Opening balance for ${tx.bankAccountName || 'Account'}`),
      makeLine(openingEqAcc, 0, tx.amount, `Opening balance equity offset`),
    ];
  }

  if (tx.type === 'TRANSFER' || tx.type === 'TRANSFER_OUT') {
    const destAcc = isCashAccount ? bankMainAcc : cashAcc;
    return [
      makeLine(destAcc, tx.amount, 0, `Transfer in: ${tx.description}`),
      makeLine(bankAcc, 0, tx.amount, `Transfer out: ${tx.description}`),
    ];
  }

  if (tx.type === 'DEPOSIT' || tx.type === 'CASH_DEPOSIT' || tx.type === 'BANK_DEPOSIT') {
    const counterAcc = tx.category === 'Cash Deposit' ? cashAcc : otherIncAcc || openingEqAcc!;
    return [
      makeLine(bankAcc, tx.amount, 0, tx.description),
      makeLine(counterAcc, 0, tx.amount, `Counter entry for ${tx.transactionNumber || tx.referenceNumber}`),
    ];
  }

  if (tx.type === 'WITHDRAWAL' || tx.type === 'CASH_WITHDRAWAL' || tx.type === 'BANK_WITHDRAWAL') {
    const counterAcc = tx.category === 'Cash Withdrawal' ? cashAcc : otherExpAcc || bankMainAcc;
    return [
      makeLine(counterAcc, tx.amount, 0, tx.description),
      makeLine(bankAcc, 0, tx.amount, `Outflow ${tx.transactionNumber || tx.referenceNumber}`),
    ];
  }

  return [];
}

/**
 * Converts a posted JournalEntry into immutable GeneralLedgerEntry rows.
 */
export function expandJournalToGeneralLedger(entry: JournalEntry): GeneralLedgerEntry[] {
  return entry.lines.map((line, index) => ({
    id: `gl_${entry.id}_${index + 1}`,
    organizationId: entry.organizationId,
    branchId: entry.branchId,
    journalEntryId: entry.id,
    journalNumber: entry.journalNumber,
    entryDate: entry.entryDate,
    accountId: line.accountId,
    accountCode: line.accountCode,
    accountName: line.accountName,
    accountClass: line.accountClass,
    debit: roundMoney(line.debit),
    credit: roundMoney(line.credit),
    description: line.description || entry.narration,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    sourceNumber: entry.sourceNumber || entry.referenceNumber,
    partyType: line.partyType,
    partyId: line.partyId,
    partyName: line.partyName,
    postedBy: entry.postedBy || entry.createdBy,
    postedAt: entry.postedAt || entry.createdAt,
  }));
}

/**
 * Recomputes running balances across Chart of Accounts from GL entries.
 */
export function recalculateAccountBalances(
  accounts: ChartOfAccount[],
  glEntries: GeneralLedgerEntry[]
): ChartOfAccount[] {
  const debitSums = new Map<string, number>();
  const creditSums = new Map<string, number>();

  for (const row of glEntries) {
    debitSums.set(row.accountId, roundMoney((debitSums.get(row.accountId) || 0) + row.debit));
    creditSums.set(row.accountId, roundMoney((creditSums.get(row.accountId) || 0) + row.credit));
  }

  return accounts.map((acc) => {
    const dr = debitSums.get(acc.id) || 0;
    const cr = creditSums.get(acc.id) || 0;
    const movement = acc.normalBalance === 'DEBIT' ? roundMoney(dr - cr) : roundMoney(cr - dr);
    return {
      ...acc,
      currentBalance: roundMoney((acc.openingBalance || 0) + movement),
    };
  });
}

/**
 * Computes the Trial Balance from General Ledger entries.
 */
export function computeTrialBalance(
  accounts: ChartOfAccount[],
  glEntries: GeneralLedgerEntry[],
  options?: { organizationId?: string; branchId?: string; startDate?: string; endDate?: string }
): {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
} {
  const filteredAccounts = accounts.filter(
    (a) => !options?.organizationId || a.organizationId === options.organizationId
  );

  const filteredGl = glEntries.filter((row) => {
    if (options?.organizationId && row.organizationId !== options.organizationId) return false;
    if (options?.branchId && options.branchId !== 'ALL' && row.branchId !== options.branchId) return false;
    if (options?.startDate && row.entryDate < options.startDate) return false;
    if (options?.endDate && row.entryDate > options.endDate) return false;
    return true;
  });

  const rows: TrialBalanceRow[] = [];

  for (const acc of filteredAccounts) {
    const accEntries = filteredGl.filter((e) => e.accountId === acc.id);
    const periodDebit = sumMoney(accEntries.map((e) => e.debit));
    const periodCredit = sumMoney(accEntries.map((e) => e.credit));
    const opening = roundMoney(acc.openingBalance || 0);

    const openDr = acc.normalBalance === 'DEBIT' && opening > 0 ? opening : acc.normalBalance === 'CREDIT' && opening < 0 ? Math.abs(opening) : 0;
    const openCr = acc.normalBalance === 'CREDIT' && opening > 0 ? opening : acc.normalBalance === 'DEBIT' && opening < 0 ? Math.abs(opening) : 0;

    const net = roundMoney(openDr + periodDebit - (openCr + periodCredit));
    const closingDebit = net > 0 ? net : 0;
    const closingCredit = net < 0 ? Math.abs(net) : 0;

    if (periodDebit === 0 && periodCredit === 0 && opening === 0) continue;

    rows.push({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      accountClass: acc.accountClass,
      accountGroup: acc.accountGroup,
      openingBalance: opening,
      periodDebit,
      periodCredit,
      closingDebit,
      closingCredit,
    });
  }

  rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  const totalDebit = sumMoney(rows.map((r) => r.closingDebit));
  const totalCredit = sumMoney(rows.map((r) => r.closingCredit));

  return {
    rows,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(roundMoney(totalDebit - totalCredit)) <= 0.01,
  };
}

/**
 * Computes Profit & Loss Statement (Income Statement) strictly from GL postings.
 */
export function computeProfitAndLoss(
  accounts: ChartOfAccount[],
  glEntries: GeneralLedgerEntry[],
  options?: { organizationId?: string; branchId?: string; startDate?: string; endDate?: string }
): ProfitAndLossReport {
  const tb = computeTrialBalance(accounts, glEntries, options);

  const incomeRows = tb.rows
    .filter((r) => r.accountClass === 'INCOME')
    .map((r) => ({
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      accountGroup: r.accountGroup,
      amount: roundMoney(r.closingCredit - r.closingDebit),
    }));

  const directExpenseRows = tb.rows
    .filter((r) => r.accountClass === 'EXPENSE' && r.accountGroup === 'Direct Expenses')
    .map((r) => ({
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      accountGroup: r.accountGroup,
      amount: roundMoney(r.closingDebit - r.closingCredit),
    }));

  const operatingExpenseRows = tb.rows
    .filter((r) => r.accountClass === 'EXPENSE' && r.accountGroup !== 'Direct Expenses')
    .map((r) => ({
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      accountGroup: r.accountGroup,
      amount: roundMoney(r.closingDebit - r.closingCredit),
    }));

  const totalIncome = sumMoney(incomeRows.map((r) => r.amount));
  const totalDirectExpenses = sumMoney(directExpenseRows.map((r) => r.amount));
  const grossProfit = roundMoney(totalIncome - totalDirectExpenses);
  const totalOperatingExpenses = sumMoney(operatingExpenseRows.map((r) => r.amount));
  const netProfit = roundMoney(grossProfit - totalOperatingExpenses);

  return {
    startDate: options?.startDate || '2026-04-01',
    endDate: options?.endDate || new Date().toISOString().slice(0, 10),
    incomeRows,
    directExpenseRows,
    operatingExpenseRows,
    totalIncome,
    totalDirectExpenses,
    grossProfit,
    totalOperatingExpenses,
    netProfit,
  };
}

/**
 * Computes Balance Sheet (Assets = Liabilities + Equity + Current Period Net Profit).
 */
export function computeBalanceSheet(
  accounts: ChartOfAccount[],
  glEntries: GeneralLedgerEntry[],
  options?: { organizationId?: string; branchId?: string; asOfDate?: string }
): BalanceSheetReport {
  const tb = computeTrialBalance(accounts, glEntries, {
    organizationId: options?.organizationId,
    branchId: options?.branchId,
    endDate: options?.asOfDate,
  });

  const pnl = computeProfitAndLoss(accounts, glEntries, {
    organizationId: options?.organizationId,
    branchId: options?.branchId,
    endDate: options?.asOfDate,
  });

  const assetRows = tb.rows
    .filter((r) => r.accountClass === 'ASSET')
    .map((r) => ({
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      accountGroup: r.accountGroup,
      amount: roundMoney(r.closingDebit - r.closingCredit),
    }));

  const liabilityRows = tb.rows
    .filter((r) => r.accountClass === 'LIABILITY')
    .map((r) => ({
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      accountGroup: r.accountGroup,
      amount: roundMoney(r.closingCredit - r.closingDebit),
    }));

  const equityRows = tb.rows
    .filter((r) => r.accountClass === 'EQUITY')
    .map((r) => ({
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      accountGroup: r.accountGroup,
      amount: roundMoney(r.closingCredit - r.closingDebit),
    }));

  const totalAssets = sumMoney(assetRows.map((r) => r.amount));
  const totalLiabilities = sumMoney(liabilityRows.map((r) => r.amount));
  const baseEquity = sumMoney(equityRows.map((r) => r.amount));
  const totalEquity = roundMoney(baseEquity + pnl.netProfit);
  const totalLiabilitiesAndEquity = roundMoney(totalLiabilities + totalEquity);

  return {
    asOfDate: options?.asOfDate || new Date().toISOString().slice(0, 10),
    assetRows,
    liabilityRows,
    equityRows,
    currentPeriodNetProfit: pnl.netProfit,
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalLiabilitiesAndEquity,
    isBalanced: Math.abs(roundMoney(totalAssets - totalLiabilitiesAndEquity)) <= 0.01,
  };
}

/**
 * Computes Cash Flow Statement (Operating, Investing, Financing) from cash & bank GL entries.
 */
export function computeCashFlowStatement(
  glEntries: GeneralLedgerEntry[],
  options?: { organizationId?: string; branchId?: string; startDate?: string; endDate?: string }
): CashFlowReport {
  const cashCodes = new Set<string>([SYSTEM_ACCOUNT_CODES.CASH, SYSTEM_ACCOUNT_CODES.BANK]);
  const relevant = glEntries.filter((e) => {
    if (!cashCodes.has(e.accountCode)) return false;
    if (options?.organizationId && e.organizationId !== options.organizationId) return false;
    if (options?.branchId && options.branchId !== 'ALL' && e.branchId !== options.branchId) return false;
    if (options?.startDate && e.entryDate < options.startDate) return false;
    if (options?.endDate && e.entryDate > options.endDate) return false;
    return true;
  });

  let operatingInflows = 0;
  let operatingOutflows = 0;
  let investingInflows = 0;
  let investingOutflows = 0;
  let financingInflows = 0;
  let financingOutflows = 0;

  for (const row of relevant) {
    const net = roundMoney(row.debit - row.credit);
    if (row.sourceType === 'OPENING_BALANCE' || row.description.toLowerCase().includes('capital') || row.description.toLowerCase().includes('loan')) {
      if (net >= 0) financingInflows = roundMoney(financingInflows + net);
      else financingOutflows = roundMoney(financingOutflows + Math.abs(net));
    } else if (row.description.toLowerCase().includes('equipment') || row.description.toLowerCase().includes('fixed asset')) {
      if (net >= 0) investingInflows = roundMoney(investingInflows + net);
      else investingOutflows = roundMoney(investingOutflows + Math.abs(net));
    } else {
      if (net >= 0) operatingInflows = roundMoney(operatingInflows + net);
      else operatingOutflows = roundMoney(operatingOutflows + Math.abs(net));
    }
  }

  const netOperating = roundMoney(operatingInflows - operatingOutflows);
  const netInvesting = roundMoney(investingInflows - investingOutflows);
  const netFinancing = roundMoney(financingInflows - financingOutflows);
  const netCashChange = roundMoney(netOperating + netInvesting + netFinancing);

  return {
    startDate: options?.startDate || '2026-04-01',
    endDate: options?.endDate || new Date().toISOString().slice(0, 10),
    operatingInflows,
    operatingOutflows,
    netOperating,
    investingInflows,
    investingOutflows,
    netInvesting,
    financingInflows,
    financingOutflows,
    netFinancing,
    netCashChange,
  };
}

/**
 * Computes GST Input / Output & Net Tax Liability summary from GL entries.
 */
export function computeGstReport(
  glEntries: GeneralLedgerEntry[],
  options?: { organizationId?: string; branchId?: string; startDate?: string; endDate?: string }
): GstReportSummary {
  const filtered = glEntries.filter((e) => {
    if (options?.organizationId && e.organizationId !== options.organizationId) return false;
    if (options?.branchId && options.branchId !== 'ALL' && e.branchId !== options.branchId) return false;
    if (options?.startDate && e.entryDate < options.startDate) return false;
    if (options?.endDate && e.entryDate > options.endDate) return false;
    return true;
  });

  const netCredit = (code: string) =>
    roundMoney(filtered.filter((e) => e.accountCode === code).reduce((s, e) => s + e.credit - e.debit, 0));
  const netDebit = (code: string) =>
    roundMoney(filtered.filter((e) => e.accountCode === code).reduce((s, e) => s + e.debit - e.credit, 0));

  const outputCgst = netCredit(SYSTEM_ACCOUNT_CODES.OUTPUT_CGST);
  const outputSgst = netCredit(SYSTEM_ACCOUNT_CODES.OUTPUT_SGST);
  const outputIgst = netCredit(SYSTEM_ACCOUNT_CODES.OUTPUT_IGST);
  const totalOutputGst = roundMoney(outputCgst + outputSgst + outputIgst);

  const inputCgst = netDebit(SYSTEM_ACCOUNT_CODES.INPUT_CGST);
  const inputSgst = netDebit(SYSTEM_ACCOUNT_CODES.INPUT_SGST);
  const inputIgst = netDebit(SYSTEM_ACCOUNT_CODES.INPUT_IGST);
  const totalInputGst = roundMoney(inputCgst + inputSgst + inputIgst);

  const netPayableGst = roundMoney(totalOutputGst - totalInputGst);

  return {
    outputCgst,
    outputSgst,
    outputIgst,
    totalOutputGst,
    inputCgst,
    inputSgst,
    inputIgst,
    totalInputGst,
    netPayableGst,
  };
}

/**
 * Computes Budget vs Actual variance for every line in a Budget.
 */
export function computeBudgetVariance(
  budget: Budget,
  glEntries: GeneralLedgerEntry[]
): {
  rows: BudgetVarianceRow[];
  totalPlanned: number;
  totalActual: number;
  totalVariance: number;
  utilizationPercent: number;
} {
  const relevantGl = glEntries.filter((e) => {
    if (e.organizationId !== budget.organizationId) return false;
    if (budget.branchId && budget.branchId !== 'ALL' && e.branchId !== budget.branchId) return false;
    if (budget.startDate && e.entryDate < budget.startDate) return false;
    if (budget.endDate && e.entryDate > budget.endDate) return false;
    return true;
  });

  const rows: BudgetVarianceRow[] = budget.lines.map((line) => {
    const accEntries = relevantGl.filter((e) => e.accountId === line.accountId || e.accountCode === line.accountCode);
    const actualAmount =
      line.accountClass === 'INCOME'
        ? roundMoney(accEntries.reduce((s, e) => s + e.credit - e.debit, 0))
        : roundMoney(accEntries.reduce((s, e) => s + e.debit - e.credit, 0));

    // For INCOME: positive variance means above target; for EXPENSE/CAPEX: positive variance means under budget
    const variance =
      line.accountClass === 'INCOME'
        ? roundMoney(actualAmount - line.plannedAmount)
        : roundMoney(line.plannedAmount - actualAmount);

    const utilizationPercent =
      line.plannedAmount > 0 ? roundMoney((actualAmount / line.plannedAmount) * 100) : 0;

    return {
      accountId: line.accountId,
      accountCode: line.accountCode,
      accountName: line.accountName,
      accountClass: line.accountClass,
      category: line.category,
      plannedAmount: line.plannedAmount,
      actualAmount,
      variance,
      utilizationPercent,
      isOverBudget: line.accountClass !== 'INCOME' && actualAmount > line.plannedAmount,
    };
  });

  const totalPlanned = sumMoney(rows.map((r) => r.plannedAmount));
  const totalActual = sumMoney(rows.map((r) => r.actualAmount));
  const totalVariance = roundMoney(totalPlanned - totalActual);
  const utilizationPercent = totalPlanned > 0 ? roundMoney((totalActual / totalPlanned) * 100) : 0;

  return {
    rows,
    totalPlanned,
    totalActual,
    totalVariance,
    utilizationPercent,
  };
}
