<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentCurrency } from '../lib/state.svelte.js';
  import { formatMoney } from '../lib/currency.js';
  import { loadRecurringExpenses, updateRecurring } from '../lib/api.js';
  import { t, getLocale } from '../lib/i18n.svelte.js';
  import type { Expense } from '../types.js';

  let { type = 'expense' }: { type?: 'income' | 'expense' } = $props();

  let recurring = $state<Expense[]>([]);
  let loading = $state(true);

  let amountColorClass = $derived(type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400');
  let amountPrefix = $derived(type === 'income' ? '+' : '');

  const frequencyLabels = $derived<Record<string, string>>({
    daily: t('freq.daily'),
    weekly: t('freq.weekly'),
    biweekly: t('freq.biweekly'),
    monthly: t('freq.monthly'),
    yearly: t('freq.yearly'),
  });

  const frequencyIcons: Record<string, string> = {
    daily: 'ph-sun',
    weekly: 'ph-calendar',
    biweekly: 'ph-calendar-blank',
    monthly: 'ph-calendar-check',
    yearly: 'ph-calendar-star',
  };

  async function refresh() {
    loading = true;
    recurring = (await loadRecurringExpenses()).filter(r => r.type === type);
    loading = false;
  }

  onMount(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('expense-changed', handler);
    window.addEventListener('edit-expense', handler);
    window.addEventListener('edit-income', handler);
    return () => {
      window.removeEventListener('expense-changed', handler);
      window.removeEventListener('edit-expense', handler);
      window.removeEventListener('edit-income', handler);
    };
  });

  function formatDueDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const due = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffMs = due.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return t('recurring.overdue');
    if (diffDays === 0) return t('recurring.today');
    if (diffDays === 1) return t('recurring.tomorrow');
    if (diffDays <= 7) return t('recurring.inDays', { count: diffDays });
    return new Date(date).toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' });
  }

  function dueDateClass(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const due = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffMs = due.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'text-rose-600 dark:text-rose-400 font-semibold';
    if (diffDays === 0) return 'text-amber-600 dark:text-amber-400 font-semibold';
    if (diffDays <= 3) return 'text-amber-600 dark:text-amber-400';
    return 'text-slate-500 dark:text-slate-400';
  }

  async function handlePause(item: Expense) {
    if (!item.recurrence) return;
    await updateRecurring(item.id, { isActive: false });
    await refresh();
    // Notify parent to refresh expenses
    window.dispatchEvent(new CustomEvent('expense-changed'));
  }

  async function handleResume(item: Expense) {
    if (!item.recurrence) return;
    await updateRecurring(item.id, { isActive: true });
    await refresh();
    window.dispatchEvent(new CustomEvent('expense-changed'));
  }

  let activeRecurring = $derived(recurring.filter(r => r.recurrence?.isActive));
  let pausedRecurring = $derived(recurring.filter(r => r.recurrence && !r.recurrence.isActive));
  let totalMonthly = $derived(
    recurring
      .filter(r => r.recurrence?.isActive)
      .reduce((sum, r) => {
        const freq = r.recurrence?.frequency;
        if (freq === 'daily') return sum + r.amount * 30;
        if (freq === 'weekly') return sum + r.amount * 4.33;
        if (freq === 'biweekly') return sum + r.amount * 2.17;
        if (freq === 'monthly') return sum + r.amount;
        if (freq === 'yearly') return sum + r.amount / 12;
        return sum;
      }, 0)
  );
</script>

{#if !loading && recurring.length > 0}
  <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <i class="ph ph-repeat text-blue-600 text-lg"></i>
        <h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100">{t(type === 'income' ? 'recurring.titleIncome' : 'recurring.titleExpense')}</h2>
      </div>
      {#if activeRecurring.length > 0}
        <div class="text-right">
          <p class="text-xs text-slate-500 dark:text-slate-400">{t('recurring.estMonthly')}</p>
          <p class="text-sm font-semibold text-blue-600 dark:text-blue-400">
            {formatMoney(totalMonthly, getCurrentCurrency())}
          </p>
        </div>
      {/if}
    </div>

    {#if activeRecurring.length > 0}
      <div class="space-y-2 mb-4">
        {#each activeRecurring as item (item.id)}
          <div class="flex items-center justify-between py-2.5 px-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-700">
            <div class="flex items-center gap-3 min-w-0">
              <div class="p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-md flex-shrink-0">
                <i class="ph {frequencyIcons[item.recurrence?.frequency || 'monthly']} text-blue-600 dark:text-blue-400 text-sm"></i>
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{item.category}</span>
                  <span class="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    {frequencyLabels[item.recurrence?.frequency || 'monthly']}
                  </span>
                </div>
                <p class="text-xs {dueDateClass(item.recurrence?.nextDueDate || '')}">
                  {t('recurring.next', { date: formatDueDate(item.recurrence?.nextDueDate || '') })}
                  {#if item.recurrence?.endDate}
                    &middot; {t('recurring.ends', { date: new Date(item.recurrence.endDate).toLocaleDateString(getLocale(), { month: 'short', day: 'numeric', year: 'numeric' }) })}
                  {/if}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <span class="text-sm font-semibold {amountColorClass}">
                {amountPrefix}{formatMoney(item.amount, getCurrentCurrency())}
              </span>
              <button onclick={() => handlePause(item)} class="text-slate-400 hover:text-amber-600 transition-colors p-1" title={t('recurring.pause')}>
                <i class="ph ph-pause text-sm"></i>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if pausedRecurring.length > 0}
      <div class="border-t border-slate-100 dark:border-slate-700 pt-3 mt-3">
        <p class="text-xs text-slate-400 dark:text-slate-500 mb-2 font-medium uppercase tracking-wider">{t('recurring.paused')}</p>
        <div class="space-y-2">
          {#each pausedRecurring as item (item.id)}
            <div class="flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg opacity-60">
              <div class="flex items-center gap-3 min-w-0">
                <div class="p-1.5 bg-slate-100 dark:bg-slate-600 rounded-md flex-shrink-0">
                  <i class="ph ph-pause text-slate-400 text-sm"></i>
                </div>
                <div class="min-w-0">
                  <span class="text-sm font-medium text-slate-600 dark:text-slate-400 truncate">{item.category}</span>
                  <p class="text-xs text-slate-400 dark:text-slate-500">
                    {frequencyLabels[item.recurrence?.frequency || 'monthly']} &middot; {t('recurring.paused')}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <span class="text-sm text-slate-500 dark:text-slate-400">
                  {formatMoney(item.amount, getCurrentCurrency())}
                </span>
                <button onclick={() => handleResume(item)} class="text-slate-400 hover:text-emerald-600 transition-colors p-1" title={t('recurring.resume')}>
                  <i class="ph ph-play text-sm"></i>
                </button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}
