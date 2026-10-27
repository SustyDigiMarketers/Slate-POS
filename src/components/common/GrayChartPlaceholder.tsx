import React from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart,
  RefreshCw,
  AlertCircle,
  Activity,
  Layers,
} from 'lucide-react';

export type GrayChartVariant =
  | 'area'
  | 'line'
  | 'bar'
  | 'horizontal-bar'
  | 'donut'
  | 'comparative-bar'
  | 'sparkline';

export interface GrayChartPlaceholderProps {
  height?: number | string;
  title?: string;
  message?: string;
  subtext?: string;
  variant?: GrayChartVariant;
  /** Legacy alias for variant */
  type?: GrayChartVariant;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

/**
 * SLATE POS — Premium Neutral Gray Placeholder Design System
 * 
 * Strict Grayscale Palette:
 * - Main surface: #FAFAFA
 * - Border and gridlines: #E5E7EB
 * - Placeholder bars and silhouettes: #D1D5DB
 * - Secondary labels: #9CA3AF
 * - Muted text: #6B7280
 */
export const GrayChartPlaceholder: React.FC<GrayChartPlaceholderProps> = ({
  height = 256,
  title,
  message = 'No data available yet',
  subtext = 'Transactions and records will automatically populate this visualization.',
  variant,
  type,
  isLoading = false,
  error = null,
  onRetry,
  className = '',
}) => {
  const activeVariant: GrayChartVariant = variant || type || 'area';

  const containerStyle: React.CSSProperties = {
    height: typeof height === 'number' ? `${height}px` : height,
  };

  // 1. Loading State (Restrained grayscale shimmer)
  if (isLoading) {
    return (
      <div
        style={containerStyle}
        className={`w-full relative flex flex-col justify-between p-4 bg-[#FAFAFA] border border-[#E5E7EB] rounded-lg select-none overflow-hidden ${className}`}
        aria-busy="true"
        aria-label="Loading chart data"
      >
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 bg-[#E5E7EB] rounded animate-pulse" />
          <div className="h-4 w-16 bg-[#E5E7EB] rounded animate-pulse" />
        </div>

        <div className="my-auto flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 text-[#9CA3AF] animate-spin" />
          <span className="text-xs font-medium text-[#6B7280]">
            Retrieving database records...
          </span>
        </div>

        <div className="h-2 w-full bg-[#E5E7EB] rounded overflow-hidden">
          <div className="h-full w-2/5 bg-[#D1D5DB] rounded animate-[pulse_1.5s_ease-in-out_infinite]" />
        </div>
      </div>
    );
  }

  // 2. Retryable Query Error State
  if (error) {
    return (
      <div
        style={containerStyle}
        role="alert"
        className={`w-full relative flex flex-col items-center justify-center p-6 bg-[#FAFAFA] border border-[#E5E7EB] rounded-lg select-none text-center ${className}`}
      >
        <div className="w-10 h-10 rounded-full bg-white border border-[#E5E7EB] shadow-2xs flex items-center justify-center text-rose-500 mb-2.5">
          <AlertCircle className="w-5 h-5" />
        </div>
        <h4 className="text-xs font-semibold text-[#374151] mb-1">
          Unable to Load Chart Records
        </h4>
        <p className="text-[11px] text-[#6B7280] max-w-sm mb-3.5 leading-relaxed">
          {error}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#374151] bg-white hover:bg-[#F3F4F6] border border-[#D1D7DB] rounded-md shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#6B7280]" />
            <span>Retry Query</span>
          </button>
        )}
      </div>
    );
  }

