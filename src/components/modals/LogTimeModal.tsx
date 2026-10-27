/**
 * SLATE POS — Log Time Modal
 * Record staff shift hours, retail store tasks, stock audits, and operational time
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6)
 */

import React, { useState } from 'react';
import { X, Clock, Calendar, CheckCircle2, User } from 'lucide-react';
import { offlineStore } from '../../lib/offlineStore';
import { TimeLog } from '../../types';

interface LogTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogged?: (log: TimeLog) => void;
}

export const LogTimeModal: React.FC<LogTimeModalProps> = ({ isOpen, onClose, onLogged }) => {
  const activeUser = offlineStore.getActiveUser();
  const todayStr = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(todayStr);
  const [hours, setHours] = useState('8.0');
  const [project, setProject] = useState('Indiranagar Flagship');
  const [task, setTask] = useState('Counter 1 POS Shift & Sales Tender');
  const [notes, setNotes] = useState('');
  const [billable, setBillable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const hNum = parseFloat(hours);
    if (isNaN(hNum) || hNum <= 0 || hNum > 24) {
      setError('Please enter a valid number of hours between 0.1 and 24.');
      return;
    }
    if (!task.trim()) {
      setError('Please provide a task or shift activity description.');
      return;
    }

    const newLog: TimeLog = {
      id: `tl_${Date.now()}`,
      userId: activeUser.id,
      userName: activeUser.name,
      date,
      hours: hNum,
      project: project.trim(),
      task: task.trim(),
      notes: notes.trim() || undefined,
      billable,
      createdAt: new Date().toISOString(),
    };

    offlineStore.addTimeLog(newLog);
    onLogged?.(newLog);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-[#D1D7DB] w-full max-w-md p-5 space-y-4 font-sans">
        <div className="flex items-center justify-between pb-3 border-b border-[#D1D7DB]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#DCF8C6] flex items-center justify-center text-[#075E54]">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#111B21]">Log Shift &amp; Working Time</h3>
              <p className="text-[11px] text-[#667781]">Record staff hours, counter shifts, or store duties</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#667781] hover:text-[#111B21] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="flex items-center justify-between p-2.5 bg-[#F7F5F2] rounded-lg border border-[#D1D7DB]">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-[#075E54]" />
              <span className="font-semibold text-[#111B21]">{activeUser.name}</span>
            </div>
            <span className="text-[10px] bg-[#DCF8C6] text-[#075E54] font-bold px-2 py-0.5 rounded border border-[#B3EBA0]">
              {activeUser.role}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#111B21] mb-1">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-2 border border-[#D1D7DB] rounded-lg bg-[#F7F5F2] focus:bg-white text-xs font-semibold text-[#111B21]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#111B21] mb-1">Hours Logged</label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                required
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-full p-2 border border-[#D1D7DB] rounded-lg bg-[#F7F5F2] focus:bg-white text-xs font-semibold text-[#111B21]"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#111B21] mb-1">Store Outlet / Project</label>
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="w-full p-2 border border-[#D1D7DB] rounded-lg bg-[#F7F5F2] font-semibold text-[#111B21]"
            >
              <option value="Indiranagar Flagship">Indiranagar Flagship (BLR-IND)</option>
              <option value="Koramangala 4th Block">Koramangala 4th Block (BLR-KOR)</option>
              <option value="Jayanagar 9th Block">Jayanagar 9th Block (BLR-JAY)</option>
              <option value="Central Warehouse & Logistics">Central Warehouse &amp; Logistics</option>
              <option value="Administrative Headquarters">Administrative Headquarters</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[#111B21] mb-1">Task / Activity</label>
            <input
              type="text"
              required
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="e.g. Counter Checkout, Physical Stock Verification"
              className="w-full p-2 border border-[#D1D7DB] rounded-lg bg-[#F7F5F2] focus:bg-white text-xs font-medium text-[#111B21]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#111B21] mb-1">Shift Notes (Optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes on register balance, shift handovers, or deliveries..."
              className="w-full p-2 border border-[#D1D7DB] rounded-lg bg-[#F7F5F2] focus:bg-white text-xs text-[#111B21]"
            />
          </div>

          <div className="pt-2 border-t border-[#D1D7DB] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 border border-[#D1D7DB] rounded-lg text-xs font-semibold text-[#3B4A54] hover:bg-[#F7F5F2] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-gradient-to-br from-[#075E54] to-[#128C7E] text-white rounded-lg text-xs font-bold shadow-xs hover:opacity-95 cursor-pointer"
            >
              Save Time Log
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
