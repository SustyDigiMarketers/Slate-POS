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
  SyncEventType,
  SaveLifecycleState,
  SaveStatusSnapshot,
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
  BankAccount,
  BankTransaction,
  BankTransactionType,
  CreditNote,
  CreditNoteItem,
  CreditNoteStatus,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  GoodsReceipt,
  GoodsReceiptItem,
  SupplierBill,
  SupplierBillStatus,
  SupplierPayment,
  CustomerReceipt,
  CustomerReceiptAllocation,
  PaymentMode,
  ChartOfAccount,
  AccountClass,
  JournalEntry,
  JournalEntryLine,
  AccountingSourceType,
  GeneralLedgerEntry,
  AccountingPostingRecord,
  AccountingPeriod,
  Budget,
  BudgetLine,
  BudgetPeriodType,
  BulkImportBatch,
  BulkImportEntityType,
  BulkImportErrorRow,
  DebitNote,
  DebitNoteItem,
  BankReconciliation,
  FinancialAuditLog,
  UnifiedTransactionRow,
  TrialBalanceRow,
  ProfitAndLossReport,
  BalanceSheetReport,
  CashFlowReport,
  GstReportSummary,
  BudgetVarianceRow,
} from '../types';
import {
  createDefaultChartOfAccounts,
  findAccountByCode,
  getNormalBalanceSide,
  roundMoney,
  sumMoney,
  SYSTEM_ACCOUNT_CODES,
  validateDoubleEntryLines,
  buildSaleJournalLines,
  buildSaleRefundLines,
  buildCustomerPaymentLines,
  buildCreditNoteLines,
  buildCreditNoteRefundLines,
  buildSupplierBillLines,
  buildSupplierPaymentLines,
  buildDebitNoteLines,
  buildExpenseJournalLines,
  buildBankTransactionLines,
  buildReversalJournalLines,
  expandJournalToGeneralLedger,
  recalculateAccountBalances,
  computeTrialBalance,
  computeProfitAndLoss,
  computeBalanceSheet,
  computeCashFlowStatement,
  computeGstReport,
  computeBudgetVariance,
} from './accountingEngine';
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
  INITIAL_BANK_ACCOUNTS,
  INITIAL_BANK_TRANSACTIONS,
  INITIAL_CREDIT_NOTES,
  INITIAL_PURCHASE_ORDERS,
  INITIAL_GOODS_RECEIPTS,
  INITIAL_SUPPLIER_BILLS,
  INITIAL_SUPPLIER_PAYMENTS,
} from './initialData';
import { calculateCartTotals } from './taxCalculations';
import { notifyRoleNavigationChange } from './roleNavigation';
import { canSwitchOrgBranches, hasPermission } from './permissions';
import { applyDocumentFavicon, sanitizeBrandImageUrl } from './branding';
import {
  isSupabaseConfigured,
  pushSaleToSupabase,
  pushRefundToSupabase,
  fetchProductsFromSupabase,
  createProductInSupabase,
  updateProductInSupabase,
  deleteProductInSupabase,
  syncStockMovementToSupabase,
  fetchCustomersFromSupabase,
  createCustomerInSupabase,
  updateCustomerInSupabase,
  deleteCustomerInSupabase,
  allocateCustomerPaymentInSupabase,
  fetchSuppliersFromSupabase,
  saveSupplierInSupabase,
  createSupplierInSupabase,
  deleteSupplierInSupabase,
  fetchExpensesFromSupabase,
  createExpenseInSupabase,
  updateExpenseInSupabase,
  deleteExpenseInSupabase,
  fetchQuotationsFromSupabase,
  saveQuotationToSupabase,
  deleteQuotationFromSupabase,
  fetchSalesFromSupabase,
  fetchTimeLogsFromSupabase,
  createTimeLogInSupabase,
  fetchCouponsFromSupabase,
  saveCouponToSupabase,
  deleteCouponInSupabase,
  fetchCustomFieldsFromSupabase,
  saveCustomFieldToSupabase,
  deleteCustomFieldInSupabase,
  fetchPrinterConfigFromSupabase,
  savePrinterConfigToSupabase,
  fetchUserPreferencesFromSupabase,
  saveUserPreferencesToSupabase,
  pushSyncOutboxBatch,
  pullIncrementalUpdatesFromSupabase,
  subscribeToOrganizationRealtime,
  fetchRoleNavigationConfigs,
  getSupabaseSession,
  fetchOrganizationFromSupabase,
  updateOrganizationInSupabase,
  fetchOrganizationBranches,
  saveBranchToSupabase,
  fetchBankAccountsFromSupabase,
  saveBankAccountToSupabase,
  fetchBankTransactionsFromSupabase,
  saveBankTransactionToSupabase,
  fetchCreditNotesFromSupabase,
  saveCreditNoteToSupabase,
  fetchPurchaseOrdersFromSupabase,
  savePurchaseOrderToSupabase,
  fetchGoodsReceiptsFromSupabase,
  saveGoodsReceiptToSupabase,
  fetchSupplierBillsFromSupabase,
  saveSupplierBillToSupabase,
  fetchSupplierPaymentsFromSupabase,
  saveSupplierPaymentToSupabase,
  fetchCustomerReceiptsFromSupabase,
  saveCustomerReceiptToSupabase,
  fetchAccountingSnapshotFromSupabase,
  syncChartOfAccountToSupabase,
  deleteChartOfAccountInSupabase,
  syncJournalEntryToSupabase,
  postJournalEntryInSupabase,
  reverseJournalEntryInSupabase,
  syncAccountingPeriodLockToSupabase,
  syncBudgetToSupabase,
  approveBudgetInSupabase,
  syncBankReconciliationToSupabase,
  syncBulkImportBatchToSupabase,
  syncDebitNoteToSupabase,
  approveDebitNoteInSupabase,
  cancelDebitNoteInSupabase,
  recordFinancialAuditLogInSupabase,
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
  BANK_ACCOUNTS: 'slate_pos_local_bank_accounts',
  BANK_TRANSACTIONS: 'slate_pos_local_bank_transactions',
  CREDIT_NOTES: 'slate_pos_local_credit_notes',
  PURCHASE_ORDERS: 'slate_pos_local_purchase_orders',
  GOODS_RECEIPTS: 'slate_pos_local_goods_receipts',
  SUPPLIER_BILLS: 'slate_pos_local_supplier_bills',
  SUPPLIER_PAYMENTS: 'slate_pos_local_supplier_payments',
  CUSTOMER_RECEIPTS: 'slate_pos_local_customer_receipts',
  CHART_OF_ACCOUNTS: 'slate_pos_local_coa',
  JOURNAL_ENTRIES: 'slate_pos_local_journals',
  GENERAL_LEDGER: 'slate_pos_local_gl',
  POSTING_RECORDS: 'slate_pos_local_postings',
  ACCOUNTING_PERIODS: 'slate_pos_local_periods',
  BUDGETS: 'slate_pos_local_budgets',
  BULK_IMPORT_BATCHES: 'slate_pos_local_bulk_batches',
  DEBIT_NOTES: 'slate_pos_local_debit_notes',
  BANK_RECONCILIATIONS: 'slate_pos_local_reconciliations',
  FINANCIAL_AUDIT_LOGS: 'slate_pos_local_audit_logs',
  DRAFTS: 'slate_pos_local_drafts',
  LAST_SYNC_CURSOR: 'slate_pos_last_sync_cursor',
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

const EMPTY_ORGANIZATION: Organization = {
  id: '',
  organizationCode: '',
  name: '',
  tradeName: '',
  gstin: '',
  pan: '',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  address: '',
  city: '',
  state: '',
  pincode: '',
  phone: '',
  email: '',
  subscriptionPlanId: 'plan_free',
  subscriptionStatus: 'TRIALING',
  currentFiscalYear: '2026–2027',
};

const TENANT_STORAGE_KEYS: string[] = [
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
  STORAGE_KEYS.SYNC_OUTBOX,
  STORAGE_KEYS.USERS,
  STORAGE_KEYS.BANK_ACCOUNTS,
  STORAGE_KEYS.BANK_TRANSACTIONS,
  STORAGE_KEYS.CREDIT_NOTES,
  STORAGE_KEYS.PURCHASE_ORDERS,
  STORAGE_KEYS.GOODS_RECEIPTS,
  STORAGE_KEYS.SUPPLIER_BILLS,
  STORAGE_KEYS.SUPPLIER_PAYMENTS,
  STORAGE_KEYS.CUSTOMER_RECEIPTS,
  STORAGE_KEYS.CHART_OF_ACCOUNTS,
  STORAGE_KEYS.JOURNAL_ENTRIES,
  STORAGE_KEYS.GENERAL_LEDGER,
  STORAGE_KEYS.POSTING_RECORDS,
  STORAGE_KEYS.ACCOUNTING_PERIODS,
  STORAGE_KEYS.BUDGETS,
  STORAGE_KEYS.BULK_IMPORT_BATCHES,
  STORAGE_KEYS.DEBIT_NOTES,
  STORAGE_KEYS.BANK_RECONCILIATIONS,
  STORAGE_KEYS.FINANCIAL_AUDIT_LOGS,
  STORAGE_KEYS.ORGANIZATION,
  STORAGE_KEYS.BRANCHES,
  STORAGE_KEYS.ACTIVE_BRANCH,
  STORAGE_KEYS.ROLE_NAV_OVERRIDES,
  STORAGE_KEYS.DRAFTS,
  STORAGE_KEYS.LAST_SYNC_CURSOR,
];

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
  private bankAccounts: BankAccount[] = [];
  private bankTransactions: BankTransaction[] = [];
  private creditNotes: CreditNote[] = [];
  private purchaseOrders: PurchaseOrder[] = [];
  private goodsReceipts: GoodsReceipt[] = [];
  private supplierBills: SupplierBill[] = [];
  private supplierPayments: SupplierPayment[] = [];
  private customerReceipts: CustomerReceipt[] = [];
  private chartOfAccounts: ChartOfAccount[] = [];
  private journalEntries: JournalEntry[] = [];
  private generalLedger: GeneralLedgerEntry[] = [];
  private postingRecords: AccountingPostingRecord[] = [];
  private accountingPeriods: AccountingPeriod[] = [];
  private budgets: Budget[] = [];
  private bulkImportBatches: BulkImportBatch[] = [];
  private debitNotes: DebitNote[] = [];
  private bankReconciliations: BankReconciliation[] = [];
  private financialAuditLogs: FinancialAuditLog[] = [];
  private quotePreferences = {
    visibleColumns: ['date', 'quoteNumber', 'customerName', 'companyName', 'paymentStatus', 'grandTotal', 'actions'],
    pageSize: 10,
  };
  private refunds: RefundRecord[] = [];
  private stockMovements: StockMovement[] = [];
  private syncOutbox: SyncOutboxItem[] = [];
  private printerConfig: HardwarePrinterConfig = DEFAULT_PRINTER_CONFIG;
  private activeUser: UserProfile | null = null;
  private activeBranchId: string = '';
  private organization: Organization = { ...EMPTY_ORGANIZATION };
  private fiscalYear: string = '2026–2027';
  private branches: Branch[] = [];
  private roleNavOverrides: Record<string, string[]> = {};
  private isSimulatedOffline: boolean = false;
  private isAuthenticatedState: boolean = false;
  private lastSyncError: string | null = null;
  private drafts: Record<string, { data: any; updatedAt: string }> = {};
  private lastSyncCursor: string = '';
  private saveLifecycleState: SaveLifecycleState = 'IDLE';
  private lastSavedAt: string | undefined = undefined;
  private lastSavedEntity: string | undefined = undefined;
  private inFlightSaves: number = 0;
  private autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  private realtimeUnsub: (() => void) | null = null;
  private syncInProgress: boolean = false;
  private windowListenersBound: boolean = false;
  private boundOnlineHandler: (() => void) | null = null;
  private boundFocusHandler: (() => void) | null = null;
  private draftSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
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
    if (this.organization.id) {
      this.ensureAccountingDefaults(this.organization.id);
    }
  }

  public getLastSyncError(): string | null {
    return this.lastSyncError;
  }

  public clearLastSyncError(): void {
    if (this.lastSyncError !== null || this.saveLifecycleState === 'FAILED') {
      this.lastSyncError = null;
      if (this.saveLifecycleState === 'FAILED') {
        this.saveLifecycleState = this.lastSavedAt ? 'SAVED' : 'IDLE';
      }
      this.listeners.forEach((fn) => fn());
    }
  }

  public getSaveStatus(): SaveStatusSnapshot {
    const pendingCount = this.syncOutbox.filter(
      (i) => i.status === 'PENDING' || i.status === 'SYNCING' || i.status === 'CONFLICT'
    ).length;
    const failedCount = this.syncOutbox.filter((i) => i.status === 'FAILED').length;
    const isOnline = typeof navigator !== 'undefined' ? !this.isOffline() : !this.isSimulatedOffline;
    return {
      state: this.saveLifecycleState,
      lastSavedAt: this.lastSavedAt,
      lastError: this.lastSyncError || undefined,
      lastEntity: this.lastSavedEntity,
      pendingCount,
      failedCount,
      isOnline,
    };
  }

  private beginCloudSave(entityLabel: string): void {
    this.inFlightSaves += 1;
    this.saveLifecycleState = 'SAVING';
    this.lastSavedEntity = entityLabel;
    this.listeners.forEach((fn) => fn());
  }

  private completeCloudSave(
    entityLabel: string,
    ok: boolean,
    errorMessage?: string,
    fallbackOutbox?: {
      eventType: SyncEventType;
      entityId: string;
      payload: any;
      expectedVersion?: number;
    }
  ): void {
    this.inFlightSaves = Math.max(0, this.inFlightSaves - 1);
    if (ok) {
      this.lastSyncError = null;
      this.lastSavedAt = new Date().toISOString();
      this.lastSavedEntity = entityLabel;
      this.saveLifecycleState = this.inFlightSaves > 0 ? 'SAVING' : 'SAVED';
      if (fallbackOutbox) {
        this.syncOutbox = this.syncOutbox.map((item) =>
          item.eventType === fallbackOutbox.eventType &&
          item.entityId === fallbackOutbox.entityId &&
          item.status !== 'SYNCED'
            ? { ...item, status: 'SYNCED' as const, syncedAt: this.lastSavedAt, errorMessage: undefined }
            : item
        );
      }
    } else {
      const msg = errorMessage || 'Failed to save changes to cloud database';
      this.lastSyncError = `${entityLabel}: ${msg}`;
      this.lastSavedEntity = entityLabel;
      this.saveLifecycleState = 'FAILED';
      if (fallbackOutbox) {
        this.enqueueOutboxWithRetry(
          fallbackOutbox.eventType,
          fallbackOutbox.entityId,
          fallbackOutbox.payload,
          fallbackOutbox.expectedVersion,
          msg
        );
      }
    }
    this.saveToStorage();
    this.listeners.forEach((fn) => fn());
  }

  private enqueueOutboxWithRetry(
    eventType: SyncEventType,
    entityId: string,
    payload: any,
    expectedVersion?: number,
    errorMessage?: string
  ): SyncOutboxItem {
    const now = new Date().toISOString();
    const idempotencyKey = `${eventType}_${entityId}`;
    const existingIdx = this.syncOutbox.findIndex(
      (i) =>
        (i.idempotencyKey === idempotencyKey || (i.eventType === eventType && i.entityId === entityId)) &&
        i.status !== 'SYNCED'
    );

    if (existingIdx >= 0) {
      const existing = this.syncOutbox[existingIdx];
      const nextRetry = existing.retryCount + (errorMessage ? 1 : 0);
      const backoffMs = Math.min(300000, 1500 * Math.pow(2, nextRetry));
      const updated: SyncOutboxItem = {
        ...existing,
        payload,
        expectedVersion: expectedVersion ?? existing.expectedVersion,
        retryCount: nextRetry,
        status: nextRetry >= 5 ? 'FAILED' : 'PENDING',
        errorMessage: errorMessage ?? existing.errorMessage,
        lastAttemptAt: errorMessage ? now : existing.lastAttemptAt,
        nextRetryAt: errorMessage ? new Date(Date.now() + backoffMs).toISOString() : existing.nextRetryAt,
      };
      this.syncOutbox[existingIdx] = updated;
      return updated;
    }

    const backoffMs = 1500;
    const newItem: SyncOutboxItem = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      eventId: `evt_${Date.now()}`,
      eventType,
      entityId,
      payload,
      organizationId: this.organization.id,
      branchId: this.activeBranchId,
      deviceId: this.deviceRegistration.deviceId,
      idempotencyKey,
      retryCount: errorMessage ? 1 : 0,
      status: 'PENDING',
      errorMessage,
      expectedVersion,
      lastAttemptAt: errorMessage ? now : undefined,
      nextRetryAt: errorMessage ? new Date(Date.now() + backoffMs).toISOString() : undefined,
      createdAt: now,
    };
    this.syncOutbox.unshift(newItem);
    return newItem;
  }

  private runCloudMutation(
    entityLabel: string,
    outboxSpec: {
      eventType: SyncEventType;
      entityId: string;
      payload: any;
      expectedVersion?: number;
    } | null,
    fn: () => Promise<{ success: boolean; error?: string; fromCloud?: boolean } | boolean>
  ): void {
    if (!this.shouldSyncCloud()) {
      if (isSupabaseConfigured() && outboxSpec) {
        this.enqueueOutboxWithRetry(
          outboxSpec.eventType,
          outboxSpec.entityId,
          outboxSpec.payload,
          outboxSpec.expectedVersion
        );
        this.saveToStorage();
        this.listeners.forEach((fn) => fn());
      }
      return;
    }
    this.beginCloudSave(entityLabel);
    fn()
      .then((res) => {
        const ok = typeof res === 'boolean' ? res : Boolean(res?.success && res.fromCloud !== false);
        const errMsg = typeof res === 'boolean' ? (res ? undefined : 'Cloud save rejected') : res?.error;
        this.completeCloudSave(entityLabel, ok, errMsg, ok ? undefined : outboxSpec || undefined);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err || 'Network error');
        this.completeCloudSave(entityLabel, false, msg, outboxSpec || undefined);
      });
  }

  public async retryFailedSync(): Promise<{ syncedCount: number; errors: number }> {
    this.syncOutbox = this.syncOutbox.map((item) =>
      item.status === 'FAILED' || item.status === 'CONFLICT'
        ? { ...item, status: 'PENDING' as const, nextRetryAt: undefined }
        : item
    );
    this.clearLastSyncError();
    return this.synchronizeOutbox(true);
  }

  // --- Tenant-Scoped Form Draft Persistence & Cross-Module Recovery ---
  public saveDraft(moduleKey: string, data: any): void {
    if (!this.isAuthenticatedState || !this.organization.id) return;
    const scopedKey = `${this.organization.id}:${this.activeUser?.id || 'anon'}:${moduleKey}`;
    this.drafts[scopedKey] = {
      data,
      updatedAt: new Date().toISOString(),
    };
    this.saveToStorage();
    if (this.shouldSyncCloud() && this.activeUser?.id) {
      if (this.draftSyncDebounceTimer) clearTimeout(this.draftSyncDebounceTimer);
      this.draftSyncDebounceTimer = setTimeout(() => {
        this.syncUserPreferencesToCloud();
      }, 1500);
    }
  }

  public getDraft<T = any>(moduleKey: string): T | null {
    if (!this.isAuthenticatedState || !this.organization.id) return null;
    const scopedKey = `${this.organization.id}:${this.activeUser?.id || 'anon'}:${moduleKey}`;
    return (this.drafts[scopedKey]?.data as T) || null;
  }

  public clearDraft(moduleKey: string): void {
    if (!this.organization.id) return;
    const scopedKey = `${this.organization.id}:${this.activeUser?.id || 'anon'}:${moduleKey}`;
    if (scopedKey in this.drafts) {
      delete this.drafts[scopedKey];
      this.saveToStorage();
      if (this.shouldSyncCloud() && this.activeUser?.id) {
        this.syncUserPreferencesToCloud();
      }
    }
  }

  private syncUserPreferencesToCloud(): void {
    if (!this.shouldSyncCloud() || !this.organization.id || !this.activeUser?.id) return;
    saveUserPreferencesToSupabase({
      organizationId: this.organization.id,
      userId: this.activeUser.id,
      quotePreferences: this.quotePreferences,
      drafts: this.drafts,
      fiscalYear: this.fiscalYear,
    }).catch(() => {
      // Non-blocking preference sync
    });
  }

  private recordCloudSyncError(context: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err || 'Unknown database sync error');
    console.warn(`[Supabase Sync] ${context}:`, message);
    this.lastSyncError = `${context}: ${message}`;
    this.saveLifecycleState = 'FAILED';
    this.lastSavedEntity = context;
    this.saveToStorage();
    this.listeners.forEach((fn) => fn());
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

  private shouldSyncCloud(): boolean {
    return isSupabaseConfigured() && !this.isDemoUser() && !this.isOffline();
  }

  public startAutoSyncLifecycle(): void {
    if (typeof window === 'undefined') return;
    if (!this.windowListenersBound) {
      this.boundOnlineHandler = () => {
        this.synchronizeOutbox(true).catch(() => {});
        this.syncDeltaSinceLastCursor().catch(() => {});
      };
      this.boundFocusHandler = () => {
        if (this.isAuthenticatedState && this.shouldSyncCloud()) {
          this.syncDeltaSinceLastCursor().catch(() => {});
        }
      };
      window.addEventListener('online', this.boundOnlineHandler);
      window.addEventListener('focus', this.boundFocusHandler);
      this.windowListenersBound = true;
    }

    if (!this.autoSyncTimer) {
      this.autoSyncTimer = setInterval(() => {
        if (!this.isAuthenticatedState || !this.shouldSyncCloud()) return;
        const hasPending = this.syncOutbox.some((i) => i.status === 'PENDING' || i.status === 'CONFLICT');
        if (hasPending) {
          this.synchronizeOutbox(false).catch(() => {});
        }
      }, 15000);
    }

    if (this.shouldSyncCloud() && this.organization.id && !this.realtimeUnsub) {
      this.realtimeUnsub = subscribeToOrganizationRealtime(this.organization.id, () => {
        this.syncDeltaSinceLastCursor().catch(() => {});
      });
    }
  }

  public stopAutoSyncLifecycle(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
    if (this.draftSyncDebounceTimer) {
      clearTimeout(this.draftSyncDebounceTimer);
      this.draftSyncDebounceTimer = null;
    }
    if (this.realtimeUnsub) {
      this.realtimeUnsub();
      this.realtimeUnsub = null;
    }
    if (typeof window !== 'undefined' && this.windowListenersBound) {
      if (this.boundOnlineHandler) window.removeEventListener('online', this.boundOnlineHandler);
      if (this.boundFocusHandler) window.removeEventListener('focus', this.boundFocusHandler);
      this.windowListenersBound = false;
    }
  }

  public async syncDeltaSinceLastCursor(): Promise<number> {
    if (!this.isAuthenticatedState || !this.shouldSyncCloud() || this.syncInProgress) return 0;
    this.syncInProgress = true;
    try {
      const pull = await pullIncrementalUpdatesFromSupabase(this.lastSyncCursor || undefined);
      if (!pull) return 0;
      const changed = this.applyRemoteIncrementalUpdates(pull);
      if (pull.serverTimestamp) {
        this.lastSyncCursor = pull.serverTimestamp;
        this.saveToStorage();
      }
      if (changed > 0) {
        this.notify();
      }
      return changed;
    } catch {
      return 0;
    } finally {
      this.syncInProgress = false;
    }
  }

  public applyRemoteIncrementalUpdates(pull: {
    serverTimestamp?: string;
    entities?: Record<string, any[]>;
  }): number {
    if (!pull?.entities) return 0;
    let applied = 0;

    const mergeById = <T extends { id: string }>(
      local: T[],
      rows: any[],
      mapper: (r: any) => T
    ): T[] => {
      const map = new Map(local.map((item) => [item.id, item]));
      for (const row of rows) {
        if (!row?.id) continue;
        if (row.deleted_at) {
          map.delete(row.id);
        } else {
          map.set(row.id, mapper(row));
        }
        applied += 1;
      }
      return Array.from(map.values());
    };

    const { entities } = pull;
    if (Array.isArray(entities.products) && entities.products.length > 0) {
      this.products = mergeById(this.products, entities.products, (row) => ({
        id: row.id,
        sku: row.sku,
        barcode: row.barcode || '',
        hsn: row.hsn || '',
        name: row.name,
        categoryId: row.category_id || '',
        categoryName: row.category_name || '',
        unit: row.unit || 'PCS',
        costPrice: Number(row.cost_price || 0),
        sellingPrice: Number(row.selling_price || 0),
        gstRate: Number(row.gst_rate || 0),
        currentStock: Number(row.current_stock || 0),
        stockLevel: Number(row.current_stock || 0),
        minStockAlert: Number(row.min_stock_threshold || row.min_stock_alert || 5),
        isActive: row.is_active !== false,
        updatedAt: row.updated_at || new Date().toISOString(),
      }));
    }

    if (Array.isArray(entities.customers) && entities.customers.length > 0) {
      this.customers = mergeById(this.customers, entities.customers, (row) => ({
        id: row.id,
        name: row.name,
        companyName: row.company_name || undefined,
        phone: row.phone,
        email: row.email || undefined,
        gstin: row.gstin || undefined,
        address: row.address || undefined,
        shippingAddress: row.shipping_address || undefined,
        city: row.city || undefined,
        state: row.state || 'Karnataka',
        creditLimit: Number(row.credit_limit || 25000),
        currentReceivableBalance: Number(row.current_receivable_balance || 0),
        totalOrdersCount: Number(row.total_orders_count || 0),
        createdAt: row.created_at || new Date().toISOString(),
      }));
    }

    if (Array.isArray(entities.suppliers) && entities.suppliers.length > 0) {
      this.suppliers = mergeById(this.suppliers, entities.suppliers, (row) => ({
        id: row.id,
        name: row.name,
        contactPerson: row.contact_person || '',
        phone: row.phone || '',
        email: row.email || '',
        gstin: row.gstin || undefined,
        address: row.address || undefined,
        city: row.city || undefined,
        state: row.state || 'Karnataka',
        openingBalance: Number(row.opening_balance ?? 0),
        currentPayableBalance: Number(row.current_payable_balance ?? 0),
        outstandingBalance: Number(row.current_payable_balance ?? 0),
        status: row.is_active !== false ? 'ACTIVE' : 'INACTIVE',
        category: row.category || 'Wholesale Distributor',
        purchaseOrdersCount: 0,
        createdAt: row.created_at || new Date().toISOString(),
      }));
    }

    if (Array.isArray(entities.expenses) && entities.expenses.length > 0) {
      this.expenses = mergeById(this.expenses, entities.expenses, (row) => ({
        id: row.id,
        organizationId: row.organization_id,
        branchId: row.branch_id,
        category: row.category,
        vendor: row.paid_to,
        date: row.date,
        amount: Number(row.amount),
        gstPaid: Number(row.gst_paid ?? 0),
        isGstInputEligible: row.is_gst_input_eligible !== undefined ? Boolean(row.is_gst_input_eligible) : true,
        paymentMode: row.payment_mode || 'UPI',
        invoiceRef: row.receipt_ref || undefined,
        notes: row.notes || undefined,
      }));
    }

    if (Array.isArray(entities.quotations) && entities.quotations.length > 0) {
      this.quotations = mergeById(this.quotations, entities.quotations, (row) => ({
        id: row.id,
        organizationId: row.organization_id,
        branchId: row.branch_id,
        quoteNumber: row.quote_number,
        quoteType: row.quote_type || 'ONE_TIME',
        customerId: row.customer_id || '',
        customerName: row.customer_name || 'Walk-in',
        companyName: row.company_name || undefined,
        customerEmail: row.customer_email || undefined,
        customerPhone: row.customer_phone || undefined,
        customerGstin: row.customer_gstin || undefined,
        billingAddress: row.billing_address || undefined,
        shippingAddress: row.shipping_address || undefined,
        date: row.date,
        expiryDate: row.expiry_date,
        referenceNumber: row.reference_number || undefined,
        salesperson: row.salesperson || undefined,
        projectName: row.project_name || undefined,
        subject: row.subject || undefined,
        items: Array.isArray(row.items) ? row.items : [],
        subtotal: Number(row.subtotal || 0),
        discountTotal: Number(row.discount_total || 0),
        adjustment: Number(row.adjustment || 0),
        taxableTotal: Number(row.taxable_total || 0),
        cgstTotal: Number(row.cgst_total || 0),
        sgstTotal: Number(row.sgst_total || 0),
        igstTotal: Number(row.igst_total || 0),
        roundOff: Number(row.round_off || 0),
        grandTotal: Number(row.grand_total || 0),
        status: row.status || 'DRAFT',
        notes: row.notes || undefined,
        termsAndConditions: row.terms_and_conditions || undefined,
        emailRecipients: Array.isArray(row.email_recipients) ? row.email_recipients : [],
        linkedInvoiceId: row.linked_invoice_id || undefined,
        linkedInvoiceNumber: row.linked_invoice_number || undefined,
        activities: Array.isArray(row.activities) ? row.activities : [],
        createdAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || new Date().toISOString(),
      }));
    }

    if (Array.isArray(entities.customer_receipts) && entities.customer_receipts.length > 0) {
      this.customerReceipts = mergeById(this.customerReceipts, entities.customer_receipts, (row) => ({
        id: row.id,
        receiptNumber: row.receipt_number,
        organizationId: row.organization_id,
        branchId: row.branch_id || this.activeBranchId,
        customerId: row.customer_id,
        customerName: row.customer_name,
        amount: Number(row.amount || 0),
        allocatedAmount: Number(row.allocated_amount || 0),
        unallocatedAdvance: Number(row.unallocated_advance || 0),
        paymentMethod: row.payment_method,
        bankAccountId: row.bank_account_id || undefined,
        bankAccountName: row.bank_account_name || undefined,
        receiptDate: row.receipt_date,
        referenceNumber: row.reference_number || undefined,
        notes: row.notes || undefined,
        allocations: Array.isArray(row.allocations) ? row.allocations : [],
        status: row.status === 'REVERSED' ? 'REVERSED' : 'COMPLETED',
        reversalReason: row.reversal_reason || undefined,
        reversedAt: row.reversed_at || undefined,
        reversedBy: row.reversed_by || undefined,
        journalEntryId: row.journal_entry_id || undefined,
        journalNumber: row.journal_number || undefined,
        createdBy: row.created_by || 'usr_system',
        createdByName: row.created_by_name || undefined,
        createdAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || new Date().toISOString(),
      }));
    }

    if (Array.isArray(entities.supplier_bills) && entities.supplier_bills.length > 0) {
      this.supplierBills = mergeById(this.supplierBills, entities.supplier_bills, (row) => ({
        id: row.id,
        billNumber: row.bill_number,
        supplierInvoiceNumber: row.notes || row.bill_number,
        organizationId: row.organization_id,
        branchId: row.branch_id || this.activeBranchId,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        supplierGstin: row.supplier_gstin || undefined,
        purchaseOrderId: row.purchase_order_id || undefined,
        poNumber: row.po_number || undefined,
        billDate: row.bill_date,
        dueDate: row.due_date || row.bill_date,
        subtotal: Number(row.subtotal || 0),
        taxableTotal: Number(row.taxable_total || 0),
        gstTotal: Number(row.gst_total || 0),
        discountTotal: Number(row.discount_total || 0),
        additionalCharges: Number(row.additional_charges || 0),
        totalAmount: Number(row.total_amount || 0),
        paidAmount: Number(row.paid_amount || 0),
        outstandingAmount: Number(row.outstanding_amount || 0),
        status: row.status || 'PENDING',
        notes: row.notes || undefined,
        createdAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || new Date().toISOString(),
      }));
    }

    if (Array.isArray(entities.supplier_payments) && entities.supplier_payments.length > 0) {
      this.supplierPayments = mergeById(this.supplierPayments, entities.supplier_payments, (row) => ({
        id: row.id,
        paymentNumber: row.payment_number,
        organizationId: row.organization_id,
        branchId: row.branch_id || this.activeBranchId,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        supplierBillId: row.supplier_bill_id || undefined,
        billNumber: row.bill_number || undefined,
        amount: Number(row.amount || 0),
        paymentMethod: row.payment_method,
        bankAccountId: row.bank_account_id || undefined,
        bankAccountName: row.bank_account_name || undefined,
        paymentDate: row.payment_date,
        referenceNumber: row.reference_number || undefined,
        notes: row.notes || undefined,
        allocatedBills: Array.isArray(row.allocated_bills) ? row.allocated_bills : undefined,
        isAdvance: Boolean(row.is_advance),
        status: row.status === 'REVERSED' ? 'REVERSED' : 'COMPLETED',
        reversalReason: row.reversal_reason || undefined,
        reversedAt: row.reversed_at || undefined,
        reversedBy: row.reversed_by || undefined,
        createdBy: row.created_by || 'usr_system',
        createdByName: row.created_by_name || undefined,
        createdAt: row.created_at || new Date().toISOString(),
      }));
    }

    return applied;
  }

  public async hydrateFromSupabase(): Promise<{ success: boolean; loadedCount: number }> {
    if (!this.shouldSyncCloud()) {
      return { success: false, loadedCount: 0 };
    }

    const orgId = this.organization.id;
    let loadedCount = 0;
    try {
      const [
        remoteOrg,
        remoteBranches,
        remoteProducts,
        remoteCustomers,
        remoteSuppliers,
        remoteExpenses,
        remoteQuotes,
        remoteSales,
        remoteTimeLogs,
        remoteCoupons,
        remoteCustomFields,
        remotePrinterConfig,
        remoteUserPrefs,
        remoteRoleNav,
        remoteBankAccounts,
        remoteBankTransactions,
        remoteCreditNotes,
        remotePurchaseOrders,
        remoteGoodsReceipts,
        remoteSupplierBills,
        remoteSupplierPayments,
        remoteCustomerReceipts,
        remoteAccounting,
      ] = await Promise.allSettled([
        fetchOrganizationFromSupabase(orgId),
        fetchOrganizationBranches(orgId),
        fetchProductsFromSupabase(),
        fetchCustomersFromSupabase(),
        fetchSuppliersFromSupabase(),
        fetchExpensesFromSupabase(),
        fetchQuotationsFromSupabase(),
        fetchSalesFromSupabase(),
        fetchTimeLogsFromSupabase(),
        fetchCouponsFromSupabase(),
        fetchCustomFieldsFromSupabase(orgId),
        fetchPrinterConfigFromSupabase(orgId, this.activeBranchId),
        this.activeUser?.id ? fetchUserPreferencesFromSupabase(orgId, this.activeUser.id) : Promise.resolve(null),
        fetchRoleNavigationConfigs(orgId),
        fetchBankAccountsFromSupabase(orgId),
        fetchBankTransactionsFromSupabase(orgId),
        fetchCreditNotesFromSupabase(orgId),
        fetchPurchaseOrdersFromSupabase(orgId),
        fetchGoodsReceiptsFromSupabase(orgId),
        fetchSupplierBillsFromSupabase(orgId),
        fetchSupplierPaymentsFromSupabase(orgId),
        fetchCustomerReceiptsFromSupabase(orgId),
        fetchAccountingSnapshotFromSupabase(),
      ]);

      if (remoteOrg.status === 'fulfilled' && remoteOrg.value) {
        this.organization = { ...this.organization, ...remoteOrg.value };
        if (remoteOrg.value.currentFiscalYear) {
          this.fiscalYear = remoteOrg.value.currentFiscalYear;
        }
        loadedCount += 1;
      }

      if (remoteBranches.status === 'fulfilled' && Array.isArray(remoteBranches.value) && remoteBranches.value.length > 0) {
        this.branches = remoteBranches.value;
        if (!this.branches.some((b) => b.id === this.activeBranchId)) {
          this.activeBranchId = this.branches[0].id;
        }
        loadedCount += remoteBranches.value.length;
      }

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

      if (remoteCoupons.status === 'fulfilled' && Array.isArray(remoteCoupons.value)) {
        this.coupons = remoteCoupons.value;
        loadedCount += remoteCoupons.value.length;
      }

      if (remoteCustomFields.status === 'fulfilled' && Array.isArray(remoteCustomFields.value) && remoteCustomFields.value.length > 0) {
        this.customFields = remoteCustomFields.value;
        loadedCount += remoteCustomFields.value.length;
      }

      if (remotePrinterConfig.status === 'fulfilled' && remotePrinterConfig.value) {
        this.printerConfig = remotePrinterConfig.value;
      }

      if (remoteUserPrefs.status === 'fulfilled' && remoteUserPrefs.value) {
        if (remoteUserPrefs.value.quotePreferences) {
          this.quotePreferences = { ...this.quotePreferences, ...remoteUserPrefs.value.quotePreferences };
        }
        if (remoteUserPrefs.value.fiscalYear) {
          this.fiscalYear = remoteUserPrefs.value.fiscalYear;
        }
        if (remoteUserPrefs.value.drafts && typeof remoteUserPrefs.value.drafts === 'object') {
          this.drafts = { ...remoteUserPrefs.value.drafts, ...this.drafts };
        }
      }

      if (remoteRoleNav.status === 'fulfilled' && remoteRoleNav.value) {
        this.roleNavOverrides = remoteRoleNav.value;
      }

      const mergeForOrg = <T extends { organizationId: string }>(existing: T[], incoming: T[]) => [
        ...incoming,
        ...existing.filter((item) => item.organizationId !== orgId),
      ];

      if (remoteBankAccounts.status === 'fulfilled' && Array.isArray(remoteBankAccounts.value)) {
        this.bankAccounts = mergeForOrg(this.bankAccounts, remoteBankAccounts.value);
        loadedCount += remoteBankAccounts.value.length;
      }

      if (remoteBankTransactions.status === 'fulfilled' && Array.isArray(remoteBankTransactions.value)) {
        this.bankTransactions = mergeForOrg(this.bankTransactions, remoteBankTransactions.value);
        loadedCount += remoteBankTransactions.value.length;
      }

      if (remoteCreditNotes.status === 'fulfilled' && Array.isArray(remoteCreditNotes.value)) {
        this.creditNotes = mergeForOrg(this.creditNotes, remoteCreditNotes.value);
        loadedCount += remoteCreditNotes.value.length;
      }

      if (remotePurchaseOrders.status === 'fulfilled' && Array.isArray(remotePurchaseOrders.value)) {
        this.purchaseOrders = mergeForOrg(this.purchaseOrders, remotePurchaseOrders.value);
        loadedCount += remotePurchaseOrders.value.length;
      }

      if (remoteGoodsReceipts.status === 'fulfilled' && Array.isArray(remoteGoodsReceipts.value)) {
        this.goodsReceipts = mergeForOrg(this.goodsReceipts, remoteGoodsReceipts.value);
        loadedCount += remoteGoodsReceipts.value.length;
      }

      if (remoteSupplierBills.status === 'fulfilled' && Array.isArray(remoteSupplierBills.value)) {
        this.supplierBills = mergeForOrg(this.supplierBills, remoteSupplierBills.value);
        loadedCount += remoteSupplierBills.value.length;
      }

      if (remoteSupplierPayments.status === 'fulfilled' && Array.isArray(remoteSupplierPayments.value)) {
        this.supplierPayments = mergeForOrg(this.supplierPayments, remoteSupplierPayments.value);
        loadedCount += remoteSupplierPayments.value.length;
      }

      if (remoteCustomerReceipts.status === 'fulfilled' && Array.isArray(remoteCustomerReceipts.value)) {
        this.customerReceipts = mergeForOrg(this.customerReceipts, remoteCustomerReceipts.value);
        loadedCount += remoteCustomerReceipts.value.length;
      }

      if (remoteAccounting.status === 'fulfilled' && remoteAccounting.value) {
        const snap = remoteAccounting.value;
        if (Array.isArray(snap.chartOfAccounts) && snap.chartOfAccounts.length > 0) {
          const mappedCoa: ChartOfAccount[] = snap.chartOfAccounts.map((row: any) => ({
            id: row.id,
            organizationId: row.organization_id,
            branchId: row.branch_id || 'ALL',
            code: row.code,
            name: row.name,
            accountClass: row.account_class,
            accountGroup: row.account_group,
            parentAccountId: row.parent_account_id || undefined,
            parentCode: row.parent_code || undefined,
            normalBalance: row.normal_balance,
            openingBalance: Number(row.opening_balance || 0),
            currentBalance: Number(row.current_balance || 0),
            taxApplicable: Boolean(row.tax_applicable),
            gstTag: row.gst_tag && row.gst_tag !== 'NONE' ? row.gst_tag : undefined,
            isSystem: Boolean(row.is_system),
            isActive: row.is_active !== false,
            description: row.description || undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }));
          this.chartOfAccounts = mergeForOrg(this.chartOfAccounts, mappedCoa);
          loadedCount += mappedCoa.length;
        }

        if (Array.isArray(snap.accountingPeriods) && snap.accountingPeriods.length > 0) {
          const mappedPeriods: AccountingPeriod[] = snap.accountingPeriods.map((row: any) => ({
            id: row.id,
            organizationId: row.organization_id,
            fiscalYear: row.fiscal_year,
            name: row.name,
            startDate: row.start_date,
            endDate: row.end_date,
            status: row.status || (row.is_locked ? 'LOCKED' : 'OPEN'),
            lockedBy: row.locked_by || undefined,
            lockedAt: row.locked_at || undefined,
          }));
          this.accountingPeriods = mergeForOrg(this.accountingPeriods, mappedPeriods);
        }

        if (Array.isArray(snap.journalEntries)) {
          const mappedJournals: JournalEntry[] = snap.journalEntries.map((row: any) => ({
            id: row.id,
            journalNumber: row.journal_number,
            organizationId: row.organization_id,
            branchId: row.branch_id || this.activeBranchId,
            entryDate: row.entry_date,
            referenceNumber: row.reference_number || undefined,
            narration: row.narration,
            status: row.status,
            sourceType: row.source_type,
            sourceId: row.source_id || undefined,
            idempotencyKey: row.idempotency_key || undefined,
            totalDebit: Number(row.total_debit || 0),
            totalCredit: Number(row.total_credit || 0),
            reversedEntryId: row.reversal_of_journal_id || undefined,
            reversalEntryId: row.reversed_by_journal_id || undefined,
            reversalReason: row.reversal_reason || undefined,
            createdBy: row.created_by,
            createdByName: row.created_by_name || undefined,
            approvedBy: row.approved_by || undefined,
            approvedByName: row.approved_by_name || undefined,
            postedAt: row.posted_at || undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            lines: (row.journal_entry_lines || []).map((l: any) => ({
              id: l.id,
              accountId: l.account_id,
              accountCode: l.account_code,
              accountName: l.account_name,
              accountClass: 'EXPENSE' as AccountClass,
              debit: Number(l.debit || 0),
              credit: Number(l.credit || 0),
              description: l.description || undefined,
              partyType: l.party_type || undefined,
              partyId: l.party_id || undefined,
              partyName: l.party_name || undefined,
            })),
          }));
          this.journalEntries = mergeForOrg(this.journalEntries, mappedJournals);
          loadedCount += mappedJournals.length;
        }

        if (Array.isArray(snap.generalLedger)) {
          const mappedGl: GeneralLedgerEntry[] = snap.generalLedger.map((row: any) => ({
            id: row.id,
            organizationId: row.organization_id,
            branchId: row.branch_id || this.activeBranchId,
            journalEntryId: row.journal_entry_id,
            journalNumber: row.journal_number,
            entryDate: row.entry_date,
            accountId: row.account_id,
            accountCode: row.account_code,
            accountName: row.account_name,
            accountClass: row.account_class,
            debit: Number(row.debit || 0),
            credit: Number(row.credit || 0),
            description: row.narration || '',
            sourceType: row.source_type,
            sourceId: row.source_id || undefined,
            partyType: row.party_type || undefined,
            partyId: row.party_id || undefined,
            partyName: row.party_name || undefined,
            postedBy: 'Accountant',
            postedAt: row.created_at,
          }));
          this.generalLedger = mergeForOrg(this.generalLedger, mappedGl);
          loadedCount += mappedGl.length;
        }

        if (Array.isArray(snap.budgets)) {
          const mappedBudgets: Budget[] = snap.budgets.map((row: any) => ({
            id: row.id,
            organizationId: row.organization_id,
            branchId: row.branch_id || 'ALL',
            name: row.name,
            fiscalYear: row.fiscal_year,
            periodType: row.period_type,
            startDate: row.start_date,
            endDate: row.end_date,
            status: row.status,
            totalPlannedRevenue: Number(row.total_planned_revenue || 0),
            totalPlannedExpense: Number(row.total_planned_expense || 0),
            totalPlannedCapex: Number(row.total_planned_capex || 0),
            revisions: Array.isArray(row.revisions) ? row.revisions : [],
            createdBy: row.created_by_name || row.created_by,
            approvedBy: row.approved_by_name || row.approved_by || undefined,
            approvedAt: row.approved_at || undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            lines: (row.budget_lines || []).map((l: any) => ({
              id: l.id,
              accountId: l.account_id,
              accountCode: l.account_code,
              accountName: l.account_name,
              accountClass: l.account_class,
              category: l.category || 'EXPENSE',
              plannedAmount: Number(l.planned_amount || 0),
              notes: l.notes || undefined,
            })),
          }));
          this.budgets = mergeForOrg(this.budgets, mappedBudgets);
        }

        if (Array.isArray(snap.bankReconciliations)) {
          const mappedRecon: BankReconciliation[] = snap.bankReconciliations.map((row: any) => ({
            id: row.id,
            organizationId: row.organization_id,
            branchId: row.branch_id || this.activeBranchId,
            bankAccountId: row.bank_account_id,
            bankAccountName: row.bank_account_name,
            statementDate: row.statement_date,
            statementClosingBalance: Number(row.statement_closing_balance || 0),
            bookBalance: Number(row.book_closing_balance || 0),
            clearedBalance: Number(row.cleared_balance || 0),
            variance: Number(row.difference || 0),
            clearedTransactionIds: Array.isArray(row.matched_transaction_ids) ? row.matched_transaction_ids : [],
            adjustmentJournalId: row.adjustment_journal_id || undefined,
            status: row.status,
            reconciledBy: row.reconciled_by_name || row.reconciled_by,
            reconciledAt: row.created_at,
            notes: row.notes || undefined,
          }));
          this.bankReconciliations = mergeForOrg(this.bankReconciliations, mappedRecon);
        }

        if (Array.isArray(snap.debitNotes)) {
          const mappedDebitNotes: DebitNote[] = snap.debitNotes.map((row: any) => ({
            id: row.id,
            debitNoteNumber: row.debit_note_number,
            organizationId: row.organization_id,
            branchId: row.branch_id || this.activeBranchId,
            supplierId: row.supplier_id,
            supplierName: row.supplier_name,
            supplierGstin: row.supplier_gstin || undefined,
            supplierBillId: row.supplier_bill_id || undefined,
            billNumber: row.bill_number || undefined,
            issueDate: row.issue_date,
            reason: row.reason,
            status: row.status,
            taxableTotal: Number(row.taxable_total || 0),
            cgstTotal: Number(row.cgst_total || 0),
            sgstTotal: Number(row.sgst_total || 0),
            igstTotal: Number(row.igst_total || 0),
            totalAmount: Number(row.total_debit_amount || 0),
            deductInventory: Boolean(row.reduce_inventory),
            journalEntryId: row.journal_entry_id || undefined,
            journalNumber: row.journal_number || undefined,
            notes: row.notes || undefined,
            createdBy: row.created_by,
            createdByName: row.created_by_name || undefined,
            createdAt: row.created_at,
            items: (row.debit_note_items || []).map((i: any) => ({
              id: i.id,
              productId: i.product_id,
              productName: i.product_name,
              sku: i.sku || undefined,
              hsn: i.hsn || undefined,
              quantity: Number(i.quantity),
              unitPrice: Number(i.unit_price),
              gstRate: Number(i.tax_rate || 0),
              taxableAmount: Number(i.taxable_amount || 0),
              cgstAmount: Number(i.cgst_amount || 0),
              sgstAmount: Number(i.sgst_amount || 0),
              igstAmount: Number(i.igst_amount || 0),
              total: Number(i.total || 0),
            })),
          }));
          this.debitNotes = mergeForOrg(this.debitNotes, mappedDebitNotes);
        }

        if (Array.isArray(snap.bulkImportBatches)) {
          const mappedBatches: BulkImportBatch[] = snap.bulkImportBatches.map((row: any) => ({
            id: row.id,
            organizationId: row.organization_id,
            branchId: row.branch_id || this.activeBranchId,
            entityType: row.target,
            fileName: row.file_name,
            totalRows: Number(row.total_rows || 0),
            validRows: Number(row.valid_rows || 0),
            importedRows: Number(row.imported_rows || 0),
            updatedRows: Number(row.updated_rows || 0),
            skippedDuplicates: Number(row.skipped_duplicates || 0),
            errorCount: Number(row.error_rows || 0),
            errors: (row.bulk_import_errors || []).map((e: any) => ({
              rowNumber: e.row_number,
              field: e.field,
              message: e.message,
              rawValue: e.raw_value || undefined,
            })),
            requiresApproval: Boolean(row.requires_approval),
            approvedBy: row.approved_by || undefined,
            status: row.status === 'COMPLETED' ? 'COMMITTED' : row.status,
            journalEntryId: row.journal_entry_id || undefined,
            performedBy: row.created_by,
            performedByName: row.created_by_name || undefined,
            createdAt: row.created_at,
          }));
          this.bulkImportBatches = mergeForOrg(this.bulkImportBatches, mappedBatches);
        }

        if (Array.isArray(snap.financialAuditLogs)) {
          const mappedAudits: FinancialAuditLog[] = snap.financialAuditLogs.map((row: any) => ({
            id: row.id,
            organizationId: row.organization_id,
            branchId: row.branch_id || 'ALL',
            module: row.entity_type,
            action: row.action,
            entityType: row.entity_type,
            entityId: row.entity_id,
            summary: row.summary,
            actorId: row.actor_id,
            actorName: row.actor_name,
            actorRole: row.actor_role,
            timestamp: row.created_at,
          }));
          this.financialAuditLogs = mergeForOrg(this.financialAuditLogs, mappedAudits);
        }
      }

      this.ensureAccountingDefaults(this.organization.id);
      this.lastSyncCursor = new Date().toISOString();
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
  private clearTenantDataFromMemory(nextOrgId = ''): void {
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
    this.bankAccounts = [];
    this.bankTransactions = [];
    this.creditNotes = [];
    this.purchaseOrders = [];
    this.goodsReceipts = [];
    this.supplierBills = [];
    this.supplierPayments = [];
    this.customerReceipts = [];
    this.chartOfAccounts = [];
    this.journalEntries = [];
    this.generalLedger = [];
    this.postingRecords = [];
    this.accountingPeriods = [];
    this.budgets = [];
    this.bulkImportBatches = [];
    this.debitNotes = [];
    this.bankReconciliations = [];
    this.financialAuditLogs = [];
    this.roleNavOverrides = {};
    this.syncOutbox = [];
    this.drafts = {};
    this.lastSyncCursor = '';
    this.lastSyncError = null;
    this.saveLifecycleState = 'IDLE';
    this.lastSavedAt = undefined;
    this.lastSavedEntity = undefined;
    this.inFlightSaves = 0;
    if (nextOrgId) {
      this.users = this.users.filter((u) => u.organizationId === nextOrgId);
      this.branches = this.branches.filter((b) => b.organizationId === nextOrgId);
    } else {
      this.users = [];
      this.branches = [];
      this.activeBranchId = '';
      this.organization = { ...EMPTY_ORGANIZATION };
    }
  }

  public resetToCleanState(): void {
    this.clearTenantDataFromMemory('');
    this.activeUser = null;
    this.isAuthenticatedState = false;
    this.saveToStorage();
    this.notify();
  }

  /**
   * Isolated test-only helper to populate fixtures during automated tests
   */
  public seedTestDataForTesting(): void {
    this.organization = { ...INITIAL_ORGANIZATION };
    this.fiscalYear = INITIAL_ORGANIZATION.currentFiscalYear || '2026–2027';
    this.branches = [...INITIAL_BRANCHES];
    this.activeBranchId = INITIAL_BRANCHES[0].id;
    this.lastSyncError = null;
    this.products = [...INITIAL_PRODUCTS];
    this.customers = [...INITIAL_CUSTOMERS];
    this.sales = [...INITIAL_SALES];
    this.expenses = [...INITIAL_EXPENSES];
    this.coupons = [...INITIAL_COUPONS];
    this.quotations = [...INITIAL_QUOTATIONS];
    this.suppliers = [...INITIAL_SUPPLIERS];
    this.users = [...INITIAL_USERS];
    this.timeLogs = [...INITIAL_TIME_LOGS];
    this.bankAccounts = [...INITIAL_BANK_ACCOUNTS];
    this.bankTransactions = [...INITIAL_BANK_TRANSACTIONS];
    this.creditNotes = [...INITIAL_CREDIT_NOTES];
    this.purchaseOrders = [...INITIAL_PURCHASE_ORDERS];
    this.goodsReceipts = [...INITIAL_GOODS_RECEIPTS];
    this.supplierBills = [...INITIAL_SUPPLIER_BILLS];
    this.supplierPayments = [...INITIAL_SUPPLIER_PAYMENTS];
    this.customerReceipts = [];
    this.chartOfAccounts = createDefaultChartOfAccounts(this.organization.id);
    this.journalEntries = [];
    this.generalLedger = [];
    this.postingRecords = [];
    this.accountingPeriods = [];
    this.budgets = [];
    this.bulkImportBatches = [];
    this.debitNotes = [];
    this.bankReconciliations = [];
    this.financialAuditLogs = [];
    this.ensureAccountingDefaults(this.organization.id);
    this.bootstrapLedgerFromExistingDocuments(this.organization.id);
    this.saveToStorage();
    this.notify();
  }

  private loadFromStorage() {
    if (typeof localStorage === 'undefined') {
      this.clearTenantDataFromMemory('');
      this.customFields = INITIAL_CUSTOM_FIELDS;
      this.fiscalYear = '2026–2027';
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

      const storedBankAccounts = localStorage.getItem(STORAGE_KEYS.BANK_ACCOUNTS);
      this.bankAccounts = storedBankAccounts ? dedupe(JSON.parse(storedBankAccounts)) : [];

      const storedBankTransactions = localStorage.getItem(STORAGE_KEYS.BANK_TRANSACTIONS);
      this.bankTransactions = storedBankTransactions ? dedupe(JSON.parse(storedBankTransactions)) : [];

      const storedCreditNotes = localStorage.getItem(STORAGE_KEYS.CREDIT_NOTES);
      this.creditNotes = storedCreditNotes ? dedupe(JSON.parse(storedCreditNotes)) : [];

      const storedPurchaseOrders = localStorage.getItem(STORAGE_KEYS.PURCHASE_ORDERS);
      this.purchaseOrders = storedPurchaseOrders ? dedupe(JSON.parse(storedPurchaseOrders)) : [];

      const storedGoodsReceipts = localStorage.getItem(STORAGE_KEYS.GOODS_RECEIPTS);
      this.goodsReceipts = storedGoodsReceipts ? dedupe(JSON.parse(storedGoodsReceipts)) : [];

      const storedSupplierBills = localStorage.getItem(STORAGE_KEYS.SUPPLIER_BILLS);
      this.supplierBills = storedSupplierBills ? dedupe(JSON.parse(storedSupplierBills)) : [];

      const storedSupplierPayments = localStorage.getItem(STORAGE_KEYS.SUPPLIER_PAYMENTS);
      this.supplierPayments = storedSupplierPayments ? dedupe(JSON.parse(storedSupplierPayments)) : [];

      const storedCustomerReceipts = localStorage.getItem(STORAGE_KEYS.CUSTOMER_RECEIPTS);
      this.customerReceipts = storedCustomerReceipts ? dedupe(JSON.parse(storedCustomerReceipts)) : [];

      const storedCoa = localStorage.getItem(STORAGE_KEYS.CHART_OF_ACCOUNTS);
      this.chartOfAccounts = storedCoa ? dedupe(JSON.parse(storedCoa)) : [];

      const storedJournals = localStorage.getItem(STORAGE_KEYS.JOURNAL_ENTRIES);
      this.journalEntries = storedJournals ? dedupe(JSON.parse(storedJournals)) : [];

      const storedGl = localStorage.getItem(STORAGE_KEYS.GENERAL_LEDGER);
      this.generalLedger = storedGl ? dedupe(JSON.parse(storedGl)) : [];

      const storedPostings = localStorage.getItem(STORAGE_KEYS.POSTING_RECORDS);
      this.postingRecords = storedPostings ? JSON.parse(storedPostings) : [];

      const storedPeriods = localStorage.getItem(STORAGE_KEYS.ACCOUNTING_PERIODS);
      this.accountingPeriods = storedPeriods ? dedupe(JSON.parse(storedPeriods)) : [];

      const storedBudgets = localStorage.getItem(STORAGE_KEYS.BUDGETS);
      this.budgets = storedBudgets ? dedupe(JSON.parse(storedBudgets)) : [];

      const storedBulkBatches = localStorage.getItem(STORAGE_KEYS.BULK_IMPORT_BATCHES);
      this.bulkImportBatches = storedBulkBatches ? dedupe(JSON.parse(storedBulkBatches)) : [];

      const storedDebitNotes = localStorage.getItem(STORAGE_KEYS.DEBIT_NOTES);
      this.debitNotes = storedDebitNotes ? dedupe(JSON.parse(storedDebitNotes)) : [];

      const storedRecons = localStorage.getItem(STORAGE_KEYS.BANK_RECONCILIATIONS);
      this.bankReconciliations = storedRecons ? dedupe(JSON.parse(storedRecons)) : [];

      const storedAudits = localStorage.getItem(STORAGE_KEYS.FINANCIAL_AUDIT_LOGS);
      this.financialAuditLogs = storedAudits ? dedupe(JSON.parse(storedAudits)) : [];

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

      const storedDrafts = localStorage.getItem(STORAGE_KEYS.DRAFTS);
      if (storedDrafts) {
        this.drafts = JSON.parse(storedDrafts);
      }

      const storedCursor = localStorage.getItem(STORAGE_KEYS.LAST_SYNC_CURSOR);
      if (storedCursor) {
        this.lastSyncCursor = storedCursor;
      }

      const storedAuth = localStorage.getItem(STORAGE_KEYS.IS_AUTHENTICATED);
      if (storedAuth !== null) {
        this.isAuthenticatedState = storedAuth === 'true' && Boolean(this.activeUser?.id);
      }

      if (!this.isAuthenticatedState) {
        this.clearTenantDataFromMemory('');
      }
    } catch (e) {
      console.warn('Failed to parse local storage, resetting to clean business state', e);
      this.clearTenantDataFromMemory('');
      this.customFields = INITIAL_CUSTOM_FIELDS;
      this.fiscalYear = '2026–2027';
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
      localStorage.setItem(STORAGE_KEYS.BANK_ACCOUNTS, JSON.stringify(this.bankAccounts));
      localStorage.setItem(STORAGE_KEYS.BANK_TRANSACTIONS, JSON.stringify(this.bankTransactions));
      localStorage.setItem(STORAGE_KEYS.CREDIT_NOTES, JSON.stringify(this.creditNotes));
      localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(this.purchaseOrders));
      localStorage.setItem(STORAGE_KEYS.GOODS_RECEIPTS, JSON.stringify(this.goodsReceipts));
      localStorage.setItem(STORAGE_KEYS.SUPPLIER_BILLS, JSON.stringify(this.supplierBills));
      localStorage.setItem(STORAGE_KEYS.SUPPLIER_PAYMENTS, JSON.stringify(this.supplierPayments));
      localStorage.setItem(STORAGE_KEYS.CUSTOMER_RECEIPTS, JSON.stringify(this.customerReceipts));
      localStorage.setItem(STORAGE_KEYS.CHART_OF_ACCOUNTS, JSON.stringify(this.chartOfAccounts));
      localStorage.setItem(STORAGE_KEYS.JOURNAL_ENTRIES, JSON.stringify(this.journalEntries));
      localStorage.setItem(STORAGE_KEYS.GENERAL_LEDGER, JSON.stringify(this.generalLedger));
      localStorage.setItem(STORAGE_KEYS.POSTING_RECORDS, JSON.stringify(this.postingRecords));
      localStorage.setItem(STORAGE_KEYS.ACCOUNTING_PERIODS, JSON.stringify(this.accountingPeriods));
      localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(this.budgets));
      localStorage.setItem(STORAGE_KEYS.BULK_IMPORT_BATCHES, JSON.stringify(this.bulkImportBatches));
      localStorage.setItem(STORAGE_KEYS.DEBIT_NOTES, JSON.stringify(this.debitNotes));
      localStorage.setItem(STORAGE_KEYS.BANK_RECONCILIATIONS, JSON.stringify(this.bankReconciliations));
      localStorage.setItem(STORAGE_KEYS.FINANCIAL_AUDIT_LOGS, JSON.stringify(this.financialAuditLogs));
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
      localStorage.setItem(STORAGE_KEYS.DRAFTS, JSON.stringify(this.drafts));
      localStorage.setItem(STORAGE_KEYS.LAST_SYNC_CURSOR, this.lastSyncCursor);
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
    if (this.organization.id) {
      this.runCloudMutation('Coupon', null, () => saveCouponToSupabase(coupon, this.organization.id));
    }
  }

  public toggleCouponStatus(id: string): void {
    const coupon = this.coupons.find((c) => c.id === id);
    if (coupon) {
      coupon.isActive = !coupon.isActive;
      this.notify();
      if (this.organization.id) {
        this.runCloudMutation('Coupon status', null, () => saveCouponToSupabase(coupon, this.organization.id));
      }
    }
  }

  public deleteCoupon(id: string): void {
    this.coupons = this.coupons.filter((c) => c.id !== id);
    this.notify();
    this.runCloudMutation('Delete coupon', null, () => deleteCouponInSupabase(id));
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
    const scopedOrgId = quote.organizationId || this.organization.id;
    const scopedBranchId = quote.branchId || this.activeBranchId;
    if (idx >= 0) {
      targetQuote = {
        ...quote,
        organizationId: scopedOrgId,
        branchId: scopedBranchId,
        updatedAt: new Date().toISOString(),
      };
      this.quotations[idx] = targetQuote;
    } else {
      targetQuote = {
        ...quote,
        organizationId: scopedOrgId,
        branchId: scopedBranchId,
        createdAt: quote.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.quotations.unshift(targetQuote);
    }
    this.notify();

    this.runCloudMutation(
      'Quotation',
      {
        eventType: 'QUOTATION_UPSERTED',
        entityId: targetQuote.id,
        payload: targetQuote,
      },
      () => saveQuotationToSupabase(targetQuote)
    );
  }

  public deleteQuotation(id: string): void {
    this.quotations = this.quotations.filter((q) => q.id !== id);
    this.notify();

    this.runCloudMutation(
      'Delete quotation',
      {
        eventType: 'QUOTATION_DELETED',
        entityId: id,
        payload: { id, organizationId: this.organization.id },
      },
      () => deleteQuotationFromSupabase(id)
    );
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
      quote.updatedAt = new Date().toISOString();
      this.notify();

      this.runCloudMutation(
        'Quotation activity',
        {
          eventType: 'QUOTATION_UPSERTED',
          entityId: quote.id,
          payload: quote,
        },
        () => saveQuotationToSupabase(quote)
      );
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

    if (quote.status === 'DECLINED' || quote.status === 'EXPIRED') {
      return { success: false, error: `Cannot convert a ${quote.status.toLowerCase()} quotation to an invoice.` };
    }

    if (!quote.items || quote.items.length === 0 || quote.grandTotal <= 0) {
      return { success: false, error: 'Quotation must contain valid line items with a positive total.' };
    }

    // Generate unique invoice number
    this.invoiceCounter += 1;
    const invoiceNumber = `INV-${new Date().getFullYear().toString().slice(-2)}-${String(this.invoiceCounter).padStart(4, '0')}`;
    const receiptNumber = `BLR-${new Date().getFullYear()}-${String(this.receiptCounter + 1).padStart(5, '0')}`;
    this.receiptCounter += 1;
    const saleId = `sale_conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const branch = this.branches.find((b) => b.id === this.activeBranchId) || this.getActiveBranch();
    const now = new Date().toISOString();

    // Map items to CartItem format and deduct inventory for tracked catalog products
    const mappedItems: CartItem[] = quote.items.map((qi, idx) => {
      const existingIdx = qi.productId ? this.products.findIndex((p) => p.id === qi.productId) : -1;
      const existingProd = existingIdx >= 0 ? this.products[existingIdx] : undefined;

      if (existingProd && existingIdx >= 0) {
        const prevStock = Number(existingProd.currentStock ?? existingProd.stockLevel ?? 0);
        const newStock = Math.max(0, prevStock - qi.quantity);
        this.products[existingIdx] = {
          ...existingProd,
          currentStock: newStock,
          stockLevel: newStock,
          updatedAt: now,
        };
        this.stockMovements.unshift({
          id: `mov_qconv_${Date.now()}_${idx}`,
          organizationId: this.organization.id,
          branchId: branch.id,
          productId: existingProd.id,
          productName: existingProd.name,
          sku: existingProd.sku,
          type: 'SALE',
          quantityChange: -qi.quantity,
          previousStock: prevStock,
          newStock,
          newBalance: newStock,
          referenceId: invoiceNumber,
          notes: `Stock deducted on Quote ${quote.quoteNumber} → Invoice ${invoiceNumber}`,
          performedBy: this.getActiveUser().name,
          timestamp: now,
        });
      }

      const product: Product = existingProd
        ? { ...this.products[existingIdx] }
        : {
            id: qi.productId || `prod_adhoc_${Date.now()}_${idx}`,
            sku: qi.sku || 'GEN-SKU',
            barcode: '0000000000000',
            hsn: qi.hsn || '9983',
            name: qi.name,
            categoryId: 'cat_general',
            categoryName: 'General Goods & Services',
            unit: (qi.unit?.toUpperCase() as any) || 'PCS',
            costPrice: 0,
            sellingPrice: qi.rate,
            gstRate: qi.gstRate,
            currentStock: 0,
            minStockAlert: 0,
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
      organizationId: this.organization.id,
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
      syncStatus: 'PENDING',
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
      const prevBal = Number(this.customers[custIdx].currentReceivableBalance || 0);
      const nextBal = roundMoney(prevBal + newSale.grandTotal);
      this.customers[custIdx] = {
        ...this.customers[custIdx],
        currentReceivableBalance: nextBal,
        outstandingReceivable: nextBal,
        totalOrdersCount: (this.customers[custIdx].totalOrdersCount || 0) + 1,
      };
    }

    // Post automated double-entry GL journal (AR / Sales Revenue / Output GST / COGS / Inventory)
    this.postAutomatedJournal({
      organizationId: newSale.organizationId,
      branchId: newSale.branchId,
      entryDate: now.slice(0, 10),
      sourceType: 'SALES_INVOICE',
      sourceId: newSale.id,
      sourceNumber: newSale.invoiceNumber,
      referenceNumber: quote.quoteNumber,
      narration: `Sales Invoice ${newSale.invoiceNumber} converted from Quote ${quote.quoteNumber} (${newSale.customerName || 'Customer'})`,
      idempotencyKey: `gl_sale_${newSale.id}`,
      lines: buildSaleJournalLines(newSale, this.getChartOfAccounts(newSale.organizationId)),
    });

    const outboxItem = this.enqueueOutboxWithRetry('SALE_CREATED', newSale.id, newSale);
    this.saveToStorage();
    this.notify();

    if (this.shouldSyncCloud()) {
      this.beginCloudSave('Convert quotation to invoice');
      Promise.all([
        saveQuotationToSupabase(quote),
        pushSaleToSupabase(newSale, outboxItem.idempotencyKey),
      ])
        .then(([quoteRes, saleRes]) => {
          const ok = Boolean(quoteRes.success && saleRes.success && saleRes.fromCloud === true);
          if (ok) {
            newSale.syncStatus = 'SYNCED';
            outboxItem.status = 'SYNCED';
            outboxItem.syncedAt = new Date().toISOString();
          }
          this.completeCloudSave(
            'Convert quotation to invoice',
            ok,
            saleRes.error || quoteRes.error
          );
        })
        .catch((e) => {
          const msg = e instanceof Error ? e.message : String(e || 'Network error');
          this.completeCloudSave('Convert quotation to invoice', false, msg);
        });
    }

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

    this.runCloudMutation(
      'Supplier',
      {
        eventType: 'SUPPLIER_UPSERTED',
        entityId: supplier.id,
        payload: { ...supplier, organizationId: this.organization.id },
      },
      () => saveSupplierInSupabase(supplier, this.organization.id)
    );
  }

  public deleteSupplier(id: string): void {
    this.suppliers = this.suppliers.filter((s) => s.id !== id);
    this.notify();

    this.runCloudMutation(
      'Delete supplier',
      {
        eventType: 'SUPPLIER_DELETED',
        entityId: id,
        payload: { id, organizationId: this.organization.id },
      },
      () => deleteSupplierInSupabase(id)
    );
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
    if (this.organization.id) {
      this.runCloudMutation('Custom field', null, () => saveCustomFieldToSupabase(field, this.organization.id));
    }
  }

  public deleteCustomField(id: string): void {
    this.customFields = this.customFields.filter((cf) => cf.id !== id);
    this.notify();
    this.runCloudMutation('Delete custom field', null, () => deleteCustomFieldInSupabase(id));
  }

  // --- Quote Preferences ---
  public getQuotePreferences(): { visibleColumns: string[]; pageSize: number } {
    return { ...this.quotePreferences };
  }

  public saveQuotePreferences(prefs: { visibleColumns: string[]; pageSize: number }): void {
    this.quotePreferences = { ...prefs };
    this.notify();
    this.syncUserPreferencesToCloud();
  }

  // --- Direct Invoicing Persistence ---
  public saveInvoice(sale: Sale): void {
    const pendingSale: Sale = {
      ...sale,
      organizationId: sale.organizationId || this.organization.id,
      branchId: sale.branchId || this.activeBranchId,
      syncStatus: 'PENDING',
    };
    const idx = this.sales.findIndex((s) => s.id === pendingSale.id);
    if (idx >= 0) {
      this.sales[idx] = pendingSale;
    } else {
      this.sales.unshift(pendingSale);
    }
    const outboxItem = this.enqueueOutboxWithRetry('SALE_CREATED', pendingSale.id, pendingSale);
    this.notify();

    if (this.shouldSyncCloud()) {
      this.beginCloudSave('Invoice');
      pushSaleToSupabase(pendingSale, outboxItem.idempotencyKey)
        .then((res) => {
          const ok = Boolean(res.success && res.fromCloud === true);
          if (ok) {
            pendingSale.syncStatus = 'SYNCED';
            outboxItem.status = 'SYNCED';
            outboxItem.syncedAt = new Date().toISOString();
          }
          this.completeCloudSave('Invoice', ok, res.error);
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err || 'Network error');
          this.completeCloudSave('Invoice', false, msg);
        });
    }
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

  private resolveOperationalBranchId(preferred?: string): string {
    const candidate = (preferred || this.activeBranchId || '').trim();
    if (candidate && candidate !== 'ALL' && candidate !== 'main-branch') {
      return candidate;
    }
    const validBranch = this.branches.find((b) => b.id && b.id !== 'ALL' && b.id !== 'main-branch');
    return validBranch?.id || '';
  }

  public getActiveBranch(): Branch {
    return (
      this.branches.find((b) => b.id === this.activeBranchId) ||
      this.branches[0] || {
        id: this.activeBranchId || '',
        organizationId: this.organization.id || '',
        code: 'MAIN',
        name: this.organization.tradeName || this.organization.name || 'No Branch Assigned',
        city: this.organization.city || '',
        state: this.organization.state || '',
        address: this.organization.address || '',
        phone: this.organization.phone || '',
        isMainBranch: true,
        activeTerminalCount: 0,
      }
    );
  }

  public getOrganization(): Organization {
    return { ...this.organization };
  }

  public setOrganization(org: Partial<Organization>): void {
    const sanitized: Partial<Organization> = { ...org };
    if ('logoUrl' in sanitized) {
      sanitized.logoUrl = sanitizeBrandImageUrl(sanitized.logoUrl);
    }
    if ('loginBannerUrl' in sanitized) {
      sanitized.loginBannerUrl = sanitizeBrandImageUrl(sanitized.loginBannerUrl);
    }
    this.organization = { ...this.organization, ...sanitized };
    applyDocumentFavicon(this.organization.logoUrl);
    this.saveToStorage();
    this.notify();

    if (
      this.isAuthenticatedState &&
      this.shouldSyncCloud() &&
      this.organization.id
    ) {
      updateOrganizationInSupabase(this.organization.id, sanitized).catch((e) =>
        console.warn('Supabase organization update sync error:', e)
      );
    }
  }

  public getFiscalYear(): string {
    return this.fiscalYear;
  }

  public setFiscalYear(fy: string): void {
    this.fiscalYear = fy;
    this.organization.currentFiscalYear = fy;
    this.notify();
    if (this.isAuthenticatedState && this.shouldSyncCloud() && this.organization.id) {
      this.runCloudMutation('Fiscal year', null, () =>
        updateOrganizationInSupabase(this.organization.id, { currentFiscalYear: fy })
      );
      this.syncUserPreferencesToCloud();
    }
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
    const previousOrgId = this.organization.id;

    if (userProfile) {
      const targetOrgId = userProfile.organizationId || this.organization.id;
      if (targetOrgId && previousOrgId && targetOrgId !== previousOrgId) {
        this.clearTenantDataFromMemory(targetOrgId);
        this.organization = { ...EMPTY_ORGANIZATION, id: targetOrgId };
        if (typeof localStorage !== 'undefined') {
          for (const key of TENANT_STORAGE_KEYS) {
            localStorage.removeItem(key);
          }
        }
      } else if (targetOrgId && !previousOrgId) {
        this.organization = { ...EMPTY_ORGANIZATION, id: targetOrgId };
      }

      this.activeUser = userProfile;
      this.users = this.users.filter((u) => !targetOrgId || u.organizationId === targetOrgId);
      const idx = this.users.findIndex((u) => u.id === userProfile.id);
      if (idx >= 0) {
        this.users[idx] = userProfile;
      } else {
        this.users.push(userProfile);
      }

      const candidateBranchId = branchId || userProfile.branchId;
      const orgBranches = this.branches.filter((b) => b.organizationId === targetOrgId);
      this.branches = orgBranches;

      if (orgBranches.length === 0 && candidateBranchId) {
        this.branches = [
          {
            id: candidateBranchId,
            organizationId: targetOrgId,
            code: 'MAIN-01',
            name: 'Main Branch',
            city: this.organization.city || '',
            state: this.organization.state || '',
            address: this.organization.address || '',
            phone: this.organization.phone || '',
            isMainBranch: true,
            activeTerminalCount: 4,
          },
        ];
        this.activeBranchId = candidateBranchId;
      } else if (orgBranches.length > 0) {
        const matchedBranch = orgBranches.find((b) => b.id === candidateBranchId) || orgBranches[0];
        this.activeBranchId = matchedBranch.id;
      } else {
        this.activeBranchId = candidateBranchId || '';
      }
      if (targetOrgId) {
        this.ensureAccountingDefaults(targetOrgId);
      }
    } else {
      const user = this.users.find((u) => u.id === userId);
      if (user) {
        this.activeUser = user;
        if (user.organizationId && user.organizationId !== previousOrgId) {
          this.clearTenantDataFromMemory(user.organizationId);
          this.organization = { ...EMPTY_ORGANIZATION, id: user.organizationId };
          this.ensureAccountingDefaults(user.organizationId);
        }
      }
      if (branchId) {
        this.activeBranchId = branchId;
      }
    }
    this.isAuthenticatedState = true;
    this.saveToStorage();
    this.notify();
  }

  public logout(): void {
    this.stopAutoSyncLifecycle();
    this.isAuthenticatedState = false;
    this.activeUser = null;
    this.clearTenantDataFromMemory('');
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_USER);
      localStorage.removeItem(STORAGE_KEYS.IS_AUTHENTICATED);
      for (const key of TENANT_STORAGE_KEYS) {
        localStorage.removeItem(key);
      }
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
    if (this.isAuthenticatedState && !canSwitchOrgBranches(this.activeUser)) {
      console.warn(`Role ${this.activeUser?.role || 'UNKNOWN'} is not permitted to switch branches.`);
      return false;
    }
    const exists = this.branches.some(
      (b) => b.id === branchId && (!this.organization.id || b.organizationId === this.organization.id)
    );
    if (!exists) {
      console.warn(`Branch ${branchId} does not belong to the active organization.`);
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
    if (!this.isSimulatedOffline && this.isAuthenticatedState) {
      this.synchronizeOutbox(true).catch(() => {});
    }
  }

  public updatePrinterConfig(config: Partial<HardwarePrinterConfig>) {
    this.printerConfig = { ...this.printerConfig, ...config };
    this.notify();
    if (this.organization.id) {
      this.runCloudMutation('Printer settings', null, () =>
        savePrinterConfigToSupabase(this.printerConfig, this.organization.id, this.activeBranchId)
      );
    }
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
    const branch = this.branches.find((b) => b.id === this.activeBranchId) || this.getActiveBranch();

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
      organizationId: this.organization.id,
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
      syncStatus: 'PENDING',
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
          organizationId: this.organization.id,
          branchId: branch.id,
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

    // d) Append to Durable Sync Outbox (always PENDING until DB confirms)
    const outboxItem: SyncOutboxItem = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      eventId: `evt_${Date.now()}`,
      eventType: 'SALE_CREATED',
      entityId: saleId,
      payload: newSale,
      organizationId: this.organization.id,
      branchId: branch.id,
      deviceId: this.deviceRegistration.deviceId,
      idempotencyKey: `pos_checkout_${saleId}`,
      retryCount: 0,
      status: 'PENDING',
      createdAt: now,
    };
    this.syncOutbox.unshift(outboxItem);

    // e) Direct Supabase cloud persistence if configured and online
    if (this.shouldSyncCloud()) {
      this.beginCloudSave('Sale checkout');
      pushSaleToSupabase(newSale, outboxItem.idempotencyKey)
        .then((result) => {
          const confirmed = Boolean(result.success && result.fromCloud === true);
          if (confirmed) {
            newSale.syncStatus = 'SYNCED';
            outboxItem.status = 'SYNCED';
            outboxItem.syncedAt = new Date().toISOString();
            this.completeCloudSave('Sale checkout', true);
          } else {
            newSale.syncStatus = 'PENDING';
            outboxItem.status = 'PENDING';
            outboxItem.errorMessage = result.error || 'Awaiting cloud confirmation';
            this.completeCloudSave('Sale checkout', false, result.error);
          }
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err || 'Network error');
          newSale.syncStatus = 'PENDING';
          outboxItem.status = 'PENDING';
          outboxItem.errorMessage = msg;
          this.completeCloudSave('Sale checkout', false, msg);
        });
    }

    // Post balanced double-entry journal to General Ledger atomically
    this.postAutomatedJournal({
      organizationId: newSale.organizationId,
      branchId: newSale.branchId,
      entryDate: newSale.createdAt.slice(0, 10),
      sourceType: 'SALES_INVOICE',
      sourceId: newSale.id,
      sourceNumber: newSale.invoiceNumber,
      referenceNumber: newSale.receiptNumber,
      narration: `Sales Invoice ${newSale.invoiceNumber}${newSale.customerName ? ` — ${newSale.customerName}` : ''}`,
      idempotencyKey: `gl_sale_${newSale.id}`,
      lines: buildSaleJournalLines(newSale, this.getChartOfAccounts(newSale.organizationId)),
    });

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
    if (this.isAuthenticatedState && !hasPermission(this.activeUser, 'REFUNDS_APPROVE')) {
      return { success: false, error: 'Access Denied: Your role is not authorized to approve refunds.' };
    }
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

    // Restock items if requested and calculate cost value for GL reversal
    let restockCostValue = 0;
    if (params.restock) {
      for (const item of params.items) {
        const prodIndex = this.products.findIndex((p) => p.id === item.productId);
        if (prodIndex >= 0) {
          const prod = this.products[prodIndex];
          const current = Number(prod.currentStock ?? prod.stockLevel ?? 0);
          const newStock = current + item.quantity;
          restockCostValue = roundMoney(restockCostValue + (prod.costPrice || 0) * item.quantity);
          this.products[prodIndex] = {
            ...prod,
            currentStock: newStock,
            stockLevel: newStock,
            updatedAt: now,
          };
          this.stockMovements.unshift({
            id: `mov_ref_${Date.now()}_${item.productId}`,
            productId: item.productId,
            productName: prod.name,
            sku: prod.sku,
            type: 'RETURN',
            quantityChange: item.quantity,
            previousStock: current,
            newStock,
            newBalance: newStock,
            referenceId: sale.receiptNumber,
            notes: `Restock on return - ${params.reason}`,
            performedBy: this.getActiveUser().name,
            timestamp: now,
          });
        }
      }
    }

    // Update sale status & reduce customer AR if unpaid credit sale
    const saleIndex = this.sales.findIndex((s) => s.id === params.saleId);
    const paidOnSale = sumMoney((sale.payments || []).map((p) => p.amount));
    if (sale.customerId && paidOnSale <= 0) {
      const custIdx = this.customers.findIndex((c) => c.id === sale.customerId);
      if (custIdx >= 0) {
        const nextBal = Math.max(0, roundMoney((this.customers[custIdx].currentReceivableBalance || 0) - totalRefundAmount));
        this.customers[custIdx] = {
          ...this.customers[custIdx],
          currentReceivableBalance: nextBal,
          outstandingReceivable: nextBal,
        };
      }
    }
    if (saleIndex >= 0) {
      this.sales[saleIndex] = {
        ...this.sales[saleIndex],
        paymentStatus: 'REFUNDED',
      };
    }

    this.refunds.unshift(refundRecord);

    // Post balanced double-entry reversal journal
    this.postAutomatedJournal({
      organizationId: sale.organizationId,
      branchId: sale.branchId,
      entryDate: now.slice(0, 10),
      sourceType: 'CREDIT_NOTE_REFUND',
      sourceId: refundRecord.id,
      sourceNumber: sale.invoiceNumber,
      referenceNumber: sale.receiptNumber,
      narration: `Sales Refund against ${sale.invoiceNumber} (${params.reason})`,
      idempotencyKey: `gl_sale_refund_${refundRecord.id}`,
      lines: buildSaleRefundLines({
        sale,
        refundAmount: totalRefundAmount,
        refundMethod: params.refundMethod,
        restockCostValue,
        accounts: this.getChartOfAccounts(sale.organizationId),
      }),
    });

    const outboxItem = this.enqueueOutboxWithRetry('REFUND_RECORDED', refundRecord.id, refundRecord);
    this.saveToStorage();
    this.notify();

    if (this.shouldSyncCloud()) {
      this.beginCloudSave('Refund');
      pushRefundToSupabase(refundRecord)
        .then((res) => {
          if (res.success) {
            outboxItem.status = 'SYNCED';
            outboxItem.syncedAt = new Date().toISOString();
          }
          this.completeCloudSave('Refund', res.success, res.error);
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err || 'Network error');
          this.completeCloudSave('Refund', false, msg);
        });
    }

    return { success: true, refund: refundRecord };
  }

  // --- Product Management ---
  public addProduct(product: Omit<Product, 'id' | 'updatedAt'>): Product {
    const now = new Date().toISOString();
    const newProd: Product = {
      ...product,
      id: `prod_${Date.now()}`,
      updatedAt: now,
    };
    this.products.unshift(newProd);

    const initMov: StockMovement = {
      id: `mov_init_${Date.now()}`,
      organizationId: this.organization.id,
      branchId: this.activeBranchId,
      productId: newProd.id,
      productName: newProd.name,
      sku: newProd.sku,
      type: 'PURCHASE',
      quantityChange: newProd.currentStock,
      newBalance: newProd.currentStock,
      referenceId: 'OPENING_STOCK',
      notes: 'Initial catalogue entry stock',
      performedBy: this.getActiveUser().name,
      timestamp: now,
    };
    this.stockMovements.unshift(initMov);

    this.notify();

    this.runCloudMutation(
      'Product',
      {
        eventType: 'PRODUCT_UPSERTED',
        entityId: newProd.id,
        payload: { ...newProd, organizationId: this.organization.id, branchId: this.activeBranchId },
      },
      async () => {
        const res = await createProductInSupabase(newProd, this.organization.id, this.activeBranchId);
        if (res.success && newProd.currentStock !== 0) {
          await syncStockMovementToSupabase(initMov, this.organization.id, this.activeBranchId).catch(() => {});
        }
        return res;
      }
    );

    return newProd;
  }

  public updateProduct(id: string, updates: Partial<Product>) {
    const idx = this.products.findIndex((p) => p.id === id);
    if (idx >= 0) {
      const updatedProd: Product = {
        ...this.products[idx],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      this.products[idx] = updatedProd;
      this.notify();

      this.runCloudMutation(
        'Product update',
        {
          eventType: 'PRODUCT_UPSERTED',
          entityId: id,
          payload: { ...updatedProd, organizationId: this.organization.id, branchId: this.activeBranchId },
        },
        () => updateProductInSupabase(id, updates)
      );
    }
  }

  public deleteProduct(id: string): void {
    const existing = this.products.find((p) => p.id === id);
    if (!existing) return;
    this.products = this.products.filter((p) => p.id !== id);
    this.notify();

    this.runCloudMutation(
      'Delete product',
      {
        eventType: 'PRODUCT_DELETED',
        entityId: id,
        payload: { id, organizationId: this.organization.id },
      },
      () => deleteProductInSupabase(id)
    );
  }

  public adjustStock(params: {
    productId: string;
    newStock: number;
    reason: string;
    type: 'ADJUSTMENT' | 'AUDIT_CORRECTION';
  }) {
    if (this.isAuthenticatedState && !hasPermission(this.activeUser, 'INVENTORY_ADJUST')) {
      this.recordCloudSyncError('Stock adjustment', 'Access Denied: Your role cannot adjust inventory stock.');
      return;
    }
    const idx = this.products.findIndex((p) => p.id === params.productId);
    if (idx >= 0) {
      const now = new Date().toISOString();
      const oldStock = this.products[idx].currentStock;
      const diff = params.newStock - oldStock;
      this.products[idx].currentStock = params.newStock;
      this.products[idx].stockLevel = params.newStock;
      this.products[idx].updatedAt = now;

      const adjMov: StockMovement = {
        id: `mov_adj_${Date.now()}`,
        organizationId: this.organization.id,
        branchId: this.activeBranchId,
        productId: params.productId,
        productName: this.products[idx].name,
        sku: this.products[idx].sku,
        type: params.type,
        quantityChange: diff,
        newBalance: params.newStock,
        referenceId: 'STOCK_AUDIT',
        notes: params.reason,
        performedBy: this.getActiveUser().name,
        timestamp: now,
      };
      this.stockMovements.unshift(adjMov);

      this.notify();

      this.runCloudMutation(
        'Stock adjustment',
        {
          eventType: 'STOCK_ADJUSTED',
          entityId: params.productId,
          payload: {
            productId: params.productId,
            newStock: params.newStock,
            organizationId: this.organization.id,
            branchId: this.activeBranchId,
            movement: adjMov,
          },
        },
        async () => {
          const res = await updateProductInSupabase(params.productId, { currentStock: params.newStock });
          if (res.success) {
            await syncStockMovementToSupabase(adjMov, this.organization.id, this.activeBranchId).catch(() => {});
          }
          return res;
        }
      );
    }
  }

  // --- Customer Management ---
  public addCustomer(
    customer: Omit<Customer, 'id' | 'createdAt' | 'currentReceivableBalance' | 'totalOrdersCount'> & {
      currentReceivableBalance?: number;
      totalOrdersCount?: number;
    }
  ): Customer {
    const newCust: Customer = {
      ...customer,
      id: `cust_${Date.now()}`,
      currentReceivableBalance: Number(customer.currentReceivableBalance || 0),
      totalOrdersCount: Number(customer.totalOrdersCount || 0),
      createdAt: new Date().toISOString(),
    };
    this.customers.unshift(newCust);
    this.notify();

    this.runCloudMutation(
      'Customer',
      {
        eventType: 'CUSTOMER_UPSERTED',
        entityId: newCust.id,
        payload: { ...newCust, organizationId: this.organization.id, branchId: this.activeBranchId },
      },
      () => createCustomerInSupabase(newCust, this.organization.id, this.activeBranchId)
    );

    return newCust;
  }

  public updateCustomer(id: string, updates: Partial<Customer>): Customer | null {
    const idx = this.customers.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    const updated: Customer = {
      ...this.customers[idx],
      ...updates,
    };
    this.customers[idx] = updated;
    this.notify();

    this.runCloudMutation(
      'Customer update',
      {
        eventType: 'CUSTOMER_UPSERTED',
        entityId: id,
        payload: { ...updated, organizationId: this.organization.id, branchId: this.activeBranchId },
      },
      () => updateCustomerInSupabase(id, updates)
    );
    return updated;
  }

  public deleteCustomer(id: string): void {
    if (!this.customers.some((c) => c.id === id)) return;
    this.customers = this.customers.filter((c) => c.id !== id);
    this.notify();

    this.runCloudMutation(
      'Delete customer',
      {
        eventType: 'CUSTOMER_DELETED',
        entityId: id,
        payload: { id, organizationId: this.organization.id },
      },
      () => deleteCustomerInSupabase(id)
    );
  }

  public getCustomerReceipts(orgId?: string): CustomerReceipt[] {
    const targetOrg = orgId || this.organization.id;
    return this.customerReceipts
      .filter((r) => !targetOrg || r.organizationId === targetOrg)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public recordCustomerReceipt(params: {
    customerId: string;
    amount: number;
    paymentMethod: PaymentMode | 'NEFT/RTGS';
    bankAccountId?: string;
    receiptDate?: string;
    referenceNumber?: string;
    notes?: string;
    allocations?: Array<{ saleId: string; amount: number }>;
    receivedBy?: string;
    receivedByName?: string;
    orgId?: string;
    branchId?: string;
    sourceType?: 'CUSTOMER_PAYMENT' | 'CUSTOMER_RECEIPT';
  }): { success: boolean; receiptId?: string; receipt?: CustomerReceipt; error?: string } {
    if (this.isAuthenticatedState && !hasPermission(this.activeUser, 'PAYMENTS_COLLECT')) {
      return { success: false, error: 'Access Denied: Your role is not authorized to collect customer payments.' };
    }

    const cleanAmount = roundMoney(Number(params.amount));
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      return { success: false, error: 'Payment amount must be greater than zero.' };
    }

    const idx = this.customers.findIndex((c) => c.id === params.customerId);
    if (idx < 0) {
      return { success: false, error: 'Customer account not found.' };
    }

    const customer = this.customers[idx];
    const targetOrg = params.orgId || this.organization.id;
    const targetBranch = this.resolveOperationalBranchId(params.branchId);
    const now = new Date().toISOString();
    const receiptDate = (params.receiptDate || now.slice(0, 10)).slice(0, 10);
    const receiptId = `cpay_${params.customerId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const sourceNum = params.referenceNumber?.trim() || `RCPT-${String(this.customerReceipts.length + 1).padStart(4, '0')}`;

    const appliedAllocations: CustomerReceiptAllocation[] = [];
    let remainingToAllocate = cleanAmount;

    const paymentMethodForSale: PaymentRecord['method'] =
      params.paymentMethod === 'CASH'
        ? 'CASH'
        : params.paymentMethod === 'UPI'
          ? 'UPI'
          : 'CARD';

    if (Array.isArray(params.allocations) && params.allocations.length > 0) {
      for (const reqAlloc of params.allocations) {
        if (remainingToAllocate <= 0.01) break;
        const sale = this.sales.find((s) => s.id === reqAlloc.saleId && s.customerId === params.customerId);
        if (!sale) continue;
        const paidSoFar = sumMoney((sale.payments || []).map((p) => p.amount));
        const unpaid = roundMoney(sale.grandTotal - paidSoFar);
        if (unpaid <= 0.01) continue;
        const allocAmt = roundMoney(Math.min(unpaid, reqAlloc.amount, remainingToAllocate));
        if (allocAmt <= 0.01) continue;
        sale.payments.push({
          id: `pay_alloc_${receiptId}_${appliedAllocations.length + 1}`,
          saleId: sale.id,
          method: paymentMethodForSale,
          amount: allocAmt,
          utrOrRef: sourceNum,
          gatewayStatus: 'VERIFIED',
          timestamp: now,
        });
        sale.paymentStatus = allocAmt >= unpaid - 0.01 ? 'PAID' : 'PARTIALLY_PAID';
        remainingToAllocate = roundMoney(remainingToAllocate - allocAmt);
        appliedAllocations.push({
          saleId: sale.id,
          invoiceNumber: sale.invoiceNumber || sale.receiptNumber,
          allocatedAmount: allocAmt,
        });
      }
    } else {
      const customerSalesChrono = this.sales
        .filter((s) => s.customerId === params.customerId && (s.paymentStatus === 'OVERDUE' || s.paymentStatus === 'PARTIALLY_PAID'))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      for (const sale of customerSalesChrono) {
        if (remainingToAllocate <= 0.01) break;
        const paidSoFar = sumMoney((sale.payments || []).map((p) => p.amount));
        const unpaid = roundMoney(sale.grandTotal - paidSoFar);
        if (unpaid > 0.01) {
          const allocAmt = roundMoney(Math.min(unpaid, remainingToAllocate));
          sale.payments.push({
            id: `pay_alloc_${receiptId}_${appliedAllocations.length + 1}`,
            saleId: sale.id,
            method: paymentMethodForSale,
            amount: allocAmt,
            utrOrRef: sourceNum,
            gatewayStatus: 'VERIFIED',
            timestamp: now,
          });
          remainingToAllocate = roundMoney(remainingToAllocate - allocAmt);
          sale.paymentStatus = allocAmt >= unpaid - 0.01 ? 'PAID' : 'PARTIALLY_PAID';
          appliedAllocations.push({
            saleId: sale.id,
            invoiceNumber: sale.invoiceNumber || sale.receiptNumber,
            allocatedAmount: allocAmt,
          });
        }
      }
    }

    const allocatedTotal = sumMoney(appliedAllocations.map((a) => a.allocatedAmount));
    const currentReceivable = Number(customer.currentReceivableBalance ?? customer.outstandingReceivable ?? 0);
    const arSettledAmount = Math.max(allocatedTotal, Math.min(currentReceivable, cleanAmount));
    const unallocatedAdvance = Math.max(0, roundMoney(cleanAmount - arSettledAmount));

    const nextBalance = Math.max(0, roundMoney(currentReceivable - arSettledAmount));
    this.customers[idx] = {
      ...customer,
      currentReceivableBalance: nextBalance,
      outstandingReceivable: nextBalance,
    };

    let bankAccountName: string | undefined;
    if (params.bankAccountId) {
      const bankRes = this.recordBankTransaction({
        bankAccountId: params.bankAccountId,
        type: 'DEPOSIT',
        amount: cleanAmount,
        referenceNumber: sourceNum,
        description: `Customer receipt ${sourceNum} from ${customer.name}`,
        category: 'Customer Receipt',
        payeePayer: customer.name,
        initiatedBy: params.receivedBy || this.activeUser?.id,
        orgId: targetOrg,
        branchId: targetBranch,
        skipGlPosting: true,
      });
      if (!bankRes.success) {
        return { success: false, error: `Deposit account update failed: ${bankRes.error}` };
      }
      bankAccountName = bankRes.transaction?.bankAccountName;
    }

    const journalRes = this.postAutomatedJournal({
      organizationId: targetOrg,
      branchId: targetBranch,
      entryDate: receiptDate,
      sourceType: params.sourceType || 'CUSTOMER_PAYMENT',
      sourceId: receiptId,
      sourceNumber: sourceNum,
      referenceNumber: sourceNum,
      narration: `Customer receipt ${sourceNum} from ${customer.name} via ${params.paymentMethod}`,
      idempotencyKey: `gl_${receiptId}`,
      lines: buildCustomerPaymentLines({
        organizationId: targetOrg,
        customerId: customer.id,
        customerName: customer.name,
        amount: cleanAmount,
        allocatedToInvoices: arSettledAmount,
        unallocatedAdvance,
        method: params.paymentMethod,
        reference: sourceNum,
        accounts: this.getChartOfAccounts(targetOrg),
      }),
    });

    const normalizedReceiptMethod: CustomerReceipt['paymentMethod'] =
      params.paymentMethod === 'CASH' ||
      params.paymentMethod === 'UPI' ||
      params.paymentMethod === 'CARD' ||
      params.paymentMethod === 'BANK' ||
      params.paymentMethod === 'CHEQUE' ||
      params.paymentMethod === 'NEFT/RTGS'
        ? params.paymentMethod
        : 'BANK';

    const receipt: CustomerReceipt = {
      id: receiptId,
      receiptNumber: sourceNum,
      organizationId: targetOrg,
      branchId: targetBranch,
      customerId: customer.id,
      customerName: customer.name,
      amount: cleanAmount,
      allocatedAmount: allocatedTotal,
      unallocatedAdvance,
      paymentMethod: normalizedReceiptMethod,
      bankAccountId: params.bankAccountId,
      bankAccountName,
      receiptDate,
      referenceNumber: sourceNum,
      notes: params.notes,
      allocations: appliedAllocations,
      status: 'COMPLETED',
      journalEntryId: journalRes.journalEntry?.id,
      journalNumber: journalRes.journalEntry?.journalNumber,
      createdBy: params.receivedBy || this.activeUser?.id || 'usr_system',
      createdByName: params.receivedByName || this.activeUser?.name || 'Cashier',
      createdAt: now,
      updatedAt: now,
    };

    this.customerReceipts.unshift(receipt);
    this.logFinancialAudit({
      organizationId: targetOrg,
      branchId: targetBranch,
      module: 'SALES_RECEIPTS',
      action: 'CUSTOMER_RECEIPT_RECORDED',
      entityType: 'CustomerReceipt',
      entityId: receipt.id,
      entityNumber: receipt.receiptNumber,
      summary: `Collected ₹${cleanAmount.toFixed(2)} from ${customer.name} (${params.paymentMethod}); settled AR ₹${arSettledAmount.toFixed(2)}, advance ₹${unallocatedAdvance.toFixed(2)}`,
    });

    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Customer receipt',
      {
        eventType: 'CUSTOMER_RECEIPT_CREATED',
        entityId: receipt.id,
        payload: receipt,
      },
      async () => {
        const res = await saveCustomerReceiptToSupabase(receipt);
        if (!res.success) return res;
        await allocateCustomerPaymentInSupabase(customer.id, cleanAmount, targetOrg, params.paymentMethod, sourceNum, receiptId).catch(() => {});
        return { success: true };
      }
    );

    return { success: true, receiptId, receipt };
  }

  public reverseCustomerReceipt(
    receiptId: string,
    reason: string
  ): { success: boolean; receipt?: CustomerReceipt; error?: string } {
    if (this.isAuthenticatedState && !hasPermission(this.activeUser, 'REFUNDS_APPROVE')) {
      return { success: false, error: 'Access Denied: Only authorized managers or admins can reverse a customer receipt.' };
    }
    const receipt = this.customerReceipts.find((r) => r.id === receiptId);
    if (!receipt) return { success: false, error: 'Customer receipt not found.' };
    if (receipt.status === 'REVERSED') return { success: false, error: 'Receipt is already reversed.' };
    if (!reason.trim()) return { success: false, error: 'Reversal reason is required.' };

    // Reverse bank/cash deposit if deposited to an account
    if (receipt.bankAccountId) {
      const bankRev = this.recordBankTransaction({
        bankAccountId: receipt.bankAccountId,
        type: 'WITHDRAWAL',
        amount: receipt.amount,
        referenceNumber: `REV-${receipt.receiptNumber}`,
        description: `Reversal of receipt ${receipt.receiptNumber}: ${reason.trim()}`,
        category: 'Receipt Reversal',
        payeePayer: receipt.customerName,
        initiatedBy: this.activeUser?.id,
        orgId: receipt.organizationId,
        branchId: receipt.branchId,
        skipGlPosting: true,
      });
      if (!bankRev.success) {
        return { success: false, error: `Bank reversal failed: ${bankRev.error}` };
      }
    }

    const now = new Date().toISOString();
    // Restore invoice payments and statuses
    for (const alloc of receipt.allocations || []) {
      const sale = this.sales.find((s) => s.id === alloc.saleId);
      if (sale) {
        sale.payments = (sale.payments || []).filter((p) => !String(p.id).includes(`pay_alloc_${receipt.id}`));
        const paidNow = sumMoney(sale.payments.map((p) => p.amount));
        sale.paymentStatus = paidNow >= sale.grandTotal - 0.01 ? 'PAID' : paidNow > 0.01 ? 'PARTIALLY_PAID' : 'OVERDUE';
      }
    }

    const cust = this.customers.find((c) => c.id === receipt.customerId);
    if (cust) {
      const arRestored = Math.max(0, roundMoney(receipt.amount - (receipt.unallocatedAdvance || 0)));
      const restored = roundMoney((cust.currentReceivableBalance ?? cust.outstandingReceivable ?? 0) + arRestored);
      cust.currentReceivableBalance = restored;
      cust.outstandingReceivable = restored;
    }

    const origJournal = receipt.journalEntryId
      ? this.journalEntries.find((j) => j.id === receipt.journalEntryId)
      : this.journalEntries.find((j) => j.sourceId === receipt.id);

    if (origJournal && origJournal.lines.length > 0) {
      this.postAutomatedJournal({
        organizationId: receipt.organizationId,
        branchId: receipt.branchId,
        entryDate: now.slice(0, 10),
        sourceType: 'CUSTOMER_RECEIPT_REVERSAL',
        sourceId: `${receipt.id}_rev`,
        sourceNumber: `REV-${receipt.receiptNumber}`,
        referenceNumber: receipt.receiptNumber,
        narration: `Reversal of customer receipt ${receipt.receiptNumber}: ${reason.trim()}`,
        idempotencyKey: `gl_rev_${receipt.id}`,
        lines: buildReversalJournalLines(origJournal.lines, reason.trim()),
      });
    }

    receipt.status = 'REVERSED';
    receipt.reversalReason = reason.trim();
    receipt.reversedAt = now;
    receipt.reversedBy = this.activeUser?.name || 'Manager';
    receipt.updatedAt = now;

    this.logFinancialAudit({
      organizationId: receipt.organizationId,
      branchId: receipt.branchId,
      module: 'SALES_RECEIPTS',
      action: 'CUSTOMER_RECEIPT_REVERSED',
      entityType: 'CustomerReceipt',
      entityId: receipt.id,
      entityNumber: receipt.receiptNumber,
      summary: `Reversed receipt ${receipt.receiptNumber} (₹${receipt.amount.toFixed(2)}) for ${receipt.customerName}: ${reason.trim()}`,
    });

    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Customer receipt reversal',
      {
        eventType: 'CUSTOMER_RECEIPT_REVERSED',
        entityId: receipt.id,
        payload: receipt,
      },
      () => saveCustomerReceiptToSupabase(receipt)
    );

    return { success: true, receipt };
  }

  public allocateCustomerPayment(
    customerId: string,
    amount: number,
    method: 'UPI' | 'CASH' | 'NEFT/RTGS',
    ref: string
  ): { success: boolean; receiptId?: string; error?: string } {
    const res = this.recordCustomerReceipt({
      customerId,
      amount,
      paymentMethod: method,
      referenceNumber: ref,
      sourceType: 'CUSTOMER_PAYMENT',
    });
    return { success: res.success, receiptId: res.receiptId, error: res.error };
  }

  // --- Expense Management ---
  public addExpense(expense: Omit<Expense, 'id'>): Expense {
    const newExp: Expense = {
      ...expense,
      id: `exp_${Date.now()}`,
      organizationId: expense.organizationId || this.organization.id,
      branchId: expense.branchId || this.activeBranchId,
    };
    this.expenses.unshift(newExp);
    this.postAutomatedJournal({
      organizationId: newExp.organizationId || this.organization.id,
      branchId: newExp.branchId || this.activeBranchId,
      entryDate: newExp.date || new Date().toISOString().slice(0, 10),
      sourceType: 'EXPENSE',
      sourceId: newExp.id,
      sourceNumber: newExp.invoiceRef || newExp.id,
      referenceNumber: newExp.invoiceRef,
      narration: `Operating Expense (${newExp.category}) — ${newExp.vendor}`,
      idempotencyKey: `gl_exp_${newExp.id}`,
      lines: buildExpenseJournalLines(newExp, this.getChartOfAccounts(newExp.organizationId || this.organization.id)),
    });
    this.notify();

    this.runCloudMutation(
      'Expense',
      {
        eventType: 'EXPENSE_UPSERTED',
        entityId: newExp.id,
        payload: newExp,
      },
      () => createExpenseInSupabase(newExp)
    );

    return newExp;
  }

  public updateExpense(id: string, updates: Partial<Expense>): Expense | null {
    const idx = this.expenses.findIndex((e) => e.id === id);
    if (idx < 0) return null;
    const updated: Expense = {
      ...this.expenses[idx],
      ...updates,
      organizationId: updates.organizationId || this.expenses[idx].organizationId || this.organization.id,
      branchId: updates.branchId || this.expenses[idx].branchId || this.activeBranchId,
    };
    this.expenses[idx] = updated;
    this.notify();

    this.runCloudMutation(
      'Expense update',
      {
        eventType: 'EXPENSE_UPSERTED',
        entityId: id,
        payload: updated,
      },
      () => updateExpenseInSupabase(updated)
    );
    return updated;
  }

  public deleteExpense(id: string): void {
    if (!this.expenses.some((e) => e.id === id)) return;
    this.expenses = this.expenses.filter((e) => e.id !== id);
    this.notify();

    this.runCloudMutation(
      'Delete expense',
      {
        eventType: 'EXPENSE_DELETED',
        entityId: id,
        payload: { id, organizationId: this.organization.id },
      },
      () => deleteExpenseInSupabase(id)
    );
  }

  // --- Outbox Sync Engine Actions ---
  public async synchronizeOutbox(forceRetry = false): Promise<{ syncedCount: number; errors: number }> {
    if (this.isOffline()) {
      const waiting = this.syncOutbox.filter((i) => i.status === 'PENDING' || i.status === 'CONFLICT' || i.status === 'FAILED').length;
      return { syncedCount: 0, errors: waiting };
    }

    const nowMs = Date.now();
    const pending = this.syncOutbox.filter((item) => {
      if (item.status !== 'PENDING' && item.status !== 'CONFLICT' && !(forceRetry && item.status === 'FAILED')) {
        return false;
      }
      if (!forceRetry && item.nextRetryAt) {
        return new Date(item.nextRetryAt).getTime() <= nowMs;
      }
      return true;
    });

    if (pending.length === 0) return { syncedCount: 0, errors: 0 };

    this.beginCloudSave('Outbox sync');
    this.syncOutbox = this.syncOutbox.map((i) =>
      pending.some((p) => p.id === i.id) ? { ...i, status: 'SYNCING' as const } : i
    );
    this.listeners.forEach((fn) => fn());

    let syncedCount = 0;
    let errors = 0;
    let firstError: string | undefined;
    const syncedIds = new Set<string>();
    const failedMap = new Map<string, string>();

    // 1. Direct Supabase RPC sync for queued sales & refunds when configured
    const remainingForServer: SyncOutboxItem[] = [];
    if (isSupabaseConfigured() && !this.isDemoUser()) {
      for (const item of pending) {
        if (item.eventType === 'SALE_CREATED' && item.payload) {
          try {
            const pushRes = await pushSaleToSupabase(item.payload, item.idempotencyKey);
            if (pushRes.success && pushRes.fromCloud === true) {
              syncedIds.add(item.id);
              const sIdx = this.sales.findIndex((s) => s.id === item.entityId);
              if (sIdx >= 0) this.sales[sIdx].syncStatus = 'SYNCED';
              continue;
            }
          } catch {
            // Fall through to batch API endpoint
          }
        } else if (item.eventType === 'REFUND_RECORDED' && item.payload) {
          try {
            const refRes = await pushRefundToSupabase(item.payload);
            if (refRes.success) {
              syncedIds.add(item.id);
              continue;
            }
          } catch {
            // Fall through to batch API endpoint
          }
        }
        remainingForServer.push(item);
      }
    } else {
      remainingForServer.push(...pending);
    }

    // 2. Push remaining batch via server sync engine (/api/sync-push -> pushSyncOutboxBatch)
    if (remainingForServer.length > 0) {
      try {
        const batchResult = await pushSyncOutboxBatch(this.deviceRegistration.deviceId, remainingForServer);
        for (const id of batchResult.processedIds || []) {
          syncedIds.add(id);
        }
        for (const errEntry of batchResult.errors || []) {
          failedMap.set(errEntry.id, errEntry.error || 'Sync failed');
          if (!firstError) firstError = errEntry.error;
        }
      } catch (err: any) {
        const msg = err?.message || 'Sync server unreachable';
        if (!firstError) firstError = msg;
        for (const item of remainingForServer) {
          if (!syncedIds.has(item.id)) {
            failedMap.set(item.id, msg);
          }
        }
      }
    }

    const now = new Date().toISOString();
    this.syncOutbox = this.syncOutbox.map((i) => {
      if (syncedIds.has(i.id)) {
        syncedCount++;
        return {
          ...i,
          status: 'SYNCED' as const,
          syncedAt: now,
          errorMessage: undefined,
          nextRetryAt: undefined,
        };
      }
      if (pending.some((p) => p.id === i.id)) {
        errors++;
        const errText = failedMap.get(i.id) || firstError || 'Sync failed';
        const nextRetry = i.retryCount + 1;
        const backoffMs = Math.min(300000, 1500 * Math.pow(2, nextRetry));
        const isConflict = errText.toLowerCase().includes('conflict') || errText.toLowerCase().includes('newer version');
        return {
          ...i,
          status: isConflict ? ('CONFLICT' as const) : nextRetry >= 5 ? ('FAILED' as const) : ('PENDING' as const),
          retryCount: nextRetry,
          errorMessage: errText,
          lastAttemptAt: now,
          nextRetryAt: new Date(Date.now() + backoffMs).toISOString(),
        };
      }
      return i;
    });

    if (syncedCount > 0) {
      this.sales = this.sales.map((s) =>
        syncedIds.has(this.syncOutbox.find((o) => o.entityId === s.id && o.eventType === 'SALE_CREATED')?.id || '')
          ? { ...s, syncStatus: 'SYNCED' as const }
          : s
      );
    }

    this.completeCloudSave('Outbox sync', errors === 0, errors > 0 ? firstError || `${errors} item(s) pending retry` : undefined);
    return { syncedCount, errors };
  }

  // ==========================================
  // --- BANKING ENGINE ---
  // ==========================================

  public getBankAccounts(orgId?: string): BankAccount[] {
    const targetOrg = orgId || this.organization.id;
    return this.bankAccounts.filter((a) => a.organizationId === targetOrg);
  }

  public getBankAccountById(id: string): BankAccount | undefined {
    return this.bankAccounts.find((a) => a.id === id);
  }

  public addBankAccount(data: Omit<BankAccount, 'id' | 'createdAt' | 'updatedAt'>): BankAccount {
    const now = new Date().toISOString();
    const targetOrg = data.organizationId || this.organization.id;

    if (data.isPrimary) {
      this.bankAccounts.forEach((acc) => {
        if (acc.organizationId === targetOrg) {
          acc.isPrimary = false;
        }
      });
    }

    const newAccount: BankAccount = {
      ...data,
      id: `bank_acc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      organizationId: targetOrg,
      branchId: this.resolveOperationalBranchId(data.branchId),
      currentBalance: Number(data.currentBalance || data.openingBalance || 0),
      createdAt: now,
      updatedAt: now,
    };

    this.bankAccounts.push(newAccount);

    // Record opening balance transaction if > 0
    let openingTx: BankTransaction | undefined;
    if (newAccount.openingBalance > 0) {
      openingTx = {
        id: `btx_${Date.now()}_open`,
        transactionNumber: `BTX-${new Date().getFullYear()}-${String(this.bankTransactions.length + 1).padStart(4, '0')}`,
        organizationId: targetOrg,
        branchId: newAccount.branchId,
        bankAccountId: newAccount.id,
        bankAccountName: `${newAccount.bankName} (${newAccount.accountNumber.slice(-4)})`,
        type: 'DEPOSIT',
        amount: newAccount.openingBalance,
        balanceBefore: 0,
        balanceAfter: newAccount.openingBalance,
        transactionDate: now.slice(0, 10),
        referenceNumber: 'OPENING-BAL',
        description: 'Account Opening Initial Balance',
        category: 'Opening Balance',
        payeePayer: newAccount.accountHolderName,
        status: 'COMPLETED',
        initiatedBy: this.activeUser?.id || 'usr_system',
        createdAt: now,
      };
      this.bankTransactions.unshift(openingTx);
    }

    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Bank account',
      { eventType: 'BANK_ACCOUNT_UPSERTED', entityId: newAccount.id, payload: newAccount },
      async () => {
        const res = await saveBankAccountToSupabase(newAccount);
        if (!res.success) return res;
        if (openingTx) {
          const txRes = await saveBankTransactionToSupabase(openingTx);
          if (!txRes.success) return txRes;
        }
        return { success: true };
      }
    );

    return newAccount;
  }

  public updateBankAccount(id: string, updates: Partial<BankAccount>): BankAccount | null {
    const index = this.bankAccounts.findIndex((a) => a.id === id);
    if (index === -1) return null;

    const current = this.bankAccounts[index];
    if (updates.isPrimary) {
      this.bankAccounts.forEach((acc) => {
        if (acc.organizationId === current.organizationId) {
          acc.isPrimary = false;
        }
      });
    }

    const updated: BankAccount = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.bankAccounts[index] = updated;
    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Bank account update',
      { eventType: 'BANK_ACCOUNT_UPSERTED', entityId: updated.id, payload: updated },
      () => saveBankAccountToSupabase(updated)
    );

    return updated;
  }

  public getBankTransactions(bankAccountId?: string, orgId?: string): BankTransaction[] {
    const targetOrg = orgId || this.organization.id;
    return this.bankTransactions
      .filter((t) => t.organizationId === targetOrg && (!bankAccountId || t.bankAccountId === bankAccountId))
      .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());
  }

  public recordBankTransaction(params: {
    bankAccountId: string;
    type: BankTransactionType;
    amount: number;
    referenceNumber?: string;
    description?: string;
    category?: string;
    payeePayer?: string;
    toBankAccountId?: string;
    initiatedBy?: string;
    orgId?: string;
    branchId?: string;
    skipGlPosting?: boolean;
  }): { success: boolean; transaction?: BankTransaction; transferTx?: BankTransaction; error?: string } {
    const account = this.getBankAccountById(params.bankAccountId);
    if (!account) return { success: false, error: 'Bank account not found' };
    const isAccountActive = account.status ? account.status === 'ACTIVE' : account.isActive !== false;
    if (!isAccountActive) return { success: false, error: 'Bank account is inactive' };
    if (params.amount <= 0) return { success: false, error: 'Transaction amount must be greater than zero' };

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const balanceBefore = account.currentBalance;

    if (params.type === 'WITHDRAWAL' || params.type === 'TRANSFER') {
      if (account.currentBalance < params.amount) {
        return { success: false, error: `Insufficient account balance (Available: ₹${account.currentBalance.toLocaleString('en-IN')})` };
      }
    }

    let balanceAfter = balanceBefore;
    if (params.type === 'DEPOSIT') {
      balanceAfter = balanceBefore + params.amount;
    } else if (params.type === 'WITHDRAWAL' || params.type === 'TRANSFER') {
      balanceAfter = balanceBefore - params.amount;
    }

    account.currentBalance = balanceAfter;
    account.updatedAt = now;

    const txNumber = `BTX-${new Date().getFullYear()}-${String(this.bankTransactions.length + 1).padStart(4, '0')}`;
    const tx: BankTransaction = {
      id: `btx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      transactionNumber: txNumber,
      organizationId: params.orgId || account.organizationId,
      branchId: params.branchId || this.activeBranchId,
      bankAccountId: account.id,
      bankAccountName: `${account.bankName} (${account.accountNumber.slice(-4)})`,
      type: params.type,
      amount: params.amount,
      balanceBefore,
      balanceAfter,
      transactionDate: today,
      referenceNumber: params.referenceNumber || `REF-${Date.now().toString().slice(-6)}`,
      description: params.description || `${params.type} transaction`,
      category: params.category || 'General',
      payeePayer: params.payeePayer,
      status: 'COMPLETED',
      transferToAccountId: params.type === 'TRANSFER' ? params.toBankAccountId : undefined,
      initiatedBy: params.initiatedBy || this.activeUser?.id || 'usr_system',
      createdAt: now,
    };

    let transferTx: BankTransaction | undefined;
    let destAccount: BankAccount | undefined;

    if (params.type === 'TRANSFER') {
      if (!params.toBankAccountId) {
        return { success: false, error: 'Destination bank account is required for transfer' };
      }
      destAccount = this.getBankAccountById(params.toBankAccountId);
      if (!destAccount) return { success: false, error: 'Destination bank account not found' };
      const isDestActive = destAccount.status ? destAccount.status === 'ACTIVE' : destAccount.isActive !== false;
      if (!isDestActive) return { success: false, error: 'Destination bank account is inactive' };

      const destBefore = destAccount.currentBalance;
      const destAfter = destBefore + params.amount;
      destAccount.currentBalance = destAfter;
      destAccount.updatedAt = now;

      transferTx = {
        id: `btx_${Date.now()}_dest_${Math.random().toString(36).slice(2, 6)}`,
        transactionNumber: `BTX-${new Date().getFullYear()}-${String(this.bankTransactions.length + 2).padStart(4, '0')}`,
        organizationId: destAccount.organizationId,
        branchId: params.branchId || this.activeBranchId,
        bankAccountId: destAccount.id,
        bankAccountName: `${destAccount.bankName} (${destAccount.accountNumber.slice(-4)})`,
        type: 'DEPOSIT',
        amount: params.amount,
        balanceBefore: destBefore,
        balanceAfter: destAfter,
        transactionDate: today,
        referenceNumber: params.referenceNumber || tx.referenceNumber,
        description: `Transfer received from ${account.bankName} (${account.accountNumber.slice(-4)})`,
        category: 'Inter-Account Transfer',
        payeePayer: account.accountHolderName,
        status: 'COMPLETED',
        transferFromAccountId: account.id,
        initiatedBy: params.initiatedBy || this.activeUser?.id || 'usr_system',
        createdAt: now,
      };

      this.bankTransactions.unshift(transferTx);
    }

    this.bankTransactions.unshift(tx);

    if (!params.skipGlPosting) {
      this.postAutomatedJournal({
        organizationId: tx.organizationId,
        branchId: tx.branchId,
        entryDate: tx.transactionDate,
        sourceType: 'BANK_TRANSACTION',
        sourceId: tx.id,
        sourceNumber: tx.transactionNumber,
        referenceNumber: tx.referenceNumber,
        narration: `${tx.type} — ${tx.description}`,
        idempotencyKey: `gl_btx_${tx.id}`,
        lines: buildBankTransactionLines(
          tx,
          this.getChartOfAccounts(tx.organizationId),
          account.accountType === 'CASH'
        ),
      });
    }

    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Bank transaction',
      { eventType: 'BANK_TX_CREATED', entityId: tx.id, payload: tx },
      async () => {
        const resAcc = await saveBankAccountToSupabase(account);
        if (!resAcc.success) return resAcc;
        const resTx = await saveBankTransactionToSupabase(tx);
        if (!resTx.success) return resTx;
        if (destAccount && transferTx) {
          const rDest = await saveBankAccountToSupabase(destAccount);
          if (!rDest.success) return rDest;
          const rTrans = await saveBankTransactionToSupabase(transferTx);
          if (!rTrans.success) return rTrans;
        }
        return { success: true };
      }
    );

    return { success: true, transaction: tx, transferTx };
  }

  public reverseBankTransaction(
    transactionId: string,
    reason: string,
    approvedBy: string
  ): { success: boolean; reversalTransaction?: BankTransaction; error?: string } {
    const tx = this.bankTransactions.find((t) => t.id === transactionId);
    if (!tx) return { success: false, error: 'Transaction not found' };
    if (tx.status === 'REVERSED') return { success: false, error: 'Transaction is already reversed' };

    const account = this.getBankAccountById(tx.bankAccountId || tx.accountId || '');
    if (!account) return { success: false, error: 'Associated bank account not found' };

    const now = new Date().toISOString();
    const balanceBefore = account.currentBalance;
    let balanceAfter = balanceBefore;

    if (tx.type === 'DEPOSIT') {
      if (account.currentBalance < tx.amount) {
        return { success: false, error: 'Cannot reverse deposit: account has insufficient balance' };
      }
      balanceAfter = balanceBefore - tx.amount;
    } else if (tx.type === 'WITHDRAWAL' || tx.type === 'TRANSFER') {
      balanceAfter = balanceBefore + tx.amount;
    }

    account.currentBalance = balanceAfter;
    account.updatedAt = now;

    const revTx: BankTransaction = {
      id: `btx_rev_${Date.now()}`,
      transactionNumber: `REV-${tx.transactionNumber}`,
      organizationId: tx.organizationId,
      branchId: tx.branchId,
      bankAccountId: account.id,
      bankAccountName: tx.bankAccountName,
      type: tx.type === 'DEPOSIT' ? 'WITHDRAWAL' : 'DEPOSIT',
      amount: tx.amount,
      balanceBefore,
      balanceAfter,
      transactionDate: now.slice(0, 10),
      referenceNumber: `REV-${tx.referenceNumber || tx.id}`,
      description: `Reversal of ${tx.transactionNumber}: ${reason}`,
      category: 'Transaction Reversal',
      payeePayer: tx.payeePayer,
      status: 'COMPLETED',
      initiatedBy: approvedBy || this.activeUser?.id || 'usr_system',
      createdAt: now,
    };

    tx.status = 'REVERSED';
    tx.reversalReason = reason;
    tx.reversedAt = now;
    tx.reversalTransactionId = revTx.id;

    this.bankTransactions.unshift(revTx);
    this.postAutomatedJournal({
      organizationId: revTx.organizationId,
      branchId: revTx.branchId,
      entryDate: revTx.transactionDate,
      sourceType: 'REVERSAL',
      sourceId: revTx.id,
      sourceNumber: revTx.transactionNumber,
      referenceNumber: revTx.referenceNumber,
      narration: `Bank Transaction Reversal: ${revTx.description}`,
      idempotencyKey: `gl_btx_rev_${revTx.id}`,
      lines: buildBankTransactionLines(
        revTx,
        this.getChartOfAccounts(revTx.organizationId),
        account.accountType === 'CASH'
      ),
    });
    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Bank transaction reversal',
      { eventType: 'BANK_TX_CREATED', entityId: revTx.id, payload: revTx },
      async () => {
        const resAcc = await saveBankAccountToSupabase(account);
        if (!resAcc.success) return resAcc;
        await saveBankTransactionToSupabase(tx);
        return saveBankTransactionToSupabase(revTx);
      }
    );

    return { success: true, reversalTransaction: revTx };
  }

  public getBankStatementSummary(bankAccountId?: string, orgId?: string) {
    const accounts = this.getBankAccounts(orgId);
    const targetAccounts = bankAccountId ? accounts.filter((a) => a.id === bankAccountId) : accounts;
    const totalBalance = targetAccounts.reduce((sum, a) => sum + a.currentBalance, 0);

    const txs = this.getBankTransactions(bankAccountId, orgId).filter((t) => t.status === 'COMPLETED');
    const totalDeposits = txs.filter((t) => t.type === 'DEPOSIT').reduce((sum, t) => sum + t.amount, 0);
    const totalWithdrawals = txs.filter((t) => t.type === 'WITHDRAWAL' || t.type === 'TRANSFER').reduce((sum, t) => sum + t.amount, 0);

    return {
      totalBalance,
      totalDeposits,
      totalWithdrawals,
      accountCount: targetAccounts.length,
      activeAccounts: targetAccounts.filter((a) => a.status === 'ACTIVE').length,
    };
  }

  // ==========================================
  // --- CREDIT NOTES ENGINE ---
  // ==========================================

  public getCreditNotes(orgId?: string): CreditNote[] {
    const targetOrg = orgId || this.organization.id;
    return this.creditNotes
      .filter((cn) => cn.organizationId === targetOrg)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getCreditNoteById(id: string): CreditNote | undefined {
    return this.creditNotes.find((cn) => cn.id === id);
  }

  public createCreditNote(params: {
    customerId: string;
    customerName?: string;
    invoiceId?: string;
    invoiceNumber?: string;
    items: CreditNoteItem[];
    reason: string;
    notes?: string;
    restockInventory?: boolean;
    createdBy: string;
    createdByName?: string;
    orgId?: string;
    branchId?: string;
  }): { success: boolean; creditNote?: CreditNote; error?: string } {
    const customer = this.customers.find((c) => c.id === params.customerId);
    if (!customer) return { success: false, error: 'Customer not found' };
    if (!params.items || params.items.length === 0) return { success: false, error: 'At least one item is required' };

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const targetOrg = params.orgId || this.organization.id;
    const targetBranch = params.branchId || this.activeBranchId;

    let subtotal = 0;
    let taxableTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;
    let totalCreditAmount = 0;

    const calculatedItems = params.items.map((item, idx) => {
      const q = item.quantity || item.returnedQuantity || 1;
      const lineSubtotal = q * item.unitPrice;
      const taxRate = item.taxRate || 0;
      const taxableAmount = item.taxableAmount !== undefined ? item.taxableAmount : (lineSubtotal * 100) / (100 + taxRate);
      const isInterstate = false; // Intrastate by default
      const cgstRate = isInterstate ? 0 : taxRate / 2;
      const sgstRate = isInterstate ? 0 : taxRate / 2;
      const igstRate = isInterstate ? taxRate : 0;
      const cgstAmount = Math.round((taxableAmount * (cgstRate / 100)) * 100) / 100;
      const sgstAmount = Math.round((taxableAmount * (sgstRate / 100)) * 100) / 100;
      const igstAmount = Math.round((taxableAmount * (igstRate / 100)) * 100) / 100;
      const lineTotal = item.total !== undefined ? item.total : Math.round((taxableAmount + cgstAmount + sgstAmount + igstAmount) * 100) / 100;

      subtotal += lineSubtotal;
      taxableTotal += taxableAmount;
      cgstTotal += cgstAmount;
      sgstTotal += sgstAmount;
      igstTotal += igstAmount;
      totalCreditAmount += lineTotal;

      return {
        ...item,
        id: item.id || `cni_${Date.now()}_${idx}`,
        taxableAmount: Math.round(taxableAmount * 100) / 100,
        cgstRate,
        cgstAmount,
        sgstRate,
        sgstAmount,
        igstRate,
        igstAmount,
        total: lineTotal,
      };
    });

    const cnNumber = `CN-2026-${String(this.creditNotes.length + 1).padStart(4, '0')}`;
    const newCreditNote: CreditNote = {
      id: `cn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      creditNoteNumber: cnNumber,
      organizationId: targetOrg,
      branchId: targetBranch,
      customerId: customer.id,
      customerName: customer.name,
      customerGstin: customer.gstin,
      invoiceId: params.invoiceId,
      invoiceNumber: params.invoiceNumber,
      subtotal: Math.round(subtotal * 100) / 100,
      taxableTotal: Math.round(taxableTotal * 100) / 100,
      cgstTotal: Math.round(cgstTotal * 100) / 100,
      sgstTotal: Math.round(sgstTotal * 100) / 100,
      igstTotal: Math.round(igstTotal * 100) / 100,
      totalTax: Math.round((cgstTotal + sgstTotal + igstTotal) * 100) / 100,
      totalCreditAmount: Math.round(totalCreditAmount * 100) / 100,
      allocatedAmount: 0,
      remainingAmount: Math.round(totalCreditAmount * 100) / 100,
      reason: params.reason,
      notes: params.notes,
      status: 'DRAFT',
      restockInventory: params.restockInventory ?? true,
      items: calculatedItems,
      createdBy: params.createdBy,
      createdByName: params.createdByName || this.activeUser?.name || 'Staff User',
      createdAt: now,
      updatedAt: now,
    };

    this.creditNotes.unshift(newCreditNote);
    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Credit Note',
      { eventType: 'CREDIT_NOTE_UPSERTED', entityId: newCreditNote.id, payload: newCreditNote },
      () => saveCreditNoteToSupabase(newCreditNote)
    );

    return { success: true, creditNote: newCreditNote };
  }

  public approveCreditNote(id: string, approvedBy: string, approvedByName?: string): { success: boolean; creditNote?: CreditNote; error?: string } {
    const cn = this.getCreditNoteById(id);
    if (!cn) return { success: false, error: 'Credit Note not found' };
    if (cn.status !== 'DRAFT') return { success: false, error: `Cannot approve credit note with status ${cn.status}` };

    const now = new Date().toISOString();
    cn.status = 'APPROVED';
    cn.approvedBy = approvedBy;
    cn.approvedByName = approvedByName || this.activeUser?.name || 'Store Manager';
    cn.approvedAt = now;
    cn.updatedAt = now;

    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Credit Note approval',
      { eventType: 'CREDIT_NOTE_UPSERTED', entityId: cn.id, payload: cn },
      () => saveCreditNoteToSupabase(cn)
    );

    return { success: true, creditNote: cn };
  }

  public issueCreditNote(id: string, issuedBy: string, issuedByName?: string): { success: boolean; creditNote?: CreditNote; error?: string } {
    const cn = this.getCreditNoteById(id);
    if (!cn) return { success: false, error: 'Credit Note not found' };
    if (cn.status === 'CANCELLED' || cn.status === 'ISSUED') {
      return { success: false, error: `Credit Note is already ${cn.status}` };
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    // 1. Reduce customer's outstanding receivable balance across both unified & legacy fields
    const customer = this.customers.find((c) => c.id === cn.customerId);
    const creditValue = roundMoney(cn.totalCreditAmount || cn.creditAmount || 0);
    if (customer) {
      const currentReceivable = Number(customer.currentReceivableBalance ?? customer.outstandingReceivable ?? 0);
      const nextReceivable = Math.max(0, roundMoney(currentReceivable - creditValue));
      customer.currentReceivableBalance = nextReceivable;
      customer.outstandingReceivable = nextReceivable;
    }

    // If linked to an unpaid / partially-paid invoice, settle that invoice balance
    if (cn.invoiceId && creditValue > 0) {
      const linkedSale = this.sales.find((s) => s.id === cn.invoiceId);
      if (linkedSale && (linkedSale.paymentStatus === 'OVERDUE' || linkedSale.paymentStatus === 'PARTIALLY_PAID')) {
        const paidSoFar = sumMoney((linkedSale.payments || []).map((p) => p.amount));
        const remaining = roundMoney(linkedSale.grandTotal - paidSoFar);
        if (remaining > 0.01 && creditValue >= remaining - 0.01) {
          linkedSale.paymentStatus = 'PAID';
        } else if (remaining > 0.01) {
          linkedSale.paymentStatus = 'PARTIALLY_PAID';
        }
      }
    }

    // 2. Restock inventory if specified (sync both currentStock and stockLevel)
    if (cn.restockInventory !== false) {
      cn.items.forEach((item) => {
        const product = this.products.find((p) => p.id === item.productId);
        if (product) {
          const prevStock = Number(product.currentStock ?? product.stockLevel ?? 0);
          const qty = item.quantity || item.returnedQuantity || 1;
          const nextStock = prevStock + qty;
          product.currentStock = nextStock;
          product.stockLevel = nextStock;
          product.updatedAt = now;
          if (product.branchStocks && product.branchStocks[cn.branchId] !== undefined) {
            product.branchStocks[cn.branchId] += qty;
          }

          this.stockMovements.unshift({
            id: `sm_cn_${Date.now()}_${item.productId}`,
            productId: item.productId,
            productName: item.productName,
            sku: item.sku || product.sku || 'SKU',
            branchId: cn.branchId,
            quantityChange: qty,
            quantity: qty,
            type: 'RETURN',
            previousStock: prevStock,
            newStock: nextStock,
            newBalance: nextStock,
            referenceId: cn.id,
            notes: `Restock from Credit Note ${cn.creditNoteNumber}: ${cn.reason}`,
            performedBy: issuedByName || issuedBy,
            timestamp: now,
          });
        }
      });
    }

    cn.status = 'ISSUED';
    cn.issueDate = today;
    cn.adjustmentStatus = 'ADJUSTED';
    cn.updatedAt = now;

    this.postAutomatedJournal({
      organizationId: cn.organizationId,
      branchId: cn.branchId,
      entryDate: today,
      sourceType: 'CREDIT_NOTE',
      sourceId: cn.id,
      sourceNumber: cn.creditNoteNumber,
      referenceNumber: cn.invoiceNumber || cn.originalInvoiceNumber,
      narration: `Credit Note ${cn.creditNoteNumber} issued to ${cn.customerName} (${cn.reason})`,
      idempotencyKey: `gl_cn_${cn.id}`,
      lines: buildCreditNoteLines(cn, this.getChartOfAccounts(cn.organizationId), (productId) => {
        const p = this.products.find((prod) => prod.id === productId);
        return p ? p.costPrice : 0;
      }),
    });

    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Credit Note issuance',
      { eventType: 'CREDIT_NOTE_UPSERTED', entityId: cn.id, payload: cn },
      () => saveCreditNoteToSupabase(cn)
    );

    return { success: true, creditNote: cn };
  }

  public refundCreditNote(params: {
    creditNoteId: string;
    refundAmount: number;
    refundMode: 'CASH' | 'BANK' | 'UPI';
    bankAccountId?: string;
    referenceNumber?: string;
    processedBy?: string;
  }): { success: boolean; creditNote?: CreditNote; error?: string } {
    const cn = this.getCreditNoteById(params.creditNoteId);
    if (!cn) return { success: false, error: 'Credit Note not found' };
    if (cn.status !== 'ISSUED' && cn.status !== 'APPROVED') {
      return { success: false, error: `Credit Note must be ISSUED before refunding (current: ${cn.status})` };
    }
    const maxRefund = roundMoney(cn.remainingAmount ?? cn.totalCreditAmount ?? cn.creditAmount ?? 0);
    if (params.refundAmount <= 0 || params.refundAmount > maxRefund + 0.01) {
      return { success: false, error: `Refund amount must be between ₹0.01 and ₹${maxRefund.toFixed(2)}` };
    }

    if (params.bankAccountId && params.refundMode !== 'CASH') {
      const bankRes = this.recordBankTransaction({
        bankAccountId: params.bankAccountId,
        type: 'WITHDRAWAL',
        amount: params.refundAmount,
        referenceNumber: params.referenceNumber || `REF-${cn.creditNoteNumber}`,
        description: `Customer refund for Credit Note ${cn.creditNoteNumber}`,
        category: 'Customer Refund',
        payeePayer: cn.customerName,
        initiatedBy: params.processedBy || this.activeUser?.id,
        orgId: cn.organizationId,
        branchId: cn.branchId,
        skipGlPosting: true,
      });
      if (!bankRes.success) {
        return { success: false, error: bankRes.error || 'Bank refund deduction failed' };
      }
    }

    const now = new Date().toISOString();
    cn.allocatedAmount = roundMoney((cn.allocatedAmount || 0) + params.refundAmount);
    cn.remainingAmount = Math.max(0, roundMoney((cn.totalCreditAmount ?? cn.creditAmount ?? 0) - cn.allocatedAmount));
    cn.status = cn.remainingAmount <= 0.01 ? 'REFUNDED' : 'APPLIED';
    cn.adjustmentStatus = 'REFUNDED';
    cn.updatedAt = now;

    this.postAutomatedJournal({
      organizationId: cn.organizationId,
      branchId: cn.branchId,
      entryDate: now.slice(0, 10),
      sourceType: 'CREDIT_NOTE_REFUND',
      sourceId: `${cn.id}_ref_${Date.now()}`,
      sourceNumber: cn.creditNoteNumber,
      referenceNumber: params.referenceNumber || `REF-${cn.creditNoteNumber}`,
      narration: `Refund payout via ${params.refundMode} for ${cn.creditNoteNumber} (${cn.customerName})`,
      idempotencyKey: `gl_cn_refund_${cn.id}_${cn.allocatedAmount}`,
      lines: buildCreditNoteRefundLines({
        creditNote: cn,
        refundAmount: params.refundAmount,
        refundMode: params.refundMode,
        accounts: this.getChartOfAccounts(cn.organizationId),
      }),
    });

    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Credit Note refund',
      { eventType: 'CREDIT_NOTE_UPSERTED', entityId: cn.id, payload: cn },
      () => saveCreditNoteToSupabase(cn)
    );

    return { success: true, creditNote: cn };
  }

  public cancelCreditNote(id: string, reason: string): { success: boolean; error?: string } {
    const cn = this.getCreditNoteById(id);
    if (!cn) return { success: false, error: 'Credit Note not found' };
    if (cn.status === 'CANCELLED') return { success: false, error: 'Credit Note is already cancelled' };

    cn.status = 'CANCELLED';
    cn.notes = `${cn.notes ? cn.notes + ' | ' : ''}Cancelled: ${reason}`;
    cn.updatedAt = new Date().toISOString();

    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Credit Note cancellation',
      { eventType: 'CREDIT_NOTE_UPSERTED', entityId: cn.id, payload: cn },
      () => saveCreditNoteToSupabase(cn)
    );

    return { success: true };
  }

  // ==========================================
  // --- PURCHASES & BILLS ENGINE ---
  // ==========================================

  public getPurchaseOrders(orgId?: string): PurchaseOrder[] {
    const targetOrg = orgId || this.organization.id;
    return this.purchaseOrders
      .filter((po) => po.organizationId === targetOrg)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getPurchaseOrderById(id: string): PurchaseOrder | undefined {
    return this.purchaseOrders.find((po) => po.id === id);
  }

  public createPurchaseOrder(
    poData: Omit<PurchaseOrder, 'id' | 'poNumber' | 'createdAt' | 'updatedAt' | 'status' | 'receivedTotal'>
  ): PurchaseOrder {
    const now = new Date().toISOString();
    const poNumber = `PO-2026-${String(this.purchaseOrders.length + 1).padStart(4, '0')}`;

    const newPO: PurchaseOrder = {
      ...poData,
      id: `po_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      poNumber,
      organizationId: poData.organizationId || this.organization.id,
      branchId: this.resolveOperationalBranchId(poData.branchId),
      status: 'ORDERED',
      receivedTotal: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.purchaseOrders.unshift(newPO);
    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Purchase Order',
      { eventType: 'PO_UPSERTED', entityId: newPO.id, payload: newPO },
      () => savePurchaseOrderToSupabase(newPO)
    );

    return newPO;
  }

  public updatePurchaseOrderStatus(id: string, status: PurchaseOrderStatus): boolean {
    const po = this.getPurchaseOrderById(id);
    if (!po) return false;
    po.status = status;
    po.updatedAt = new Date().toISOString();
    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Purchase Order status',
      { eventType: 'PO_UPSERTED', entityId: po.id, payload: po },
      () => savePurchaseOrderToSupabase(po)
    );

    return true;
  }

  public getGoodsReceipts(poId?: string, orgId?: string): GoodsReceipt[] {
    const targetOrg = orgId || this.organization.id;
    return this.goodsReceipts
      .filter((grn) => grn.organizationId === targetOrg && (!poId || grn.purchaseOrderId === poId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public receiveGoods(params: {
    poId?: string;
    supplierId: string;
    supplierName?: string;
    items: {
      productId: string;
      productName?: string;
      quantityReceived: number;
      unitPrice: number;
      expiryDate?: string;
      batchNumber?: string;
    }[];
    receivedBy: string;
    receivedByName?: string;
    notes?: string;
    orgId?: string;
    branchId?: string;
  }): { success: boolean; goodsReceipt?: GoodsReceipt; error?: string } {
    if (!params.items || params.items.length === 0) {
      return { success: false, error: 'At least one received item is required' };
    }
    if (params.items.some((i) => !Number.isFinite(i.quantityReceived) || i.quantityReceived <= 0)) {
      return { success: false, error: 'Received quantity must be greater than zero for every item' };
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const targetOrg = params.orgId || this.organization.id;
    const targetBranch = params.branchId || this.activeBranchId;

    let po: PurchaseOrder | undefined;
    if (params.poId) {
      po = this.getPurchaseOrderById(params.poId);
    }

    const grnNumber = `GRN-2026-${String(this.goodsReceipts.length + 1).padStart(4, '0')}`;
    let totalItemsReceived = 0;

    const grnItems: GoodsReceiptItem[] = params.items.map((item, idx) => {
      totalItemsReceived += item.quantityReceived;

      // 1. Restock physical product inventory (sync both currentStock and stockLevel)
      const product = this.products.find((p) => p.id === item.productId);
      if (product) {
        const prevStock = Number(product.currentStock ?? product.stockLevel ?? 0);
        const nextStock = prevStock + item.quantityReceived;
        product.currentStock = nextStock;
        product.stockLevel = nextStock;
        product.updatedAt = now;
        if (product.branchStocks && product.branchStocks[targetBranch] !== undefined) {
          product.branchStocks[targetBranch] += item.quantityReceived;
        }
        if (item.unitPrice > 0) {
          product.costPrice = item.unitPrice;
        }

        // 2. Create authoritative StockMovement record
        this.stockMovements.unshift({
          id: `sm_grn_${Date.now()}_${item.productId}`,
          productId: item.productId,
          productName: item.productName || product.name,
          sku: product.sku || 'SKU',
          branchId: targetBranch,
          quantityChange: item.quantityReceived,
          quantity: item.quantityReceived,
          type: 'RECEIPT',
          previousStock: prevStock,
          newStock: nextStock,
          newBalance: nextStock,
          referenceId: grnNumber,
          notes: `Goods receipt ${grnNumber} from supplier ${params.supplierName || 'Vendor'}`,
          performedBy: params.receivedByName || params.receivedBy,
          timestamp: now,
        });
      }

      // 3. Update PO line item received quantity if linked to PO
      if (po) {
        const poItem = po.items.find((i) => i.productId === item.productId);
        if (poItem) {
          poItem.receivedQuantity = (poItem.receivedQuantity || 0) + item.quantityReceived;
        }
      }

      return {
        id: `grni_${Date.now()}_${idx}`,
        productId: item.productId,
        productName: item.productName || 'Product',
        quantityReceived: item.quantityReceived,
        unitPrice: item.unitPrice,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
      };
    });

    // Update PO overall status and received total if linked
    if (po) {
      const allReceived = po.items.every((i) => (i.receivedQuantity || 0) >= i.orderedQuantity);
      po.status = allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
      po.receivedTotal = (po.receivedTotal || 0) + totalItemsReceived;
      po.updatedAt = now;
    }

    const newGRN: GoodsReceipt = {
      id: `grn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      grnNumber,
      organizationId: targetOrg,
      branchId: this.resolveOperationalBranchId(targetBranch),
      purchaseOrderId: params.poId,
      poNumber: po?.poNumber,
      supplierId: params.supplierId,
      supplierName: params.supplierName || po?.supplierName || 'Vendor',
      receivedDate: today,
      receivedBy: params.receivedBy,
      receivedByName: params.receivedByName || this.activeUser?.name || 'Store Officer',
      items: grnItems,
      notes: params.notes,
      createdAt: now,
    };

    this.goodsReceipts.unshift(newGRN);
    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Goods Receipt',
      { eventType: 'GRN_CREATED', entityId: newGRN.id, payload: newGRN },
      async () => {
        const resGrn = await saveGoodsReceiptToSupabase(newGRN);
        if (!resGrn.success) return resGrn;
        if (po) {
          await savePurchaseOrderToSupabase(po);
        }
        return { success: true };
      }
    );

    return { success: true, goodsReceipt: newGRN };
  }

  public getSupplierBills(supplierId?: string, orgId?: string): SupplierBill[] {
    const targetOrg = orgId || this.organization.id;
    return this.supplierBills
      .filter((b) => b.organizationId === targetOrg && (!supplierId || b.supplierId === supplierId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getSupplierBillById(id: string): SupplierBill | undefined {
    return this.supplierBills.find((b) => b.id === id);
  }

  public createSupplierBill(
    billData: Omit<SupplierBill, 'id' | 'billNumber' | 'createdAt' | 'updatedAt' | 'paidAmount' | 'outstandingAmount' | 'status'> & {
      paidAmount?: number;
    }
  ): SupplierBill {
    const now = new Date().toISOString();
    const safeTotal = roundMoney(Math.max(0.01, Number(billData.totalAmount || 0)));
    const safeGst = roundMoney(Math.min(safeTotal, Math.max(0, Number(billData.gstTotal || 0))));
    const paidAmount = roundMoney(Math.min(safeTotal, Math.max(0, Number(billData.paidAmount || 0))));
    const outstandingAmount = Math.max(0, roundMoney(safeTotal - paidAmount));
    const status: SupplierBillStatus = paidAmount === 0 ? 'PENDING' : outstandingAmount <= 0.01 ? 'PAID' : 'PARTIALLY_PAID';

    const billNumber = `BILL-2026-${String(this.supplierBills.length + 1).padStart(4, '0')}`;
    const newBill: SupplierBill = {
      ...billData,
      totalAmount: safeTotal,
      gstTotal: safeGst,
      taxableTotal: roundMoney(Math.max(0, safeTotal - safeGst)),
      subtotal: roundMoney(Math.max(0, safeTotal - safeGst)),
      id: `bill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      billNumber,
      organizationId: billData.organizationId || this.organization.id,
      branchId: this.resolveOperationalBranchId(billData.branchId),
      paidAmount,
      outstandingAmount,
      status,
      createdAt: now,
      updatedAt: now,
    };

    // Increase supplier's outstanding AP balance (both fields synced)
    const supplier = this.suppliers.find((s) => s.id === billData.supplierId);
    if (supplier) {
      const nextPayable = roundMoney((supplier.outstandingBalance ?? supplier.currentPayableBalance ?? 0) + outstandingAmount);
      supplier.outstandingBalance = nextPayable;
      supplier.currentPayableBalance = nextPayable;
    }

    this.supplierBills.unshift(newBill);
    this.postAutomatedJournal({
      organizationId: newBill.organizationId,
      branchId: newBill.branchId,
      entryDate: newBill.billDate || now.slice(0, 10),
      sourceType: 'PURCHASE_BILL',
      sourceId: newBill.id,
      sourceNumber: newBill.billNumber,
      referenceNumber: newBill.supplierInvoiceNumber,
      narration: `Supplier Bill ${newBill.billNumber} (${newBill.supplierInvoiceNumber}) — ${newBill.supplierName}`,
      idempotencyKey: `gl_bill_${newBill.id}`,
      lines: buildSupplierBillLines(newBill, this.getChartOfAccounts(newBill.organizationId)),
    });
    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Supplier bill',
      { eventType: 'SUPPLIER_BILL_UPSERTED', entityId: newBill.id, payload: newBill },
      () => saveSupplierBillToSupabase(newBill)
    );

    return newBill;
  }

  public getSupplierPayments(billId?: string, orgId?: string): SupplierPayment[] {
    const targetOrg = orgId || this.organization.id;
    return this.supplierPayments
      .filter((p) => p.organizationId === targetOrg && (!billId || p.supplierBillId === billId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public recordSupplierPayment(params: {
    billId?: string;
    supplierId: string;
    amount: number;
    paymentMethod: PaymentMode | 'NEFT/RTGS' | 'CHEQUE';
    paymentDate?: string;
    referenceNumber?: string;
    bankAccountId?: string;
    allocations?: Array<{ billId: string; amount: number }>;
    isAdvance?: boolean;
    paidBy: string;
    paidByName?: string;
    notes?: string;
    orgId?: string;
    branchId?: string;
  }): { success: boolean; payment?: SupplierPayment; error?: string } {
    if (this.isAuthenticatedState && !hasPermission(this.activeUser, 'SUPPLIER_BILLS_MANAGE')) {
      return { success: false, error: 'Access Denied: Your role is not authorized to record supplier payments.' };
    }

    const cleanAmount = roundMoney(Number(params.amount));
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      return { success: false, error: 'Payment amount must be greater than zero' };
    }

    const supplier = this.suppliers.find((s) => s.id === params.supplierId);
    if (!supplier) return { success: false, error: 'Supplier not found' };

    const targetOrg = params.orgId || this.organization.id;
    const targetBranch = this.resolveOperationalBranchId(params.branchId);
    const now = new Date().toISOString();
    const today = (params.paymentDate || now.slice(0, 10)).slice(0, 10);

    const allocationTargets: Array<{ bill: SupplierBill; amount: number }> = [];
    if (params.billId) {
      const bill = this.getSupplierBillById(params.billId);
      if (!bill) return { success: false, error: 'Supplier bill not found' };
      if (bill.status === 'PAID') return { success: false, error: 'Bill is already fully paid' };
      if (cleanAmount > bill.outstandingAmount + 0.01) {
        return { success: false, error: `Payment amount (₹${cleanAmount}) exceeds outstanding bill balance (₹${bill.outstandingAmount})` };
      }
      allocationTargets.push({ bill, amount: cleanAmount });
    } else if (Array.isArray(params.allocations) && params.allocations.length > 0 && !params.isAdvance) {
      let remaining = cleanAmount;
      for (const req of params.allocations) {
        if (remaining <= 0.01) break;
        const bill = this.getSupplierBillById(req.billId);
        if (!bill || bill.supplierId !== params.supplierId || bill.status === 'PAID') continue;
        const amt = roundMoney(Math.min(bill.outstandingAmount, req.amount, remaining));
        if (amt > 0.01) {
          allocationTargets.push({ bill, amount: amt });
          remaining = roundMoney(remaining - amt);
        }
      }
    }

    // Deduct from specified Bank or Cash account atomically
    let bankAccountName: string | undefined;
    if (params.bankAccountId) {
      const refSuffix = allocationTargets[0]?.bill.billNumber || 'ADVANCE';
      const bankResult = this.recordBankTransaction({
        bankAccountId: params.bankAccountId,
        type: 'WITHDRAWAL',
        amount: cleanAmount,
        referenceNumber: params.referenceNumber || `PAY-${refSuffix}`,
        description: `Supplier payment to ${supplier.name}${allocationTargets.length ? ` (${allocationTargets.map((a) => a.bill.billNumber).join(', ')})` : ' (Advance)'}`,
        category: 'Supplier Payment',
        payeePayer: supplier.name,
        initiatedBy: params.paidBy,
        orgId: targetOrg,
        branchId: targetBranch,
        skipGlPosting: true,
      });
      if (!bankResult.success) {
        return { success: false, error: `Bank/cash deduction failed: ${bankResult.error}` };
      }
      bankAccountName = bankResult.transaction?.bankAccountName;
    }

    const allocatedBillsSummary: Array<{ billId: string; billNumber: string; allocatedAmount: number }> = [];
    let totalAllocatedToBills = 0;

    for (const target of allocationTargets) {
      target.bill.paidAmount = roundMoney(target.bill.paidAmount + target.amount);
      target.bill.outstandingAmount = Math.max(0, roundMoney(target.bill.totalAmount - target.bill.paidAmount));
      target.bill.status = target.bill.outstandingAmount <= 0.01 ? 'PAID' : 'PARTIALLY_PAID';
      target.bill.updatedAt = now;
      totalAllocatedToBills = roundMoney(totalAllocatedToBills + target.amount);
      allocatedBillsSummary.push({
        billId: target.bill.id,
        billNumber: target.bill.billNumber,
        allocatedAmount: target.amount,
      });
    }

    const nextPayable = Math.max(
      0,
      roundMoney((supplier.outstandingBalance ?? supplier.currentPayableBalance ?? 0) - cleanAmount)
    );
    supplier.outstandingBalance = nextPayable;
    supplier.currentPayableBalance = nextPayable;

    const paymentNumber = `SPAY-2026-${String(this.supplierPayments.length + 1).padStart(4, '0')}`;
    const isAdvance = Boolean(params.isAdvance || allocatedBillsSummary.length === 0);
    const primaryBill = allocationTargets[0]?.bill;

    const newPayment: SupplierPayment = {
      id: `spay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      paymentNumber,
      organizationId: targetOrg,
      branchId: targetBranch,
      supplierId: params.supplierId,
      supplierName: supplier.name,
      supplierBillId: primaryBill?.id,
      billNumber:
        allocatedBillsSummary.length > 1
          ? allocatedBillsSummary.map((b) => b.billNumber).join(', ')
          : primaryBill?.billNumber || (isAdvance ? 'ADVANCE' : undefined),
      amount: cleanAmount,
      paymentMethod: params.paymentMethod,
      bankAccountId: params.bankAccountId,
      bankAccountName,
      paymentDate: today,
      referenceNumber: params.referenceNumber || `REF-${Date.now().toString().slice(-6)}`,
      notes: params.notes,
      allocatedBills: allocatedBillsSummary,
      isAdvance,
      status: 'COMPLETED',
      createdBy: params.paidBy,
      createdByName: params.paidByName || this.activeUser?.name || 'Staff User',
      createdAt: now,
    };

    this.supplierPayments.unshift(newPayment);
    this.postAutomatedJournal({
      organizationId: newPayment.organizationId,
      branchId: newPayment.branchId,
      entryDate: newPayment.paymentDate,
      sourceType: 'SUPPLIER_PAYMENT',
      sourceId: newPayment.id,
      sourceNumber: newPayment.paymentNumber,
      referenceNumber: newPayment.referenceNumber,
      narration: `Supplier Payment ${newPayment.paymentNumber} to ${newPayment.supplierName} (${newPayment.billNumber || 'Advance'})`,
      idempotencyKey: `gl_spay_${newPayment.id}`,
      lines: buildSupplierPaymentLines(newPayment, this.getChartOfAccounts(newPayment.organizationId)),
    });

    this.logFinancialAudit({
      organizationId: newPayment.organizationId,
      branchId: newPayment.branchId,
      module: 'PURCHASES',
      action: 'SUPPLIER_PAYMENT_RECORDED',
      entityType: 'SupplierPayment',
      entityId: newPayment.id,
      entityNumber: newPayment.paymentNumber,
      summary: `Paid ₹${cleanAmount.toFixed(2)} to ${supplier.name} via ${params.paymentMethod} (${newPayment.billNumber || 'Advance'})`,
    });

    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Supplier payment',
      { eventType: 'SUPPLIER_PAYMENT_UPSERTED', entityId: newPayment.id, payload: newPayment },
      async () => {
        for (const t of allocationTargets) {
          const billRes = await saveSupplierBillToSupabase(t.bill);
          if (!billRes.success) return billRes;
        }
        return saveSupplierPaymentToSupabase(newPayment);
      }
    );

    return { success: true, payment: newPayment };
  }

  public reverseSupplierPayment(
    paymentId: string,
    reason: string
  ): { success: boolean; payment?: SupplierPayment; error?: string } {
    if (this.isAuthenticatedState && !hasPermission(this.activeUser, 'SUPPLIER_BILLS_MANAGE')) {
      return { success: false, error: 'Access Denied: Not authorized to reverse supplier payments.' };
    }
    const payment = this.supplierPayments.find((p) => p.id === paymentId);
    if (!payment) return { success: false, error: 'Supplier payment not found.' };
    if (payment.status === 'REVERSED') return { success: false, error: 'Supplier payment is already reversed.' };
    if (!reason.trim()) return { success: false, error: 'Reversal reason is required.' };

    const now = new Date().toISOString();
    if (payment.bankAccountId) {
      const bankRev = this.recordBankTransaction({
        bankAccountId: payment.bankAccountId,
        type: 'DEPOSIT',
        amount: payment.amount,
        referenceNumber: `REV-${payment.paymentNumber}`,
        description: `Reversal of supplier payment ${payment.paymentNumber}: ${reason.trim()}`,
        category: 'Payment Reversal',
        payeePayer: payment.supplierName,
        initiatedBy: this.activeUser?.id,
        orgId: payment.organizationId,
        branchId: payment.branchId,
        skipGlPosting: true,
      });
      if (!bankRev.success) {
        return { success: false, error: `Bank reversal failed: ${bankRev.error}` };
      }
    }

    const touchedBills: SupplierBill[] = [];
    const allocs = payment.allocatedBills?.length
      ? payment.allocatedBills
      : payment.supplierBillId
        ? [{ billId: payment.supplierBillId, billNumber: payment.billNumber || '', allocatedAmount: payment.amount }]
        : [];

    for (const a of allocs) {
      const bill = this.getSupplierBillById(a.billId);
      if (bill) {
        bill.paidAmount = Math.max(0, roundMoney(bill.paidAmount - a.allocatedAmount));
        bill.outstandingAmount = roundMoney(bill.totalAmount - bill.paidAmount);
        bill.status = bill.paidAmount <= 0.01 ? 'PENDING' : bill.outstandingAmount <= 0.01 ? 'PAID' : 'PARTIALLY_PAID';
        bill.updatedAt = now;
        touchedBills.push(bill);
      }
    }

    const supplier = this.suppliers.find((s) => s.id === payment.supplierId);
    if (supplier) {
      const nextPayable = roundMoney((supplier.outstandingBalance ?? supplier.currentPayableBalance ?? 0) + payment.amount);
      supplier.outstandingBalance = nextPayable;
      supplier.currentPayableBalance = nextPayable;
    }

    const origJournal = this.journalEntries.find((j) => j.sourceId === payment.id);
    if (origJournal && origJournal.lines.length > 0) {
      this.postAutomatedJournal({
        organizationId: payment.organizationId,
        branchId: payment.branchId,
        entryDate: now.slice(0, 10),
        sourceType: 'SUPPLIER_PAYMENT_REVERSAL',
        sourceId: `${payment.id}_rev`,
        sourceNumber: `REV-${payment.paymentNumber}`,
        referenceNumber: payment.paymentNumber,
        narration: `Reversal of supplier payment ${payment.paymentNumber}: ${reason.trim()}`,
        idempotencyKey: `gl_rev_${payment.id}`,
        lines: buildReversalJournalLines(origJournal.lines, reason.trim()),
      });
    }

    payment.status = 'REVERSED';
    payment.reversalReason = reason.trim();
    payment.reversedAt = now;
    payment.reversedBy = this.activeUser?.name || 'Manager';

    this.logFinancialAudit({
      organizationId: payment.organizationId,
      branchId: payment.branchId,
      module: 'PURCHASES',
      action: 'SUPPLIER_PAYMENT_REVERSED',
      entityType: 'SupplierPayment',
      entityId: payment.id,
      entityNumber: payment.paymentNumber,
      summary: `Reversed payment ${payment.paymentNumber} (₹${payment.amount.toFixed(2)}) for ${payment.supplierName}: ${reason.trim()}`,
    });

    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Supplier payment reversal',
      { eventType: 'SUPPLIER_PAYMENT_REVERSED', entityId: payment.id, payload: payment },
      async () => {
        for (const b of touchedBills) {
          await saveSupplierBillToSupabase(b);
        }
        return saveSupplierPaymentToSupabase(payment);
      }
    );

    return { success: true, payment };
  }

  // ==========================================================================
  // --- DEBIT NOTES & PURCHASE RETURNS ---
  // ==========================================================================

  public getDebitNotes(orgId?: string): DebitNote[] {
    const targetOrg = orgId || this.organization.id;
    return this.debitNotes
      .filter((dn) => dn.organizationId === targetOrg)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  private buildComputedDebitNote(params: {
    supplierId: string;
    supplierBillId?: string;
    reason: string;
    items: Array<{
      productId: string;
      productName?: string;
      quantity: number;
      unitPrice: number;
      gstRate: number;
    }>;
    deductInventory?: boolean;
    notes?: string;
    status: DebitNote['status'];
    orgId?: string;
    branchId?: string;
  }): { success: boolean; debitNote?: DebitNote; error?: string } {
    const supplier = this.suppliers.find((s) => s.id === params.supplierId);
    if (!supplier) return { success: false, error: 'Supplier not found' };
    if (!params.items || params.items.length === 0) {
      return { success: false, error: 'At least one return line item is required' };
    }
    if (params.items.some((i) => !Number.isFinite(i.quantity) || i.quantity <= 0 || !Number.isFinite(i.unitPrice) || i.unitPrice < 0)) {
      return { success: false, error: 'Each return item must have a positive quantity and valid unit price' };
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const targetOrg = params.orgId || this.organization.id;
    const targetBranch = this.resolveOperationalBranchId(params.branchId);
    const linkedBill = params.supplierBillId ? this.getSupplierBillById(params.supplierBillId) : undefined;

    let taxableTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let totalAmount = 0;

    const computedItems: DebitNoteItem[] = params.items.map((item, idx) => {
      const prod = this.products.find((p) => p.id === item.productId);
      const taxable = roundMoney(item.quantity * item.unitPrice);
      const cgst = roundMoney((taxable * (item.gstRate / 2)) / 100);
      const sgst = roundMoney((taxable * (item.gstRate / 2)) / 100);
      const lineTotal = roundMoney(taxable + cgst + sgst);

      taxableTotal = roundMoney(taxableTotal + taxable);
      cgstTotal = roundMoney(cgstTotal + cgst);
      sgstTotal = roundMoney(sgstTotal + sgst);
      totalAmount = roundMoney(totalAmount + lineTotal);

      return {
        id: `dni_${Date.now()}_${idx}`,
        productId: item.productId,
        productName: item.productName || prod?.name || 'Item',
        sku: prod?.sku,
        hsn: prod?.hsn,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        gstRate: item.gstRate,
        taxableAmount: taxable,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: 0,
        total: lineTotal,
      };
    });

    const dnNumber = `DN-2026-${String(this.debitNotes.length + 1).padStart(4, '0')}`;
    const debitNote: DebitNote = {
      id: `dn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      debitNoteNumber: dnNumber,
      organizationId: targetOrg,
      branchId: targetBranch,
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierGstin: supplier.gstin,
      supplierBillId: linkedBill?.id,
      billNumber: linkedBill?.billNumber,
      issueDate: today,
      reason: params.reason,
      status: params.status,
      items: computedItems,
      taxableTotal,
      cgstTotal,
      sgstTotal,
      igstTotal: 0,
      totalAmount,
      deductInventory: params.deductInventory !== false,
      notes: params.notes,
      createdBy: this.activeUser?.id || 'usr_system',
      createdByName: this.activeUser?.name || 'Accounts Officer',
      createdAt: now,
    };

    return { success: true, debitNote };
  }

  private applyDebitNoteInventoryAndApPosting(debitNote: DebitNote): void {
    const now = new Date().toISOString();
    const today = debitNote.issueDate || now.slice(0, 10);
    const supplier = this.suppliers.find((s) => s.id === debitNote.supplierId);
    const linkedBill = debitNote.supplierBillId ? this.getSupplierBillById(debitNote.supplierBillId) : undefined;

    if (debitNote.deductInventory !== false) {
      debitNote.items.forEach((item, idx) => {
        const prod = this.products.find((p) => p.id === item.productId);
        if (prod) {
          const prev = prod.currentStock;
          prod.currentStock = Math.max(0, prev - item.quantity);
          prod.stockLevel = prod.currentStock;
          prod.updatedAt = now;
          this.stockMovements.unshift({
            id: `sm_dn_${Date.now()}_${idx}`,
            organizationId: debitNote.organizationId,
            branchId: debitNote.branchId,
            productId: prod.id,
            productName: prod.name,
            sku: prod.sku,
            type: 'RETURN',
            quantityChange: -item.quantity,
            previousStock: prev,
            newStock: prod.currentStock,
            newBalance: prod.currentStock,
            referenceId: debitNote.debitNoteNumber,
            notes: `Purchase return to ${debitNote.supplierName}: ${debitNote.reason}`,
            performedBy: this.getActiveUser().name,
            timestamp: now,
          });
        }
      });
    }

    if (supplier) {
      supplier.currentPayableBalance = Math.max(0, roundMoney((supplier.currentPayableBalance || 0) - debitNote.totalAmount));
      supplier.outstandingBalance = Math.max(0, roundMoney((supplier.outstandingBalance || 0) - debitNote.totalAmount));
    }
    if (linkedBill) {
      linkedBill.outstandingAmount = Math.max(0, roundMoney(linkedBill.outstandingAmount - debitNote.totalAmount));
      linkedBill.status = linkedBill.outstandingAmount <= 0.01 ? 'PAID' : linkedBill.paidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING';
      linkedBill.updatedAt = now;
    }

    const posting = this.postAutomatedJournal({
      organizationId: debitNote.organizationId,
      branchId: debitNote.branchId,
      entryDate: today,
      sourceType: 'DEBIT_NOTE',
      sourceId: debitNote.id,
      sourceNumber: debitNote.debitNoteNumber,
      referenceNumber: linkedBill?.billNumber || debitNote.debitNoteNumber,
      narration: `Purchase Return / Debit Note ${debitNote.debitNoteNumber} — ${debitNote.supplierName}: ${debitNote.reason}`,
      idempotencyKey: `gl_dn_${debitNote.id}`,
      lines: buildDebitNoteLines(debitNote, this.getChartOfAccounts(debitNote.organizationId)),
    });

    if (posting.journalEntry) {
      debitNote.journalEntryId = posting.journalEntry.id;
      debitNote.journalNumber = posting.journalEntry.journalNumber;
    }
  }

  public createDebitNoteDraft(params: {
    supplierId: string;
    supplierBillId?: string;
    reason: string;
    items: Array<{ productId: string; productName?: string; quantity: number; unitPrice: number; gstRate: number }>;
    deductInventory?: boolean;
    notes?: string;
    orgId?: string;
    branchId?: string;
  }): { success: boolean; debitNote?: DebitNote; error?: string } {
    if (this.isAuthenticatedState && !hasPermission(this.activeUser, 'DEBIT_NOTES_MANAGE')) {
      return { success: false, error: 'Access Denied: Not authorized to manage debit notes.' };
    }
    const built = this.buildComputedDebitNote({ ...params, status: 'DRAFT' });
    if (!built.success || !built.debitNote) return built;

    const debitNote = built.debitNote;
    this.debitNotes.unshift(debitNote);
    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Debit Note draft',
      { eventType: 'DEBIT_NOTE_UPSERTED', entityId: debitNote.id, payload: debitNote },
      () => syncDebitNoteToSupabase(debitNote)
    );

    return { success: true, debitNote };
  }

  public approveDebitNote(debitNoteId: string): { success: boolean; debitNote?: DebitNote; error?: string } {
    if (this.isAuthenticatedState && !hasPermission(this.activeUser, 'DEBIT_NOTES_MANAGE')) {
      return { success: false, error: 'Access Denied: Not authorized to approve debit notes.' };
    }
    const dn = this.debitNotes.find((d) => d.id === debitNoteId);
    if (!dn) return { success: false, error: 'Debit Note not found.' };
    if (dn.status !== 'DRAFT') return { success: false, error: `Cannot approve Debit Note in status ${dn.status}.` };

    const now = new Date().toISOString();
    dn.status = 'APPROVED';
    dn.approvedBy = this.activeUser?.id || 'usr_system';
    dn.approvedByName = this.activeUser?.name || 'Manager';
    dn.approvedAt = now;

    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Debit Note approval',
      { eventType: 'DEBIT_NOTE_UPSERTED', entityId: dn.id, payload: dn },
      () => approveDebitNoteInSupabase(dn.id)
    );

    return { success: true, debitNote: dn };
  }

  public issueDebitNote(debitNoteId: string): { success: boolean; debitNote?: DebitNote; error?: string } {
    if (this.isAuthenticatedState && !hasPermission(this.activeUser, 'DEBIT_NOTES_MANAGE')) {
      return { success: false, error: 'Access Denied: Not authorized to issue debit notes.' };
    }
    const dn = this.debitNotes.find((d) => d.id === debitNoteId);
    if (!dn) return { success: false, error: 'Debit Note not found.' };
    if (dn.status === 'ISSUED' || dn.status === 'CANCELLED') {
      return { success: false, error: `Debit Note is already ${dn.status}.` };
    }

    dn.status = 'ISSUED';
    dn.issueDate = new Date().toISOString().slice(0, 10);
    this.applyDebitNoteInventoryAndApPosting(dn);

    const linkedBill = dn.supplierBillId ? this.getSupplierBillById(dn.supplierBillId) : undefined;
    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Debit Note issuance',
      { eventType: 'DEBIT_NOTE_UPSERTED', entityId: dn.id, payload: dn },
      async () => {
        const res = await syncDebitNoteToSupabase(dn);
        if (!res.success) return res;
        if (linkedBill) {
          await saveSupplierBillToSupabase(linkedBill);
        }
        return { success: true };
      }
    );

    return { success: true, debitNote: dn };
  }

  public cancelDebitNote(debitNoteId: string, reason: string): { success: boolean; debitNote?: DebitNote; error?: string } {
    if (this.isAuthenticatedState && !hasPermission(this.activeUser, 'DEBIT_NOTES_MANAGE')) {
      return { success: false, error: 'Access Denied: Not authorized to cancel debit notes.' };
    }
    const dn = this.debitNotes.find((d) => d.id === debitNoteId);
    if (!dn) return { success: false, error: 'Debit Note not found.' };
    if (dn.status === 'CANCELLED') return { success: false, error: 'Debit Note is already cancelled.' };
    if (!reason.trim()) return { success: false, error: 'Cancellation reason is required.' };

    const wasIssued = dn.status === 'ISSUED';
    const now = new Date().toISOString();
    const linkedBill = dn.supplierBillId ? this.getSupplierBillById(dn.supplierBillId) : undefined;

    if (wasIssued) {
      if (dn.deductInventory !== false) {
        dn.items.forEach((item, idx) => {
          const prod = this.products.find((p) => p.id === item.productId);
          if (prod) {
            const prev = prod.currentStock;
            prod.currentStock = prev + item.quantity;
            prod.stockLevel = prod.currentStock;
            prod.updatedAt = now;
            this.stockMovements.unshift({
              id: `sm_dn_rev_${Date.now()}_${idx}`,
              organizationId: dn.organizationId,
              branchId: dn.branchId,
              productId: prod.id,
              productName: prod.name,
              sku: prod.sku,
              type: 'ADJUSTMENT',
              quantityChange: item.quantity,
              previousStock: prev,
              newStock: prod.currentStock,
              newBalance: prod.currentStock,
              referenceId: `CANCEL-${dn.debitNoteNumber}`,
              notes: `Reversed purchase return ${dn.debitNoteNumber}: ${reason.trim()}`,
              performedBy: this.getActiveUser().name,
              timestamp: now,
            });
          }
        });
      }

      const supplier = this.suppliers.find((s) => s.id === dn.supplierId);
      if (supplier) {
        supplier.currentPayableBalance = roundMoney((supplier.currentPayableBalance || 0) + dn.totalAmount);
        supplier.outstandingBalance = roundMoney((supplier.outstandingBalance || 0) + dn.totalAmount);
      }
      if (linkedBill) {
        linkedBill.outstandingAmount = roundMoney(Math.min(linkedBill.totalAmount - linkedBill.paidAmount, linkedBill.outstandingAmount + dn.totalAmount));
        linkedBill.status = linkedBill.outstandingAmount <= 0.01 ? 'PAID' : linkedBill.paidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING';
        linkedBill.updatedAt = now;
      }

      const origJournal = dn.journalEntryId
        ? this.journalEntries.find((j) => j.id === dn.journalEntryId)
        : this.journalEntries.find((j) => j.sourceId === dn.id);
      if (origJournal && origJournal.lines.length > 0) {
        this.postAutomatedJournal({
          organizationId: dn.organizationId,
          branchId: dn.branchId,
          entryDate: now.slice(0, 10),
          sourceType: 'DEBIT_NOTE_REVERSAL',
          sourceId: `${dn.id}_rev`,
          sourceNumber: `REV-${dn.debitNoteNumber}`,
          referenceNumber: dn.debitNoteNumber,
          narration: `Cancellation of Debit Note ${dn.debitNoteNumber}: ${reason.trim()}`,
          idempotencyKey: `gl_rev_${dn.id}`,
          lines: buildReversalJournalLines(origJournal.lines, reason.trim()),
        });
      }
    }

    dn.status = 'CANCELLED';
    dn.cancelledBy = this.activeUser?.name || 'Manager';
    dn.cancelledAt = now;
    dn.cancelReason = reason.trim();

    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Debit Note cancellation',
      { eventType: 'DEBIT_NOTE_UPSERTED', entityId: dn.id, payload: dn },
      async () => {
        const res = await cancelDebitNoteInSupabase(dn.id, reason.trim());
        if (!res.success) return res;
        if (linkedBill) {
          await saveSupplierBillToSupabase(linkedBill);
        }
        return { success: true };
      }
    );

    return { success: true, debitNote: dn };
  }

  public createAndIssueDebitNote(params: {
    supplierId: string;
    supplierBillId?: string;
    reason: string;
    items: Array<{
      productId: string;
      productName?: string;
      quantity: number;
      unitPrice: number;
      gstRate: number;
    }>;
    deductInventory?: boolean;
    notes?: string;
    orgId?: string;
    branchId?: string;
  }): { success: boolean; debitNote?: DebitNote; error?: string } {
    if (this.isAuthenticatedState && !hasPermission(this.activeUser, 'DEBIT_NOTES_MANAGE')) {
      return { success: false, error: 'Access Denied: Not authorized to create debit notes.' };
    }
    const built = this.buildComputedDebitNote({ ...params, status: 'ISSUED' });
    if (!built.success || !built.debitNote) return built;

    const debitNote = built.debitNote;
    this.applyDebitNoteInventoryAndApPosting(debitNote);
    this.debitNotes.unshift(debitNote);

    const linkedBill = debitNote.supplierBillId ? this.getSupplierBillById(debitNote.supplierBillId) : undefined;
    this.saveToStorage();
    this.notify();

    this.runCloudMutation(
      'Debit Note',
      { eventType: 'DEBIT_NOTE_UPSERTED', entityId: debitNote.id, payload: debitNote },
      async () => {
        const res = await syncDebitNoteToSupabase(debitNote);
        if (!res.success) return res;
        if (linkedBill) {
          await saveSupplierBillToSupabase(linkedBill);
        }
        return { success: true };
      }
    );

    return { success: true, debitNote };
  }

  // ==========================================================================
  // --- DOUBLE-ENTRY ACCOUNTING ENGINE (COA, JOURNALS, GL, REPORTS) ---
  // ==========================================================================

  private ensureAccountingDefaults(orgId: string): void {
    const targetOrg = orgId || this.organization.id;
    if (!targetOrg) return;
    const hasCoa = this.chartOfAccounts.some((a) => a.organizationId === targetOrg);
    if (!hasCoa) {
      this.chartOfAccounts.push(...createDefaultChartOfAccounts(targetOrg));
    }
    const hasPeriod = this.accountingPeriods.some((p) => p.organizationId === targetOrg);
    if (!hasPeriod) {
      this.accountingPeriods.push(
        {
          id: `per_${targetOrg}_2025_26`,
          organizationId: targetOrg,
          fiscalYear: '2025-2026',
          name: 'FY 2025–2026 (Apr 2025 – Mar 2026)',
          startDate: '2025-04-01',
          endDate: '2026-03-31',
          status: 'CLOSED',
          lockedBy: 'System',
          lockedAt: '2026-04-01T00:00:00.000Z',
        },
        {
          id: `per_${targetOrg}_2026_27`,
          organizationId: targetOrg,
          fiscalYear: '2026-2027',
          name: 'FY 2026–2027 (Apr 2026 – Mar 2027)',
          startDate: '2026-04-01',
          endDate: '2027-03-31',
          status: 'OPEN',
        }
      );
    }
  }

  public isDateInLockedPeriod(entryDate: string, orgId?: string): boolean {
    const targetOrg = orgId || this.organization.id;
    this.ensureAccountingDefaults(targetOrg);
    return this.accountingPeriods.some(
      (p) =>
        p.organizationId === targetOrg &&
        (p.status === 'LOCKED' || p.status === 'CLOSED') &&
        entryDate >= p.startDate &&
        entryDate <= p.endDate
    );
  }

  public getAccountingPeriods(orgId?: string): AccountingPeriod[] {
    const targetOrg = orgId || this.organization.id;
    this.ensureAccountingDefaults(targetOrg);
    return this.accountingPeriods.filter((p) => p.organizationId === targetOrg);
  }

  public toggleAccountingPeriodLock(periodId: string, lock: boolean): { success: boolean; period?: AccountingPeriod } {
    if (this.isAuthenticatedState && !hasPermission(this.activeUser, 'FISCAL_MANAGE')) {
      return { success: false };
    }
    const period = this.accountingPeriods.find((p) => p.id === periodId);
    if (!period) return { success: false };
    period.status = lock ? 'LOCKED' : 'OPEN';
    period.lockedBy = lock ? this.getActiveUser().name : undefined;
    period.lockedAt = lock ? new Date().toISOString() : undefined;
    this.logFinancialAudit({
      organizationId: period.organizationId,
      branchId: this.activeBranchId,
      module: 'ACCOUNTING_PERIODS',
      action: lock ? 'PERIOD_LOCKED' : 'PERIOD_REOPENED',
      entityType: 'AccountingPeriod',
      entityId: period.id,
      entityNumber: period.fiscalYear,
      summary: `${lock ? 'Locked' : 'Reopened'} accounting period ${period.name}`,
    });
    this.notify();

    if (this.shouldSyncCloud()) {
      syncAccountingPeriodLockToSupabase({ ...period, lock }).catch((e) =>
        this.recordCloudSyncError('Fiscal period lock sync', e)
      );
    }

    return { success: true, period };
  }

  public bootstrapLedgerFromExistingDocuments(orgId?: string): void {
    const targetOrg = orgId || this.organization.id;
    this.ensureAccountingDefaults(targetOrg);
    const accounts = this.getChartOfAccounts(targetOrg);

    // 1. Opening capital & inventory seed so balance sheet has realistic positive stock/cash/equity
    const bankAccounts = this.bankAccounts.filter((b) => b.organizationId === targetOrg);
    for (const acc of bankAccounts) {
      if (acc.openingBalance > 0) {
        const bankGlAcc = findAccountByCode(
          accounts,
          targetOrg,
          acc.accountType === 'CASH' ? SYSTEM_ACCOUNT_CODES.CASH : SYSTEM_ACCOUNT_CODES.BANK
        );
        const eqAcc = findAccountByCode(accounts, targetOrg, SYSTEM_ACCOUNT_CODES.OWNERS_EQUITY);
        if (bankGlAcc && eqAcc) {
          this.postAutomatedJournal({
            organizationId: targetOrg,
            branchId: acc.branchId || this.activeBranchId,
            entryDate: '2026-04-01',
            sourceType: 'OPENING_BALANCE',
            sourceId: acc.id,
            sourceNumber: `OPEN-${acc.accountNumber.slice(-4)}`,
            narration: `Opening balance for ${acc.accountName} (${acc.bankName})`,
            idempotencyKey: `gl_open_bank_${acc.id}`,
            skipCloudSync: true,
            lines: [
              {
                id: `jl_ob_dr_${acc.id}`,
                accountId: bankGlAcc.id,
                accountCode: bankGlAcc.code,
                accountName: bankGlAcc.name,
                accountClass: bankGlAcc.accountClass,
                debit: roundMoney(acc.openingBalance),
                credit: 0,
                description: `Opening balance ${acc.accountName}`,
              },
              {
                id: `jl_ob_cr_${acc.id}`,
                accountId: eqAcc.id,
                accountCode: eqAcc.code,
                accountName: eqAcc.name,
                accountClass: eqAcc.accountClass,
                debit: 0,
                credit: roundMoney(acc.openingBalance),
                description: `Owner capital opening offset`,
              },
            ],
          });
        }
      }
    }

    // 2. Post existing sales invoices
    for (const sale of this.sales.filter((s) => s.organizationId === targetOrg)) {
      const lines = buildSaleJournalLines(sale, accounts);
      if (lines.length >= 2) {
        this.postAutomatedJournal({
          organizationId: targetOrg,
          branchId: sale.branchId || this.activeBranchId,
          entryDate: (sale.createdAt || new Date().toISOString()).slice(0, 10),
          sourceType: 'SALES_INVOICE',
          sourceId: sale.id,
          sourceNumber: sale.invoiceNumber,
          referenceNumber: sale.receiptNumber,
          narration: `Sales Invoice ${sale.invoiceNumber}${sale.customerName ? ` — ${sale.customerName}` : ''}`,
          idempotencyKey: `gl_sale_${sale.id}`,
          skipCloudSync: true,
          lines,
        });
      }
    }

    // 3. Post existing supplier bills
    for (const bill of this.supplierBills.filter((b) => b.organizationId === targetOrg)) {
      const lines = buildSupplierBillLines(bill, accounts);
      if (lines.length >= 2) {
        this.postAutomatedJournal({
          organizationId: targetOrg,
          branchId: bill.branchId || this.activeBranchId,
          entryDate: bill.billDate || new Date().toISOString().slice(0, 10),
          sourceType: 'PURCHASE_BILL',
          sourceId: bill.id,
          sourceNumber: bill.billNumber,
          referenceNumber: bill.supplierInvoiceNumber,
          narration: `Supplier Bill ${bill.billNumber} — ${bill.supplierName}`,
          idempotencyKey: `gl_bill_${bill.id}`,
          skipCloudSync: true,
          lines,
        });
      }
    }

    // 4. Post existing supplier payments
    for (const pay of this.supplierPayments.filter((p) => p.organizationId === targetOrg)) {
      const lines = buildSupplierPaymentLines(pay, accounts);
      if (lines.length >= 2) {
        this.postAutomatedJournal({
          organizationId: targetOrg,
          branchId: pay.branchId || this.activeBranchId,
          entryDate: pay.paymentDate || new Date().toISOString().slice(0, 10),
          sourceType: 'SUPPLIER_PAYMENT',
          sourceId: pay.id,
          sourceNumber: pay.paymentNumber,
          referenceNumber: pay.referenceNumber,
          narration: `Supplier Payment ${pay.paymentNumber} — ${pay.supplierName}`,
          idempotencyKey: `gl_spay_${pay.id}`,
          skipCloudSync: true,
          lines,
        });
      }
    }

    // 5. Post existing expenses
    for (const exp of this.expenses.filter((e) => e.organizationId === targetOrg)) {
      const lines = buildExpenseJournalLines(exp, accounts);
      if (lines.length >= 2) {
        this.postAutomatedJournal({
          organizationId: targetOrg,
          branchId: exp.branchId || this.activeBranchId,
          entryDate: exp.date || new Date().toISOString().slice(0, 10),
          sourceType: 'EXPENSE',
          sourceId: exp.id,
          sourceNumber: exp.invoiceRef || exp.id,
          referenceNumber: exp.invoiceRef,
          narration: `Operating Expense (${exp.category}) — ${exp.vendor}`,
          idempotencyKey: `gl_exp_${exp.id}`,
          skipCloudSync: true,
          lines,
        });
      }
    }

    // 6. Post issued credit notes
    for (const cn of this.creditNotes.filter((c) => c.organizationId === targetOrg && c.status === 'ISSUED')) {
      const lines = buildCreditNoteLines(cn, accounts, (pid) => this.products.find((p) => p.id === pid)?.costPrice || 0);
      if (lines.length >= 2) {
        this.postAutomatedJournal({
          organizationId: targetOrg,
          branchId: cn.branchId || this.activeBranchId,
          entryDate: cn.issueDate || cn.date || new Date().toISOString().slice(0, 10),
          sourceType: 'CREDIT_NOTE',
          sourceId: cn.id,
          sourceNumber: cn.creditNoteNumber,
          referenceNumber: cn.invoiceNumber,
          narration: `Credit Note ${cn.creditNoteNumber} — ${cn.customerName}`,
          idempotencyKey: `gl_cn_${cn.id}`,
          skipCloudSync: true,
          lines,
        });
      }
    }

    // 7. Post completed customer receipts
    for (const rcpt of this.customerReceipts.filter((r) => r.organizationId === targetOrg && r.status === 'COMPLETED')) {
      const lines = buildCustomerPaymentLines({
        organizationId: targetOrg,
        customerId: rcpt.customerId,
        customerName: rcpt.customerName,
        amount: rcpt.amount,
        allocatedToInvoices: rcpt.allocatedAmount,
        unallocatedAdvance: rcpt.unallocatedAdvance,
        method: rcpt.paymentMethod,
        reference: rcpt.receiptNumber,
        accounts,
      });
      if (lines.length >= 2) {
        this.postAutomatedJournal({
          organizationId: targetOrg,
          branchId: rcpt.branchId || this.activeBranchId,
          entryDate: rcpt.receiptDate || new Date().toISOString().slice(0, 10),
          sourceType: 'CUSTOMER_PAYMENT',
          sourceId: rcpt.id,
          sourceNumber: rcpt.receiptNumber,
          referenceNumber: rcpt.referenceNumber,
          narration: `Customer receipt ${rcpt.receiptNumber} — ${rcpt.customerName}`,
          idempotencyKey: `gl_${rcpt.id}`,
          skipCloudSync: true,
          lines,
        });
      }
    }

    // 8. Post issued debit notes
    for (const dn of this.debitNotes.filter((d) => d.organizationId === targetOrg && d.status === 'ISSUED')) {
      const lines = buildDebitNoteLines(dn, accounts);
      if (lines.length >= 2) {
        this.postAutomatedJournal({
          organizationId: targetOrg,
          branchId: dn.branchId || this.activeBranchId,
          entryDate: dn.issueDate || new Date().toISOString().slice(0, 10),
          sourceType: 'DEBIT_NOTE',
          sourceId: dn.id,
          sourceNumber: dn.debitNoteNumber,
          referenceNumber: dn.billNumber,
          narration: `Debit Note ${dn.debitNoteNumber} — ${dn.supplierName}`,
          idempotencyKey: `gl_dn_${dn.id}`,
          skipCloudSync: true,
          lines,
        });
      }
    }
  }

  public getChartOfAccounts(orgId?: string): ChartOfAccount[] {
    const targetOrg = orgId || this.organization.id;
    this.ensureAccountingDefaults(targetOrg);
    const orgAccounts = this.chartOfAccounts.filter((a) => a.organizationId === targetOrg);
    const orgGl = this.generalLedger.filter((g) => g.organizationId === targetOrg);
    return recalculateAccountBalances(orgAccounts, orgGl).sort((a, b) => a.code.localeCompare(b.code));
  }

  public createChartAccount(params: {
    code: string;
    name: string;
    accountClass: AccountClass;
    accountGroup: string;
    parentAccountId?: string;
    branchId?: string;
    openingBalance?: number;
    taxApplicable?: boolean;
    description?: string;
    organizationId?: string;
  }): { success: boolean; account?: ChartOfAccount; error?: string } {
    const targetOrg = params.organizationId || this.organization.id;
    this.ensureAccountingDefaults(targetOrg);
    const cleanCode = params.code.trim();
    const cleanName = params.name.trim();
    if (!cleanCode || !cleanName) {
      return { success: false, error: 'Account code and name are required.' };
    }
    if (this.chartOfAccounts.some((a) => a.organizationId === targetOrg && a.code === cleanCode)) {
      return { success: false, error: `Account code ${cleanCode} already exists in this organization.` };
    }

    const parent = params.parentAccountId
      ? this.chartOfAccounts.find((a) => a.id === params.parentAccountId)
      : undefined;
    const now = new Date().toISOString();
    const newAccount: ChartOfAccount = {
      id: `coa_${targetOrg}_${cleanCode}_${Date.now().toString(36)}`,
      organizationId: targetOrg,
      branchId: params.branchId || 'ALL',
      code: cleanCode,
      name: cleanName,
      accountClass: params.accountClass,
      accountGroup: params.accountGroup.trim() || params.accountClass,
      parentAccountId: parent?.id,
      parentCode: parent?.code,
      normalBalance: getNormalBalanceSide(params.accountClass),
      openingBalance: roundMoney(params.openingBalance || 0),
      currentBalance: roundMoney(params.openingBalance || 0),
      taxApplicable: Boolean(params.taxApplicable),
      isSystem: false,
      isActive: true,
      description: params.description?.trim(),
      createdAt: now,
      updatedAt: now,
    };

    this.chartOfAccounts.push(newAccount);
    this.logFinancialAudit({
      organizationId: targetOrg,
      branchId: this.activeBranchId,
      module: 'CHART_OF_ACCOUNTS',
      action: 'ACCOUNT_CREATED',
      entityType: 'ChartOfAccount',
      entityId: newAccount.id,
      entityNumber: newAccount.code,
      summary: `Created account ${newAccount.code} — ${newAccount.name} (${newAccount.accountClass})`,
    });
    this.notify();

    if (this.shouldSyncCloud()) {
      syncChartOfAccountToSupabase(newAccount).catch((e) => console.warn('Supabase COA create sync error:', e));
    }

    return { success: true, account: newAccount };
  }

  public updateChartAccount(
    accountId: string,
    updates: Partial<Pick<ChartOfAccount, 'code' | 'name' | 'accountGroup' | 'parentAccountId' | 'branchId' | 'taxApplicable' | 'description' | 'isActive'>>
  ): { success: boolean; account?: ChartOfAccount; error?: string } {
    const idx = this.chartOfAccounts.findIndex((a) => a.id === accountId);
    if (idx === -1) return { success: false, error: 'Account not found.' };
    const current = this.chartOfAccounts[idx];

    if (updates.code && updates.code !== current.code) {
      if (this.chartOfAccounts.some((a) => a.organizationId === current.organizationId && a.code === updates.code && a.id !== accountId)) {
        return { success: false, error: `Account code ${updates.code} is already in use.` };
      }
    }

    const updated: ChartOfAccount = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.chartOfAccounts[idx] = updated;
    this.logFinancialAudit({
      organizationId: current.organizationId,
      branchId: this.activeBranchId,
      module: 'CHART_OF_ACCOUNTS',
      action: 'ACCOUNT_UPDATED',
      entityType: 'ChartOfAccount',
      entityId: updated.id,
      entityNumber: updated.code,
      summary: `Updated account ${updated.code} — ${updated.name}`,
    });
    this.notify();

    if (this.shouldSyncCloud()) {
      syncChartOfAccountToSupabase(updated).catch((e) => console.warn('Supabase COA update sync error:', e));
    }

    return { success: true, account: updated };
  }

  public deleteChartAccount(accountId: string): { success: boolean; error?: string } {
    const acc = this.chartOfAccounts.find((a) => a.id === accountId);
    if (!acc) return { success: false, error: 'Account not found.' };
    if (acc.isSystem) {
      return { success: false, error: 'System control accounts cannot be deleted. Deactivate instead if unused.' };
    }
    const hasPostedTx = this.generalLedger.some((g) => g.accountId === accountId);
    if (hasPostedTx) {
      return {
        success: false,
        error: `Account "${acc.code} ${acc.name}" has posted General Ledger transactions and cannot be deleted. Deactivate or migrate its balance instead.`,
      };
    }
    const hasChildren = this.chartOfAccounts.some((a) => a.parentAccountId === accountId);
    if (hasChildren) {
      return { success: false, error: 'Account has child sub-accounts. Reassign child accounts first.' };
    }

    this.chartOfAccounts = this.chartOfAccounts.filter((a) => a.id !== accountId);
    this.logFinancialAudit({
      organizationId: acc.organizationId,
      branchId: this.activeBranchId,
      module: 'CHART_OF_ACCOUNTS',
      action: 'ACCOUNT_DELETED',
      entityType: 'ChartOfAccount',
      entityId: acc.id,
      entityNumber: acc.code,
      summary: `Deleted unused account ${acc.code} — ${acc.name}`,
    });
    this.notify();

    if (this.shouldSyncCloud()) {
      deleteChartOfAccountInSupabase(accountId).catch((e) => console.warn('Supabase COA delete sync error:', e));
    }

    return { success: true };
  }

  public deactivateChartAccount(
    accountId: string,
    migrateToAccountId?: string
  ): { success: boolean; migrationJournal?: JournalEntry; error?: string } {
    const accounts = this.getChartOfAccounts();
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return { success: false, error: 'Account not found.' };
    if (acc.isSystem) {
      return { success: false, error: 'System control accounts must remain active for automated postings.' };
    }

    let migrationJournal: JournalEntry | undefined;
    if (Math.abs(acc.currentBalance) > 0.01) {
      if (!migrateToAccountId) {
        return {
          success: false,
          error: `Account has a non-zero balance (₹${acc.currentBalance.toFixed(2)}). Select a target account to migrate the balance before deactivation.`,
        };
      }
      const target = accounts.find((a) => a.id === migrateToAccountId && a.isActive);
      if (!target) return { success: false, error: 'Migration target account must be active.' };

      const amount = Math.abs(acc.currentBalance);
      const isDebitBal =
        (acc.normalBalance === 'DEBIT' && acc.currentBalance > 0) ||
        (acc.normalBalance === 'CREDIT' && acc.currentBalance < 0);

      const postRes = this.postAutomatedJournal({
        organizationId: acc.organizationId,
        branchId: this.activeBranchId,
        entryDate: new Date().toISOString().slice(0, 10),
        sourceType: 'MANUAL_JOURNAL',
        sourceId: `mig_${acc.id}_${Date.now()}`,
        sourceNumber: `MIG-${acc.code}`,
        narration: `Balance migration from ${acc.code} ${acc.name} to ${target.code} ${target.name} prior to deactivation`,
        idempotencyKey: `gl_mig_${acc.id}_${Date.now()}`,
        lines: [
          {
            id: `jl_mig_1_${Date.now()}`,
            accountId: target.id,
            accountCode: target.code,
            accountName: target.name,
            accountClass: target.accountClass,
            debit: isDebitBal ? amount : 0,
            credit: isDebitBal ? 0 : amount,
            description: `Migrated balance from ${acc.code} ${acc.name}`,
          },
          {
            id: `jl_mig_2_${Date.now()}`,
            accountId: acc.id,
            accountCode: acc.code,
            accountName: acc.name,
            accountClass: acc.accountClass,
            debit: isDebitBal ? 0 : amount,
            credit: isDebitBal ? amount : 0,
            description: `Zeroing balance for deactivation`,
          },
        ],
      });
      if (!postRes.success) return { success: false, error: postRes.error };
      migrationJournal = postRes.journalEntry;
    }

    const rawIdx = this.chartOfAccounts.findIndex((a) => a.id === accountId);
    if (rawIdx >= 0) {
      this.chartOfAccounts[rawIdx].isActive = false;
      this.chartOfAccounts[rawIdx].updatedAt = new Date().toISOString();
    }
    this.notify();

    if (this.shouldSyncCloud() && rawIdx >= 0) {
      syncChartOfAccountToSupabase(this.chartOfAccounts[rawIdx]).catch((e) =>
        console.warn('Supabase COA deactivate sync error:', e)
      );
    }

    return { success: true, migrationJournal };
  }

  public getJournalEntries(orgId?: string): JournalEntry[] {
    const targetOrg = orgId || this.organization.id;
    return this.journalEntries
      .filter((j) => j.organizationId === targetOrg)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getJournalEntryById(id: string): JournalEntry | undefined {
    return this.journalEntries.find((j) => j.id === id);
  }

  public postAutomatedJournal(params: {
    organizationId: string;
    branchId: string;
    entryDate: string;
    sourceType: AccountingSourceType;
    sourceId: string;
    sourceNumber?: string;
    referenceNumber?: string;
    narration: string;
    idempotencyKey: string;
    skipCloudSync?: boolean;
    lines: JournalEntryLine[];
  }): { success: boolean; journalEntry?: JournalEntry; deduplicated?: boolean; error?: string } {
    this.ensureAccountingDefaults(params.organizationId);

    // Idempotency check — never duplicate a GL posting
    const existing = this.postingRecords.find(
      (r) => r.organizationId === params.organizationId && r.idempotencyKey === params.idempotencyKey
    );
    if (existing) {
      const existingEntry = this.journalEntries.find((j) => j.id === existing.journalEntryId);
      return { success: true, journalEntry: existingEntry, deduplicated: true };
    }

    const accounts = this.chartOfAccounts.filter((a) => a.organizationId === params.organizationId);
    const validation = validateDoubleEntryLines(params.lines, accounts);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const now = new Date().toISOString();
    const journalNumber = `JRN-2026-${String(this.journalEntries.length + 1).padStart(4, '0')}`;
    const actor = this.getActiveUser();

    const entry: JournalEntry = {
      id: `jrn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      journalNumber,
      organizationId: params.organizationId,
      branchId: params.branchId || this.activeBranchId,
      entryDate: params.entryDate,
      referenceNumber: params.referenceNumber || params.sourceNumber,
      narration: params.narration,
      status: 'POSTED',
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      sourceNumber: params.sourceNumber,
      idempotencyKey: params.idempotencyKey,
      totalDebit: validation.totalDebit,
      totalCredit: validation.totalCredit,
      lines: params.lines,
      createdBy: actor.id || 'usr_system',
      createdByName: actor.name || 'System Accounting Engine',
      postedBy: actor.id || 'usr_system',
      postedByName: actor.name || 'System Accounting Engine',
      postedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const glRows = expandJournalToGeneralLedger(entry);
    this.journalEntries.unshift(entry);
    this.generalLedger.unshift(...glRows);
    this.postingRecords.unshift({
      idempotencyKey: params.idempotencyKey,
      organizationId: params.organizationId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      journalEntryId: entry.id,
      journalNumber: entry.journalNumber,
      postedAt: now,
    });

    this.logFinancialAudit({
      organizationId: params.organizationId,
      branchId: entry.branchId,
      module: 'GENERAL_LEDGER',
      action: 'JOURNAL_POSTED',
      entityType: 'JournalEntry',
      entityId: entry.id,
      entityNumber: entry.journalNumber,
      summary: `Auto-posted ${entry.sourceType} ${entry.journalNumber} (Dr/Cr ₹${entry.totalDebit.toFixed(2)}): ${entry.narration}`,
    });

    if (!params.skipCloudSync && this.shouldSyncCloud()) {
      syncJournalEntryToSupabase(entry, true).catch((e) =>
        console.warn('Supabase automated journal sync error:', e)
      );
    }

    return { success: true, journalEntry: entry };
  }

  public createJournalEntry(params: {
    entryDate: string;
    referenceNumber?: string;
    narration: string;
    attachmentNotes?: string;
    lines: Array<{
      accountId: string;
      debit: number;
      credit: number;
      description?: string;
      partyType?: 'CUSTOMER' | 'SUPPLIER';
      partyId?: string;
      partyName?: string;
    }>;
    status?: 'DRAFT' | 'PENDING_APPROVAL' | 'POSTED';
    organizationId?: string;
    branchId?: string;
  }): { success: boolean; journalEntry?: JournalEntry; error?: string } {
    const targetOrg = params.organizationId || this.organization.id;
    const targetBranch = params.branchId || this.activeBranchId;
    this.ensureAccountingDefaults(targetOrg);

    if (!params.narration.trim()) {
      return { success: false, error: 'Narration / description is required.' };
    }
    if (this.isDateInLockedPeriod(params.entryDate, targetOrg)) {
      return { success: false, error: `Accounting period for ${params.entryDate} is locked or closed.` };
    }

    const accounts = this.chartOfAccounts.filter((a) => a.organizationId === targetOrg);
    const validation = validateDoubleEntryLines(params.lines, accounts);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const resolvedLines: JournalEntryLine[] = params.lines.map((l, idx) => {
      const acc = accounts.find((a) => a.id === l.accountId)!;
      return {
        id: `jl_${Date.now()}_${idx}`,
        accountId: acc.id,
        accountCode: acc.code,
        accountName: acc.name,
        accountClass: acc.accountClass,
        debit: roundMoney(l.debit),
        credit: roundMoney(l.credit),
        description: l.description || params.narration,
        partyType: l.partyType,
        partyId: l.partyId,
        partyName: l.partyName,
      };
    });

    const now = new Date().toISOString();
    const actor = this.getActiveUser();
    const targetStatus = params.status || 'DRAFT';
    const journalNumber = `JRN-2026-${String(this.journalEntries.length + 1).padStart(4, '0')}`;

    const entry: JournalEntry = {
      id: `jrn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      journalNumber,
      organizationId: targetOrg,
      branchId: targetBranch,
      entryDate: params.entryDate,
      referenceNumber: params.referenceNumber?.trim(),
      narration: params.narration.trim(),
      attachmentNotes: params.attachmentNotes?.trim(),
      status: targetStatus,
      sourceType: 'MANUAL_JOURNAL',
      totalDebit: validation.totalDebit,
      totalCredit: validation.totalCredit,
      lines: resolvedLines,
      createdBy: actor.id || 'usr_system',
      createdByName: actor.name || 'Accountant',
      approvedBy: targetStatus === 'POSTED' ? actor.id || 'usr_system' : undefined,
      approvedByName: targetStatus === 'POSTED' ? actor.name || 'Accountant' : undefined,
      approvedAt: targetStatus === 'POSTED' ? now : undefined,
      postedBy: targetStatus === 'POSTED' ? actor.id || 'usr_system' : undefined,
      postedByName: targetStatus === 'POSTED' ? actor.name || 'Accountant' : undefined,
      postedAt: targetStatus === 'POSTED' ? now : undefined,
      createdAt: now,
      updatedAt: now,
    };

    this.journalEntries.unshift(entry);
    if (targetStatus === 'POSTED') {
      const glRows = expandJournalToGeneralLedger(entry);
      this.generalLedger.unshift(...glRows);
    }

    this.logFinancialAudit({
      organizationId: targetOrg,
      branchId: targetBranch,
      module: 'JOURNAL',
      action: targetStatus === 'POSTED' ? 'MANUAL_JOURNAL_POSTED' : 'MANUAL_JOURNAL_SAVED',
      entityType: 'JournalEntry',
      entityId: entry.id,
      entityNumber: entry.journalNumber,
      summary: `${targetStatus} manual journal ${entry.journalNumber} (₹${entry.totalDebit.toFixed(2)}): ${entry.narration}`,
    });

    this.notify();

    if (this.shouldSyncCloud()) {
      syncJournalEntryToSupabase(entry, targetStatus === 'POSTED').catch((e) =>
        console.warn('Supabase manual journal sync error:', e)
      );
    }

    return { success: true, journalEntry: entry };
  }

  public updateDraftJournalEntry(
    journalId: string,
    updates: {
      entryDate?: string;
      referenceNumber?: string;
      narration?: string;
      attachmentNotes?: string;
      lines?: Array<{ accountId: string; debit: number; credit: number; description?: string }>;
    }
  ): { success: boolean; journalEntry?: JournalEntry; error?: string } {
    const entry = this.getJournalEntryById(journalId);
    if (!entry) return { success: false, error: 'Journal entry not found.' };
    if (entry.status === 'POSTED' || entry.status === 'REVERSED') {
      return {
        success: false,
        error: `Posted journal ${entry.journalNumber} is immutable and cannot be edited. Create a reversal entry instead.`,
      };
    }

    const nextDate = updates.entryDate || entry.entryDate;
    if (this.isDateInLockedPeriod(nextDate, entry.organizationId)) {
      return { success: false, error: `Accounting period for ${nextDate} is locked.` };
    }

    if (updates.lines) {
      const accounts = this.chartOfAccounts.filter((a) => a.organizationId === entry.organizationId);
      const validation = validateDoubleEntryLines(updates.lines, accounts);
      if (!validation.valid) return { success: false, error: validation.error };
      entry.lines = updates.lines.map((l, idx) => {
        const acc = accounts.find((a) => a.id === l.accountId)!;
        return {
          id: `jl_${Date.now()}_${idx}`,
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          accountClass: acc.accountClass,
          debit: roundMoney(l.debit),
          credit: roundMoney(l.credit),
          description: l.description || updates.narration || entry.narration,
        };
      });
      entry.totalDebit = validation.totalDebit;
      entry.totalCredit = validation.totalCredit;
    }

    entry.entryDate = nextDate;
    if (updates.referenceNumber !== undefined) entry.referenceNumber = updates.referenceNumber;
    if (updates.narration !== undefined) entry.narration = updates.narration;
    if (updates.attachmentNotes !== undefined) entry.attachmentNotes = updates.attachmentNotes;
    entry.updatedAt = new Date().toISOString();

    this.notify();
    return { success: true, journalEntry: entry };
  }

  public deleteDraftJournalEntry(journalId: string): { success: boolean; error?: string } {
    const entry = this.getJournalEntryById(journalId);
    if (!entry) return { success: false, error: 'Journal entry not found.' };
    if (entry.status === 'POSTED' || entry.status === 'REVERSED') {
      return {
        success: false,
        error: `Posted journal ${entry.journalNumber} cannot be deleted. Use a reversing journal entry for corrections.`,
      };
    }
    this.journalEntries = this.journalEntries.filter((j) => j.id !== journalId);
    this.notify();
    return { success: true };
  }

  public submitJournalForApproval(journalId: string): { success: boolean; journalEntry?: JournalEntry; error?: string } {
    const entry = this.getJournalEntryById(journalId);
    if (!entry) return { success: false, error: 'Journal entry not found.' };
    if (entry.status !== 'DRAFT') {
      return { success: false, error: `Only DRAFT journals can be submitted for approval (current: ${entry.status}).` };
    }
    entry.status = 'PENDING_APPROVAL';
    entry.updatedAt = new Date().toISOString();
    this.notify();
    return { success: true, journalEntry: entry };
  }

  public postJournalEntry(journalId: string, approverName?: string): { success: boolean; journalEntry?: JournalEntry; error?: string } {
    const entry = this.getJournalEntryById(journalId);
    if (!entry) return { success: false, error: 'Journal entry not found.' };
    if (entry.status === 'POSTED' || entry.status === 'REVERSED') {
      return { success: false, error: `Journal ${entry.journalNumber} is already ${entry.status}.` };
    }
    if (this.isDateInLockedPeriod(entry.entryDate, entry.organizationId)) {
      return { success: false, error: `Cannot post into locked accounting period (${entry.entryDate}).` };
    }

    const accounts = this.chartOfAccounts.filter((a) => a.organizationId === entry.organizationId);
    const validation = validateDoubleEntryLines(entry.lines, accounts);
    if (!validation.valid) return { success: false, error: validation.error };

    const now = new Date().toISOString();
    const actor = this.getActiveUser();
    entry.status = 'POSTED';
    entry.approvedBy = actor.id || 'usr_system';
    entry.approvedByName = approverName || actor.name || 'Manager';
    entry.approvedAt = now;
    entry.postedBy = actor.id || 'usr_system';
    entry.postedByName = approverName || actor.name || 'Manager';
    entry.postedAt = now;
    entry.updatedAt = now;

    const glRows = expandJournalToGeneralLedger(entry);
    this.generalLedger.unshift(...glRows);

    this.logFinancialAudit({
      organizationId: entry.organizationId,
      branchId: entry.branchId,
      module: 'JOURNAL',
      action: 'JOURNAL_APPROVED_AND_POSTED',
      entityType: 'JournalEntry',
      entityId: entry.id,
      entityNumber: entry.journalNumber,
      summary: `Approved & posted journal ${entry.journalNumber} (₹${entry.totalDebit.toFixed(2)})`,
    });

    this.notify();

    if (this.shouldSyncCloud()) {
      postJournalEntryInSupabase(journalId).catch((e) => console.warn('Supabase journal post sync error:', e));
    }

    return { success: true, journalEntry: entry };
  }

  public reverseJournalEntry(
    journalId: string,
    reason: string,
    actorName?: string
  ): { success: boolean; reversalEntry?: JournalEntry; error?: string } {
    const original = this.getJournalEntryById(journalId);
    if (!original) return { success: false, error: 'Journal entry not found.' };
    if (original.status !== 'POSTED') {
      return { success: false, error: `Only POSTED journal entries can be reversed (current: ${original.status}).` };
    }
    if (!reason.trim()) {
      return { success: false, error: 'Reversal reason is required for audit compliance.' };
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const actor = this.getActiveUser();
    const reversalNumber = `REV-${original.journalNumber}`;

    const mirrorLines: JournalEntryLine[] = original.lines.map((line, idx) => ({
      ...line,
      id: `jl_rev_${Date.now()}_${idx}`,
      debit: roundMoney(line.credit),
      credit: roundMoney(line.debit),
      description: `Reversal of ${original.journalNumber}: ${line.description || original.narration}`,
    }));

    const reversalEntry: JournalEntry = {
      id: `jrn_rev_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      journalNumber: reversalNumber,
      organizationId: original.organizationId,
      branchId: original.branchId,
      entryDate: today,
      referenceNumber: original.journalNumber,
      narration: `Reversal of ${original.journalNumber}: ${reason.trim()}`,
      status: 'POSTED',
      sourceType: 'REVERSAL',
      sourceId: original.id,
      sourceNumber: original.journalNumber,
      totalDebit: original.totalCredit,
      totalCredit: original.totalDebit,
      lines: mirrorLines,
      reversedEntryId: original.id,
      reversalReason: reason.trim(),
      createdBy: actor.id || 'usr_system',
      createdByName: actorName || actor.name || 'Accountant',
      postedBy: actor.id || 'usr_system',
      postedByName: actorName || actor.name || 'Accountant',
      postedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    original.status = 'REVERSED';
    original.reversalEntryId = reversalEntry.id;
    original.reversalReason = reason.trim();
    original.updatedAt = now;

    this.journalEntries.unshift(reversalEntry);
    this.generalLedger.unshift(...expandJournalToGeneralLedger(reversalEntry));

    this.logFinancialAudit({
      organizationId: original.organizationId,
      branchId: original.branchId,
      module: 'JOURNAL',
      action: 'JOURNAL_REVERSED',
      entityType: 'JournalEntry',
      entityId: original.id,
      entityNumber: original.journalNumber,
      summary: `Reversed ${original.journalNumber} via ${reversalNumber}: ${reason.trim()}`,
    });

    this.notify();

    if (this.shouldSyncCloud()) {
      reverseJournalEntryInSupabase(journalId, reason).catch((e) =>
        console.warn('Supabase journal reverse sync error:', e)
      );
    }

    return { success: true, reversalEntry };
  }

  public getGeneralLedger(filters?: {
    organizationId?: string;
    branchId?: string;
    accountId?: string;
    startDate?: string;
    endDate?: string;
    sourceType?: AccountingSourceType;
  }): GeneralLedgerEntry[] {
    const targetOrg = filters?.organizationId || this.organization.id;
    return this.generalLedger
      .filter((row) => {
        if (row.organizationId !== targetOrg) return false;
        if (filters?.branchId && filters.branchId !== 'ALL' && row.branchId !== filters.branchId) return false;
        if (filters?.accountId && row.accountId !== filters.accountId) return false;
        if (filters?.startDate && row.entryDate < filters.startDate) return false;
        if (filters?.endDate && row.entryDate > filters.endDate) return false;
        if (filters?.sourceType && row.sourceType !== filters.sourceType) return false;
        return true;
      })
      .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
  }

  public getAccountLedger(accountId: string, startDate?: string, endDate?: string) {
    const account = this.getChartOfAccounts().find((a) => a.id === accountId);
    const entries = this.getGeneralLedger({ accountId, startDate, endDate }).reverse();
    let runningBalance = account?.openingBalance || 0;

    const ledgerRows = entries.map((e) => {
      const delta =
        account?.normalBalance === 'CREDIT'
          ? roundMoney(e.credit - e.debit)
          : roundMoney(e.debit - e.credit);
      runningBalance = roundMoney(runningBalance + delta);
      return {
        ...e,
        runningBalance,
      };
    });

    return {
      account,
      entries: ledgerRows,
      closingBalance: runningBalance,
      totalDebit: sumMoney(entries.map((e) => e.debit)),
      totalCredit: sumMoney(entries.map((e) => e.credit)),
    };
  }

  public getUnifiedTransactions(filters?: {
    organizationId?: string;
    branchId?: string;
    sourceType?: AccountingSourceType | 'ALL';
    accountId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }): UnifiedTransactionRow[] {
    const targetOrg = filters?.organizationId || this.organization.id;
    const query = (filters?.search || '').trim().toLowerCase();

    return this.journalEntries
      .filter((j) => {
        if (j.organizationId !== targetOrg) return false;
        if (filters?.branchId && filters.branchId !== 'ALL' && j.branchId !== filters.branchId) return false;
        if (filters?.sourceType && filters.sourceType !== 'ALL' && j.sourceType !== filters.sourceType) return false;
        if (filters?.status && filters.status !== 'ALL' && j.status !== filters.status) return false;
        if (filters?.startDate && j.entryDate < filters.startDate) return false;
        if (filters?.endDate && j.entryDate > filters.endDate) return false;
        if (filters?.accountId && !j.lines.some((l) => l.accountId === filters.accountId)) return false;
        if (query) {
          const blob = [
            j.journalNumber,
            j.sourceNumber,
            j.referenceNumber,
            j.narration,
            ...j.lines.map((l) => `${l.accountCode} ${l.accountName} ${l.partyName || ''}`),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!blob.includes(query)) return false;
        }
        return true;
      })
      .map((j) => {
        const partyLine = j.lines.find((l) => l.partyName);
        const debitAccs = j.lines.filter((l) => l.debit > 0).map((l) => `${l.accountCode} ${l.accountName}`);
        const creditAccs = j.lines.filter((l) => l.credit > 0).map((l) => `${l.accountCode} ${l.accountName}`);
        return {
          id: j.id,
          date: j.entryDate,
          voucherNumber: j.sourceNumber || j.referenceNumber || j.journalNumber,
          sourceType: j.sourceType,
          sourceId: j.sourceId,
          description: j.narration,
          partyName: partyLine?.partyName,
          accountSummary: `Dr: ${debitAccs.slice(0, 2).join(', ')} → Cr: ${creditAccs.slice(0, 2).join(', ')}`,
          branchId: j.branchId,
          debit: j.totalDebit,
          credit: j.totalCredit,
          status: j.status,
          journalEntryId: j.id,
          journalNumber: j.journalNumber,
          lines: j.lines,
          postedBy: j.postedByName || j.createdByName,
          postedAt: j.postedAt || j.createdAt,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  public getTrialBalance(options?: { organizationId?: string; branchId?: string; startDate?: string; endDate?: string }): {
    rows: TrialBalanceRow[];
    totalDebit: number;
    totalCredit: number;
    isBalanced: boolean;
  } {
    const orgId = options?.organizationId || this.organization.id;
    return computeTrialBalance(this.getChartOfAccounts(orgId), this.generalLedger, { ...options, organizationId: orgId });
  }

  public getProfitAndLoss(options?: { organizationId?: string; branchId?: string; startDate?: string; endDate?: string }): ProfitAndLossReport {
    const orgId = options?.organizationId || this.organization.id;
    return computeProfitAndLoss(this.getChartOfAccounts(orgId), this.generalLedger, { ...options, organizationId: orgId });
  }

  public getBalanceSheet(options?: { organizationId?: string; branchId?: string; asOfDate?: string }): BalanceSheetReport {
    const orgId = options?.organizationId || this.organization.id;
    return computeBalanceSheet(this.getChartOfAccounts(orgId), this.generalLedger, { ...options, organizationId: orgId });
  }

  public getCashFlowStatement(options?: { organizationId?: string; branchId?: string; startDate?: string; endDate?: string }): CashFlowReport {
    const orgId = options?.organizationId || this.organization.id;
    return computeCashFlowStatement(this.generalLedger, { ...options, organizationId: orgId });
  }

  public getGstReport(options?: { organizationId?: string; branchId?: string; startDate?: string; endDate?: string }): GstReportSummary {
    const orgId = options?.organizationId || this.organization.id;
    return computeGstReport(this.generalLedger, { ...options, organizationId: orgId });
  }

  // ==========================================================================
  // --- BUDGETS & VARIANCE ANALYSIS ---
  // ==========================================================================

  public getBudgets(orgId?: string): Budget[] {
    const targetOrg = orgId || this.organization.id;
    return this.budgets
      .filter((b) => b.organizationId === targetOrg)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public createBudget(params: {
    name: string;
    fiscalYear: string;
    periodType: BudgetPeriodType;
    startDate: string;
    endDate: string;
    branchId?: string;
    lines: Array<{
      accountId: string;
      category: 'REVENUE' | 'EXPENSE' | 'CAPEX';
      plannedAmount: number;
      notes?: string;
    }>;
    organizationId?: string;
  }): { success: boolean; budget?: Budget; error?: string } {
    const targetOrg = params.organizationId || this.organization.id;
    if (!params.name.trim()) return { success: false, error: 'Budget name is required.' };
    if (!params.lines || params.lines.length === 0) return { success: false, error: 'Add at least one account budget line.' };

    const accounts = this.getChartOfAccounts(targetOrg);
    const resolvedLines: BudgetLine[] = [];
    for (let i = 0; i < params.lines.length; i++) {
      const l = params.lines[i];
      const acc = accounts.find((a) => a.id === l.accountId);
      if (!acc) return { success: false, error: `Line ${i + 1}: Invalid account selected.` };
      if (l.plannedAmount < 0) return { success: false, error: `Line ${i + 1}: Planned amount cannot be negative.` };
      resolvedLines.push({
        id: `bl_${Date.now()}_${i}`,
        accountId: acc.id,
        accountCode: acc.code,
        accountName: acc.name,
        accountClass: acc.accountClass,
        category: l.category,
        plannedAmount: roundMoney(l.plannedAmount),
        notes: l.notes,
      });
    }

    const totalPlannedRevenue = sumMoney(resolvedLines.filter((l) => l.category === 'REVENUE').map((l) => l.plannedAmount));
    const totalPlannedExpense = sumMoney(resolvedLines.filter((l) => l.category === 'EXPENSE').map((l) => l.plannedAmount));
    const totalPlannedCapex = sumMoney(resolvedLines.filter((l) => l.category === 'CAPEX').map((l) => l.plannedAmount));
    const now = new Date().toISOString();

    const budget: Budget = {
      id: `bud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      organizationId: targetOrg,
      branchId: params.branchId || 'ALL',
      name: params.name.trim(),
      fiscalYear: params.fiscalYear,
      periodType: params.periodType,
      startDate: params.startDate,
      endDate: params.endDate,
      status: 'DRAFT',
      lines: resolvedLines,
      totalPlannedRevenue,
      totalPlannedExpense,
      totalPlannedCapex,
      revisions: [],
      createdBy: this.getActiveUser().name || 'Finance Manager',
      createdAt: now,
      updatedAt: now,
    };

    this.budgets.unshift(budget);
    this.logFinancialAudit({
      organizationId: targetOrg,
      branchId: budget.branchId,
      module: 'BUDGETS',
      action: 'BUDGET_CREATED',
      entityType: 'Budget',
      entityId: budget.id,
      entityNumber: budget.fiscalYear,
      summary: `Created ${budget.periodType} budget "${budget.name}" (Rev ₹${totalPlannedRevenue.toFixed(2)} / Exp ₹${totalPlannedExpense.toFixed(2)})`,
    });
    this.notify();

    if (this.shouldSyncCloud()) {
      syncBudgetToSupabase(budget, false).catch((e) => console.warn('Supabase budget create sync error:', e));
    }

    return { success: true, budget };
  }

  public approveBudget(budgetId: string, approverName?: string): { success: boolean; budget?: Budget; error?: string } {
    const budget = this.budgets.find((b) => b.id === budgetId);
    if (!budget) return { success: false, error: 'Budget not found.' };
    budget.status = 'APPROVED';
    budget.approvedBy = approverName || this.getActiveUser().name || 'Organization Admin';
    budget.approvedAt = new Date().toISOString();
    budget.updatedAt = budget.approvedAt;
    this.logFinancialAudit({
      organizationId: budget.organizationId,
      branchId: budget.branchId,
      module: 'BUDGETS',
      action: 'BUDGET_APPROVED',
      entityType: 'Budget',
      entityId: budget.id,
      entityNumber: budget.fiscalYear,
      summary: `Approved budget "${budget.name}"`,
    });
    this.notify();

    if (this.shouldSyncCloud()) {
      approveBudgetInSupabase(budgetId).catch((e) => console.warn('Supabase budget approve sync error:', e));
    }

    return { success: true, budget };
  }

  public reviseBudget(
    budgetId: string,
    updatedLines: Array<{ accountId: string; category: 'REVENUE' | 'EXPENSE' | 'CAPEX'; plannedAmount: number; notes?: string }>,
    reason: string
  ): { success: boolean; budget?: Budget; error?: string } {
    const budget = this.budgets.find((b) => b.id === budgetId);
    if (!budget) return { success: false, error: 'Budget not found.' };
    if (!reason.trim()) return { success: false, error: 'Revision reason is required.' };

    const accounts = this.getChartOfAccounts(budget.organizationId);
    const previousTotal = roundMoney(budget.totalPlannedRevenue + budget.totalPlannedExpense + budget.totalPlannedCapex);

    budget.lines = updatedLines.map((l, idx) => {
      const acc = accounts.find((a) => a.id === l.accountId);
      return {
        id: `bl_rev_${Date.now()}_${idx}`,
        accountId: l.accountId,
        accountCode: acc?.code || '0000',
        accountName: acc?.name || 'Account',
        accountClass: acc?.accountClass || 'EXPENSE',
        category: l.category,
        plannedAmount: roundMoney(l.plannedAmount),
        notes: l.notes,
      };
    });

    budget.totalPlannedRevenue = sumMoney(budget.lines.filter((l) => l.category === 'REVENUE').map((l) => l.plannedAmount));
    budget.totalPlannedExpense = sumMoney(budget.lines.filter((l) => l.category === 'EXPENSE').map((l) => l.plannedAmount));
    budget.totalPlannedCapex = sumMoney(budget.lines.filter((l) => l.category === 'CAPEX').map((l) => l.plannedAmount));
    const newTotal = roundMoney(budget.totalPlannedRevenue + budget.totalPlannedExpense + budget.totalPlannedCapex);

    budget.status = 'REVISED';
    budget.revisions.unshift({
      version: budget.revisions.length + 1,
      revisedAt: new Date().toISOString(),
      revisedBy: this.getActiveUser().name || 'Finance Manager',
      reason: reason.trim(),
      previousTotal,
      newTotal,
    });
    budget.updatedAt = new Date().toISOString();

    this.logFinancialAudit({
      organizationId: budget.organizationId,
      branchId: budget.branchId,
      module: 'BUDGETS',
      action: 'BUDGET_REVISED',
      entityType: 'Budget',
      entityId: budget.id,
      entityNumber: budget.fiscalYear,
      summary: `Revised budget "${budget.name}" (v${budget.revisions.length}): ${reason.trim()}`,
    });
    this.notify();

    if (this.shouldSyncCloud()) {
      syncBudgetToSupabase(budget, true).catch((e) => console.warn('Supabase budget revise sync error:', e));
    }

    return { success: true, budget };
  }

  public getBudgetVariance(budgetId: string): {
    budget?: Budget;
    rows: BudgetVarianceRow[];
    totalPlanned: number;
    totalActual: number;
    totalVariance: number;
    utilizationPercent: number;
  } {
    const budget = this.budgets.find((b) => b.id === budgetId);
    if (!budget) {
      return { rows: [], totalPlanned: 0, totalActual: 0, totalVariance: 0, utilizationPercent: 0 };
    }
    return {
      budget,
      ...computeBudgetVariance(budget, this.generalLedger),
    };
  }

  // ==========================================================================
  // --- BULK UPDATES & AUDITABLE IMPORTS ---
  // ==========================================================================

  public getBulkImportBatches(orgId?: string): BulkImportBatch[] {
    const targetOrg = orgId || this.organization.id;
    return this.bulkImportBatches
      .filter((b) => b.organizationId === targetOrg)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public commitBulkImportBatch(params: {
    entityType: BulkImportEntityType;
    fileName: string;
    rows: Record<string, any>[];
    requiresApproval?: boolean;
    approved?: boolean;
    organizationId?: string;
    branchId?: string;
  }): { success: boolean; batch?: BulkImportBatch; error?: string } {
    const targetOrg = params.organizationId || this.organization.id;
    const targetBranch = params.branchId || this.activeBranchId;

    const sensitiveTypes: BulkImportEntityType[] = ['OPENING_BALANCES', 'PRODUCT_PRICING', 'TAX_CLASSIFICATIONS'];
    const needsApproval = params.requiresApproval ?? sensitiveTypes.includes(params.entityType);
    if (needsApproval && !params.approved) {
      return {
        success: false,
        error: `Role-based approval confirmation is required before committing ${params.entityType} bulk changes.`,
      };
    }

    const errors: BulkImportErrorRow[] = [];
    let importedRows = 0;
    let updatedRows = 0;
    let skippedDuplicates = 0;
    const seenKeys = new Set<string>();
    const openingLines: JournalEntryLine[] = [];
    const accounts = this.getChartOfAccounts(targetOrg);
    const offsetAcc = findAccountByCode(accounts, targetOrg, SYSTEM_ACCOUNT_CODES.OPENING_BALANCE_OFFSET);

    params.rows.forEach((row, index) => {
      const rowNum = index + 2; // Excel row number (1 = header)
      try {
        if (params.entityType === 'CUSTOMERS') {
          const name = String(row.name || row.Name || '').trim();
          const phone = String(row.phone || row.Phone || '').trim();
          if (!name || !phone) {
            errors.push({ rowNumber: rowNum, field: 'name/phone', message: 'Customer name and phone are required.' });
            return;
          }
          const dupKey = `${name.toLowerCase()}|${phone}`;
          if (seenKeys.has(dupKey) || this.customers.some((c) => c.phone === phone)) {
            skippedDuplicates++;
            return;
          }
          seenKeys.add(dupKey);
          this.customers.unshift({
            id: `cust_bulk_${Date.now()}_${index}`,
            name,
            companyName: String(row.companyName || row.Company || '').trim() || undefined,
            phone,
            email: String(row.email || row.Email || '').trim() || undefined,
            gstin: String(row.gstin || row.GSTIN || '').trim() || undefined,
            city: String(row.city || row.City || '').trim() || undefined,
            state: String(row.state || row.State || 'Karnataka').trim(),
            creditLimit: roundMoney(Number(row.creditLimit || row.CreditLimit || 25000)),
            currentReceivableBalance: roundMoney(Number(row.openingBalance || 0)),
            totalOrdersCount: 0,
            createdAt: new Date().toISOString(),
          });
          importedRows++;
        } else if (params.entityType === 'SUPPLIERS') {
          const name = String(row.name || row.Name || '').trim();
          const phone = String(row.phone || row.Phone || '').trim();
          if (!name) {
            errors.push({ rowNumber: rowNum, field: 'name', message: 'Supplier name is required.' });
            return;
          }
          if (seenKeys.has(name.toLowerCase()) || this.suppliers.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
            skippedDuplicates++;
            return;
          }
          seenKeys.add(name.toLowerCase());
          this.suppliers.unshift({
            id: `sup_bulk_${Date.now()}_${index}`,
            name,
            contactPerson: String(row.contactPerson || row.Contact || name).trim(),
            phone: phone || '0000000000',
            email: String(row.email || row.Email || '').trim(),
            gstin: String(row.gstin || row.GSTIN || '').trim() || undefined,
            city: String(row.city || row.City || '').trim() || undefined,
            state: String(row.state || row.State || 'Karnataka').trim(),
            openingBalance: roundMoney(Number(row.openingBalance || 0)),
            currentPayableBalance: roundMoney(Number(row.openingBalance || 0)),
            outstandingBalance: roundMoney(Number(row.openingBalance || 0)),
            status: 'ACTIVE',
            purchaseOrdersCount: 0,
            createdAt: new Date().toISOString(),
          });
          importedRows++;
        } else if (params.entityType === 'PRODUCTS') {
          const sku = String(row.sku || row.SKU || '').trim();
          const name = String(row.name || row.Name || '').trim();
          const sellingPrice = Number(row.sellingPrice || row.SellingPrice || 0);
          if (!sku || !name || sellingPrice <= 0) {
            errors.push({ rowNumber: rowNum, field: 'sku/name/sellingPrice', message: 'Valid SKU, Name, and positive Selling Price required.' });
            return;
          }
          if (seenKeys.has(sku.toLowerCase()) || this.products.some((p) => p.sku.toLowerCase() === sku.toLowerCase())) {
            skippedDuplicates++;
            return;
          }
          seenKeys.add(sku.toLowerCase());
          this.products.unshift({
            id: `prod_bulk_${Date.now()}_${index}`,
            sku,
            barcode: String(row.barcode || sku).trim(),
            hsn: String(row.hsn || row.HSN || '8504').trim(),
            name,
            categoryId: 'cat_general',
            categoryName: String(row.category || row.Category || 'General').trim(),
            unit: (['PCS', 'KG', 'LTR', 'BOX', 'PACK'].includes(String(row.unit || 'PCS').toUpperCase())
              ? String(row.unit || 'PCS').toUpperCase()
              : 'PCS') as Product['unit'],
            costPrice: roundMoney(Number(row.costPrice || row.CostPrice || sellingPrice * 0.75)),
            sellingPrice: roundMoney(sellingPrice),
            gstRate: Number(row.gstRate ?? row.GSTRate ?? 18),
            currentStock: Math.max(0, Number(row.stock || row.OpeningStock || 0)),
            minStockAlert: Math.max(0, Number(row.minStock || 5)),
            isActive: true,
            updatedAt: new Date().toISOString(),
          });
          importedRows++;
        } else if (params.entityType === 'PRODUCT_PRICING' || params.entityType === 'TAX_CLASSIFICATIONS') {
          const sku = String(row.sku || row.SKU || '').trim();
          const prod = this.products.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
          if (!prod) {
            errors.push({ rowNumber: rowNum, field: 'sku', message: `Product with SKU "${sku}" not found.`, rawValue: sku });
            return;
          }
          if (params.entityType === 'PRODUCT_PRICING') {
            const newPrice = Number(row.sellingPrice ?? row.SellingPrice);
            const newCost = Number(row.costPrice ?? row.CostPrice ?? prod.costPrice);
            if (!Number.isFinite(newPrice) || newPrice <= 0) {
              errors.push({ rowNumber: rowNum, field: 'sellingPrice', message: 'Selling price must be > 0.' });
              return;
            }
            prod.sellingPrice = roundMoney(newPrice);
            if (Number.isFinite(newCost) && newCost >= 0) prod.costPrice = roundMoney(newCost);
          } else {
            const newGst = Number(row.gstRate ?? row.GSTRate);
            if (![0, 5, 12, 18, 28].includes(newGst)) {
              errors.push({ rowNumber: rowNum, field: 'gstRate', message: 'GST rate must be one of 0, 5, 12, 18, 28.', rawValue: String(newGst) });
              return;
            }
            prod.gstRate = newGst;
            if (row.hsn || row.HSN) prod.hsn = String(row.hsn || row.HSN).trim();
          }
          prod.updatedAt = new Date().toISOString();
          updatedRows++;
        } else if (params.entityType === 'ACCOUNT_CLASSIFICATIONS') {
          const code = String(row.accountCode || row.Code || '').trim();
          const acc = this.chartOfAccounts.find((a) => a.organizationId === targetOrg && a.code === code);
          if (!acc) {
            errors.push({ rowNumber: rowNum, field: 'accountCode', message: `Account code "${code}" not found.`, rawValue: code });
            return;
          }
          if (row.accountGroup || row.Group) acc.accountGroup = String(row.accountGroup || row.Group).trim();
          if (row.description || row.Description) acc.description = String(row.description || row.Description).trim();
          if (row.taxApplicable !== undefined) acc.taxApplicable = String(row.taxApplicable).toLowerCase() === 'true' || row.taxApplicable === true;
          acc.updatedAt = new Date().toISOString();
          updatedRows++;
        } else if (params.entityType === 'OPENING_BALANCES') {
          const code = String(row.accountCode || row.Code || '').trim();
          const debit = roundMoney(Number(row.debit || row.Debit || 0));
          const credit = roundMoney(Number(row.credit || row.Credit || 0));
          const acc = accounts.find((a) => a.code === code);
          if (!acc) {
            errors.push({ rowNumber: rowNum, field: 'accountCode', message: `Account code "${code}" not found.`, rawValue: code });
            return;
          }
          if ((debit === 0 && credit === 0) || (debit > 0 && credit > 0) || debit < 0 || credit < 0) {
            errors.push({ rowNumber: rowNum, field: 'debit/credit', message: 'Provide either a positive Debit OR Credit amount.' });
            return;
          }
          openingLines.push({
            id: `jl_bulk_ob_${Date.now()}_${index}`,
            accountId: acc.id,
            accountCode: acc.code,
            accountName: acc.name,
            accountClass: acc.accountClass,
            debit,
            credit,
            description: `Bulk opening balance adjustment (${params.fileName})`,
          });
          importedRows++;
        }
      } catch (err: any) {
        errors.push({ rowNumber: rowNum, field: 'row', message: err?.message || 'Unexpected row parse error' });
      }
    });

    // If OPENING_BALANCES had valid rows, post an adjustment journal (auto-balancing to Opening Balance Equity 3200 if unbalanced)
    let postedJournalId: string | undefined;
    if (params.entityType === 'OPENING_BALANCES' && openingLines.length > 0) {
      const drSum = sumMoney(openingLines.map((l) => l.debit));
      const crSum = sumMoney(openingLines.map((l) => l.credit));
      const diff = roundMoney(drSum - crSum);
      if (Math.abs(diff) > 0.01 && offsetAcc) {
        openingLines.push({
          id: `jl_bulk_ob_offset_${Date.now()}`,
          accountId: offsetAcc.id,
          accountCode: offsetAcc.code,
          accountName: offsetAcc.name,
          accountClass: offsetAcc.accountClass,
          debit: diff < 0 ? Math.abs(diff) : 0,
          credit: diff > 0 ? diff : 0,
          description: 'Opening Balance Equity auto-balancing offset',
        });
      }
      const postRes = this.postAutomatedJournal({
        organizationId: targetOrg,
        branchId: targetBranch,
        entryDate: new Date().toISOString().slice(0, 10),
        sourceType: 'OPENING_BALANCE',
        sourceId: `bulk_ob_${Date.now()}`,
        sourceNumber: `BULK-OB-${Date.now().toString().slice(-5)}`,
        narration: `Bulk Opening Balance Adjustment from ${params.fileName}`,
        idempotencyKey: `gl_bulk_ob_${Date.now()}`,
        lines: openingLines,
      });
      if (postRes.journalEntry) postedJournalId = postRes.journalEntry.id;
    }

    const batch: BulkImportBatch = {
      id: `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      organizationId: targetOrg,
      branchId: targetBranch,
      entityType: params.entityType,
      fileName: params.fileName,
      totalRows: params.rows.length,
      validRows: importedRows + updatedRows,
      importedRows,
      updatedRows,
      skippedDuplicates,
      errorCount: errors.length,
      errors,
      requiresApproval: needsApproval,
      approvedBy: needsApproval ? this.getActiveUser().name : undefined,
      status: 'COMMITTED',
      journalEntryId: postedJournalId,
      performedBy: this.getActiveUser().id || 'usr_system',
      performedByName: this.getActiveUser().name || 'Accountant',
      createdAt: new Date().toISOString(),
    };

    this.bulkImportBatches.unshift(batch);
    this.logFinancialAudit({
      organizationId: targetOrg,
      branchId: targetBranch,
      module: 'BULK_UPDATES',
      action: 'BULK_IMPORT_COMMITTED',
      entityType: 'BulkImportBatch',
      entityId: batch.id,
      entityNumber: batch.entityType,
      summary: `Bulk ${batch.entityType} (${batch.fileName}): ${importedRows} created, ${updatedRows} updated, ${skippedDuplicates} duplicates skipped, ${errors.length} errors`,
    });
    this.notify();

    if (this.shouldSyncCloud()) {
      syncBulkImportBatchToSupabase(batch).catch((e) => console.warn('Supabase bulk batch sync error:', e));
      if (params.entityType === 'CUSTOMERS') {
        this.customers.slice(0, importedRows).forEach((c) => {
          createCustomerInSupabase(c, targetOrg, targetBranch).catch(() => {});
        });
      } else if (params.entityType === 'SUPPLIERS') {
        this.suppliers.slice(0, importedRows).forEach((s) => {
          saveSupplierInSupabase(s, targetOrg).catch(() => {});
        });
      } else if (
        params.entityType === 'PRODUCTS' ||
        params.entityType === 'PRODUCT_PRICING' ||
        params.entityType === 'TAX_CLASSIFICATIONS'
      ) {
        const count = params.entityType === 'PRODUCTS' ? importedRows : updatedRows;
        this.products.slice(0, count).forEach((p) => {
          createProductInSupabase(p, targetOrg, targetBranch).catch(() => {});
        });
      }
    }

    return { success: true, batch };
  }

  // ==========================================================================
  // --- BANK RECONCILIATION ---
  // ==========================================================================

  public getBankReconciliations(bankAccountId?: string, orgId?: string): BankReconciliation[] {
    const targetOrg = orgId || this.organization.id;
    return this.bankReconciliations
      .filter((r) => r.organizationId === targetOrg && (!bankAccountId || r.bankAccountId === bankAccountId))
      .sort((a, b) => new Date(b.reconciledAt).getTime() - new Date(a.reconciledAt).getTime());
  }

  public saveBankReconciliation(params: {
    bankAccountId: string;
    statementDate: string;
    statementClosingBalance: number;
    clearedTransactionIds: string[];
    postAdjustmentJournal?: boolean;
    notes?: string;
  }): { success: boolean; reconciliation?: BankReconciliation; adjustmentJournal?: JournalEntry; error?: string } {
    const account = this.getBankAccountById(params.bankAccountId);
    if (!account) return { success: false, error: 'Bank account not found.' };

    const txs = this.getBankTransactions(account.id, account.organizationId).filter((t) => t.status === 'COMPLETED');
    const clearedSet = new Set(params.clearedTransactionIds);
    const clearedMovement = txs
      .filter((t) => clearedSet.has(t.id))
      .reduce((sum, t) => {
        if (t.type === 'DEPOSIT' || t.type === 'BANK_DEPOSIT' || t.type === 'CASH_DEPOSIT' || t.type === 'TRANSFER_IN') {
          return roundMoney(sum + t.amount);
        }
        return roundMoney(sum - t.amount);
      }, 0);

    const clearedBalance = roundMoney(account.openingBalance + clearedMovement);
    const variance = roundMoney(params.statementClosingBalance - account.currentBalance);
    let adjustmentJournal: JournalEntry | undefined;

    if (params.postAdjustmentJournal && Math.abs(variance) > 0.01) {
      const accounts = this.getChartOfAccounts(account.organizationId);
      const bankGlAcc = findAccountByCode(
        accounts,
        account.organizationId,
        account.accountType === 'CASH' ? SYSTEM_ACCOUNT_CODES.CASH : SYSTEM_ACCOUNT_CODES.BANK
      );
      const chargesAcc = findAccountByCode(accounts, account.organizationId, SYSTEM_ACCOUNT_CODES.BANK_CHARGES);
      const otherIncAcc = findAccountByCode(accounts, account.organizationId, SYSTEM_ACCOUNT_CODES.OTHER_INCOME);

      if (bankGlAcc && chargesAcc && otherIncAcc) {
        const amt = Math.abs(variance);
        const lines: JournalEntryLine[] =
          variance < 0
            ? [
                {
                  id: `jl_rec_dr_${Date.now()}`,
                  accountId: chargesAcc.id,
                  accountCode: chargesAcc.code,
                  accountName: chargesAcc.name,
                  accountClass: chargesAcc.accountClass,
                  debit: amt,
                  credit: 0,
                  description: `Bank charges / reconciliation variance (${account.bankName})`,
                },
                {
                  id: `jl_rec_cr_${Date.now()}`,
                  accountId: bankGlAcc.id,
                  accountCode: bankGlAcc.code,
                  accountName: bankGlAcc.name,
                  accountClass: bankGlAcc.accountClass,
                  debit: 0,
                  credit: amt,
                  description: `Bank balance adjustment on reconciliation`,
                },
              ]
            : [
                {
                  id: `jl_rec_dr_${Date.now()}`,
                  accountId: bankGlAcc.id,
                  accountCode: bankGlAcc.code,
                  accountName: bankGlAcc.name,
                  accountClass: bankGlAcc.accountClass,
                  debit: amt,
                  credit: 0,
                  description: `Bank interest / positive reconciliation adjustment`,
                },
                {
                  id: `jl_rec_cr_${Date.now()}`,
                  accountId: otherIncAcc.id,
                  accountCode: otherIncAcc.code,
                  accountName: otherIncAcc.name,
                  accountClass: otherIncAcc.accountClass,
                  debit: 0,
                  credit: amt,
                  description: `Interest / miscellaneous bank credit (${account.bankName})`,
                },
              ];

        const postRes = this.postAutomatedJournal({
          organizationId: account.organizationId,
          branchId: account.branchId,
          entryDate: params.statementDate,
          sourceType: 'BANK_RECONCILIATION',
          sourceId: `rec_${account.id}_${params.statementDate}`,
          sourceNumber: `RECON-${params.statementDate}`,
          narration: `Bank Reconciliation Adjustment for ${account.accountName} (${params.statementDate})`,
          idempotencyKey: `gl_recon_${account.id}_${params.statementDate}_${amt}`,
          lines,
        });
        if (postRes.journalEntry) {
          adjustmentJournal = postRes.journalEntry;
          account.currentBalance = roundMoney(params.statementClosingBalance);
          account.updatedAt = new Date().toISOString();
        }
      }
    }

    const reconciliation: BankReconciliation = {
      id: `recon_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      organizationId: account.organizationId,
      branchId: account.branchId,
      bankAccountId: account.id,
      bankAccountName: `${account.accountName} (${account.bankName})`,
      statementDate: params.statementDate,
      statementClosingBalance: roundMoney(params.statementClosingBalance),
      bookBalance: roundMoney(account.currentBalance),
      clearedBalance,
      variance: params.postAdjustmentJournal ? 0 : variance,
      clearedTransactionIds: params.clearedTransactionIds,
      adjustmentJournalId: adjustmentJournal?.id,
      status: Math.abs(params.postAdjustmentJournal ? 0 : variance) <= 0.01 ? 'RECONCILED' : 'IN_PROGRESS',
      reconciledBy: this.getActiveUser().name || 'Accountant',
      reconciledAt: new Date().toISOString(),
      notes: params.notes,
    };

    this.bankReconciliations.unshift(reconciliation);
    this.logFinancialAudit({
      organizationId: account.organizationId,
      branchId: account.branchId,
      module: 'BANKING',
      action: 'BANK_RECONCILIATION_SAVED',
      entityType: 'BankReconciliation',
      entityId: reconciliation.id,
      entityNumber: params.statementDate,
      summary: `Reconciled ${account.accountName} as of ${params.statementDate} (Statement ₹${params.statementClosingBalance.toFixed(2)}, Variance ₹${reconciliation.variance.toFixed(2)})`,
    });
    this.notify();

    this.runCloudMutation(
      'Bank reconciliation',
      null,
      async () => {
        const res = await syncBankReconciliationToSupabase(reconciliation);
        if (!res) return false;
        if (adjustmentJournal) {
          await saveBankAccountToSupabase(account);
        }
        return true;
      }
    );

    return { success: true, reconciliation, adjustmentJournal };
  }

  // ==========================================================================
  // --- FINANCIAL AUDIT LOGS & BRANCH MANAGEMENT ---
  // ==========================================================================

  public logFinancialAudit(params: {
    organizationId: string;
    branchId: string;
    module: string;
    action: string;
    entityType: string;
    entityId: string;
    entityNumber?: string;
    summary: string;
  }): void {
    const actor = this.getActiveUser();
    const logEntry: FinancialAuditLog = {
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      organizationId: params.organizationId,
      branchId: params.branchId,
      module: params.module,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      entityNumber: params.entityNumber,
      summary: params.summary,
      actorId: actor.id || 'usr_system',
      actorName: actor.name || 'System',
      actorRole: actor.role || 'SYSTEM',
      timestamp: new Date().toISOString(),
    };
    this.financialAuditLogs.unshift(logEntry);
    if (this.financialAuditLogs.length > 500) {
      this.financialAuditLogs = this.financialAuditLogs.slice(0, 500);
    }
    if (this.shouldSyncCloud()) {
      recordFinancialAuditLogInSupabase(logEntry).catch((e) =>
        console.warn('Supabase audit log sync error:', e)
      );
    }
  }

  public getFinancialAuditLogs(orgId?: string): FinancialAuditLog[] {
    const targetOrg = orgId || this.organization.id;
    return this.financialAuditLogs.filter((l) => l.organizationId === targetOrg);
  }

  public addBranch(branchData: Omit<Branch, 'id' | 'organizationId'>): Branch {
    if (this.isAuthenticatedState && !hasPermission(this.activeUser, 'BRANCH_MANAGE')) {
      throw new Error('Access Denied: Your role is not authorized to create branches.');
    }
    const newBranch: Branch = {
      ...branchData,
      id: `br_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      organizationId: this.organization.id,
    };
    this.branches.push(newBranch);
    this.logFinancialAudit({
      organizationId: this.organization.id,
      branchId: newBranch.id,
      module: 'SETTINGS',
      action: 'BRANCH_CREATED',
      entityType: 'Branch',
      entityId: newBranch.id,
      entityNumber: newBranch.code,
      summary: `Created branch ${newBranch.name} (${newBranch.code}, ${newBranch.city})`,
    });
    this.notify();

    if (this.shouldSyncCloud()) {
      saveBranchToSupabase(newBranch, this.organization.gstin || 'URP').catch((e) =>
        this.recordCloudSyncError('Branch create sync', e)
      );
    }

    return newBranch;
  }

  // --- Diagnostics & Database Backup/Restore ---
  public exportDatabaseDump(): string {
    return JSON.stringify(
      {
        version: '2.0',
        exportedAt: new Date().toISOString(),
        device: this.deviceRegistration,
        products: this.products,
        customers: this.customers,
        suppliers: this.suppliers,
        sales: this.sales,
        expenses: this.expenses,
        chartOfAccounts: this.chartOfAccounts,
        journalEntries: this.journalEntries,
        generalLedger: this.generalLedger,
        budgets: this.budgets,
        debitNotes: this.debitNotes,
        bankReconciliations: this.bankReconciliations,
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
    this.bankAccounts = [...INITIAL_BANK_ACCOUNTS];
    this.bankTransactions = [...INITIAL_BANK_TRANSACTIONS];
    this.creditNotes = [...INITIAL_CREDIT_NOTES];
    this.purchaseOrders = [...INITIAL_PURCHASE_ORDERS];
    this.goodsReceipts = [...INITIAL_GOODS_RECEIPTS];
    this.supplierBills = [...INITIAL_SUPPLIER_BILLS];
    this.supplierPayments = [...INITIAL_SUPPLIER_PAYMENTS];
    this.customerReceipts = [];
    this.chartOfAccounts = createDefaultChartOfAccounts(this.organization.id);
    this.journalEntries = [];
    this.generalLedger = [];
    this.postingRecords = [];
    this.accountingPeriods = [];
    this.budgets = [];
    this.bulkImportBatches = [];
    this.debitNotes = [];
    this.bankReconciliations = [];
    this.financialAuditLogs = [];
    this.ensureAccountingDefaults(this.organization.id);
    this.bootstrapLedgerFromExistingDocuments(this.organization.id);
    this.refunds = [];
    this.stockMovements = [];
    this.syncOutbox = [];
    this.isSimulatedOffline = false;
    this.notify();
  }
}

export const offlineStore = new OfflineStore();
