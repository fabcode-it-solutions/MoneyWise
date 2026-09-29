<script lang="ts">
  import { untrack } from 'svelte';
  import { categoryIcons } from '../lib/constants.js';
  import { getCurrentCurrency } from '../lib/state.svelte.js';
  import { formatDate } from '../lib/utils.js';
  import { convertToDisplayCurrency, formatMoney } from '../lib/currency.js';
  import { t } from '../lib/i18n.svelte.js';

  let { item, options, onedit, ondelete } = $props();

  let convertedAmount = $state(0);
  let convertedCurrency = $state(getCurrentCurrency());

  $effect(() => {
    if (item) {
      untrack(() => {
        convertToDisplayCurrency(item.amount, item.currency, getCurrentCurrency()).then(r => {
          convertedAmount = r.amount;
          convertedCurrency = r.currency;
        });
      });
    }
  });

  const iconName = $derived(
    options.useTypeIcon
      ? (item.type === 'income' ? 'ph-trend-up' : 'ph-trend-down')
      : (categoryIcons[item.category] || categoryIcons['Other'])
  );

  const frequencyLabels = $derived<Record<string, string>>({
    daily: t('freq.daily'),
    weekly: t('freq.weekly'),
    biweekly: t('freq.biweekly'),
    monthly: t('freq.monthly'),
    yearly: t('freq.yearly'),
  });
</script>

<li class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors animate-fade-in">
  <div class="flex items-center gap-3 flex-1 min-w-0">
    <div class="{options.iconBgClass} p-2 rounded-lg flex-shrink-0">
      <i class="ph {iconName} {options.iconColorClass}"></i>
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <p class="font-medium text-slate-800 dark:text-slate-100 truncate">{item.name || item.category}</p>
        {#if options.showTypeBadge}
          <span class="text-xs {item.type === 'income' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400'} px-1.5 py-0.5 rounded-full">{item.type}</span>
        {/if}
        {#if item.name}
          <span class="text-xs bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-300 px-1.5 py-0.5 rounded-full truncate max-w-[8rem]">{item.category}</span>
        {/if}
        {#if item.authorNickname}
          <span class="text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full">{item.authorNickname}</span>
        {:else if item.familyMember}
          <span class="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full">{item.familyMember}</span>
        {/if}
        {#if item.recurrence && item.recurrence.isActive}
          <span class="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
            <i class="ph ph-repeat text-[10px]"></i>
            {frequencyLabels[item.recurrence.frequency] || item.recurrence.frequency}
          </span>
        {/if}
      </div>
      <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>{formatDate(item.date)}</span>
        {#if item.note}
          <span>&bull;</span>
          <span class="truncate">{item.note}</span>
        {/if}
      </div>
    </div>
  </div>
  <div class="flex items-center gap-3">
    <div class="text-right">
      <p class="{options.amountColorClass} font-semibold">{options.amountPrefix}{formatMoney(convertedAmount, convertedCurrency)}</p>
      <p class="text-xs text-slate-400 dark:text-slate-500">
        {#if item.currency !== getCurrentCurrency()}
          {formatMoney(item.amount, item.currency)} &rarr; {convertedCurrency}
        {:else}
          {item.currency}
        {/if}
      </p>
    </div>
    <button onclick={() => onedit?.(item)} class="text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" aria-label={t('common.edit')}>
      <i class="ph ph-pencil-simple text-sm"></i>
    </button>
    <button onclick={() => ondelete?.(item.id)} class="text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors" aria-label={t('common.delete')}>
      <i class="ph ph-trash text-sm"></i>
    </button>
  </div>
</li>
