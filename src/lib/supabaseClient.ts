/**
 * SLATE POS — Supabase Integration & Client Services
 * 
 * Architecture:
 * - Uses official @supabase/supabase-js client
 * - Public anon key & URL read from client environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
 * - Safe fallback: if offline or environment variables are not configured, smoothly queues offline items
 *   and provides local store fallback without throwing runtime unhandled exceptions.
 * - Enforces least-privilege RLS policies and multi-tenant store boundary isolation.
 * - Transaction-safe atomic sales & refunds using PostgreSQL RPC functions.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Sale,
  Product,
  Customer,
  Supplier,
  Expense,
  Quotation,
  TimeLog,
  RefundRecord,
  Coupon,
  Branch,
  Organization,
  SyncOutboxItem,
  UserProfile,
  UserRole,
  BankAccount,
  CreditNote,
  PurchaseOrder,
  SupplierBill,
  GoodsReceipt,
  SupplierPayment,
  ChartOfAccount,
  JournalEntry,
  BankTransaction,
  Budget,
  BankReconciliation,
  BulkImportBatch,
  DebitNote,
  FinancialAuditLog,
  AccountingPeriod,
  CustomFieldDefinition,
  HardwarePrinterConfig,
  StockMovement,
  CustomerReceipt,
} from '../types';
import { hasPermission, toLegacyPermissions } from './permissions';
import { sanitizeBrandImageUrl } from './branding';

const unavailableSchemaTables = new Set<string>();

export function isTableMarkedUnavailable(table: string): boolean {
  return unavailableSchemaTables.has(table);
}

export function resetUnavailableSchemaTables(): void {
  unavailableSchemaTables.clear();
}

export function handleSchemaTableError(table: string, err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || err.details || '').toLowerCase();
  const isMissing =
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('could not find the table') ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    Number(err.status) === 404;
  if (isMissing) {
    if (!unavailableSchemaTables.has(table)) {
      unavailableSchemaTables.add(table);
      console.warn(
        `[SLATE POS] Supabase table "${table}" is not yet in schema cache (HTTP 404 / PGRST205). Run pending SQL migrations and NOTIFY pgrst, 'reload schema'. Suppressing duplicate fetches for this session.`
      );
    }
    return true;
  }
  return false;
}

export function sanitizeBranchIdForDb(branchId: string | null | undefined): string | null {
  if (!branchId) return null;
  const trimmed = String(branchId).trim();
  if (!trimmed || trimmed === 'ALL' || trimmed === 'main-branch') return null;
  return trimmed;
}

const getEnvVar = (key: string): string | undefined => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
      return (import.meta as any).env[key];
    }
  } catch {
    // import.meta.env not available in this runtime
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return undefined;
};

/**
 * Clean and format Supabase URL string by trimming whitespace and removing
 * trailing slashes and API subpaths (/rest/v1, /auth/v1) if mistakenly included in env vars.
 */
export function sanitizeSupabaseUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  let cleaned = rawUrl.trim();
  // Strip trailing slashes and common API subpaths
  cleaned = cleaned.replace(/\/rest\/v1\/?$/i, '');
  cleaned = cleaned.replace(/\/auth\/v1\/?$/i, '');
  cleaned = cleaned.replace(/\/+$/, '');
  return cleaned;
}

/**
 * Retrieve active Supabase client key supporting standard naming conventions:
 * VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_PUBLISHABLE_KEY, or SUPABASE_ANON_KEY.
 */
export function getSupabaseKey(): string | undefined {
  return (
    getEnvVar('VITE_SUPABASE_ANON_KEY') ||
    getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY') ||
    getEnvVar('SUPABASE_ANON_KEY')
  );
}

let clientInstance: SupabaseClient | null = null;
let currentClientUrl: string | undefined = undefined;
let currentClientKey: string | undefined = undefined;

/**
 * Returns true if Supabase URL and anon/publishable key are properly configured in client environment.
 */
export function isSupabaseConfigured(): boolean {
  const url = sanitizeSupabaseUrl(getEnvVar('VITE_SUPABASE_URL') || getEnvVar('SUPABASE_URL'));
  const key = getSupabaseKey();
  return Boolean(
    url &&
    key &&
    url.startsWith('http') &&
    key.length > 10 &&
    !url.includes('your-project.supabase.co') &&
    key !== 'your-supabase-anon-key-here'
  );
}

/**
 * Returns diagnostic configuration status details for setup inspection.
 */
export function getSupabaseConfigStatus(): {
  isConfigured: boolean;
  hasUrl: boolean;
  hasKey: boolean;
  message: string;
} {
  const url = sanitizeSupabaseUrl(getEnvVar('VITE_SUPABASE_URL') || getEnvVar('SUPABASE_URL'));
  const key = getSupabaseKey();
  const hasUrl = Boolean(
    url &&
    url.startsWith('http') &&
    !url.includes('your-project.supabase.co')
  );
  const hasKey = Boolean(
    key &&
    key.length > 10 &&
    key !== 'your-supabase-anon-key-here'
  );
  const isConfigured = hasUrl && hasKey;
  let message = 'Supabase PostgreSQL connected';
  if (!hasUrl && !hasKey) {
    message = 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) are missing in environment.';
  } else if (!hasUrl) {
    message = 'VITE_SUPABASE_URL is not configured or contains invalid URL/path.';
  } else if (!hasKey) {
    message = 'VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) is missing or invalid.';
  }
  return { isConfigured, hasUrl, hasKey, message };
}

/**
 * Returns the Supabase client singleton, or null if not configured.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const url = sanitizeSupabaseUrl(getEnvVar('VITE_SUPABASE_URL') || getEnvVar('SUPABASE_URL'))!;
  const key = getSupabaseKey()!;

  if (!clientInstance || currentClientUrl !== url || currentClientKey !== key) {
    clientInstance = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      db: {
        schema: 'public',
      },
    });
    currentClientUrl = url;
    currentClientKey = key;
  }

  return clientInstance;
}

// ============================================================================
// 1. TRANSACTION-SAFE POS CHECKOUT & ATOMIC SALES
// ============================================================================

/**
 * Idempotently pushes a completed POS sale and its line items to Supabase PostgreSQL.
 * If running offline or without Supabase credentials, queues to local outbox.
 */
