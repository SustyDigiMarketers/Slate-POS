/**
 * SLATE POS — Change Password Modal (Authenticated Users)
 * Allows staff members to securely update their login credentials
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6 / #ECE5DD / #FFFFFF)
 */

import React, { useState } from 'react';
import { X, Key, Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { updateUserPassword } from '../../lib/supabaseClient';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must contain at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match. Please re-enter.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await updateUserPassword(newPassword);
      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setNewPassword('');
          setConfirmPassword('');
          onClose();
        }, 2000);
      } else {
        setError(res.error || 'Failed to update password.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-md overflow-hidden font-sans">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#D1D7DB] bg-[#F0F2F5]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#DCF8C6] flex items-center justify-center text-[#075E54]">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#111B21]">Change Password</h3>
              <p className="text-xs text-[#667781]">Update your account credentials</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[#667781] hover:text-[#111B21] hover:bg-black/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5">
          {success ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#DCF8C6] text-[#075E54] flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-[#111B21]">Password Changed Successfully!</h4>
              <p className="text-xs text-[#667781]">Your new password is now active.</p>
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
                    className="w-full pl-9 pr-10 py-2 bg-[#F0F2F5] border border-[#D1D7DB] rounded-lg text-sm text-[#111B21] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#075E54]/20 focus:border-[#075E54]"
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
                    placeholder="Re-enter password"
                    className="w-full pl-9 pr-3 py-2 bg-[#F0F2F5] border border-[#D1D7DB] rounded-lg text-sm text-[#111B21] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#075E54]/20 focus:border-[#075E54]"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#D1D7DB]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-[#D1D7DB] text-xs font-semibold text-[#111B21] rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 bg-[#075E54] hover:bg-[#128C7E] text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50"
                >
                  {isLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
