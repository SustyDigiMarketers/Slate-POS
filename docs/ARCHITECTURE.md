# SLATE POS — Architectural Specification & Operational Guide

## 1. Executive Summary & Design Invariants

SLATE POS is an offline-first Windows desktop POS and cloud SaaS business management application engineered for Indian retailers and multi-branch expanding businesses.

### Core Architectural Principle
**Decouple local checkout execution from cloud synchronization.**
- When internet connectivity fails, counter cashiers must complete permitted sales without interruptions.
- Local stock is decremented immediately, tamper-evident unique invoice numbers are assigned, thermal receipts (58mm/80mm) are printed, and transactions are stored durably in the local SQLite transactional outbox.
- When internet returns, the background sync engine pushes outbox events idempotently to the trusted Supabase PostgreSQL cloud API without duplicating sales or corrupting central inventory.

---

## 2. System Architecture

```
[ Windows Desktop POS Terminal ]
  ├── React 19 + TypeScript + Tailwind CSS UI (Sandboxed Renderer)
  ├── Local SQLite / IndexedDB Storage Engine
  │     ├── local_products & pricing snapshot
  │     ├── local_customers & credit limits
  │     ├── local_sales & payments
  │     ├── local_inventory_movements
  │     └── sync_outbox (FIFO transactional queue)
  └── Hardware Layer (Thermal Printer 58mm/80mm, USB Barcode Scanner, Cash Drawer)
           │
           │ (HTTPS REST API / WebSocket - Idempotent Batch Push)
           ▼
[ Trusted Backend Cloud API (Express 4.21 / Node.js) ]
  ├── Middleware: Tenant isolation & RBAC permission verification
  ├── Endpoints: /api/v1/sync/push, /api/v1/sync/pull, /api/v1/webhooks/payment
  └── Ledger: Idempotency keys set & audit logs
           │
           │ (Direct Connection / Session Pooler)
           ▼
[ Central Supabase PostgreSQL Database ]
  ├── organizations & branches (Multi-tenant)
  ├── user_profiles & organization_memberships (RBAC)
  ├── sales, sale_items, invoices, payments, refunds
  ├── inventory_balances & inventory_movements
  └── Row Level Security (RLS) enforcement
```

---

## 3. Indian Market Compliance & Payment Handling

1. **GST Calculation Engine**:
   - Intra-state retail: CGST (50% of tax rate) + SGST (50% of tax rate).
   - Inter-state wholesale: IGST (100% of tax rate).
   - Slabs supported: 0%, 5%, 12%, 18%, 28%.
   - HSN codes recorded on all invoice lines.
2. **Indian Payment Tenders**:
   - **Cash**: Denomination buttons (₹2,000, ₹500, ₹200, ₹100), change-to-return automatic calculation.
   - **UPI**: Dynamic Bharat QR generation (`upi://pay?pa=...&am=...`).
   - *Offline UPI Restriction*: While offline, UPI payments are flagged as `OFFLINE_RECORDED` / `PENDING_VERIFICATION`. The application never invents bank gateway confirmation.
   - **Card**: POS EDC terminal transaction trace code.
   - **Split Tender**: Combination of Cash and UPI / Card.
   - **Store Credit**: Bill to customer account up to authorized credit limit.

---

## 4. Role-Based Access Control (RBAC)

| Role | POS Checkout | View Stock | View Wholesale Cost | Adjust Inventory | Issue Refund | View Reports | Manage Staff |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Super Admin** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Org Admin** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Store Manager** | Yes | Yes | Yes | Yes | Yes | Yes | No |
| **Cashier** | Yes | Yes | **No (Masked)** | No | Yes | **No (Hidden)**| **No** |

---

## 5. Idempotent Synchronization & Conflict Resolution

Every outbox item carries:
- `eventId`: Unique UUID.
- `idempotencyKey`: Composite unique token (e.g. `pos_checkout_${saleId}`).
- `status`: `PENDING` -> `SYNCING` -> `SYNCED` | `CONFLICT`.
- `retryCount`: Bounded exponential backoff counter.

If network drops mid-request, retrying with the same idempotency key ensures the server acknowledges receipt without inserting a duplicate sale or deducting stock twice.