export async function pushSaleToSupabase(
  sale: Sale,
  idempotencyKey: string
): Promise<{ success: boolean; error?: string; fromCloud?: boolean }> {
  const supabase = getSupabase();
  if (!supabase) {
    // Graceful offline fallback: locally durable
    return { success: true, fromCloud: false };
  }

  try {
    // 1. Call atomic database function process_sale_atomic
    const { data, error } = await supabase.rpc('process_sale_atomic', {
      p_sale_json: {
        id: sale.id,
        idempotencyKey,
        invoiceNumber: sale.invoiceNumber,
        receiptNumber: sale.receiptNumber,
        organizationId: sale.organizationId,
        branchId: sale.branchId,
        cashierId: sale.cashierId,
        cashierName: sale.cashierName,
        terminalCode: (sale as any).terminalCode || 'TERM-01',
        customerId: sale.customerId,
        customerName: sale.customerName,
        customerPhone: sale.customerPhone,
        customerGstin: sale.customerGstin,
        subtotal: sale.subtotal,
        totalDiscount: sale.discountTotal,
        couponCode: (sale as any).couponCode,
        cgst: sale.cgstTotal,
        sgst: sale.sgstTotal,
        igst: sale.igstTotal,
        totalTax: sale.cgstTotal + sale.sgstTotal + sale.igstTotal,
        roundingAdjustment: sale.roundOff,
        grandTotal: sale.grandTotal,
        amountPaid: sale.payments.reduce((sum, p) => sum + p.amount, 0),
        changeReturned: sale.payments[0]?.changeReturned || 0,
        paymentStatus: sale.paymentStatus,
        primaryPaymentMethod: sale.payments[0]?.method || 'CASH',
        isOfflineCreated: sale.isOfflineCreated,
      },
      p_items_json: sale.items.map((item, idx) => ({
        id: `${sale.id}_item_${idx}`,
        productId: item.product.id,
        sku: item.product.sku,
        productName: item.product.name,
        hsn: item.product.hsn,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discountAmount,
        taxableAmount: item.taxableAmount,
        gstRate: item.product.gstRate,
        cgst: item.cgstAmount,
        sgst: item.sgstAmount,
        igst: item.igstAmount,
        total: item.total,
      })),
      p_payments_json: sale.payments,
    });

    if (error) {
      console.warn('Supabase sale push failed:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, fromCloud: true };
  } catch (err: any) {
    console.warn('Network exception while contacting Supabase:', err.message);
    return { success: false, error: err.message || 'Network error' };
  }
}

/**
 * Atomic customer refund and stock return procedure
 */
export async function pushRefundToSupabase(
  refund: RefundRecord
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };

  try {
    const { error } = await supabase.rpc('process_refund_atomic', {
      p_refund_json: {
        id: refund.id,
        saleId: refund.saleId,
        receiptNumber: refund.receiptNumber,
        refundAmount: refund.refundAmount,
        items: refund.items,
        reason: refund.reason,
        approvedBy: refund.approvedBy,
        refundMethod: refund.refundMethod,
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Refund sync error' };
  }
}

// ============================================================================
// 2. PRODUCTS & INVENTORY DATA ACCESS
// ============================================================================

/**
 * Fetches products from remote Supabase PostgreSQL, returning null if unreachable.
 */
export async function fetchProductsFromSupabase(): Promise<Product[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error || !data) return null;

    return data
      .filter((row: any) => !row.deleted_at)
      .map((row: any) => ({
        id: row.id,
        sku: row.sku,
        barcode: row.barcode,
        hsn: row.hsn,
        name: row.name,
        categoryId: row.category_id || '',
        categoryName: row.category_name || '',
        unit: row.unit || 'PCS',
        costPrice: Number(row.cost_price || 0),
        sellingPrice: Number(row.selling_price || 0),
        gstRate: Number(row.gst_rate || 0),
        currentStock: Number(row.current_stock || 0),
        stockLevel: Number(row.current_stock || 0),
        minStockAlert: Number(row.min_stock_alert || row.min_stock_threshold || 10),
        isActive: row.is_active,
        updatedAt: row.updated_at || new Date().toISOString(),
      }));
  } catch {
    return null;
  }
}

/**
 * Creates or upserts a product record in Supabase
 */
export async function createProductInSupabase(
  product: Product,
  organizationId?: string,
  branchId?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };
  const resolvedOrgId = (organizationId || '').trim();
  const resolvedBranchId = (branchId || '').trim();
  if (!resolvedOrgId || !resolvedBranchId) {
    return { success: false, error: 'Active organization and branch context are required to create products.' };
  }

  try {
    const { error } = await supabase.from('products').upsert({
      id: product.id,
      organization_id: resolvedOrgId,
      branch_id: resolvedBranchId,
      sku: product.sku,
      barcode: product.barcode,
      hsn: product.hsn,
      name: product.name,
      category_id: product.categoryId || null,
      category_name: product.categoryName || null,
      unit: product.unit,
      cost_price: product.costPrice,
      selling_price: product.sellingPrice,
      gst_rate: product.gstRate,
      current_stock: product.currentStock,
      min_stock_threshold: product.minStockAlert,
      is_active: product.isActive,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Updates product in Supabase
 */
export async function updateProductInSupabase(
  id: string,
  updates: Partial<Product>
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };

  try {
    const dbUpdates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.sku !== undefined) dbUpdates.sku = updates.sku;
    if (updates.barcode !== undefined) dbUpdates.barcode = updates.barcode;
    if (updates.hsn !== undefined) dbUpdates.hsn = updates.hsn;
    if (updates.categoryId !== undefined) dbUpdates.category_id = updates.categoryId || null;
    if (updates.categoryName !== undefined) dbUpdates.category_name = updates.categoryName;
    if (updates.unit !== undefined) dbUpdates.unit = updates.unit;
    if (updates.sellingPrice !== undefined) dbUpdates.selling_price = updates.sellingPrice;
    if (updates.costPrice !== undefined) dbUpdates.cost_price = updates.costPrice;
    if (updates.gstRate !== undefined) dbUpdates.gst_rate = updates.gstRate;
    if (updates.currentStock !== undefined) dbUpdates.current_stock = updates.currentStock;
    if (updates.minStockAlert !== undefined) dbUpdates.min_stock_threshold = updates.minStockAlert;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

    const { error } = await supabase.from('products').update(dbUpdates).eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Soft-deletes a product in Supabase (preserving historical invoice FK references).
 */
export async function deleteProductInSupabase(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };

  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('products')
      .update({ is_active: false, deleted_at: now, updated_at: now })
      .eq('id', id);

    if (error && error.message?.toLowerCase().includes('deleted_at')) {
      const { error: fallbackErr } = await supabase
        .from('products')
        .update({ is_active: false, updated_at: now })
        .eq('id', id);
      if (fallbackErr) return { success: false, error: fallbackErr.message };
      return { success: true };
    }
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Persists an inventory stock movement audit record to Supabase.
 */
export async function syncStockMovementToSupabase(
  movement: StockMovement,
  organizationId: string,
  branchId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };
  if (!organizationId || !branchId) {
    return { success: false, error: 'Active organization and branch required.' };
  }

  try {
    const dbType = movement.type === 'RECEIPT' ? 'PURCHASE' : movement.type;
    const { error } = await supabase.from('stock_movements').upsert({
      id: movement.id,
      organization_id: organizationId,
      branch_id: branchId,
      product_id: movement.productId,
      product_name: movement.productName,
      sku: movement.sku || 'SKU',
      type: dbType,
      quantity_change: Number(movement.quantityChange || 0),
      new_balance: Number(movement.newBalance ?? movement.newStock ?? 0),
      reference_id: movement.referenceId || null,
      notes: movement.notes || null,
      performed_by: movement.performedBy || 'Staff',
      timestamp: movement.timestamp || new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================================================
// 3. CUSTOMERS & RECEIVABLES DATA ACCESS
// ============================================================================

/**
 * Fetches customers from remote Supabase PostgreSQL.
 */
export async function fetchCustomersFromSupabase(): Promise<Customer[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name');

    if (error || !data) return null;

    return data
      .filter((row: any) => !row.deleted_at)
      .map((row: any) => ({
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
  } catch {
    return null;
  }
}

/**
 * Creates or upserts customer in Supabase
 */
export async function createCustomerInSupabase(
  customer: Customer,
  organizationId?: string,
  branchId?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };
  const resolvedOrgId = (organizationId || '').trim();
  const resolvedBranchId = (branchId || '').trim();
  if (!resolvedOrgId || !resolvedBranchId) {
    return { success: false, error: 'Active organization and branch context are required to create customers.' };
  }

  try {
    const basePayload: Record<string, any> = {
      id: customer.id,
      organization_id: resolvedOrgId,
      branch_id: resolvedBranchId,
      name: customer.name,
      company_name: customer.companyName || null,
      phone: customer.phone,
      email: customer.email || null,
      gstin: customer.gstin || null,
      address: customer.address || null,
      shipping_address: customer.shippingAddress || null,
      city: customer.city || 'Bengaluru',
      state: customer.state || 'Karnataka',
      state_code: '29',
      credit_limit: customer.creditLimit ?? 25000,
      current_receivable_balance: customer.currentReceivableBalance ?? 0,
      total_orders_count: customer.totalOrdersCount ?? 0,
      created_at: customer.createdAt || new Date().toISOString(),
    };
    const { error } = await supabase.from('customers').upsert(basePayload, { onConflict: 'id' });

    if (error && error.message?.toLowerCase().includes('company_name')) {
      delete basePayload.company_name;
      delete basePayload.shipping_address;
      const { error: fallbackErr } = await supabase.from('customers').upsert(basePayload, { onConflict: 'id' });
      if (fallbackErr) return { success: false, error: fallbackErr.message };
      return { success: true };
    }
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Updates customer in Supabase
 */
export async function updateCustomerInSupabase(
  id: string,
  updates: Partial<Customer>
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };

  try {
    const dbUpdates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.companyName !== undefined) dbUpdates.company_name = updates.companyName || null;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.email !== undefined) dbUpdates.email = updates.email || null;
    if (updates.gstin !== undefined) dbUpdates.gstin = updates.gstin || null;
    if (updates.address !== undefined) dbUpdates.address = updates.address || null;
    if (updates.shippingAddress !== undefined) dbUpdates.shipping_address = updates.shippingAddress || null;
    if (updates.city !== undefined) dbUpdates.city = updates.city || null;
    if (updates.state !== undefined) dbUpdates.state = updates.state;
    if (updates.creditLimit !== undefined) dbUpdates.credit_limit = updates.creditLimit;
    if (updates.currentReceivableBalance !== undefined) {
      dbUpdates.current_receivable_balance = updates.currentReceivableBalance;
    }

    const { error } = await supabase.from('customers').update(dbUpdates).eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Soft-deletes customer in Supabase (preserving historical invoices/payments).
 */
export async function deleteCustomerInSupabase(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };

  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('customers')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', id);

    if (error && error.message?.toLowerCase().includes('deleted_at')) {
      const { error: delErr } = await supabase.from('customers').delete().eq('id', id);
      if (delErr) return { success: false, error: delErr.message };
      return { success: true };
    }
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Updates customer receivable allocation atomically in Supabase via RPC (with safe fallback)
 */
export async function allocateCustomerPaymentInSupabase(
  customerId: string,
  amount: number,
  organizationId?: string,
  method: string = 'CASH',
  utrOrRef?: string,
  idempotencyKey?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };

  try {
    const { error: rpcErr } = await supabase.rpc('process_customer_payment_atomic', {
      p_payment_json: {
        organizationId: organizationId || '',
        customerId,
        amount,
        method,
        utrOrRef: utrOrRef || null,
        idempotencyKey: idempotencyKey || `cpay_${customerId}_${Date.now()}`,
      },
    });
    if (!rpcErr) {
      return { success: true };
    }
    if (!rpcErr.message?.includes('process_customer_payment_atomic')) {
      return { success: false, error: rpcErr.message };
    }

    const { data: cust, error: fetchErr } = await supabase
      .from('customers')
      .select('current_receivable_balance')
      .eq('id', customerId)
      .single();

    if (fetchErr || !cust) return { success: false, error: fetchErr?.message || 'Customer not found' };

    const newBalance = Math.max(0, Number(cust.current_receivable_balance) - amount);
    const { error } = await supabase
      .from('customers')
      .update({ current_receivable_balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', customerId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================================================
// 4. SUPPLIERS (WHOLESALE VENDORS) DATA ACCESS
// ============================================================================

/**
 * Fetches suppliers from Supabase
 */
export async function fetchSuppliersFromSupabase(): Promise<Supplier[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name');

    if (error || !data) return null;

    return data
      .filter((row: any) => !row.deleted_at)
      .map((row: any) => ({
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
        status: row.is_active ? ('ACTIVE' as const) : ('INACTIVE' as const),
        category: row.category || 'Wholesale Distributor',
        purchaseOrdersCount: 0,
        createdAt: row.created_at || new Date().toISOString(),
      }));
  } catch {
    return null;
  }
}

/**
 * Creates or updates supplier in Supabase via idempotent upsert
 */
export async function saveSupplierInSupabase(
  supplier: Supplier,
  organizationId?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };
  const resolvedOrgId = (organizationId || '').trim();
  if (!resolvedOrgId) {
    return { success: false, error: 'Active organization context is required to save suppliers.' };
  }

  try {
    const payload: Record<string, any> = {
      id: supplier.id,
      organization_id: resolvedOrgId,
      name: supplier.name,
      contact_person: supplier.contactPerson || null,
      phone: supplier.phone,
      email: supplier.email || null,
      gstin: supplier.gstin || null,
      address: supplier.address || null,
      city: supplier.city || null,
      state: supplier.state || 'Karnataka',
      opening_balance: Number(supplier.openingBalance ?? 0),
      current_payable_balance: Number(supplier.currentPayableBalance ?? supplier.outstandingBalance ?? 0),
      category: supplier.category || null,
      is_active: supplier.status === 'ACTIVE',
      created_at: supplier.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('suppliers').upsert(payload, { onConflict: 'id' });
    if (error && error.message?.toLowerCase().includes('opening_balance')) {
      delete payload.opening_balance;
      delete payload.current_payable_balance;
      delete payload.category;
      const { error: fallbackErr } = await supabase.from('suppliers').upsert(payload, { onConflict: 'id' });
      if (fallbackErr) return { success: false, error: fallbackErr.message };
      return { success: true };
    }
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createSupplierInSupabase(
  supplier: Supplier,
  organizationId?: string
): Promise<{ success: boolean; error?: string }> {
  return saveSupplierInSupabase(supplier, organizationId);
}

/**
 * Soft-deletes supplier in Supabase
 */
export async function deleteSupplierInSupabase(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };

  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('suppliers')
      .update({ is_active: false, deleted_at: now, updated_at: now })
      .eq('id', id);

    if (error && error.message?.toLowerCase().includes('deleted_at')) {
      const { error: delErr } = await supabase.from('suppliers').delete().eq('id', id);
      if (delErr) return { success: false, error: delErr.message };
      return { success: true };
    }
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================================================
// 5. STORE EXPENSES DATA ACCESS
// ============================================================================

/**
 * Fetches expenses from Supabase
 */
export async function fetchExpensesFromSupabase(): Promise<Expense[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false });

    if (error || !data) return null;

    return data
      .filter((row: any) => !row.deleted_at)
      .map((row: any) => ({
        id: row.id,
        organizationId: row.organization_id,
        branchId: row.branch_id,
        category: row.category as any,
        vendor: row.paid_to,
        date: row.date,
        amount: Number(row.amount),
        gstPaid: Number(row.gst_paid ?? 0),
        isGstInputEligible: row.is_gst_input_eligible !== undefined ? Boolean(row.is_gst_input_eligible) : true,
        paymentMode: (row.payment_mode as any) || 'UPI',
        invoiceRef: row.receipt_ref || undefined,
        notes: row.notes || undefined,
      }));
  } catch {
    return null;
  }
}

/**
 * Creates or updates expense in Supabase
 */
export async function createExpenseInSupabase(
  expense: Expense
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };
  const resolvedOrgId = (expense.organizationId || '').trim();
  const resolvedBranchId = (expense.branchId || '').trim();
  if (!resolvedOrgId || !resolvedBranchId) {
    return { success: false, error: 'Active organization and branch context are required to record expenses.' };
  }

  try {
    const payload: Record<string, any> = {
      id: expense.id,
      organization_id: resolvedOrgId,
      branch_id: resolvedBranchId,
      category: expense.category,
      amount: expense.amount,
      gst_paid: Number(expense.gstPaid || 0),
      is_gst_input_eligible: Boolean(expense.isGstInputEligible),
      paid_to: expense.vendor,
      payment_mode: expense.paymentMode,
      receipt_ref: expense.invoiceRef || null,
      notes: expense.notes || null,
      recorded_by: 'Staff',
      date: expense.date,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('expenses').upsert(payload, { onConflict: 'id' });
    if (error && error.message?.toLowerCase().includes('gst_paid')) {
      delete payload.gst_paid;
      delete payload.is_gst_input_eligible;
      const { error: fallbackErr } = await supabase.from('expenses').upsert(payload, { onConflict: 'id' });
      if (fallbackErr) return { success: false, error: fallbackErr.message };
      return { success: true };
    }
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateExpenseInSupabase(
  expense: Expense
): Promise<{ success: boolean; error?: string }> {
  return createExpenseInSupabase(expense);
}

export async function deleteExpenseInSupabase(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };

  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('expenses')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', id);

    if (error && error.message?.toLowerCase().includes('deleted_at')) {
      const { error: delErr } = await supabase.from('expenses').delete().eq('id', id);
      if (delErr) return { success: false, error: delErr.message };
      return { success: true };
    }
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================================================
// 6. QUOTATIONS & ESTIMATES DATA ACCESS
// ============================================================================

/**
 * Fetches quotations from Supabase
 */
export async function fetchQuotationsFromSupabase(): Promise<Quotation[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('quotations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) return null;

    return data
      .filter((row: any) => !row.deleted_at)
      .map((row: any) => ({
        id: row.id,
        organizationId: row.organization_id,
        branchId: row.branch_id,
        quoteNumber: row.quote_number,
        quoteType: (row.quote_type as any) || 'ONE_TIME',
        customerId: row.customer_id || 'cust_001',
        customerName: row.customer_name,
        companyName: row.company_name || undefined,
        customerEmail: row.customer_email || undefined,
        customerPhone: row.customer_phone || undefined,
        customerGstin: row.customer_gstin || undefined,
        billingAddress: row.billing_address || undefined,
        shippingAddress: row.shipping_address || undefined,
        date: row.date || (row.created_at || new Date().toISOString()).split('T')[0],
        expiryDate: (row.valid_until || new Date().toISOString()).split('T')[0],
        referenceNumber: row.reference_number || undefined,
        salesperson: row.salesperson || undefined,
        projectName: row.project_name || undefined,
        subject: row.subject || undefined,
        items: Array.isArray(row.items) ? row.items : [],
        subtotal: Number(row.subtotal || 0),
        discountTotal: Number(row.discount_total || 0),
        adjustment: Number(row.adjustment || 0),
        taxableTotal: Number(row.taxable_total ?? row.subtotal ?? 0),
        cgstTotal: Number(row.cgst_total ?? Number(row.tax_amount || 0) / 2),
        sgstTotal: Number(row.sgst_total ?? Number(row.tax_amount || 0) / 2),
        igstTotal: Number(row.igst_total || 0),
        roundOff: Number(row.round_off || 0),
        grandTotal: Number(row.grand_total || 0),
        status: (row.status as any) || 'DRAFT',
        notes: row.notes || undefined,
        termsAndConditions: row.terms_and_conditions || undefined,
        emailRecipients: Array.isArray(row.email_recipients) ? row.email_recipients : [],
        pdfTemplate: row.pdf_template || undefined,
        linkedInvoiceId: row.linked_invoice_id || undefined,
        linkedInvoiceNumber: row.linked_invoice_number || undefined,
        customFields: row.custom_fields || undefined,
        activities: Array.isArray(row.activities) ? row.activities : [],
        createdAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
      }));
  } catch {
    return null;
  }
}

/**
 * Saves quotation to Supabase with full items & metadata (gracefully falling back on older schema)
 */
export async function saveQuotationToSupabase(
  quote: Quotation,
  organizationId?: string,
  branchId?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };
  const resolvedOrgId = (quote.organizationId || organizationId || '').trim();
  const resolvedBranchId = (quote.branchId || branchId || '').trim();
  if (!resolvedOrgId || !resolvedBranchId) {
    return { success: false, error: 'Active organization and branch context are required to save quotations.' };
  }

  try {
    const corePayload: Record<string, any> = {
      id: quote.id,
      quote_number: quote.quoteNumber,
      organization_id: resolvedOrgId,
      branch_id: resolvedBranchId,
      customer_id: quote.customerId || null,
      customer_name: quote.customerName,
      company_name: quote.companyName || null,
      valid_until: quote.expiryDate,
      subtotal: quote.subtotal,
      tax_amount: (quote.cgstTotal || 0) + (quote.sgstTotal || 0) + (quote.igstTotal || 0),
      grand_total: quote.grandTotal,
      status: quote.status,
      notes: quote.notes || null,
      created_at: quote.createdAt || new Date().toISOString(),
    };

    const fullPayload: Record<string, any> = {
      ...corePayload,
      quote_type: quote.quoteType || 'ONE_TIME',
      customer_email: quote.customerEmail || null,
      customer_phone: quote.customerPhone || null,
      customer_gstin: quote.customerGstin || null,
      billing_address: quote.billingAddress || null,
      shipping_address: quote.shippingAddress || null,
      date: quote.date || (quote.createdAt || new Date().toISOString()).slice(0, 10),
      reference_number: quote.referenceNumber || null,
      salesperson: quote.salesperson || null,
      project_name: quote.projectName || null,
      subject: quote.subject || null,
      items: quote.items || [],
      discount_total: Number(quote.discountTotal || 0),
      adjustment: Number(quote.adjustment || 0),
      taxable_total: Number(quote.taxableTotal || quote.subtotal || 0),
      cgst_total: Number(quote.cgstTotal || 0),
      sgst_total: Number(quote.sgstTotal || 0),
      igst_total: Number(quote.igstTotal || 0),
      round_off: Number(quote.roundOff || 0),
      terms_and_conditions: quote.termsAndConditions || null,
      email_recipients: quote.emailRecipients || [],
      pdf_template: quote.pdfTemplate || null,
      linked_invoice_id: quote.linkedInvoiceId || null,
      linked_invoice_number: quote.linkedInvoiceNumber || null,
      custom_fields: quote.customFields || {},
      activities: quote.activities || [],
      updated_at: quote.updatedAt || new Date().toISOString(),
    };

    const { error } = await supabase.from('quotations').upsert(fullPayload, { onConflict: 'id' });
    if (error && (error.message?.includes('items') || error.message?.includes('quote_type') || error.message?.includes('column'))) {
      const { error: fallbackErr } = await supabase.from('quotations').upsert(corePayload, { onConflict: 'id' });
      if (fallbackErr) return { success: false, error: fallbackErr.message };
      return { success: true };
    }
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Soft-deletes quotation from Supabase (falling back to hard delete on older schema)
 */
export async function deleteQuotationFromSupabase(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };

  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('quotations')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', id);

    if (error && error.message?.toLowerCase().includes('deleted_at')) {
      const { error: delErr } = await supabase.from('quotations').delete().eq('id', id);
      if (delErr) return { success: false, error: delErr.message };
      return { success: true };
    }
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================================================
// 7. HISTORICAL SALES DATA ACCESS
// ============================================================================

/**
 * Fetches recent sales from Supabase
 */
export async function fetchSalesFromSupabase(): Promise<Sale[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data: salesData, error: salesError } = await supabase
      .from('sales')
      .select('*, sale_items(*), payments(*)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (salesError || !salesData) return null;

    return salesData.map((row: any) => ({
      id: row.id,
      receiptNumber: row.receipt_number,
      invoiceNumber: row.invoice_number,
      organizationId: row.organization_id,
      branchId: row.branch_id,
      branchName: row.branch_name || row.branch_id || 'Main Branch',
      cashierId: row.cashier_id,
      cashierName: row.cashier_name,
      customerId: row.customer_id || undefined,
      customerName: row.customer_name || undefined,
      customerPhone: row.customer_phone || undefined,
      customerGstin: row.customer_gstin || undefined,
      subtotal: Number(row.subtotal),
      discountTotal: Number(row.total_discount || 0),
      taxableTotal: Number(row.subtotal) - Number(row.total_discount || 0),
      cgstTotal: Number(row.cgst || 0),
      sgstTotal: Number(row.sgst || 0),
      igstTotal: Number(row.igst || 0),
      roundOff: Number(row.rounding_adjustment || 0),
      grandTotal: Number(row.grand_total),
      paymentStatus: row.payment_status,
      dueDate: new Date(new Date(row.created_at).getTime() + 15 * 86400000).toISOString().split('T')[0],
      isOfflineCreated: Boolean(row.is_offline_created),
      syncStatus: (row.sync_status as any) || 'SYNCED',
      createdAt: row.created_at,
      items: (row.sale_items || []).map((item: any) => ({
        product: {
          id: item.product_id,
          sku: item.sku,
          barcode: '',
          hsn: item.hsn,
          name: item.product_name,
          categoryId: '',
          categoryName: '',
          unit: 'PCS' as const,
          costPrice: 0,
          sellingPrice: Number(item.unit_price),
          gstRate: Number(item.gst_rate),
          currentStock: 0,
          minStockAlert: 10,
          isActive: true,
          updatedAt: row.created_at,
        },
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        discountPercent: 0,
        discountAmount: Number(item.discount || 0),
        taxableAmount: Number(item.taxable_amount || 0),
        cgstAmount: Number(item.cgst || 0),
        sgstAmount: Number(item.sgst || 0),
        igstAmount: Number(item.igst || 0),
        total: Number(item.total),
      })),
      payments: (row.payments || []).map((pay: any) => ({
        id: pay.id,
        saleId: row.id,
        method: pay.method,
        amount: Number(pay.amount),
        utrOrRef: pay.utr_or_ref,
        gatewayStatus: (pay.gateway_status as any) || 'VERIFIED',
        timestamp: pay.timestamp,
      })),
    }));
  } catch {
    return null;
  }
}

// ============================================================================
// 8. STAFF TIME LOGS DATA ACCESS
// ============================================================================

/**
 * Fetches time logs from Supabase
 */
export async function fetchTimeLogsFromSupabase(): Promise<TimeLog[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('time_logs')
      .select('*')
      .order('date', { ascending: false });

    if (error || !data) return null;

    return data.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      date: row.date,
      hours: Number(row.hours),
      project: row.project,
      task: row.task,
      notes: row.notes || undefined,
      billable: Boolean(row.billable),
      createdAt: row.created_at,
    }));
  } catch {
    return null;
  }
}

/**
 * Inserts time log into Supabase
 */
export async function createTimeLogInSupabase(
  log: TimeLog,
  organizationId?: string,
  branchId?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };
  const resolvedOrgId = (organizationId || '').trim();
  const resolvedBranchId = (branchId || '').trim();
  if (!resolvedOrgId || !resolvedBranchId) {
    return { success: false, error: 'Active organization and branch context are required to log time.' };
  }

  try {
    const { error } = await supabase.from('time_logs').insert({
      id: log.id,
      organization_id: resolvedOrgId,
      branch_id: resolvedBranchId,
      user_id: log.userId,
      user_name: log.userName,
      date: log.date,
      hours: log.hours,
      project: log.project,
      task: log.task,
      notes: log.notes || null,
      billable: log.billable,
      created_at: log.createdAt || new Date().toISOString(),
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================================================
// 9. PROMOTIONAL COUPONS DATA ACCESS
// ============================================================================

/**
 * Fetches coupons from Supabase
 */
export async function fetchCouponsFromSupabase(): Promise<Coupon[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.from('coupons').select('*');
    if (error || !data) return null;

    return data.map((row: any) => ({
      id: row.id,
      code: row.code,
      title: row.description || row.code,
      description: row.description,
      discountType: row.discount_type === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED_AMOUNT',
      discountValue: Number(row.discount_value),
      minOrderValue: Number(row.min_order_value || 0),
      maxDiscountCap: row.max_discount_cap ? Number(row.max_discount_cap) : undefined,
      usageLimit: row.usage_limit || 1000,
      redemptionCount: row.times_used || 0,
      validFrom: row.valid_from || new Date().toISOString(),
      validUntil: row.valid_until || new Date(Date.now() + 365 * 86400000).toISOString(),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at || new Date().toISOString(),
    }));
  } catch {
    return null;
  }
}

// ============================================================================
// 10. ROLE NAVIGATION OVERRIDES
// ============================================================================

/**
 * Fetches saved role navigation overrides from Supabase.
 */
export async function fetchRoleNavigationConfigs(organizationId: string): Promise<Record<string, string[]> | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('role_navigation_configs')
      .select('role, enabled_additional_modules')
      .eq('organization_id', organizationId);

    if (error || !data) return null;

    const result: Record<string, string[]> = {};
    for (const row of data) {
      result[row.role] = row.enabled_additional_modules || [];
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Saves role navigation override to Supabase with strict authorization checks.
 */
export async function saveRoleNavigationConfig(params: {
  organizationId: string;
  branchId?: string;
  role: string;
  enabledAdditionalModules: string[];
  updatedBy: string;
  userRole: string;
}): Promise<{ success: boolean; isOffline?: boolean; message: string }> {
  // Strictly enforce admin-only role navigation governance
  if (!hasPermission(params.userRole, 'ROLES_MANAGE')) {
    return {
      success: false,
      message: 'Access Denied: Only Super Admins and Organization Admins may configure role navigation.',
    };
  }

  if (params.userRole === 'ORG_ADMIN' && params.role === 'SUPER_ADMIN') {
    return {
      success: false,
      message: 'Access Denied: Organization Admins cannot modify Super Admin role policies.',
    };
  }

  const supabase = getSupabase();
  if (!supabase || !isSupabaseConfigured()) {
    return {
      success: false,
      isOffline: true,
      message: 'Cloud Supabase connection not configured or currently offline. Saved to local device storage.',
    };
  }

  try {
    const { error } = await supabase
      .from('role_navigation_configs')
      .upsert(
        {
          organization_id: params.organizationId,
          branch_id: params.branchId || null,
          role: params.role,
          enabled_additional_modules: params.enabledAdditionalModules,
          updated_by: params.updatedBy,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,role' }
      );

    if (error) {
      return {
        success: false,
        message: `Supabase update failed: ${error.message}`,
      };
    }

    return {
      success: true,
      message: 'Role navigation preferences successfully synchronized to Supabase Cloud.',
    };
  } catch (err: any) {
    return {
      success: false,
      isOffline: true,
      message: `Network error connecting to Supabase: ${err.message || 'Offline'}. Saved to local device storage.`,
    };
  }
}

// ============================================================================
// 11. SUPABASE AUTHENTICATION SERVICE
// ============================================================================

/**
 * Authenticates user credentials with Supabase Auth service.
 */
export async function signInWithSupabase(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; user?: any; session?: any }> {
  const supabase = getSupabase();
  if (!supabase) {
    const status = getSupabaseConfigStatus();
    return {
      success: false,
      error: `Authentication service is unavailable. ${status.message}`,
    };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      let msg = error.message;
      if (error.status === 400 || msg.toLowerCase().includes('invalid login credentials')) {
        msg = 'Invalid email or password. Please verify your credentials and try again.';
      } else if (msg.toLowerCase().includes('email not confirmed')) {
        msg = 'Your email address has not been confirmed. Please check your inbox or Supabase project settings.';
      } else if (msg.toLowerCase().includes('invalid path')) {
        msg = 'Invalid Supabase API endpoint configuration. Please verify VITE_SUPABASE_URL in project settings (must not include /rest/v1 subpath).';
      }
      return { success: false, error: msg };
    }
    return { success: true, user: data.user, session: data.session };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to authenticate with Supabase' };
  }
}

/**
 * Registers a new business owner via Supabase Auth.
 */
export async function signUpWithSupabase(
  email: string,
  password: string,
  fullName: string
): Promise<{ success: boolean; error?: string; user?: any; session?: any }> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      success: false,
      error: 'Supabase authentication service is not configured.',
    };
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: fullName },
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, user: data.user, session: data.session };
  } catch (err: any) {
    return { success: false, error: err.message || 'Registration failed' };
  }
}

/**
 * Onboards a newly registered business tenant and binds the owner profile to it.
 */
export async function onboardBusinessInSupabase(params: {
  businessName: string;
  legalName?: string;
  gstin?: string;
  pan?: string;
  state?: string;
  phone?: string;
  planId?: string;
  accessToken?: string;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (params.accessToken) {
      headers['Authorization'] = `Bearer ${params.accessToken}`;
    } else {
      const { session } = await getSupabaseSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    }

    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { success: false, error: errData.message || 'Onboarding request failed' };
    }

    const payload = await res.json();
    return { success: true, data: payload.data };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error during onboarding' };
  }
}

/**
 * Signs out from Supabase Auth service if configured.
 */
export async function signOutSupabase(): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      console.warn('Supabase sign out error', err);
      return { success: false, error: err.message };
    }
  }
  return { success: true };
}

/**
 * Sends a password reset email using Supabase Auth.
 */
export async function resetPasswordWithSupabase(
  email: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      success: false,
      error: 'Supabase authentication service is not configured.',
    };
  }

  try {
    const redirectUrl =
      typeof window !== 'undefined' && window.location?.origin
        ? `${window.location.origin}/#reset-password`
        : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    if (error) {
      console.warn('Supabase password reset warning:', error.message);
    }
    // Return success to prevent email enumeration attacks
    return { success: true };
  } catch (err: any) {
    console.warn('Supabase password reset error:', err);
    return { success: true };
  }
}

/**
 * Updates the authenticated user's password using Supabase Auth.
 */
export async function updateUserPassword(
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      success: false,
      error: 'Supabase authentication service is not configured.',
    };
  }

  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update user password.' };
  }
}

