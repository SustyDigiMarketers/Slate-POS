/**
 * SLATE POS — Shared Domain Types & Contracts
 * Indian Retail, Offline-First Architecture & Multi-Tenant Boundaries
 */

export type UserRole =
  | 'SUPER_ADMIN'
  | 'ORG_ADMIN'
  | 'MANAGER'
  | 'CASHIER'
  | 'STORE_OFFICER'
  | 'PURCHASE_OFFICER';

export type Permission =
  | 'POS_USE'
  | 'PRODUCT_VIEW'
  | 'PRODUCT_CREATE'
  | 'PRODUCT_EDIT'
  | 'PRODUCT_COST_VIEW'
  | 'INVENTORY_ADJUST'
  | 'CUSTOMER_VIEW'
  | 'CUSTOMER_EDIT'
  | 'SALES_VIEW'
  | 'INVOICE_CREATE'
  | 'REFUND_CREATE'
  | 'REFUND_APPROVE'
  | 'REPORT_VIEW'
  | 'REPORT_EXPORT'
  | 'BUSINESS_SETTINGS'
  | 'STAFF_MANAGE'
  | 'BRANCH_MANAGE'
  | 'SUBSCRIPTION_MANAGE'
  | 'PLATFORM_MANAGE'
  | 'SUPPLIER_VIEW'
  | 'SUPPLIER_EDIT'
  | 'QUOTES_VIEW'
  | 'INVOICE_VIEW'
  | 'DELIVERY_MANAGE'
  // Banking Permissions
  | 'BANK_VIEW'
  | 'BANK_ACCOUNT_CREATE'
  | 'BANK_TRANSACTION_VIEW'
  | 'BANK_DEPOSIT_CREATE'
  | 'BANK_WITHDRAWAL_CREATE'
  | 'BANK_TRANSFER'
  | 'BANK_APPROVE'
  | 'BANK_STATEMENT_VIEW'
  // Credit Notes Permissions
  | 'CREDIT_NOTE_VIEW'
  | 'CREDIT_NOTE_CREATE'
  | 'CREDIT_NOTE_EDIT'
  | 'CREDIT_NOTE_APPROVE'
  | 'CREDIT_NOTE_ISSUE'
  | 'CREDIT_NOTE_CANCEL'
  // Purchase & Bills Permissions
  | 'PURCHASE_VIEW'
  | 'PURCHASE_CREATE'
  | 'PURCHASE_RECEIVE'
  | 'SUPPLIER_BILL_CREATE'
  | 'SUPPLIER_PAYMENT_CREATE'
  | 'PURCHASE_APPROVE'
  | 'SUPPLIER_BALANCE_VIEW'
  // Double-Entry Accounting & Finance Permissions
  | 'ACCOUNTING_VIEW'
  | 'JOURNAL_CREATE'
  | 'JOURNAL_APPROVE'
  | 'JOURNAL_POST'
  | 'COA_MANAGE'
  | 'BUDGET_MANAGE'
  | 'BULK_IMPORT'
  | 'RECONCILE_BANK'
  | 'DEBIT_NOTE_MANAGE'
  | 'AUDIT_VIEW';

export interface UserProfile {
  id: string;
  userCode?: string; // 6-digit numeric string (e.g. "004821")
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  organizationId: string;
  branchId: string;
  avatarUrl?: string;
  permissions: Permission[];
}

export interface TimeLog {
  id: string;
  userId: string;
  userName: string;
  date: string;
  hours: number;
  project: string;
  task: string;
  notes?: string;
  billable: boolean;
  createdAt: string;
}

export interface Organization {
  id: string;
  organizationCode?: string; // Alphanumeric string (e.g. "SLATE8K29P")
  name: string;
  tradeName: string;
  gstin: string;
  fssai?: string;
  pan: string;
  currency: 'INR';
  timezone: 'Asia/Kolkata';
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  subscriptionPlanId: string;
  subscriptionStatus: 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED';
  currentFiscalYear: string; // e.g. "2026-2027"
  logoUrl?: string; // Centralized 500x500 PNG company logo
  loginBannerUrl?: string; // Optional custom login showcase graphic
}

