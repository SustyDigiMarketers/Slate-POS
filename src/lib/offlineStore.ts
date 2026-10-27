/**
 * SLATE POS — Offline-First Durable Local Store & SQLite Outbox Engine
 * Provides atomic checkout, local product caching, and durable outbox synchronization
 */

import {
  Product,
  Customer,
  Sale,
  Expense,
  RefundRecord,
  StockMovement,
  SyncOutboxItem,
  CartItem,
  PaymentRecord,
  HardwarePrinterConfig,
  UserProfile,
  UserRole,
  Coupon,
  Supplier,
  Quotation,
  CustomFieldDefinition,
  TimeLog,
  Organization,
  Branch,
} from '../types';
import {
  INITIAL_PRODUCTS,
  INITIAL_CUSTOMERS,
  INITIAL_SALES,
  INITIAL_EXPENSES,
  INITIAL_COUPONS,
  INITIAL_SUPPLIERS,
  INITIAL_QUOTATIONS,
  INITIAL_CUSTOM_FIELDS,
  DEFAULT_PRINTER_CONFIG,
  INITIAL_ORGANIZATION,
  INITIAL_BRANCHES,
  INITIAL_TIME_LOGS,
  INITIAL_USERS,
} from './initialData';
import { calculateCartTotals } from './taxCalculations';
import { notifyRoleNavigationChange } from './roleNavigation';
import {
  isSupabaseConfigured,
  pushSaleToSupabase,
  pushRefundToSupabase,
  fetchProductsFromSupabase,
  createProductInSupabase,
  updateProductInSupabase,
  fetchCustomersFromSupabase,
  createCustomerInSupabase,
  allocateCustomerPaymentInSupabase,
  fetchSuppliersFromSupabase,
  createSupplierInSupabase,
  deleteSupplierInSupabase,
  fetchExpensesFromSupabase,
  createExpenseInSupabase,
  fetchQuotationsFromSupabase,
  saveQuotationToSupabase,
  deleteQuotationFromSupabase,
  fetchSalesFromSupabase,
  fetchTimeLogsFromSupabase,
  createTimeLogInSupabase,
  fetchRoleNavigationConfigs,
} from './supabaseClient';


const STORAGE_KEYS = {
  RELEASE_CLEANUP_VERSION: 'slate_pos_release_cleanup_v1_0',
  PRODUCTS: 'slate_pos_local_products',
  CUSTOMERS: 'slate_pos_local_customers',
  SALES: 'slate_pos_local_sales',
  EXPENSES: 'slate_pos_local_expenses',
  COUPONS: 'slate_pos_local_coupons',
  QUOTATIONS: 'slate_pos_local_quotations',
  SUPPLIERS: 'slate_pos_local_suppliers',
  CUSTOM_FIELDS: 'slate_pos_local_custom_fields',
  QUOTE_PREFERENCES: 'slate_pos_quote_preferences',
  REFUNDS: 'slate_pos_local_refunds',
  STOCK_MOVEMENTS: 'slate_pos_local_stock_movements',
  SYNC_OUTBOX: 'slate_pos_sync_outbox',
  PRINTER_CONFIG: 'slate_pos_printer_config',
  ACTIVE_USER: 'slate_pos_active_user',
  ACTIVE_BRANCH: 'slate_pos_active_branch',
  ORGANIZATION: 'slate_pos_organization',
  FISCAL_YEAR: 'slate_pos_fiscal_year',
  BRANCHES: 'slate_pos_branches',
  ROLE_NAV_OVERRIDES: 'slate_pos_role_nav_overrides',
  SIMULATED_OFFLINE: 'slate_pos_simulated_offline',
  DEVICE_REGISTRATION: 'slate_pos_device_registration',
  USERS: 'slate_pos_local_users',
  TIME_LOGS: 'slate_pos_local_time_logs',
  IS_AUTHENTICATED: 'slate_pos_is_authenticated',
};

export interface DeviceRegistration {
  deviceId: string;
  terminalCode: string;
  hostMachine: string;
  platform: string;
  osRelease: string;
  registeredAt: string;
  lastHeartbeat: string;
}

class OfflineStore {
  private products: Product[] = [];
  private customers: Customer[] = [];
  private sales: Sale[] = [];
  private expenses: Expense[] = [];
  private coupons: Coupon[] = [];
  private quotations: Quotation[] = [];
  private suppliers: Supplier[] = [];
  private customFields: CustomFieldDefinition[] = [];
  private users: UserProfile[] = [];
  private timeLogs: TimeLog[] = [];
  private quotePreferences = {
    visibleColumns: ['date', 'quoteNumber', 'customerName', 'companyName', 'paymentStatus', 'grandTotal', 'actions'],
    pageSize: 10,
  };
  private refunds: RefundRecord[] = [];
  private stockMovements: StockMovement[] = [];
  private syncOutbox: SyncOutboxItem[] = [];
  private printerConfig: HardwarePrinterConfig = DEFAULT_PRINTER_CONFIG;
  private activeUser: UserProfile | null = null;
  private activeBranchId: string = INITIAL_BRANCHES[0].id;
  private organization: Organization = INITIAL_ORGANIZATION;
  private fiscalYear: string = '2026–2027';
  private branches: Branch[] = INITIAL_BRANCHES;
  private roleNavOverrides: Record<string, string[]> = {};
  private isSimulatedOffline: boolean = false;
  private isAuthenticatedState: boolean = false;
  private deviceRegistration: DeviceRegistration = {
    deviceId: 'DEV-WIN-BLR-01',
    terminalCode: 'TERM-01',
    hostMachine: 'DESKTOP-POS-WIN11-64',
    platform: 'Windows Desktop (Electron 32 / x64)',
    osRelease: 'Windows 11 Pro Retail (Build 26100)',
    registeredAt: '2026-08-01T09:00:00Z',
    lastHeartbeat: new Date().toISOString(),
  };

  private listeners: Set<() => void> = new Set();
  private receiptCounter = 653;
  private invoiceCounter = 453;

  constructor() {
    this.runReleaseDataCleanup();
    this.loadFromStorage();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.saveToStorage();
    this.listeners.forEach((fn) => fn());
  }

  public isDemoUser(): boolean {
    return false;
  }

