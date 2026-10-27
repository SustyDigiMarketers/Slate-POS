/**
 * SLATE POS — Tax & Cart Calculations
 * Complies with Indian Goods and Services Tax (GST) rules
 */

import { CartItem, Product } from '../types';

export interface TaxBreakdown {
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  roundOff: number;
  grandTotal: number;
}

export function roundToPaise(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function calculateCartItem(
  product: Product,
  quantity: number,
  discountPercent = 0,
  isInterState = false
): CartItem {
  const safeQty = Math.max(1, quantity);
  const gross = product.sellingPrice * safeQty;
  const discountAmt = roundToPaise((gross * discountPercent) / 100);
  const taxable = roundToPaise(gross - discountAmt);

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (product.gstRate > 0) {
    if (isInterState) {
      igst = roundToPaise((taxable * product.gstRate) / 100);
    } else {
      const halfRate = product.gstRate / 2;
      cgst = roundToPaise((taxable * halfRate) / 100);
      sgst = roundToPaise((taxable * halfRate) / 100);
    }
  }

  const total = roundToPaise(taxable + cgst + sgst + igst);

  return {
    product,
    quantity: safeQty,
    unitPrice: product.sellingPrice,
    discountPercent,
    discountAmount: discountAmt,
    taxableAmount: taxable,
    cgstAmount: cgst,
    sgstAmount: sgst,
    igstAmount: igst,
    total,
  };
}

export function calculateCartTotals(items: CartItem[]): TaxBreakdown {
  let subtotal = 0;
  let discountTotal = 0;
  let taxableTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  for (const item of items) {
    subtotal += item.unitPrice * item.quantity;
    discountTotal += item.discountAmount;
    taxableTotal += item.taxableAmount;
    cgstTotal += item.cgstAmount;
    sgstTotal += item.sgstAmount;
    igstTotal += item.igstAmount;
  }

  subtotal = roundToPaise(subtotal);
  discountTotal = roundToPaise(discountTotal);
  taxableTotal = roundToPaise(taxableTotal);
  cgstTotal = roundToPaise(cgstTotal);
  sgstTotal = roundToPaise(sgstTotal);
  igstTotal = roundToPaise(igstTotal);

  const rawGrand = taxableTotal + cgstTotal + sgstTotal + igstTotal;
  const roundedGrand = Math.round(rawGrand);
  const roundOff = roundToPaise(roundedGrand - rawGrand);

  return {
    subtotal,
    discountTotal,
    taxableTotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    roundOff,
    grandTotal: roundedGrand,
  };
}