/**
 * Invokes the authoritative server endpoint to provision a staff account with RBAC controls.
 */
export async function provisionStaffUser(params: {
  name: string;
  email: string;
  role: UserRole;
  branchId?: string;
  phone?: string;
}): Promise<{ success: boolean; profile?: any; error?: string }> {
  try {
    const { session } = await getSupabaseSession();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    const res = await fetch('/api/provision-user', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    const json = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: json.message || json.error || 'Failed to provision staff account.',
      };
    }

    return { success: true, profile: json.profile };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Network error during staff provisioning.',
    };
  }
}

/**
 * Retrieves the current active Supabase Auth session, if any.
 */
export async function getSupabaseSession(): Promise<{ session: any; user: any; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { session: null, user: null, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      return { session: null, user: null, error: error.message };
    }
    return { session: data.session, user: data.session?.user || null };
  } catch (err: any) {
    return { session: null, user: null, error: err.message };
  }
}

/**
 * Subscribes to Supabase authentication state changes.
 */
export function subscribeToAuthChanges(
  callback: (event: string, session: any) => void
): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    return () => {};
  }

  try {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });

    return () => {
      subscription?.unsubscribe();
    };
  } catch (err) {
    console.warn('Failed to subscribe to Supabase auth changes', err);
    return () => {};
  }
}

