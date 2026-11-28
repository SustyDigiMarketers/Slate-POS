/**
 * SLATE POS — Full-Screen Animated Splash Screen
 * - Entire device screen occupied by Venice Blue (#16587B) animation.
 * - Uses centralized 500x500 PNG company logo asset.
 * - Zero text, zero progress bars, zero version info, zero taglines.
 * - Respects prefers-reduced-motion.
 * - Smooth fade-out transition into login or authenticated session.
 */

import React, { useState, useEffect, useRef } from 'react';
import { offlineStore } from '../../lib/offlineStore';
import { getActiveBrandLogoUrl } from '../../lib/branding';

interface SplashScreenProps {
  onFinish: () => void;
  maxDurationMs?: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  maxDurationMs = 2000,
}) => {
  const [isExiting, setIsExiting] = useState(false);
  const [logoUrl, setLogoUrl] = useState(() =>
    getActiveBrandLogoUrl(offlineStore.getOrganization())
  );
  const hasFinishedRef = useRef(false);

  const completeSplash = () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    setIsExiting(true);
    setTimeout(() => {
      onFinish();
    }, 400);
  };

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setLogoUrl(getActiveBrandLogoUrl(offlineStore.getOrganization()));
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (motionQuery.matches) {
        const reducedTimer = setTimeout(() => {
          completeSplash();
        }, 300);
        return () => clearTimeout(reducedTimer);
      }
    }

    const maxTimer = setTimeout(() => {
      completeSplash();
    }, maxDurationMs);

    return () => {
      clearTimeout(maxTimer);
    };
  }, [maxDurationMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="SLATE POS loading"
      className={`fixed inset-0 z-[9999] h-screen h-[100dvh] w-full flex items-center justify-center bg-[#16587B] select-none overflow-hidden transition-all duration-500 ease-in-out ${
        isExiting ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Background ambient radial glow */}
      <div className="absolute inset-0 bg-radial from-[#84B3CE]/30 via-transparent to-[#0F405B]/80 pointer-events-none" />

      {/* Centered Centralized Brand Logo Animation (Zero Text) */}
      <div className="relative flex items-center justify-center">
        <div className="absolute w-40 h-40 sm:w-52 sm:h-52 rounded-full border border-[#F5EEDD]/25 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" />
        <div className="absolute w-28 h-28 sm:w-36 sm:h-36 rounded-full border border-[#84B3CE]/55 animate-[pulse_1.6s_ease-in-out_infinite]" />

        <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-3xl bg-[#124866]/85 border border-[#84B3CE]/45 shadow-2xl flex items-center justify-center p-3 animate-[pulse_2s_ease-in-out_infinite]">
          <img
            src={logoUrl}
            alt="SLATE POS"
            className="w-full h-full object-contain rounded-2xl"
          />
        </div>
      </div>
    </div>
  );
};
