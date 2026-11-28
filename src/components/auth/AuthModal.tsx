/**
 * SLATE POS — Commercial Authentication & Cashier Lock Screen
 * Supports:
 * - Fast 4-Digit Cashier PIN entry for rapid counter shifts
 * - Email & Password authentication with password visibility toggle
 * - Branch and terminal selection
 * - Quick-fill presets for Super Admin, Manager, Cashier, Auditor
 * - Validation, loading state, error feedback, and password reset flow
 * Styled with SLATE POS Tricolour Theme (#16587B / #84B3CE / #F5EEDD / #FAF6EC / #FFFFFF)
 */

import React, { useState } from 'react';
import { INITIAL_USERS, INITIAL_BRANCHES, INITIAL_ORGANIZATION } from '../../lib/initialData';
import { offlineStore } from '../../lib/offlineStore';
import {
  Lock,
  Eye,
  EyeOff,
  Building,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Shield,
  UserCheck,
  Store,
  RefreshCw,
  X,
  LogIn,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onLoginSuccess: (userId: string, branchId: string) => void;
  isLockScreen?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  isLockScreen = false,
}) => {
  const activeUser = offlineStore.getActiveUser();
  const activeBranchId = offlineStore.getActiveBranchId();

  const [authMode, setAuthMode] = useState<'PIN' | 'PASSWORD'>('PIN');
  const [selectedBranchId, setSelectedBranchId] = useState<string>(activeBranchId);
  const [pin, setPin] = useState<string>('1234');
  const [email, setEmail] = useState<string>(activeUser.email || 'rajesh.sharma@apexretail.in');
  const [password, setPassword] = useState<string>('••••••••');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [selectedUserId, setSelectedUserId] = useState<string>(activeUser.id);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState<boolean>(false);
  const [forgotSuccess, setForgotSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleQuickSelectUser = (user: (typeof INITIAL_USERS)[0]) => {
    setSelectedUserId(user.id);
    setEmail(user.email);
    setPin('1234');
    setPassword('SlatePos@2026');
    setErrorMessage(null);
  };

  const handleAuthenticate = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    setTimeout(() => {
      if (authMode === 'PIN') {
        if (pin.length < 4) {
          setIsLoading(false);
          setErrorMessage('PIN must be at least 4 digits');
          return;
        }
      } else {
        if (!email.includes('@')) {
          setIsLoading(false);
          setErrorMessage('Please enter a valid business email');
          return;
        }
      }

      // Successful authentication
      offlineStore.setActiveUser(selectedUserId);
      offlineStore.setActiveBranch(selectedBranchId);
      setIsLoading(false);
      onLoginSuccess(selectedUserId, selectedBranchId);
    }, 450);
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setForgotSuccess(true);
    setTimeout(() => {
      setShowForgotModal(false);
      setForgotSuccess(false);
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0F405B]/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 select-none">
      <div className="bg-[#F5EEDD] rounded-xl shadow-2xl border border-[#16587B]/20 w-full max-w-md overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Brand Header */}
        <div className="gradient-primary text-[#F5EEDD] p-5 text-center relative">
          {onClose && !isLockScreen && (
            <button
              onClick={onClose}
              className="absolute right-3.5 top-3.5 p-1 rounded-full text-[#F5EEDD]/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <div className="w-12 h-12 rounded-xl bg-white/10 border border-[#84B3CE]/40 mx-auto flex items-center justify-center mb-3 shadow-inner">
            <Lock className="w-6 h-6 text-[#84B3CE]" />
          </div>

          <h2 className="text-lg font-bold tracking-tight text-[#F5EEDD]">
            {isLockScreen ? 'Terminal Locked' : 'Sign in to SLATE POS'}
          </h2>
          <p className="text-xs text-[#84B3CE] mt-0.5">
            {INITIAL_ORGANIZATION.tradeName} · Multi-Branch POS
          </p>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* Quick Role Fill Presets for Instant Evaluation */}
          <div>
            <div className="text-[11px] font-bold text-[#405D6D] uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Select Shift Identity (RBAC)</span>
              <span className="text-[10px] text-[#16587B] font-semibold">1-Click Test</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {INITIAL_USERS.map((user) => {
                const isSelected = selectedUserId === user.id;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleQuickSelectUser(user)}
                    className={`text-left p-2 rounded-lg border text-xs transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'border-[#16587B] bg-[#84B3CE]/35 text-[#16587B] font-bold ring-1 ring-[#16587B]'
                        : 'border-[#16587B]/15 bg-white hover:bg-[#FAF6EC] text-[#405D6D]'
                    }`}
                  >
                    <div className="truncate pr-1">
                      <div className="truncate font-semibold">{user.name.split(' ')[0]}</div>
                      <div className="text-[10px] text-[#5C7280]">{user.role}</div>
                    </div>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-[#16587B] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleAuthenticate} className="space-y-3.5">
            {/* Branch Selector */}
            <div>
              <label className="block text-xs font-semibold text-[#16587B] mb-1">
                Active Branch Outlet
              </label>
              <div className="relative">
                <Store className="w-4 h-4 text-[#405D6D] absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#16587B]/20 rounded-lg text-[#111B21] focus:border-[#16587B] outline-none"
                >
                  {INITIAL_BRANCHES.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.city}) {b.isMainBranch ? '— HQ' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Mode Toggle: Cashier PIN vs Email/Password */}
            <div className="flex rounded-lg bg-[#84B3CE]/25 p-1 text-xs">
              <button
                type="button"
                onClick={() => setAuthMode('PIN')}
                className={`flex-1 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                  authMode === 'PIN'
                    ? 'bg-[#16587B] text-[#F5EEDD] shadow-xs'
                    : 'text-[#405D6D] hover:text-[#16587B]'
                }`}
              >
                Quick Cashier PIN
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('PASSWORD')}
                className={`flex-1 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                  authMode === 'PASSWORD'
                    ? 'bg-[#16587B] text-[#F5EEDD] shadow-xs'
                    : 'text-[#405D6D] hover:text-[#16587B]'
                }`}
              >
                Email &amp; Password
              </button>
            </div>

            {/* PIN Input */}
            {authMode === 'PIN' ? (
              <div>
                <label className="block text-xs font-semibold text-[#16587B] mb-1">
                  Cashier Security PIN (Default: 1234)
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-[#405D6D] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 4-digit PIN"
                    className="w-full pl-9 pr-3 py-2 text-center text-lg tabular-nums tracking-widest bg-white border border-[#16587B]/20 rounded-lg focus:border-[#16587B] outline-none font-bold"
                    autoFocus
                  />
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[#16587B] mb-1">
                    Work Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs bg-white border border-[#16587B]/20 rounded-lg focus:border-[#16587B] outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-[#16587B]">Password</label>
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(true)}
                      className="text-[11px] text-[#16587B] hover:underline font-semibold"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full pl-3 pr-9 py-2 text-xs bg-white border border-[#16587B]/20 rounded-lg focus:border-[#16587B] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#405D6D] hover:text-[#16587B]"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-lg text-[#F5EEDD] font-bold text-xs uppercase tracking-wider gradient-primary hover:opacity-95 shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>{isLockScreen ? 'Unlock Terminal' : 'Sign In & Open Counter'}</span>
                </>
              )}
            </button>
          </form>

          {/* Footer note */}
          <div className="pt-2 border-t border-[#16587B]/15 flex items-center justify-between text-[11px] text-[#405D6D]">
            <span className="flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-[#16587B]" />
              Offline Terminal Authentication
            </span>
            <button
              type="button"
              onClick={() => setShowForgotModal(true)}
              className="hover:text-[#16587B] hover:underline cursor-pointer"
            >
              Need Help?
            </button>
          </div>
        </div>
      </div>

      {/* Forgot Password / Shift Reset Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-[#F5EEDD] rounded-xl max-w-sm w-full p-5 shadow-2xl border border-[#16587B]/20 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#16587B]/15">
              <h3 className="text-sm font-bold text-[#16587B]">Password &amp; PIN Reset</h3>
              <button
                onClick={() => setShowForgotModal(false)}
                className="text-[#405D6D] hover:text-[#16587B]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {forgotSuccess ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>Reset instructions dispatched to registered manager contact.</span>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-3 text-xs">
                <p className="text-[#405D6D]">
                  Enter your registered work email. A temporary 4-digit shift override token will be
                  generated.
                </p>
                <div>
                  <label className="font-semibold text-[#16587B] block mb-1">Email</label>
                  <input
                    type="email"
                    required
                    defaultValue={email}
                    className="w-full px-3 py-2 bg-white border border-[#16587B]/20 rounded-lg focus:border-[#16587B] outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-[#16587B] text-[#F5EEDD] font-bold rounded-lg hover:bg-[#124866] transition-colors cursor-pointer"
                >
                  Send Shift Override
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
