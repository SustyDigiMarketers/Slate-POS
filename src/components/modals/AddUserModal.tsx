/**
 * SLATE POS — Add User Modal
 * Allows registering a new staff member with Role-Based Access Control
 * Styled with SLATE POS Theme (#16587B / #84B3CE / #F5EEDD)
 */

import React, { useState, useEffect } from 'react';
import { X, UserPlus, ShieldAlert } from 'lucide-react';
import { offlineStore } from '../../lib/offlineStore';
import { UserRole, UserProfile } from '../../types';
import { isSupabaseConfigured, provisionStaffUser } from '../../lib/supabaseClient';
import { generateUserCode } from '../../lib/idGenerator';
import { canManageUsers, toLegacyPermissions } from '../../lib/permissions';

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserAdded?: (user: UserProfile) => void;
}

export const AddUserModal: React.FC<AddUserModalProps> = ({ isOpen, onClose, onUserAdded }) => {
  const activeUser = offlineStore.getActiveUser();
  const activeOrg = offlineStore.getOrganization();
  const orgBranches = offlineStore.getBranches();
  const authorized = canManageUsers(activeUser);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('CASHIER');
  const [branchId, setBranchId] = useState(orgBranches[0]?.id || activeUser.branchId || '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && !branchId && orgBranches.length > 0) {
      setBranchId(orgBranches[0].id);
    }
  }, [isOpen, branchId, orgBranches]);

  if (!isOpen) return null;

  if (!authorized) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-md p-6 text-center space-y-4 font-sans">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-[#111B21]">Access Denied</h3>
          <p className="text-xs text-[#667781] leading-relaxed">
            Only Organization Administrators and Super Administrators are permitted to add or provision staff users.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#16587B] text-white rounded-lg text-xs font-bold hover:bg-[#124866] cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

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
    if (role === 'SUPER_ADMIN' && activeUser.role !== 'SUPER_ADMIN') {
      setError('Only a Super Admin can assign the Super Admin role.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSupabaseConfigured()) {
        const provRes = await provisionStaffUser({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          role,
          branchId: branchId || activeOrg.id,
        });

        if (!provRes.success) {
          setError(provRes.error || 'Failed to provision staff account in Supabase.');
          setIsSubmitting(false);
          return;
        }
      }

      const existingUsers = offlineStore.getUsers();
      const existingCodes = new Set(existingUsers.map(u => u.userCode).filter(Boolean) as string[]);
      const newUserCode = generateUserCode(existingCodes);

      const newUser: UserProfile = {
        id: `usr_${Date.now()}`,
        userCode: newUserCode,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        role,
        organizationId: activeOrg?.id || activeUser.organizationId || '',
        branchId: branchId || activeUser.branchId || '',
        permissions: toLegacyPermissions(role),
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
    <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-md p-5 space-y-4 font-sans">
        <div className="flex items-center justify-between pb-3 border-b border-[#D1D7DB]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#84B3CE]/25 flex items-center justify-center text-[#16587B]">
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
              className="w-full p-2 border border-[#D1D7DB] rounded-lg bg-[#FAF6EC] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#16587B]"
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
                className="w-full p-2 border border-[#D1D7DB] rounded-lg bg-[#FAF6EC] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#16587B]"
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
                className="w-full p-2 border border-[#D1D7DB] rounded-lg bg-[#FAF6EC] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#16587B]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#111B21] mb-1">Assigned Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full p-2 border border-[#D1D7DB] rounded-lg bg-[#FAF6EC] font-semibold text-[#111B21]"
              >
                <option value="CASHIER">Cashier (POS &amp; Billing)</option>
                <option value="STORE_OFFICER">Store Officer (Stock &amp; Procurement)</option>
                <option value="MANAGER">Manager (Full Ops &amp; Accounts)</option>
                <option value="ORG_ADMIN">Organization Admin</option>
                {activeUser.role === 'SUPER_ADMIN' && (
                  <option value="SUPER_ADMIN">Super Admin (Platform Access)</option>
                )}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[#111B21] mb-1">Primary Branch</label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full p-2 border border-[#D1D7DB] rounded-lg bg-[#FAF6EC] font-semibold text-[#111B21]"
              >
                {orgBranches.length > 0 ? (
                  orgBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}{b.city ? ` (${b.city})` : ''}
                    </option>
                  ))
                ) : (
                  <option value="">Main Branch</option>
                )}
              </select>
            </div>
          </div>

          <div className="p-2.5 bg-[#FAF6EC] rounded-lg border border-[#D1D7DB] text-[11px] text-[#667781] leading-relaxed">
            Staff accounts are scoped strictly to <strong className="text-[#111B21]">{activeOrg.name || 'your organization'}</strong> and receive secure password setup or credential provisioning without shared default PINs.
          </div>

          <div className="pt-2 border-t border-[#D1D7DB] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 border border-[#D1D7DB] rounded-lg text-xs font-semibold text-[#3B4A54] hover:bg-[#FAF6EC] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-[#16587B] hover:bg-[#124866] text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Provisioning...' : 'Add Staff Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