  // 3. Genuine Empty State with Restrained Decorative Silhouette
  return (
    <div
      style={containerStyle}
      className={`w-full relative flex flex-col justify-between p-4 bg-[#FAFAFA] border border-[#E5E7EB] rounded-lg select-none overflow-hidden ${className}`}
    >
      {/* Background Subtle Silhouette Skeleton (Purely Decorative) */}
      <div
        aria-hidden="true"
        className="absolute inset-x-4 inset-y-4 opacity-35 pointer-events-none flex flex-col justify-end"
      >
        {activeVariant === 'bar' && (
          <div className="w-full h-full flex items-end justify-between gap-3 pt-6 pb-3">
            <div className="w-full bg-[#E5E7EB] rounded-t h-[25%]" />
            <div className="w-full bg-[#D1D5DB] rounded-t h-[40%]" />
            <div className="w-full bg-[#E5E7EB] rounded-t h-[20%]" />
            <div className="w-full bg-[#D1D5DB] rounded-t h-[55%]" />
            <div className="w-full bg-[#E5E7EB] rounded-t h-[35%]" />
            <div className="w-full bg-[#D1D5DB] rounded-t h-[45%]" />
            <div className="w-full bg-[#E5E7EB] rounded-t h-[30%]" />
          </div>
        )}

        {activeVariant === 'comparative-bar' && (
          <div className="w-full h-full flex items-end justify-between gap-3 pt-6 pb-3">
            {[25, 45, 30, 60, 40, 50, 35].map((h, i) => (
              <div key={i} className="w-full flex items-end justify-center gap-1">
                <div style={{ height: `${h}%` }} className="w-1/2 bg-[#D1D5DB] rounded-t" />
                <div style={{ height: `${Math.max(15, h - 15)}%` }} className="w-1/2 bg-[#E5E7EB] rounded-t" />
              </div>
            ))}
          </div>
        )}

        {activeVariant === 'horizontal-bar' && (
          <div className="w-full h-full flex flex-col justify-around py-3">
            <div className="h-3.5 bg-[#E5E7EB] rounded w-[65%]" />
            <div className="h-3.5 bg-[#D1D5DB] rounded w-[80%]" />
            <div className="h-3.5 bg-[#E5E7EB] rounded w-[45%]" />
            <div className="h-3.5 bg-[#D1D5DB] rounded w-[70%]" />
            <div className="h-3.5 bg-[#E5E7EB] rounded w-[30%]" />
          </div>
        )}

        {activeVariant === 'donut' && (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-32 h-32" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="#E5E7EB"
                strokeWidth="12"
              />
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="#D1D5DB"
                strokeWidth="12"
                strokeDasharray="90 150"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}

        {activeVariant === 'sparkline' && (
          <div className="w-full h-12 flex items-end">
            <svg className="w-full h-full" viewBox="0 0 300 40" preserveAspectRatio="none">
              <path
                d="M0,35 Q40,30 80,15 T160,25 T240,10 L300,18"
                fill="none"
                stroke="#D1D5DB"
                strokeWidth="2"
                strokeDasharray="3 3"
              />
            </svg>
          </div>
        )}

        {(activeVariant === 'area' || activeVariant === 'line') && (
          <svg className="w-full h-32 text-[#D1D5DB]" viewBox="0 0 400 100" preserveAspectRatio="none">
            <path
              d="M0,80 Q50,75 100,60 T200,45 T300,50 T400,30 L400,100 L0,100 Z"
              fill="#E5E7EB"
              fillOpacity="0.5"
            />
            <path
              d="M0,80 Q50,75 100,60 T200,45 T300,50 T400,30"
              fill="none"
              stroke="#D1D5DB"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          </svg>
        )}

        {/* Grayscale baseline */}
        <div className="w-full h-px bg-[#E5E7EB]" />
      </div>

      {/* Foreground Empty State Callout */}
      <div className="relative z-10 m-auto flex flex-col items-center justify-center text-center max-w-sm px-4">
        <div className="w-10 h-10 rounded-full bg-white border border-[#E5E7EB] shadow-2xs flex items-center justify-center text-[#9CA3AF] mb-2.5">
          {activeVariant === 'donut' ? (
            <PieChart className="w-5 h-5 text-[#9CA3AF]" />
          ) : activeVariant === 'bar' || activeVariant === 'comparative-bar' || activeVariant === 'horizontal-bar' ? (
            <BarChart3 className="w-5 h-5 text-[#9CA3AF]" />
          ) : activeVariant === 'sparkline' ? (
            <Activity className="w-5 h-5 text-[#9CA3AF]" />
          ) : (
            <TrendingUp className="w-5 h-5 text-[#9CA3AF]" />
          )}
        </div>

        {title && (
          <span className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">
            {title}
          </span>
        )}

        <h4 className="text-xs font-semibold text-[#374151]">
          {message}
        </h4>

        {subtext && (
          <p className="text-[11px] text-[#9CA3AF] mt-1 leading-relaxed">
            {subtext}
          </p>
        )}
      </div>

      {/* Footer Neutral Baseline Ticks */}
      <div className="relative z-10 flex items-center justify-between text-[10px] text-[#9CA3AF] pt-2 border-t border-[#E5E7EB] font-mono">
        <span>Timeline</span>
        <span>Neutral Baseline (₹0.00)</span>
      </div>
    </div>
  );
};