  public async hydrateFromSupabase(): Promise<{ success: boolean; loadedCount: number }> {
    if (!isSupabaseConfigured() || this.isDemoUser() || this.isOffline()) {
      return { success: false, loadedCount: 0 };
    }

    let loadedCount = 0;
    try {
      const [
        remoteProducts,
        remoteCustomers,
        remoteSuppliers,
        remoteExpenses,
        remoteQuotes,
        remoteSales,
        remoteTimeLogs,
        remoteRoleNav,
      ] = await Promise.allSettled([
        fetchProductsFromSupabase(),
        fetchCustomersFromSupabase(),
        fetchSuppliersFromSupabase(),
        fetchExpensesFromSupabase(),
        fetchQuotationsFromSupabase(),
        fetchSalesFromSupabase(),
        fetchTimeLogsFromSupabase(),
        fetchRoleNavigationConfigs(this.organization.id),
      ]);

      if (remoteProducts.status === 'fulfilled' && Array.isArray(remoteProducts.value)) {
        this.products = remoteProducts.value;
        loadedCount += remoteProducts.value.length;
      }

      if (remoteCustomers.status === 'fulfilled' && Array.isArray(remoteCustomers.value)) {
        this.customers = remoteCustomers.value;
        loadedCount += remoteCustomers.value.length;
      }

      if (remoteSuppliers.status === 'fulfilled' && Array.isArray(remoteSuppliers.value)) {
        this.suppliers = remoteSuppliers.value;
        loadedCount += remoteSuppliers.value.length;
      }

      if (remoteExpenses.status === 'fulfilled' && Array.isArray(remoteExpenses.value)) {
        this.expenses = remoteExpenses.value;
        loadedCount += remoteExpenses.value.length;
      }

      if (remoteQuotes.status === 'fulfilled' && Array.isArray(remoteQuotes.value)) {
        this.quotations = remoteQuotes.value;
        loadedCount += remoteQuotes.value.length;
      }

      if (remoteSales.status === 'fulfilled' && Array.isArray(remoteSales.value)) {
        this.sales = remoteSales.value;
        loadedCount += remoteSales.value.length;
      }

      if (remoteTimeLogs.status === 'fulfilled' && Array.isArray(remoteTimeLogs.value)) {
        this.timeLogs = remoteTimeLogs.value;
        loadedCount += remoteTimeLogs.value.length;
      }

      if (remoteRoleNav.status === 'fulfilled' && remoteRoleNav.value) {
        this.roleNavOverrides = remoteRoleNav.value;
      }

      this.saveToStorage();
      this.notify();
      return { success: true, loadedCount };
    } catch (e) {
      console.warn('Hydration from Supabase error:', e);
      return { success: false, loadedCount };
    }
  }

  /**
   * Controlled, idempotent release cleanup mechanism.
   * Clears legacy demo products, customers, transactions, and fake sessions,
   * while safely preserving genuine unsynchronized outbox mutations and hardware preferences.
   */
  public runReleaseDataCleanup(): { cleaned: boolean; preservedOutboxCount: number } {
    if (typeof localStorage === 'undefined') {
      return { cleaned: false, preservedOutboxCount: 0 };
    }

    if (localStorage.getItem(STORAGE_KEYS.RELEASE_CLEANUP_VERSION) === 'true') {
      return { cleaned: false, preservedOutboxCount: 0 };
    }

    // Preserve non-demo outbox items if any genuine offline mutations were queued
    let preservedOutboxCount = 0;
    const rawOutbox = localStorage.getItem(STORAGE_KEYS.SYNC_OUTBOX);
    let preservedOutbox: SyncOutboxItem[] = [];
    if (rawOutbox) {
      try {
        const parsed = JSON.parse(rawOutbox);
        if (Array.isArray(parsed)) {
          preservedOutbox = parsed.filter(
            (item) => item && !String(item.id || '').includes('demo') && !String(item.table || '').includes('mock')
          );
          preservedOutboxCount = preservedOutbox.length;
        }
      } catch {
        preservedOutbox = [];
      }
    }

    // Purge legacy business data and mock sessions
    const legacyBusinessKeys = [
      STORAGE_KEYS.PRODUCTS,
      STORAGE_KEYS.CUSTOMERS,
      STORAGE_KEYS.SALES,
      STORAGE_KEYS.EXPENSES,
      STORAGE_KEYS.COUPONS,
      STORAGE_KEYS.QUOTATIONS,
      STORAGE_KEYS.SUPPLIERS,
      STORAGE_KEYS.TIME_LOGS,
      STORAGE_KEYS.REFUNDS,
      STORAGE_KEYS.STOCK_MOVEMENTS,
      STORAGE_KEYS.USERS,
      STORAGE_KEYS.ACTIVE_USER,
      STORAGE_KEYS.IS_AUTHENTICATED,
    ];

    for (const key of legacyBusinessKeys) {
      localStorage.removeItem(key);
    }

    // Restore preserved legitimate outbox records
    if (preservedOutbox.length > 0) {
      localStorage.setItem(STORAGE_KEYS.SYNC_OUTBOX, JSON.stringify(preservedOutbox));
    } else {
      localStorage.removeItem(STORAGE_KEYS.SYNC_OUTBOX);
    }

    // Mark release cleanup complete (idempotent; will never run again on ordinary restarts)
    localStorage.setItem(STORAGE_KEYS.RELEASE_CLEANUP_VERSION, 'true');
    return { cleaned: true, preservedOutboxCount };
  }

  /**
   * Resets local business records to a pristine empty workspace state.
   */
  public resetToCleanState(): void {
    this.products = [];
    this.customers = [];
    this.sales = [];
    this.expenses = [];
    this.coupons = [];
    this.quotations = [];
    this.suppliers = [];
    this.timeLogs = [];
    this.refunds = [];
    this.stockMovements = [];
    this.users = [];
    this.activeUser = null;
    this.isAuthenticatedState = false;
    this.saveToStorage();
    this.notify();
  }

  /**
   * Isolated test-only helper to populate fixtures during automated tests
   */
  public seedTestDataForTesting(): void {
    this.products = [...INITIAL_PRODUCTS];
    this.customers = [...INITIAL_CUSTOMERS];
    this.sales = [...INITIAL_SALES];
    this.expenses = [...INITIAL_EXPENSES];
    this.coupons = [...INITIAL_COUPONS];
    this.quotations = [...INITIAL_QUOTATIONS];
    this.suppliers = [...INITIAL_SUPPLIERS];
    this.users = [...INITIAL_USERS];
    this.timeLogs = [...INITIAL_TIME_LOGS];
    this.saveToStorage();
    this.notify();
  }