export interface Branch {
  id: string;
  organizationId: string;
  code: string; // e.g. "BLR-01"
  name: string;
  city: string;
  state: string;
  address: string;
  phone: string;
  isMainBranch: boolean;
  activeTerminalCount: number;
}

export interface ProductCategory {
  id: string;
  name: string;
  code: string;
  itemCount?: number;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string;
  hsn: string; // Harmonized System Nomenclature (mandatory for Indian GST)
  name: string;
  categoryId: string;
  categoryName: string;
  unit: 'PCS' | 'KG' | 'LTR' | 'BOX' | 'PACK';
  costPrice: number; // in INR
  sellingPrice: number; // in INR
  gstRate: number; // e.g. 0, 5, 12, 18, 28
  taxRate?: number;
  cessRate?: number;
  currentStock: number;
  stockLevel?: number;
  branchStocks?: Record<string, number>;
  minStockAlert: number;
  imageUrl?: string;
  isActive: boolean;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  companyName?: string;
  phone: string;
  email?: string;
  gstin?: string;
  address?: string;
  shippingAddress?: string;
  city?: string;
  state?: string;
  creditLimit: number;
  currentReceivableBalance: number;
  outstandingReceivable?: number;
  totalOrdersCount: number;
  createdAt: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number; // Selling price snapshot
  discountPercent: number; // 0 to 100
  discountAmount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  total: number;
}

export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'SPLIT';
export type PaymentMode = 'CASH' | 'UPI' | 'CARD' | 'BANK' | 'CHEQUE' | 'CREDIT' | 'SPLIT' | 'NEFT/RTGS';

export interface PaymentRecord {
  id: string;
  saleId: string;
  method: PaymentMethod;
  amount: number;
  tenderedAmount?: number;
  changeReturned?: number;
  utrOrRef?: string;
  gatewayStatus: 'VERIFIED' | 'PENDING_VERIFICATION' | 'OFFLINE_RECORDED';
  timestamp: string;
}

export interface CustomerReceiptAllocation {
  saleId: string;
  invoiceNumber: string;
  allocatedAmount: number;
}

export interface CustomerReceipt {
  id: string;
  receiptNumber: string; // e.g. "RCPT-2026-0001"
  organizationId: string;
  branchId: string;
  customerId: string;
  customerName: string;
  amount: number;
  allocatedAmount: number;
  unallocatedAdvance: number;
  paymentMethod: 'CASH' | 'UPI' | 'CARD' | 'BANK' | 'CHEQUE' | 'NEFT/RTGS';
  bankAccountId?: string;
  bankAccountName?: string;
  receiptDate: string; // YYYY-MM-DD
  referenceNumber?: string;
  notes?: string;
  allocations: CustomerReceiptAllocation[];
  status: 'COMPLETED' | 'REVERSED';
  reversalReason?: string;
  reversedAt?: string;
  reversedBy?: string;
  journalEntryId?: string;
  journalNumber?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Sale {
  id: string;
  receiptNumber: string; // e.g. "BLR-2026-00412"
  invoiceNumber: string; // e.g. "INV-26-0891"
  organizationId: string;
  branchId: string;
  branchName: string;
  cashierId: string;
  cashierName: string;
  customerId?: string;
  customerName?: string;
  companyName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerGstin?: string;
  billingAddress?: string;
  shippingAddress?: string;
  quotationId?: string;
  quoteNumber?: string;
  notes?: string;
  termsAndConditions?: string;
  items: CartItem[];
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  roundOff: number;
  grandTotal: number;
  paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE' | 'REFUNDED';
  dueDate: string; // For receivables aging
  payments: PaymentRecord[];
  isOfflineCreated: boolean;
  syncStatus: 'SYNCED' | 'PENDING' | 'SYNCING' | 'CONFLICT';
  date?: string;
  createdAt: string;
}

export interface RefundItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  refundAmount: number;
  restockInventory: boolean;
}

