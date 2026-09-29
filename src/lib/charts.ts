import { chartColors } from './constants.js';
import { getCurrencySymbol, compactCurrencyValue, formatMoney } from './currency.js';
import { t } from './i18n.svelte.js';
import type { CategoryData, TrendPoint } from '../types.js';

export function renderPieChart(canvas: HTMLCanvasElement, categoryData: CategoryData[], total: number, currentCurrency: string): { legendHtml: string; centerText: string } {
  const dpr = window.devicePixelRatio || 1;
  const LOGICAL = 250;
  canvas.width = LOGICAL * dpr;
  canvas.height = LOGICAL * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { legendHtml: '', centerText: formatMoney(0, currentCurrency) };
  
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, LOGICAL, LOGICAL);

  if (categoryData.length === 0) return { legendHtml: '', centerText: formatMoney(0, currentCurrency) };

  const centerX = LOGICAL / 2;
  const centerY = LOGICAL / 2;
  const innerRadius = LOGICAL * 0.3;
  const outerRadius = LOGICAL * 0.45;
  let currentAngle = -Math.PI / 2;
  let legendHtml = '';

  categoryData.forEach((item, index) => {
    const sliceAngle = (item.percentage / 100) * 2 * Math.PI;
    const color = chartColors[index % chartColors.length];

    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, currentAngle, currentAngle + sliceAngle);
    ctx.arc(centerX, centerY, innerRadius, currentAngle + sliceAngle, currentAngle, true);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.stroke();

    legendHtml += `<div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full" style="background:${color}"></div><div class="flex-1"><p class="font-medium text-slate-700 text-xs">${item.category}</p><p class="text-slate-500 text-xs">${item.percentage.toFixed(1)}%</p></div></div>`;

    currentAngle += sliceAngle;
  });

  return { legendHtml, centerText: formatMoney(total, currentCurrency) };
}

export function renderTrendChart(canvas: HTMLCanvasElement, points: TrendPoint[], total: number, average: number, periodLabel: string, currentCurrency: string): { label: string; totalText: string; avgText: string; isEmpty: boolean } {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { label: periodLabel, totalText: formatMoney(0, currentCurrency), avgText: t('trend.avg', { value: formatMoney(0, currentCurrency) }), isEmpty: true };
  
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const logicalWidth = Math.max(Math.round(rect.width || (canvas.parentElement?.clientWidth ?? 640)), 320);
  const logicalHeight = Math.max(Math.round(rect.height || (canvas.parentElement?.clientHeight ?? 260)), 220);
  canvas.width = logicalWidth * dpr;
  canvas.height = logicalHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, logicalWidth, logicalHeight);

  const symbol = getCurrencySymbol(currentCurrency);

  if (points.length === 0 || total === 0) {
    drawTrendEmptyState(ctx, logicalWidth, logicalHeight);
    return { label: periodLabel, totalText: formatMoney(total, currentCurrency), avgText: t('trend.avg', { value: formatMoney(average, currentCurrency) }), isEmpty: true };
  }

  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const labelColor = isDark ? '#94a3b8' : '#64748b';
  const lineColor = '#007AFF';
  const fillColor = isDark ? 'rgba(0, 122, 255, 0.16)' : 'rgba(0, 122, 255, 0.10)';
  const axisLeft = 54, axisRight = 18, axisTop = 16, axisBottom = 36;
  const chartWidth = logicalWidth - axisLeft - axisRight;
  const chartHeight = logicalHeight - axisTop - axisBottom;
  const maxAmount = Math.max(...points.map(p => p.amount));
  const yMax = maxAmount === 0 ? 1 : maxAmount * 1.15;

  ctx.font = '12px sans-serif';
  ctx.textBaseline = 'middle';

  for (let i = 0; i <= 4; i++) {
    const y = axisTop + (chartHeight / 4) * i;
    const value = yMax - (yMax / 4) * i;
    ctx.beginPath();
    ctx.moveTo(axisLeft, y);
    ctx.lineTo(logicalWidth - axisRight, y);
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = labelColor;
    ctx.textAlign = 'right';
    ctx.fillText(compactCurrencyValue(value, symbol), axisLeft - 8, y);
  }

  const xForIndex = (index: number) => points.length === 1 ? axisLeft + chartWidth / 2 : axisLeft + (chartWidth / (points.length - 1)) * index;
  const yForAmount = (amt: number) => axisTop + chartHeight - (amt / yMax) * chartHeight;

  const coordinates = points.map((point, index) => ({ x: xForIndex(index), y: yForAmount(point.amount), ...point }));

  if (coordinates.length === 1) {
    const point = coordinates[0];
    const barWidth = Math.min(72, chartWidth * 0.35);
    ctx.fillStyle = fillColor;
    ctx.fillRect(point.x - barWidth / 2, point.y, barWidth, axisTop + chartHeight - point.y);
    ctx.fillStyle = lineColor;
    ctx.fillRect(point.x - barWidth / 2, point.y, barWidth, axisTop + chartHeight - point.y);
  } else {
    ctx.beginPath();
    coordinates.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.lineTo(coordinates[coordinates.length - 1].x, axisTop + chartHeight);
    ctx.lineTo(coordinates[0].x, axisTop + chartHeight);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.beginPath();
    coordinates.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  coordinates.forEach(point => {
    if (point.amount <= 0) return;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  drawTrendXAxisLabels(ctx, coordinates, logicalWidth, logicalHeight, axisLeft, axisRight, labelColor);

  return { label: periodLabel, totalText: formatMoney(total, currentCurrency), avgText: t('trend.avg', { value: formatMoney(average, currentCurrency) }), isEmpty: false };
}

function drawTrendXAxisLabels(ctx: CanvasRenderingContext2D, points: any[], width: number, height: number, axisLeft: number, axisRight: number, labelColor: string) {
  const maxLabels = Math.min(6, points.length);
  const labelIndexes = new Set<number>();
  if (points.length === 1) {
    labelIndexes.add(0);
  } else {
    for (let i = 0; i < maxLabels; i++) {
      labelIndexes.add(Math.round((i * (points.length - 1)) / (maxLabels - 1)));
    }
  }

  ctx.fillStyle = labelColor;
  ctx.font = '12px sans-serif';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';

  points.forEach((point, index) => {
    if (!labelIndexes.has(index)) return;
    const x = Math.min(Math.max(point.x, axisLeft), width - axisRight);
    ctx.fillText(point.label, x, height - 26);
  });
}

function drawTrendEmptyState(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? '#334155' : '#e2e8f0';
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const y = (height / 5) * i;
    ctx.beginPath();
    ctx.moveTo(28, y);
    ctx.lineTo(width - 18, y);
    ctx.stroke();
  }
}
