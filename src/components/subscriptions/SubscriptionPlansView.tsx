/**
 * SLATE POS — SaaS Subscription Plans & Entitlements (Commercial Edition)
 * Configurable Starter, Growth & Enterprise plans in INR with 18% GST calculation,
 * trusted server-side checkout resolution, and Razorpay Subscriptions integration.
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6 / #ECE5DD / #D1D7DB)
 */

import React, { useState, useEffect } from 'react';
import { INITIAL_SUBSCRIPTION_PLANS, INITIAL_ORGANIZATION } from '../../lib/initialData';
import { formatINR } from '../../lib/formatters';
import { offlineStore } from '../../lib/offlineStore';
import { getSupabaseSession } from '../../lib/supabaseClient';
import {
  CreditCard,
  CheckCircle2,
  Zap,
  Building,
  ShieldCheck,
  RotateCw,
  AlertTriangle,
  Calendar,
  XCircle,
} from 'lucide-react';

interface ActiveSubscriptionState {
  planId: string;
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED' | 'TRIALING' | 'PENDING';
  billingInterval: 'MONTHLY' | 'ANNUAL';
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export const SubscriptionPlansView: React.FC = () => {
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [activePlanId, setActivePlanId] = useState(INITIAL_ORGANIZATION.subscriptionPlanId);
  const [subscriptionState, setSubscriptionState] = useState<ActiveSubscriptionState>({
    planId: INITIAL_ORGANIZATION.subscriptionPlanId,
    status: 'ACTIVE',
    billingInterval: 'MONTHLY',
    currentPeriodEnd: new Date(Date.now() + 28 * 86400000).toISOString(),
    cancelAtPeriodEnd: false,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Fetch live server-side subscription on mount using verified session token
  useEffect(() => {
    async function loadSubscription() {
      try {
        const { session } = await getSupabaseSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const res = await fetch('/api/subscriptions', { headers });
        if (res.ok) {
          const json = await res.json();
          if (json.status === 'success' && json.data?.subscription) {
            const sub = json.data.subscription;
            setActivePlanId(sub.planId);
            setSubscriptionState({
              planId: sub.planId,
              status: sub.status || 'ACTIVE',
              billingInterval: sub.billingInterval || 'MONTHLY',
              currentPeriodEnd: sub.currentPeriodEnd,
              cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
            });
          }
        }
      } catch {
        // Fallback to local offline state
      }
    }

    loadSubscription();
  }, []);

  // Secure Server-Side Checkout Initiation
  const handleUpgradePlan = async (planId: string) => {
    setIsProcessing(true);
    setActionMessage({ text: 'Initiating trusted server-side checkout session...', type: 'info' });

    try {
      const { session } = await getSupabaseSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          planId,
          billingInterval: billingCycle,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Checkout creation rejected by server');
      }

      const checkoutData = json.data;

      // If Razorpay SDK is loaded on window, open the authentic hosted checkout modal
      if (typeof window !== 'undefined' && (window as any).Razorpay && checkoutData.keyId) {
        const rzp = new (window as any).Razorpay({
          key: checkoutData.keyId,
          amount: checkoutData.amount,
          currency: 'INR',
          name: 'SLATE POS Commercial',
          description: `${checkoutData.plan.name} Retail Subscription`,
          order_id: checkoutData.orderId,
          prefill: checkoutData.prefill,
          notes: checkoutData.notes,
          handler: function (response: any) {
            setActionMessage({
              text: `Payment authorized (${response.razorpay_payment_id || response.razorpay_order_id}). Entitlement will activate upon verified webhook reconciliation.`,
              type: 'success',
            });
          },
          modal: {
            ondismiss: function () {
              setActionMessage({
                text: 'Payment checkout closed by user.',
                type: 'info',
              });
            },
          },
        });
        rzp.open();
      } else {
        // Sandbox / Staging notification
        setActionMessage({
          text: `Checkout order ${checkoutData.orderId} initialized for ${checkoutData.plan.name} (Total: ₹${checkoutData.displayAmount} incl. 18% GST). Gateway authentication session active.`,
          type: 'success',
        });
      }
    } catch (err: any) {
      setActionMessage({ text: `Checkout failed: ${err.message}`, type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelAtPeriodEnd = async () => {
    setIsProcessing(true);
    try {
      const { session } = await getSupabaseSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch('/api/subscriptions', {
        method: 'DELETE',
        headers,
      });

      if (res.ok) {
        setSubscriptionState((prev) => ({ ...prev, cancelAtPeriodEnd: true }));
        setActionMessage({
          text: 'Subscription scheduled for cancellation at the end of the current billing period. POS history and data are preserved.',
          type: 'info',
        });
      } else {
        const json = await res.json().catch(() => ({}));
        setActionMessage({
          text: json.message || 'Failed to cancel subscription.',
          type: 'error',
        });
      }
    } catch (err: any) {
      setActionMessage({ text: `Cancellation error: ${err.message}`, type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Bar with Real Organization Subscription Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-[#D1D7DB] shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold text-[#111B21]">SaaS Subscription &amp; Business Entitlements</h1>
            <span
              className={`text-xs tabular-nums px-2.5 py-0.5 rounded font-bold border ${
                subscriptionState.status === 'ACTIVE'
                  ? 'text-[#075E54] bg-[#DCF8C6] border-[#B3EBA0]'
                  : 'text-amber-800 bg-amber-50 border-amber-300'
              }`}
            >
              Status: {subscriptionState.status}
            </span>
            {subscriptionState.cancelAtPeriodEnd && (
              <span className="text-xs text-rose-800 bg-rose-50 px-2.5 py-0.5 rounded font-medium border border-rose-200">
                Cancels at Period End
              </span>
            )}
          </div>
          <p className="text-xs text-[#667781] mt-1 flex items-center gap-2 flex-wrap">
            <span>Organization: <strong>{offlineStore.getOrganization().name || offlineStore.getOrganization().tradeName}</strong></span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-[#075E54]" />
              Renewal Date: {new Date(subscriptionState.currentPeriodEnd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </p>
        </div>

        {/* Monthly vs Annual Toggle */}
        <div className="flex items-center gap-1 p-1 bg-[#F7F5F2] border border-[#D1D7DB] rounded-md shrink-0">
          <button
            onClick={() => setBillingCycle('MONTHLY')}
            className={`px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer ${
              billingCycle === 'MONTHLY' ? 'bg-white text-[#075E54] shadow-2xs' : 'text-[#667781]'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('ANNUAL')}
            className={`px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer ${
              billingCycle === 'ANNUAL' ? 'bg-white text-[#075E54] shadow-2xs' : 'text-[#667781]'
            }`}
          >
            Annual (Save 17%)
          </button>
        </div>
      </div>

      {/* Action / Notification Banner */}
      {actionMessage && (
        <div
          role="alert"
          className={`p-3 rounded-lg text-xs flex items-center justify-between border ${
            actionMessage.type === 'success'
              ? 'bg-[#DCF8C6]/50 text-[#075E54] border-[#B3EBA0]'
              : actionMessage.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-blue-50 text-blue-800 border-blue-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#075E54] shrink-0" />
            ) : actionMessage.type === 'error' ? (
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs font-bold hover:underline ml-3 cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2. Plan Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {INITIAL_SUBSCRIPTION_PLANS.map((plan) => {
          const isCurrent = plan.id === activePlanId || activePlanId.startsWith(plan.id);
          const price = billingCycle === 'MONTHLY' ? plan.monthlyPrice : Math.round(plan.annualPrice / 12);
          const gstAmount = Math.round(price * 0.18);

          return (
            <div
              key={plan.id}
              className={`bg-white rounded-lg border p-6 flex flex-col justify-between transition-all shadow-2xs ${
                plan.isPopular
                  ? 'border-[#075E54] ring-2 ring-[#075E54]/20 relative'
                  : 'border-[#D1D7DB]'
              }`}
            >
              {plan.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#075E54] text-white text-[10px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full shadow-xs">
                  Recommended for Retail Chains
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-[#111B21]">{plan.name}</h3>
                  {isCurrent && (
                    <span className="text-[10px] tabular-nums bg-[#DCF8C6] text-[#075E54] px-2 py-0.5 rounded font-bold border border-[#B3EBA0]">
                      Current Plan
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#667781] mt-1">{plan.tagline}</p>

                {/* Price Display */}
                <div className="mt-4 pt-4 border-t border-[#E9EDEF]">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-[#111B21] tabular-nums">
                      {formatINR(price, { showDecimals: false })}
                    </span>
                    <span className="text-xs text-[#667781]">/ month</span>
                  </div>
                  <div className="text-[11px] text-[#667781] mt-0.5">
                    + ₹{gstAmount} GST (18%) · Billed {billingCycle.toLowerCase()}
                  </div>
                </div>

                {/* Entitlement Quotas */}
                <div className="mt-4 space-y-1.5 text-xs text-[#111B21] bg-[#F7F5F2] p-3 rounded border border-[#D1D7DB]">
                  <div className="flex justify-between">
                    <span>Retail Branches:</span>
                    <span className="font-bold text-[#075E54]">{plan.maxBranches} Outlets</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Staff User Logins:</span>
                    <span className="font-bold text-[#075E54]">{plan.maxUsers} Users</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Offline Terminals:</span>
                    <span className="font-bold text-[#075E54]">{plan.maxOfflineTerminals} Counters</span>
                  </div>
                </div>

                {/* Feature Bullet List */}
                <div className="mt-5 space-y-2 text-xs">
                  {plan.features.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-[#3B4A54]">
                      <CheckCircle2 className="w-4 h-4 text-[#075E54] shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-6 pt-4 border-t border-[#E9EDEF]">
                <button
                  onClick={() => handleUpgradePlan(plan.id)}
                  disabled={isProcessing || isCurrent}
                  className={`w-full py-2.5 rounded text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                    isCurrent
                      ? 'bg-[#DCF8C6]/60 text-[#075E54] border border-[#B3EBA0] cursor-default'
                      : 'bg-[#075E54] hover:bg-[#128C7E] text-white shadow-2xs'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Securing Session...</span>
                    </>
                  ) : isCurrent ? (
                    <span>Plan Active</span>
                  ) : (
                    <span>Switch to {plan.name}</span>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Subscription Management Footer */}
      <div className="bg-white p-4 rounded-lg border border-[#D1D7DB] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="text-[#667781]">
          <span>Need to modify billing frequency or request custom multi-location franchise billing? </span>
          <span className="text-[#111B21] font-semibold">Contact Enterprise Sales</span>
        </div>
        {!subscriptionState.cancelAtPeriodEnd && (
          <button
            onClick={handleCancelAtPeriodEnd}
            disabled={isProcessing}
            className="text-rose-700 hover:text-rose-900 font-semibold hover:underline cursor-pointer shrink-0"
          >
            Cancel at end of billing cycle
          </button>
        )}
      </div>
    </div>
  );
};
