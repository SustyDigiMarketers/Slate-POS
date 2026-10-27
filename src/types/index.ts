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
  | 'DELIVERY_MANAGE';

export interface UserProfile {
  id: string;
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
  cessRate?: number;
  currentStock: number;
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
  productId: string;
  productName: string;
  sku: string;
  type: 'SALE' | 'PURCHASE' | 'RETURN' | 'ADJUSTMENT' | 'AUDIT_CORRECTION';
  quantityChange: number; // positive or negative
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
  | 'REFUND_RECORDED';

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
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'CONFLICT';
  errorMessage?: string;
  createdAt: string;
  syncedAt?: string;
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