export interface RefundRecord {
  id: string;
  saleId: string;
  receiptNumber: string;
  refundAmount: number;
  items: RefundItem[];
  reason: string;
  approvedBy: string;
  refundMethod: PaymentMethod;
  createdAt: string;
}

export interface StockMovement {
  id: string;
  organizationId?: string;
  branchId?: string;
  productId: string;
  productName: string;
  sku: string;
  type: 'SALE' | 'PURCHASE' | 'RETURN' | 'ADJUSTMENT' | 'AUDIT_CORRECTION' | 'RECEIPT';
  quantityChange: number; // positive or negative
  quantity?: number;
  previousStock?: number;
  newStock?: number;
  newBalance: number;
  referenceId: string; // Sale ID or Purchase Order
  notes: string;
  performedBy: string;
  timestamp: string;
}

export interface Expense {
  id: string;
  organizationId: string;
  branchId: string;
  category: 'Rent' | 'Staff Wages' | 'Utilities & Power' | 'Inventory Logistics' | 'Store Maintenance' | 'Marketing';
  vendor: string;
  date: string;
  amount: number;
  gstPaid: number;
  isGstInputEligible: boolean;
  paymentMode: 'UPI' | 'NEFT/RTGS' | 'CASH' | 'CARD';
  invoiceRef?: string;
  notes?: string;
}

export type SyncEventType =
  | 'SALE_CREATED'
  | 'PAYMENT_ALLOCATED'
  | 'STOCK_ADJUSTED'
  | 'CUSTOMER_CREATED'
  | 'CUSTOMER_UPSERTED'
  | 'CUSTOMER_DELETED'
  | 'SUPPLIER_UPSERTED'
  | 'SUPPLIER_DELETED'
  | 'PRODUCT_UPSERTED'
  | 'PRODUCT_DELETED'
  | 'QUOTATION_UPSERTED'
  | 'QUOTATION_DELETED'
  | 'EXPENSE_UPSERTED'
  | 'EXPENSE_DELETED'
  | 'PREFERENCES_UPSERTED'
  | 'REFUND_RECORDED'
  | 'CUSTOMER_RECEIPT_CREATED'
  | 'CUSTOMER_RECEIPT_REVERSED'
  | 'BANK_ACCOUNT_UPSERTED'
  | 'BANK_TX_CREATED'
  | 'CREDIT_NOTE_UPSERTED'
  | 'PO_UPSERTED'
  | 'GRN_CREATED'
  | 'SUPPLIER_BILL_UPSERTED'
  | 'SUPPLIER_PAYMENT_UPSERTED'
  | 'SUPPLIER_PAYMENT_REVERSED'
  | 'DEBIT_NOTE_UPSERTED';

export interface SyncOutboxItem {
  id: string;
  eventId: string;
  eventType: SyncEventType;
  entityId: string;
  payload: any;
  organizationId: string;
  branchId: string;
  deviceId: string;
  idempotencyKey: string;
  retryCount: number;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'CONFLICT' | 'FAILED';
  errorMessage?: string;
  expectedVersion?: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  createdAt: string;
  syncedAt?: string;
}

export type SaveLifecycleState = 'IDLE' | 'SAVING' | 'SAVED' | 'FAILED';

export interface SaveStatusSnapshot {
  state: SaveLifecycleState;
  lastSavedAt?: string;
  lastError?: string;
  lastEntity?: string;
  pendingCount: number;
  failedCount: number;
  isOnline: boolean;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  tagline: string;
  monthlyPrice: number; // in INR
  annualPrice: number; // in INR
  maxBranches: number;
  maxUsers: number;
  maxOfflineTerminals: number;
  features: string[];
  isPopular?: boolean;
}

