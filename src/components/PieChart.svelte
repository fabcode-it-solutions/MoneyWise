<script lang="ts">
  import { onMount } from 'svelte';
  import { renderPieChart } from '../lib/charts.js';
  import { t } from '../lib/i18n.svelte.js';
  import type { CategoryData } from '../types.js';

  let { categoryData = [], total = 0, currency = 'USD' } = $props<{
    categoryData?: CategoryData[];
    total?: number;
    currency?: string;
  }>();

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let legendHtml = $state<string>('');

  function draw() {
    if (!canvasEl) return;
    const result = renderPieChart(canvasEl, categoryData, total, currency);
    legendHtml = result.legendHtml;
  }

  $effect(() => {
    categoryData;
    total;
    currency;
    draw();
  });

  onMount(() => {
    draw();
  });
</script>

<div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 animate-fade-in">
  <div class="flex items-center gap-2 mb-4">
    <i class="ph ph-chart-pie-slice text-blue-600"></i>
    <h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100">{t('charts.expenseBreakdown')}</h2>
  </div>
  <div class="flex flex-col items-center">
    <canvas bind:this={canvasEl} class="max-w-full"></canvas>
    {#if legendHtml}
      <div class="mt-4 w-full space-y-2">
        {@html legendHtml}
      </div>
    {:else if categoryData.length === 0}
      <p class="text-slate-400 dark:text-slate-500 text-sm mt-4">{t('charts.noExpenseData')}</p>
    {/if}
  </div>
</div>
