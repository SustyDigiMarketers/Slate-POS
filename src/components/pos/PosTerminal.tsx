/**
 * SLATE POS — High-Speed POS Checkout Terminal
 * Optimized for barcode scanner, keyboard shortcuts, touch, mouse, and mobile responsiveness
 * Real-time tax breakdown, offline caching, and customer credit ledger
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6 / #ECE5DD / #D1D7DB)
 */

import React, { useState, useEffect, useRef } from 'react';
import { Product, Customer, CartItem, Sale, PaymentRecord } from '../../types';
import { offlineStore } from '../../lib/offlineStore';
import { INITIAL_CATEGORIES } from '../../lib/initialData';
import { calculateCartItem, calculateCartTotals } from '../../lib/taxCalculations';
import { formatINR } from '../../lib/formatters';
import { THEME } from '../../lib/theme';
import { CheckoutModal } from './CheckoutModal';
import { ThermalReceiptModal } from './ThermalReceiptModal';
import {
  Barcode,
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  User,
  Percent,
  CheckCircle,
  AlertCircle,
  Package,
  Layers,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface PosTerminalProps {
  onOpenCustomerModal?: () => void;
}

export const PosTerminal: React.FC<PosTerminalProps> = () => {
  const [products, setProducts] = useState<Product[]>(offlineStore.getProducts());
  const [customers, setCustomers] = useState<Customer[]>(offlineStore.getCustomers());
  const [isOffline, setIsOffline] = useState<boolean>(offlineStore.isOffline());

  // Cart & Transaction State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [productSearch, setProductSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Mobile viewport view switcher ('PRODUCTS' vs 'CART')
  const [mobileTab, setMobileTab] = useState<'PRODUCTS' | 'CART'>('PRODUCTS');
  const [scanToast, setScanToast] = useState<string | null>(null);

  // Modal States
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [lastCommittedSale, setLastCommittedSale] = useState<Sale | null>(null);
  const [isQuickCustomerOpen, setIsQuickCustomerOpen] = useState(false);

  // Quick customer input states
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustGstin, setNewCustGstin] = useState('');

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setProducts(offlineStore.getProducts());
      setCustomers(offlineStore.getCustomers());
      setIsOffline(offlineStore.isOffline());
    });
    return unsub;
  }, []);

  // Keyboard Shortcuts (F2 search, F4 tender, Esc clear)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setMobileTab('PRODUCTS');
        barcodeInputRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0) setIsCheckoutModalOpen(true);
      } else if (e.key === 'Escape' && !isCheckoutModalOpen && !lastCommittedSale) {
        if (cart.length > 0 && confirm('Clear current cart?')) {
          setCart([]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, isCheckoutModalOpen, lastCommittedSale]);

  const showToast = (msg: string) => {
    setScanToast(msg);
    setTimeout(() => setScanToast(null), 2500);
  };

  // Barcode Scanner submission handler
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = barcodeInput.trim();
    if (!query) return;

    const match = products.find(
      (p) => p.barcode === query || p.sku.toLowerCase() === query.toLowerCase()
    );

    if (match) {
      addToCart(match);
      setBarcodeInput('');
      showToast(`Scanned: ${match.name}`);
    } else {
      showToast(`Barcode "${query}" not found in local catalog`);
    }
  };

  // Add Item to Cart (or increment quantity if already exists)
  const addToCart = (product: Product) => {
    if (product.currentStock <= 0) {
      showToast(`Warning: ${product.name} is out of stock`);
    }

    setCart((prev) => {
      const existingIdx = prev.findIndex((item) => item.product.id === product.id);
      if (existingIdx >= 0) {
        const item = prev[existingIdx];
        const updated = calculateCartItem(product, item.quantity + 1, item.discountPercent);
        const next = [...prev];
        next[existingIdx] = updated;
        return next;
      } else {
        const newItem = calculateCartItem(product, 1, 0);
        return [newItem, ...prev];
      }
    });

    showToast(`Added: ${product.name}`);
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.product.id === productId) {
            const nextQty = item.quantity + delta;
            if (nextQty <= 0) return null;
            return calculateCartItem(item.product, nextQty, item.discountPercent);
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const updateDiscount = (productId: string, percent: number) => {
    const safePercent = Math.min(100, Math.max(0, percent));
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id === productId) {
          return calculateCartItem(item.product, item.quantity, safePercent);
        }
        return item;
      })
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleCheckoutComplete = (payments: PaymentRecord[]) => {
    const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || null;

    const result = offlineStore.checkoutSale({
      items: cart,
      customer: selectedCustomer,
      payments,
    });

    if (result.success && result.sale) {
      setLastCommittedSale(result.sale);
      setIsCheckoutModalOpen(false);
      setCart([]);
      setSelectedCustomerId('');
      setMobileTab('PRODUCTS');
    } else {
      alert(result.error || 'Failed to complete checkout');
    }
  };

  const handleSaveQuickCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName || !newCustPhone) return;

    const added = offlineStore.addCustomer({
      name: newCustName,
      phone: newCustPhone,
      gstin: newCustGstin.trim() || undefined,
      creditLimit: 50000,
    });

    setSelectedCustomerId(added.id);
    setIsQuickCustomerOpen(false);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustGstin('');
    showToast(`Customer ${added.name} linked to bill`);
  };

  // Filtered Products
  const filteredProducts = products.filter((p) => {
    if (!p.isActive) return false;
    if (selectedCategory !== 'ALL' && p.categoryId !== selectedCategory) return false;
    if (productSearch) {
      const q = productSearch.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.includes(q)
      );
    }
    return true;
  });

  const totals = calculateCartTotals(cart);
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  return (
    <div className="h-full flex flex-col space-y-3 relative pb-16 md:pb-0">
      {/* Mobile Mode Switcher (<768px) */}
      <div className="md:hidden flex rounded-lg bg-white p-1 border border-[#D1D7DB] shadow-2xs">
        <button
          onClick={() => setMobileTab('PRODUCTS')}
          className={`flex-1 py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            mobileTab === 'PRODUCTS'
              ? 'bg-[#075E54] text-white shadow-xs'
              : 'text-[#667781] hover:text-[#111B21]'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>Product Catalogue</span>
        </button>
        <button
          onClick={() => setMobileTab('CART')}
          className={`flex-1 py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            mobileTab === 'CART'
              ? 'bg-[#075E54] text-white shadow-xs'
              : 'text-[#667781] hover:text-[#111B21]'
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>Current Bill ({cart.length})</span>
          {cart.length > 0 && (
            <span className="tabular-nums text-[11px] text-[#DCF8C6] ml-1">
              ₹{totals.grandTotal}
            </span>
          )}
        </button>
      </div>

      {/* Main Terminal Viewport */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
        {/* ========================================================================= */}
        {/* LEFT COLUMN: Product Catalog & Barcode Scanner Panel */}
        {/* ========================================================================= */}
        <div
          className={`flex-1 flex flex-col bg-white rounded-lg border border-[#D1D7DB] overflow-hidden shadow-2xs ${
            mobileTab === 'CART' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Barcode & Search Controls Bar */}
          <div className="p-3.5 sm:p-4 border-b border-[#D1D7DB] bg-[#F7F5F2] space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2.5">
              {/* Direct Barcode Scanner Form */}
              <form onSubmit={handleBarcodeSubmit} className="relative flex-1">
                <Barcode className="w-4 h-4 text-[#075E54] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Scan Barcode / Enter SKU (e.g. 8901030382914)..."
                  className="w-full pl-9 pr-16 py-2 text-xs tabular-nums bg-white border border-[#D1D7DB] rounded-md focus:border-[#128C7E] outline-none shadow-2xs"
                  autoFocus
                />
                <button
                  type="submit"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 text-[11px] font-bold bg-[#075E54] hover:bg-[#128C7E] text-white rounded transition-colors cursor-pointer"
                >
                  Scan
                </button>
              </form>

              {/* Keyword Search */}
              <div className="relative w-full sm:w-60">
                <Search className="w-3.5 h-3.5 text-[#8696A0] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Filter by name..."
                  className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-[#D1D7DB] rounded-md focus:border-[#128C7E] outline-none shadow-2xs"
                />
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs no-scrollbar">
              <button
                onClick={() => setSelectedCategory('ALL')}
                className={`px-3 py-1 rounded text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  selectedCategory === 'ALL'
                    ? 'bg-[#075E54] text-white shadow-2xs'
                    : 'bg-white text-[#3B4A54] border border-[#D1D7DB] hover:bg-[#ECE5DD]'
                }`}
              >
                All Items ({products.length})
              </button>
              {INITIAL_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1 rounded text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-[#075E54] text-white shadow-2xs'
                      : 'bg-white text-[#3B4A54] border border-[#D1D7DB] hover:bg-[#ECE5DD]'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid / Cards */}
          <div className="flex-1 p-3.5 sm:p-4 overflow-y-auto">
            {filteredProducts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[#8696A0] p-8 text-center">
                <Package className="w-12 h-12 stroke-[1.5] text-[#D1D7DB] mb-2" />
                <div className="text-sm font-semibold text-[#111B21]">No Products Found</div>
                <div className="text-xs text-[#667781] mt-1 max-w-sm">
                  Try adjusting the category filter or scan a valid barcode using your barcode scanner.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
                {filteredProducts.map((prod, idx) => {
                  const isOutOfStock = prod.currentStock <= 0;
                  const isLowStock = prod.currentStock <= prod.minStockAlert;

                  return (
                    <button
                      key={`${prod.id}-${idx}`}
                      onClick={() => addToCart(prod)}
                      className="group p-3 rounded-lg border border-[#D1D7DB] bg-white hover:border-[#128C7E] hover:shadow-xs transition-all text-left flex flex-col justify-between cursor-pointer relative"
                    >
                      <div>
                        <div className="text-xs font-bold text-[#111B21] line-clamp-2 leading-snug group-hover:text-[#075E54] transition-colors">
                          {prod.name}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-[#667781] mt-1 tabular-nums">
                          <span>{prod.sku}</span>
                          <span>·</span>
                          <span>{prod.hsn} HSN</span>
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-[#E9EDEF] flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold text-[#111B21] tabular-nums">
                            {formatINR(prod.sellingPrice)}
                          </div>
                          <div className="text-[10px] text-[#075E54] tabular-nums font-semibold">
                            GST {prod.gstRate}%
                          </div>
                        </div>

                        <div className="text-right">
                          <span
                            className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded font-bold ${
                              isOutOfStock
                                ? 'bg-[#FEE2E2] text-[#B91C1C]'
                                : isLowStock
                                ? 'bg-[#FEF3C7] text-[#92400E]'
                                : 'bg-[#DCF8C6]/60 text-[#075E54]'
                            }`}
                          >
                            {prod.currentStock} {prod.unit}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: Live Cart & Instant Tax Calculations */}
        {/* ========================================================================= */}
        <div
          className={`w-full md:w-96 bg-white rounded-lg border border-[#D1D7DB] flex flex-col overflow-hidden shadow-2xs ${
            mobileTab === 'PRODUCTS' ? 'hidden md:flex' : 'flex'
          } pb-24 md:pb-0`}
        >
          {/* Cart Header & Customer Selection */}
          <div className="p-3.5 sm:p-4 border-b border-[#D1D7DB] bg-[#F7F5F2] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-[#075E54]" />
                <span className="text-sm font-bold text-[#111B21]">Current Bill</span>
                <span className="text-xs tabular-nums text-[#667781]">({cart.length} items)</span>
              </div>

              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Clear current cart (Esc)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Customer Dropdown + Quick Add Customer Button */}
            <div className="flex gap-2">
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="flex-1 text-xs bg-white border border-[#D1D7DB] rounded px-2.5 py-1.5 text-[#111B21] focus:border-[#128C7E] outline-none"
              >
                <option value="">Walk-in Retail Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
              </select>

              <button
                onClick={() => setIsQuickCustomerOpen(true)}
                className="px-2.5 py-1.5 bg-[#DCF8C6] hover:bg-[#CEF5B4] text-[#075E54] border border-[#B3EBA0] rounded text-xs font-bold transition-colors cursor-pointer"
                title="Quick Add Customer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {selectedCustomer && (
              <div className="p-2 bg-[#DCF8C6]/40 border border-[#B3EBA0] rounded text-[11px] text-[#075E54] flex justify-between">
                <div>
                  <span className="font-bold">{selectedCustomer.name}</span>
                  {selectedCustomer.gstin && (
                    <span className="block text-[#075E54]/80 tabular-nums">
                      GSTIN: {selectedCustomer.gstin}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[#075E54]/70">Credit Limit:</span>
                  <div className="tabular-nums font-bold">{formatINR(selectedCustomer.creditLimit)}</div>
                </div>
              </div>
            )}
          </div>

          {/* Scrollable Cart Line Items */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[#8696A0] p-6 text-center">
                <ShoppingCart className="w-10 h-10 stroke-[1.5] text-[#D1D7DB] mb-2" />
                <div className="text-xs font-semibold text-[#111B21]">Cart is empty</div>
                <div className="text-[11px] text-[#667781] mt-1">
                  Scan barcode or select products on the left to start billing
                </div>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div
                  key={`${item.product.id}-${idx}`}
                  className="p-2.5 rounded-md border border-[#D1D7DB] bg-white hover:border-[#128C7E] transition-colors space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-[#111B21] truncate">
                        {item.product.name}
                      </div>
                      <div className="text-[10px] text-[#667781] tabular-nums">
                        ₹{item.unitPrice} × {item.quantity} · GST {item.product.gstRate}%
                      </div>
                    </div>
                    <div className="text-xs font-bold text-[#111B21] tabular-nums">
                      {formatINR(item.total)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-[#E9EDEF]">
                    {/* Quantity Stepper */}
                    <div className="flex items-center gap-1 border border-[#D1D7DB] rounded px-1 py-0.5">
                      <button
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="p-1 hover:bg-[#F7F5F2] text-[#3B4A54] rounded cursor-pointer"
                        title="Reduce quantity"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center tabular-nums text-xs font-bold text-[#111B21]">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="p-1 hover:bg-[#F7F5F2] text-[#3B4A54] rounded cursor-pointer"
                        title="Increase quantity"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Line Discount Input */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-[#667781]">Disc:</span>
                      <input
                        type="number"
                        value={item.discountPercent || ''}
                        onChange={(e) => updateDiscount(item.product.id, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-10 px-1 py-0.5 text-center text-xs tabular-nums border border-[#D1D7DB] rounded"
                      />
                      <span className="text-[10px] text-[#667781]">%</span>
                    </div>

                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="p-1 text-[#8696A0] hover:text-rose-600 transition-colors cursor-pointer"
                      title="Remove item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Totals & Checkout Summary */}
          <div className="p-4 border-t border-[#D1D7DB] bg-[#F7F5F2] space-y-2">
            <div className="space-y-1 text-xs text-[#3B4A54]">
              <div className="flex justify-between">
                <span>Taxable Value:</span>
                <span className="tabular-nums">{formatINR(totals.taxableTotal)}</span>
              </div>
              {totals.discountTotal > 0 && (
                <div className="flex justify-between text-[#075E54] font-semibold">
                  <span>Discount Total:</span>
                  <span className="tabular-nums">- {formatINR(totals.discountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-[#667781]">
                <span>CGST + SGST (Indian GST):</span>
                <span className="tabular-nums">
                  {formatINR(totals.cgstTotal + totals.sgstTotal)}
                </span>
              </div>
              {totals.roundOff !== 0 && (
                <div className="flex justify-between text-[#8696A0] text-[11px]">
                  <span>Round Off:</span>
                  <span className="tabular-nums">
                    {totals.roundOff > 0 ? `+₹${totals.roundOff}` : `-₹${Math.abs(totals.roundOff)}`}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#D1D7DB] flex items-center justify-between">
              <span className="text-sm font-extrabold text-[#111B21]">Grand Total</span>
              <span className="text-xl font-black text-[#075E54] tabular-nums">
                {formatINR(totals.grandTotal)}
              </span>
            </div>

            <button
              onClick={() => setIsCheckoutModalOpen(true)}
              disabled={cart.length === 0}
              className={`w-full py-2.5 rounded-md text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer ${
                cart.length === 0
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'gradient-primary hover:opacity-95 text-white active:scale-[0.99]'
              }`}
            >
              <span>Proceed to Tender (F4)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Floating Bottom Cart Bar for Mobile View (<768px when items in cart, positioned above fixed bottom nav) */}
      {cart.length > 0 && mobileTab === 'PRODUCTS' && (
        <div className="md:hidden fixed bottom-[calc(76px+env(safe-area-inset-bottom,0px))] left-3 right-3 z-30 animate-in slide-in-from-bottom duration-150">
          <button
            onClick={() => setMobileTab('CART')}
            className="w-full py-3 px-4 rounded-xl gradient-primary text-white font-bold text-xs uppercase tracking-wider shadow-xl flex items-center justify-between cursor-pointer border border-[#064E46]"
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-[#DCF8C6]" />
              <span>View Bill ({cart.length} items)</span>
            </div>
            <div className="flex items-center gap-1 tabular-nums text-sm tabular-nums text-[#DCF8C6]">
              <span>Pay {formatINR(totals.grandTotal)}</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      )}

      {/* Instant Scanner Toast Notification */}
      {scanToast && (
        <div className="fixed top-20 right-4 z-50 bg-[#111B21] text-white px-3.5 py-2 rounded-lg text-xs font-medium shadow-xl flex items-center gap-2 border border-white/10 animate-in fade-in slide-in-from-top-2">
          <Sparkles className="w-3.5 h-3.5 text-[#DCF8C6]" />
          <span>{scanToast}</span>
        </div>
      )}

      {/* QUICK ADD CUSTOMER MODAL */}
      {isQuickCustomerOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl border border-[#D1D7DB] w-full max-w-sm p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#111B21]">Quick Register Customer</h3>
            <form onSubmit={handleSaveQuickCustomer} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#111B21] block mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="e.g. Ramesh Babu"
                  className="w-full px-3 py-1.5 text-xs border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#111B21] block mb-1">Phone Number (+91)</label>
                <input
                  type="text"
                  required
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="+91 98450 12345"
                  className="w-full px-3 py-1.5 text-xs tabular-nums border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#111B21] block mb-1">GSTIN (Optional for B2B)</label>
                <input
                  type="text"
                  value={newCustGstin}
                  onChange={(e) => setNewCustGstin(e.target.value.toUpperCase())}
                  placeholder="29AABCU9603R1ZM"
                  className="w-full px-3 py-1.5 text-xs tabular-nums uppercase border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsQuickCustomerOpen(false)}
                  className="px-3 py-1.5 text-xs text-[#667781] hover:bg-[#F7F5F2] rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold bg-[#075E54] text-white rounded hover:bg-[#128C7E] cursor-pointer"
                >
                  Save &amp; Attach
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHECKOUT MODAL */}
      {isCheckoutModalOpen && (
        <CheckoutModal
          items={cart}
          customer={selectedCustomer || null}
          isOffline={isOffline}
          onClose={() => setIsCheckoutModalOpen(false)}
          onCompleteSale={handleCheckoutComplete}
        />
      )}

      {/* THERMAL RECEIPT MODAL */}
      {lastCommittedSale && (
        <ThermalReceiptModal
          sale={lastCommittedSale}
          onClose={() => setLastCommittedSale(null)}
          onNewSale={() => {
            setLastCommittedSale(null);
            barcodeInputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
};
