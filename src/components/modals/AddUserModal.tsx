/**
 * SLATE POS — Add User Modal
 * Allows registering a new staff member with Role-Based Access Control
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6)
 */

import React, { useState } from 'react';
import { X, UserPlus, Shield, Building, Phone, Mail, CheckCircle2 } from 'lucide-react';
import { offlineStore } from '../../lib/offlineStore';
import { INITIAL_ORGANIZATION, INITIAL_BRANCHES } from '../../lib/initialData';
import { UserRole, Permission, UserProfile } from '../../types';
import { isSupabaseConfigured, provisionStaffUser } from '../../lib/supabaseClient';

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserAdded?: (user: UserProfile) => void;
}

export const AddUserModal: React.FC<AddUserModalProps> = ({ isOpen, onClose, onUserAdded }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('CASHIER');
  const [branchId, setBranchId] = useState(INITIAL_BRANCHES[0].id);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please enter the staff member’s full name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please provide a valid company email address.');
      return;
    }
    if (!phone.trim()) {
      setError('Please enter a contact phone number.');
      return;
    }

    const defaultPermissions: Record<UserRole, Permission[]> = {
      SUPER_ADMIN: [
        'POS_USE', 'PRODUCT_VIEW', 'PRODUCT_CREATE', 'PRODUCT_EDIT', 'PRODUCT_COST_VIEW',
        'INVENTORY_ADJUST', 'CUSTOMER_VIEW', 'CUSTOMER_EDIT', 'SALES_VIEW', 'INVOICE_CREATE',
        'REFUND_CREATE', 'REFUND_APPROVE', 'REPORT_VIEW', 'REPORT_EXPORT', 'BUSINESS_SETTINGS',
        'STAFF_MANAGE', 'BRANCH_MANAGE', 'SUBSCRIPTION_MANAGE', 'PLATFORM_MANAGE',
      ],
      ORG_ADMIN: [
        'POS_USE', 'PRODUCT_VIEW', 'PRODUCT_CREATE', 'PRODUCT_EDIT', 'PRODUCT_COST_VIEW',
        'INVENTORY_ADJUST', 'CUSTOMER_VIEW', 'CUSTOMER_EDIT', 'SALES_VIEW', 'INVOICE_CREATE',
        'REFUND_CREATE', 'REFUND_APPROVE', 'REPORT_VIEW', 'REPORT_EXPORT', 'BUSINESS_SETTINGS',
        'STAFF_MANAGE', 'BRANCH_MANAGE', 'SUBSCRIPTION_MANAGE',
      ],
      MANAGER: [
        'POS_USE', 'PRODUCT_VIEW', 'PRODUCT_CREATE', 'PRODUCT_EDIT', 'PRODUCT_COST_VIEW',
        'INVENTORY_ADJUST', 'CUSTOMER_VIEW', 'CUSTOMER_EDIT', 'SALES_VIEW', 'INVOICE_CREATE',
        'REFUND_CREATE', 'REFUND_APPROVE', 'REPORT_VIEW', 'REPORT_EXPORT',
      ],
      CASHIER: [
        'POS_USE', 'PRODUCT_VIEW', 'CUSTOMER_VIEW', 'CUSTOMER_EDIT', 'SALES_VIEW', 'INVOICE_CREATE', 'REFUND_CREATE',
      ],
      STORE_OFFICER: [
        'PRODUCT_VIEW', 'PRODUCT_CREATE', 'PRODUCT_EDIT', 'INVENTORY_ADJUST', 'SUPPLIER_VIEW', 'SUPPLIER_EDIT', 'QUOTES_VIEW', 'INVOICE_VIEW', 'DELIVERY_MANAGE',
      ],
      PURCHASE_OFFICER: [
        'PRODUCT_VIEW', 'PRODUCT_CREATE', 'PRODUCT_EDIT', 'INVENTORY_ADJUST', 'SUPPLIER_VIEW', 'SUPPLIER_EDIT', 'QUOTES_VIEW', 'INVOICE_VIEW', 'DELIVERY_MANAGE',
      ],
    };

    setIsSubmitting(true);
    try {
      if (isSupabaseConfigured()) {
        const provRes = await provisionStaffUser({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          role,
          branchId,
        });

        if (!provRes.success) {
          setError(provRes.error || 'Failed to provision staff account in Supabase.');
          setIsSubmitting(false);
          return;
        }
      }

      const activeOrg = offlineStore.getOrganization();
      const newUser: UserProfile = {
        id: `usr_${Date.now()}`,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        role,
        organizationId: activeOrg?.id || INITIAL_ORGANIZATION.id,
        branchId,
        permissions: defaultPermissions[role],
      };

      offlineStore.addUser(newUser);
      onUserAdded?.(newUser);
      onClose();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred while adding staff user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-md p-5 space-y-4 font-sans">
        <div className="flex items-center justify-between pb-3 border-b border-[#D1D7DB]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#DCF8C6] flex items-center justify-center text-[#075E54]">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#111B21]">Add New Staff User</h3>
              <p className="text-[11px] text-[#667781]">Assign role privileges and counter terminal access</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#667781] hover:text-[#111B21] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-[#111B21] mb-1">Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh Chandra"
              className="w-full p-2 border border-[#D1D7DB] rounded-lg bg-[#F7F5F2] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#075E54]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#111B21] mb-1">Company Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ramesh@apexretail.in"
                className="w-full p-2 border border-[#D1D7DB] rounded-lg bg-[#F7F5F2] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#075E54]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#111B21] mb-1">Mobile Phone</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98450 77007"
                className="w-full p-2 border border-[#D1D7DB] rounded-lg bg-[#F7F5F2] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#075E54]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#111B21] mb-1">Assigned Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full p-2 border border-[#D1D7DB] rounded-lg bg-[#F7F5F2] font-semibold text-[#111B21]"
              >
                <option value="CASHIER">Cashier (POS &amp; Orders)</option>
                <option value="MANAGER">Manager (Audit &amp; Stock)</option>
                <option value="ORG_ADMIN">Organization Admin</option>
                <option value="SUPER_ADMIN">Super Admin (All Access)</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[#111B21] mb-1">Primary Outlet</label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full p-2 border border-[#D1D7DB] rounded-lg bg-[#F7F5F2] font-semibold text-[#111B21]"
              >
                {INITIAL_BRANCHES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.city})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-2.5 bg-[#F7F5F2] rounded-lg border border-[#D1D7DB] text-[11px] text-[#667781] leading-relaxed">
            New staff members can immediately log in with default PIN <code className="bg-white px-1 py-0.5 rounded border border-[#D1D7DB] text-[#075E54] font-bold">1234</code>.
          </div>

          <div className="pt-2 border-t border-[#D1D7DB] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 border border-[#D1D7DB] rounded-lg text-xs font-semibold text-[#3B4A54] hover:bg-[#F7F5F2] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-gradient-to-br from-[#075E54] to-[#128C7E] text-white rounded-lg text-xs font-bold shadow-xs hover:opacity-95 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Provisioning...' : 'Add Staff Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