/**
 * Fetches authorized user profile from Supabase PostgreSQL user_profiles table.
 */
export async function fetchUserProfile(
  authUserId: string,
  email?: string
): Promise<UserProfile | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const cleanEmail = email ? email.trim().toLowerCase() : undefined;

    // 1. Primary lookup by auth_user_id or profile id matching Auth UUID
    if (authUserId) {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .or(`auth_user_id.eq.${authUserId},id.eq.${authUserId}`)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('Supabase fetchUserProfile primary query error:', error.message);
      }

      if (data) {
        if (cleanEmail && data.email && data.email.trim().toLowerCase() !== cleanEmail) {
          console.warn('Supabase fetchUserProfile email mismatch across tenant profile', {
            expected: cleanEmail,
            found: data.email,
          });
          return null;
        }

        return {
          id: data.id,
          userCode: data.user_code || undefined,
          name: data.name,
          email: data.email,
          phone: data.phone || '',
          role: data.role as UserRole,
          organizationId: data.organization_id,
          branchId: data.branch_id,
          avatarUrl: data.avatar_url || undefined,
          permissions: Array.isArray(data.permissions) && data.permissions.length > 0
            ? (data.permissions as any)
            : toLegacyPermissions(data.role as UserRole),
        };
      }
    }

    // 2. Secondary fallback lookup by email if auth_user_id wasn't linked yet
    if (cleanEmail) {
      const { data: emailData, error: emailErr } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('email', cleanEmail)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (emailErr) {
        console.warn('Supabase fetchUserProfile email fallback error:', emailErr.message);
      }

      if (emailData) {
        // Link auth_user_id to user_profiles if missing
        if (authUserId && (!emailData.auth_user_id || emailData.auth_user_id !== authUserId)) {
          supabase
            .from('user_profiles')
            .update({ auth_user_id: authUserId, updated_at: new Date().toISOString() })
            .eq('id', emailData.id)
            .then(({ error: updateErr }) => {
              if (updateErr) {
                console.warn('Failed to auto-link auth_user_id on user_profiles:', updateErr.message);
              }
            });
        }

        return {
          id: emailData.id,
          userCode: emailData.user_code || undefined,
          name: emailData.name,
          email: emailData.email,
          phone: emailData.phone || '',
          role: emailData.role as UserRole,
          organizationId: emailData.organization_id,
          branchId: emailData.branch_id,
          avatarUrl: emailData.avatar_url || undefined,
          permissions: Array.isArray(emailData.permissions) && emailData.permissions.length > 0
            ? (emailData.permissions as any)
            : toLegacyPermissions(emailData.role as UserRole),
        };
      }
    }

    return null;
  } catch (err) {
    console.warn('Failed to fetch user profile from Supabase:', err);
    return null;
  }
}

