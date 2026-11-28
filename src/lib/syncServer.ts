/**
 * SLATE POS — Authoritative Server-Side Sync Replay & Incremental Pull Engine
 * Shared by Vercel Serverless Functions (/api/sync-push, /api/sync-pull) and Express (server.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { hasAnyPermission, hasPermission, type GranularPermission } from './permissions';

export interface SyncPushItemInput {
  id?: string;
  eventType: string;
  entityId: string;
  payload: any;
  branchId?: string;
  idempotencyKey?: string;
  expectedVersion?: number;
  expectedUpdatedAt?: string;
}

export interface SyncConflictRecord {
  id: string;
  entityId?: string;
  eventType?: string;
  code: 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION_ERROR' | 'DB_ERROR';
  error: string;
  serverRecord?: any;
}

const EVENT_PERMISSIONS: Record<string, GranularPermission[]> = {
  SALE_CREATED: ['POS_CHECKOUT', 'INVOICES_CREATE'],
  REFUND_RECORDED: ['REFUNDS_CREATE'],
  PAYMENT_ALLOCATED: ['PAYMENTS_COLLECT'],
  STOCK_ADJUSTED: ['INVENTORY_ADJUST', 'PRODUCTS_EDIT'],
  CUSTOMER_CREATED: ['CUSTOMERS_CREATE', 'CUSTOMERS_EDIT'],
  CUSTOMER_UPSERTED: ['CUSTOMERS_CREATE', 'CUSTOMERS_EDIT'],
  CUSTOMER_DELETED: ['CUSTOMERS_DELETE'],
  SUPPLIER_UPSERTED: ['SUPPLIERS_MANAGE'],
  SUPPLIER_DELETED: ['SUPPLIERS_MANAGE'],
  PRODUCT_UPSERTED: ['PRODUCTS_CREATE', 'PRODUCTS_EDIT'],
  PRODUCT_DELETED: ['PRODUCTS_EDIT'],
  QUOTATION_UPSERTED: ['QUOTES_CREATE', 'QUOTES_EDIT'],
  QUOTATION_DELETED: ['QUOTES_DELETE'],
  EXPENSE_UPSERTED: ['EXPENSES_MANAGE'],
  EXPENSE_DELETED: ['EXPENSES_MANAGE'],
  PREFERENCES_UPSERTED: [],
  CUSTOMER_RECEIPT_CREATED: ['PAYMENTS_COLLECT'],
  CUSTOMER_RECEIPT_REVERSED: ['REFUNDS_APPROVE', 'PAYMENTS_COLLECT'],
  BANK_ACCOUNT_UPSERTED: ['BANKING_MANAGE'],
  BANK_TX_CREATED: ['BANKING_MANAGE'],
  CREDIT_NOTE_UPSERTED: ['CREDIT_NOTES_MANAGE'],
  PO_UPSERTED: ['PURCHASE_ORDERS_MANAGE'],
  GRN_CREATED: ['GOODS_RECEIPTS_MANAGE'],
  SUPPLIER_BILL_UPSERTED: ['SUPPLIER_BILLS_MANAGE'],
  SUPPLIER_PAYMENT_UPSERTED: ['SUPPLIER_BILLS_MANAGE'],
  SUPPLIER_PAYMENT_REVERSED: ['SUPPLIER_BILLS_MANAGE', 'JOURNAL_MANAGE'],
  DEBIT_NOTE_UPSERTED: ['DEBIT_NOTES_MANAGE'],
};

function sanitizeBranchId(raw: string | null | undefined): string | null {
  if (!raw || raw === 'ALL' || raw === 'main-branch') return null;
  return raw;
}

export function isAllowedSyncOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return (
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.endsWith('.vercel.app') ||
    origin.endsWith('.run.app')
  );
}

async function checkOptimisticVersion(
  supabase: SupabaseClient,
  table: string,
  id: string,
  orgId: string,
  expectedVersion?: number
): Promise<{ conflict: boolean; serverRecord?: any }> {
  if (!expectedVersion || !id) return { conflict: false };
  const { data } = await supabase
    .from(table)
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (data && typeof data.version === 'number' && data.version > expectedVersion) {
    return { conflict: true, serverRecord: data };
  }
  return { conflict: false };
}

export async function applySyncPushItems(params: {
  supabase: SupabaseClient;
  orgId: string;
  defaultBranchId: string | null;
  role?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  deviceId?: string;
  items: SyncPushItemInput[];
}): Promise<{
  processedIds: string[];
  conflicts: SyncConflictRecord[];
  serverTimestamp: string;
}> {
  const {
    supabase,
    orgId,
    defaultBranchId,
    role,
    actorId,
    actorName,
    deviceId = 'web_terminal',
    items,
  } = params;

  const now = new Date().toISOString();
  const processedIds: string[] = [];
  const conflicts: SyncConflictRecord[] = [];

  for (const item of items) {
    const itemId = item.id || `sync_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const eventType = String(item.eventType || 'GENERIC_EVENT');
    const entityId = String(item.entityId || 'unknown');
    const idempotencyKey = item.idempotencyKey || `${eventType}_${entityId}`;
    const requiredPerms = EVENT_PERMISSIONS[eventType];

    if (requiredPerms && requiredPerms.length > 0 && !hasAnyPermission(role, requiredPerms)) {
      conflicts.push({
        id: itemId,
        entityId,
        eventType,
        code: 'FORBIDDEN',
        error: `Role ${role || 'UNKNOWN'} lacks permission for ${eventType}.`,
      });
      continue;
    }

    try {
      const payload = item.payload || {};
      const scopedBranchId = sanitizeBranchId(payload.branchId || item.branchId || defaultBranchId);

      if (eventType === 'SALE_CREATED' && payload?.id) {
        const mappedItems = (payload.items || []).map((it: any, idx: number) => ({
          id: it.id || `si_${payload.id}_${idx}`,
          productId: it.product?.id || it.productId,
          sku: it.product?.sku || it.sku || '',
          productName: it.product?.name || it.productName || 'Item',
          hsn: it.product?.hsn || it.hsn || '0000',
          quantity: Number(it.quantity || 1),
          unitPrice: Number(it.unitPrice || it.product?.sellingPrice || 0),
          discount: Number(it.discountAmount || 0),
          taxableAmount: Number(it.taxableAmount || 0),
          gstRate: Number(it.product?.gstRate || it.gstRate || 0),
          cgst: Number(it.cgstAmount || 0),
          sgst: Number(it.sgstAmount || 0),
          igst: Number(it.igstAmount || 0),
          total: Number(it.total || 0),
        }));
        const paidTotal = (payload.payments || [])
          .filter((p: any) => p.method !== 'CREDIT')
          .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

        const { error: saleErr } = await supabase.rpc('process_sale_atomic', {
          p_sale_json: {
            id: payload.id,
            idempotencyKey: payload.idempotencyKey || idempotencyKey,
            invoiceNumber: payload.invoiceNumber,
            receiptNumber: payload.receiptNumber,
            organizationId: orgId,
            branchId: scopedBranchId,
            cashierId: payload.cashierId || actorId || 'system',
            cashierName: payload.cashierName || actorName || 'Cashier',
            terminalCode: payload.terminalCode || deviceId,
            customerId: payload.customerId || '',
            customerName: payload.customerName || 'Walk-in Customer',
            customerPhone: payload.customerPhone || '',
            customerGstin: payload.customerGstin || '',
            subtotal: Number(payload.subtotal || 0),
            totalDiscount: Number(payload.discountTotal || 0),
            cgst: Number(payload.cgstTotal || 0),
            sgst: Number(payload.sgstTotal || 0),
            igst: Number(payload.igstTotal || 0),
            totalTax: Number((payload.cgstTotal || 0) + (payload.sgstTotal || 0) + (payload.igstTotal || 0)),
            roundingAdjustment: Number(payload.roundOff || 0),
            grandTotal: Number(payload.grandTotal || 0),
            amountPaid: paidTotal,
            paymentStatus: payload.paymentStatus || 'PAID',
            primaryPaymentMethod: payload.payments?.[0]?.method || 'CASH',
            isOfflineCreated: Boolean(payload.isOfflineCreated),
          },
          p_items_json: mappedItems,
          p_payments_json: payload.payments || [],
        });
        if (saleErr && !saleErr.message?.includes('ALREADY_EXISTS')) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: saleErr.message });
          continue;
        }
      } else if (eventType === 'REFUND_RECORDED' && payload?.id) {
        const { error: refErr } = await supabase.rpc('process_refund_atomic', {
          p_refund_json: payload,
        });
        if (refErr) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: refErr.message });
          continue;
        }
      } else if (eventType === 'PAYMENT_ALLOCATED' && payload?.customerId) {
        const { error: payErr } = await supabase.rpc('process_customer_payment_atomic', {
          p_payment_json: {
            ...payload,
            organizationId: orgId,
            idempotencyKey,
          },
        });
        if (payErr) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: payErr.message });
          continue;
        }
      } else if ((eventType === 'CUSTOMER_CREATED' || eventType === 'CUSTOMER_UPSERTED') && payload?.id) {
        const check = await checkOptimisticVersion(supabase, 'customers', payload.id, orgId, item.expectedVersion);
        if (check.conflict) {
          conflicts.push({
            id: itemId,
            entityId,
            eventType,
            code: 'CONFLICT',
            error: 'Customer was modified on another device.',
            serverRecord: check.serverRecord,
          });
          continue;
        }
        const { error } = await supabase.from('customers').upsert(
          {
            id: payload.id,
            organization_id: orgId,
            branch_id: scopedBranchId,
            name: payload.name,
            company_name: payload.companyName || null,
            phone: payload.phone,
            email: payload.email || null,
            gstin: payload.gstin || null,
            address: payload.address || null,
            shipping_address: payload.shippingAddress || null,
            city: payload.city || null,
            state: payload.state || 'Karnataka',
            credit_limit: Number(payload.creditLimit ?? 25000),
            current_receivable_balance: Number(payload.currentReceivableBalance ?? 0),
            total_orders_count: Number(payload.totalOrdersCount ?? 0),
            deleted_at: null,
          },
          { onConflict: 'id' }
        );
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if (eventType === 'CUSTOMER_DELETED') {
        const { error } = await supabase
          .from('customers')
          .update({ deleted_at: now })
          .eq('id', entityId)
          .eq('organization_id', orgId);
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if (eventType === 'SUPPLIER_UPSERTED' && payload?.id) {
        const check = await checkOptimisticVersion(supabase, 'suppliers', payload.id, orgId, item.expectedVersion);
        if (check.conflict) {
          conflicts.push({
            id: itemId,
            entityId,
            eventType,
            code: 'CONFLICT',
            error: 'Supplier was modified on another device.',
            serverRecord: check.serverRecord,
          });
          continue;
        }
        const { error } = await supabase.from('suppliers').upsert(
          {
            id: payload.id,
            organization_id: orgId,
            name: payload.name,
            contact_person: payload.contactPerson || null,
            phone: payload.phone,
            email: payload.email || null,
            gstin: payload.gstin || null,
            address: payload.address || null,
            city: payload.city || null,
            state: payload.state || 'Karnataka',
            opening_balance: Number(payload.openingBalance ?? 0),
            current_payable_balance: Number(payload.currentPayableBalance ?? payload.outstandingBalance ?? 0),
            category: payload.category || null,
            is_active: payload.status ? payload.status === 'ACTIVE' : true,
            deleted_at: null,
          },
          { onConflict: 'id' }
        );
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if (eventType === 'SUPPLIER_DELETED') {
        const { error } = await supabase
          .from('suppliers')
          .update({ is_active: false, deleted_at: now })
          .eq('id', entityId)
          .eq('organization_id', orgId);
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if (eventType === 'PRODUCT_UPSERTED' && payload?.id) {
        const check = await checkOptimisticVersion(supabase, 'products', payload.id, orgId, item.expectedVersion);
        if (check.conflict) {
          conflicts.push({
            id: itemId,
            entityId,
            eventType,
            code: 'CONFLICT',
            error: 'Product was modified on another device.',
            serverRecord: check.serverRecord,
          });
          continue;
        }
        const { error } = await supabase.from('products').upsert(
          {
            id: payload.id,
            organization_id: orgId,
            branch_id: scopedBranchId,
            sku: payload.sku,
            barcode: payload.barcode || payload.sku,
            hsn: payload.hsn || '0000',
            name: payload.name,
            category_id: payload.categoryId || null,
            category_name: payload.categoryName || 'General',
            unit: payload.unit || 'PCS',
            cost_price: Number(payload.costPrice ?? 0),
            selling_price: Number(payload.sellingPrice ?? 0),
            gst_rate: Number(payload.gstRate ?? 0),
            current_stock: Number(payload.currentStock ?? payload.stockLevel ?? 0),
            min_stock_threshold: Number(payload.minStockAlert ?? 10),
            is_active: payload.isActive ?? true,
            deleted_at: null,
          },
          { onConflict: 'id' }
        );
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if (eventType === 'PRODUCT_DELETED') {
        const { error } = await supabase
          .from('products')
          .update({ is_active: false, deleted_at: now })
          .eq('id', entityId)
          .eq('organization_id', orgId);
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if (eventType === 'STOCK_ADJUSTED' && payload?.productId) {
        const { error: prodErr } = await supabase
          .from('products')
          .update({ current_stock: Number(payload.newBalance ?? 0) })
          .eq('id', payload.productId)
          .eq('organization_id', orgId);
        if (prodErr) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: prodErr.message });
          continue;
        }
        if (payload.movement?.id) {
          await supabase.from('stock_movements').upsert(
            {
              id: payload.movement.id,
              organization_id: orgId,
              branch_id: scopedBranchId || 'br_blr_01',
              product_id: payload.productId,
              product_name: payload.movement.productName || 'Product',
              sku: payload.movement.sku || '',
              type: payload.movement.type === 'RECEIPT' ? 'PURCHASE' : payload.movement.type || 'ADJUSTMENT',
              quantity_change: Number(payload.movement.quantityChange || 0),
              new_balance: Number(payload.newBalance ?? 0),
              reference_id: payload.movement.referenceId || 'ADJ',
              notes: payload.movement.notes || '',
              performed_by: payload.movement.performedBy || actorName || 'System',
              idempotency_key: idempotencyKey,
            },
            { onConflict: 'id' }
          );
        }
      } else if (eventType === 'QUOTATION_UPSERTED' && payload?.id) {
        const check = await checkOptimisticVersion(supabase, 'quotations', payload.id, orgId, item.expectedVersion);
        if (check.conflict) {
          conflicts.push({
            id: itemId,
            entityId,
            eventType,
            code: 'CONFLICT',
            error: 'Quotation was modified on another device.',
            serverRecord: check.serverRecord,
          });
          continue;
        }
        const { error } = await supabase.from('quotations').upsert(
          {
            id: payload.id,
            idempotency_key: idempotencyKey,
            quote_number: payload.quoteNumber,
            organization_id: orgId,
            branch_id: scopedBranchId,
            quote_type: payload.quoteType || 'ONE_TIME',
            customer_id: payload.customerId || null,
            customer_name: payload.customerName,
            company_name: payload.companyName || null,
            customer_email: payload.customerEmail || null,
            customer_phone: payload.customerPhone || null,
            customer_gstin: payload.customerGstin || null,
            billing_address: payload.billingAddress || null,
            shipping_address: payload.shippingAddress || null,
            date: payload.date || payload.quoteDate || now.slice(0, 10),
            valid_until: payload.expiryDate || payload.validUntil || now,
            reference_number: payload.referenceNumber || null,
            salesperson: payload.salesperson || null,
            project_name: payload.projectName || null,
            subject: payload.subject || null,
            items: payload.items || [],
            subtotal: Number(payload.subtotal || 0),
            discount_total: Number(payload.discountTotal || 0),
            adjustment: Number(payload.adjustment || 0),
            taxable_total: Number(payload.taxableTotal || payload.subtotal || 0),
            cgst_total: Number(payload.cgstTotal || 0),
            sgst_total: Number(payload.sgstTotal || 0),
            igst_total: Number(payload.igstTotal || 0),
            tax_amount: Number((payload.cgstTotal || 0) + (payload.sgstTotal || 0) + (payload.igstTotal || 0)),
            round_off: Number(payload.roundOff || 0),
            grand_total: Number(payload.grandTotal || 0),
            status: payload.status || 'DRAFT',
            notes: payload.notes || null,
            terms_and_conditions: payload.termsAndConditions || null,
            email_recipients: payload.emailRecipients || [],
            pdf_template: payload.pdfTemplate || null,
            linked_invoice_id: payload.linkedInvoiceId || null,
            linked_invoice_number: payload.linkedInvoiceNumber || null,
            custom_fields: payload.customFields || {},
            activities: payload.activities || [],
            deleted_at: null,
          },
          { onConflict: 'id' }
        );
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if (eventType === 'QUOTATION_DELETED') {
        const { error } = await supabase
          .from('quotations')
          .update({ deleted_at: now })
          .eq('id', entityId)
          .eq('organization_id', orgId);
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if (eventType === 'EXPENSE_UPSERTED' && payload?.id) {
        const { error } = await supabase.from('expenses').upsert(
          {
            id: payload.id,
            idempotency_key: idempotencyKey,
            organization_id: orgId,
            branch_id: scopedBranchId,
            category: payload.category,
            amount: Number(payload.amount || 0),
            gst_paid: Number(payload.gstPaid || 0),
            is_gst_input_eligible: Boolean(payload.isGstInputEligible),
            paid_to: payload.vendor,
            payment_mode: payload.paymentMode || 'CASH',
            receipt_ref: payload.invoiceRef || null,
            notes: payload.notes || null,
            recorded_by: actorName || 'Admin',
            date: payload.date || now.slice(0, 10),
            deleted_at: null,
          },
          { onConflict: 'id' }
        );
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if (eventType === 'EXPENSE_DELETED') {
        const { error } = await supabase
          .from('expenses')
          .update({ deleted_at: now })
          .eq('id', entityId)
          .eq('organization_id', orgId);
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if (eventType === 'PREFERENCES_UPSERTED' && payload) {
        const prefUserId = String(payload.userId || actorId || 'default');
        const { error } = await supabase.from('user_preferences').upsert(
          {
            id: `${orgId}_${prefUserId}`,
            organization_id: orgId,
            user_id: prefUserId,
            quote_preferences: payload.quotePreferences || {},
            custom_preferences: payload.customPreferences || {},
            drafts: payload.drafts || {},
            fiscal_year: payload.fiscalYear || null,
          },
          { onConflict: 'organization_id,user_id' }
        );
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if (eventType === 'BANK_ACCOUNT_UPSERTED' && payload?.id) {
        const { error } = await supabase.from('bank_accounts').upsert({
          id: payload.id,
          organization_id: orgId,
          branch_id: scopedBranchId,
          account_name: payload.accountName,
          account_holder_name: payload.accountHolderName || payload.accountName,
          account_number: payload.accountNumber || 'CASH',
          bank_name: payload.bankName || 'Cash Drawer',
          ifsc_code: payload.ifscCode || 'CASH',
          branch_name: payload.branchName || null,
          account_type: payload.accountType || 'CURRENT',
          opening_balance: Number(payload.openingBalance || 0),
          current_balance: Number(payload.currentBalance || 0),
          is_primary: Boolean(payload.isPrimary),
          status: payload.status || 'ACTIVE',
          notes: payload.notes || null,
          updated_at: now,
        });
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if (eventType === 'BANK_TX_CREATED' && payload?.id) {
        const rawType = String(payload.type || 'DEPOSIT');
        const dbType: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' = rawType.includes('TRANSFER')
          ? 'TRANSFER'
          : rawType.includes('WITHDRAWAL') || rawType === 'REVERSAL'
            ? 'WITHDRAWAL'
            : 'DEPOSIT';
        const { error } = await supabase.from('bank_transactions').upsert({
          id: payload.id,
          transaction_number: payload.transactionNumber || payload.id.toUpperCase(),
          organization_id: orgId,
          branch_id: scopedBranchId,
          bank_account_id: payload.bankAccountId || payload.accountId,
          bank_account_name: payload.bankAccountName || payload.accountName || 'Bank Account',
          type: dbType,
          amount: Number(payload.amount || 0),
          balance_before: Number(payload.balanceBefore || 0),
          balance_after: Number(payload.balanceAfter || 0),
          transaction_date: payload.transactionDate || now.slice(0, 10),
          reference_number: payload.referenceNumber || null,
          description: payload.description || null,
          category: payload.category || rawType,
          payee_payer: payload.payeePayer || null,
          status: payload.status === 'REVERSED' ? 'REVERSED' : 'COMPLETED',
          reversal_reason: payload.reversalReason || null,
          reversed_at: payload.reversedAt || null,
          reversal_transaction_id: payload.reversalTransactionId || null,
          transfer_to_account_id: payload.transferToAccountId || null,
          transfer_from_account_id: payload.transferFromAccountId || null,
          initiated_by: payload.initiatedBy || actorName || 'System',
        });
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if ((eventType === 'CUSTOMER_RECEIPT_CREATED' || eventType === 'CUSTOMER_RECEIPT_REVERSED') && payload?.id) {
        const rawMethod = String(payload.paymentMethod || 'CASH').toUpperCase();
        const dbMethod = ['CASH', 'UPI', 'CARD', 'BANK', 'CHEQUE', 'NEFT/RTGS'].includes(rawMethod) ? rawMethod : 'BANK';
        const { error } = await supabase.from('customer_receipts').upsert({
          id: payload.id,
          receipt_number: payload.receiptNumber || payload.id.toUpperCase(),
          organization_id: orgId,
          branch_id: scopedBranchId,
          customer_id: payload.customerId,
          customer_name: payload.customerName,
          amount: Number(payload.amount || 0),
          allocated_amount: Number(payload.allocatedAmount || 0),
          unallocated_advance: Number(payload.unallocatedAdvance || 0),
          payment_method: dbMethod,
          bank_account_id: payload.bankAccountId || null,
          bank_account_name: payload.bankAccountName || null,
          receipt_date: payload.receiptDate || now.slice(0, 10),
          reference_number: payload.referenceNumber || null,
          notes: payload.notes || null,
          allocations: Array.isArray(payload.allocations) ? payload.allocations : [],
          status: payload.status === 'REVERSED' ? 'REVERSED' : 'COMPLETED',
          reversal_reason: payload.reversalReason || null,
          reversed_at: payload.reversedAt || null,
          reversed_by: payload.reversedBy || null,
          journal_entry_id: payload.journalEntryId || null,
          journal_number: payload.journalNumber || null,
          idempotency_key: idempotencyKey,
          created_by: payload.createdBy || actorId || 'system',
          created_by_name: payload.createdByName || actorName || 'Staff',
          updated_at: now,
        });
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if (eventType === 'SUPPLIER_BILL_UPSERTED' && payload?.id) {
        const dbStatus = payload.status === 'UNPAID' ? 'PENDING' : payload.status || 'PENDING';
        const { error } = await supabase.from('supplier_bills').upsert({
          id: payload.id,
          bill_number: payload.billNumber,
          organization_id: orgId,
          branch_id: scopedBranchId,
          purchase_order_id: payload.purchaseOrderId || null,
          po_number: payload.poNumber || null,
          supplier_id: payload.supplierId,
          supplier_name: payload.supplierName,
          supplier_gstin: payload.supplierGstin || null,
          bill_date: payload.billDate || now.slice(0, 10),
          due_date: payload.dueDate || null,
          subtotal: Number(payload.subtotal || 0),
          taxable_total: Number(payload.taxableTotal || 0),
          gst_total: Number(payload.gstTotal || 0),
          discount_total: Number(payload.discountTotal || 0),
          additional_charges: Number(payload.additionalCharges || 0),
          total_amount: Number(payload.totalAmount || 0),
          paid_amount: Number(payload.paidAmount || 0),
          outstanding_amount: Number(payload.outstandingAmount || 0),
          status: dbStatus,
          notes: payload.notes || payload.supplierInvoiceNumber || null,
          idempotency_key: idempotencyKey,
          updated_at: now,
        });
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if ((eventType === 'SUPPLIER_PAYMENT_UPSERTED' || eventType === 'SUPPLIER_PAYMENT_REVERSED') && payload?.id) {
        const rawMethod = String(payload.paymentMethod || 'BANK').toUpperCase();
        const dbMethod = ['CASH', 'UPI', 'CARD', 'BANK', 'CHEQUE', 'NEFT/RTGS'].includes(rawMethod) ? rawMethod : 'BANK';
        const { error } = await supabase.from('supplier_payments').upsert({
          id: payload.id,
          payment_number: payload.paymentNumber,
          organization_id: orgId,
          branch_id: scopedBranchId,
          supplier_id: payload.supplierId,
          supplier_name: payload.supplierName,
          supplier_bill_id: payload.supplierBillId || null,
          bill_number: payload.billNumber || null,
          amount: Number(payload.amount || 0),
          payment_method: dbMethod,
          bank_account_id: payload.bankAccountId || null,
          bank_account_name: payload.bankAccountName || null,
          payment_date: payload.paymentDate || now.slice(0, 10),
          reference_number: payload.referenceNumber || null,
          notes: payload.notes || null,
          allocated_bills: Array.isArray(payload.allocatedBills) ? payload.allocatedBills : [],
          is_advance: Boolean(payload.isAdvance),
          status: payload.status === 'REVERSED' ? 'REVERSED' : 'COMPLETED',
          reversal_reason: payload.reversalReason || null,
          reversed_at: payload.reversedAt || null,
          reversed_by: payload.reversedBy || null,
          idempotency_key: idempotencyKey,
          created_by: payload.createdBy || actorId || 'system',
          created_by_name: payload.createdByName || actorName || 'Staff',
        });
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if (eventType === 'DEBIT_NOTE_UPSERTED' && payload?.id) {
        const cgst = Number(payload.cgstTotal || 0);
        const sgst = Number(payload.sgstTotal || 0);
        const igst = Number(payload.igstTotal || 0);
        const { error } = await supabase.from('debit_notes').upsert({
          id: payload.id,
          debit_note_number: payload.debitNoteNumber,
          organization_id: orgId,
          branch_id: scopedBranchId,
          supplier_id: payload.supplierId,
          supplier_name: payload.supplierName,
          supplier_gstin: payload.supplierGstin || null,
          supplier_bill_id: payload.supplierBillId || null,
          bill_number: payload.billNumber || null,
          subtotal: Number(payload.taxableTotal || 0),
          taxable_total: Number(payload.taxableTotal || 0),
          cgst_total: cgst,
          sgst_total: sgst,
          igst_total: igst,
          gst_total: cgst + sgst + igst,
          total_debit_amount: Number(payload.totalAmount || 0),
          reason: payload.reason || 'Purchase Return',
          notes: payload.notes || null,
          status: payload.status || 'ISSUED',
          reduce_inventory: Boolean(payload.deductInventory),
          issue_date: payload.issueDate || now.slice(0, 10),
          journal_entry_id: payload.journalEntryId || null,
          journal_number: payload.journalNumber || null,
          approved_by: payload.approvedBy || null,
          approved_by_name: payload.approvedByName || null,
          approved_at: payload.approvedAt || null,
          cancelled_by: payload.cancelledBy || null,
          cancelled_at: payload.cancelledAt || null,
          cancel_reason: payload.cancelReason || null,
          idempotency_key: idempotencyKey,
          created_by: payload.createdBy || actorId || 'system',
          created_by_name: payload.createdByName || actorName || 'Staff',
          updated_at: now,
        });
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if (eventType === 'CREDIT_NOTE_UPSERTED' && payload?.id) {
        const { error } = await supabase.from('credit_notes').upsert({
          id: payload.id,
          credit_note_number: payload.creditNoteNumber,
          organization_id: orgId,
          branch_id: scopedBranchId,
          customer_id: payload.customerId,
          customer_name: payload.customerName,
          customer_gstin: payload.customerGstin || null,
          invoice_id: payload.originalSaleId || payload.invoiceId || null,
          invoice_number: payload.originalInvoiceNumber || payload.invoiceNumber || null,
          subtotal: Number(payload.subtotal || 0),
          taxable_total: Number(payload.taxableTotal || 0),
          cgst_total: Number(payload.cgstTotal || 0),
          sgst_total: Number(payload.sgstTotal || 0),
          igst_total: Number(payload.igstTotal || 0),
          total_tax: Number(payload.totalTax || 0),
          total_credit_amount: Number(payload.totalCreditAmount ?? payload.creditAmount ?? 0),
          allocated_amount: Number(payload.allocatedAmount || 0),
          remaining_amount: Number(payload.remainingAmount || 0),
          reason: payload.reason,
          notes: payload.notes || null,
          status: payload.status === 'PENDING_APPROVAL' ? 'DRAFT' : payload.status,
          restock_inventory: payload.restockInventory !== false,
          idempotency_key: idempotencyKey,
          created_by: payload.createdBy || actorId || 'system',
          created_by_name: payload.createdByName || actorName || null,
          issue_date: payload.issueDate || payload.date || null,
          updated_at: now,
        });
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if (eventType === 'PO_UPSERTED' && payload?.id) {
        const { error } = await supabase.from('purchase_orders').upsert({
          id: payload.id,
          po_number: payload.poNumber,
          organization_id: orgId,
          branch_id: scopedBranchId,
          supplier_id: payload.supplierId,
          supplier_name: payload.supplierName,
          supplier_gstin: payload.supplierGstin || null,
          order_date: payload.orderDate || now.slice(0, 10),
          expected_delivery_date: payload.expectedDeliveryDate || null,
          subtotal: Number(payload.subtotal || 0),
          tax_total: Number(payload.taxTotal || 0),
          discount_total: Number(payload.discountTotal || 0),
          additional_charges: Number(payload.additionalCharges || 0),
          grand_total: Number(payload.grandTotal || 0),
          received_total: Number(payload.receivedTotal || 0),
          status: payload.status || 'ORDERED',
          notes: payload.notes || null,
          idempotency_key: idempotencyKey,
          created_by: payload.createdBy || actorId || 'system',
          created_by_name: payload.createdByName || actorName || null,
          updated_at: now,
        });
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      } else if (eventType === 'GRN_CREATED' && payload?.id) {
        const { error } = await supabase.from('goods_receipts').upsert({
          id: payload.id,
          grn_number: payload.grnNumber,
          organization_id: orgId,
          branch_id: scopedBranchId,
          purchase_order_id: payload.purchaseOrderId || null,
          po_number: payload.poNumber || null,
          supplier_id: payload.supplierId,
          supplier_name: payload.supplierName,
          received_date: payload.receivedDate || payload.receiptDate || now.slice(0, 10),
          received_by: payload.receivedBy || actorId || 'system',
          received_by_name: payload.receivedByName || actorName || null,
          notes: payload.notes || null,
        });
        if (error) {
          conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: error.message });
          continue;
        }
      }

      // Record synced event in outbox ledger for cross-device pull telemetry
      const { error: outboxErr } = await supabase.from('sync_outbox_events').upsert(
        {
          id: itemId,
          organization_id: orgId,
          branch_id: scopedBranchId,
          device_id: deviceId,
          idempotency_key: idempotencyKey,
          event_type: eventType,
          entity_id: entityId,
          payload: payload || {},
          status: 'SYNCED',
          ingested_at: now,
        },
        { onConflict: 'organization_id,idempotency_key', ignoreDuplicates: true }
      );

      if (outboxErr) {
        conflicts.push({ id: itemId, entityId, eventType, code: 'DB_ERROR', error: outboxErr.message });
      } else {
        processedIds.push(item.id || itemId);
      }
    } catch (err: any) {
      conflicts.push({
        id: itemId,
        entityId,
        eventType,
        code: 'DB_ERROR',
        error: err?.message || 'Unexpected sync ingestion error',
      });
    }
  }

  return {
    processedIds,
    conflicts,
    serverTimestamp: now,
  };
}

export async function pullIncrementalSyncData(params: {
  supabase: SupabaseClient;
  orgId: string;
  role?: string | null;
  since?: string;
}): Promise<{
  serverTimestamp: string;
  events: any[];
  entities: Record<string, any[]>;
}> {
  const { supabase, orgId, role, since } = params;
  const serverTimestamp = new Date().toISOString();

  let evQuery = supabase
    .from('sync_outbox_events')
    .select('*')
    .eq('organization_id', orgId)
    .order('ingested_at', { ascending: true })
    .limit(500);
  if (since) {
    evQuery = evQuery.gt('ingested_at', since);
  }
  const { data: events, error: evErr } = await evQuery;
  if (evErr) throw evErr;

  const entities: Record<string, any[]> = {};

  const pullTable = async (
    key: string,
    table: string,
    perm: GranularPermission,
    tsCol: string = 'updated_at'
  ) => {
    if (role && !hasPermission(role, perm)) return;
    try {
      let q = supabase.from(table).select('*').eq('organization_id', orgId).limit(300);
      if (since) q = q.gt(tsCol, since);
      const { data, error } = await q;
      if (!error && data) {
        entities[key] = data;
      }
    } catch {
      // Ignore if column/table doesn't exist on older DB before migration runs
    }
  };

  await Promise.all([
    pullTable('products', 'products', 'PRODUCTS_VIEW', 'updated_at'),
    pullTable('customers', 'customers', 'CUSTOMERS_VIEW', 'updated_at'),
    pullTable('suppliers', 'suppliers', 'SUPPLIERS_VIEW', 'updated_at'),
    pullTable('quotations', 'quotations', 'QUOTES_VIEW', 'updated_at'),
    pullTable('expenses', 'expenses', 'EXPENSES_VIEW', 'updated_at'),
    pullTable('sales', 'sales', 'SALES_VIEW', 'created_at'),
    pullTable('bankAccounts', 'bank_accounts', 'BANKING_VIEW', 'updated_at'),
    pullTable('bankTransactions', 'bank_transactions', 'BANKING_VIEW', 'created_at'),
    pullTable('creditNotes', 'credit_notes', 'CREDIT_NOTES_MANAGE', 'updated_at'),
    pullTable('purchaseOrders', 'purchase_orders', 'PURCHASE_ORDERS_MANAGE', 'updated_at'),
    pullTable('supplierBills', 'supplier_bills', 'SUPPLIER_BILLS_MANAGE', 'updated_at'),
    pullTable('supplierPayments', 'supplier_payments', 'SUPPLIER_BILLS_MANAGE', 'created_at'),
    pullTable('customerReceipts', 'customer_receipts', 'PAYMENTS_VIEW', 'updated_at'),
    pullTable('debitNotes', 'debit_notes', 'DEBIT_NOTES_MANAGE', 'updated_at'),
  ]);

  return {
    serverTimestamp,
    events: events || [],
    entities,
  };
}
