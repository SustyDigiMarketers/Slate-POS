/**
 * SLATE POS — Authentication Page
 * - Full-viewport Venice Blue (#16587B) to Rock Blue (#84B3CE) horizontal backdrop
 * - Left Section (~49%): Prominent /login.jpeg illustration, bottom horizontal white divider, Contact & Support links
 * - Right Section (~51%): Large white rounded card (rounded-3xl) with top centralized company logo and centered form
 * - Strictly preserves Supabase Auth, tenant isolation, branch verification, and RBAC checks
 * - Zero public signup or social OAuth buttons
 */

import React, { useState, useEffect } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  LogIn,
  CheckCircle2,
  X,
  Headphones,
  Phone,
} from 'lucide-react';
import { INITIAL_ORGANIZATION } from '../../lib/initialData';
import { offlineStore } from '../../lib/offlineStore';
import { getActiveBrandLogoUrl } from '../../lib/branding';
import {
  isSupabaseConfigured,
  getSupabaseConfigStatus,
  signInWithSupabase,
  resetPasswordWithSupabase,
  fetchUserProfile,
  fetchOrganizationFromSupabase,
  fetchOrganizationBranches,
  fetchOrganizationSubscription,
} from '../../lib/supabaseClient';

interface LoginPageProps {
  onLoginSuccess: (userId: string, branchId: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [activeOrg, setActiveOrg] = useState(() => offlineStore.getOrganization() || INITIAL_ORGANIZATION);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [capsLockActive, setCapsLockActive] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [infoModalMode, setInfoModalMode] = useState<'CONTACT' | 'SUPPORT' | null>(null);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setActiveOrg(offlineStore.getOrganization() || INITIAL_ORGANIZATION);
    });
    return unsub;
  }, []);

  const brandLogoUrl = getActiveBrandLogoUrl(activeOrg);
  const supportEmail = activeOrg.email || INITIAL_ORGANIZATION.email;
  const supportPhone = activeOrg.phone || INITIAL_ORGANIZATION.phone;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.getModifierState && e.getModifierState('CapsLock')) {
      setCapsLockActive(true);
    } else {
      setCapsLockActive(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage('Please enter a valid work email address.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your account password.');
      return;
    }

    if (!isSupabaseConfigured()) {
      const status = getSupabaseConfigStatus();
      setErrorMessage(`Authentication service is unavailable. ${status.message}`);
      return;
    }

    setIsLoading(true);

    try {
      const res = await signInWithSupabase(trimmedEmail, password);

      if (!res.success) {
        setErrorMessage(res.error || 'Invalid credentials. Please verify your email and password.');
        setIsLoading(false);
        return;
      }

      const profile = await fetchUserProfile(res.user?.id || '', trimmedEmail);
      if (!profile) {
        setErrorMessage(
          'Access Denied: No active business profile is associated with this account. Contact your organization administrator.'
        );
        setIsLoading(false);
        return;
      }

      if (profile.email && profile.email.trim().toLowerCase() !== trimmedEmail.toLowerCase()) {
        setErrorMessage(
          'Access Denied: Authenticated identity does not match profile authorization. Contact administrator.'
        );
        setIsLoading(false);
        return;
      }

      const subInfo = await fetchOrganizationSubscription(profile.organizationId);
      if (subInfo && (subInfo.status === 'EXPIRED' || subInfo.status === 'CANCELLED')) {
        setErrorMessage(
          `Access Denied: Your business organization subscription status is ${subInfo.status}. Please renew your subscription plan.`
        );
        setIsLoading(false);
        return;
      }

      const remoteBranches = await fetchOrganizationBranches(profile.organizationId);
      const orgBranches = remoteBranches && remoteBranches.length > 0
        ? remoteBranches
        : offlineStore.getBranches().filter((b) => b.organizationId === profile.organizationId);

      const userBranchId = profile.branchId;
      const validBranch =
        orgBranches.find((b) => b.id === userBranchId) ||
        orgBranches.find((b) => b.isMainBranch) ||
        (orgBranches.length > 0 ? orgBranches[0] : null);

      if (!validBranch || (validBranch.organizationId && validBranch.organizationId !== profile.organizationId)) {
        setErrorMessage(
          'Access Denied: Your assigned branch could not be resolved for your organization. Contact your organization administrator.'
        );
        setIsLoading(false);
        return;
      }

      if (orgBranches.length > 0) {
        offlineStore.setBranches(orgBranches);
      }

      const remoteOrg = await fetchOrganizationFromSupabase(profile.organizationId);
      if (remoteOrg) {
        offlineStore.setOrganization(remoteOrg);
      }

      offlineStore.login(profile.id, validBranch.id, profile);
      setIsLoading(false);
      onLoginSuccess(profile.id, validBranch.id);
      offlineStore.hydrateFromSupabase().catch((e) => console.warn('Supabase hydration error:', e));
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected authentication error occurred.');
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    setForgotSuccess(null);

    const targetEmail = forgotEmail.trim() || email.trim();
    if (!targetEmail || !targetEmail.includes('@')) {
      setForgotError('Please provide a valid registered work email address.');
      return;
    }

    if (!isSupabaseConfigured()) {
      setForgotError('Password recovery service is unavailable. Please contact your system administrator.');
      return;
    }

    setForgotLoading(true);
    try {
      const res = await resetPasswordWithSupabase(targetEmail);
      if (res.success) {
        setForgotSuccess('If an account is associated with this work email, password recovery instructions have been sent. Please check your inbox.');
        setTimeout(() => {
          setShowForgotModal(false);
          setForgotSuccess(null);
        }, 4000);
      } else {
        setForgotError(res.error || 'Failed to dispatch password recovery email.');
      }
    } catch (err: any) {
      setForgotError(err.message || 'An unexpected error occurred while requesting password reset.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="h-full h-screen h-[100dvh] max-h-[100dvh] w-full bg-[#16587B] md:bg-[linear-gradient(90deg,#16587B_0%,#1D5D80_3%,#51839C_25.5%,#84A7BA_48%,#84B3CE_54%,#DCE9F0_86%,#FFFFFF_100%)] antialiased font-sans overflow-y-auto overflow-x-hidden md:overflow-hidden select-none fixed inset-0">
      <div className="min-h-full md:h-full w-full max-w-[1440px] mx-auto md:py-8 md:px-8 lg:py-9 lg:px-10 flex flex-col md:flex-row items-stretch md:gap-4 lg:gap-6">
        {/* LEFT SECTION (~49%): Prominent /login.jpeg Finance Illustration + Bottom White Divider & Contact/Support */}
        <div className="w-full md:w-[49%] bg-[linear-gradient(90deg,#16587B_0%,#1D5D80_8%,#51839C_50%,#84A7BA_92%,#84B3CE_100%)] md:bg-none flex flex-col justify-between text-white shrink-0 md:min-h-0 px-6 sm:px-10 md:px-2 lg:px-4 pt-6 sm:pt-8 md:pt-2 pb-4 md:pb-1">
          {/* Upper & Middle Portion: Centered Borderless, Shadowless Finance Illustration */}
          <div className="flex-1 flex items-center justify-center py-2 sm:py-4 md:py-6 min-h-0">
            <img
              src="/login.jpeg"
              alt="SLATE POS Financial Accounting and Currency Illustration"
              className="w-full max-w-[310px] sm:max-w-[380px] md:max-w-[440px] lg:max-w-[540px] xl:max-w-[580px] max-h-[260px] sm:max-h-[340px] md:max-h-[68vh] h-auto object-contain select-none pointer-events-none [mask-image:linear-gradient(to_right,transparent_0%,black_7%,black_93%,transparent_100%),linear-gradient(to_bottom,transparent_0%,black_7%,black_93%,transparent_100%)] [-webkit-mask-composite:source-in] [mask-composite:intersect]"
            />
          </div>

          {/* Bottom Navigation Strip: Thin Horizontal White Divider + Contact & Support */}
          <div className="w-full pt-2 shrink-0">
            <div className="h-px w-full bg-white/90 mb-3 sm:mb-3.5" />
            <div className="flex items-center justify-between text-sm sm:text-[15px] font-medium">
              <button
                type="button"
                onClick={() => setInfoModalMode('CONTACT')}
                className="text-white hover:text-[#F5EEDD] transition-colors cursor-pointer py-1.5 px-1 rounded focus-visible:outline-2 focus-visible:outline-white"
              >
                Contact
              </button>
              <button
                type="button"
                onClick={() => setInfoModalMode('SUPPORT')}
                className="text-white hover:text-[#F5EEDD] transition-colors cursor-pointer py-1.5 px-1 rounded focus-visible:outline-2 focus-visible:outline-white"
              >
                Support
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT SECTION (~51%): Large Full-Height White Rounded Login Card */}
        <div className="w-full md:w-[51%] flex-1 md:flex-initial bg-white rounded-t-3xl md:rounded-3xl shadow-[0_12px_36px_rgba(22,88,123,0.08)] px-6 py-8 sm:px-10 sm:py-10 lg:px-14 lg:py-12 flex flex-col justify-between md:h-full md:overflow-y-auto">
          {/* Top Centered Centralized Company Logo */}
          <div className="flex flex-col items-center justify-center pt-1 sm:pt-2 shrink-0">
            <img
              src={brandLogoUrl}
              alt={activeOrg.tradeName || activeOrg.name || 'SLATE POS'}
              className="w-16 h-16 sm:w-20 sm:h-20 object-contain"
            />
          </div>

          {/* Centered Authentication Form */}
          <div className="flex-1 flex flex-col justify-center py-6 sm:py-8">
            <div className="w-full max-w-[400px] mx-auto space-y-6">
              {/* Form Heading */}
              <div>
                <h1 className="text-2xl sm:text-[28px] font-bold text-[#16587B] tracking-tight">
                  Welcome Back
                </h1>
                <p className="text-xs sm:text-sm text-[#405D6D] mt-1.5">
                  Sign in to your SLATE POS account
                </p>
              </div>

              {/* Error Alert */}
              {errorMessage && (
                <div
                  role="alert"
                  className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in"
                >
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed font-medium">{errorMessage}</div>
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-4">
                {/* Work Email */}
                <div>
                  <label htmlFor="login-email" className="block text-xs font-semibold text-[#16587B] mb-1.5">
                    Work Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#405D6D] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full min-h-[44px] pl-10 pr-4 py-2.5 text-sm bg-[#FAF6EC] border border-[#84B3CE]/55 rounded-xl text-[#111B21] placeholder:text-[#5C7280] focus:bg-white focus:border-[#16587B] focus:ring-1 focus:ring-[#16587B] outline-none transition-all font-medium"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="login-password" className="text-xs font-semibold text-[#16587B]">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgotModal(true);
                        setForgotEmail(email);
                      }}
                      className="text-xs text-[#16587B] hover:text-[#124866] font-semibold hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#405D6D] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full min-h-[44px] pl-10 pr-11 py-2.5 text-sm bg-[#FAF6EC] border border-[#84B3CE]/55 rounded-xl text-[#111B21] placeholder:text-[#5C7280] focus:bg-white focus:border-[#16587B] focus:ring-1 focus:ring-[#16587B] outline-none transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#405D6D] hover:text-[#16587B] p-1 cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {capsLockActive && (
                    <div className="mt-1.5 text-xs text-amber-700 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Caps Lock is ON</span>
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full min-h-[46px] py-3 px-4 bg-[#16587B] hover:bg-[#124866] active:bg-[#0F405B] text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying Credentials...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Login</span>
                    </>
                  )}
                </button>
              </form>

              {/* Security & Access Footer */}
              <div className="pt-4 border-t border-[#84B3CE]/30 flex items-center justify-between text-[11px] text-[#405D6D]">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#16587B]" />
                  Role-Based Access
                </span>
                <span className="font-mono text-[10px] text-[#405D6D]">TLS 256-bit</span>
              </div>
            </div>
          </div>

          <div className="shrink-0 hidden md:block md:h-4" aria-hidden="true" />
        </div>
      </div>

      {/* CONTACT / SUPPORT MODAL */}
      {infoModalMode && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-[#F5EEDD] rounded-xl max-w-sm w-full p-5 shadow-2xl border border-[#16587B]/20 space-y-4 font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-[#16587B]/15">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#84B3CE]/40 flex items-center justify-center text-[#16587B]">
                  <Headphones className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#16587B]">
                  {infoModalMode === 'CONTACT' ? 'Contact Desk' : 'Enterprise Support'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInfoModalMode(null)}
                className="text-[#405D6D] hover:text-[#16587B] p-1 rounded hover:bg-[#84B3CE]/20 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-[#405D6D] leading-relaxed">
                {infoModalMode === 'CONTACT'
                  ? 'Reach your SLATE POS business administration team or enterprise onboarding desk.'
                  : 'Need help with terminal access, password reset, or branch permissions? Reach our support desk.'}
              </p>

              <div className="p-3 bg-white rounded-lg border border-[#16587B]/15 space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-[#16587B] shrink-0" />
                  <div className="min-w-0">
                    <span className="block text-[10px] uppercase font-bold text-[#405D6D]">Email</span>
                    <a
                      href={`mailto:${supportEmail}?subject=SLATE%20POS%20${infoModalMode === 'CONTACT' ? 'Contact' : 'Support'}%20Request`}
                      className="font-semibold text-[#16587B] hover:underline truncate block"
                    >
                      {supportEmail}
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 pt-2 border-t border-[#16587B]/10">
                  <Phone className="w-4 h-4 text-[#16587B] shrink-0" />
                  <div className="min-w-0">
                    <span className="block text-[10px] uppercase font-bold text-[#405D6D]">Phone</span>
                    <a
                      href={`tel:${supportPhone.replace(/\s+/g, '')}`}
                      className="font-semibold text-[#111B21] hover:underline block"
                    >
                      {supportPhone}
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setInfoModalMode(null)}
                  className="px-3.5 py-2 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FORGOT PASSWORD MODAL */}
      {showForgotModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-[#F5EEDD] rounded-xl max-w-sm w-full p-5 shadow-2xl border border-[#16587B]/20 space-y-4 font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-[#16587B]/15">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#84B3CE]/40 flex items-center justify-center text-[#16587B]">
                  <Mail className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#16587B]">
                  Reset Account Password
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowForgotModal(false);
                  setForgotError(null);
                  setForgotSuccess(null);
                }}
                className="text-[#405D6D] hover:text-[#16587B] p-1 rounded hover:bg-[#84B3CE]/20 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {forgotSuccess ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-medium flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                <span>{forgotSuccess}</span>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-3.5 text-xs">
                <p className="text-[#405D6D] leading-relaxed">
                  Enter your registered enterprise email address. We will dispatch a secure password reset link via Supabase Auth.
                </p>

                <div>
                  <label htmlFor="forgot-email" className="font-semibold text-[#16587B] block mb-1">
                    Registered Work Email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full px-3 py-2 bg-white border border-[#16587B]/20 rounded-lg text-xs text-[#111B21] focus:border-[#16587B] focus:ring-1 focus:ring-[#16587B] outline-none"
                  />
                </div>

                {forgotError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-[11px] flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-600" />
                    <span>{forgotError}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="flex-1 py-2 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {forgotLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <span>Send Reset Link</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotModal(false);
                      setForgotError(null);
                      setForgotSuccess(null);
                    }}
                    className="px-3 py-2 bg-[#84B3CE]/40 border border-[#84B3CE] text-[#0F2D3D] hover:bg-[#84B3CE]/60 font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
