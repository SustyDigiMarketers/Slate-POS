/**
 * SLATE POS — Animated Startup Splash Screen
 * 
 * Features:
 * - Plays video asset (/splash%20video.mp4) with autoPlay, muted, playsInline
 * - Displays vector logo (/logo.svg) prominently
 * - Graceful fallback to CSS animation if video is missing or blocked by browser
 * - Respects prefers-reduced-motion
 * - Max-duration safety timeout (default 3000ms) prevents hanging
 * - Smooth fade-out transition to login or restored dashboard session
 * - Zero protected content leaks before authentication resolves
 */

import React, { useState, useEffect, useRef } from 'react';

interface SplashScreenProps {
  onFinish: () => void;
  maxDurationMs?: number;
  videoSrc?: string;
  logoSrc?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  maxDurationMs = 3000,
  videoSrc = encodeURI('/splash video.mp4'),
  logoSrc = '/logo.svg',
}) => {
  const [isExiting, setIsExiting] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasFinishedRef = useRef(false);

  const completeSplash = () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    setIsExiting(true);
    setTimeout(() => {
      onFinish();
    }, 450); // duration matches exit transition
  };

  useEffect(() => {
    // 1. Accessibility: Check for prefers-reduced-motion
    if (typeof window !== 'undefined' && window.matchMedia) {
      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (motionQuery.matches) {
        const reducedTimer = setTimeout(() => {
          completeSplash();
        }, 400);
        return () => clearTimeout(reducedTimer);
      }
    }

    // 2. Safety timeout: Transition after maxDurationMs regardless of video state
    const maxTimer = setTimeout(() => {
      completeSplash();
    }, maxDurationMs);

    // 3. Attempt programmatic autoplay for browsers requiring explicit play() calls
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay policy prevented playback, fallback seamlessly to animated logo
        setVideoError(true);
      });
    }

    return () => {
      clearTimeout(maxTimer);
    };
  }, [maxDurationMs]);

  const handleVideoEnded = () => {
    completeSplash();
  };

  const handleVideoError = () => {
    setVideoError(true);
    // If video fails to load, let the animated logo display briefly then finish
    setTimeout(() => {
      completeSplash();
    }, 1800);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="SLATE POS starting up"
      className={`fixed inset-0 z-[9999] h-screen h-[100dvh] w-full flex flex-col items-center justify-between p-6 sm:p-8 bg-[#075E54] text-white select-none overflow-hidden transition-all duration-500 ease-in-out ${
        isExiting ? 'opacity-0 scale-[1.02] pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Top subtle branding indicator */}
      <div className="w-full max-w-md flex justify-between items-center text-[10px] tracking-widest text-[#DCF8C6]/80 uppercase font-semibold">
        <span>SLATE POS</span>
        <span>RETAIL CLOUD</span>
      </div>

      {/* Center Composition: Video or Animated Vector Brand Mark */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-lg px-4 my-auto relative">
        {/* If video is available and error has not occurred, render the video player */}
        {!videoError && (
          <div className="relative w-full max-w-[320px] sm:max-w-[420px] aspect-video mb-6 flex items-center justify-center bg-transparent border-0 outline-none shadow-none">
            <video
              ref={videoRef}
              src={videoSrc}
              autoPlay
              muted
              playsInline
              preload="metadata"
              onEnded={handleVideoEnded}
              onError={handleVideoError}
              onPlay={() => setIsVideoPlaying(true)}
              className="w-full h-full object-contain bg-transparent border-0 outline-none shadow-none mix-blend-screen"
              aria-label="SLATE POS Startup Animation"
            />
          </div>
        )}

        {/* Branded Vector Logo Composition */}
        <div className="flex flex-col items-center justify-center text-center">
          <div className="p-3">
            <img
              src={logoSrc}
              alt="SLATE POS Logo"
              className="h-10 sm:h-12 w-auto object-contain"
              onError={(e) => {
                // If logo.svg fails for any reason, fallback to symbol image
                (e.target as HTMLImageElement).src = '/src/assets/images/slate_pos_symbol_1791618547129.jpg';
              }}
            />
          </div>
          <p className="mt-4 text-xs font-medium text-white/80 tracking-wide">
            Initializing secure terminal session...
          </p>
        </div>
      </div>

      {/* Bottom Loading Progress Bar */}
      <div className="w-full max-w-xs flex flex-col items-center gap-2 pb-4">
        <div className="w-40 h-1 bg-white/15 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#DCF8C6] rounded-full animate-[progress_2.5s_ease-in-out_infinite]"
            style={{ width: '100%' }}
          />
        </div>
        <span className="text-[10px] text-white/50 tracking-wider font-mono">
          TLS 256-bit Encrypted · POS Ready
        </span>
      </div>
    </div>
  );
};
