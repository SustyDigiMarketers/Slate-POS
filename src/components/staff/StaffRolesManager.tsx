/**
 * SLATE POS — Staff Accounts & Role-Based Access Control (RBAC)
 * Super Admin, Organization Admin, Manager, and Cashier permission boundaries
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6 / #ECE5DD / #D1D7DB)
 */

import React, { useState, useEffect } from 'react';
import { Check, X, Shield, User, Lock, Edit2, Plus } from 'lucide-react';
import { UserProfile, Permission } from '../../types';
import { offlineStore } from '../../lib/offlineStore';
export const StaffRolesManager: React.FC = () => {
  const [activeUser, setActiveUser] = useState(offlineStore.getActiveUser());
  const [staffUsers, setStaffUsers] = useState(offlineStore.getUsers());

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
      <div className="bg-white p-5 rounded-lg border border-[#D1D7DB] shadow-2xs">
        <h1 className="text-xl font-bold text-[#111B21] flex items-center gap-2">
          <span>Staff Accounts &amp; Privilege Boundaries (RBAC)</span>
          <span className="text-xs tabular-nums text-[#075E54] bg-[#DCF8C6] px-2 py-0.5 rounded font-bold border border-[#B3EBA0]">
            {staffUsers.length} Staff Members
          </span>
        </h1>
        <p className="text-xs text-[#667781] mt-0.5">
          Role-Based Access Control enforced on both backend endpoints and desktop interface.
        </p>
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
                  ? 'border-[#075E54] ring-2 ring-[#075E54]/30'
                  : 'border-[#D1D7DB]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-sm text-[#111B21]">{user.name}</div>
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
                      ? 'bg-[#DCF8C6] text-[#075E54]'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {user.role}
                </span>
              </div>

              <div className="mt-4 pt-3 border-t border-[#E9EDEF] flex items-center justify-between">
                <span className="text-[11px] text-[#667781]">
                  {user.permissions.length} Grants
                </span>
                <button
                  onClick={() => offlineStore.setActiveUser(user.id)}
                  className={`text-xs px-2.5 py-1 rounded font-bold transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#075E54] text-white'
                      : 'bg-[#F7F5F2] hover:bg-[#ECE5DD] text-[#111B21] border border-[#D1D7DB]'
                  }`}
                >
                  {isSelected ? 'Active Profile' : 'Switch To Role'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* RBAC Permission Matrix Table */}
      <div className="bg-white rounded-lg border border-[#D1D7DB] overflow-hidden shadow-2xs">
        <div className="px-5 py-3.5 border-b border-[#D1D7DB] bg-[#F7F5F2]">
          <h2 className="text-xs font-bold text-[#111B21] uppercase tracking-wider">
            Permission Enforcement Matrix
          </h2>
          <p className="text-[11px] text-[#667781] mt-0.5">
            Cashiers are strictly prohibited from viewing supplier costs, gross margins, or organization settings.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F7F5F2] text-[#3B4A54] border-b border-[#D1D7DB]">
              <tr>
                <th className="py-2.5 px-4 font-bold">Permission &amp; Capability</th>
                <th className="py-2.5 px-4 font-bold text-center">Cashier</th>
                <th className="py-2.5 px-4 font-bold text-center">Store Manager</th>
                <th className="py-2.5 px-4 font-bold text-center">Org Admin</th>
                <th className="py-2.5 px-4 font-bold text-center">Super Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9EDEF]">
              {permissionList.map((p) => {
                // Helpers to find role profiles
                const getRolePermissions = (role: string) => {
                  const user = staffUsers.find(u => u.role === role);
                  return user?.permissions || [];
                }
                const cashierHas = getRolePermissions('CASHIER').includes(p.key);
                const managerHas = getRolePermissions('MANAGER').includes(p.key);
                const adminHas = getRolePermissions('ORG_ADMIN').includes(p.key);
                const superHas = getRolePermissions('SUPER_ADMIN').includes(p.key);

                return (
                  <tr key={p.key} className="hover:bg-[#F7F5F2]">
                    <td className="py-2.5 px-4">
                      <div className="font-bold text-[#111B21]">{p.label}</div>
                      <div className="text-[11px] text-[#667781]">{p.desc}</div>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {cashierHas ? (
                        <Check className="w-4 h-4 text-[#075E54] mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-rose-400 mx-auto" />
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {managerHas ? (
                        <Check className="w-4 h-4 text-[#075E54] mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-rose-400 mx-auto" />
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {adminHas ? (
                        <Check className="w-4 h-4 text-[#075E54] mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-rose-400 mx-auto" />
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {superHas ? (
                        <Check className="w-4 h-4 text-[#075E54] mx-auto" />
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
    </div>
  );
};