/**
 * Fetches store branches belonging strictly to the specified organization.
 */
export async function fetchOrganizationBranches(organizationId: string): Promise<Branch[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (error || !data) return null;

    return data.map((row: any) => ({
      id: row.id,
      organizationId: row.organization_id,
      code: row.code || 'MAIN-01',
      name: row.name,
      city: row.city,
      state: row.state,
      address: row.address,
      phone: row.phone,
      isMainBranch: Boolean(row.is_headquarters),
      activeTerminalCount: row.max_terminals || 4,
    }));
  } catch {
    return null;
  }
}

/**
 * Fetches subscription status for the given organization.
 */
export async function fetchOrganizationSubscription(
  organizationId: string
): Promise<{ status: string; planId: string } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('business_subscriptions')
      .select('status, plan_id')
      .eq('organization_id', organizationId)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      status: data.status,
      planId: data.plan_id,
    };
  } catch {
    return null;
  }
}


/**
 * Idempotently pushes a batch of sync outbox items to Supabase or server sync proxy.
 */
export async function pushSyncOutboxBatch(
  deviceId: string,
  items: SyncOutboxItem[]
): Promise<{ processedIds: string[]; errors: Array<{ id: string; error: string }> }> {
  // If Supabase is available, push via authenticated server-side sync proxy first
  try {
    const { session } = await getSupabaseSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    const res = await fetch('/api/sync-push', {
      method: 'POST',
      headers,
      body: JSON.stringify({ deviceId, items }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        processedIds: Array.isArray(data.processedIds) ? data.processedIds : [],
        errors: Array.isArray(data.conflicts) ? data.conflicts : [],
      };
    }

    const errBody = await res.json().catch(() => ({}));
    if (res.status === 409 && Array.isArray(errBody.conflicts)) {
      return {
        processedIds: Array.isArray(errBody.processedIds) ? errBody.processedIds : [],
        errors: errBody.conflicts,
      };
    }
    return {
      processedIds: [],
      errors: items.map((i) => ({ id: i.id, error: errBody?.error || `Sync failed with HTTP ${res.status}` })),
    };
  } catch (err: any) {
    console.warn('API sync endpoint unreachable, testing direct Supabase fallback:', err);
  }

  const supabase = getSupabase();
  if (supabase) {
    const processedIds: string[] = [];
    const errors: Array<{ id: string; error: string }> = [];

    for (const item of items) {
      try {
        const itemOrgId = (item.organizationId || (item.payload as any)?.organizationId || '').trim();
        if (!itemOrgId) {
          errors.push({ id: item.id, error: 'Missing organizationId on outbox item' });
          continue;
        }
        const { error } = await supabase.from('sync_outbox_events').upsert({
          id: item.id,
          organization_id: itemOrgId,
          branch_id: item.branchId || (item.payload as any)?.branchId || null,
          idempotency_key: item.idempotencyKey,
          device_id: deviceId,
          event_type: item.eventType,
          entity_id: item.entityId,
          payload: item.payload,
          status: 'SYNCED',
          ingested_at: new Date().toISOString(),
        });

        if (!error) {
          processedIds.push(item.id);
        } else {
          errors.push({ id: item.id, error: error.message });
        }
      } catch (e: any) {
        errors.push({ id: item.id, error: e.message });
      }
    }

    return { processedIds, errors };
  }

  return {
    processedIds: [],
    errors: items.map((i) => ({ id: i.id, error: 'Database unreachable or offline' })),
  };
}

/**
 * Fetches bank accounts for organization from Supabase.
 */
export async function fetchBankAccountsFromSupabase(organizationId: string): Promise<BankAccount[] | null> {
  const supabase = getSupabase();
  if (!supabase || isTableMarkedUnavailable('bank_accounts')) return null;

  try {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('organization_id', organizationId)
      .order('account_name', { ascending: true });

    if (error) {
      handleSchemaTableError('bank_accounts', error);
      return null;
    }
    if (!data) return null;

    return data
      .filter((row: any) => !row.deleted_at)
      .map((row: any) => ({
        id: row.id,
        organizationId: row.organization_id,
        branchId: row.branch_id || 'ALL',
        accountName: row.account_name,
        accountHolderName: row.account_holder_name || row.account_name,
        accountNumber: row.account_number,
        bankName: row.bank_name,
        ifscCode: row.ifsc_code,
        branchName: row.branch_name,
        accountType: row.account_type || 'CURRENT',
        openingBalance: Number(row.opening_balance || 0),
        currentBalance: Number(row.current_balance || 0),
        isPrimary: Boolean(row.is_primary),
        status: row.status || 'ACTIVE',
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
  } catch {
    return null;
  }
}

/**
 * Saves or updates a bank account in Supabase.
 */
export async function saveBankAccountToSupabase(account: BankAccount): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };
  if (isTableMarkedUnavailable('bank_accounts')) {
    return { success: false, error: 'Supabase bank_accounts schema migration pending' };
  }

  try {
    const { error } = await supabase.from('bank_accounts').upsert({
      id: account.id,
      organization_id: account.organizationId,
      branch_id: sanitizeBranchIdForDb(account.branchId),
      account_name: account.accountName,
      account_holder_name: account.accountHolderName || account.accountName,
      account_number: account.accountNumber || 'CASH',
      bank_name: account.bankName || 'Cash Drawer',
      ifsc_code: account.ifscCode || 'CASH',
      branch_name: account.branchName || null,
      account_type: account.accountType || 'CURRENT',
      opening_balance: Number(account.openingBalance || 0),
      current_balance: Number(account.currentBalance || 0),
      is_primary: Boolean(account.isPrimary),
      status: account.status || 'ACTIVE',
      notes: account.notes || null,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      handleSchemaTableError('bank_accounts', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save bank account' };
  }
}

/**
 * Fetches credit notes for organization from Supabase.
 */
export async function fetchCreditNotesFromSupabase(organizationId: string): Promise<CreditNote[] | null> {
  const supabase = getSupabase();
  if (!supabase || isTableMarkedUnavailable('credit_notes')) return null;

  try {
    const { data, error } = await supabase
      .from('credit_notes')
      .select('*, credit_note_items(*)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      handleSchemaTableError('credit_notes', error);
      return null;
    }
    if (!data) return null;

    return data.map((row: any) => ({
      id: row.id,
      creditNoteNumber: row.credit_note_number,
      organizationId: row.organization_id,
      branchId: row.branch_id || 'ALL',
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerGstin: row.customer_gstin,
      invoiceId: row.invoice_id,
      invoiceNumber: row.invoice_number,
      subtotal: Number(row.subtotal || 0),
      taxableTotal: Number(row.taxable_total || 0),
      cgstTotal: Number(row.cgst_total || 0),
      sgstTotal: Number(row.sgst_total || 0),
      igstTotal: Number(row.igst_total || 0),
      totalTax: Number(row.total_tax || 0),
      totalCreditAmount: Number(row.total_credit_amount || 0),
      allocatedAmount: Number(row.allocated_amount || 0),
      remainingAmount: Number(row.remaining_amount || 0),
      reason: row.reason,
      notes: row.notes,
      status: row.status,
      restockInventory: Boolean(row.restock_inventory),
      items: (row.credit_note_items || []).map((i: any) => ({
        id: i.id,
        productId: i.product_id,
        productName: i.product_name,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unit_price),
        taxableAmount: Number(i.taxable_amount),
        taxRate: Number(i.tax_rate),
        cgstRate: Number(i.cgst_rate || 0),
        cgstAmount: Number(i.cgst_amount || 0),
        sgstRate: Number(i.sgst_rate || 0),
        sgstAmount: Number(i.sgst_amount || 0),
        igstRate: Number(i.igst_rate || 0),
        igstAmount: Number(i.igst_amount || 0),
        total: Number(i.total),
      })),
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      approvedBy: row.approved_by,
      approvedByName: row.approved_by_name,
      approvedAt: row.approved_at,
      issuedBy: row.issued_by,
      issuedByName: row.issued_by_name,
      issueDate: row.issue_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch {
    return null;
  }
}

/**
 * Fetches purchase orders from Supabase.
 */
export async function fetchPurchaseOrdersFromSupabase(organizationId: string): Promise<PurchaseOrder[] | null> {
  const supabase = getSupabase();
  if (!supabase || isTableMarkedUnavailable('purchase_orders')) return null;

  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*, purchase_order_items(*)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      handleSchemaTableError('purchase_orders', error);
      return null;
    }
    if (!data) return null;

    return data.map((row: any) => ({
      id: row.id,
      poNumber: row.po_number,
      organizationId: row.organization_id,
      branchId: row.branch_id || 'ALL',
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      supplierGstin: row.supplier_gstin,
      orderDate: row.order_date,
      expectedDeliveryDate: row.expected_delivery_date,
      subtotal: Number(row.subtotal || 0),
      taxTotal: Number(row.tax_total || 0),
      discountTotal: Number(row.discount_total || 0),
      additionalCharges: Number(row.additional_charges || 0),
      grandTotal: Number(row.grand_total || 0),
      receivedTotal: Number(row.received_total || 0),
      status: row.status,
      notes: row.notes,
      items: (row.purchase_order_items || []).map((i: any) => ({
        id: i.id,
        productId: i.product_id,
        productName: i.product_name,
        orderedQuantity: Number(i.ordered_quantity),
        receivedQuantity: Number(i.received_quantity || 0),
        unitPrice: Number(i.unit_price),
        taxRate: Number(i.tax_rate || 0),
        taxAmount: Number(i.tax_amount || 0),
        total: Number(i.total),
      })),
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch {
    return null;
  }
}

/**
 * Fetches accounting ledger snapshot (COA, Journals, GL, Budgets, Audit Logs) from /api/accounting.
 */
export async function fetchAccountingSnapshotFromSupabase(): Promise<any | null> {
  try {
    const { session } = await getSupabaseSession();
    if (!session?.access_token) return null;

    const res = await fetch('/api/accounting', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    if (!res.ok) return null;
    const payload = await res.json();
    return payload.data || null;
  } catch {
    return null;
  }
}

/**
 * Upserts a Chart of Accounts ledger directly via /api/accounting.
 */
export async function syncChartOfAccountToSupabase(account: ChartOfAccount): Promise<boolean> {
  try {
    const { session } = await getSupabaseSession();
    if (!session?.access_token) return false;
    const res = await fetch('/api/accounting', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action: 'UPSERT_COA', payload: account }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Persists and optionally posts a Journal Entry atomically via /api/accounting.
 */
export async function syncJournalEntryToSupabase(
  entry: JournalEntry,
  postImmediately = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const { session } = await getSupabaseSession();
    if (!session?.access_token) return { success: false, error: 'Not authenticated' };
    const res = await fetch('/api/accounting', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: 'CREATE_JOURNAL',
        payload: { ...entry, postImmediately },
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.message || 'Journal sync failed' };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

async function postAccountingAction(action: string, payload: any): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { session } = await getSupabaseSession();
    if (!session?.access_token) return { success: false, error: 'Not authenticated' };
    const res = await fetch('/api/accounting', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, payload }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: json.message || json.error || `${action} failed` };
    return { success: true, data: json.data };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

export async function deleteChartOfAccountInSupabase(accountId: string): Promise<boolean> {
  const res = await postAccountingAction('DELETE_COA', { accountId });
  return res.success;
}

export async function postJournalEntryInSupabase(journalId: string): Promise<boolean> {
  const res = await postAccountingAction('POST_JOURNAL', { journalId });
  return res.success;
}

export async function reverseJournalEntryInSupabase(journalId: string, reason: string): Promise<boolean> {
  const res = await postAccountingAction('REVERSE_JOURNAL', { journalId, reason });
  return res.success;
}

export async function syncAccountingPeriodLockToSupabase(
  period: Partial<AccountingPeriod> & { periodId?: string; lock: boolean }
): Promise<boolean> {
  const res = await postAccountingAction('TOGGLE_PERIOD_LOCK', {
    periodId: period.periodId || period.id,
    fiscalYear: period.fiscalYear,
    name: period.name,
    startDate: period.startDate,
    endDate: period.endDate,
    lock: period.lock,
  });
  return res.success;
}

export async function syncBudgetToSupabase(budget: Budget, isRevision = false): Promise<boolean> {
  const res = await postAccountingAction(isRevision ? 'REVISE_BUDGET' : 'UPSERT_BUDGET', budget);
  return res.success;
}

export async function approveBudgetInSupabase(budgetId: string): Promise<boolean> {
  const res = await postAccountingAction('APPROVE_BUDGET', { budgetId });
  return res.success;
}

export async function syncBankReconciliationToSupabase(recon: BankReconciliation): Promise<boolean> {
  const res = await postAccountingAction('SAVE_RECONCILIATION', recon);
  return res.success;
}

export async function syncBulkImportBatchToSupabase(batch: BulkImportBatch): Promise<boolean> {
  const res = await postAccountingAction('RECORD_BULK_BATCH', batch);
  return res.success;
}

export async function syncDebitNoteToSupabase(dn: DebitNote): Promise<{ success: boolean; error?: string }> {
  return postAccountingAction('CREATE_DEBIT_NOTE', dn);
}

export async function approveDebitNoteInSupabase(debitNoteId: string): Promise<{ success: boolean; error?: string }> {
  return postAccountingAction('APPROVE_DEBIT_NOTE', { debitNoteId });
}

export async function cancelDebitNoteInSupabase(debitNoteId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  return postAccountingAction('CANCEL_DEBIT_NOTE', { debitNoteId, reason });
}

export async function recordFinancialAuditLogInSupabase(entry: Partial<FinancialAuditLog>): Promise<boolean> {
  const res = await postAccountingAction('AUDIT_LOG', entry);
  return res.success;
}

/**
 * Fetches full organization metadata row from Supabase.
 */
export async function fetchOrganizationFromSupabase(organizationId: string): Promise<Organization | null> {
  const supabase = getSupabase();
  if (!supabase || !organizationId) return null;

  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      name: data.name,
      tradeName: data.trade_name || data.legal_name || data.name,
      gstin: data.gstin || '',
      pan: data.pan || '',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      address: data.address || '',
      city: data.city || '',
      state: data.state || 'Karnataka',
      pincode: data.pincode || '',
      phone: data.phone || '',
      email: data.email || '',
      subscriptionPlanId: data.subscription_plan_id || 'plan_starter_monthly',
      subscriptionStatus: 'ACTIVE',
      currentFiscalYear: '2026-2027',
      logoUrl: sanitizeBrandImageUrl(data.logo_url),
      loginBannerUrl: sanitizeBrandImageUrl(data.login_banner_url),
    };
  } catch {
    return null;
  }
}

/**
 * Updates organization metadata & centralized branding assets in Supabase.
 */
export async function updateOrganizationInSupabase(
  organizationId: string,
  updates: Partial<Organization>
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase || !organizationId) {
    return { success: false, error: 'Supabase client unavailable' };
  }

  try {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.tradeName !== undefined) payload.trade_name = updates.tradeName;
    if (updates.gstin !== undefined) payload.gstin = updates.gstin;
    if (updates.pan !== undefined) payload.pan = updates.pan;
    if (updates.address !== undefined) payload.address = updates.address;
    if (updates.city !== undefined) payload.city = updates.city;
    if (updates.state !== undefined) payload.state = updates.state;
    if (updates.pincode !== undefined) payload.pincode = updates.pincode;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.email !== undefined) payload.email = updates.email;
    if ('logoUrl' in updates) {
      payload.logo_url = updates.logoUrl ? sanitizeBrandImageUrl(updates.logoUrl) || null : null;
    }
    if ('loginBannerUrl' in updates) {
      payload.login_banner_url = updates.loginBannerUrl
        ? sanitizeBrandImageUrl(updates.loginBannerUrl) || null
        : null;
    }

    const { error } = await supabase
      .from('organizations')
      .update(payload)
      .eq('id', organizationId);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update organization in Supabase' };
  }
}

/**
 * Saves or updates a branch in Supabase stores table.
 */
export async function saveBranchToSupabase(branch: Branch, gstin: string = 'URP'): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('stores').upsert({
      id: branch.id,
      organization_id: branch.organizationId,
      code: branch.code,
      name: branch.name,
      city: branch.city || 'Bengaluru',
      state: branch.state || 'Karnataka',
      address: branch.address || '',
      phone: branch.phone || '',
      gstin: gstin || 'URP',
      is_active: true,
      is_headquarters: Boolean(branch.isMainBranch),
      max_terminals: branch.activeTerminalCount || 4,
      updated_at: new Date().toISOString(),
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Fetches bank transactions for organization from Supabase.
 */
export async function fetchBankTransactionsFromSupabase(organizationId: string): Promise<BankTransaction[] | null> {
  const supabase = getSupabase();
  if (!supabase || isTableMarkedUnavailable('bank_transactions')) return null;
  try {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) {
      handleSchemaTableError('bank_transactions', error);
      return null;
    }
    if (!data) return null;

    return data.map((row: any) => ({
      id: row.id,
      organizationId: row.organization_id,
      branchId: row.branch_id || 'ALL',
      accountId: row.bank_account_id,
      accountName: row.bank_account_name,
      bankAccountId: row.bank_account_id,
      bankAccountName: row.bank_account_name,
      transactionNumber: row.transaction_number,
      category: row.category || 'General',
      payeePayer: row.payee_payer || undefined,
      type: (row.category && (row.category.startsWith('CASH_') || row.category.startsWith('BANK_') || row.category.startsWith('TRANSFER_'))
        ? row.category
        : row.type) as any,
      amount: Number(row.amount || 0),
      balanceBefore: Number(row.balance_before || 0),
      balanceAfter: Number(row.balance_after || 0),
      referenceNumber: row.reference_number || '',
      transactionDate: row.transaction_date,
      description: row.description || '',
      transferToAccountId: row.transfer_to_account_id || undefined,
      transferFromAccountId: row.transfer_from_account_id || undefined,
      reversalTransactionId: row.reversal_transaction_id || undefined,
      reversalReason: row.reversal_reason || undefined,
      reversedAt: row.reversed_at || undefined,
      status: row.status === 'REVERSED' ? 'REVERSED' : 'COMPLETED',
      initiatedBy: row.initiated_by,
      createdByName: row.initiated_by,
      createdAt: row.created_at,
    }));
  } catch {
    return null;
  }
}

/**
 * Saves or updates a bank transaction in Supabase (mapping frontend subtypes to DB CHECK enum).
 */
export async function saveBankTransactionToSupabase(tx: BankTransaction): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };
  if (isTableMarkedUnavailable('bank_transactions')) {
    return { success: false, error: 'Supabase bank_transactions schema migration pending' };
  }
  try {
    const rawType = String(tx.type || 'DEPOSIT');
    const dbType: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' =
      rawType.includes('TRANSFER')
        ? 'TRANSFER'
        : rawType.includes('WITHDRAWAL') || rawType === 'REVERSAL'
          ? 'WITHDRAWAL'
          : 'DEPOSIT';

    const accountId = tx.bankAccountId || tx.accountId;
    if (!accountId) return { success: false, error: 'Bank account ID is required for transaction persistence.' };

    const { error } = await supabase.from('bank_transactions').upsert({
      id: tx.id,
      transaction_number: tx.transactionNumber || tx.id.toUpperCase(),
      organization_id: tx.organizationId,
      branch_id: sanitizeBranchIdForDb(tx.branchId),
      bank_account_id: accountId,
      bank_account_name: tx.bankAccountName || tx.accountName || 'Bank Account',
      type: dbType,
      amount: Number(tx.amount || 0),
      balance_before: Number(tx.balanceBefore || 0),
      balance_after: Number(tx.balanceAfter || 0),
      transaction_date: tx.transactionDate || new Date().toISOString().slice(0, 10),
      reference_number: tx.referenceNumber || null,
      description: tx.description || null,
      category: tx.category || rawType,
      payee_payer: tx.payeePayer || null,
      status: tx.status === 'REVERSED' ? 'REVERSED' : 'COMPLETED',
      reversal_reason: tx.reversalReason || null,
      reversed_at: tx.reversedAt || null,
      reversal_transaction_id: tx.reversalTransactionId || null,
      transfer_to_account_id: tx.transferToAccountId || null,
      transfer_from_account_id: tx.transferFromAccountId || null,
      initiated_by: tx.initiatedBy || tx.createdByName || tx.createdBy || 'System',
    });
    if (error) {
      handleSchemaTableError('bank_transactions', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save bank transaction' };
  }
}

/**
 * Saves or updates a credit note and its line items in Supabase.
 */
export async function saveCreditNoteToSupabase(cn: CreditNote): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };
  if (isTableMarkedUnavailable('credit_notes')) {
    return { success: false, error: 'Supabase credit_notes schema migration pending' };
  }
  try {
    const { error } = await supabase.from('credit_notes').upsert({
      id: cn.id,
      credit_note_number: cn.creditNoteNumber,
      organization_id: cn.organizationId,
      branch_id: sanitizeBranchIdForDb(cn.branchId),
      customer_id: cn.customerId,
      customer_name: cn.customerName,
      customer_gstin: cn.customerGstin || null,
      invoice_id: cn.originalSaleId || cn.invoiceId || null,
      invoice_number: cn.originalInvoiceNumber || cn.invoiceNumber || null,
      subtotal: Number(cn.subtotal || 0),
      taxable_total: Number(cn.taxableTotal || 0),
      cgst_total: Number(cn.cgstTotal || 0),
      sgst_total: Number(cn.sgstTotal || 0),
      igst_total: Number(cn.igstTotal || 0),
      total_tax: Number(cn.totalTax || 0),
      total_credit_amount: Number(cn.totalCreditAmount ?? cn.creditAmount ?? 0),
      allocated_amount: Number(cn.allocatedAmount || 0),
      remaining_amount: Number(cn.remainingAmount || 0),
      reason: cn.reason,
      notes: cn.notes || null,
      status: cn.status === 'PENDING_APPROVAL' ? 'DRAFT' : cn.status,
      restock_inventory: cn.restockInventory !== false,
      created_by: cn.createdBy,
      created_by_name: cn.createdByName || null,
      approved_by: cn.approvedBy || null,
      approved_by_name: cn.approvedByName || null,
      approved_at: cn.approvedAt || null,
      issued_by: cn.issuedBy || null,
      issued_by_name: cn.issuedByName || null,
      issue_date: cn.issueDate || cn.date || null,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      handleSchemaTableError('credit_notes', error);
      return { success: false, error: error.message };
    }

    if (Array.isArray(cn.items) && cn.items.length > 0) {
      await supabase.from('credit_note_items').delete().eq('credit_note_id', cn.id);
      const { error: itemsErr } = await supabase.from('credit_note_items').insert(
        cn.items.map((i, idx) => ({
          id: i.id || `${cn.id}_cni_${idx + 1}`,
          credit_note_id: cn.id,
          product_id: i.productId,
          product_name: i.productName,
          quantity: Number(i.returnedQuantity ?? i.quantity ?? 1),
          unit_price: Number(i.unitPrice || 0),
          taxable_amount: Number(i.taxableAmount || 0),
          tax_rate: Number(i.gstRate ?? i.taxRate ?? 0),
          cgst_rate: Number(i.cgstRate || 0),
          cgst_amount: Number(i.cgstAmount || 0),
          sgst_rate: Number(i.sgstRate || 0),
          sgst_amount: Number(i.sgstAmount || 0),
          igst_rate: Number(i.igstRate || 0),
          igst_amount: Number(i.igstAmount || 0),
          total: Number(i.total || 0),
        }))
      );
      if (itemsErr) return { success: false, error: itemsErr.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save credit note' };
  }
}

/**
 * Saves or updates a purchase order and its line items in Supabase.
 */
export async function savePurchaseOrderToSupabase(po: PurchaseOrder): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };
  if (isTableMarkedUnavailable('purchase_orders')) {
    return { success: false, error: 'Supabase purchase_orders schema migration pending' };
  }
  try {
    const { error } = await supabase.from('purchase_orders').upsert({
      id: po.id,
      po_number: po.poNumber,
      organization_id: po.organizationId,
      branch_id: sanitizeBranchIdForDb(po.branchId),
      supplier_id: po.supplierId,
      supplier_name: po.supplierName,
      supplier_gstin: po.supplierGstin || null,
      order_date: po.orderDate,
      expected_delivery_date: po.expectedDeliveryDate || null,
      subtotal: Number(po.subtotal || 0),
      tax_total: Number(po.taxTotal || 0),
      discount_total: Number(po.discountTotal || 0),
      additional_charges: Number(po.additionalCharges || 0),
      grand_total: Number(po.grandTotal || 0),
      received_total: Number(po.receivedTotal || 0),
      status: po.status,
      notes: po.notes || null,
      created_by: po.createdBy,
      created_by_name: po.createdByName || null,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      handleSchemaTableError('purchase_orders', error);
      return { success: false, error: error.message };
    }

    if (Array.isArray(po.items) && po.items.length > 0) {
      await supabase.from('purchase_order_items').delete().eq('purchase_order_id', po.id);
      const { error: itemsErr } = await supabase.from('purchase_order_items').insert(
        po.items.map((i, idx) => ({
          id: i.id || `${po.id}_poi_${idx + 1}`,
          purchase_order_id: po.id,
          product_id: i.productId,
          product_name: i.productName,
          ordered_quantity: Number(i.orderedQuantity || 1),
          received_quantity: Number(i.receivedQuantity || 0),
          unit_price: Number(i.unitPrice ?? i.purchasePrice ?? 0),
          tax_rate: Number(i.taxRate ?? i.gstRate ?? 0),
          tax_amount: Number(i.taxAmount || 0),
          total: Number(i.total || 0),
        }))
      );
      if (itemsErr) return { success: false, error: itemsErr.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save purchase order' };
  }
}

export async function fetchGoodsReceiptsFromSupabase(organizationId: string): Promise<GoodsReceipt[] | null> {
  const supabase = getSupabase();
  if (!supabase || isTableMarkedUnavailable('goods_receipts')) return null;
  try {
    const { data, error } = await supabase
      .from('goods_receipts')
      .select('*, goods_receipt_items(*)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    if (error) {
      handleSchemaTableError('goods_receipts', error);
      return null;
    }
    if (!data) return null;

    return data.map((row: any) => ({
      id: row.id,
      grnNumber: row.grn_number,
      organizationId: row.organization_id,
      branchId: row.branch_id || 'ALL',
      purchaseOrderId: row.purchase_order_id || undefined,
      poNumber: row.po_number || undefined,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      receiptDate: row.received_date,
      receivedDate: row.received_date,
      receivedBy: row.received_by,
      receivedByName: row.received_by_name || undefined,
      notes: row.notes || undefined,
      items: (row.goods_receipt_items || []).map((i: any) => ({
        id: i.id,
        goodsReceiptId: row.id,
        productId: i.product_id,
        productName: i.product_name,
        receivedQuantity: Number(i.quantity_received),
        quantityReceived: Number(i.quantity_received),
        unitPrice: Number(i.unit_price || 0),
        unitCost: Number(i.unit_price || 0),
        batchNumber: i.batch_number || undefined,
        expiryDate: i.expiry_date || undefined,
      })),
      createdAt: row.created_at,
    }));
  } catch {
    return null;
  }
}

export async function saveGoodsReceiptToSupabase(grn: GoodsReceipt): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };
  if (isTableMarkedUnavailable('goods_receipts')) {
    return { success: false, error: 'Supabase goods_receipts schema migration pending' };
  }
  try {
    const { error } = await supabase.from('goods_receipts').upsert({
      id: grn.id,
      grn_number: grn.grnNumber,
      organization_id: grn.organizationId,
      branch_id: sanitizeBranchIdForDb(grn.branchId),
      purchase_order_id: grn.purchaseOrderId || null,
      po_number: grn.poNumber || null,
      supplier_id: grn.supplierId,
      supplier_name: grn.supplierName,
      received_date: grn.receivedDate || grn.receiptDate || new Date().toISOString().slice(0, 10),
      received_by: grn.receivedBy,
      received_by_name: grn.receivedByName || null,
      notes: grn.notes || null,
    });
    if (error) {
      handleSchemaTableError('goods_receipts', error);
      return { success: false, error: error.message };
    }

    if (Array.isArray(grn.items) && grn.items.length > 0) {
      await supabase.from('goods_receipt_items').delete().eq('goods_receipt_id', grn.id);
      const { error: itemsErr } = await supabase.from('goods_receipt_items').insert(
        grn.items.map((i, idx) => ({
          id: i.id || `${grn.id}_gri_${idx + 1}`,
          goods_receipt_id: grn.id,
          product_id: i.productId,
          product_name: i.productName,
          quantity_received: Number(i.quantityReceived ?? i.receivedQuantity ?? 1),
          unit_price: Number(i.unitPrice ?? i.unitCost ?? 0),
          batch_number: i.batchNumber || null,
          expiry_date: i.expiryDate || null,
        }))
      );
      if (itemsErr) return { success: false, error: itemsErr.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save goods receipt' };
  }
}

export async function fetchSupplierBillsFromSupabase(organizationId: string): Promise<SupplierBill[] | null> {
  const supabase = getSupabase();
  if (!supabase || isTableMarkedUnavailable('supplier_bills')) return null;
  try {
    const { data, error } = await supabase
      .from('supplier_bills')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    if (error) {
      handleSchemaTableError('supplier_bills', error);
      return null;
    }
    if (!data) return null;

    return data.map((row: any) => ({
      id: row.id,
      billNumber: row.bill_number,
      supplierInvoiceNumber: row.notes || row.bill_number,
      organizationId: row.organization_id,
      branchId: row.branch_id || 'ALL',
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
      status: row.status,
      notes: row.notes || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch {
    return null;
  }
}

export async function saveSupplierBillToSupabase(bill: SupplierBill): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };
  if (isTableMarkedUnavailable('supplier_bills')) {
    return { success: false, error: 'Supabase supplier_bills schema migration pending' };
  }
  try {
    const dbStatus = bill.status === 'UNPAID' ? 'PENDING' : bill.status;
    const { error } = await supabase.from('supplier_bills').upsert({
      id: bill.id,
      bill_number: bill.billNumber,
      organization_id: bill.organizationId,
      branch_id: sanitizeBranchIdForDb(bill.branchId),
      purchase_order_id: bill.purchaseOrderId || null,
      po_number: bill.poNumber || null,
      supplier_id: bill.supplierId,
      supplier_name: bill.supplierName,
      supplier_gstin: bill.supplierGstin || null,
      bill_date: bill.billDate,
      due_date: bill.dueDate || null,
      subtotal: Number(bill.subtotal || 0),
      taxable_total: Number(bill.taxableTotal || 0),
      gst_total: Number(bill.gstTotal || 0),
      discount_total: Number(bill.discountTotal || 0),
      additional_charges: Number(bill.additionalCharges || 0),
      total_amount: Number(bill.totalAmount || 0),
      paid_amount: Number(bill.paidAmount || 0),
      outstanding_amount: Number(bill.outstandingAmount || 0),
      status: dbStatus,
      notes: bill.notes || bill.supplierInvoiceNumber || null,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      handleSchemaTableError('supplier_bills', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save supplier bill' };
  }
}

export async function fetchSupplierPaymentsFromSupabase(organizationId: string): Promise<SupplierPayment[] | null> {
  const supabase = getSupabase();
  if (!supabase || isTableMarkedUnavailable('supplier_payments')) return null;
  try {
    const { data, error } = await supabase
      .from('supplier_payments')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    if (error) {
      handleSchemaTableError('supplier_payments', error);
      return null;
    }
    if (!data) return null;

    return data.map((row: any) => ({
      id: row.id,
      paymentNumber: row.payment_number,
      organizationId: row.organization_id,
      branchId: row.branch_id || 'ALL',
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
      createdBy: row.created_by,
      createdByName: row.created_by_name || undefined,
      createdAt: row.created_at,
    }));
  } catch {
    return null;
  }
}

export async function saveSupplierPaymentToSupabase(payment: SupplierPayment): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };
  if (isTableMarkedUnavailable('supplier_payments')) {
    return { success: false, error: 'Supabase supplier_payments schema migration pending' };
  }
  try {
    const rawMethod = String(payment.paymentMethod || 'BANK').toUpperCase();
    const dbMethod = ['CASH', 'UPI', 'CARD', 'BANK', 'CHEQUE', 'NEFT/RTGS'].includes(rawMethod) ? rawMethod : 'BANK';
    const baseRow: Record<string, any> = {
      id: payment.id,
      payment_number: payment.paymentNumber,
      organization_id: payment.organizationId,
      branch_id: sanitizeBranchIdForDb(payment.branchId),
      supplier_id: payment.supplierId,
      supplier_name: payment.supplierName,
      supplier_bill_id: payment.supplierBillId || null,
      bill_number: payment.billNumber || null,
      amount: Number(payment.amount || 0),
      payment_method: dbMethod,
      bank_account_id: payment.bankAccountId || null,
      bank_account_name: payment.bankAccountName || null,
      payment_date: payment.paymentDate,
      reference_number: payment.referenceNumber || null,
      notes: payment.notes || null,
      allocated_bills: Array.isArray(payment.allocatedBills) ? payment.allocatedBills : [],
      is_advance: Boolean(payment.isAdvance),
      status: payment.status === 'REVERSED' ? 'REVERSED' : 'COMPLETED',
      reversal_reason: payment.reversalReason || null,
      reversed_at: payment.reversedAt || null,
      reversed_by: payment.reversedBy || null,
      created_by: payment.createdBy,
      created_by_name: payment.createdByName || null,
    };

    const { error } = await supabase.from('supplier_payments').upsert(baseRow);
    if (error && (error.message?.includes('allocated_bills') || error.message?.includes('is_advance'))) {
      delete baseRow.allocated_bills;
      delete baseRow.is_advance;
      delete baseRow.status;
      delete baseRow.reversal_reason;
      delete baseRow.reversed_at;
      delete baseRow.reversed_by;
      const { error: fallbackErr } = await supabase.from('supplier_payments').upsert(baseRow);
      if (fallbackErr) return { success: false, error: fallbackErr.message };
      return { success: true };
    }
    if (error) {
      handleSchemaTableError('supplier_payments', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save supplier payment' };
  }
}

export async function fetchCustomerReceiptsFromSupabase(organizationId: string): Promise<CustomerReceipt[] | null> {
  const supabase = getSupabase();
  if (!supabase || isTableMarkedUnavailable('customer_receipts')) return null;
  try {
    const { data, error } = await supabase
      .from('customer_receipts')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    if (error) {
      handleSchemaTableError('customer_receipts', error);
      return null;
    }
    if (!data) return null;

    return data.map((row: any) => ({
      id: row.id,
      receiptNumber: row.receipt_number,
      organizationId: row.organization_id,
      branchId: row.branch_id || 'ALL',
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
      createdBy: row.created_by,
      createdByName: row.created_by_name || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch {
    return null;
  }
}

export async function saveCustomerReceiptToSupabase(receipt: CustomerReceipt): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase unconfigured' };
  if (isTableMarkedUnavailable('customer_receipts')) {
    return { success: false, error: 'Supabase customer_receipts schema migration pending' };
  }
  try {
    const rawMethod = String(receipt.paymentMethod || 'CASH').toUpperCase();
    const dbMethod = ['CASH', 'UPI', 'CARD', 'BANK', 'CHEQUE', 'NEFT/RTGS'].includes(rawMethod) ? rawMethod : 'BANK';
    const { error } = await supabase.from('customer_receipts').upsert({
      id: receipt.id,
      receipt_number: receipt.receiptNumber,
      organization_id: receipt.organizationId,
      branch_id: sanitizeBranchIdForDb(receipt.branchId),
      customer_id: receipt.customerId,
      customer_name: receipt.customerName,
      amount: Number(receipt.amount || 0),
      allocated_amount: Number(receipt.allocatedAmount || 0),
      unallocated_advance: Number(receipt.unallocatedAdvance || 0),
      payment_method: dbMethod,
      bank_account_id: receipt.bankAccountId || null,
      bank_account_name: receipt.bankAccountName || null,
      receipt_date: receipt.receiptDate,
      reference_number: receipt.referenceNumber || null,
      notes: receipt.notes || null,
      allocations: Array.isArray(receipt.allocations) ? receipt.allocations : [],
      status: receipt.status === 'REVERSED' ? 'REVERSED' : 'COMPLETED',
      reversal_reason: receipt.reversalReason || null,
      reversed_at: receipt.reversedAt || null,
      reversed_by: receipt.reversedBy || null,
      journal_entry_id: receipt.journalEntryId || null,
      journal_number: receipt.journalNumber || null,
      created_by: receipt.createdBy,
      created_by_name: receipt.createdByName || null,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      handleSchemaTableError('customer_receipts', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save customer receipt' };
  }
}

// ============================================================================
// 12. COUPONS, CUSTOM FIELDS, PRINTERS, USER PREFERENCES & REALTIME SYNC
// ============================================================================

export async function saveCouponToSupabase(coupon: Coupon, organizationId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !organizationId) return false;
  try {
    const { error } = await supabase.from('coupons').upsert({
      id: coupon.id,
      organization_id: organizationId,
      code: coupon.code,
      description: coupon.description || coupon.title,
      discount_type: coupon.discountType === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED',
      discount_value: Number(coupon.discountValue || 0),
      min_order_value: Number(coupon.minOrderValue || 0),
      max_discount_cap: coupon.maxDiscountCap ?? null,
      usage_limit: coupon.usageLimit ?? null,
      times_used: Number(coupon.redemptionCount || 0),
      valid_from: coupon.validFrom || new Date().toISOString(),
      valid_until: coupon.validUntil || null,
      is_active: coupon.isActive !== false,
    }, { onConflict: 'id' });
    return !error;
  } catch {
    return false;
  }
}

export async function deleteCouponInSupabase(id: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('coupons').delete().eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

export async function fetchCustomFieldsFromSupabase(organizationId: string): Promise<CustomFieldDefinition[] | null> {
  const supabase = getSupabase();
  if (!supabase || !organizationId) return null;
  try {
    const { data, error } = await supabase
      .from('custom_field_definitions')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true });
    if (error || !data) return null;
    return data.map((row: any) => ({
      id: row.id,
      module: row.module,
      name: row.name,
      label: row.label,
      type: row.type,
      defaultValue: row.default_value || undefined,
      options: Array.isArray(row.options) ? row.options : undefined,
    }));
  } catch {
    return null;
  }
}

export async function saveCustomFieldToSupabase(field: CustomFieldDefinition, organizationId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !organizationId) return false;
  try {
    const { error } = await supabase.from('custom_field_definitions').upsert({
      id: field.id,
      organization_id: organizationId,
      module: field.module,
      name: field.name,
      label: field.label,
      type: field.type,
      default_value: field.defaultValue || null,
      options: field.options || null,
    }, { onConflict: 'id' });
    return !error;
  } catch {
    return false;
  }
}

export async function deleteCustomFieldInSupabase(id: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('custom_field_definitions').delete().eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

export async function fetchPrinterConfigFromSupabase(
  organizationId: string,
  branchId?: string
): Promise<HardwarePrinterConfig | null> {
  const supabase = getSupabase();
  if (!supabase || !organizationId) return null;
  try {
    let q = supabase.from('hardware_printers').select('*').eq('organization_id', organizationId);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data, error } = await q.limit(1).maybeSingle();
    if (error || !data) return null;
    return {
      printerType: data.printer_type || 'THERMAL_80MM',
      storeHeader: data.store_header || '',
      addressLine: data.address_line || '',
      gstinLine: data.gstin_line || '',
      fssaiLine: data.fssai_line || undefined,
      phoneLine: data.phone_line || '',
      footerGreeting: data.footer_greeting || '',
      autoCutPaper: Boolean(data.auto_cut_paper),
      kickCashDrawer: Boolean(data.kick_cash_drawer),
      showHsnSummary: Boolean(data.show_hsn_summary),
    };
  } catch {
    return null;
  }
}

export async function savePrinterConfigToSupabase(
  config: HardwarePrinterConfig,
  organizationId: string,
  branchId: string
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !organizationId) return false;
  try {
    const { error } = await supabase.from('hardware_printers').upsert({
      id: `prt_${organizationId}_${branchId || 'main'}`,
      organization_id: organizationId,
      branch_id: branchId || null,
      printer_type: config.printerType,
      store_header: config.storeHeader,
      address_line: config.addressLine,
      gstin_line: config.gstinLine,
      fssai_line: config.fssaiLine || null,
      phone_line: config.phoneLine,
      footer_greeting: config.footerGreeting,
      auto_cut_paper: config.autoCutPaper,
      kick_cash_drawer: config.kickCashDrawer,
      show_hsn_summary: config.showHsnSummary,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    return !error;
  } catch {
    return false;
  }
}

export async function fetchUserPreferencesFromSupabase(
  organizationId: string,
  userId: string
): Promise<{
  quotePreferences?: Record<string, any>;
  customPreferences?: Record<string, any>;
  drafts?: Record<string, any>;
  fiscalYear?: string;
} | null> {
  const supabase = getSupabase();
  if (!supabase || !organizationId || !userId || isTableMarkedUnavailable('user_preferences')) return null;
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      handleSchemaTableError('user_preferences', error);
      return null;
    }
    if (!data) return null;
    return {
      quotePreferences: data.quote_preferences || undefined,
      customPreferences: data.custom_preferences || undefined,
      drafts: data.drafts || undefined,
      fiscalYear: data.fiscal_year || undefined,
    };
  } catch {
    return null;
  }
}

export async function saveUserPreferencesToSupabase(params: {
  organizationId: string;
  userId: string;
  authUserId?: string;
  quotePreferences?: Record<string, any>;
  customPreferences?: Record<string, any>;
  drafts?: Record<string, any>;
  fiscalYear?: string;
}): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !params.organizationId || !params.userId || isTableMarkedUnavailable('user_preferences')) return false;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const authUid = params.authUserId || sessionData?.session?.user?.id || null;
    const { error } = await supabase.from('user_preferences').upsert({
      id: `${params.organizationId}_${params.userId}`,
      organization_id: params.organizationId,
      auth_user_id: authUid,
      user_id: params.userId,
      quote_preferences: params.quotePreferences || {},
      custom_preferences: params.customPreferences || {},
      drafts: params.drafts || {},
      fiscal_year: params.fiscalYear || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,user_id' });
    if (error) {
      handleSchemaTableError('user_preferences', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function pullIncrementalUpdatesFromSupabase(since?: string): Promise<{
  serverTimestamp: string;
  events: any[];
  entities: Record<string, any[]>;
} | null> {
  try {
    const { session } = await getSupabaseSession();
    if (!session?.access_token) return null;
    const url = since ? `/api/sync-pull?since=${encodeURIComponent(since)}` : '/api/sync-pull';
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function subscribeToOrganizationRealtime(
  organizationId: string,
  onTableChange: (table: string, payload: any) => void
): () => void {
  const supabase = getSupabase();
  if (!supabase || !organizationId) return () => {};

  const tables = [
    'products',
    'customers',
    'suppliers',
    'quotations',
    'sales',
    'expenses',
    'bank_accounts',
    'bank_transactions',
    'credit_notes',
    'purchase_orders',
    'supplier_bills',
    'supplier_payments',
    'customer_receipts',
    'debit_notes',
    'journal_entries',
    'user_preferences',
  ];

  try {
    const channel = supabase.channel(`org-sync-${organizationId}`);
    for (const tbl of tables) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tbl,
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => onTableChange(tbl, payload)
      );
    }
    channel.subscribe();
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore cleanup error
      }
    };
  } catch {
    return () => {};
  }
}
