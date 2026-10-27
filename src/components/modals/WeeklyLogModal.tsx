/**
 * SLATE POS — Weekly Log Modal
 * Displays weekly staff timesheet with daily breakdowns, total hours, and CSV export
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Download, Clock, User, Filter } from 'lucide-react';
import { offlineStore } from '../../lib/offlineStore';
import { TimeLog } from '../../types';

interface WeeklyLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLogTime?: () => void;
}

export const WeeklyLogModal: React.FC<WeeklyLogModalProps> = ({ isOpen, onClose, onOpenLogTime }) => {
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>(offlineStore.getTimeLogs());
  const [selectedStaff, setSelectedStaff] = useState<string>('ALL');

  useEffect(() => {
    const unsub = offlineStore.subscribe(() => {
      setTimeLogs(offlineStore.getTimeLogs());
    });
    return unsub;
  }, []);

  if (!isOpen) return null;

  // Filter logs
  const filteredLogs = useMemo(() => {
    if (selectedStaff === 'ALL') return timeLogs;
    return timeLogs.filter((l) => l.userId === selectedStaff);
  }, [timeLogs, selectedStaff]);

  const totalHours = filteredLogs.reduce((acc, l) => acc + l.hours, 0);

  // Group by day of week (Monday through Sunday for the current week)
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const exportCsv = () => {
    const headers = ['ID', 'Date', 'Staff Member', 'Outlet / Project', 'Task Activity', 'Hours', 'Billable', 'Notes'];
    const rows = filteredLogs.map((l) => [
      l.id,
      l.date,
      `"${l.userName.replace(/"/g, '""')}"`,
      `"${l.project.replace(/"/g, '""')}"`,
      `"${l.task.replace(/"/g, '""')}"`,
      l.hours.toFixed(2),
      l.billable ? 'Yes' : 'No',
      `"${(l.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `SLATE_Weekly_Timesheet_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const users = offlineStore.getUsers();

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-2xl p-5 space-y-4 font-sans max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#D1D7DB] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#DCF8C6] flex items-center justify-center text-[#075E54]">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#111B21]">Weekly Staff Log &amp; Timesheets</h3>
              <p className="text-[11px] text-[#667781]">Shift summaries, operational hours, and staff breakdown</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#667781] hover:text-[#111B21] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar & Filters */}
        <div className="flex items-center justify-between gap-3 bg-[#F7F5F2] p-3 rounded-lg border border-[#D1D7DB] shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[#667781]" />
            <span className="text-xs font-semibold text-[#111B21]">Staff Member:</span>
            <select
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value)}
              className="text-xs bg-white border border-[#D1D7DB] rounded px-2.5 py-1 font-semibold text-[#111B21]"
            >
              <option value="ALL">All Staff Members ({timeLogs.length} logs)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-2.5 py-1 bg-white border border-[#D1D7DB] rounded text-xs font-bold tabular-nums text-[#075E54]">
              Total: {totalHours.toFixed(1)} hrs
            </div>

            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-[#F7F5F2] border border-[#075E54] text-[#075E54] rounded text-xs font-bold transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            {onOpenLogTime && (
              <button
                onClick={() => {
                  onClose();
                  onOpenLogTime();
                }}
                className="flex items-center gap-1 px-3 py-1 bg-[#075E54] hover:bg-[#128C7E] text-white rounded text-xs font-bold transition-colors cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>+ Log Time</span>
              </button>
            )}
          </div>
        </div>

        {/* Timesheet Table */}
        <div className="flex-1 overflow-y-auto border border-[#D1D7DB] rounded-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#F7F5F2] text-[#3B4A54] border-b border-[#D1D7DB] sticky top-0">
              <tr>
                <th className="py-2 px-3 font-bold">Date</th>
                <th className="py-2 px-3 font-bold">Staff Member</th>
                <th className="py-2 px-3 font-bold">Outlet / Project</th>
                <th className="py-2 px-3 font-bold">Task &amp; Shift Summary</th>
                <th className="py-2 px-3 font-bold text-right">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9EDEF]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#667781] text-xs">
                    No time logs found for the selected filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#F7F5F2] transition-colors">
                    <td className="py-2 px-3 font-mono text-[11px] text-[#3B4A54] whitespace-nowrap">
                      {log.date}
                    </td>
                    <td className="py-2 px-3 font-semibold text-[#111B21] whitespace-nowrap">
                      {log.userName}
                    </td>
                    <td className="py-2 px-3 text-[#667781] text-[11px] truncate max-w-[120px]">
                      {log.project}
                    </td>
                    <td className="py-2 px-3 text-[#111B21]">
                      <div className="font-medium">{log.task}</div>
                      {log.notes && (
                        <div className="text-[10px] text-[#8696A0] mt-0.5">{log.notes}</div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-bold tabular-nums text-[#075E54] whitespace-nowrap">
                      {log.hours.toFixed(1)} h
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-[#D1D7DB] flex items-center justify-between text-xs text-[#667781] shrink-0">
          <span>Timesheet entries stored locally and synced with employee shift roster.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#075E54] text-white rounded-lg font-bold text-xs hover:bg-[#128C7E] cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
