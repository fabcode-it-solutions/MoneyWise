<script lang="ts">
  import { chartColors, categoryIcons } from '../lib/constants.js';
  import { formatMoney } from '../lib/currency.js';
  import { t } from '../lib/i18n.svelte.js';

  let { categoryData = [], total = 0, currency = 'USD' } = $props();

  let topCategories = $derived(
    [...categoryData]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  );
</script>

<div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 animate-fade-in">
  <div class="flex items-center gap-2 mb-4">
    <i class="ph ph-list-bullets text-blue-600"></i>
    <h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100">{t('charts.topTypes')}</h2>
  </div>
  <div class="space-y-3">
    {#each topCategories as cat, i}
      {@const percentage = total > 0 ? (cat.amount / total) * 100 : 0}
      {@const color = chartColors[i % chartColors.length]}
      {@const icon = categoryIcons[cat.category] || categoryIcons['Other']}
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-lg" style="background: {color}20">
          <i class="ph {icon} text-sm" style="color: {color}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex justify-between items-center mb-1">
            <span class="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{cat.category}</span>
            <span class="text-sm font-semibold text-slate-800 dark:text-slate-100">{formatMoney(cat.amount, currency)}</span>
          </div>
          <div class="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
            <div class="h-full rounded-full transition-all duration-500" style="width: {percentage}%; background: {color}"></div>
          </div>
        </div>
        <span class="text-xs text-slate-400 dark:text-slate-500 w-10 text-right">{percentage.toFixed(0)}%</span>
      </div>
    {/each}
    {#if topCategories.length === 0}
      <p class="text-slate-400 dark:text-slate-500 text-sm text-center py-4">{t('charts.noTypeData')}</p>
    {/if}
  </div>
</div>
