/**
 * SLATE POS — Product Catalogue & Stock Inventory Manager
 * HSN codes, GST tax slabs, barcodes, stock alert thresholds, and RBAC cost price masking
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6 / #ECE5DD / #D1D7DB)
 */

import React, { useState, useEffect } from 'react';
import { Product } from '../../types';
import { offlineStore } from '../../lib/offlineStore';
import { INITIAL_CATEGORIES } from '../../lib/initialData';
import { formatINR } from '../../lib/formatters';
import { THEME } from '../../lib/theme';
import {
  Package,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  Barcode,
  Boxes,
  Eye,
  EyeOff,
  History,
  X,
} from 'lucide-react';
import { ModuleActionMenu } from '../common/ModuleActionMenu';

export const ProductCatalog: React.FC = () => {
  const [products, setProducts] = useState<Product[]>(offlineStore.getProducts());
  const activeUser = offlineStore.getActiveUser();
  const isCashier = activeUser.role === 'CASHIER';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);
  const [storeBy, setStoreBy] = useState('DEFAULT');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdjustStockModalOpen, setIsAdjustStockModalOpen] = useState(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Add Product Form
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [hsn, setHsn] = useState('');
  const [categoryId, setCategoryId] = useState(INITIAL_CATEGORIES[0].id);
  const [unit, setUnit] = useState<Product['unit']>('PCS');
  const [costPrice, setCostPrice] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [gstRate, setGstRate] = useState<number>(18);
  const [openingStock, setOpeningStock] = useState<number>(10);
  const [minAlert, setMinAlert] = useState<number>(5);

  // Stock Adjustment Form
  const [adjustmentQty, setAdjustmentQty] = useState<number>(0);
  const [adjustmentReason, setAdjustmentReason] = useState('Stock count audit discrepancy');

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setProducts(offlineStore.getProducts());
    });
    return unsub;
  }, []);

  const handleAddProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !sku || !sellingPrice) return;

    const cat = INITIAL_CATEGORIES.find((c) => c.id === categoryId);

    offlineStore.addProduct({
      name,
      sku,
      barcode: barcode.trim() || `890${Date.now().toString().slice(-10)}`,
      hsn: hsn.trim() || '8471',
      categoryId,
      categoryName: cat ? cat.name : 'General Goods',
      unit,
      costPrice: Number(costPrice) || 0,
      sellingPrice: Number(sellingPrice) || 0,
      gstRate: Number(gstRate) || 18,
      currentStock: Number(openingStock) || 0,
      minStockAlert: Number(minAlert) || 5,
      isActive: true,
    });

    setIsAddModalOpen(false);
    setName('');
    setSku('');
    setBarcode('');
    setHsn('');
    setCostPrice(0);
    setSellingPrice(0);
  };

  const handleAdjustStockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    offlineStore.adjustStock({
      productId: selectedProduct.id,
      newStock: Number(adjustmentQty),
      reason: adjustmentReason,
      type: 'AUDIT_CORRECTION',
    });

    setIsAdjustStockModalOpen(false);
    setSelectedProduct(null);
  };

  const filtered = products
    .filter((p) => {
      if (selectedCategory !== 'ALL' && p.categoryId !== selectedCategory) return false;
      if (filterLowStockOnly && p.currentStock > p.minStockAlert) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.includes(q) ||
          p.hsn.includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (storeBy === 'NAME') return a.name.localeCompare(b.name);
      if (storeBy === 'PRICE_HIGH') return b.sellingPrice - a.sellingPrice;
      if (storeBy === 'STOCK_LOW') return a.currentStock - b.currentStock;
      if (storeBy === 'STOCK_HIGH') return b.currentStock - a.currentStock;
      return 0; // DEFAULT
    });

  const stockMovements = offlineStore.getStockMovements();

  return (
    <div className="space-y-6">
      {/* Header & Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-[#D1D7DB] shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-[#111B21] flex items-center gap-2">
            <span>Product Catalogue</span>
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsMovementModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#075E54] bg-white hover:bg-[#F7F5F2] border border-[#075E54] rounded-md transition-colors cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-[#075E54]" />
            <span>Stock Movement Logs</span>
          </button>

          {!isCashier && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-[#075E54] hover:bg-[#128C7E] rounded-md transition-colors shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New</span>
            </button>
          )}

          <ModuleActionMenu
            moduleKey="PRODUCTS"
            filterQuery={searchTerm}
            currentStoreBy={storeBy}
            onSelectStoreBy={(opt) => setStoreBy(opt)}
            storeByOptions={[
              { id: 'DEFAULT', label: 'Default Order', desc: 'Standard catalogue order' },
              { id: 'NAME', label: 'Product Name (A–Z)', desc: 'Alphabetical sorting by product title' },
              { id: 'PRICE_HIGH', label: 'Highest Selling Price', desc: 'Ranked by highest retail selling price' },
              { id: 'STOCK_LOW', label: 'Lowest Stock Units', desc: 'Prioritize reorders and low stock' },
              { id: 'STOCK_HIGH', label: 'Highest Stock Units', desc: 'Surplus inventory balance' },
            ]}
            onRefresh={() => {
              setProducts(offlineStore.getProducts());
            }}
          />
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-lg border border-[#D1D7DB] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#8696A0] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, SKU, barcode, HSN..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F7F5F2] border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs bg-[#F7F5F2] border border-[#D1D7DB] rounded px-3 py-1.5 text-[#111B21] focus:border-[#128C7E] outline-none"
          >
            <option value="ALL">All Categories</option>
            {INITIAL_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <button
            onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border transition-colors whitespace-nowrap cursor-pointer ${
              filterLowStockOnly
                ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]'
                : 'bg-[#F7F5F2] text-[#3B4A54] border-[#D1D7DB] hover:bg-[#ECE5DD]'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-[#D97706]" />
            <span>Low Stock Alert</span>
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-lg border border-[#D1D7DB] overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F7F5F2] text-[#3B4A54] border-b border-[#D1D7DB]">
              <tr>
                <th className="py-3 px-4 font-bold">Product Name &amp; SKU</th>
                <th className="py-3 px-4 font-bold hidden lg:table-cell">Barcode</th>
                <th className="py-3 px-4 font-bold hidden lg:table-cell">HSN Code</th>
                <th className="py-3 px-4 font-bold">Category</th>
                {!isCashier && (
                  <th className="py-3 px-4 font-bold text-right">Cost (Wholesale)</th>
                )}
                <th className="py-3 px-4 font-bold text-right">Selling Price</th>
                <th className="py-3 px-4 font-bold text-center">GST Slab</th>
                <th className="py-3 px-4 font-bold text-right">Stock in Hand</th>
                <th className="py-3 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9EDEF]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isCashier ? 8 : 9} className="py-12 px-4 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="w-12 h-12 rounded-full bg-[#F7F5F2] border border-[#D1D7DB] flex items-center justify-center text-[#8696A0] mb-3">
                        <Package className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-bold text-[#111B21]">No products found</h4>
                      <p className="text-xs text-[#667781] mt-1">
                        {products.length === 0
                          ? 'No products have been added to the database yet. Click "+ Add Product" to create your first catalogue item.'
                          : 'No products match the selected search or filter criteria.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map((prod, idx) => {
                const isLow = prod.currentStock <= prod.minStockAlert;
                return (
                  <tr key={`${prod.id}-${idx}`} className="hover:bg-[#F7F5F2] transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-[#111B21]">{prod.name}</div>
                      <div className="text-[11px] text-[#667781] tabular-nums">{prod.sku}</div>
                    </td>
                    <td className="py-3 px-4 tabular-nums text-[#3B4A54] text-[11px] hidden lg:table-cell">
                      {prod.barcode}
                    </td>
                    <td className="py-3 px-4 tabular-nums text-[#3B4A54] text-[11px] hidden lg:table-cell">
                      {prod.hsn}
                    </td>
                    <td className="py-3 px-4 text-[#3B4A54]">
                      {prod.categoryName}
                    </td>
                    {!isCashier && (
                      <td className="py-3 px-4 text-right tabular-nums text-[#667781]">
                        {formatINR(prod.costPrice)}
                      </td>
                    )}
                    <td className="py-3 px-4 text-right tabular-nums font-bold text-[#075E54]">
                      {formatINR(prod.sellingPrice)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="tabular-nums text-[11px] bg-[#DCF8C6]/50 text-[#075E54] px-2 py-0.5 rounded font-bold border border-[#B3EBA0]">
                        {prod.gstRate}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="tabular-nums font-bold">
                        <span className={isLow ? 'text-amber-800' : 'text-[#111B21]'}>
                          {prod.currentStock} {prod.unit}
                        </span>
                      </div>
                      {isLow && (
                        <span className="text-[10px] text-amber-700 font-semibold flex items-center justify-end gap-1">
                          <AlertTriangle className="w-3 h-3 text-amber-600" /> Reorder (&lt;{prod.minStockAlert})
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedProduct(prod);
                          setAdjustmentQty(prod.currentStock);
                          setIsAdjustStockModalOpen(true);
                        }}
                        className="px-2.5 py-1 text-[11px] font-semibold text-[#075E54] hover:bg-[#DCF8C6]/50 rounded border border-[#075E54] transition-colors cursor-pointer"
                      >
                        Adjust Stock
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD PRODUCT MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl border border-[#D1D7DB] w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-[#D1D7DB]">
              <h3 className="text-sm font-bold text-[#111B21]">Add New Retail Product</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-[#667781] hover:text-[#111B21] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddProductSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Product Title</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Britannia Good Day Cashew 200g"
                  className="w-full px-3 py-1.5 border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">SKU</label>
                  <input
                    type="text"
                    required
                    value={sku}
                    onChange={(e) => setSku(e.target.value.toUpperCase())}
                    placeholder="e.g. BIS-GD-200"
                    className="w-full px-3 py-1.5 tabular-nums uppercase border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">Barcode (EAN-13)</label>
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="8901063012901"
                    className="w-full px-3 py-1.5 tabular-nums border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">HSN Code</label>
                  <input
                    type="text"
                    required
                    value={hsn}
                    onChange={(e) => setHsn(e.target.value)}
                    placeholder="1905"
                    className="w-full px-3 py-1.5 tabular-nums border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">GST Tax Slab</label>
                  <select
                    value={gstRate}
                    onChange={(e) => setGstRate(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-white border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                  >
                    <option value={0}>0% (Exempt)</option>
                    <option value={5}>5% (Essential)</option>
                    <option value={12}>12% (Standard)</option>
                    <option value={18}>18% (General)</option>
                    <option value={28}>28% (Luxury)</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">Unit</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-white border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                  >
                    <option value="PCS">Pieces (PCS)</option>
                    <option value="PACK">Packs (PACK)</option>
                    <option value="KG">Kilograms (KG)</option>
                    <option value="LTR">Liters (LTR)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">Cost Price (Wholesale)</label>
                  <input
                    type="number"
                    value={costPrice || ''}
                    onChange={(e) => setCostPrice(parseFloat(e.target.value) || 0)}
                    placeholder="₹0"
                    className="w-full px-3 py-1.5 tabular-nums border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">Selling Price (MRP/Retail)</label>
                  <input
                    type="number"
                    required
                    value={sellingPrice || ''}
                    onChange={(e) => setSellingPrice(parseFloat(e.target.value) || 0)}
                    placeholder="₹0"
                    className="w-full px-3 py-1.5 tabular-nums border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">Opening Stock</label>
                  <input
                    type="number"
                    value={openingStock}
                    onChange={(e) => setOpeningStock(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 tabular-nums border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#111B21] block mb-1">Min Stock Reorder Alert</label>
                  <input
                    type="number"
                    value={minAlert}
                    onChange={(e) => setMinAlert(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 tabular-nums border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#D1D7DB]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-[#667781] hover:bg-[#F7F5F2] rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-bold bg-[#075E54] text-white rounded hover:bg-[#128C7E] cursor-pointer"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUST STOCK MODAL */}
      {isAdjustStockModalOpen && selectedProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl border border-[#D1D7DB] w-full max-w-sm p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#111B21]">
              Adjust Stock: {selectedProduct.name}
            </h3>
            <div className="text-xs text-[#667781]">
              Current recorded balance: <span className="font-bold text-[#111B21]">{selectedProduct.currentStock} {selectedProduct.unit}</span>
            </div>

            <form onSubmit={handleAdjustStockSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[#111B21] block mb-1">New Verified Physical Count</label>
                <input
                  type="number"
                  required
                  value={adjustmentQty}
                  onChange={(e) => setAdjustmentQty(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 tabular-nums text-base font-bold border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#111B21] block mb-1">Reason for Adjustment</label>
                <select
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-[#D1D7DB] rounded focus:border-[#128C7E] outline-none"
                >
                  <option value="Physical stock count audit reconciliation">Physical stock count audit</option>
                  <option value="Received supplier batch delivery">Received supplier batch</option>
                  <option value="Damaged or expired goods written off">Damaged / Expired stock</option>
                  <option value="Internal counter sample / usage">Store counter sample</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#D1D7DB]">
                <button
                  type="button"
                  onClick={() => setIsAdjustStockModalOpen(false)}
                  className="px-3 py-1.5 text-[#667781] hover:bg-[#F7F5F2] rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-bold bg-[#075E54] text-white rounded hover:bg-[#128C7E] cursor-pointer"
                >
                  Commit Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STOCK MOVEMENT LOGS MODAL */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl border border-[#D1D7DB] w-full max-w-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-[#D1D7DB]">
              <h3 className="text-sm font-bold text-[#111B21] flex items-center gap-2">
                <History className="w-4 h-4 text-[#075E54]" />
                <span>Auditable Stock Movement Logs</span>
              </h3>
              <button onClick={() => setIsMovementModalOpen(false)} className="text-[#667781] hover:text-[#111B21] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F7F5F2] text-[#3B4A54] border-b border-[#D1D7DB]">
                  <tr>
                    <th className="py-2.5 px-3 font-bold">Timestamp</th>
                    <th className="py-2.5 px-3 font-bold">Product</th>
                    <th className="py-2.5 px-3 font-bold">Type</th>
                    <th className="py-2.5 px-3 font-bold text-right">Change</th>
                    <th className="py-2.5 px-3 font-bold text-right">New Balance</th>
                    <th className="py-2.5 px-3 font-bold">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9EDEF]">
                  {stockMovements.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-[#8696A0]">
                        No movement records yet.
                      </td>
                    </tr>
                  ) : (
                    stockMovements.map((mov) => (
                      <tr key={mov.id} className="hover:bg-[#F7F5F2]">
                        <td className="py-2.5 px-3 tabular-nums text-[#667781] text-[11px]">
                          {mov.timestamp.split('T')[1].slice(0, 5)}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-[#111B21]">
                          {mov.productName}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`tabular-nums text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              mov.type === 'SALE'
                                ? 'bg-[#FEE2E2] text-[#B91C1C]'
                                : mov.type === 'RETURN'
                                ? 'bg-[#DCF8C6] text-[#075E54]'
                                : 'bg-[#E0F2FE] text-[#0369A1]'
                            }`}
                          >
                            {mov.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold">
                          <span className={mov.quantityChange < 0 ? 'text-[#B91C1C]' : 'text-[#075E54]'}>
                            {mov.quantityChange > 0 ? `+${mov.quantityChange}` : mov.quantityChange}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-[#111B21] font-semibold">
                          {mov.newBalance}
                        </td>
                        <td className="py-2.5 px-3 text-[#667781] text-[11px]">
                          {mov.referenceId}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
