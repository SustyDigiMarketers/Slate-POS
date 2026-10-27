import { Sale, Expense } from '../types';

export interface TimelineDataPoint {
  date: string;
  revenue: number;
  receipts: number;
}

export interface MonthlyDataPoint {
  month: string;
  sales: number;
  receipts: number;
  expenses: number;
}

/**
 * Computes dynamic timeline trend data from real persisted sales
 */
export function computeRevenueChartData(
  sales: Sale[],
  period: '7D' | '30D' | 'FY'
): TimelineDataPoint[] {
  if (!sales || sales.length === 0) {
    return [];
  }

  // Find reference anchor date from either current time or latest sale
  const saleDates = sales
    .map((s) => new Date(s.createdAt).getTime())
    .filter((t) => !isNaN(t));

  const anchorTime = saleDates.length > 0 ? Math.max(...saleDates) : Date.now();
  const anchorDate = new Date(anchorTime);

  if (period === '7D') {
    const points: TimelineDataPoint[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(anchorDate);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

      let rev = 0;
      let rec = 0;
      for (const s of sales) {
        if (s.createdAt && s.createdAt.slice(0, 10) === dateStr) {
          rev += s.grandTotal || 0;
        }
        if (s.payments && Array.isArray(s.payments)) {
          for (const p of s.payments) {
            const pDate = p.timestamp ? p.timestamp.slice(0, 10) : (s.createdAt ? s.createdAt.slice(0, 10) : '');
            if (pDate === dateStr) {
              rec += p.amount || 0;
            }
          }
        }
      }
      points.push({ date: label, revenue: Math.round(rev), receipts: Math.round(rec) });
    }
    return points;
  }

  if (period === '30D') {
    const points: TimelineDataPoint[] = [];
    // 4 7-day buckets
    for (let w = 3; w >= 0; w--) {
      const startD = new Date(anchorDate);
      startD.setDate(startD.getDate() - (w + 1) * 7);
      const endD = new Date(anchorDate);
      endD.setDate(endD.getDate() - w * 7);

      const label = `Wk ${4 - w}`;
      let rev = 0;
      let rec = 0;

      for (const s of sales) {
        const sTime = new Date(s.createdAt).getTime();
        if (sTime >= startD.getTime() && sTime <= endD.getTime()) {
          rev += s.grandTotal || 0;
        }
        if (s.payments && Array.isArray(s.payments)) {
          for (const p of s.payments) {
            const pTime = new Date(p.timestamp || s.createdAt).getTime();
            if (pTime >= startD.getTime() && pTime <= endD.getTime()) {
              rec += p.amount || 0;
            }
          }
        }
      }
      points.push({ date: label, revenue: Math.round(rev), receipts: Math.round(rec) });
    }
    return points;
  }

  // FY (Months)
  const monthNames = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  const currentYear = anchorDate.getFullYear();
  const startYear = anchorDate.getMonth() >= 3 ? currentYear : currentYear - 1;

  const points: TimelineDataPoint[] = [];
  for (let idx = 0; idx < 12; idx++) {
    const monthIndex = (idx + 3) % 12; // 3 = Apr
    const year = idx < 9 ? startYear : startYear + 1;
    const label = monthNames[idx];

    let rev = 0;
    let rec = 0;

    for (const s of sales) {
      const sDate = new Date(s.createdAt);
      if (sDate.getFullYear() === year && sDate.getMonth() === monthIndex) {
        rev += s.grandTotal || 0;
      }
      if (s.payments && Array.isArray(s.payments)) {
        for (const p of s.payments) {
          const pDate = new Date(p.timestamp || s.createdAt);
          if (pDate.getFullYear() === year && pDate.getMonth() === monthIndex) {
            rec += p.amount || 0;
          }
        }
      }
    }
    points.push({ date: label, revenue: Math.round(rev), receipts: Math.round(rec) });
  }
  return points;
}

/**
 * Computes monthly comparative data (Sales, Receipts, Expenses) from real records
 */
export function computeMonthlyComparativeData(
  sales: Sale[],
  expenses: Expense[]
): MonthlyDataPoint[] {
  if ((!sales || sales.length === 0) && (!expenses || expenses.length === 0)) {
    return [];
  }

  const allTimestamps: number[] = [];
  if (sales) {
    sales.forEach((s) => {
      const t = new Date(s.createdAt).getTime();
      if (!isNaN(t)) allTimestamps.push(t);
    });
  }
  if (expenses) {
    expenses.forEach((e) => {
      const t = new Date(e.date).getTime();
      if (!isNaN(t)) allTimestamps.push(t);
    });
  }

  const anchorTime = allTimestamps.length > 0 ? Math.max(...allTimestamps) : Date.now();
  const anchorDate = new Date(anchorTime);

  const monthNames = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  const currentYear = anchorDate.getFullYear();
  const startYear = anchorDate.getMonth() >= 3 ? currentYear : currentYear - 1;

  // Render the current FY up to current month or past 7 months
  const points: MonthlyDataPoint[] = [];
  for (let idx = 0; idx < 7; idx++) {
    const monthIndex = (idx + 3) % 12; // Apr through Oct
    const year = idx < 9 ? startYear : startYear + 1;
    const label = monthNames[idx];

    let mSales = 0;
    let mReceipts = 0;
    let mExpenses = 0;

    if (sales) {
      for (const s of sales) {
        const sDate = new Date(s.createdAt);
        if (sDate.getFullYear() === year && sDate.getMonth() === monthIndex) {
          mSales += s.grandTotal || 0;
        }
        if (s.payments && Array.isArray(s.payments)) {
          for (const p of s.payments) {
            const pDate = new Date(p.timestamp || s.createdAt);
            if (pDate.getFullYear() === year && pDate.getMonth() === monthIndex) {
              mReceipts += p.amount || 0;
            }
          }
        }
      }
    }

    if (expenses) {
      for (const e of expenses) {
        const eDate = new Date(e.date);
        if (eDate.getFullYear() === year && eDate.getMonth() === monthIndex) {
          mExpenses += e.amount || 0;
        }
      }
    }

    points.push({
      month: label,
      sales: Math.round(mSales),
      receipts: Math.round(mReceipts),
      expenses: Math.round(mExpenses),
    });
  }

  return points;
}
