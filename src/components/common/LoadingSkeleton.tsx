/**
 * SLATE POS — Shared Loading Skeleton, Empty State & Retryable Error State Primitives
 * Compliant with Venice Blue (#16587B), Rock Blue (#84B3CE) & Merino (#F5EEDD).
 */

import React from 'react';
import { AlertTriangle, RefreshCw, Inbox } from 'lucide-react';

export const CardSkeletonGrid: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5" aria-busy="true" aria-label="Loading summary metrics">
    {Array.from({ length: count }).map((_, idx) => (
      <div
        key={idx}
        className="bg-white rounded-xl p-4 border border-[#D1D7DB] shadow-2xs animate-pulse space-y-2.5"
      >
        <div className="h-3 w-28 bg-[#84B3CE]/25 rounded" />
        <div className="h-7 w-36 bg-[#16587B]/15 rounded" />
        <div className="h-2.5 w-24 bg-[#E9EDEF] rounded" />
      </div>
    ))}
  </div>
);

export const TableRowSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 6 }) => (
  <div className="p-4 space-y-3" aria-busy="true" aria-label="Loading table rows">
    {Array.from({ length: rows }).map((_, rIdx) => (
      <div key={rIdx} className="grid gap-3 animate-pulse" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }).map((__, cIdx) => (
          <div key={cIdx} className="h-4 bg-[#E9EDEF] rounded" />
        ))}
      </div>
    ))}
  </div>
);

export const ModuleEmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}> = ({ title, description, actionLabel, onAction, icon }) => (
  <div className="py-12 px-4 text-center flex flex-col items-center justify-center max-w-md mx-auto">
    <div className="w-12 h-12 rounded-full bg-[#FAF6EC] border border-[#D1D7DB] flex items-center justify-center text-[#16587B] mb-3">
      {icon || <Inbox className="w-6 h-6" />}
    </div>
    <h3 className="text-sm font-bold text-[#111B21]">{title}</h3>
    <p className="text-xs text-[#405D6D] mt-1 leading-relaxed">{description}</p>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-4 px-4 py-2 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-2xs"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export const InlineErrorState: React.FC<{
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}> = ({ message, onRetry, onDismiss }) => (
  <div
    role="alert"
    className="p-3.5 rounded-lg text-xs font-medium flex flex-wrap items-center justify-between gap-2 border bg-red-50 text-red-800 border-red-200"
  >
    <div className="flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
      <span>{message}</span>
    </div>
    <div className="flex items-center gap-2">
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-2.5 py-1 bg-white border border-red-300 hover:bg-red-100 text-red-800 rounded font-bold text-[11px] flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Retry</span>
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="px-2 py-1 text-red-700 hover:underline font-semibold text-[11px] cursor-pointer"
        >
          Dismiss
        </button>
      )}
    </div>
  </div>
);
