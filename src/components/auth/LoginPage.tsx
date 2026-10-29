/**
 * SLATE POS — Responsive Two-Panel Enterprise Login Page
 * 
 * Layout Architecture:
 * - Desktop & Tablet (>= 768px): Two-panel layout with Minimal Company Branding on the Left
 *   and Enterprise Login Form on the Right.
 * - Mobile (< 768px): Stacked layout with Minimal Company Branding at the Top
 *   and Login Form Below. Natural vertical scrolling without horizontal overflow (down to 320px).
 * - Company Branding: Minimal and compact (Company Logo, Company Name, and Contact Us button).
 * - Connected directly to Supabase Auth and PostgreSQL user_profiles.
 * - Zero demo identities, zero offline bypasses, and no persistent warning banners.
 * - Palette: #075E54 (Deep Emerald), #064E46 (Dark Emerald), #128C7E (Teal), #DCF8C6 (Mint), #FAFAFA / #FFFFFF (Clean White)
 */

import React, { useState } from 'react';
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
  Building2,
  Sparkles,
} from 'lucide-react';
import { INITIAL_ORGANIZATION } from '../../lib/initialData';
import { offlineStore } from '../../lib/offlineStore';
import {
  isSupabaseConfigured,
  getSupabaseConfigStatus,
  signInWithSupabase,
  signUpWithSupabase,
  onboardBusinessInSupabase,
  resetPasswordWithSupabase,
  fetchUserProfile,
  fetchOrganizationBranches,
  fetchOrganizationSubscription,
} from '../../lib/supabaseClient';

