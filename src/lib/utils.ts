import { t, getLocale } from './i18n.svelte.js';
import type { Expense, TrendData, TrendPoint } from '../types.js';

export function formatDate(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' });
}

export function parseLocalExpenseDate(dateString: string): Date | null {
  const [year, month, day] = String(dateString).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getTrendPeriodLabel(range: string): string {
  switch (range) {
    case 'all': return t('trend.allTime');
    case 'week': return t('trend.last7Days');
    case 'day': return t('trend.today');
    case 'month': default: return t('trend.thisMonth');
  }
}

export async function calculateExpenseTrendData(expenseItems: Expense[], range: string, currentCurrency: string): Promise<TrendData> {
  const { warmConversionRates, convertToDisplayCurrencySync } = await import('./currency.js');
  const today = startOfDay(new Date());

  const items = expenseItems
    .filter(item => item.type === 'expense')
    .map(item => ({ ...item, parsedDate: parseLocalExpenseDate(item.date) }))
    .filter((item): item is typeof item & { parsedDate: Date } => item.parsedDate !== null);

  await warmConversionRates(items.map(item => item.currency), currentCurrency);

  const buckets: { key: string; label: string }[] = [];
  const bucketTotals: Record<string, number> = {};

  if (range === 'all') {
    if (items.length === 0) return { points: [], total: 0, average: 0, periodLabel: getTrendPeriodLabel(range) };

    const dates = items.map(item => item.parsedDate.getTime());
    let cursor = new Date(Math.min(...dates));
    const last = new Date(Math.max(...dates));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const end = new Date(last.getFullYear(), last.getMonth(), 1);

    while (cursor <= end) {
      const key = formatMonthKey(cursor);
      buckets.push({ key, label: cursor.toLocaleDateString(getLocale(), { month: 'short', year: '2-digit' }) });
      bucketTotals[key] = 0;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    for (const item of items) {
      const converted = convertToDisplayCurrencySync(item.amount, item.currency, currentCurrency);
      const key = formatMonthKey(item.parsedDate);
      bucketTotals[key] = (bucketTotals[key] || 0) + converted.amount;
    }
  } else {
    let start: Date, end: Date;
    if (range === 'week') { start = addDays(today, -6); end = today; }
    else if (range === 'day') { start = today; end = today; }
    else { start = new Date(today.getFullYear(), today.getMonth(), 1); end = new Date(today.getFullYear(), today.getMonth() + 1, 0); }

    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
      const key = formatDateKey(cursor);
      buckets.push({ key, label: range === 'day' ? t('trend.today') : cursor.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' }) });
      bucketTotals[key] = 0;
    }

    for (const item of items) {
      if (item.parsedDate < start || item.parsedDate > end) continue;
      const converted = convertToDisplayCurrencySync(item.amount, item.currency, currentCurrency);
      const key = formatDateKey(item.parsedDate);
      bucketTotals[key] = (bucketTotals[key] || 0) + converted.amount;
    }
  }

  const points: TrendPoint[] = buckets.map(bucket => ({ ...bucket, amount: bucketTotals[bucket.key] || 0 }));
  const total = points.reduce((sum, p) => sum + p.amount, 0);
  const activeBuckets = points.filter(p => p.amount > 0).length;

  return { points, total, average: activeBuckets > 0 ? total / activeBuckets : 0, periodLabel: getTrendPeriodLabel(range) };
}

export function compressImageToDataUrl(file: File, maxPx: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          reject(new Error('Could not get canvas context'));
        }
      };
      if (e.target?.result) {
        img.src = e.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  });
}