export interface HardwarePrinterConfig {
  printerType: 'THERMAL_58MM' | 'THERMAL_80MM' | 'STANDARD_A4';
  storeHeader: string;
  addressLine: string;
  gstinLine: string;
  fssaiLine?: string;
  phoneLine: string;
  footerGreeting: string;
  autoCutPaper: boolean;
  kickCashDrawer: boolean;
  showHsnSummary: boolean;
}

export interface ReceivableAgingSummary {
  totalReceivables: number;
  current: number; // Not yet due
  days1To15: number;
  days16To30: number;
  days31To45: number;
  daysAbove45: number;
  customerCount: number;
  invoiceCount: number;
}

export type CouponDiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';

export interface Coupon {
  id: string;
  code: string;
  title: string;
  description?: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderValue: number;
  maxDiscountCap?: number;
  usageLimit: number;
  redemptionCount: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string; // Company / Trade Name
  contactPerson: string;
  phone: string;
  email: string;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
  openingBalance: number;
  currentPayableBalance: number;
  outstandingBalance?: number;
  status: 'ACTIVE' | 'INACTIVE';
  category?: string;
  purchaseOrdersCount: number;
  createdAt: string;
}

export type QuoteStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SENT'
  | 'VIEWED'
  | 'ACCEPTED'
  | 'INVOICED'
  | 'DECLINED'
  | 'EXPIRED';

export type QuoteType =
  | 'ONE_TIME'
  | 'NEW_SUBSCRIPTION'
  | 'SUBSCRIPTION_UPDATE'
  | 'ONE_TIME_ADDON';

export interface QuoteLineItem {
  id: string;
  productId?: string;
  name: string;
  description?: string;
  hsn?: string;
  sku?: string;
  quantity: number;
  unit: string; // e.g. "pcs", "box", "month"
  rate: number;
  discountPercent: number;
  discountAmount: number;
  gstRate: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  total: number;
}

export interface QuoteActivity {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  notes?: string;
}

export interface CustomFieldDefinition {
  id: string;
  name: string;
  label: string;
  type: 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT';
  defaultValue?: string;
  options?: string[];
  module: 'QUOTES' | 'INVOICES' | 'CUSTOMERS';
}

