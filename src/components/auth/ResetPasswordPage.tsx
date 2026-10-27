/**
 * SLATE POS — Dedicated Password Recovery & Reset View
 * Handles password reset for users arriving via Supabase Auth recovery tokens
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6 / #ECE5DD / #FFFFFF)
 */

import React, { useState } from 'react';
import { KeyRound, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { updateUserPassword } from '../../lib/supabaseClient';

interface ResetPasswordPageProps {
  onPasswordResetSuccess: () => void;
}

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ onPasswordResetSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters in length.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await updateUserPassword(newPassword);
      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          onPasswordResetSuccess();
        }, 2000);
      } else {
        setError(res.error || 'Failed to update your password. The reset link may have expired.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred while resetting your password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#F0F2F5] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-[#D1D7DB] w-full max-w-md overflow-hidden">
        {/* Header Branding */}
        <div className="bg-gradient-to-r from-[#075E54] to-[#128C7E] p-6 text-white text-center">
          <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center mx-auto mb-3 border border-white/20">
            <KeyRound className="w-6 h-6 text-[#DCF8C6]" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Create New Password</h2>
          <p className="text-xs text-[#DCF8C6]/80 mt-1">
            Choose a strong, secure password for your SLATE POS business account
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {success ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#DCF8C6] text-[#075E54] flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#111B21]">Password Updated!</h3>
                <p className="text-xs text-[#667781]">
                  Your credentials have been securely refreshed. Redirecting you to the system...
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#111B21]">New Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#667781]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full pl-9 pr-10 py-2.5 bg-[#F0F2F5] border border-[#D1D7DB] rounded-lg text-sm text-[#111B21] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#075E54]/20 focus:border-[#075E54] transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#667781] hover:text-[#111B21]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#111B21]">Confirm New Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#667781]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full pl-9 pr-3 py-2.5 bg-[#F0F2F5] border border-[#D1D7DB] rounded-lg text-sm text-[#111B21] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#075E54]/20 focus:border-[#075E54] transition-all"
                    required
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 bg-[#075E54] hover:bg-[#128C7E] active:bg-[#075E54] text-white rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {isLoading ? (
                    'Saving Password...'
                  ) : (
                    <>
                      <span>Set New Password &amp; Login</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