  private loadFromStorage() {
    if (typeof localStorage === 'undefined') {
      this.products = [];
      this.customers = [];
      this.sales = [];
      this.expenses = [];
      this.coupons = [];
      this.quotations = [];
      this.suppliers = [];
      this.customFields = INITIAL_CUSTOM_FIELDS;
      this.users = [];
      this.timeLogs = [];
      this.organization = INITIAL_ORGANIZATION;
      this.fiscalYear = '2026–2027';
      this.branches = INITIAL_BRANCHES;
      this.roleNavOverrides = {};
      this.syncOutbox = [];
      this.activeUser = null;
      this.isAuthenticatedState = false;
      return;
    }

    try {
      const dedupe = <T extends { id: string }>(arr: T[]): T[] => {
        if (!Array.isArray(arr)) return [];
        const seen = new Set<string>();
        return arr.filter((item) => {
          if (!item || !item.id || seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
      };

      const storedProds = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
      this.products = storedProds ? dedupe(JSON.parse(storedProds)) : [];

      const storedCusts = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
      this.customers = storedCusts ? dedupe(JSON.parse(storedCusts)) : [];

      const storedSales = localStorage.getItem(STORAGE_KEYS.SALES);
      this.sales = storedSales ? dedupe(JSON.parse(storedSales)) : [];

      const storedExp = localStorage.getItem(STORAGE_KEYS.EXPENSES);
      this.expenses = storedExp ? dedupe(JSON.parse(storedExp)) : [];

      const storedCpn = localStorage.getItem(STORAGE_KEYS.COUPONS);
      this.coupons = storedCpn ? dedupe(JSON.parse(storedCpn)) : [];

      const storedQuotes = localStorage.getItem(STORAGE_KEYS.QUOTATIONS);
      this.quotations = storedQuotes ? dedupe(JSON.parse(storedQuotes)) : [];

      const storedSuppliers = localStorage.getItem(STORAGE_KEYS.SUPPLIERS);
      this.suppliers = storedSuppliers ? dedupe(JSON.parse(storedSuppliers)) : [];

      const storedCustomFields = localStorage.getItem(STORAGE_KEYS.CUSTOM_FIELDS);
      this.customFields = storedCustomFields ? JSON.parse(storedCustomFields) : INITIAL_CUSTOM_FIELDS;

      const storedUsers = localStorage.getItem(STORAGE_KEYS.USERS);
      this.users = storedUsers ? dedupe(JSON.parse(storedUsers)) : [];

      const storedTime = localStorage.getItem(STORAGE_KEYS.TIME_LOGS);
      this.timeLogs = storedTime ? JSON.parse(storedTime) : [];

      const storedPrefs = localStorage.getItem(STORAGE_KEYS.QUOTE_PREFERENCES);
      if (storedPrefs) {
        this.quotePreferences = JSON.parse(storedPrefs);
      }

      const storedRef = localStorage.getItem(STORAGE_KEYS.REFUNDS);
      this.refunds = storedRef ? JSON.parse(storedRef) : [];

      const storedMov = localStorage.getItem(STORAGE_KEYS.STOCK_MOVEMENTS);
      this.stockMovements = storedMov ? JSON.parse(storedMov) : [];

      const storedOutbox = localStorage.getItem(STORAGE_KEYS.SYNC_OUTBOX);
      this.syncOutbox = storedOutbox ? JSON.parse(storedOutbox) : [];

      const storedPrinter = localStorage.getItem(STORAGE_KEYS.PRINTER_CONFIG);
      this.printerConfig = storedPrinter ? JSON.parse(storedPrinter) : DEFAULT_PRINTER_CONFIG;

      const storedOffline = localStorage.getItem(STORAGE_KEYS.SIMULATED_OFFLINE);
      this.isSimulatedOffline = storedOffline ? JSON.parse(storedOffline) : false;

      const storedUser = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER);
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          if (parsed && parsed.id && !String(parsed.email || '').endsWith('@slate.local')) {
            this.activeUser = parsed;
          } else {
            this.activeUser = null;
          }
        } catch {
          this.activeUser = null;
        }
      } else {
        this.activeUser = null;
      }

      const storedBranch = localStorage.getItem(STORAGE_KEYS.ACTIVE_BRANCH);
      if (storedBranch) {
        this.activeBranchId = storedBranch;
      }

      const storedOrg = localStorage.getItem(STORAGE_KEYS.ORGANIZATION);
      if (storedOrg) {
        this.organization = JSON.parse(storedOrg);
      }

      const storedFY = localStorage.getItem(STORAGE_KEYS.FISCAL_YEAR);
      if (storedFY) {
        this.fiscalYear = storedFY;
      }

      const storedBranches = localStorage.getItem(STORAGE_KEYS.BRANCHES);
      if (storedBranches) {
        this.branches = JSON.parse(storedBranches);
      }

      const storedOverrides = localStorage.getItem(STORAGE_KEYS.ROLE_NAV_OVERRIDES);
      if (storedOverrides) {
        this.roleNavOverrides = JSON.parse(storedOverrides);
      }

      const storedAuth = localStorage.getItem(STORAGE_KEYS.IS_AUTHENTICATED);
      if (storedAuth !== null) {
        this.isAuthenticatedState = storedAuth === 'true' && Boolean(this.activeUser?.id);
      }
    } catch (e) {
      console.warn('Failed to parse local storage, resetting to clean business state', e);
      this.products = [];
      this.customers = [];
      this.sales = [];
      this.expenses = [];
      this.coupons = [];
      this.quotations = [];
      this.suppliers = [];
      this.customFields = INITIAL_CUSTOM_FIELDS;
      this.users = [];
      this.timeLogs = [];
      this.organization = INITIAL_ORGANIZATION;
      this.fiscalYear = INITIAL_ORGANIZATION.currentFiscalYear || '2026–2027';
      this.branches = INITIAL_BRANCHES;
      this.roleNavOverrides = {};
      this.syncOutbox = [];
      this.activeUser = null;
      this.isAuthenticatedState = false;
    }
  }

