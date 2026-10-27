import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface GrayKpiCardProps {
  title: string;
  value?: string | number | null;
  subvalue?: string | null;
  subtitle?: string;
  badge?: string;
  badgeTone?: 'neutral' | 'success' | 'warning';
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

/**
 * SLATE POS — Premium Neutral Gray KPI Card Component
 * Restrained Grayscale System:
 * - Surface: #FFFFFF
 * - Border: #E5E7EB
 * - Neutral Dash / Placeholder: —
 * - Neutral labels: #6B7280 / #9CA3AF
 */
export const GrayKpiCard: React.FC<GrayKpiCardProps> = ({
  title,
  value,
  subvalue,
  subtitle,
  badge,
  badgeTone = 'neutral',
  isLoading = false,
  error = null,
  onRetry,
  className = '',
}) => {
  if (isLoading) {
    return (
      <div
        className={`bg-white p-5 rounded-lg border border-[#E5E7EB] shadow-2xs select-none animate-pulse ${className}`}
        aria-busy="true"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="h-3.5 w-24 bg-[#E5E7EB] rounded" />
          <div className="h-4 w-12 bg-[#E5E7EB] rounded" />
        </div>
        <div className="h-7 w-32 bg-[#E5E7EB] rounded my-2" />
        <div className="h-3 w-40 bg-[#E5E7EB] rounded mt-3 pt-2" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`bg-white p-5 rounded-lg border border-[#E5E7EB] shadow-2xs select-none ${className}`}
      >
        <div className="flex items-center justify-between text-xs text-[#6B7280] mb-2">
          <span className="font-medium">{title}</span>
          <AlertCircle className="w-4 h-4 text-rose-500" />
        </div>
        <div className="text-sm font-semibold text-[#374151] mt-1">
          Unavailable
        </div>
        <div className="text-[11px] text-[#9CA3AF] mt-2 flex items-center justify-between pt-2 border-t border-[#E5E7EB]">
          <span>{error}</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-[#075E54] hover:underline font-semibold cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  const isValueEmpty = value === undefined || value === null || value === '' || value === 0;

  return (
    <div className={`bg-white p-5 rounded-lg border border-[#D1D7DB] shadow-2xs ${className}`}>
      <div className="flex items-center justify-between text-xs text-[#667781] mb-2">
        <span className="font-medium">{title}</span>
        {badge ? (
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
              badgeTone === 'success'
                ? 'text-[#075E54] bg-[#DCF8C6] border-[#B3EBA0]'
                : badgeTone === 'warning'
                ? 'text-[#92400E] bg-[#FEF3C7] border-[#FDE68A]'
                : 'text-[#6B7280] bg-[#F3F4F6] border-[#E5E7EB]'
            }`}
          >
            {badge}
          </span>
        ) : isValueEmpty ? (
          <span className="text-[#9CA3AF] bg-[#F9FAFB] px-1.5 py-0.5 rounded text-[10px] border border-[#E5E7EB]">
            No data yet
          </span>
        ) : null}
      </div>

      <div className="text-2xl font-bold text-[#111B21] tabular-nums tracking-tight">
        {value !== undefined && value !== null && value !== '' ? (
          value
        ) : (
          <span className="text-[#9CA3AF] font-normal">—</span>
        )}
      </div>

      {(subtitle || subvalue) && (
        <div className="text-xs text-[#667781] mt-2 flex items-center justify-between pt-2 border-t border-[#E9EDEF]">
          <span>{subtitle || 'Details'}</span>
          <span className="tabular-nums font-semibold text-[#111B21]">
            {subvalue || '—'}
          </span>
        </div>
      )}
    </div>
  );
};
