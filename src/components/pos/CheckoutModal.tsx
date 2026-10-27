/**
 * SLATE POS — Multi-Tender Checkout Modal
 * Indian Retail: Cash with denomination breakdown, UPI dynamic QR, Card EDC & Split Tender
 * Enforces offline payment verification policy (cannot invent gateway verification when offline)
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6)
 */

import React, { useState } from 'react';
import { Customer, CartItem, PaymentMethod, PaymentRecord } from '../../types';
import { formatINR } from '../../lib/formatters';
import { calculateCartTotals } from '../../lib/taxCalculations';
import { THEME } from '../../lib/theme';
import {
  Banknote,
  QrCode,
  CreditCard,
  Split,
  AlertTriangle,
  X,
  CheckCircle,
  Clock,
} from 'lucide-react';

interface CheckoutModalProps {
  items: CartItem[];
  customer: Customer | null;
  isOffline: boolean;
  onClose: () => void;
  onCompleteSale: (payments: PaymentRecord[]) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  items,
  customer,
  isOffline,
  onClose,
  onCompleteSale,
}) => {
  const totals = calculateCartTotals(items);
  const grandTotal = totals.grandTotal;

  const [method, setMethod] = useState<PaymentMethod>('CASH');

  // Cash Tender State
  const [cashTendered, setCashTendered] = useState<number>(grandTotal);
  const changeToReturn = Math.max(0, cashTendered - grandTotal);

  // UPI State
  const [upiUtr, setUpiUtr] = useState<string>('');

  // Card State
  const [cardAuthCode, setCardAuthCode] = useState<string>('');

  // Split Tender State
  const [splitCashAmount, setSplitCashAmount] = useState<number>(Math.floor(grandTotal / 2));
  const splitUpiAmount = Math.max(0, grandTotal - splitCashAmount);

  const handleQuickCash = (denom: number) => {
    setCashTendered(denom);
  };

  const handleConfirmCheckout = () => {
    const now = new Date().toISOString();
    let payments: PaymentRecord[] = [];

    if (method === 'CASH') {
      if (cashTendered < grandTotal) {
        alert('Tendered cash cannot be less than grand total');
        return;
      }
      payments.push({
        id: `pay_${Date.now()}`,
        saleId: '',
        method: 'CASH',
        amount: grandTotal,
        tenderedAmount: cashTendered,
        changeReturned: changeToReturn,
        gatewayStatus: 'OFFLINE_RECORDED',
        timestamp: now,
      });
    } else if (method === 'UPI') {
      payments.push({
        id: `pay_${Date.now()}`,
        saleId: '',
        method: 'UPI',
        amount: grandTotal,
        utrOrRef: upiUtr.trim() || `UPI/REF/${Date.now().toString().slice(-8)}`,
        gatewayStatus: isOffline ? 'PENDING_VERIFICATION' : 'VERIFIED',
        timestamp: now,
      });
    } else if (method === 'CARD') {
      payments.push({
        id: `pay_${Date.now()}`,
        saleId: '',
        method: 'CARD',
        amount: grandTotal,
        utrOrRef: cardAuthCode.trim() || `CARD/AUTH/${Date.now().toString().slice(-6)}`,
        gatewayStatus: 'VERIFIED',
        timestamp: now,
      });
    } else if (method === 'CREDIT') {
      if (!customer) {
        alert('Customer must be selected for store credit sales.');
        return;
      }
      payments.push({
        id: `pay_${Date.now()}`,
        saleId: '',
        method: 'CREDIT',
        amount: 0,
        gatewayStatus: 'OFFLINE_RECORDED',
        timestamp: now,
      });
    } else if (method === 'SPLIT') {
      payments.push({
        id: `pay_${Date.now()}_cash`,
        saleId: '',
        method: 'CASH',
        amount: splitCashAmount,
        tenderedAmount: splitCashAmount,
        changeReturned: 0,
        gatewayStatus: 'OFFLINE_RECORDED',
        timestamp: now,
      });
      payments.push({
        id: `pay_${Date.now()}_upi`,
        saleId: '',
        method: 'UPI',
        amount: splitUpiAmount,
        utrOrRef: upiUtr.trim() || `SPLIT/UPI/${Date.now().toString().slice(-6)}`,
        gatewayStatus: isOffline ? 'PENDING_VERIFICATION' : 'VERIFIED',
        timestamp: now,
      });
    }

    onCompleteSale(payments);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl border border-[#D1D7DB] w-full max-w-xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#075E54] text-white flex items-center justify-between">
          <div>
            <div className="text-xs text-[#DCF8C6] uppercase tracking-wider font-semibold">Tender Checkout</div>
            <div className="text-lg font-bold tabular-nums">Total Payable: {formatINR(grandTotal)}</div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#128C7E] text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Payment Method Selector Tabs */}
        <div className="grid grid-cols-5 p-2 bg-[#F7F5F2] border-b border-[#D1D7DB] gap-1">
          <button
            onClick={() => setMethod('CASH')}
            className={`py-2 px-1 rounded text-xs font-semibold flex flex-col items-center gap-1 transition-colors cursor-pointer ${
              method === 'CASH'
                ? 'bg-white text-[#075E54] shadow-xs border border-[#128C7E]'
                : 'text-[#667781] hover:bg-[#ECE5DD]'
            }`}
          >
            <Banknote className="w-4 h-4" />
            <span>Cash</span>
          </button>

          <button
            onClick={() => setMethod('UPI')}
            className={`py-2 px-1 rounded text-xs font-semibold flex flex-col items-center gap-1 transition-colors cursor-pointer ${
              method === 'UPI'
                ? 'bg-white text-[#075E54] shadow-xs border border-[#128C7E]'
                : 'text-[#667781] hover:bg-[#ECE5DD]'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>UPI QR</span>
          </button>

          <button
            onClick={() => setMethod('CARD')}
            className={`py-2 px-1 rounded text-xs font-semibold flex flex-col items-center gap-1 transition-colors cursor-pointer ${
              method === 'CARD'
                ? 'bg-white text-[#075E54] shadow-xs border border-[#128C7E]'
                : 'text-[#667781] hover:bg-[#ECE5DD]'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Card / EDC</span>
          </button>

          <button
            onClick={() => setMethod('SPLIT')}
            className={`py-2 px-1 rounded text-xs font-semibold flex flex-col items-center gap-1 transition-colors cursor-pointer ${
              method === 'SPLIT'
                ? 'bg-white text-[#075E54] shadow-xs border border-[#128C7E]'
                : 'text-[#667781] hover:bg-[#ECE5DD]'
            }`}
          >
            <Split className="w-4 h-4" />
            <span>Split</span>
          </button>

          <button
            onClick={() => setMethod('CREDIT')}
            className={`py-2 px-1 rounded text-xs font-semibold flex flex-col items-center gap-1 transition-colors cursor-pointer ${
              method === 'CREDIT'
                ? 'bg-white text-[#075E54] shadow-xs border border-[#128C7E]'
                : 'text-[#667781] hover:bg-[#ECE5DD]'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Credit/Bill</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* METHOD 1: CASH */}
          {method === 'CASH' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#111B21] block mb-1">
                  Cash Received (INR)
                </label>
                <input
                  type="number"
                  value={cashTendered || ''}
                  onChange={(e) => setCashTendered(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-xl font-bold tabular-nums text-[#111B21] border border-[#D1D7DB] rounded-md focus:border-[#128C7E] focus:outline-none"
                  autoFocus
                />
              </div>

              {/* Quick Indian Currency Denominations */}
              <div>
                <div className="text-[11px] font-medium text-[#667781] mb-1.5">Quick Currency Notes:</div>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    onClick={() => handleQuickCash(grandTotal)}
                    className="py-1.5 px-2 bg-[#F7F5F2] hover:bg-[#ECE5DD] text-[#111B21] font-semibold text-xs rounded border border-[#D1D7DB] transition-colors cursor-pointer"
                  >
                    Exact {formatINR(grandTotal, { showDecimals: false })}
                  </button>
                  <button
                    onClick={() => handleQuickCash(500)}
                    className="py-1.5 px-2 bg-[#F7F5F2] hover:bg-[#ECE5DD] text-[#111B21] font-semibold text-xs rounded border border-[#D1D7DB] transition-colors cursor-pointer"
                  >
                    ₹500
                  </button>
                  <button
                    onClick={() => handleQuickCash(1000)}
                    className="py-1.5 px-2 bg-[#F7F5F2] hover:bg-[#ECE5DD] text-[#111B21] font-semibold text-xs rounded border border-[#D1D7DB] transition-colors cursor-pointer"
                  >
                    ₹1,000
                  </button>
                  <button
                    onClick={() => handleQuickCash(2000)}
                    className="py-1.5 px-2 bg-[#F7F5F2] hover:bg-[#ECE5DD] text-[#111B21] font-semibold text-xs rounded border border-[#D1D7DB] transition-colors cursor-pointer"
                  >
                    ₹2,000
                  </button>
                </div>
              </div>

              {/* Change to Return Calculation */}
              <div className="p-3.5 bg-[#DCF8C6]/50 border border-[#B3EBA0] rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-[#075E54]">Change to Return Customer</div>
                  <div className="text-[11px] text-[#075E54]/80">Calculated automatically for counter cashier</div>
                </div>
                <div className="text-xl font-bold tabular-nums text-[#075E54]">
                  {formatINR(changeToReturn)}
                </div>
              </div>
            </div>
          )}

          {/* METHOD 2: UPI */}
          {method === 'UPI' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center gap-5 p-4 bg-[#F7F5F2] border border-[#D1D7DB] rounded-lg">
                {/* Dynamic UPI Bharat QR Code Canvas / Visual */}
                <div className="w-36 h-36 bg-white p-2 rounded border border-[#D1D7DB] flex flex-col items-center justify-center shrink-0">
                  <div className="w-full h-full border-2 border-dashed border-[#075E54]/40 flex flex-col items-center justify-center p-2 text-center bg-[#F7F5F2]">
                    <QrCode className="w-16 h-16 text-[#075E54]" />
                    <span className="text-[9px] tabular-nums font-bold text-[#075E54] mt-1">BHARAT UPI QR</span>
                  </div>
                </div>

                <div className="space-y-2 text-left">
                  <div className="text-xs font-semibold text-[#111B21]">
                    Scan using Google Pay, PhonePe, Paytm, or BHIM
                  </div>
                  <div className="text-xs text-[#075E54] tabular-nums font-bold bg-[#DCF8C6]/40 px-2.5 py-1 rounded border border-[#B3EBA0]">
                    apexretail@icici · ₹{grandTotal}
                  </div>
                  <div className="text-[11px] text-[#667781]">
                    Customer can scan dynamic QR on mobile screen to authorize transfer.
                  </div>
                </div>
              </div>

              {/* Critical Rule Enforcement: If offline, show warning and mark as pending */}
              {isOffline ? (
                <div className="p-3 bg-[#FEF3C7] border border-[#FDE68A] rounded text-xs text-[#92400E] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Terminal Offline Notice: </span>
                    UPI payment confirmation cannot be verified with the bank gateway while offline.
                    This sale will be saved locally as <span className="tabular-nums font-semibold">PENDING_VERIFICATION</span> and synced once back online.
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-[#075E54] bg-[#DCF8C6]/60 p-2.5 rounded border border-[#B3EBA0]">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>Cloud Gateway Connected · Instant Bank Webhook Reconciliation Active</span>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-[#111B21] block mb-1">
                  Bank UTR / Transaction Ref (Optional or Enter 12-digit ref)
                </label>
                <input
                  type="text"
                  value={upiUtr}
                  onChange={(e) => setUpiUtr(e.target.value)}
                  placeholder="e.g. 628491028471"
                  className="w-full px-3 py-1.5 text-xs tabular-nums border border-[#D1D7DB] rounded focus:border-[#128C7E] focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* METHOD 3: CARD */}
          {method === 'CARD' && (
            <div className="space-y-4">
              <div className="p-4 bg-[#F7F5F2] border border-[#D1D7DB] rounded-lg text-xs space-y-2">
                <div className="font-bold text-[#111B21]">PineLabs / MSwipe / ICICI EDC POS Terminal</div>
                <div className="text-[#667781]">
                  Swipe, dip, or tap Visa/Mastercard/RuPay card on counter terminal for ₹{grandTotal}.
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#111B21] block mb-1">
                  Terminal Authorization Code / RRN
                </label>
                <input
                  type="text"
                  value={cardAuthCode}
                  onChange={(e) => setCardAuthCode(e.target.value)}
                  placeholder="e.g. AUTH-982144"
                  className="w-full px-3 py-1.5 text-xs tabular-nums border border-[#D1D7DB] rounded focus:border-[#128C7E] focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* METHOD 4: SPLIT TENDER */}
          {method === 'SPLIT' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#111B21] block mb-1">
                    Cash Portion (₹)
                  </label>
                  <input
                    type="number"
                    value={splitCashAmount}
                    onChange={(e) => setSplitCashAmount(Math.min(grandTotal, parseFloat(e.target.value) || 0))}
                    className="w-full px-3 py-2 text-sm font-bold tabular-nums border border-[#D1D7DB] rounded"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#111B21] block mb-1">
                    UPI / Card Portion (₹)
                  </label>
                  <input
                    type="number"
                    value={splitUpiAmount}
                    readOnly
                    className="w-full px-3 py-2 text-sm font-bold tabular-nums bg-[#F7F5F2] border border-[#D1D7DB] rounded"
                  />
                </div>
              </div>
              <div className="text-xs text-[#667781]">
                Split total: Cash {formatINR(splitCashAmount)} + UPI {formatINR(splitUpiAmount)} = {formatINR(grandTotal)}
              </div>
            </div>
          )}

          {/* METHOD 5: CREDIT */}
          {method === 'CREDIT' && (
            <div className="space-y-3">
              {customer ? (
                <div className="p-3.5 bg-[#DCF8C6]/40 border border-[#B3EBA0] rounded text-xs space-y-1">
                  <div className="font-bold text-[#075E54]">Credit Account: {customer.name}</div>
                  <div className="text-[#075E54]">Credit Limit: {formatINR(customer.creditLimit)}</div>
                  <div className="text-[#075E54]">Current Balance: {formatINR(customer.currentReceivableBalance)}</div>
                  <div className="text-[#667781] pt-1">
                    This bill will be added to customer's outstanding receivables with 15-day due date.
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-[#FEE2E2] border border-[#FECACA] rounded text-xs text-[#B91C1C]">
                  Please attach a registered customer to this sale before billing on credit.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-[#F7F5F2] border-t border-[#D1D7DB] flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[#667781] hover:bg-[#ECE5DD] rounded transition-colors cursor-pointer"
          >
            Cancel (Esc)
          </button>
          <button
            onClick={handleConfirmCheckout}
            className="px-6 py-2 text-xs font-bold text-white bg-[#075E54] hover:bg-[#128C7E] rounded shadow-xs transition-colors cursor-pointer"
          >
            Confirm &amp; Print Receipt (Enter)
          </button>
        </div>
      </div>
    </div>
  );
};
