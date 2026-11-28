/**
 * SLATE POS — Double-Entry Journal Entries Module
 * Supports Draft -> Pending Approval -> Posted -> Reversed lifecycle,
 * immutable posted entries, controlled reversal vouchers, and full GL inspection.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { offlineStore } from '../../lib/offlineStore';
import { ChartOfAccount, JournalEntry, JournalStatus } from '../../types';
import { roundMoney } from '../../lib/accountingEngine';
import {
  BookOpen,
  Plus,
  Trash2,
  CheckCircle2,
  RotateCcw,
  Eye,
  Lock,
  Search,
  Send,
  AlertCircle,
  X,
  FileText,
} from 'lucide-react';

interface DraftLine {
  key: string;
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

const fmtINR = (val: number) =>
  `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const JournalPage: React.FC = () => {
  const [journals, setJournals] = useState<JournalEntry[]>(offlineStore.getJournalEntries());
  const [accounts, setAccounts] = useState<ChartOfAccount[]>(offlineStore.getChartOfAccounts());
  const [activeUser, setActiveUser] = useState(offlineStore.getActiveUser());

  const [statusFilter, setStatusFilter] = useState<'ALL' | JournalStatus>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'MANUAL' | 'AUTOMATED'>('ALL');
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null);
  const [inspectJournal, setInspectJournal] = useState<JournalEntry | null>(null);
  const [reverseTarget, setReverseTarget] = useState<JournalEntry | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Composer State
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [referenceNumber, setReferenceNumber] = useState('');
  const [narration, setNarration] = useState('');
  const [attachmentNotes, setAttachmentNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    { key: '1', accountId: '', debit: '', credit: '', description: '' },
    { key: '2', accountId: '', debit: '', credit: '', description: '' },
  ]);

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setJournals(offlineStore.getJournalEntries());
      setAccounts(offlineStore.getChartOfAccounts());
      setActiveUser(offlineStore.getActiveUser());
    });
    return unsub;
  }, []);

  const activeAccounts = useMemo(() => accounts.filter((a) => a.isActive), [accounts]);

  const filteredJournals = useMemo(() => {
    const q = search.trim().toLowerCase();
    return journals.filter((j) => {
      if (statusFilter !== 'ALL' && j.status !== statusFilter) return false;
      if (sourceFilter === 'MANUAL' && j.sourceType !== 'MANUAL_JOURNAL') return false;
      if (sourceFilter === 'AUTOMATED' && j.sourceType === 'MANUAL_JOURNAL') return false;
      if (q) {
        const hay = `${j.journalNumber} ${j.referenceNumber || ''} ${j.narration} ${j.sourceType}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [journals, statusFilter, sourceFilter, search]);

  const totals = useMemo(() => {
    const totalDebit = roundMoney(lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0));
    const totalCredit = roundMoney(lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0));
    const diff = roundMoney(Math.abs(totalDebit - totalCredit));
    return { totalDebit, totalCredit, diff, isBalanced: totalDebit > 0 && diff <= 0.01 };
  }, [lines]);

  const metrics = useMemo(() => {
    const posted = journals.filter((j) => j.status === 'POSTED');
    const pending = journals.filter((j) => j.status === 'PENDING_APPROVAL' || j.status === 'DRAFT');
    const totalPostedVolume = roundMoney(posted.reduce((s, j) => s + j.totalDebit, 0));
    return {
      totalCount: journals.length,
      postedCount: posted.length,
      pendingCount: pending.length,
      totalPostedVolume,
    };
  }, [journals]);

  const resetComposer = () => {
    setEditingJournalId(null);
    setEntryDate(new Date().toISOString().slice(0, 10));
    setReferenceNumber('');
    setNarration('');
    setAttachmentNotes('');
    setLines([
      { key: `l_${Date.now()}_1`, accountId: activeAccounts[0]?.id || '', debit: '', credit: '', description: '' },
      { key: `l_${Date.now()}_2`, accountId: activeAccounts[1]?.id || '', debit: '', credit: '', description: '' },
    ]);
  };

  const openNewJournal = () => {
    resetComposer();
    setShowCreateModal(true);
  };

  const openEditDraft = (entry: JournalEntry) => {
    if (entry.status === 'POSTED' || entry.status === 'REVERSED') return;
    setEditingJournalId(entry.id);
    setEntryDate(entry.entryDate);
    setReferenceNumber(entry.referenceNumber || '');
    setNarration(entry.narration);
    setAttachmentNotes(entry.attachmentNotes || '');
    setLines(
      entry.lines.map((l, idx) => ({
        key: `${entry.id}_${idx}`,
        accountId: l.accountId,
        debit: l.debit > 0 ? String(l.debit) : '',
        credit: l.credit > 0 ? String(l.credit) : '',
        description: l.description || '',
      }))
    );
    setShowCreateModal(true);
  };

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      { key: `l_${Date.now()}_${prev.length}`, accountId: '', debit: '', credit: '', description: '' },
    ]);
  };

  const handleRemoveLine = (key: string) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const handleLineChange = (key: string, field: keyof DraftLine, value: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        if (field === 'debit' && value && parseFloat(value) > 0) {
          return { ...l, debit: value, credit: '' };
        }
        if (field === 'credit' && value && parseFloat(value) > 0) {
          return { ...l, credit: value, debit: '' };
        }
        return { ...l, [field]: value };
      })
    );
  };

  const handleSubmitJournal = (targetStatus: 'DRAFT' | 'PENDING_APPROVAL' | 'POSTED') => {
    setFeedback(null);
    const parsedLines = lines
      .filter((l) => l.accountId || l.debit || l.credit)
      .map((l) => ({
        accountId: l.accountId,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        description: l.description.trim() || narration.trim(),
      }));

    if (editingJournalId) {
      const updateRes = offlineStore.updateDraftJournalEntry(editingJournalId, {
        entryDate,
        referenceNumber,
        narration,
        attachmentNotes,
        lines: parsedLines,
      });
      if (!updateRes.success) {
        setFeedback({ type: 'error', text: updateRes.error || 'Failed to update draft journal.' });
        return;
      }
      if (targetStatus === 'POSTED') {
        const postRes = offlineStore.postJournalEntry(editingJournalId, activeUser.name);
        if (!postRes.success) {
          setFeedback({ type: 'error', text: postRes.error || 'Failed to post journal.' });
          return;
        }
      } else if (targetStatus === 'PENDING_APPROVAL') {
        offlineStore.submitJournalForApproval(editingJournalId);
      }
      setFeedback({ type: 'success', text: `Journal updated (${targetStatus}).` });
      setShowCreateModal(false);
      return;
    }

    const res = offlineStore.createJournalEntry({
      entryDate,
      referenceNumber,
      narration,
      attachmentNotes,
      lines: parsedLines,
      status: targetStatus,
    });

    if (!res.success) {
      setFeedback({ type: 'error', text: res.error || 'Failed to create journal entry.' });
      return;
    }

    setFeedback({
      type: 'success',
      text: `Journal ${res.journalEntry?.journalNumber} ${targetStatus === 'POSTED' ? 'posted to General Ledger' : `saved as ${targetStatus}`}.`,
    });
    setShowCreateModal(false);
  };

  const handlePostEntry = (id: string) => {
    const res = offlineStore.postJournalEntry(id, activeUser.name);
    if (!res.success) {
      setFeedback({ type: 'error', text: res.error || 'Unable to post journal entry.' });
    } else {
      setFeedback({ type: 'success', text: `Journal ${res.journalEntry?.journalNumber} approved & posted to General Ledger.` });
    }
  };

  const handleConfirmReverse = () => {
    if (!reverseTarget) return;
    const res = offlineStore.reverseJournalEntry(reverseTarget.id, reverseReason, activeUser.name);
    if (!res.success) {
      setFeedback({ type: 'error', text: res.error || 'Failed to reverse journal entry.' });
      return;
    }
    setFeedback({
      type: 'success',
      text: `Created reversing entry ${res.reversalEntry?.journalNumber} for ${reverseTarget.journalNumber}.`,
    });
    setReverseTarget(null);
    setReverseReason('');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#D1D7DB]">
        <div>
          <h1 className="text-lg font-bold text-[#111B21] flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#16587B]" />
            <span>Journal Entries</span>
          </h1>
          <p className="text-xs text-[#667781] mt-0.5">
            Double-entry manual and automated accounting journals with immutable posting and audit-compliant reversals.
          </p>
        </div>
        <button
          onClick={openNewJournal}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#16587B] hover:bg-[#124866] text-[#F5EEDD] text-xs font-semibold rounded-lg transition-colors cursor-pointer min-h-[42px]"
        >
          <Plus className="w-4 h-4" />
          <span>New Journal Entry</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`flex items-center justify-between px-4 py-3 rounded-lg border text-xs font-medium ${
            feedback.type === 'success'
              ? 'bg-[#84B3CE]/25 border-[#16587B]/30 text-[#16587B]'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="p-1 hover:opacity-70 cursor-pointer" aria-label="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-[#D1D7DB]">
          <div className="text-[11px] font-medium text-[#667781]">Total Vouchers</div>
          <div className="text-xl font-bold text-[#111B21] tabular-nums mt-1">{metrics.totalCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-[#D1D7DB]">
          <div className="text-[11px] font-medium text-[#667781]">Posted to GL</div>
          <div className="text-xl font-bold text-[#16587B] tabular-nums mt-1">{metrics.postedCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-[#D1D7DB]">
          <div className="text-[11px] font-medium text-[#667781]">Draft / Pending Approval</div>
          <div className="text-xl font-bold text-amber-700 tabular-nums mt-1">{metrics.pendingCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-[#D1D7DB]">
          <div className="text-[11px] font-medium text-[#667781]">Posted Ledger Volume</div>
          <div className="text-xl font-bold text-[#111B21] tabular-nums mt-1">{fmtINR(metrics.totalPostedVolume)}</div>
        </div>
      </div>

      {/* Filters & Table */}
      <div className="bg-white rounded-xl border border-[#D1D7DB] overflow-hidden">
        <div className="p-3.5 border-b border-[#E9EDEF] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-[#8696A0] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search voucher #, reference, narration..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-[#D1D7DB] rounded-lg focus:outline-none focus:border-[#16587B]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as any)}
              className="px-3 py-2 text-xs border border-[#D1D7DB] rounded-lg bg-white text-[#111B21]"
            >
              <option value="ALL">All Sources</option>
              <option value="MANUAL">Manual Journals Only</option>
              <option value="AUTOMATED">Auto-Posted Source Docs</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 text-xs border border-[#D1D7DB] rounded-lg bg-white text-[#111B21]"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="POSTED">Posted</option>
              <option value="REVERSED">Reversed</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[11px] font-semibold text-[#667781] uppercase tracking-wider">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Journal #</th>
                <th className="px-4 py-3">Source / Ref</th>
                <th className="px-4 py-3">Narration</th>
                <th className="px-4 py-3 text-right">Debit (₹)</th>
                <th className="px-4 py-3 text-right">Credit (₹)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9EDEF] text-xs">
              {filteredJournals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[#667781]">
                    No journal entries match your current filter. Click <strong>New Journal Entry</strong> to create one.
                  </td>
                </tr>
              ) : (
                filteredJournals.map((j) => (
                  <tr key={j.id} className="hover:bg-[#FAF6EC]/60 transition-colors">
                    <td className="px-4 py-3 tabular-nums text-[#54656F] whitespace-nowrap">{j.entryDate}</td>
                    <td className="px-4 py-3 font-semibold text-[#16587B] whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {j.status === 'POSTED' && <Lock className="w-3 h-3 text-[#667781]" />}
                        <span>{j.journalNumber}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#54656F]">
                      <div className="font-medium text-[#111B21]">{j.sourceType.replace(/_/g, ' ')}</div>
                      {j.referenceNumber && <div className="text-[11px] text-[#667781]">{j.referenceNumber}</div>}
                    </td>
                    <td className="px-4 py-3 text-[#111B21] max-w-xs truncate" title={j.narration}>
                      {j.narration}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#111B21]">
                      {fmtINR(j.totalDebit)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#111B21]">
                      {fmtINR(j.totalCredit)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[11px] font-semibold ${
                          j.status === 'POSTED'
                            ? 'text-[#16587B]'
                            : j.status === 'REVERSED'
                            ? 'text-rose-700'
                            : j.status === 'PENDING_APPROVAL'
                            ? 'text-amber-700'
                            : 'text-[#667781]'
                        }`}
                      >
                        {j.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => setInspectJournal(j)}
                          className="p-1.5 text-[#54656F] hover:text-[#16587B] hover:bg-[#FAF6EC] rounded cursor-pointer"
                          title="Inspect GL lines"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {(j.status === 'DRAFT' || j.status === 'PENDING_APPROVAL') && (
                          <>
                            <button
                              onClick={() => openEditDraft(j)}
                              className="px-2 py-1 text-[11px] font-semibold text-[#111B21] border border-[#D1D7DB] rounded hover:bg-[#FAF6EC] cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handlePostEntry(j.id)}
                              className="px-2 py-1 text-[11px] font-semibold bg-[#16587B] text-[#F5EEDD] rounded hover:bg-[#124866] cursor-pointer"
                            >
                              Approve &amp; Post
                            </button>
                          </>
                        )}
                        {j.status === 'POSTED' && j.sourceType !== 'REVERSAL' && (
                          <button
                            onClick={() => {
                              setReverseTarget(j);
                              setReverseReason('');
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-rose-700 border border-rose-200 rounded hover:bg-rose-50 cursor-pointer"
                            title="Create reversing journal entry"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Reverse</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Journal Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E9EDEF] flex items-center justify-between bg-[#FAF6EC]">
              <div>
                <h2 className="text-sm font-bold text-[#111B21]">
                  {editingJournalId ? 'Edit Draft Journal Entry' : 'New Double-Entry Journal Voucher'}
                </h2>
                <p className="text-[11px] text-[#667781]">
                  Total Debits must equal Total Credits before saving or posting to the General Ledger.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-[#54656F] hover:text-[#111B21] rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Entry Date *</label>
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#D1D7DB] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Reference Number</label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="e.g. ADJ-APR-01 / Bank Advice #"
                    className="w-full px-3 py-2 text-xs border border-[#D1D7DB] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Attachment / Audit Note</label>
                  <input
                    type="text"
                    value={attachmentNotes}
                    onChange={(e) => setAttachmentNotes(e.target.value)}
                    placeholder="Supporting voucher or CA memo ref"
                    className="w-full px-3 py-2 text-xs border border-[#D1D7DB] rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Narration / Description *</label>
                <input
                  type="text"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  placeholder="Describe the accounting purpose of this journal voucher..."
                  className="w-full px-3 py-2 text-xs border border-[#D1D7DB] rounded-lg"
                />
              </div>

              {/* Lines Editor */}
              <div className="border border-[#D1D7DB] rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[11px] text-[#667781] font-semibold">
                      <th className="px-3 py-2.5 w-[34%]">Account</th>
                      <th className="px-3 py-2.5 w-[28%]">Line Memo</th>
                      <th className="px-3 py-2.5 w-[16%] text-right">Debit (₹)</th>
                      <th className="px-3 py-2.5 w-[16%] text-right">Credit (₹)</th>
                      <th className="px-2 py-2.5 w-[6%]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9EDEF]">
                    {lines.map((line) => (
                      <tr key={line.key}>
                        <td className="p-2">
                          <select
                            value={line.accountId}
                            onChange={(e) => handleLineChange(line.key, 'accountId', e.target.value)}
                            className="w-full px-2.5 py-2 text-xs border border-[#D1D7DB] rounded bg-white"
                          >
                            <option value="">Select Account...</option>
                            {activeAccounts.map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.code} — {acc.name} ({acc.accountClass})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={line.description}
                            onChange={(e) => handleLineChange(line.key, 'description', e.target.value)}
                            placeholder="Optional line detail"
                            className="w-full px-2.5 py-2 text-xs border border-[#D1D7DB] rounded"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.debit}
                            onChange={(e) => handleLineChange(line.key, 'debit', e.target.value)}
                            placeholder="0.00"
                            className="w-full px-2.5 py-2 text-xs text-right tabular-nums border border-[#D1D7DB] rounded"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.credit}
                            onChange={(e) => handleLineChange(line.key, 'credit', e.target.value)}
                            placeholder="0.00"
                            className="w-full px-2.5 py-2 text-xs text-right tabular-nums border border-[#D1D7DB] rounded"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => handleRemoveLine(line.key)}
                            disabled={lines.length <= 2}
                            className="p-1.5 text-[#667781] hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                            title="Remove line"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="px-3 py-2.5 bg-[#FAF6EC] border-t border-[#E9EDEF] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <button
                    onClick={handleAddLine}
                    className="inline-flex items-center gap-1 text-[#16587B] font-semibold hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Line</span>
                  </button>
                  <div className="flex items-center gap-5 tabular-nums">
                    <span>
                      Total Debit: <strong>{fmtINR(totals.totalDebit)}</strong>
                    </span>
                    <span>
                      Total Credit: <strong>{fmtINR(totals.totalCredit)}</strong>
                    </span>
                    <span className={totals.isBalanced ? 'text-[#16587B] font-bold' : 'text-rose-700 font-bold'}>
                      {totals.isBalanced ? 'Balanced' : `Out of Balance: ${fmtINR(totals.diff)}`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-[#E9EDEF] bg-[#FAF6EC] flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-semibold text-[#54656F] border border-[#D1D7DB] bg-white rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSubmitJournal('DRAFT')}
                disabled={!totals.isBalanced}
                className="px-4 py-2 text-xs font-semibold text-[#111B21] border border-[#D1D7DB] bg-white hover:bg-[#FAF6EC] rounded-lg disabled:opacity-40 cursor-pointer"
              >
                Save as Draft
              </button>
              <button
                onClick={() => handleSubmitJournal('PENDING_APPROVAL')}
                disabled={!totals.isBalanced}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0F2D3D] bg-[#84B3CE]/40 hover:bg-[#84B3CE]/60 border border-[#16587B]/20 rounded-lg disabled:opacity-40 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit for Approval</span>
              </button>
              <button
                onClick={() => handleSubmitJournal('POSTED')}
                disabled={!totals.isBalanced}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#F5EEDD] bg-[#16587B] hover:bg-[#124866] rounded-lg disabled:opacity-40 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Post to General Ledger</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspect Journal Modal */}
      {inspectJournal && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E9EDEF] bg-[#FAF6EC] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#16587B]" />
                <h3 className="text-sm font-bold text-[#111B21]">{inspectJournal.journalNumber}</h3>
                <span className="text-[11px] font-semibold text-[#667781]">· {inspectJournal.status}</span>
              </div>
              <button onClick={() => setInspectJournal(null)} className="p-1 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[#FAF6EC] p-3 rounded-lg border border-[#E9EDEF]">
                <div>
                  <div className="text-[10px] text-[#667781]">Entry Date</div>
                  <div className="font-semibold tabular-nums">{inspectJournal.entryDate}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#667781]">Source</div>
                  <div className="font-semibold">{inspectJournal.sourceType.replace(/_/g, ' ')}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#667781]">Posted By</div>
                  <div className="font-semibold">{inspectJournal.postedByName || inspectJournal.createdByName || 'System'}</div>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <div className="text-[10px] text-[#667781]">Narration</div>
                  <div className="font-medium text-[#111B21]">{inspectJournal.narration}</div>
                </div>
              </div>

              <div className="border border-[#D1D7DB] rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#FAF6EC] border-b border-[#E9EDEF] text-[11px] text-[#667781]">
                      <th className="px-3 py-2">Account</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9EDEF]">
                    {inspectJournal.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2 font-medium">
                          {l.accountCode} — {l.accountName}
                        </td>
                        <td className="px-3 py-2 text-[#54656F]">{l.description}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {l.debit > 0 ? fmtINR(l.debit) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {l.credit > 0 ? fmtINR(l.credit) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#FAF6EC] border-t border-[#D1D7DB] font-bold">
                      <td colSpan={2} className="px-3 py-2 text-right">
                        Totals
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtINR(inspectJournal.totalDebit)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtINR(inspectJournal.totalCredit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reverse Journal Modal */}
      {reverseTarget && (
        <div className="fixed inset-0 z-50 bg-[#0F405B]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[#D1D7DB] shadow-2xl w-full max-w-md p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#111B21]">Reverse Posted Journal {reverseTarget.journalNumber}</h3>
            <p className="text-xs text-[#667781]">
              Posted entries are immutable. Confirming creates an equal-and-opposite mirror entry in the General Ledger and links it to the original voucher.
            </p>
            <div>
              <label className="block text-[11px] font-semibold text-[#54656F] mb-1">Audit Reason for Reversal *</label>
              <textarea
                rows={3}
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="e.g. Posted to wrong expense account; reclassifying to Store Maintenance..."
                className="w-full px-3 py-2 text-xs border border-[#D1D7DB] rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReverseTarget(null)}
                className="px-3.5 py-2 text-xs font-semibold text-[#54656F] border border-[#D1D7DB] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReverse}
                disabled={!reverseReason.trim()}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-40 cursor-pointer"
              >
                Post Reversal Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
