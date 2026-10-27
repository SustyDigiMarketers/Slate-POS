/**
 * SLATE POS — Indian Currency, Number & Date Formatters
 * Strict financial typography compliance:
 * - Proper Indian digit grouping (e.g. ₹1,25,000.00)
 * - Tabular numbers compatibility
 * - Compact representations for charts & KPI cards (k, L, Cr)
 * - Safe null/NaN handling
 */

export function formatINR(
  amount: number | null | undefined,
  options?: { showDecimals?: boolean; compact?: boolean; signed?: boolean }
): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return options?.showDecimals === false ? '₹0' : '₹0.00';
  }

  const showDecimals = options?.showDecimals ?? true;

  if (options?.compact) {
    const isNegative = amount < 0;
    const abs = Math.abs(amount);
    let formattedCompact = '';

    if (abs >= 10000000) {
      formattedCompact = `₹${(abs / 10000000).toFixed(2)} Cr`;
    } else if (abs >= 100000) {
      formattedCompact = `₹${(abs / 100000).toFixed(2)} L`;
    } else if (abs >= 1000) {
      formattedCompact = `₹${(abs / 1000).toFixed(1)} k`;
    } else {
      formattedCompact = `₹${abs.toFixed(showDecimals ? 2 : 0)}`;
    }

    return isNegative ? `-${formattedCompact}` : formattedCompact;
  }

  const isNegative = amount < 0;
  const abs = Math.abs(amount);

  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  });

  const formatted = formatter.format(abs);

  if (isNegative) {
    return options?.signed ? `-${formatted}` : `-${formatted}`;
  }

  return options?.signed ? `+${formatted}` : formatted;
}

export function formatDate(dateString: string | Date | null | undefined, includeTime = false): string {
  if (!dateString) return '—';
  try {
    const d = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit', hour12: true } : {}),
    }).format(d);
  } catch {
    return String(dateString);
  }
}

export function formatNumber(value: number | null | undefined, options?: { decimals?: number }): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: options?.decimals ?? 0,
    maximumFractionDigits: options?.decimals ?? 0,
  }).format(value);
}

export function formatPercentage(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.0%';
  }
  return `${value.toFixed(decimals)}%`;
}

export function formatQty(value: number | null | undefined, unit = ''): string {
  if (value === null || value === undefined || isNaN(value)) {
    return unit ? `0 ${unit}` : '0';
  }
  const formatted = new Intl.NumberFormat('en-IN').format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertLessThanThousand(num: number): string {
  if (num === 0) return '';
  if (num < 20) return ONES[num];
  if (num < 100) {
    return `${TENS[Math.floor(num / 10)]}${num % 10 !== 0 ? ' ' + ONES[num % 10] : ''}`;
  }
  return `${ONES[Math.floor(num / 100)]} Hundred${num % 100 !== 0 ? ' and ' + convertLessThanThousand(num % 100) : ''}`;
}

export function amountInWordsINR(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'Indian Rupee Zero Only';
  const rounded = Math.floor(amount);
  const paise = Math.round((amount - rounded) * 100);

  let num = rounded;
  let words = '';

  const crores = Math.floor(num / 10000000);
  num %= 10000000;
  if (crores > 0) {
    words += `${convertLessThanThousand(crores)} Crore `;
  }

  const lakhs = Math.floor(num / 100000);
  num %= 100000;
  if (lakhs > 0) {
    words += `${convertLessThanThousand(lakhs)} Lakh `;
  }

  const thousands = Math.floor(num / 1000);
  num %= 1000;
  if (thousands > 0) {
    words += `${convertLessThanThousand(thousands)} Thousand `;
  }

  if (num > 0) {
    words += `${convertLessThanThousand(num)} `;
  }

  words = words.trim();
  let result = `Indian Rupee ${words}`;
  if (paise > 0) {
    result += ` and ${convertLessThanThousand(paise)} Paise`;
  }
  return `${result} Only`;
}