export interface Quotation {
  id: string;
  organizationId?: string;
  branchId?: string;
  quoteNumber: string; // e.g. "QT-000001"
  quoteType: QuoteType;
  customerId: string;
  customerName: string;
  companyName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerGstin?: string;
  billingAddress?: string;
  shippingAddress?: string;
  date: string; // YYYY-MM-DD
  expiryDate: string; // YYYY-MM-DD
  referenceNumber?: string;
  salesperson?: string;
  projectName?: string;
  subject?: string;
  items: QuoteLineItem[];
  subtotal: number;
  discountTotal: number;
  adjustment: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  roundOff: number;
  grandTotal: number;
  status: QuoteStatus;
  notes?: string;
  termsAndConditions?: string;
  emailRecipients: string[];
  pdfTemplate?: string;
  linkedInvoiceId?: string;
  linkedInvoiceNumber?: string;
  subscriptionPlanId?: string;
  subscriptionPlanName?: string;
  billingCycle?: 'MONTHLY' | 'ANNUAL';
  customFields?: Record<string, any>;
  activities: QuoteActivity[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// BANKING MODULE TYPES
// ============================================================================

export type BankAccountType = 'CURRENT' | 'SAVINGS' | 'OVERDRAFT' | 'CASH';

export interface BankAccount {
  id: string;
  organizationId: string;
  branchId: string;
  accountName: string;
  accountHolderName?: string;
  bankName: string;
  accountNumber: string;
  maskedAccountNumber?: string;
  ifscCode: string;
  branchName?: string;
  accountType: BankAccountType;
  openingBalance: number;
  currentBalance: number;
  isActive?: boolean;
  status?: 'ACTIVE' | 'INACTIVE' | 'FROZEN';
  isPrimary?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export type BankTransactionType =
  | 'CASH_DEPOSIT'
  | 'CASH_WITHDRAWAL'
  | 'BANK_DEPOSIT'
  | 'BANK_WITHDRAWAL'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'REVERSAL'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'TRANSFER';

export interface BankTransaction {
  id: string;
  organizationId: string;
  branchId: string;
  accountId?: string;
  accountName?: string;
  bankAccountId?: string;
  bankAccountName?: string;
  transactionNumber?: string;
  category?: string;
  payeePayer?: string;
  type: BankTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceNumber: string;
  transactionDate: string; // YYYY-MM-DD
  description: string;
  notes?: string;
  transferCounterpartAccountId?: string;
  transferCounterpartAccountName?: string;
  transferToAccountId?: string;
  transferFromAccountId?: string;
  reversalOfTransactionId?: string;
  reversalTransactionId?: string;
  reversalReason?: string;
  reversedAt?: string;
  status: 'COMPLETED' | 'REVERSED';
  createdBy?: string;
  createdByName?: string;
  initiatedBy?: string;
  createdAt: string;
}

// ============================================================================
// CREDIT NOTES MODULE TYPES
// ============================================================================

export type CreditNoteStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ISSUED'
  | 'APPLIED'
  | 'REFUNDED'
  | 'CANCELLED';

export interface CreditNoteItem {
  id: string;
  creditNoteId?: string;
  productId: string;
  productName: string;
  sku?: string;
  hsn?: string;
  returnedQuantity?: number;
  originalQuantity?: number;
  quantity?: number;
  unitPrice: number;
  discountAmount?: number;
  taxableAmount?: number;
  taxRate?: number;
  gstRate?: number;
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
  total: number;
  restockInventory?: boolean;
}

export interface CreditNote {
  id: string;
  creditNoteNumber: string; // e.g. "CN-2026-0001"
  organizationId: string;
  branchId: string;
  customerId: string;
  customerName: string;
  customerGstin?: string;
  originalSaleId?: string;
  originalInvoiceNumber?: string;
  originalInvoiceDate?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  status: CreditNoteStatus;
  date?: string; // YYYY-MM-DD
  issueDate?: string;
  reason: string;
  items: CreditNoteItem[];
  subtotal: number;
  discountTotal?: number;
  taxableTotal: number;
  cgstTotal?: number;
  sgstTotal?: number;
  igstTotal?: number;
  totalTax?: number;
  roundOff?: number;
  creditAmount?: number;
  totalCreditAmount?: number;
  allocatedAmount?: number;
  remainingAmount?: number;
  restockInventory?: boolean;
  adjustmentStatus?: 'PENDING' | 'ADJUSTED' | 'REFUNDED';
  notes?: string;
  createdBy: string;
  createdByName?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  issuedBy?: string;
  issuedByName?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt?: string;
}

// ============================================================================
// PURCHASE & BILLS MODULE TYPES
// ============================================================================

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'ORDERED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export interface PurchaseOrderItem {
  id: string;
  poId?: string;
  productId: string;
  productName: string;
  sku?: string;
  hsn?: string;
  orderedQuantity: number;
  receivedQuantity?: number;
  purchasePrice?: number;
  unitPrice?: number;
  discountAmount?: number;
  taxRate?: number;
  taxAmount?: number;
  gstRate?: number;
  taxableAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  total: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string; // e.g. "PO-2026-0001"
  organizationId: string;
  branchId: string;
  supplierId: string;
  supplierName: string;
  supplierGstin?: string;
  status: PurchaseOrderStatus;
  orderDate: string; // YYYY-MM-DD
  expectedDeliveryDate?: string;
  items: PurchaseOrderItem[];
  subtotal: number;
  discountTotal?: number;
  taxTotal?: number;
  additionalCharges?: number;
  taxableTotal?: number;
  cgstTotal?: number;
  sgstTotal?: number;
  igstTotal?: number;
  roundOff?: number;
  grandTotal: number;
  receivedTotal?: number;
  notes?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface GoodsReceiptItem {
  id: string;
  goodsReceiptId?: string;
  productId: string;
  productName: string;
  sku?: string;
  receivedQuantity?: number;
  quantityReceived?: number;
  unitCost?: number;
  unitPrice?: number;
  batchNumber?: string;
  expiryDate?: string;
}

export interface GoodsReceipt {
  id: string;
  grnNumber: string; // e.g. "GRN-2026-0001"
  organizationId: string;
  branchId: string;
  purchaseOrderId?: string;
  poNumber?: string;
  supplierId: string;
  supplierName: string;
  receiptDate?: string; // YYYY-MM-DD
  receivedDate?: string;
  challanOrInvoiceRef?: string;
  items: GoodsReceiptItem[];
  receivedBy: string;
  receivedByName?: string;
  notes?: string;
  createdAt: string;
}

export type SupplierBillStatus = 'UNPAID' | 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';

export interface SupplierBill {
  id: string;
  billNumber: string; // e.g. "BILL-2026-0001"
  supplierInvoiceNumber: string;
  organizationId: string;
  branchId: string;
  supplierId: string;
  supplierName: string;
  supplierGstin?: string;
  purchaseOrderId?: string;
  poNumber?: string;
  billDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  subtotal: number;
  taxableTotal: number;
  gstTotal: number;
  discountTotal: number;
  additionalCharges: number;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: SupplierBillStatus;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SupplierPayment {
  id: string;
  paymentNumber: string; // e.g. "SPAY-2026-0001"
  organizationId: string;
  branchId: string;
  supplierId: string;
  supplierName: string;
  supplierBillId?: string;
  billNumber?: string;
  amount: number;
  paymentMethod: PaymentMode | 'CASH' | 'UPI' | 'CARD' | 'BANK' | 'CREDIT' | 'SPLIT' | 'NEFT/RTGS';
  bankAccountId?: string;
  bankAccountName?: string;
  paymentDate: string; // YYYY-MM-DD
  referenceNumber?: string;
  notes?: string;
  allocatedBills?: Array<{ billId: string; billNumber: string; allocatedAmount: number }>;
  isAdvance?: boolean;
  status?: 'COMPLETED' | 'REVERSED';
  reversalReason?: string;
  reversedAt?: string;
  reversedBy?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

// ============================================================================
// DOUBLE-ENTRY ACCOUNTING, COA, JOURNAL, GL, BUDGETS, BULK IMPORTS & AUDIT
// ============================================================================

export type AccountClass = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

export interface ChartOfAccount {
  id: string;
  organizationId: string;
  branchId: string; // 'ALL' or specific branch ID
  code: string; // Configurable numeric code e.g. "1010", "4000"
  name: string;
  accountClass: AccountClass;
  accountGroup: string;
  parentAccountId?: string;
  parentCode?: string;
  normalBalance: 'DEBIT' | 'CREDIT';
  openingBalance: number;
  currentBalance: number;
  taxApplicable: boolean;
  gstTag?: 'INPUT_CGST' | 'INPUT_SGST' | 'INPUT_IGST' | 'OUTPUT_CGST' | 'OUTPUT_SGST' | 'OUTPUT_IGST';
  isSystem: boolean;
  isActive: boolean;
  description?: string;
  createdAt: string;
  updatedAt?: string;
}

export type JournalStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'POSTED' | 'REVERSED';

export type AccountingSourceType =
  | 'MANUAL_JOURNAL'
  | 'SALES_INVOICE'
  | 'CUSTOMER_PAYMENT'
  | 'CUSTOMER_RECEIPT'
  | 'CUSTOMER_RECEIPT_REVERSAL'
  | 'CREDIT_NOTE'
  | 'CREDIT_NOTE_REFUND'
  | 'PURCHASE_BILL'
  | 'SUPPLIER_PAYMENT'
  | 'SUPPLIER_PAYMENT_REVERSAL'
  | 'DEBIT_NOTE'
  | 'DEBIT_NOTE_REVERSAL'
  | 'EXPENSE'
  | 'BANK_TRANSACTION'
  | 'BANK_RECONCILIATION'
  | 'OPENING_BALANCE'
  | 'STOCK_ADJUSTMENT'
  | 'REVERSAL';

export interface JournalEntryLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountClass: AccountClass;
  debit: number;
  credit: number;
  description?: string;
  partyType?: 'CUSTOMER' | 'SUPPLIER';
  partyId?: string;
  partyName?: string;
}

export interface JournalEntry {
  id: string;
  journalNumber: string; // e.g. "JRN-2026-0001"
  organizationId: string;
  branchId: string;
  entryDate: string; // YYYY-MM-DD
  referenceNumber?: string;
  narration: string;
  attachmentNotes?: string;
  status: JournalStatus;
  sourceType: AccountingSourceType;
  sourceId?: string;
  sourceNumber?: string;
  idempotencyKey?: string;
  totalDebit: number;
  totalCredit: number;
  lines: JournalEntryLine[];
  reversedEntryId?: string;
  reversalEntryId?: string;
  reversalReason?: string;
  createdBy: string;
  createdByName?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  postedBy?: string;
  postedByName?: string;
  postedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface GeneralLedgerEntry {
  id: string;
  organizationId: string;
  branchId: string;
  journalEntryId: string;
  journalNumber: string;
  entryDate: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountClass: AccountClass;
  debit: number;
  credit: number;
  description: string;
  sourceType: AccountingSourceType;
  sourceId?: string;
  sourceNumber?: string;
  partyType?: 'CUSTOMER' | 'SUPPLIER';
  partyId?: string;
  partyName?: string;
  postedBy: string;
  postedAt: string;
}

export interface AccountingPostingRecord {
  idempotencyKey: string;
  organizationId: string;
  sourceType: AccountingSourceType;
  sourceId: string;
  journalEntryId: string;
  journalNumber: string;
  postedAt: string;
}

export interface AccountingPeriod {
  id: string;
  organizationId: string;
  fiscalYear: string; // e.g. "2026-2027"
  name: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'LOCKED' | 'CLOSED';
  lockedBy?: string;
  lockedAt?: string;
}

export type BudgetPeriodType = 'ANNUAL' | 'QUARTERLY' | 'MONTHLY';
export type BudgetCategory = 'REVENUE' | 'EXPENSE' | 'CAPEX';
export type BudgetStatus = 'DRAFT' | 'APPROVED' | 'REVISED' | 'ARCHIVED';

export interface BudgetLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountClass: AccountClass;
  category: BudgetCategory;
  plannedAmount: number;
  notes?: string;
}

export interface BudgetRevision {
  version: number;
  revisedAt: string;
  revisedBy: string;
  reason: string;
  previousTotal: number;
  newTotal: number;
}

export interface Budget {
  id: string;
  organizationId: string;
  branchId: string; // 'ALL' or specific branch ID
  name: string;
  fiscalYear: string;
  periodType: BudgetPeriodType;
  startDate: string;
  endDate: string;
  status: BudgetStatus;
  lines: BudgetLine[];
  totalPlannedRevenue: number;
  totalPlannedExpense: number;
  totalPlannedCapex: number;
  revisions: BudgetRevision[];
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface BudgetVarianceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountClass: AccountClass;
  category: BudgetCategory;
  plannedAmount: number;
  actualAmount: number;
  variance: number;
  utilizationPercent: number;
  isOverBudget: boolean;
}

export type BulkImportEntityType =
  | 'CUSTOMERS'
  | 'SUPPLIERS'
  | 'PRODUCTS'
  | 'OPENING_BALANCES'
  | 'ACCOUNT_CLASSIFICATIONS'
  | 'TAX_CLASSIFICATIONS'
  | 'PRODUCT_PRICING';

export interface BulkImportErrorRow {
  rowNumber: number;
  field: string;
  message: string;
  rawValue?: string;
}

export interface BulkImportBatch {
  id: string;
  organizationId: string;
  branchId: string;
  entityType: BulkImportEntityType;
  fileName: string;
  totalRows: number;
  validRows: number;
  importedRows: number;
  updatedRows: number;
  skippedDuplicates: number;
  errorCount: number;
  errors: BulkImportErrorRow[];
  requiresApproval: boolean;
  approvedBy?: string;
  status: 'PREVIEW' | 'APPROVED' | 'COMMITTED' | 'FAILED';
  journalEntryId?: string;
  performedBy: string;
  performedByName?: string;
  createdAt: string;
}

export type DebitNoteStatus = 'DRAFT' | 'APPROVED' | 'ISSUED' | 'CANCELLED';

export interface DebitNoteItem {
  id: string;
  productId: string;
  productName: string;
  sku?: string;
  hsn?: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  total: number;
}

export interface DebitNote {
  id: string;
  debitNoteNumber: string; // e.g. "DN-2026-0001"
  organizationId: string;
  branchId: string;
  supplierId: string;
  supplierName: string;
  supplierGstin?: string;
  supplierBillId?: string;
  billNumber?: string;
  issueDate: string;
  reason: string;
  status: DebitNoteStatus;
  items: DebitNoteItem[];
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  totalAmount: number;
  deductInventory: boolean;
  journalEntryId?: string;
  journalNumber?: string;
  notes?: string;
  createdBy: string;
  createdByName?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
  createdAt: string;
}

export interface BankReconciliation {
  id: string;
  organizationId: string;
  branchId: string;
  bankAccountId: string;
  bankAccountName: string;
  statementDate: string;
  statementClosingBalance: number;
  bookBalance: number;
  clearedBalance: number;
  variance: number;
  clearedTransactionIds: string[];
  adjustmentJournalId?: string;
  status: 'IN_PROGRESS' | 'RECONCILED';
  reconciledBy: string;
  reconciledAt: string;
  notes?: string;
}

export interface FinancialAuditLog {
  id: string;
  organizationId: string;
  branchId: string;
  module: string;
  action: string;
  entityType: string;
  entityId: string;
  entityNumber?: string;
  summary: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  timestamp: string;
}

export interface UnifiedTransactionRow {
  id: string;
  date: string;
  voucherNumber: string;
  sourceType: AccountingSourceType;
  sourceId?: string;
  description: string;
  partyName?: string;
  accountSummary: string;
  branchId: string;
  debit: number;
  credit: number;
  status: string;
  journalEntryId: string;
  journalNumber: string;
  lines: JournalEntryLine[];
  postedBy?: string;
  postedAt?: string;
}

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountClass: AccountClass;
  accountGroup: string;
  openingBalance: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export interface StatementLineItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountGroup: string;
  amount: number;
}

export interface ProfitAndLossReport {
  startDate: string;
  endDate: string;
  incomeRows: StatementLineItem[];
  directExpenseRows: StatementLineItem[];
  operatingExpenseRows: StatementLineItem[];
  totalIncome: number;
  totalDirectExpenses: number;
  grossProfit: number;
  totalOperatingExpenses: number;
  netProfit: number;
}

export interface BalanceSheetReport {
  asOfDate: string;
  assetRows: StatementLineItem[];
  liabilityRows: StatementLineItem[];
  equityRows: StatementLineItem[];
  currentPeriodNetProfit: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
}

export interface CashFlowReport {
  startDate: string;
  endDate: string;
  operatingInflows: number;
  operatingOutflows: number;
  netOperating: number;
  investingInflows: number;
  investingOutflows: number;
  netInvesting: number;
  financingInflows: number;
  financingOutflows: number;
  netFinancing: number;
  netCashChange: number;
}

export interface GstReportSummary {
  outputCgst: number;
  outputSgst: number;
  outputIgst: number;
  totalOutputGst: number;
  inputCgst: number;
  inputSgst: number;
  inputIgst: number;
  totalInputGst: number;
  netPayableGst: number;
}



