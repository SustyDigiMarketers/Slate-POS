/**
 * SLATE POS — Purchase Orders, Goods Receipt (GRN), Supplier Bills & AP Module
 * Complete Procurement, Physical Inventory Inwarding, Supplier Bills & Payments Engine
 * Styled with SLATE POS Tricolour Theme (#16587B / #84B3CE / #F5EEDD / #FAF6EC / #FFFFFF)
 */

import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Plus,
  PackageCheck,
  Receipt,
  CreditCard,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Building2,
  Calendar,
  X,
  Eye,
  Trash2,
  Truck,
  ArrowDownLeft,
  FileMinus2,
  Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { offlineStore } from '../../lib/offlineStore';
import {
  PurchaseOrder,
  GoodsReceipt,
  SupplierBill,
  SupplierPayment,
  DebitNote,
  Supplier,
  Product,
  BankAccount,
  PaymentMode,
  PurchaseOrderStatus,
} from '../../types';
import { ActiveView } from '../layout/Sidebar';

interface PurchasesPageProps {
  initialTab?: 'PO' | 'GRN' | 'BILLS' | 'PAYMENTS' | 'RETURNS';
  onNavigateToView?: (view: ActiveView) => void;
}

export const PurchasesPage: React.FC<PurchasesPageProps> = ({
  initialTab = 'PO',
  onNavigateToView,
}) => {
  const activeUser = offlineStore.getActiveUser();
  const currentOrg = offlineStore.getOrganization();

  const [activeTab, setActiveTab] = useState<'PO' | 'GRN' | 'BILLS' | 'PAYMENTS' | 'RETURNS'>(initialTab);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => offlineStore.getPurchaseOrders());
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>(() => offlineStore.getGoodsReceipts());
  const [supplierBills, setSupplierBills] = useState<SupplierBill[]>(() => offlineStore.getSupplierBills());
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>(() => offlineStore.getSupplierPayments());
  const [debitNotes, setDebitNotes] = useState<DebitNote[]>(() => offlineStore.getDebitNotes());
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => offlineStore.getSuppliers());
  const [products, setProducts] = useState<Product[]>(() => offlineStore.getProducts());
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => offlineStore.getBankAccounts());

  const [searchQuery, setSearchQuery] = useState('');
  const [actionFeedback, setActionFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modals
  const [isCreatePoOpen, setIsCreatePoOpen] = useState(false);
  const [isReceiveGoodsOpen, setIsReceiveGoodsOpen] = useState(false);
  const [isCreateBillOpen, setIsCreateBillOpen] = useState(false);
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [isCreateDebitNoteOpen, setIsCreateDebitNoteOpen] = useState(false);

  // Selection targets
  const [targetPo, setTargetPo] = useState<PurchaseOrder | null>(null);
  const [targetBill, setTargetBill] = useState<SupplierBill | null>(null);

  // Form states for New PO
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poExpectedDate, setPoExpectedDate] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [poItems, setPoItems] = useState<Array<{ productId: string; quantity: number; unitPrice: number; taxRate: number }>>([]);

  // Form states for Receive Goods (GRN)
  const [grnReceivedItems, setGrnReceivedItems] = useState<Array<{ productId: string; quantity: number; unitPrice: number; batchNumber: string }>>([]);
  const [grnNotes, setGrnNotes] = useState('');

  // Form states for Supplier Bill
  const [billSupplierId, setBillSupplierId] = useState('');
  const [billPoId, setBillPoId] = useState('');
  const [billInvoiceNumber, setBillInvoiceNumber] = useState('');
  const [billDueDate, setBillDueDate] = useState('');
  const [billTotalAmount, setBillTotalAmount] = useState('');
  const [billGstAmount, setBillGstAmount] = useState('');
  const [billNotes, setBillNotes] = useState('');

  // Form states for Supplier Payment
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMode>('BANK');
  const [payBankAccountId, setPayBankAccountId] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Form states for Debit Note / Purchase Return
  const [dnSupplierId, setDnSupplierId] = useState('');
  const [dnBillId, setDnBillId] = useState('');
  const [dnReason, setDnReason] = useState('DAMAGED_GOODS');
  const [dnDeductInventory, setDnDeductInventory] = useState(true);
  const [dnNotes, setDnNotes] = useState('');
  const [dnItems, setDnItems] = useState<Array<{ productId: string; quantity: number; unitPrice: number; gstRate: number }>>([]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const refreshData = () => {
      setPurchaseOrders(offlineStore.getPurchaseOrders());
      setGoodsReceipts(offlineStore.getGoodsReceipts());
      setSupplierBills(offlineStore.getSupplierBills());
      setSupplierPayments(offlineStore.getSupplierPayments());
      setDebitNotes(offlineStore.getDebitNotes());
      setSuppliers(offlineStore.getSuppliers());
      setProducts(offlineStore.getProducts());
      setBankAccounts(offlineStore.getBankAccounts());
    };
    refreshData();
    const unsub = offlineStore.subscribe(refreshData);
    return unsub;
  }, []);

  // Summary Metrics
  const totalPOValue = purchaseOrders.reduce((sum, po) => sum + po.grandTotal, 0);
  const totalPayables = supplierBills.reduce((sum, b) => sum + b.outstandingAmount, 0);
  const totalPaidBills = supplierBills.reduce((sum, b) => sum + b.paidAmount, 0);
  const totalReceivedGRNs = goodsReceipts.length;

  // New PO Handlers
  const openNewPoModal = () => {
    const firstSupplier = suppliers[0];
    setPoSupplierId(firstSupplier ? firstSupplier.id : '');
    setPoExpectedDate(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    setPoNotes('');

    const firstProd = products[0];
    if (firstProd) {
      setPoItems([{ productId: firstProd.id, quantity: 10, unitPrice: firstProd.costPrice || 50, taxRate: firstProd.taxRate || 18 }]);
    } else {
      setPoItems([]);
    }
    setIsCreatePoOpen(true);
  };

  const handleAddPoItem = () => {
    const firstProd = products[0];
    if (firstProd) {
      setPoItems([...poItems, { productId: firstProd.id, quantity: 5, unitPrice: firstProd.costPrice || 50, taxRate: firstProd.taxRate || 18 }]);
    }
  };

  const handleRemovePoItem = (index: number) => {
    setPoItems(poItems.filter((_, idx) => idx !== index));
  };

  const handlePoItemChange = (index: number, field: string, value: any) => {
    const updated = [...poItems];
    if (field === 'productId') {
      const prod = products.find((p) => p.id === value);
      if (prod) {
        updated[index] = {
          ...updated[index],
          productId: prod.id,
          unitPrice: prod.costPrice || 50,
          taxRate: prod.taxRate || 18,
        };
      }
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setPoItems(updated);
  };

  const handleCreatePurchaseOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!poSupplierId || poItems.length === 0) {
      setActionFeedback({ message: 'Supplier and at least one item are required', type: 'error' });
      return;
    }

    const supplier = suppliers.find((s) => s.id === poSupplierId);
    let subtotal = 0;
    let taxTotal = 0;

    const formattedItems = poItems.map((item, idx) => {
      const prod = products.find((p) => p.id === item.productId);
      const lineSub = item.quantity * item.unitPrice;
      const tax = (lineSub * (item.taxRate || 0)) / 100;
      subtotal += lineSub;
      taxTotal += tax;

      return {
        id: `poi_${Date.now()}_${idx}`,
        productId: item.productId,
        productName: prod ? prod.name : 'Item',
        orderedQuantity: item.quantity,
        receivedQuantity: 0,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        taxAmount: tax,
        total: lineSub + tax,
      };
    });

    const newPO = offlineStore.createPurchaseOrder({
      organizationId: currentOrg.id,
      branchId: activeUser.branchId || offlineStore.getActiveBranchId(),
      supplierId: poSupplierId,
      supplierName: supplier?.name || 'Vendor',
      supplierGstin: supplier?.gstin,
      orderDate: new Date().toISOString().slice(0, 10),
      expectedDeliveryDate: poExpectedDate,
      subtotal: Math.round(subtotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      discountTotal: 0,
      additionalCharges: 0,
      grandTotal: Math.round((subtotal + taxTotal) * 100) / 100,
      items: formattedItems,
      notes: poNotes,
      createdBy: activeUser.id,
      createdByName: activeUser.name,
    });

    setIsCreatePoOpen(false);
    setActionFeedback({ message: `Purchase Order ${newPO.poNumber} created successfully!`, type: 'success' });
    setTimeout(() => setActionFeedback(null), 4000);
  };

  // Goods Receipt (GRN) Handlers
  const openReceiveGoodsModal = (po: PurchaseOrder) => {
    setTargetPo(po);
    const unreceivedItems = po.items.map((i) => ({
      productId: i.productId,
      quantity: Math.max(0, i.orderedQuantity - (i.receivedQuantity || 0)),
      unitPrice: Number(i.unitPrice || 0),
      batchNumber: `BATCH-${Date.now().toString().slice(-4)}`,
    }));
    setGrnReceivedItems(unreceivedItems);
    setGrnNotes('');
    setIsReceiveGoodsOpen(true);
  };

  const handleExecuteReceiveGoods = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPo) return;

    const itemsToReceive = grnReceivedItems
      .filter((i) => i.quantity > 0)
      .map((i) => {
        const prod = products.find((p) => p.id === i.productId);
        return {
          productId: i.productId,
          productName: prod ? prod.name : 'Product',
          quantityReceived: i.quantity,
          unitPrice: i.unitPrice,
          batchNumber: i.batchNumber,
        };
      });

    if (itemsToReceive.length === 0) {
      setActionFeedback({ message: 'Enter quantity greater than 0 for at least one item', type: 'error' });
      return;
    }

    const res = offlineStore.receiveGoods({
      poId: targetPo.id,
      supplierId: targetPo.supplierId,
      supplierName: targetPo.supplierName,
      items: itemsToReceive,
      receivedBy: activeUser.id,
      receivedByName: activeUser.name,
      notes: grnNotes,
      orgId: currentOrg.id,
    });

    if (res.success && res.goodsReceipt) {
      setIsReceiveGoodsOpen(false);
      setTargetPo(null);
      setActionFeedback({
        message: `GRN ${res.goodsReceipt.grnNumber} generated! Stock levels in active branch updated atomically.`,
        type: 'success',
      });
      setTimeout(() => setActionFeedback(null), 4000);
    } else {
      setActionFeedback({ message: res.error || 'Failed to receive goods', type: 'error' });
    }
  };

  // Supplier Bill Handlers
  const openNewBillModal = (po?: PurchaseOrder) => {
    if (po) {
      setBillSupplierId(po.supplierId);
      setBillPoId(po.id);
      setBillTotalAmount(po.grandTotal.toString());
      setBillGstAmount((po.taxTotal || 0).toString());
    } else {
      setBillSupplierId(suppliers[0]?.id || '');
      setBillPoId('');
      setBillTotalAmount('');
      setBillGstAmount('');
    }
    setBillInvoiceNumber('');
    setBillDueDate(new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10));
    setBillNotes('');
    setIsCreateBillOpen(true);
  };

  const handleCreateSupplierBill = (e: React.FormEvent) => {
    e.preventDefault();
    const totalNum = parseFloat(billTotalAmount);
    const gstNum = parseFloat(billGstAmount) || 0;
    if (!billSupplierId || isNaN(totalNum) || totalNum <= 0) {
      setActionFeedback({ message: 'Valid supplier and bill amount are required', type: 'error' });
      return;
    }
    if (gstNum < 0 || gstNum > totalNum) {
      setActionFeedback({ message: 'Included GST cannot exceed the total bill amount or be negative', type: 'error' });
      return;
    }

    const supplier = suppliers.find((s) => s.id === billSupplierId);
    const po = purchaseOrders.find((p) => p.id === billPoId);

    const newBill = offlineStore.createSupplierBill({
      organizationId: currentOrg.id,
      branchId: activeUser.branchId || offlineStore.getActiveBranchId(),
      supplierInvoiceNumber: billInvoiceNumber.trim() || `INV-${Date.now().toString().slice(-6)}`,
      supplierId: billSupplierId,
      supplierName: supplier?.name || 'Vendor',
      supplierGstin: supplier?.gstin,
      purchaseOrderId: billPoId || undefined,
      poNumber: po?.poNumber,
      billDate: new Date().toISOString().slice(0, 10),
      dueDate: billDueDate,
      subtotal: Math.max(0, totalNum - gstNum),
      taxableTotal: Math.max(0, totalNum - gstNum),
      gstTotal: gstNum,
      discountTotal: 0,
      additionalCharges: 0,
      totalAmount: totalNum,
      notes: billNotes,
    });

    setIsCreateBillOpen(false);
    setActionFeedback({
      message: `Supplier Bill ${newBill.billNumber} posted! Added ₹${totalNum.toLocaleString('en-IN')} to Accounts Payable.`,
      type: 'success',
    });
    setTimeout(() => setActionFeedback(null), 4000);
  };

  // Supplier Payment Handlers
  const openRecordPaymentModal = (bill: SupplierBill) => {
    setTargetBill(bill);
    setPayAmount(bill.outstandingAmount.toString());
    setPayMethod('BANK');
    const primaryBank = bankAccounts.find((a) => a.isPrimary) || bankAccounts[0];
    setPayBankAccountId(primaryBank ? primaryBank.id : '');
    setPayReference(`NEFT-${Date.now().toString().slice(-6)}`);
    setPayNotes(`Payment against Bill ${bill.billNumber}`);
    setIsRecordPaymentOpen(true);
  };

  const handleExecutePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetBill) return;

    const amountNum = parseFloat(payAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setActionFeedback({ message: 'Enter a valid payment amount', type: 'error' });
      return;
    }

    const res = offlineStore.recordSupplierPayment({
      billId: targetBill.id,
      supplierId: targetBill.supplierId,
      amount: amountNum,
      paymentMethod: payMethod,
      bankAccountId: ['BANK', 'UPI', 'CARD'].includes(payMethod) ? payBankAccountId : undefined,
      referenceNumber: payReference,
      notes: payNotes,
      paidBy: activeUser.id,
      paidByName: activeUser.name,
      orgId: currentOrg.id,
    });

    if (res.success && res.payment) {
      setIsRecordPaymentOpen(false);
      setTargetBill(null);
      setActionFeedback({
        message: `Disbursement ${res.payment.paymentNumber} posted! Bill & accounts payable balance reduced by ₹${amountNum.toLocaleString('en-IN')}.`,
        type: 'success',
      });
      setTimeout(() => setActionFeedback(null), 4000);
    } else {
      setActionFeedback({ message: res.error || 'Payment execution failed', type: 'error' });
    }
  };

  const openNewDebitNoteModal = () => {
    setDnSupplierId(suppliers[0]?.id || '');
    setDnBillId('');
    setDnReason('DAMAGED_GOODS');
    setDnDeductInventory(true);
    setDnNotes('');
    const firstProd = products[0];
    setDnItems(
      firstProd
        ? [{ productId: firstProd.id, quantity: 1, unitPrice: firstProd.costPrice || 50, gstRate: firstProd.taxRate || 18 }]
        : []
    );
    setIsCreateDebitNoteOpen(true);
  };

  const handleCreateDebitNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dnSupplierId || dnItems.length === 0) {
      setActionFeedback({ message: 'Select a supplier and add at least one returned item.', type: 'error' });
      return;
    }
    const res = offlineStore.createAndIssueDebitNote({
      supplierId: dnSupplierId,
      supplierBillId: dnBillId || undefined,
      reason: dnReason,
      items: dnItems.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        gstRate: i.gstRate,
      })),
      deductInventory: dnDeductInventory,
      notes: dnNotes,
      orgId: currentOrg.id,
      branchId: activeUser.branchId,
    });
    if (res.success && res.debitNote) {
      setIsCreateDebitNoteOpen(false);
      setActiveTab('RETURNS');
      setActionFeedback({
        message: `Debit Note ${res.debitNote.debitNoteNumber} issued! AP reduced by ₹${res.debitNote.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} and GL voucher posted.`,
        type: 'success',
      });
      setTimeout(() => setActionFeedback(null), 5000);
    } else {
      setActionFeedback({ message: res.error || 'Failed to issue Debit Note', type: 'error' });
    }
  };

  const handleExportSupplierStatement = () => {
    const wb = XLSX.utils.book_new();
    const billsSheet = XLSX.utils.json_to_sheet(
      supplierBills.map((b) => ({
        'Bill #': b.billNumber,
        Date: b.billDate,
        'Due Date': b.dueDate || '',
        Supplier: b.supplierName,
        'Total (INR)': b.totalAmount,
        'Paid (INR)': b.paidAmount,
        'Outstanding (INR)': b.outstandingAmount,
        Status: b.status,
      }))
    );
    const paymentsSheet = XLSX.utils.json_to_sheet(
      supplierPayments.map((p) => ({
        'Payment #': p.paymentNumber,
        Date: p.paymentDate,
        Supplier: p.supplierName,
        'Bill Ref': p.billNumber || '',
        Mode: p.paymentMethod,
        Reference: p.referenceNumber || '',
        'Amount (INR)': p.amount,
      }))
    );
    const dnSheet = XLSX.utils.json_to_sheet(
      debitNotes.map((d) => ({
        'Debit Note #': d.debitNoteNumber,
        Date: d.issueDate,
        Supplier: d.supplierName,
        'Bill Ref': d.billNumber || '',
        Reason: d.reason,
        'Taxable (INR)': d.taxableTotal,
        'GST (INR)': d.cgstTotal + d.sgstTotal + d.igstTotal,
        'Total (INR)': d.totalAmount,
        Status: d.status,
      }))
    );
    XLSX.utils.book_append_sheet(wb, billsSheet, 'Supplier Bills');
    XLSX.utils.book_append_sheet(wb, paymentsSheet, 'Disbursements');
    XLSX.utils.book_append_sheet(wb, dnSheet, 'Debit Notes');
    XLSX.writeFile(wb, `SLATE_Supplier_Statement_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F5EEDD] overflow-y-auto">
      {/* Top Header */}
      <div className="bg-[#16587B] text-[#F5EEDD] px-4 sm:px-6 py-4 shrink-0 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-[#124866] rounded-md text-[#F5EEDD]">
                <ShoppingBag className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Purchase &amp; Bills</h1>
              <span className="text-xs bg-[#84B3CE] text-[#0F2D3D] font-semibold px-2 py-0.5 rounded">
                {currentOrg.name}
              </span>
            </div>
            <p className="text-xs text-[#F5EEDD]/85 mt-1">
              Purchase orders, Goods Inward (GRN), supplier bills (AP), debit notes / purchase returns, and bank disbursements
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportSupplierStatement}
              className="px-3 py-2 bg-[#124866] hover:bg-[#0F405B] text-[#F5EEDD] text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer border border-[#84B3CE]/30"
            >
              <Download className="w-4 h-4 text-[#84B3CE]" />
              Statement
            </button>
            <button
              onClick={openNewDebitNoteModal}
              className="px-3 py-2 bg-[#124866] hover:bg-[#0F405B] text-[#F5EEDD] text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer border border-[#84B3CE]/30"
            >
              <FileMinus2 className="w-4 h-4 text-amber-300" />
              Debit Note
            </button>
            <button
              onClick={() => openNewBillModal()}
              className="px-3 py-2 bg-[#124866] hover:bg-[#0F405B] text-[#F5EEDD] text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer border border-[#84B3CE]/30"
            >
              <Receipt className="w-4 h-4 text-[#84B3CE]" />
              New Bill (AP)
            </button>
            <button
              onClick={openNewPoModal}
              className="px-3.5 py-2 bg-[#84B3CE] hover:bg-[#9AC2D8] text-[#0F2D3D] text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#0F2D3D]" />
              New Purchase Order
            </button>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-5">
        {/* Feedback Alert */}
        {actionFeedback && (
          <div
            className={`p-3.5 rounded-lg text-xs font-medium flex items-center justify-between border ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {actionFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{actionFeedback.message}</span>
            </div>
            <button onClick={() => setActionFeedback(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Dashboard Financial Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs">
            <span className="text-xs font-medium text-[#667781]">Total Accounts Payable (Due)</span>
            <div className="mt-2 text-2xl font-bold text-amber-700">
              ₹{totalPayables.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-[#667781] mt-1">Pending vendor settlements</div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs">
            <span className="text-xs font-medium text-[#667781]">Total Paid to Suppliers</span>
            <div className="mt-2 text-2xl font-bold text-emerald-700">
              ₹{totalPaidBills.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-[#667781] mt-1">Disbursed via Cash / Bank / UPI</div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs">
            <span className="text-xs font-medium text-[#667781]">Active Purchase Orders</span>
            <div className="mt-2 text-2xl font-bold text-[#111B21]">
              ₹{totalPOValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-[#667781] mt-1">{purchaseOrders.length} orders logged</div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs">
            <span className="text-xs font-medium text-[#667781]">Goods Receipts (GRN) Inwarded</span>
            <div className="mt-2 text-2xl font-bold text-[#16587B]">{totalReceivedGRNs}</div>
            <div className="text-[11px] text-[#667781] mt-1">Physical inventory additions</div>
          </div>
        </div>

        {/* Procurement Table Shell with Tabs */}
        <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xs overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E9EDEF] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#FAF6EC]">
            {/* Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto">
              <button
                onClick={() => setActiveTab('PO')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'PO'
                    ? 'bg-[#16587B] text-[#F5EEDD] shadow-2xs'
                    : 'text-[#667781] hover:bg-[#F5EEDD] hover:text-[#111B21]'
                }`}
              >
                Purchase Orders ({purchaseOrders.length})
              </button>
              <button
                onClick={() => setActiveTab('GRN')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'GRN'
                    ? 'bg-[#16587B] text-[#F5EEDD] shadow-2xs'
                    : 'text-[#667781] hover:bg-[#F5EEDD] hover:text-[#111B21]'
                }`}
              >
                Goods Receipts / GRN ({goodsReceipts.length})
              </button>
              <button
                onClick={() => setActiveTab('BILLS')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'BILLS'
                    ? 'bg-[#16587B] text-[#F5EEDD] shadow-2xs'
                    : 'text-[#667781] hover:bg-[#F5EEDD] hover:text-[#111B21]'
                }`}
              >
                Supplier Bills / AP ({supplierBills.length})
              </button>
              <button
                onClick={() => setActiveTab('PAYMENTS')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'PAYMENTS'
                    ? 'bg-[#16587B] text-[#F5EEDD] shadow-2xs'
                    : 'text-[#667781] hover:bg-[#F5EEDD] hover:text-[#111B21]'
                }`}
              >
                Disbursements ({supplierPayments.length})
              </button>
              <button
                onClick={() => setActiveTab('RETURNS')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'RETURNS'
                    ? 'bg-[#16587B] text-[#F5EEDD] shadow-2xs'
                    : 'text-[#667781] hover:bg-[#F5EEDD] hover:text-[#111B21]'
                }`}
              >
                Debit Notes &amp; Returns ({debitNotes.length})
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#667781] absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search procurement..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B] w-56"
              />
            </div>
          </div>

          {/* TAB 1: PURCHASE ORDERS */}
          {activeTab === 'PO' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAF6EC] text-[#667781] border-b border-[#E9EDEF]">
                    <th className="py-2.5 px-4 font-semibold">PO Number</th>
                    <th className="py-2.5 px-4 font-semibold">Order Date</th>
                    <th className="py-2.5 px-4 font-semibold">Supplier</th>
                    <th className="py-2.5 px-4 font-semibold">Expected Date</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Lines</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Order Amount</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Status</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EDEF]">
                  {purchaseOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-[#667781]">
                        No purchase orders recorded. Click "+ New Purchase Order" to begin procurement.
                      </td>
                    </tr>
                  ) : (
                    purchaseOrders.map((po) => (
                      <tr key={po.id} className="hover:bg-[#FAF6EC] transition-colors">
                        <td className="py-2.5 px-4 font-mono font-medium text-[#111B21]">{po.poNumber}</td>
                        <td className="py-2.5 px-4 text-[#667781]">{po.orderDate}</td>
                        <td className="py-2.5 px-4 font-medium text-[#111B21]">{po.supplierName}</td>
                        <td className="py-2.5 px-4 text-[#667781]">{po.expectedDeliveryDate || '—'}</td>
                        <td className="py-2.5 px-4 text-center font-medium">{po.items.length} items</td>
                        <td className="py-2.5 px-4 text-right font-bold text-[#16587B]">
                          ₹{po.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              po.status === 'RECEIVED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : po.status === 'PARTIALLY_RECEIVED'
                                ? 'bg-blue-100 text-blue-800'
                                : po.status === 'ORDERED'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {po.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {po.status !== 'RECEIVED' && po.status !== 'CANCELLED' && (
                              <button
                                onClick={() => openReceiveGoodsModal(po)}
                                className="px-2 py-1 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] rounded text-[10px] font-semibold transition-colors cursor-pointer"
                              >
                                Inward Goods
                              </button>
                            )}
                            <button
                              onClick={() => openNewBillModal(po)}
                              className="px-2 py-1 bg-[#F5EEDD] hover:bg-[#84B3CE]/25 text-[#16587B] rounded text-[10px] font-semibold transition-colors cursor-pointer"
                            >
                              Create Bill
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 2: GOODS RECEIPTS (GRN) */}
          {activeTab === 'GRN' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAF6EC] text-[#667781] border-b border-[#E9EDEF]">
                    <th className="py-2.5 px-4 font-semibold">GRN Number</th>
                    <th className="py-2.5 px-4 font-semibold">Received Date</th>
                    <th className="py-2.5 px-4 font-semibold">Supplier</th>
                    <th className="py-2.5 px-4 font-semibold">PO Reference</th>
                    <th className="py-2.5 px-4 font-semibold">Received By</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Items Inwarded</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Stock Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EDEF]">
                  {goodsReceipts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[#667781]">
                        No goods receipt notes logged. Inward goods against active purchase orders to restock inventory.
                      </td>
                    </tr>
                  ) : (
                    goodsReceipts.map((grn) => (
                      <tr key={grn.id} className="hover:bg-[#FAF6EC] transition-colors">
                        <td className="py-2.5 px-4 font-mono font-medium text-[#111B21]">{grn.grnNumber}</td>
                        <td className="py-2.5 px-4 text-[#667781]">{grn.receivedDate}</td>
                        <td className="py-2.5 px-4 font-medium text-[#111B21]">{grn.supplierName}</td>
                        <td className="py-2.5 px-4 font-mono text-[#667781]">{grn.poNumber || '—'}</td>
                        <td className="py-2.5 px-4 text-[#667781]">{grn.receivedByName || grn.receivedBy}</td>
                        <td className="py-2.5 px-4 text-center font-semibold text-[#16587B]">
                          {grn.items.reduce((sum, i) => sum + (i.quantityReceived || i.receivedQuantity || 0), 0)} units
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Inventory Restocked
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: SUPPLIER BILLS (AP) */}
          {activeTab === 'BILLS' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAF6EC] text-[#667781] border-b border-[#E9EDEF]">
                    <th className="py-2.5 px-4 font-semibold">Bill #</th>
                    <th className="py-2.5 px-4 font-semibold">Date</th>
                    <th className="py-2.5 px-4 font-semibold">Supplier</th>
                    <th className="py-2.5 px-4 font-semibold">Due Date</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Total Amount</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Paid Amount</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Outstanding</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Status</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EDEF]">
                  {supplierBills.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-[#667781]">
                        No supplier bills recorded.
                      </td>
                    </tr>
                  ) : (
                    supplierBills.map((bill) => (
                      <tr key={bill.id} className="hover:bg-[#FAF6EC] transition-colors">
                        <td className="py-2.5 px-4 font-mono font-medium text-[#111B21]">{bill.billNumber}</td>
                        <td className="py-2.5 px-4 text-[#667781]">{bill.billDate}</td>
                        <td className="py-2.5 px-4 font-medium text-[#111B21]">{bill.supplierName}</td>
                        <td className="py-2.5 px-4 text-[#667781]">{bill.dueDate || '—'}</td>
                        <td className="py-2.5 px-4 text-right font-medium text-[#111B21]">
                          ₹{bill.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-4 text-right text-emerald-700 font-medium">
                          ₹{bill.paidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-amber-700">
                          ₹{bill.outstandingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              bill.status === 'PAID'
                                ? 'bg-emerald-100 text-emerald-800'
                                : bill.status === 'PARTIALLY_PAID'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {bill.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          {bill.outstandingAmount > 0.01 && (
                            <button
                              onClick={() => openRecordPaymentModal(bill)}
                              className="px-2.5 py-1 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] rounded text-[10px] font-bold transition-colors cursor-pointer"
                            >
                              Pay Bill
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: DISBURSEMENTS / PAYMENTS */}
          {activeTab === 'PAYMENTS' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAF6EC] text-[#667781] border-b border-[#E9EDEF]">
                    <th className="py-2.5 px-4 font-semibold">Payment #</th>
                    <th className="py-2.5 px-4 font-semibold">Date</th>
                    <th className="py-2.5 px-4 font-semibold">Supplier</th>
                    <th className="py-2.5 px-4 font-semibold">Bill Ref</th>
                    <th className="py-2.5 px-4 font-semibold">Mode</th>
                    <th className="py-2.5 px-4 font-semibold">Bank / Ref</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Amount Paid</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Paid By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EDEF]">
                  {supplierPayments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-[#667781]">
                        No supplier disbursements logged.
                      </td>
                    </tr>
                  ) : (
                    supplierPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-[#FAF6EC] transition-colors">
                        <td className="py-2.5 px-4 font-mono font-medium text-[#111B21]">{p.paymentNumber}</td>
                        <td className="py-2.5 px-4 text-[#667781]">{p.paymentDate}</td>
                        <td className="py-2.5 px-4 font-medium text-[#111B21]">{p.supplierName}</td>
                        <td className="py-2.5 px-4 font-mono text-[#667781]">{p.billNumber}</td>
                        <td className="py-2.5 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#84B3CE]/25 text-[#16587B]">
                            {p.paymentMethod}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-[#667781]">
                          <div>{p.bankAccountName || 'Direct'}</div>
                          <div className="text-[10px] font-mono">{p.referenceNumber}</div>
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-emerald-700">
                          ₹{p.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-4 text-center text-[#667781]">{p.createdByName || p.createdBy}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 5: DEBIT NOTES & PURCHASE RETURNS */}
          {activeTab === 'RETURNS' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAF6EC] text-[#667781] border-b border-[#E9EDEF]">
                    <th className="py-2.5 px-4 font-semibold">Debit Note #</th>
                    <th className="py-2.5 px-4 font-semibold">Date</th>
                    <th className="py-2.5 px-4 font-semibold">Supplier</th>
                    <th className="py-2.5 px-4 font-semibold">Bill Ref</th>
                    <th className="py-2.5 px-4 font-semibold">Reason</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Taxable</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Input GST Rev</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Debit Amount</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EDEF]">
                  {debitNotes.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-[#667781]">
                        No debit notes or purchase returns recorded. Click "Debit Note" to issue a supplier return.
                      </td>
                    </tr>
                  ) : (
                    debitNotes.map((dn) => (
                      <tr key={dn.id} className="hover:bg-[#FAF6EC] transition-colors">
                        <td className="py-2.5 px-4 font-mono font-semibold text-[#111B21]">{dn.debitNoteNumber}</td>
                        <td className="py-2.5 px-4 text-[#667781] tabular-nums">{dn.issueDate}</td>
                        <td className="py-2.5 px-4 font-medium text-[#111B21]">{dn.supplierName}</td>
                        <td className="py-2.5 px-4 font-mono text-[#667781]">{dn.billNumber || '—'}</td>
                        <td className="py-2.5 px-4 text-[#667781]">{dn.reason}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          ₹{dn.taxableTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#667781]">
                          ₹{(dn.cgstTotal + dn.sgstTotal + dn.igstTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-[#16587B]">
                          ₹{dn.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            {dn.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: CREATE PURCHASE ORDER */}
      {isCreatePoOpen && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full overflow-hidden border border-[#D1D7DB]">
            <div className="bg-[#16587B] text-[#F5EEDD] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[#84B3CE]" />
                <h2 className="text-base font-bold">Create Purchase Order</h2>
              </div>
              <button onClick={() => setIsCreatePoOpen(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePurchaseOrder} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Supplier *</label>
                  <select
                    required
                    value={poSupplierId}
                    onChange={(e) => setPoSupplierId(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  >
                    <option value="">-- Select Supplier --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.city ? `(${s.city})` : ''} — AP Bal: ₹{s.outstandingBalance || 0}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Expected Delivery Date</label>
                  <input
                    type="date"
                    value={poExpectedDate}
                    onChange={(e) => setPoExpectedDate(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  />
                </div>
              </div>

              {/* Items Section */}
              <div className="border border-[#D1D7DB] rounded-xl p-3.5 bg-[#FAF6EC] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-[#111B21]">Ordered Products</span>
                  <button
                    type="button"
                    onClick={handleAddPoItem}
                    className="px-2.5 py-1 bg-[#16587B] text-[#F5EEDD] rounded text-[11px] font-semibold hover:bg-[#124866] transition-colors"
                  >
                    + Add Product
                  </button>
                </div>

                {poItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-lg border border-[#E9EDEF]">
                    <div className="col-span-5">
                      <label className="block text-[10px] text-[#667781] mb-0.5">Product</label>
                      <select
                        value={item.productId}
                        onChange={(e) => handlePoItemChange(idx, 'productId', e.target.value)}
                        className="w-full px-2 py-1.5 border border-[#D1D7DB] rounded text-xs focus:outline-none"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Stock: {p.stockLevel})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10px] text-[#667781] mb-0.5">Order Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handlePoItemChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                        className="w-full px-2 py-1.5 border border-[#D1D7DB] rounded text-xs text-center font-bold"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10px] text-[#667781] mb-0.5">Cost Rate (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => handlePoItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 border border-[#D1D7DB] rounded text-xs text-right font-mono"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10px] text-[#667781] mb-0.5">Subtotal</label>
                      <div className="font-bold text-xs text-[#16587B] pt-1 font-mono">
                        ₹{(item.quantity * item.unitPrice).toFixed(2)}
                      </div>
                    </div>

                    <div className="col-span-1 text-center pt-3">
                      {poItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePoItem(idx)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-3.5 h-3.5 mx-auto" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block font-medium text-[#111B21] mb-1">Order Instructions / Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Delivery via door freight, include batch test certificate"
                  value={poNotes}
                  onChange={(e) => setPoNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                />
              </div>

              <div className="pt-3 border-t border-[#E9EDEF] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreatePoOpen(false)}
                  className="px-4 py-2 border border-[#D1D7DB] rounded-lg text-[#667781] hover:bg-gray-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] rounded-lg font-bold shadow-xs transition-colors"
                >
                  Confirm Purchase Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RECEIVE GOODS (GRN) */}
      {isReceiveGoodsOpen && targetPo && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full overflow-hidden border border-[#D1D7DB]">
            <div className="bg-[#16587B] text-[#F5EEDD] px-5 py-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-[#84B3CE]">Goods Receipt Note (GRN)</div>
                <h2 className="text-base font-bold">Inward Items for {targetPo.poNumber}</h2>
              </div>
              <button onClick={() => setIsReceiveGoodsOpen(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteReceiveGoods} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
              <div className="p-3 bg-[#FAF6EC] rounded-lg border border-[#E9EDEF]">
                <div className="flex justify-between">
                  <span className="text-[#667781]">Supplier:</span>
                  <span className="font-bold text-[#111B21]">{targetPo.supplierName}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[#667781]">Order Date:</span>
                  <span>{targetPo.orderDate}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-[#111B21]">Verify Received Quantities</h4>
                {grnReceivedItems.map((item, idx) => {
                  const prod = products.find((p) => p.id === item.productId);
                  return (
                    <div key={idx} className="p-3 bg-white border border-[#D1D7DB] rounded-lg space-y-2">
                      <div className="flex justify-between font-bold text-[#111B21]">
                        <span>{prod?.name || 'Product'}</span>
                        <span className="text-[#16587B]">Current Stock: {prod?.stockLevel || 0}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] text-[#667781] mb-0.5">Quantity Received</label>
                          <input
                            type="number"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => {
                              const updated = [...grnReceivedItems];
                              updated[idx].quantity = parseInt(e.target.value) || 0;
                              setGrnReceivedItems(updated);
                            }}
                            className="w-full px-2.5 py-1.5 border border-[#D1D7DB] rounded font-bold text-center"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#667781] mb-0.5">Batch / Lot #</label>
                          <input
                            type="text"
                            value={item.batchNumber}
                            onChange={(e) => {
                              const updated = [...grnReceivedItems];
                              updated[idx].batchNumber = e.target.value;
                              setGrnReceivedItems(updated);
                            }}
                            className="w-full px-2.5 py-1.5 border border-[#D1D7DB] rounded font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block font-medium text-[#111B21] mb-1">Inward Remarks</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Inspected packages, zero breakage observed"
                  value={grnNotes}
                  onChange={(e) => setGrnNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                />
              </div>

              <div className="pt-3 border-t border-[#E9EDEF] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReceiveGoodsOpen(false)}
                  className="px-4 py-2 border border-[#D1D7DB] rounded-lg text-[#667781] hover:bg-gray-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] rounded-lg font-bold shadow-xs transition-colors"
                >
                  Confirm GRN & Restock Inventory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE SUPPLIER BILL (AP) */}
      {isCreateBillOpen && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-[#D1D7DB]">
            <div className="bg-[#16587B] text-[#F5EEDD] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[#84B3CE]" />
                <h2 className="text-base font-bold">Record Supplier Bill</h2>
              </div>
              <button onClick={() => setIsCreateBillOpen(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSupplierBill} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-[#111B21] mb-1">Supplier *</label>
                <select
                  required
                  value={billSupplierId}
                  onChange={(e) => setBillSupplierId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                >
                  <option value="">-- Select Supplier --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — Current Payable: ₹{s.outstandingBalance || 0}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Total Bill Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={billTotalAmount}
                    onChange={(e) => setBillTotalAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B] font-bold text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Vendor Invoice #</label>
                  <input
                    type="text"
                    placeholder="Auto-generated if blank"
                    value={billInvoiceNumber}
                    onChange={(e) => setBillInvoiceNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Included GST (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={billGstAmount}
                    onChange={(e) => setBillGstAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B] font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Due Date</label>
                  <input
                    type="date"
                    value={billDueDate}
                    onChange={(e) => setBillDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#111B21] mb-1">Bill Notes</label>
                <input
                  type="text"
                  placeholder="Invoice number or terms"
                  value={billNotes}
                  onChange={(e) => setBillNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                />
              </div>

              <div className="pt-3 border-t border-[#E9EDEF] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateBillOpen(false)}
                  className="px-4 py-2 border border-[#D1D7DB] rounded-lg text-[#667781] hover:bg-gray-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] rounded-lg font-bold shadow-xs transition-colors"
                >
                  Post Bill to AP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RECORD SUPPLIER PAYMENT */}
      {isRecordPaymentOpen && targetBill && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-[#D1D7DB]">
            <div className="bg-[#16587B] text-[#F5EEDD] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#84B3CE]" />
                <h2 className="text-base font-bold">Disburse Payment</h2>
              </div>
              <button onClick={() => setIsRecordPaymentOpen(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecutePayment} className="p-5 space-y-3.5 text-xs">
              <div className="p-3 bg-[#FAF6EC] rounded-lg border border-[#E9EDEF]">
                <div className="flex justify-between">
                  <span className="text-[#667781]">Bill:</span>
                  <span className="font-bold text-[#111B21]">{targetBill.billNumber}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[#667781]">Supplier:</span>
                  <span className="font-medium text-[#111B21]">{targetBill.supplierName}</span>
                </div>
                <div className="flex justify-between mt-1 font-bold">
                  <span className="text-[#667781]">Outstanding Due:</span>
                  <span className="text-amber-700">₹{targetBill.outstandingAmount.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#111B21] mb-1">Disbursement Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={targetBill.outstandingAmount}
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B] font-bold text-sm font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Payment Method</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as PaymentMode)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  >
                    <option value="BANK">Bank Transfer (NEFT/RTGS)</option>
                    <option value="UPI">UPI Payment</option>
                    <option value="CARD">Corporate Card</option>
                    <option value="CASH">Counter Cash</option>
                    <option value="CHEQUE">Bank Cheque</option>
                  </select>
                </div>

                {['BANK', 'UPI', 'CARD'].includes(payMethod) && (
                  <div>
                    <label className="block font-medium text-[#111B21] mb-1">Disburse From Bank</label>
                    <select
                      value={payBankAccountId}
                      onChange={(e) => setPayBankAccountId(e.target.value)}
                      className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                    >
                      {bankAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.bankName} (₹{a.currentBalance.toLocaleString('en-IN')})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-medium text-[#111B21] mb-1">Payment Reference / UTR</label>
                <input
                  type="text"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B] font-mono"
                />
              </div>

              <div className="pt-3 border-t border-[#E9EDEF] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRecordPaymentOpen(false)}
                  className="px-4 py-2 border border-[#D1D7DB] rounded-lg text-[#667781] hover:bg-gray-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] rounded-lg font-bold shadow-xs transition-colors"
                >
                  Authorize Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE DEBIT NOTE / PURCHASE RETURN */}
      {isCreateDebitNoteOpen && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full overflow-hidden border border-[#D1D7DB]">
            <div className="bg-[#16587B] text-[#F5EEDD] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileMinus2 className="w-5 h-5 text-[#84B3CE]" />
                <h2 className="text-base font-bold">Issue Supplier Debit Note / Purchase Return</h2>
              </div>
              <button onClick={() => setIsCreateDebitNoteOpen(false)} className="text-white/80 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateDebitNote} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Supplier *</label>
                  <select
                    required
                    value={dnSupplierId}
                    onChange={(e) => setDnSupplierId(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  >
                    <option value="">-- Select Supplier --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — AP Bal: ₹{s.outstandingBalance || 0}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Linked Supplier Bill (Optional)</label>
                  <select
                    value={dnBillId}
                    onChange={(e) => setDnBillId(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  >
                    <option value="">-- Standalone Debit Note --</option>
                    {supplierBills
                      .filter((b) => !dnSupplierId || b.supplierId === dnSupplierId)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.billNumber} (Due: ₹{b.outstandingAmount.toLocaleString('en-IN')})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#111B21] mb-1">Return Reason</label>
                  <select
                    value={dnReason}
                    onChange={(e) => setDnReason(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                  >
                    <option value="DAMAGED_GOODS">Damaged / Defective Stock</option>
                    <option value="EXCESS_SUPPLY">Excess / Wrong Quantity Supplied</option>
                    <option value="RATE_DISCREPANCY">Rate / Billing Discrepancy</option>
                    <option value="QUALITY_REJECTION">Quality Control Rejection</option>
                  </select>
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dnDeductInventory}
                      onChange={(e) => setDnDeductInventory(e.target.checked)}
                      className="w-4 h-4 accent-[#16587B]"
                    />
                    <span className="font-medium text-[#111B21]">Deduct returned stock from branch inventory</span>
                  </label>
                </div>
              </div>

              <div className="border border-[#D1D7DB] rounded-xl p-3.5 bg-[#FAF6EC] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#111B21]">Returned Line Items</span>
                  <button
                    type="button"
                    onClick={() => {
                      const p = products[0];
                      if (p) {
                        setDnItems([...dnItems, { productId: p.id, quantity: 1, unitPrice: p.costPrice || 50, gstRate: p.taxRate || 18 }]);
                      }
                    }}
                    className="px-2.5 py-1 bg-[#16587B] text-[#F5EEDD] rounded text-[11px] font-semibold hover:bg-[#124866] cursor-pointer"
                  >
                    + Add Line
                  </button>
                </div>
                {dnItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded-lg border border-[#E9EDEF]">
                    <div className="col-span-5">
                      <select
                        value={item.productId}
                        onChange={(e) => {
                          const p = products.find((x) => x.id === e.target.value);
                          const next = [...dnItems];
                          next[idx] = {
                            ...next[idx],
                            productId: e.target.value,
                            unitPrice: p?.costPrice || next[idx].unitPrice,
                            gstRate: p?.taxRate || next[idx].gstRate,
                          };
                          setDnItems(next);
                        }}
                        className="w-full px-2 py-1.5 border border-[#D1D7DB] rounded text-xs"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Stock: {p.stockLevel})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => {
                          const next = [...dnItems];
                          next[idx].quantity = parseInt(e.target.value) || 1;
                          setDnItems(next);
                        }}
                        className="w-full px-2 py-1.5 border border-[#D1D7DB] rounded text-center font-bold"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => {
                          const next = [...dnItems];
                          next[idx].unitPrice = parseFloat(e.target.value) || 0;
                          setDnItems(next);
                        }}
                        className="w-full px-2 py-1.5 border border-[#D1D7DB] rounded text-right font-mono"
                      />
                    </div>
                    <div className="col-span-2">
                      <select
                        value={item.gstRate}
                        onChange={(e) => {
                          const next = [...dnItems];
                          next[idx].gstRate = parseFloat(e.target.value) || 0;
                          setDnItems(next);
                        }}
                        className="w-full px-1.5 py-1.5 border border-[#D1D7DB] rounded text-xs"
                      >
                        <option value={0}>0% GST</option>
                        <option value={5}>5% GST</option>
                        <option value={12}>12% GST</option>
                        <option value={18}>18% GST</option>
                        <option value={28}>28% GST</option>
                      </select>
                    </div>
                    <div className="col-span-1 text-center">
                      {dnItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setDnItems(dnItems.filter((_, i) => i !== idx))}
                          className="text-red-500 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 mx-auto" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block font-medium text-[#111B21] mb-1">Remarks / Supplier Credit Ref</label>
                <input
                  type="text"
                  placeholder="Optional narration for GL audit trail"
                  value={dnNotes}
                  onChange={(e) => setDnNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
                />
              </div>

              <div className="pt-3 border-t border-[#E9EDEF] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateDebitNoteOpen(false)}
                  className="px-4 py-2 border border-[#D1D7DB] rounded-lg text-[#667781] hover:bg-gray-50 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] rounded-lg font-bold shadow-xs transition-colors cursor-pointer"
                >
                  Issue Debit Note &amp; Post GL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
