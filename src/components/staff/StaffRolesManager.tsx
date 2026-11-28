/**
 * SLATE POS — Staff Accounts & Role-Based Access Control (RBAC)
 * Super Admin, Organization Admin, Manager, and Cashier permission boundaries
 * Styled with SLATE POS Theme (#16587B / #84B3CE / #F5EEDD)
 */

import React, { useState, useEffect } from 'react';
import { Check, X, Plus } from 'lucide-react';
import { Permission } from '../../types';
import { offlineStore } from '../../lib/offlineStore';
import { canManageUsers, toLegacyPermissions } from '../../lib/permissions';
import { AddUserModal } from '../modals/AddUserModal';

export const StaffRolesManager: React.FC = () => {
  const [activeUser, setActiveUser] = useState(offlineStore.getActiveUser());
  const [staffUsers, setStaffUsers] = useState(offlineStore.getUsers());
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);

  const canInviteStaff = canManageUsers(activeUser);

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setActiveUser(offlineStore.getActiveUser());
      setStaffUsers(offlineStore.getUsers());
    });
    return unsub;
  }, []);

  const permissionList: { key: Permission; label: string; desc: string }[] = [
    { key: 'POS_USE', label: 'Use POS Terminal', desc: 'Scan items, apply discounts, and complete checkouts' },
    { key: 'PRODUCT_VIEW', label: 'View Product Catalogue', desc: 'Browse products, prices, and stock counts' },
    { key: 'PRODUCT_COST_VIEW', label: 'View Wholesale Cost Price', desc: 'Inspect supplier cost price and profit margins' },
    { key: 'INVENTORY_ADJUST', label: 'Adjust Inventory', desc: 'Perform physical stock audits and balance overrides' },
    { key: 'CUSTOMER_VIEW', label: 'View Customer Accounts', desc: 'Access customer phones, addresses, and credit balances' },
    { key: 'SALES_VIEW', label: 'View Sales History', desc: 'Access previous sales, invoices, and payment receipts' },
    { key: 'REFUND_CREATE', label: 'Issue Refunds & Returns', desc: 'Record returned items and generate credit notes' },
    { key: 'REPORT_VIEW', label: 'Access Financial Reports', desc: 'View revenue, receivable aging, and GST tax metrics' },
    { key: 'STAFF_MANAGE', label: 'Manage Staff & Roles', desc: 'Invite staff members and assign permission sets' },
    { key: 'BUSINESS_SETTINGS', label: 'Organization & Hardware', desc: 'Configure GSTIN, printer formats, and branches' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white p-5 rounded-lg border border-[#D1D7DB] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#111B21] flex items-center gap-2">
            <span>Staff Accounts &amp; Privilege Boundaries (RBAC)</span>
            <span className="text-xs tabular-nums text-[#16587B] bg-[#84B3CE]/25 px-2 py-0.5 rounded font-bold border border-[#84B3CE]/60">
              {staffUsers.length} Staff Members
            </span>
          </h1>
          <p className="text-xs text-[#667781] mt-0.5">
            Role-Based Access Control enforced across Supabase RLS, backend APIs, and desktop interface.
          </p>
        </div>

        {canInviteStaff && (
          <button
            onClick={() => setIsAddUserOpen(true)}
            className="px-3.5 py-2 bg-[#16587B] hover:bg-[#124866] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Staff Member</span>
          </button>
        )}
      </div>

      {/* Staff Accounts Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {staffUsers.map((user) => {
          const isSelected = user.id === activeUser.id;
          return (
            <div
              key={user.id}
              className={`bg-white p-4 rounded-lg border transition-all shadow-2xs ${
                isSelected
                  ? 'border-[#16587B] ring-2 ring-[#16587B]/30'
                  : 'border-[#D1D7DB]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-sm text-[#111B21]">{user.name}</span>
                    {user.userCode && (
                      <span className="font-mono text-[10px] bg-[#FAF6EC] border border-[#D1D7DB] px-1.5 py-0.2 rounded text-[#16587B] font-bold tabular-nums">
                        ID: {user.userCode}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#667781]">{user.email}</div>
                  <div className="text-[11px] text-[#8696A0] tabular-nums mt-0.5">{user.phone}</div>
                </div>

                <span
                  className={`text-[10px] tabular-nums px-2 py-0.5 rounded font-bold ${
                    user.role === 'SUPER_ADMIN'
                      ? 'bg-purple-100 text-purple-800'
                      : user.role === 'ORG_ADMIN'
                      ? 'bg-blue-100 text-blue-800'
                      : user.role === 'MANAGER'
                      ? 'bg-[#84B3CE]/25 text-[#16587B]'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {user.role}
                </span>
              </div>

              <div className="mt-4 pt-3 border-t border-[#E9EDEF] flex items-center justify-between">
                <span className="text-[11px] text-[#667781]">
                  {toLegacyPermissions(user.role).length} Grants
                </span>
                <span
                  className={`text-[11px] px-2.5 py-0.5 rounded font-bold ${
                    isSelected
                      ? 'bg-[#16587B] text-white'
                      : 'bg-[#FAF6EC] text-[#667781] border border-[#D1D7DB]'
                  }`}
                >
                  {isSelected ? 'Active Session' : 'Provisioned'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* RBAC Permission Matrix Table */}
      <div className="bg-white rounded-lg border border-[#D1D7DB] overflow-hidden shadow-2xs">
        <div className="px-5 py-3.5 border-b border-[#D1D7DB] bg-[#FAF6EC]">
          <h2 className="text-xs font-bold text-[#111B21] uppercase tracking-wider">
            Permission Enforcement Matrix
          </h2>
          <p className="text-[11px] text-[#667781] mt-0.5">
            Cashiers are strictly prohibited from viewing supplier costs, gross margins, or organization settings.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF6EC] text-[#3B4A54] border-b border-[#D1D7DB]">
              <tr>
                <th className="py-2.5 px-4 font-bold">Permission &amp; Capability</th>
                <th className="py-2.5 px-4 font-bold text-center">Cashier</th>
                <th className="py-2.5 px-4 font-bold text-center">Store Officer</th>
                <th className="py-2.5 px-4 font-bold text-center">Manager</th>
                <th className="py-2.5 px-4 font-bold text-center">Org Admin</th>
                <th className="py-2.5 px-4 font-bold text-center">Super Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9EDEF]">
              {permissionList.map((p) => {
                const cashierHas = toLegacyPermissions('CASHIER').includes(p.key);
                const storeHas = toLegacyPermissions('STORE_OFFICER').includes(p.key);
                const managerHas = toLegacyPermissions('MANAGER').includes(p.key);
                const adminHas = toLegacyPermissions('ORG_ADMIN').includes(p.key);
                const superHas = toLegacyPermissions('SUPER_ADMIN').includes(p.key);

                return (
                  <tr key={p.key} className="hover:bg-[#FAF6EC]">
                    <td className="py-2.5 px-4">
                      <div className="font-bold text-[#111B21]">{p.label}</div>
                      <div className="text-[11px] text-[#667781]">{p.desc}</div>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {cashierHas ? (
                        <Check className="w-4 h-4 text-[#16587B] mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-rose-400 mx-auto" />
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {storeHas ? (
                        <Check className="w-4 h-4 text-[#16587B] mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-rose-400 mx-auto" />
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {managerHas ? (
                        <Check className="w-4 h-4 text-[#16587B] mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-rose-400 mx-auto" />
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {adminHas ? (
                        <Check className="w-4 h-4 text-[#16587B] mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-rose-400 mx-auto" />
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {superHas ? (
                        <Check className="w-4 h-4 text-[#16587B] mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-rose-400 mx-auto" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {canInviteStaff && (
        <AddUserModal
          isOpen={isAddUserOpen}
          onClose={() => setIsAddUserOpen(false)}
        />
      )}
    </div>
  );
};