  private saveToStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(this.products));
      localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(this.customers));
      localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(this.sales));
      localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(this.expenses));
      localStorage.setItem(STORAGE_KEYS.COUPONS, JSON.stringify(this.coupons));
      localStorage.setItem(STORAGE_KEYS.QUOTATIONS, JSON.stringify(this.quotations));
      localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(this.suppliers));
      localStorage.setItem(STORAGE_KEYS.CUSTOM_FIELDS, JSON.stringify(this.customFields));
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users));
      localStorage.setItem(STORAGE_KEYS.TIME_LOGS, JSON.stringify(this.timeLogs));
      localStorage.setItem(STORAGE_KEYS.QUOTE_PREFERENCES, JSON.stringify(this.quotePreferences));
      localStorage.setItem(STORAGE_KEYS.REFUNDS, JSON.stringify(this.refunds));
      localStorage.setItem(STORAGE_KEYS.STOCK_MOVEMENTS, JSON.stringify(this.stockMovements));
      localStorage.setItem(STORAGE_KEYS.SYNC_OUTBOX, JSON.stringify(this.syncOutbox));
      localStorage.setItem(STORAGE_KEYS.PRINTER_CONFIG, JSON.stringify(this.printerConfig));
      localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, JSON.stringify(this.activeUser));
      localStorage.setItem(STORAGE_KEYS.ACTIVE_BRANCH, this.activeBranchId);
      localStorage.setItem(STORAGE_KEYS.ORGANIZATION, JSON.stringify(this.organization));
      localStorage.setItem(STORAGE_KEYS.FISCAL_YEAR, this.fiscalYear);
      localStorage.setItem(STORAGE_KEYS.BRANCHES, JSON.stringify(this.branches));
      localStorage.setItem(STORAGE_KEYS.ROLE_NAV_OVERRIDES, JSON.stringify(this.roleNavOverrides));
      localStorage.setItem(STORAGE_KEYS.SIMULATED_OFFLINE, JSON.stringify(this.isSimulatedOffline));
      localStorage.setItem(STORAGE_KEYS.IS_AUTHENTICATED, JSON.stringify(this.isAuthenticatedState));
    } catch (e) {
      console.error('Failed to write to local storage', e);
    }
  }

  // --- Getters ---
  public getProducts(): Product[] {
    return [...this.products];
  }

  public getCustomers(): Customer[] {
    return [...this.customers];
  }

  public getSales(): Sale[] {
    return [...this.sales];
  }

  public getExpenses(): Expense[] {
    return [...this.expenses];
  }

  public getCoupons(): Coupon[] {
    return [...this.coupons];
  }

  public saveCoupon(coupon: Coupon): void {
    const idx = this.coupons.findIndex((c) => c.id === coupon.id);
    if (idx >= 0) {
      this.coupons[idx] = coupon;
    } else {
      this.coupons.unshift(coupon);
    }
    this.notify();
  }

  public toggleCouponStatus(id: string): void {
    const coupon = this.coupons.find((c) => c.id === id);
    if (coupon) {
      coupon.isActive = !coupon.isActive;
      this.notify();
    }
  }

  public deleteCoupon(id: string): void {
    this.coupons = this.coupons.filter((c) => c.id !== id);
    this.notify();
  }

  // --- Quotations Management ---
  public getQuotations(): Quotation[] {
    return [...this.quotations];
  }

  public getQuotationById(id: string): Quotation | undefined {
    return this.quotations.find((q) => q.id === id);
  }

  public getNextQuoteNumber(): string {
    const numbers = this.quotations
      .map((q) => {
        const match = q.quoteNumber.match(/QT-(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const max = numbers.length > 0 ? Math.max(...numbers) : 0;
    return `QT-${String(max + 1).padStart(6, '0')}`;
  }

  public saveQuotation(quote: Quotation): void {
    const idx = this.quotations.findIndex((q) => q.id === quote.id);
    let targetQuote: Quotation;
    if (idx >= 0) {
      targetQuote = { ...quote, updatedAt: new Date().toISOString() };
      this.quotations[idx] = targetQuote;
    } else {
      targetQuote = {
        ...quote,
        createdAt: quote.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.quotations.unshift(targetQuote);
    }
    this.notify();

    if (isSupabaseConfigured() && !this.isDemoUser() && !this.isOffline()) {
      saveQuotationToSupabase(targetQuote).catch((e) => console.warn('Supabase quotation sync error:', e));
    }
  }

  public deleteQuotation(id: string): void {
    this.quotations = this.quotations.filter((q) => q.id !== id);
    this.notify();

    if (isSupabaseConfigured() && !this.isDemoUser() && !this.isOffline()) {
      deleteQuotationFromSupabase(id).catch((e) => console.warn('Supabase quotation delete error:', e));
    }
  }

  public addQuotationActivity(quoteId: string, action: string, notes?: string): void {
    const quote = this.quotations.find((q) => q.id === quoteId);
    if (quote) {
      if (!quote.activities) quote.activities = [];
      quote.activities.unshift({
        id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        action,
        actor: this.getActiveUser().name,
        notes,
      });
      this.notify();
    }
  }

  public convertQuotationToInvoice(quoteId: string): { success: boolean; sale?: Sale; error?: string } {
    const quote = this.quotations.find((q) => q.id === quoteId);
    if (!quote) {
      return { success: false, error: 'Quotation not found' };
    }

    // Prevent duplicate invoice creation if already converted
    if (quote.status === 'INVOICED' && quote.linkedInvoiceId) {
      const existingSale = this.sales.find((s) => s.id === quote.linkedInvoiceId);
      if (existingSale) {
        return { success: true, sale: existingSale };
      }
    }

    // Generate unique invoice number
    this.invoiceCounter += 1;
    const invoiceNumber = `INV-${new Date().getFullYear().toString().slice(-2)}-${String(this.invoiceCounter).padStart(4, '0')}`;
    const receiptNumber = `BLR-${new Date().getFullYear()}-${String(this.receiptCounter + 1).padStart(5, '0')}`;
    this.receiptCounter += 1;
    const saleId = `sale_conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const branch = INITIAL_BRANCHES.find((b) => b.id === this.activeBranchId) || INITIAL_BRANCHES[0];
    const now = new Date().toISOString();

    // Map items to CartItem format
    const mappedItems: CartItem[] = quote.items.map((qi) => {
      const existingProd = qi.productId ? this.products.find((p) => p.id === qi.productId) : undefined;
      const product: Product = existingProd || {
        id: qi.productId || `prod_adhoc_${Date.now()}`,
        sku: qi.sku || 'GEN-SKU',
        barcode: '0000000000000',
        hsn: qi.hsn || '9983',
        name: qi.name,
        categoryId: 'cat_general',
        categoryName: 'General Goods & Services',
        unit: (qi.unit?.toUpperCase() as any) || 'PCS',
        costPrice: qi.rate * 0.7,
        sellingPrice: qi.rate,
        gstRate: qi.gstRate,
        currentStock: 100,
        minStockAlert: 10,
        isActive: true,
        updatedAt: now,
      };

      return {
        product,
        quantity: qi.quantity,
        unitPrice: qi.rate,
        discountPercent: qi.discountPercent,
        discountAmount: qi.discountAmount,
        taxableAmount: qi.taxableAmount,
        cgstAmount: qi.cgstAmount,
        sgstAmount: qi.sgstAmount,
        igstAmount: qi.igstAmount,
        total: qi.total,
      };
    });

    const newSale: Sale = {
      id: saleId,
      receiptNumber,
      invoiceNumber,
      organizationId: INITIAL_ORGANIZATION.id,
      branchId: branch.id,
      branchName: branch.name,
      cashierId: this.getActiveUser().id,
      cashierName: this.getActiveUser().name,
      customerId: quote.customerId,
      customerName: quote.customerName,
      companyName: quote.companyName,
      customerEmail: quote.customerEmail,
      customerPhone: quote.customerPhone,
      customerGstin: quote.customerGstin,
      billingAddress: quote.billingAddress,
      shippingAddress: quote.shippingAddress,
      quotationId: quote.id,
      quoteNumber: quote.quoteNumber,
      items: mappedItems,
      subtotal: quote.subtotal,
      discountTotal: quote.discountTotal,
      taxableTotal: quote.taxableTotal,
      cgstTotal: quote.cgstTotal,
      sgstTotal: quote.sgstTotal,
      igstTotal: quote.igstTotal,
      roundOff: quote.roundOff,
      grandTotal: quote.grandTotal,
      paymentStatus: 'OVERDUE', // Unpaid upon creation
      dueDate: quote.expiryDate || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
      payments: [],
      notes: quote.notes,
      termsAndConditions: quote.termsAndConditions,
      isOfflineCreated: this.isOffline(),
      syncStatus: this.isOffline() ? 'PENDING' : 'SYNCED',
      createdAt: now,
    };

    // Update quote record
    quote.status = 'INVOICED';
    quote.linkedInvoiceId = newSale.id;
    quote.linkedInvoiceNumber = newSale.invoiceNumber;
    quote.updatedAt = now;
    if (!quote.activities) quote.activities = [];
    quote.activities.unshift({
      id: `act_${Date.now()}`,
      timestamp: now,
      action: `Converted quotation to Tax Invoice ${newSale.invoiceNumber}`,
      actor: this.getActiveUser().name,
      notes: `Invoice ${newSale.invoiceNumber} generated for ₹${newSale.grandTotal.toFixed(2)}`,
    });

    // Add sale to store
    this.sales.unshift(newSale);

    // Update customer order count and receivable balance
    const custIdx = this.customers.findIndex((c) => c.id === quote.customerId);
    if (custIdx >= 0) {
      this.customers[custIdx] = {
        ...this.customers[custIdx],
        currentReceivableBalance: this.customers[custIdx].currentReceivableBalance + newSale.grandTotal,
        totalOrdersCount: this.customers[custIdx].totalOrdersCount + 1,
      };
    }

    this.notify();
    return { success: true, sale: newSale };
  }

  // --- Suppliers Management ---
  public getSuppliers(): Supplier[] {
    return [...this.suppliers];
  }

  public saveSupplier(supplier: Supplier): void {
    const idx = this.suppliers.findIndex((s) => s.id === supplier.id);
    if (idx >= 0) {
      this.suppliers[idx] = supplier;
    } else {
      this.suppliers.unshift(supplier);
    }
    this.notify();

    if (isSupabaseConfigured() && !this.isDemoUser() && !this.isOffline()) {
      createSupplierInSupabase(supplier, this.organization.id).catch((e) =>
        console.warn('Supabase supplier sync error:', e)
      );
    }
  }

  public deleteSupplier(id: string): void {
    this.suppliers = this.suppliers.filter((s) => s.id !== id);
    this.notify();

    if (isSupabaseConfigured() && !this.isDemoUser() && !this.isOffline()) {
      deleteSupplierInSupabase(id).catch((e) => console.warn('Supabase supplier delete error:', e));
    }
  }

  // --- Custom Fields Configuration ---
  public getCustomFields(module?: 'QUOTES' | 'INVOICES' | 'CUSTOMERS'): CustomFieldDefinition[] {
    if (!module) return [...this.customFields];
    return this.customFields.filter((cf) => cf.module === module);
  }

  public saveCustomField(field: CustomFieldDefinition): void {
    const idx = this.customFields.findIndex((cf) => cf.id === field.id);
    if (idx >= 0) {
      this.customFields[idx] = field;
    } else {
      this.customFields.push(field);
    }
    this.notify();
  }

  public deleteCustomField(id: string): void {
    this.customFields = this.customFields.filter((cf) => cf.id !== id);
    this.notify();
  }

  // --- Quote Preferences ---
  public getQuotePreferences(): { visibleColumns: string[]; pageSize: number } {
    return { ...this.quotePreferences };
  }

  public saveQuotePreferences(prefs: { visibleColumns: string[]; pageSize: number }): void {
    this.quotePreferences = { ...prefs };
    this.notify();
  }

  // --- Direct Invoicing Persistence ---
  public saveInvoice(sale: Sale): void {
    const idx = this.sales.findIndex((s) => s.id === sale.id);
    if (idx >= 0) {
      this.sales[idx] = sale;
    } else {
      this.sales.unshift(sale);
    }
    this.notify();
  }

  public getRefunds(): RefundRecord[] {
    return [...this.refunds];
  }

  public getStockMovements(): StockMovement[] {
    return [...this.stockMovements];
  }

  public getSyncOutbox(): SyncOutboxItem[] {
    return [...this.syncOutbox];
  }

  public getPendingOutboxCount(): number {
    return this.syncOutbox.filter((i) => i.status === 'PENDING' || i.status === 'CONFLICT').length;
  }

  public getPrinterConfig(): HardwarePrinterConfig {
    return { ...this.printerConfig };
  }

  public getActiveUser(): UserProfile {
    if (!this.activeUser) {
      return {
        id: '',
        name: 'Not Signed In',
        email: '',
        phone: '',
        role: 'CASHIER',
        organizationId: this.organization?.id || '',
        branchId: this.activeBranchId || '',
        permissions: [],
      };
    }
    return { ...this.activeUser };
  }

  public getActiveBranchId(): string {
    return this.activeBranchId;
  }

  public getActiveBranch(): Branch {
    return this.branches.find((b) => b.id === this.activeBranchId) || this.branches[0] || INITIAL_BRANCHES[0];
  }

  public getOrganization(): Organization {
    return { ...this.organization };
  }

  public setOrganization(org: Partial<Organization>): void {
    this.organization = { ...this.organization, ...org };
    this.notify();
  }

  public getFiscalYear(): string {
    return this.fiscalYear;
  }

  public setFiscalYear(fy: string): void {
    this.fiscalYear = fy;
    this.organization.currentFiscalYear = fy;
    this.notify();
  }

  public getBranches(): Branch[] {
    return [...this.branches];
  }

  public setBranches(branches: Branch[]): void {
    this.branches = [...branches];
    this.notify();
  }

  public getRoleNavigationOverrides(): Record<string, string[]> {
    return { ...this.roleNavOverrides };
  }

  public setRoleNavigationOverrides(overrides: Record<string, string[]>): void {
    this.roleNavOverrides = { ...overrides };
    this.notify();
    notifyRoleNavigationChange();
  }

  public setSingleRoleNavigationOverride(role: string, additionalViews: string[]): void {
    this.roleNavOverrides[role] = [...additionalViews];
    this.notify();
    notifyRoleNavigationChange();
  }

  public resetRoleNavigationOverrides(): void {
    this.roleNavOverrides = {};
    this.notify();
    notifyRoleNavigationChange();
  }

  public isOffline(): boolean {
    return this.isSimulatedOffline || !navigator.onLine;
  }

  public getDeviceRegistration(): DeviceRegistration {
    return { ...this.deviceRegistration };
  }

  public getUsers(): UserProfile[] {
    return [...this.users];
  }

  public addUser(user: UserProfile) {
    this.users.unshift(user);
    this.notify();
  }

  public getTimeLogs(): TimeLog[] {
    return [...this.timeLogs];
  }

  public addTimeLog(log: TimeLog) {
    this.timeLogs.unshift(log);
    this.notify();

    if (isSupabaseConfigured() && !this.isDemoUser() && !this.isOffline()) {
      createTimeLogInSupabase(log, this.organization.id, this.activeBranchId).catch((e) =>
        console.warn('Supabase time log sync error:', e)
      );
    }
  }

  // --- Authentication & Session Controls ---
  public isAuthenticated(): boolean {
    return this.isAuthenticatedState;
  }

  public setAuthenticated(status: boolean): void {
    this.isAuthenticatedState = status;
    this.saveToStorage();
    this.notify();
  }

  public login(userId: string, branchId?: string, userProfile?: UserProfile): void {
    if (userProfile) {
      this.activeUser = userProfile;
      const idx = this.users.findIndex((u) => u.id === userProfile.id);
      if (idx >= 0) {
        this.users[idx] = userProfile;
      } else {
        this.users.push(userProfile);
      }
    } else {
      const user = this.users.find((u) => u.id === userId);
      if (user) {
        this.activeUser = user;
      }
    }
    if (branchId) {
      this.activeBranchId = branchId;
    }
    this.isAuthenticatedState = true;
    this.saveToStorage();
    this.notify();
  }

  public logout(): void {
    this.isAuthenticatedState = false;
    this.activeUser = null;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_USER);
      localStorage.removeItem(STORAGE_KEYS.IS_AUTHENTICATED);
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_USER);
      sessionStorage.removeItem(STORAGE_KEYS.IS_AUTHENTICATED);
    }
    this.saveToStorage();
    this.notify();
  }

  // --- Controls & Setters ---
  public setActiveUser(userId: string) {
    const user = this.users.find((u) => u.id === userId);
    if (user) {
      this.activeUser = user;
      this.notify();
    }
  }

  public setActiveBranch(branchId: string): boolean {
    const managerialRoles: UserRole[] = ['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER'];
    const currentRole = this.activeUser?.role || 'CASHIER';
    if (this.isAuthenticatedState && !managerialRoles.includes(currentRole)) {
      console.warn(`Role ${currentRole} is not permitted to switch branches.`);
      return false;
    }
    const exists = this.branches.some((b) => b.id === branchId);
    if (!exists) {
      console.warn(`Branch ${branchId} does not exist in store.`);
      return false;
    }
    this.activeBranchId = branchId;
    this.saveToStorage();
    this.notify();
    return true;
  }

  public toggleSimulatedOffline(forceOffline?: boolean) {
    this.isSimulatedOffline = forceOffline !== undefined ? forceOffline : !this.isSimulatedOffline;
    this.notify();
  }

  public updatePrinterConfig(config: Partial<HardwarePrinterConfig>) {
    this.printerConfig = { ...this.printerConfig, ...config };
    this.notify();
  }

  // --- Core POS Checkout Transaction (Atomic) ---
  public checkoutSale(params: {
    items: CartItem[];
    customer?: Customer | null;
    payments: PaymentRecord[];
    isInterState?: boolean;
    customDiscountPercent?: number;
    notes?: string;
  }): { success: boolean; sale?: Sale; error?: string } {
    if (params.items.length === 0) {
      return { success: false, error: 'Cart cannot be empty for checkout' };
    }

    // 1. Calculate final authoritative totals
    const totals = calculateCartTotals(params.items);

    // 2. Validate Payment Sum matches Grand Total
    const totalPaid = params.payments.reduce((acc, p) => acc + p.amount, 0);
    const isCreditSale = params.payments.some((p) => p.method === 'CREDIT');

    if (!isCreditSale && Math.abs(totalPaid - totals.grandTotal) > 1) {
      return {
        success: false,
        error: `Total payments (₹${totalPaid}) do not match bill total (₹${totals.grandTotal})`,
      };
    }

    // 3. Generate safe unique IDs
    this.receiptCounter += 1;
    this.invoiceCounter += 1;
    const saleId = `sale_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const receiptNumber = `BLR-2026-${String(this.receiptCounter).padStart(5, '0')}`;
    const invoiceNumber = `INV-26-${String(this.invoiceCounter).padStart(4, '0')}`;
    const now = new Date().toISOString();
    const branch = INITIAL_BRANCHES.find((b) => b.id === this.activeBranchId) || INITIAL_BRANCHES[0];

    // Determine payment status
    let paymentStatus: Sale['paymentStatus'] = 'PAID';
    if (isCreditSale) {
      paymentStatus = totalPaid === 0 ? 'OVERDUE' : 'PARTIALLY_PAID';
    }

    const isOffline = this.isOffline();

    // Map payment gateway status
    const mappedPayments = params.payments.map((p) => ({
      ...p,
      saleId,
      gatewayStatus:
        p.method === 'CASH'
          ? ('OFFLINE_RECORDED' as const)
          : isOffline
          ? ('OFFLINE_RECORDED' as const)
          : ('VERIFIED' as const),
    }));

    // Construct immutable Sale record
    const newSale: Sale = {
      id: saleId,
      receiptNumber,
      invoiceNumber,
      organizationId: INITIAL_ORGANIZATION.id,
      branchId: branch.id,
      branchName: branch.name,
      cashierId: this.getActiveUser().id,
      cashierName: this.getActiveUser().name,
      customerId: params.customer?.id,
      customerName: params.customer?.name,
      customerPhone: params.customer?.phone,
      items: params.items,
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      taxableTotal: totals.taxableTotal,
      cgstTotal: totals.cgstTotal,
      sgstTotal: totals.sgstTotal,
      igstTotal: totals.igstTotal,
      roundOff: totals.roundOff,
      grandTotal: totals.grandTotal,
      paymentStatus,
      dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
      payments: mappedPayments,
      isOfflineCreated: isOffline,
      syncStatus: isOffline ? 'PENDING' : 'SYNCED',
      createdAt: now,
    };

    // 4. Atomic updates in local memory:
    // a) Deduct stock for each product
    for (const item of params.items) {
      const prodIndex = this.products.findIndex((p) => p.id === item.product.id);
      if (prodIndex >= 0) {
        const current = this.products[prodIndex].currentStock;
        const newStock = Math.max(0, current - item.quantity);
        this.products[prodIndex] = {
          ...this.products[prodIndex],
          currentStock: newStock,
          updatedAt: now,
        };

        // Record stock movement
        const mov: StockMovement = {
          id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          productId: item.product.id,
          productName: item.product.name,
          sku: item.product.sku,
          type: 'SALE',
          quantityChange: -item.quantity,
          newBalance: newStock,
          referenceId: receiptNumber,
          notes: `POS sale checkout #${receiptNumber}`,
          performedBy: this.getActiveUser().name,
          timestamp: now,
        };
        this.stockMovements.unshift(mov);
      }
    }

    // b) If customer had credit balance, update receivables
    if (params.customer && isCreditSale) {
      const custIndex = this.customers.findIndex((c) => c.id === params.customer!.id);
      if (custIndex >= 0) {
        const unpaid = totals.grandTotal - totalPaid;
        this.customers[custIndex] = {
          ...this.customers[custIndex],
          currentReceivableBalance: this.customers[custIndex].currentReceivableBalance + unpaid,
          totalOrdersCount: this.customers[custIndex].totalOrdersCount + 1,
        };
      }
    }

    // c) Append Sale
    this.sales.unshift(newSale);

    // d) Append to Durable Sync Outbox (transactional queue)
    const outboxItem: SyncOutboxItem = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      eventId: `evt_${Date.now()}`,
      eventType: 'SALE_CREATED',
      entityId: saleId,
      payload: newSale,
      organizationId: INITIAL_ORGANIZATION.id,
      branchId: branch.id,
      deviceId: this.deviceRegistration.deviceId,
      idempotencyKey: `pos_checkout_${saleId}`,
      retryCount: 0,
      status: isOffline ? 'PENDING' : 'SYNCED',
      createdAt: now,
      syncedAt: isOffline ? undefined : now,
    };
    this.syncOutbox.unshift(outboxItem);

    // e) Direct Supabase cloud persistence if configured and live
    if (isSupabaseConfigured() && !this.isDemoUser() && !isOffline) {
      pushSaleToSupabase(newSale, outboxItem.idempotencyKey)
        .then((result) => {
          if (result.success) {
            newSale.syncStatus = 'SYNCED';
            outboxItem.status = 'SYNCED';
            outboxItem.syncedAt = new Date().toISOString();
            this.saveToStorage();
            this.notify();
          } else {
            console.warn('Supabase sale push queued for later sync:', result.error);
            newSale.syncStatus = 'PENDING';
            outboxItem.status = 'PENDING';
            outboxItem.errorMessage = result.error;
            this.saveToStorage();
            this.notify();
          }
        })
        .catch((err) => {
          console.warn('Supabase network error, queued in outbox:', err);
          newSale.syncStatus = 'PENDING';
          outboxItem.status = 'PENDING';
          this.saveToStorage();
          this.notify();
        });
    }

    this.notify();
    return { success: true, sale: newSale };
  }

  // --- Refunds & Credit Notes ---
  public issueRefund(params: {
    saleId: string;
    items: { productId: string; quantity: number; refundAmount: number }[];
    reason: string;
    restock: boolean;
    refundMethod: 'CASH' | 'UPI';
  }): { success: boolean; refund?: RefundRecord; error?: string } {
    const sale = this.sales.find((s) => s.id === params.saleId);
    if (!sale) return { success: false, error: 'Sale record not found' };

    const totalRefundAmount = params.items.reduce((sum, i) => sum + i.refundAmount, 0);
    if (totalRefundAmount <= 0) {
      return { success: false, error: 'Refund amount must be greater than zero' };
    }

    if (totalRefundAmount > sale.grandTotal) {
      return { success: false, error: 'Refund amount cannot exceed invoice grand total' };
    }

    const now = new Date().toISOString();
    const refundRecord: RefundRecord = {
      id: `ref_${Date.now()}`,
      saleId: sale.id,
      receiptNumber: sale.receiptNumber,
      refundAmount: totalRefundAmount,
      items: params.items.map((i) => {
        const prod = this.products.find((p) => p.id === i.productId);
        return {
          productId: i.productId,
          productName: prod ? prod.name : 'Item',
          quantity: i.quantity,
          unitPrice: prod ? prod.sellingPrice : 0,
          refundAmount: i.refundAmount,
          restockInventory: params.restock,
        };
      }),
      reason: params.reason,
      approvedBy: this.getActiveUser().name,
      refundMethod: params.refundMethod,
      createdAt: now,
    };

    // Restock items if requested
    if (params.restock) {
      for (const item of params.items) {
        const prodIndex = this.products.findIndex((p) => p.id === item.productId);
        if (prodIndex >= 0) {
          const current = this.products[prodIndex].currentStock;
          const newStock = current + item.quantity;
          this.products[prodIndex] = {
            ...this.products[prodIndex],
            currentStock: newStock,
            updatedAt: now,
          };
          this.stockMovements.unshift({
            id: `mov_ref_${Date.now()}`,
            productId: item.productId,
            productName: this.products[prodIndex].name,
            sku: this.products[prodIndex].sku,
            type: 'RETURN',
            quantityChange: item.quantity,
            newBalance: newStock,
            referenceId: sale.receiptNumber,
            notes: `Restock on return - ${params.reason}`,
            performedBy: this.getActiveUser().name,
            timestamp: now,
          });
        }
      }
    }

    // Update sale status
    const saleIndex = this.sales.findIndex((s) => s.id === params.saleId);
    if (saleIndex >= 0) {
      this.sales[saleIndex] = {
        ...this.sales[saleIndex],
        paymentStatus: 'REFUNDED',
      };
    }

    this.refunds.unshift(refundRecord);

    // Queue to sync outbox
    this.syncOutbox.unshift({
      id: `sync_${Date.now()}`,
      eventId: `evt_${Date.now()}`,
      eventType: 'REFUND_RECORDED',
      entityId: refundRecord.id,
      payload: refundRecord,
      organizationId: INITIAL_ORGANIZATION.id,
      branchId: this.activeBranchId,
      deviceId: this.deviceRegistration.deviceId,
      idempotencyKey: `refund_${refundRecord.id}`,
      retryCount: 0,
      status: this.isOffline() ? 'PENDING' : 'SYNCED',
      createdAt: now,
      syncedAt: this.isOffline() ? undefined : now,
    });

    this.notify();
    return { success: true, refund: refundRecord };
  }

  // --- Product Management ---
  public addProduct(product: Omit<Product, 'id' | 'updatedAt'>): Product {
    const newProd: Product = {
      ...product,
      id: `prod_${Date.now()}`,
      updatedAt: new Date().toISOString(),
    };
    this.products.unshift(newProd);

    this.stockMovements.unshift({
      id: `mov_init_${Date.now()}`,
      productId: newProd.id,
      productName: newProd.name,
      sku: newProd.sku,
      type: 'PURCHASE',
      quantityChange: newProd.currentStock,
      newBalance: newProd.currentStock,
      referenceId: 'OPENING_STOCK',
      notes: 'Initial catalogue entry stock',
      performedBy: this.getActiveUser().name,
      timestamp: new Date().toISOString(),
    });

    this.notify();

    if (isSupabaseConfigured() && !this.isDemoUser() && !this.isOffline()) {
      createProductInSupabase(newProd, this.organization.id, this.activeBranchId).catch((e) =>
        console.warn('Supabase product create error:', e)
      );
    }

    return newProd;
  }

  public updateProduct(id: string, updates: Partial<Product>) {
    const idx = this.products.findIndex((p) => p.id === id);
    if (idx >= 0) {
      this.products[idx] = {
        ...this.products[idx],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      this.notify();

      if (isSupabaseConfigured() && !this.isDemoUser() && !this.isOffline()) {
        updateProductInSupabase(id, updates).catch((e) =>
          console.warn('Supabase product update error:', e)
        );
      }
    }
  }

  public adjustStock(params: {
    productId: string;
    newStock: number;
    reason: string;
    type: 'ADJUSTMENT' | 'AUDIT_CORRECTION';
  }) {
    const idx = this.products.findIndex((p) => p.id === params.productId);
    if (idx >= 0) {
      const oldStock = this.products[idx].currentStock;
      const diff = params.newStock - oldStock;
      this.products[idx].currentStock = params.newStock;
      this.products[idx].updatedAt = new Date().toISOString();

      this.stockMovements.unshift({
        id: `mov_adj_${Date.now()}`,
        productId: params.productId,
        productName: this.products[idx].name,
        sku: this.products[idx].sku,
        type: params.type,
        quantityChange: diff,
        newBalance: params.newStock,
        referenceId: 'STOCK_AUDIT',
        notes: params.reason,
        performedBy: this.getActiveUser().name,
        timestamp: new Date().toISOString(),
      });

      this.notify();

      if (isSupabaseConfigured() && !this.isDemoUser() && !this.isOffline()) {
        updateProductInSupabase(params.productId, { currentStock: params.newStock }).catch((e) =>
          console.warn('Supabase stock adjustment sync error:', e)
        );
      }
    }
  }

  // --- Customer Management ---
  public addCustomer(customer: Omit<Customer, 'id' | 'createdAt' | 'currentReceivableBalance' | 'totalOrdersCount'>): Customer {
    const newCust: Customer = {
      ...customer,
      id: `cust_${Date.now()}`,
      currentReceivableBalance: 0,
      totalOrdersCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.customers.unshift(newCust);
    this.notify();

    if (isSupabaseConfigured() && !this.isDemoUser() && !this.isOffline()) {
      createCustomerInSupabase(newCust, this.organization.id, this.activeBranchId).catch((e) =>
        console.warn('Supabase customer create error:', e)
      );
    }

    return newCust;
  }

  public allocateCustomerPayment(customerId: string, amount: number, method: 'UPI' | 'CASH' | 'NEFT/RTGS', ref: string) {
    const idx = this.customers.findIndex((c) => c.id === customerId);
    if (idx >= 0) {
      const current = this.customers[idx].currentReceivableBalance;
      this.customers[idx].currentReceivableBalance = Math.max(0, current - amount);

      // Also mark oldest overdue sales as paid or partially paid
      let remainingToAllocate = amount;
      for (const sale of this.sales) {
        if (sale.customerId === customerId && (sale.paymentStatus === 'OVERDUE' || sale.paymentStatus === 'PARTIALLY_PAID')) {
          const unpaid = sale.grandTotal - sale.payments.reduce((s, p) => s + p.amount, 0);
          if (unpaid > 0) {
            const alloc = Math.min(unpaid, remainingToAllocate);
            sale.payments.push({
              id: `pay_alloc_${Date.now()}`,
              saleId: sale.id,
              method: method === 'NEFT/RTGS' ? 'CARD' : method,
              amount: alloc,
              utrOrRef: ref,
              gatewayStatus: 'VERIFIED',
              timestamp: new Date().toISOString(),
            });
            remainingToAllocate -= alloc;
            if (alloc >= unpaid) {
              sale.paymentStatus = 'PAID';
            } else {
              sale.paymentStatus = 'PARTIALLY_PAID';
            }
            if (remainingToAllocate <= 0) break;
          }
        }
      }

      this.notify();

      if (isSupabaseConfigured() && !this.isDemoUser() && !this.isOffline()) {
        allocateCustomerPaymentInSupabase(customerId, amount).catch((e) =>
          console.warn('Supabase customer payment allocation sync error:', e)
        );
      }
    }
  }

  // --- Expense Management ---
  public addExpense(expense: Omit<Expense, 'id'>): Expense {
    const newExp: Expense = {
      ...expense,
      id: `exp_${Date.now()}`,
    };
    this.expenses.unshift(newExp);
    this.notify();

    if (isSupabaseConfigured() && !this.isDemoUser() && !this.isOffline()) {
      createExpenseInSupabase(newExp).catch((e) =>
        console.warn('Supabase expense create error:', e)
      );
    }

    return newExp;
  }

  // --- Outbox Sync Engine Actions ---
  public async synchronizeOutbox(): Promise<{ syncedCount: number; errors: number }> {
    const pending = this.syncOutbox.filter((item) => item.status === 'PENDING' || item.status === 'CONFLICT');
    if (pending.length === 0) return { syncedCount: 0, errors: 0 };

    // Set status to SYNCING
    this.syncOutbox = this.syncOutbox.map((i) =>
      pending.some((p) => p.id === i.id) ? { ...i, status: 'SYNCING' as const } : i
    );
    this.notify();

    let syncedCount = 0;
    let errors = 0;

    // 1. Direct Supabase RPC sync if configured and online
    if (isSupabaseConfigured() && !this.isDemoUser() && !this.isOffline()) {
      for (const item of pending) {
        if (item.eventType === 'SALE_CREATED' && item.payload) {
          try {
            const pushRes = await pushSaleToSupabase(item.payload, item.idempotencyKey);
            if (pushRes.success) {
              item.status = 'SYNCED';
              item.syncedAt = new Date().toISOString();
              syncedCount++;
              // Mark corresponding sale
              const sIdx = this.sales.findIndex((s) => s.id === item.entityId);
              if (sIdx >= 0) this.sales[sIdx].syncStatus = 'SYNCED';
            }
          } catch (e) {
            console.warn('Direct Supabase outbox push error:', e);
          }
        }
      }
    }

    try {
      // 2. Also send to server API sync endpoint /api/v1/sync/push
      const res = await fetch('/api/v1/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: this.deviceRegistration.deviceId,
          items: pending,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        const successIds: string[] = result.processedIds || pending.map((p) => p.id);
        const now = new Date().toISOString();

        this.syncOutbox = this.syncOutbox.map((i) => {
          if (successIds.includes(i.id) || i.status === 'SYNCED') {
            if (i.status !== 'SYNCED') syncedCount++;
            return { ...i, status: 'SYNCED', syncedAt: now, errorMessage: undefined };
          }
          return i;
        });

        // Mark sales as SYNCED
        this.sales = this.sales.map((s) => ({ ...s, syncStatus: 'SYNCED' }));
      } else {
        throw new Error(`Sync failed with HTTP status ${res.status}`);
      }
    } catch (err: any) {
      console.warn('Sync server connection failed, marking for retry:', err.message);
      // Fallback: if server not reachable, simulate retry increment for remaining unsynced
      this.syncOutbox = this.syncOutbox.map((i) => {
        if (pending.some((p) => p.id === i.id) && i.status !== 'SYNCED') {
          errors++;
          return {
            ...i,
            status: 'PENDING',
            retryCount: i.retryCount + 1,
            errorMessage: err.message || 'Network unreachable',
          };
        }
        return i;
      });
    }

    this.notify();
    return { syncedCount, errors };
  }

  // --- Diagnostics & Database Backup/Restore ---
  public exportDatabaseDump(): string {
    return JSON.stringify(
      {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        device: this.deviceRegistration,
        products: this.products,
        customers: this.customers,
        sales: this.sales,
        expenses: this.expenses,
        stockMovements: this.stockMovements,
        outbox: this.syncOutbox,
      },
      null,
      2
    );
  }

  public resetToFactorySeed() {
    this.products = [...INITIAL_PRODUCTS];
    this.customers = [...INITIAL_CUSTOMERS];
    this.sales = [...INITIAL_SALES];
    this.expenses = [...INITIAL_EXPENSES];
    this.coupons = [...INITIAL_COUPONS];
    this.quotations = [...INITIAL_QUOTATIONS];
    this.suppliers = [...INITIAL_SUPPLIERS];
    this.customFields = [...INITIAL_CUSTOM_FIELDS];
    this.refunds = [];
    this.stockMovements = [];
    this.syncOutbox = [];
    this.isSimulatedOffline = false;
    this.notify();
  }
}

export const offlineStore = new OfflineStore();