interface LoginPageProps {
  onLoginSuccess: (userId: string, branchId: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [capsLockActive, setCapsLockActive] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  // Business Registration & Onboarding State
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [regBusinessName, setRegBusinessName] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regState, setRegState] = useState('Karnataka');
  const [regGstin, setRegGstin] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);

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

    // Commercial authentication requires configured Supabase cloud backend
    if (!isSupabaseConfigured()) {
      const status = getSupabaseConfigStatus();
      setErrorMessage(`Authentication service is unavailable. ${status.message}`);
      return;
    }

    setIsLoading(true);

    try {
      // Authenticate with real Supabase Auth
      const res = await signInWithSupabase(trimmedEmail, password);

      if (!res.success) {
        setErrorMessage(res.error || 'Invalid credentials. Please verify your email and password.');
        setIsLoading(false);
        return;
      }

      // Retrieve authorized user profile & assigned role from Supabase user_profiles table
      const profile = await fetchUserProfile(res.user?.id || '', trimmedEmail);
      if (!profile) {
        setErrorMessage(
          'Access Denied: No active business profile is associated with this account. Contact your organization administrator.'
        );
        setIsLoading(false);
        return;
      }

      // Profile email verification
      if (profile.email && profile.email.trim().toLowerCase() !== trimmedEmail.toLowerCase()) {
        setErrorMessage(
          'Access Denied: Authenticated identity does not match profile authorization. Contact administrator.'
        );
        setIsLoading(false);
        return;
      }

      // Check organization subscription status
      const subInfo = await fetchOrganizationSubscription(profile.organizationId);
      if (subInfo && (subInfo.status === 'EXPIRED' || subInfo.status === 'CANCELLED')) {
        setErrorMessage(
          `Access Denied: Your business organization subscription status is ${subInfo.status}. Please renew your subscription plan.`
        );
        setIsLoading(false);
        return;
      }

      // Fetch organization branches strictly for this user's organization
      const remoteBranches = await fetchOrganizationBranches(profile.organizationId);
      const orgBranches = remoteBranches && remoteBranches.length > 0
        ? remoteBranches
        : offlineStore.getBranches().filter((b) => b.organizationId === profile.organizationId);

      // Post-authentication branch resolution: Determine authorized branch from trusted profile
      const userBranchId = profile.branchId;
      const validBranch =
        orgBranches.find((b) => b.id === userBranchId) ||
        orgBranches.find((b) => b.isMainBranch) ||
        (orgBranches.length > 0 ? orgBranches[0] : null);

      // CRITICAL SECURITY ENFORCEMENT: Never fall back to an unrelated tenant's branch (e.g. Apex Retail's br_blr_01)!
      if (!validBranch || (validBranch.organizationId && validBranch.organizationId !== profile.organizationId)) {
        setErrorMessage(
          'Access Denied: Your assigned branch could not be resolved for your organization. Contact your organization administrator.'
        );
        setIsLoading(false);
        return;
      }

      // Register organization branches in offlineStore to set tenant context
      if (orgBranches.length > 0) {
        offlineStore.setBranches(orgBranches);
      }

      offlineStore.login(profile.id, validBranch.id, profile);
      setIsLoading(false);
      onLoginSuccess(profile.id, validBranch.id);
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

  const handleRegisterBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegSuccess(null);

    const trimmedBusiness = regBusinessName.trim();
    const trimmedName = regFullName.trim();
    const trimmedEmail = regEmail.trim();

    if (!trimmedBusiness) {
      setRegError('Please specify your business or store name.');
      return;
    }
    if (!trimmedName) {
      setRegError('Please enter your full name as business owner.');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setRegError('Please provide a valid business email.');
      return;
    }
    if (regPassword.length < 8) {
      setRegError('Password must contain at least 8 characters.');
      return;
    }

    if (!isSupabaseConfigured()) {
      setRegError('Registration service requires configured Supabase cloud backend.');
      return;
    }

    setRegLoading(true);
    try {
      // 1. Register Owner via Supabase Auth
      const signUpRes = await signUpWithSupabase(trimmedEmail, regPassword, trimmedName);
      if (!signUpRes.success) {
        setRegError(signUpRes.error || 'Failed to create business account.');
        setRegLoading(false);
        return;
      }

      // If email confirmation is required by Supabase project settings
      if (signUpRes.user && !signUpRes.session) {
        setRegSuccess(
          `Verification email sent to ${trimmedEmail}. Please verify your email to activate your workspace.`
        );
        setRegLoading(false);
        return;
      }

      // 2. Onboard Business Tenant & Initialize Trial
      const onboardRes = await onboardBusinessInSupabase({
        businessName: trimmedBusiness,
        legalName: trimmedBusiness,
        gstin: regGstin,
        state: regState,
        phone: regPhone,
        planId: 'plan_starter_monthly',
        accessToken: signUpRes.session?.access_token,
      });

      if (!onboardRes.success) {
        setRegError(onboardRes.error || 'Account created, but store onboarding encountered an error.');
        setRegLoading(false);
        return;
      }

      setRegSuccess('Business workspace registered successfully! Starting your 14-day free trial...');

      // 3. Log in and load profile
      setTimeout(async () => {
        const loginRes = await signInWithSupabase(trimmedEmail, regPassword);
        if (loginRes.success && loginRes.user) {
          const profile = await fetchUserProfile(loginRes.user.id, trimmedEmail);
          if (profile) {
            offlineStore.login(profile.id, profile.branchId, profile);
            onLoginSuccess(profile.id, profile.branchId);
          }
        }
        setShowRegisterModal(false);
      }, 1500);
    } catch (err: any) {
      setRegError(err.message || 'An unexpected error occurred during business onboarding.');
      setRegLoading(false);
    }
  };

  return (
    <div className="h-full h-screen h-[100dvh] max-h-[100dvh] w-full bg-white flex flex-col md:flex-row landscape:max-md:flex-row antialiased font-sans overflow-hidden select-none fixed inset-0 min-h-0 min-w-0">
      {/* ========================================================================= */}
      {/* BRANDING PANEL: Cohesive seamless mobile layout (no divider line)         */}
      {/* and Desktop Split Layout (md:border-r border-[#E9EDEF])                    */}
      {/* ========================================================================= */}
      <aside
        aria-label="Company Branding"
        className="w-full md:w-[360px] lg:w-[460px] xl:w-[600px] landscape:max-md:w-[40%] shrink-0 bg-white border-none md:border-r border-[#E9EDEF] flex flex-col justify-center items-center px-4 pt-4 pb-1 sm:pt-6 sm:pb-2 md:p-8 lg:p-14 shadow-none md:h-full min-h-0"
      >
        <div className="w-full flex flex-col items-center justify-center text-center my-auto">
          {/* Substantially Enlarged Responsive Logo: sharp, centered, maintaining aspect ratio */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 md:w-56 md:h-56 lg:w-[380px] lg:h-[380px] max-h-[16vh] sm:max-h-[18vh] md:max-h-[35vh] lg:max-h-[380px] landscape:max-md:max-h-[35vh] rounded-2xl md:rounded-3xl bg-white border border-[#E9EDEF] p-2.5 sm:p-3 md:p-4 lg:p-6 shadow-2xs shrink-0 flex items-center justify-center">
            <img
              src="/src/assets/images/slate_pos_symbol_1791618547129.jpg"
              alt="SLATE POS Logo"
              className="w-full h-full object-contain rounded-xl md:rounded-2xl"
            />
          </div>

          {/* Company Name neatly aligned beneath logo */}
          <h1 className="mt-1.5 sm:mt-2 md:mt-4 lg:mt-6 text-base sm:text-lg md:text-2xl lg:text-4xl xl:text-5xl font-extrabold tracking-tight text-[#111B21]">
            SLATE POS
          </h1>

          {/* Contact Us Button neatly aligned beneath company name */}
          <div className="mt-1 sm:mt-1.5 md:mt-3 lg:mt-5">
            <button
              type="button"
              onClick={() => setShowContactModal(true)}
              className="inline-flex items-center gap-1.5 md:gap-2 px-3 py-1 sm:px-4 sm:py-1.5 md:px-5 md:py-2.5 text-[11px] sm:text-xs md:text-sm font-semibold text-[#111B21] bg-white hover:bg-[#F7F5F2] border border-[#D1D7DB] hover:border-[#8696A0] rounded-lg md:rounded-xl transition-all cursor-pointer shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-[#075E54]/30"
            >
              <Headphones className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#075E54]" />
              <span>Contact Us</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* LOGIN FORM PANEL: Smoothly flows on mobile with internal scroll if needed */}
      {/* ========================================================================= */}
      <main className="flex-1 bg-white flex flex-col justify-between px-4 py-2 sm:px-6 sm:py-3 md:px-8 md:py-6 lg:p-12 overflow-y-auto md:overflow-hidden md:h-full min-h-0 min-w-0">
        <div className="w-full max-w-sm sm:max-w-md mx-auto my-auto space-y-2 sm:space-y-3 md:space-y-5 lg:space-y-6">
          {/* Welcome Heading */}
          <div>
            <h2 className="text-sm sm:text-base md:text-xl lg:text-2xl font-bold text-[#111B21] tracking-tight">
              Sign in to your account
            </h2>
          </div>

          {/* Authentication Error Alert */}
          {errorMessage && (
            <div
              role="alert"
              className="p-2 sm:p-2.5 md:p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-[11px] sm:text-xs flex items-start gap-2 animate-in fade-in"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed font-medium">{errorMessage}</div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-2 sm:space-y-2.5 md:space-y-3.5 lg:space-y-4">

            {/* Work Email Field */}
            <div>
              <label htmlFor="login-email" className="block text-[11px] sm:text-xs font-semibold text-[#111B21] mb-0.5 sm:mb-1">
                Work Email Address
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#8696A0] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cashier@apexretail.in"
                  className="w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-1.5 sm:py-2 md:py-2.5 text-xs bg-white border border-[#D1D7DB] rounded-lg text-[#111B21] placeholder:text-[#8696A0] focus:border-[#075E54] focus:ring-1 focus:ring-[#075E54] outline-none transition-all font-medium"
                />
              </div>
            </div>

            {/* Password Field with Show/Hide Toggle & Caps Lock Indicator */}
            <div>
              <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                <label htmlFor="login-password" className="text-[11px] sm:text-xs font-semibold text-[#111B21]">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotModal(true);
                    setForgotEmail(email);
                  }}
                  className="text-[10px] sm:text-[11px] text-[#075E54] hover:text-[#064E46] font-semibold hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#8696A0] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 sm:pl-10 pr-9 sm:pr-10 py-1.5 sm:py-2 md:py-2.5 text-xs bg-white border border-[#D1D7DB] rounded-lg text-[#111B21] placeholder:text-[#8696A0] focus:border-[#075E54] focus:ring-1 focus:ring-[#075E54] outline-none transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 text-[#8696A0] hover:text-[#111B21] p-0.5 cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                </button>
              </div>
              {capsLockActive && (
                <div className="mt-1 text-[10px] sm:text-[11px] text-amber-700 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>Caps Lock is ON</span>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2 sm:py-2.5 px-4 bg-[#075E54] hover:bg-[#064E46] active:bg-[#054C44] text-white text-xs font-bold rounded-lg shadow-xs hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-1.5 sm:mt-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>Sign In &amp; Open Terminal</span>
                </>
              )}
            </button>

            {/* Commercial Business Registration Link */}
            <div className="pt-2 text-center">
              <p className="text-[10px] sm:text-[11px] text-[#667781]">
                New business owner?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setShowRegisterModal(true);
                    setRegError(null);
                    setRegSuccess(null);
                  }}
                  className="text-[#075E54] hover:text-[#064E46] font-bold hover:underline cursor-pointer"
                >
                  Register Business (14-Day Free Trial)
                </button>
              </p>
            </div>
          </form>

          {/* Security & Access Badges */}
          <div className="pt-2 sm:pt-3.5 border-t border-[#E9EDEF] flex items-center justify-between text-[10px] sm:text-[11px] text-[#667781]">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#075E54]" />
              Role-Based Access Enforcement
            </span>
            <span className="font-mono text-[9px] sm:text-[10px] text-[#8696A0]">TLS 256-bit Encrypted</span>
          </div>
        </div>

        {/* Footer Organization Context */}
        <div className="mt-2 sm:mt-4 pt-2 border-t border-[#E9EDEF] text-center text-[10px] sm:text-[11px] text-[#8696A0]">
          &copy; {new Date().getFullYear()} SLATE POS. All rights reserved.
        </div>
      </main>

      {/* ========================================================================= */}
      {/* CONTACT US MODAL                                                          */}
      {/* Functional contact destination with verified enterprise support details   */}
      {/* ========================================================================= */}
      {showContactModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-modal-title"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-2xl border border-[#D1D7DB] space-y-4 font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-[#E9EDEF]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#DCF8C6] flex items-center justify-center text-[#075E54]">
                  <Headphones className="w-4 h-4" />
                </div>
                <h3 id="contact-modal-title" className="text-sm font-bold text-[#111B21]">
                  Contact Enterprise Support
                </h3>
              </div>
              <button
                onClick={() => setShowContactModal(false)}
                className="text-[#667781] hover:text-[#111B21] p-1 rounded hover:bg-[#F7F5F2] cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-[#667781] leading-relaxed">
                Need assistance with your SLATE POS terminal, branch deployment, or login credentials? Reach our verified enterprise support desk.
              </p>

              <div className="p-3 bg-[#F7F5F2] rounded-lg border border-[#E9EDEF] space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-[#075E54] shrink-0" />
                  <div className="min-w-0">
                    <span className="block text-[10px] uppercase font-bold text-[#8696A0]">Support Email</span>
                    <a
                      href={`mailto:${INITIAL_ORGANIZATION.email}?subject=SLATE%20POS%20Support%20Inquiry`}
                      className="font-semibold text-[#075E54] hover:underline truncate block"
                    >
                      {INITIAL_ORGANIZATION.email}
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 pt-2 border-t border-[#E9EDEF]">
                  <Phone className="w-4 h-4 text-[#075E54] shrink-0" />
                  <div className="min-w-0">
                    <span className="block text-[10px] uppercase font-bold text-[#8696A0]">Helpdesk Line</span>
                    <a
                      href={`tel:${INITIAL_ORGANIZATION.phone.replace(/\s+/g, '')}`}
                      className="font-semibold text-[#111B21] hover:underline block"
                    >
                      {INITIAL_ORGANIZATION.phone}
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <a
                  href={`mailto:${INITIAL_ORGANIZATION.email}?subject=SLATE%20POS%20Support%20Inquiry`}
                  className="px-3.5 py-2 bg-[#075E54] hover:bg-[#064E46] text-white font-bold rounded-lg transition-colors inline-flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Send Email</span>
                </a>
                <button
                  type="button"
                  onClick={() => setShowContactModal(false)}
                  className="px-3 py-2 bg-white border border-[#D1D7DB] text-[#667781] hover:bg-[#F7F5F2] font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FORGOT PASSWORD MODAL                                                     */}
      {/* ========================================================================= */}
      {showForgotModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-modal-title"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-2xl border border-[#D1D7DB] space-y-4 font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-[#E9EDEF]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#DCF8C6] flex items-center justify-center text-[#075E54]">
                  <Mail className="w-4 h-4" />
                </div>
                <h3 id="forgot-modal-title" className="text-sm font-bold text-[#111B21]">
                  Reset Account Password
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowForgotModal(false);
                  setForgotError(null);
                  setForgotSuccess(null);
                }}
                className="text-[#667781] hover:text-[#111B21] p-1 rounded hover:bg-[#F7F5F2] cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {forgotSuccess ? (
              <div className="p-3 bg-[#DCF8C6]/70 border border-[#B3EBA0] rounded-lg text-xs text-[#075E54] font-medium flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{forgotSuccess}</span>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-3.5 text-xs">
                <p className="text-[#667781] leading-relaxed">
                  Enter your registered enterprise email address. We will dispatch a secure password reset link via Supabase Auth.
                </p>

                <div>
                  <label htmlFor="forgot-email" className="font-semibold text-[#111B21] block mb-1">
                    Registered Work Email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full px-3 py-2 border border-[#D1D7DB] rounded-lg text-xs text-[#111B21] focus:border-[#075E54] focus:ring-1 focus:ring-[#075E54] outline-none"
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
                    className="flex-1 py-2 bg-[#075E54] hover:bg-[#064E46] text-white font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
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
                    className="px-3 py-2 bg-white border border-[#D1D7DB] text-[#667781] hover:bg-[#F7F5F2] font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* COMMERCIAL BUSINESS REGISTRATION & ONBOARDING MODAL                       */}
      {/* ========================================================================= */}
      {showRegisterModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-5 sm:p-6 border border-[#D1D7DB] relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setShowRegisterModal(false);
                setRegError(null);
                setRegSuccess(null);
              }}
              className="absolute right-4 top-4 text-[#8696A0] hover:text-[#111B21] p-1 rounded-lg hover:bg-[#F7F5F2] cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-lg bg-[#075E54] flex items-center justify-center text-white shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#111B21] flex items-center gap-1.5">
                  <span>Register Business Workspace</span>
                  <span className="text-[10px] bg-[#DCF8C6] text-[#075E54] font-bold px-2 py-0.5 rounded-full border border-[#B3EBA0]">
                    14 Days Free
                  </span>
                </h3>
                <p className="text-xs text-[#667781]">
                  Launch your retail store on SLATE POS with full offline support.
                </p>
              </div>
            </div>

            {regError && (
              <div
                role="alert"
                className="mb-3 p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{regError}</span>
              </div>
            )}

            {regSuccess ? (
              <div className="py-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#DCF8C6] text-[#075E54] flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-bold text-[#111B21]">Workspace Ready!</h4>
                <p className="text-xs text-[#667781] max-w-sm mx-auto">{regSuccess}</p>
              </div>
            ) : (
              <form onSubmit={handleRegisterBusiness} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#111B21] mb-1">
                      Business / Store Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={regBusinessName}
                      onChange={(e) => setRegBusinessName(e.target.value)}
                      placeholder="e.g. Metro Mart"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-[#D1D7DB] rounded-lg text-[#111B21] placeholder:text-[#8696A0] focus:border-[#075E54] focus:ring-1 focus:ring-[#075E54] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#111B21] mb-1">
                      Owner Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder="e.g. Ramesh Kumar"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-[#D1D7DB] rounded-lg text-[#111B21] placeholder:text-[#8696A0] focus:border-[#075E54] focus:ring-1 focus:ring-[#075E54] outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#111B21] mb-1">
                      Work Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="owner@store.in"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-[#D1D7DB] rounded-lg text-[#111B21] placeholder:text-[#8696A0] focus:border-[#075E54] focus:ring-1 focus:ring-[#075E54] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#111B21] mb-1">
                      Create Password (Min 8 chars) *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-[#D1D7DB] rounded-lg text-[#111B21] placeholder:text-[#8696A0] focus:border-[#075E54] focus:ring-1 focus:ring-[#075E54] outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#111B21] mb-1">
                      State (GST Jurisdiction)
                    </label>
                    <select
                      value={regState}
                      onChange={(e) => setRegState(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-[#D1D7DB] rounded-lg text-[#111B21] focus:border-[#075E54] focus:ring-1 focus:ring-[#075E54] outline-none"
                    >
                      <option value="Karnataka">Karnataka (29)</option>
                      <option value="Maharashtra">Maharashtra (27)</option>
                      <option value="Tamil Nadu">Tamil Nadu (33)</option>
                      <option value="Delhi">Delhi (07)</option>
                      <option value="Gujarat">Gujarat (24)</option>
                      <option value="Telangana">Telangana (36)</option>
                      <option value="Kerala">Kerala (32)</option>
                      <option value="Other State">Other State / UT</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#111B21] mb-1">
                      GSTIN (Optional for Unregistered)
                    </label>
                    <input
                      type="text"
                      maxLength={15}
                      value={regGstin}
                      onChange={(e) => setRegGstin(e.target.value.toUpperCase())}
                      placeholder="29AAAAA0000A1Z5"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-[#D1D7DB] rounded-lg text-[#111B21] placeholder:text-[#8696A0] focus:border-[#075E54] focus:ring-1 focus:ring-[#075E54] outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#111B21] mb-1">
                    Contact Phone Number
                  </label>
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="+91 98450 00000"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-[#D1D7DB] rounded-lg text-[#111B21] placeholder:text-[#8696A0] focus:border-[#075E54] focus:ring-1 focus:ring-[#075E54] outline-none"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#E9EDEF]">
                  <button
                    type="button"
                    onClick={() => setShowRegisterModal(false)}
                    className="px-3 py-1.5 text-xs text-[#667781] hover:bg-[#F7F5F2] font-semibold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={regLoading}
                    className="px-4 py-2 bg-[#075E54] hover:bg-[#064E46] text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {regLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Creating Workspace...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Start 14-Day Free Trial</span>
                      </>
                    )}
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

