/**
 * SLATE POS — Getting Started Onboarding Progression Checklist
 * 8-step enterprise retail initialization guide with progress tracking
 * Styled with SLATE POS Theme (#075E54 / #128C7E / #DCF8C6)
 */

import React, { useState } from 'react';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { ActiveView } from '../layout/Sidebar';

interface GettingStartedChecklistProps {
  onNavigate: (stepTarget: ActiveView) => void;
  onDismiss?: () => void;
}

export const GettingStartedChecklist: React.FC<GettingStartedChecklistProps> = ({
  onNavigate,
}) => {
  const [completedSteps, setCompletedSteps] = useState<number[]>([1, 2, 3, 4, 5, 6]);

  const steps: { id: number; title: string; desc: string; target: ActiveView }[] = [
    {
      id: 1,
      title: 'Complete Organization Profile & GSTIN',
      desc: 'Verify business trade name, GSTIN (29AABCU9603R1ZM), state jurisdiction, and contact details.',
      target: 'SETTINGS',
    },
    {
      id: 2,
      title: 'Catalogue Products & Set Up Barcodes',
      desc: 'Import products with HSN codes (0902, 1006, 8544), GST tax rates (5%, 18%), and cost prices.',
      target: 'PRODUCTS',
    },
    {
      id: 3,
      title: 'Register Customers & Credit Limits',
      desc: 'Add B2B wholesale buyers with GSTIN and set up credit limits for 30-day payment terms.',
      target: 'CUSTOMERS',
    },
    {
      id: 4,
      title: 'Configure POS Thermal Printer (58mm/80mm)',
      desc: 'Set receipt headers, FSSAI numbers, auto-cut preferences, and cash drawer kick options.',
      target: 'SETTINGS',
    },
    {
      id: 5,
      title: 'Enable Indian Payment Modes (Cash & UPI)',
      desc: 'Set up dynamic UPI QR codes and cash denomination quick buttons for high-speed counter checkout.',
      target: 'POS',
    },
    {
      id: 6,
      title: 'Initialize Offline Local Data Storage',
      desc: 'Download product catalog snapshots to local counter device for zero-latency offline sales.',
      target: 'SYNC',
    },
    {
      id: 7,
      title: 'Execute Your First Counter Sale',
      desc: 'Scan barcode, tender cash or UPI, and generate your first printed tax receipt.',
      target: 'POS',
    },
    {
      id: 8,
      title: 'Inspect Receivables Aging & GST Reports',
      desc: 'Review 1–15, 16–30, and >45 days aging breakdown and export GSTR-1 summaries.',
      target: 'DASHBOARD',
    },
  ];

  const toggleStep = (id: number) => {
    setCompletedSteps((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const progressPercent = Math.round((completedSteps.length / steps.length) * 100);

  return (
    <div className="bg-white p-6 rounded-lg border border-[#D1D7DB] shadow-2xs space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-[#111B21]">
              Store Setup &amp; Readiness Checklist
            </h2>
            <span className="text-xs font-bold text-[#075E54] bg-[#DCF8C6] px-2.5 py-0.5 rounded border border-[#B3EBA0]">
              {completedSteps.length} of {steps.length} Complete
            </span>
          </div>
          <p className="text-xs text-[#667781] mt-1">
            Follow these essential steps to ensure error-free offline checkout, tax compliance, and branch synchronization.
          </p>
        </div>

        <div className="w-48">
          <div className="flex justify-between text-xs tabular-nums mb-1 text-[#3B4A54]">
            <span>Readiness</span>
            <span className="font-bold text-[#075E54]">{progressPercent}%</span>
          </div>
          <div className="h-2 w-full bg-[#ECE5DD] rounded-full overflow-hidden">
            <div
              style={{ width: `${progressPercent}%` }}
              className="h-full bg-[#075E54] transition-all duration-300"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
        {steps.map((step) => {
          const isDone = completedSteps.includes(step.id);
          return (
            <div
              key={step.id}
              className={`p-3.5 rounded-lg border transition-colors flex items-start gap-3 ${
                isDone
                  ? 'bg-[#F7F5F2] border-[#D1D7DB] text-[#667781]'
                  : 'bg-white border-[#128C7E]/40 shadow-2xs text-[#111B21]'
              }`}
            >
              <button
                onClick={() => toggleStep(step.id)}
                className="mt-0.5 text-[#667781] hover:text-[#075E54] transition-colors cursor-pointer"
                title={isDone ? 'Mark as incomplete' : 'Mark as complete'}
              >
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-[#075E54]" />
                ) : (
                  <Circle className="w-4 h-4 text-[#8696A0]" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${isDone ? 'line-through text-[#8696A0]' : 'text-[#111B21]'}`}>
                    {step.title}
                  </span>
                  <button
                    onClick={() => onNavigate(step.target)}
                    className="text-[11px] text-[#075E54] hover:text-[#128C7E] font-bold flex items-center gap-0.5 ml-2 shrink-0 cursor-pointer"
                  >
                    <span>Go</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-[11px] text-[#667781] mt-0.5 leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
