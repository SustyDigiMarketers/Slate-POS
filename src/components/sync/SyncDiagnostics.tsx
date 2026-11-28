/**
 * SLATE POS — Durable Outbox Sync & Windows Desktop Diagnostics
 * Queue monitoring, idempotency validation, local SQLite/JSON backup, and offline network simulation
 * Styled with SLATE POS Theme (#16587B / #84B3CE / #F5EEDD)
 */

import React, { useState, useEffect } from 'react';
import { SyncOutboxItem } from '../../types';
import { offlineStore } from '../../lib/offlineStore';
import { formatDate } from '../../lib/formatters';
import { THEME } from '../../lib/theme';
import {
  Cloud,
  RefreshCw,
  Wifi,
  WifiOff,
  HardDrive,
  Download,
  AlertTriangle,
  CheckCircle2,
  Code,
  RotateCcw,
  X,
  Database,
} from 'lucide-react';
import { isSupabaseConfigured, getSupabaseConfigStatus } from '../../lib/supabaseClient';

export const SyncDiagnostics: React.FC = () => {
  const [outbox, setOutbox] = useState<SyncOutboxItem[]>(offlineStore.getSyncOutbox());
  const [isOffline, setIsOffline] = useState(offlineStore.isOffline());
  const [lastSyncError, setLastSyncError] = useState<string | null>(offlineStore.getLastSyncError());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);
  const [selectedPayload, setSelectedPayload] = useState<any | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const dbStatus = getSupabaseConfigStatus();
  const device = offlineStore.getDeviceRegistration();

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setOutbox(offlineStore.getSyncOutbox());
      setIsOffline(offlineStore.isOffline());
      setLastSyncError(offlineStore.getLastSyncError());
    });
    return unsub;
  }, []);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setBanner(null);
    try {
      const result = await offlineStore.synchronizeOutbox();
      setBanner({
        type: result.errors > 0 ? 'error' : 'success',
        text: `Sync completed. Successfully synced: ${result.syncedCount} events. Errors: ${result.errors}`,
      });
    } catch (e: any) {
      setBanner({
        type: 'error',
        text: `Sync error: ${e.message}`,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFetchCloudData = async () => {
    setIsHydrating(true);
    setBanner(null);
    try {
      const result = await offlineStore.hydrateFromSupabase();
      if (result.success) {
        setBanner({
          type: 'success',
          text: `Successfully fetched and merged ${result.loadedCount} persistent records from Supabase PostgreSQL.`,
        });
      } else {
        setBanner({
          type: 'info',
          text: 'Supabase is not configured, or current terminal is offline.',
        });
      }
    } catch (e: any) {
      setBanner({
        type: 'error',
        text: `Cloud sync error: ${e.message}`,
      });
    } finally {
      setIsHydrating(false);
    }
  };

  const handleExportBackup = () => {
    const dump = offlineStore.exportDatabaseDump();
    const blob = new Blob([dump], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slate_pos_backup_${device.terminalCode}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleResetFactory = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    offlineStore.resetToFactorySeed();
    setConfirmReset(false);
    setBanner({
      type: 'info',
      text: 'Local workspace cache reset cleanly.',
    });
  };

  const pendingCount = outbox.filter((i) => i.status === 'PENDING' || i.status === 'CONFLICT').length;
  const syncedCount = outbox.filter((i) => i.status === 'SYNCED').length;

  return (
    <div className="space-y-6">
      {/* Supabase PostgreSQL Integration Status Banner */}
      <div className={`p-4 rounded-lg border flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs ${
        dbStatus.isConfigured
          ? 'bg-[#84B3CE]/20 border-[#84B3CE] text-[#0F2D3D]'
          : 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
      }`}>
        <div className="flex items-center gap-3">
          <Database className={`w-5 h-5 shrink-0 ${dbStatus.isConfigured ? 'text-[#16587B]' : 'text-[#D97706]'}`} />
          <div>
            <div className="text-sm font-bold flex items-center gap-2">
              <span>Database Backend: {dbStatus.isConfigured ? 'Supabase PostgreSQL (Connected)' : 'Local SQLite/Storage (Offline Mode)'}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                dbStatus.isConfigured ? 'bg-[#16587B] text-white border border-[#124866]' : 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]'
              }`}>
                {dbStatus.isConfigured ? 'Remote PostgreSQL' : 'Local Durable'}
              </span>
            </div>
            <p className="text-xs opacity-90 mt-0.5">
              {dbStatus.isConfigured
                ? 'All transactions, products, customers, and inventory synchronize atomically with PostgreSQL migrations.'
                : dbStatus.message}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {dbStatus.isConfigured && (
            <button
              onClick={handleFetchCloudData}
              disabled={isHydrating || isOffline}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                isOffline
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-[#16587B] hover:bg-[#124866] text-white shadow-2xs'
              }`}
            >
              <Download className={`w-3.5 h-3.5 ${isHydrating ? 'animate-bounce' : ''}`} />
              <span>{isHydrating ? 'Hydrating...' : 'Pull Cloud Database'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline Sync Action Banner */}
      {banner && (
        <div
          className={`p-3.5 rounded-lg border text-xs font-semibold flex items-center justify-between gap-3 ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : banner.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          <span>{banner.text}</span>
          <button
            onClick={() => setBanner(null)}
            className="text-current opacity-75 hover:opacity-100 cursor-pointer shrink-0"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Last Cloud Sync Error Banner */}
      {lastSyncError && (
        <div className="p-3.5 rounded-lg border bg-rose-50 border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="truncate font-semibold">Last Cloud Sync Error: {lastSyncError}</span>
          </div>
          <button
            onClick={() => offlineStore.clearLastSyncError()}
            className="px-2 py-1 text-[11px] font-bold bg-white border border-rose-200 rounded hover:bg-rose-100 cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-[#D1D7DB] shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-[#111B21] flex items-center gap-2">
            <span>Durable Sync Outbox &amp; Diagnostics</span>
            <span className="text-xs tabular-nums text-[#16587B] bg-[#84B3CE]/25 px-2 py-0.5 rounded font-bold border border-[#84B3CE]/60">
              {outbox.length} Events Total
            </span>
          </h1>
          <p className="text-xs text-[#667781] mt-0.5">
            Idempotent transactional outbox queue, local SQLite storage telemetry, and conflict resolution.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => offlineStore.toggleSimulatedOffline()}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md border transition-colors cursor-pointer ${
              isOffline
                ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]'
                : 'bg-[#84B3CE]/25 text-[#16587B] border-[#84B3CE]'
            }`}
          >
            {isOffline ? <WifiOff className="w-4 h-4 text-[#D97706]" /> : <Wifi className="w-4 h-4 text-[#16587B]" />}
            <span>{isOffline ? 'Simulating Offline' : 'Connected (Online)'}</span>
          </button>

          <button
            onClick={handleSyncNow}
            disabled={isSyncing || isOffline}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-md shadow-2xs transition-colors cursor-pointer ${
              isOffline
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-[#16587B] hover:bg-[#124866] text-white'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Trigger Sync Now</span>
          </button>
        </div>
      </div>

      {/* Device Registration & Hardware Identity Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-[#D1D7DB] shadow-2xs">
          <div className="text-xs text-[#667781] mb-1">Terminal ID &amp; Host</div>
          <div className="text-sm font-bold text-[#111B21] tabular-nums">{device.terminalCode}</div>
          <div className="text-[11px] text-[#667781] tabular-nums mt-0.5">{device.hostMachine}</div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-[#D1D7DB] shadow-2xs">
          <div className="text-xs text-[#667781] mb-1">Operating System Shell</div>
          <div className="text-sm font-bold text-[#111B21]">{device.osRelease}</div>
          <div className="text-[11px] text-[#667781] tabular-nums mt-0.5">{device.platform}</div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-[#D1D7DB] shadow-2xs">
          <div className="text-xs text-[#667781] mb-1">Outbox Queue Status</div>
          <div className="text-sm font-bold text-[#111B21] tabular-nums">
            <span className="text-[#92400E] font-extrabold">{pendingCount}</span> Queued / <span className="text-[#16587B] font-bold">{syncedCount}</span> Synced
          </div>
          <div className="text-[11px] text-[#667781] mt-0.5">At-least-once idempotent delivery</div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-[#D1D7DB] shadow-2xs">
          <div className="text-xs text-[#667781] mb-1">Database Backup &amp; Recovery</div>
          {!confirmReset ? (
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={handleExportBackup}
                className="flex-1 py-1 px-2 bg-[#FAF6EC] hover:bg-[#F5EEDD] text-[#111B21] rounded text-xs font-semibold border border-[#D1D7DB] transition-colors cursor-pointer"
              >
                Export JSON
              </button>
              <button
                onClick={handleResetFactory}
                className="py-1 px-2 bg-[#FEE2E2] hover:bg-[#FECACA] text-[#B91C1C] rounded text-xs font-semibold border border-[#FECACA] transition-colors cursor-pointer"
                title="Reset local workspace cache"
              >
                Reset Cache
              </button>
            </div>
          ) : (
            <div className="mt-1 space-y-1.5">
              <div className="text-[11px] font-semibold text-rose-700">Clear unsynced local cache?</div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleResetFactory}
                  className="flex-1 py-1 px-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-bold cursor-pointer"
                >
                  Confirm Reset
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="py-1 px-2 bg-[#FAF6EC] hover:bg-[#F5EEDD] text-[#111B21] rounded text-[11px] font-semibold border border-[#D1D7DB] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transactional Outbox Events Table */}
      <div className="bg-white rounded-lg border border-[#D1D7DB] overflow-hidden shadow-2xs">
        <div className="px-5 py-3.5 border-b border-[#D1D7DB] bg-[#FAF6EC] flex items-center justify-between">
          <h2 className="text-xs font-bold text-[#111B21] uppercase tracking-wider">
            Durable Outbox Queue (Ordered FIFO)
          </h2>
          <span className="text-xs text-[#667781] tabular-nums">
            Device Fingerprint: {device.deviceId}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF6EC] text-[#3B4A54] border-b border-[#D1D7DB]">
              <tr>
                <th className="py-2.5 px-4 font-bold">Event ID &amp; Type</th>
                <th className="py-2.5 px-4 font-bold">Created At</th>
                <th className="py-2.5 px-4 font-bold">Entity ID</th>
                <th className="py-2.5 px-4 font-bold tabular-nums">Idempotency Key</th>
                <th className="py-2.5 px-4 font-bold text-center">Retries</th>
                <th className="py-2.5 px-4 font-bold text-center">Status</th>
                <th className="py-2.5 px-4 font-bold text-right">Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9EDEF]">
              {outbox.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#8696A0]">
                    <CheckCircle2 className="w-8 h-8 text-[#16587B] mx-auto mb-1 stroke-[1.5]" />
                    <div className="text-[#111B21] font-medium">Outbox queue is empty. All local events are fully synchronized.</div>
                  </td>
                </tr>
              ) : (
                outbox.map((item) => (
                  <tr key={item.id} className="hover:bg-[#FAF6EC] transition-colors">
                    <td className="py-2.5 px-4">
                      <div className="font-bold text-[#111B21]">{item.eventType}</div>
                      <div className="text-[10px] text-[#667781] tabular-nums">{item.eventId}</div>
                    </td>
                    <td className="py-2.5 px-4 tabular-nums text-[#3B4A54] text-[11px]">
                      {formatDate(item.createdAt, true)}
                    </td>
                    <td className="py-2.5 px-4 tabular-nums text-[#111B21] text-[11px]">
                      {item.entityId}
                    </td>
                    <td className="py-2.5 px-4 tabular-nums text-[#667781] text-[11px]">
                      {item.idempotencyKey}
                    </td>
                    <td className="py-2.5 px-4 text-center tabular-nums text-[#111B21]">
                      {item.retryCount}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span
                        className={`text-[10px] tabular-nums px-2 py-0.5 rounded font-bold ${
                          item.status === 'SYNCED'
                            ? 'bg-[#84B3CE]/25 text-[#16587B]'
                            : item.status === 'SYNCING'
                            ? 'bg-[#E0F2FE] text-[#0369A1] animate-pulse'
                            : 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedPayload(item.payload)}
                        className="px-2 py-1 text-[11px] text-[#16587B] hover:bg-[#84B3CE]/20 border border-[#16587B] rounded flex items-center gap-1 ml-auto cursor-pointer"
                      >
                        <Code className="w-3 h-3" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* JSON PAYLOAD INSPECTOR MODAL */}
      {selectedPayload && (
        <div className="fixed inset-0 bg-[#0F405B]/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#16587B] text-white rounded-lg shadow-xl border border-[#0F405B] w-full max-w-xl p-5 space-y-3 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-[#0F405B]">
              <h3 className="text-sm tabular-nums font-bold text-white">Event Payload Inspector</h3>
              <button onClick={() => setSelectedPayload(null)} className="text-[#84B3CE] hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="flex-1 overflow-y-auto tabular-nums text-xs text-[#F5EEDD] bg-[#0F405B] p-3 rounded border border-[#124866] leading-relaxed">
              {JSON.stringify(selectedPayload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
