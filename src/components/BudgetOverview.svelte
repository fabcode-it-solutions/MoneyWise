<script lang="ts">
  import { untrack } from 'svelte';
  import { getBudgetGoals, getExpense, getCurrentCurrency } from '../lib/state.svelte.js';
  import { getCurrentMonthExpenseByCategory } from '../lib/calculations.svelte.js';
  import { formatMoney } from '../lib/currency.js';
  import { t } from '../lib/i18n.svelte.js';

  let budgetGoals = $derived(getBudgetGoals());
  let expense = $derived(getExpense());
  let currency = $derived(getCurrentCurrency());
  let monthlySpend = $state<Record<string, number>>({});

  $effect(() => {
    untrack(() => {
      getCurrentMonthExpenseByCategory(expense, currency).then(result => {
        monthlySpend = result;
      });
    });
  });

  let goalEntries = $derived(
    Object.entries(budgetGoals).filter(([cat]: [string, number]) => monthlySpend[cat] !== undefined)
  );

  let hasGoals = $derived(goalEntries.length > 0);
</script>

{#if hasGoals}
  <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 animate-fade-in">
    <div class="flex items-center gap-2 mb-4">
      <i class="ph ph-target text-blue-600"></i>
      <h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100">{t('budget.overview')}</h2>
    </div>
    <div class="space-y-4">
      {#each goalEntries as [category, goal]}
        {@const spent = monthlySpend[category] ?? 0}
        {@const percentage = Math.min((spent / goal) * 100, 100)}
        {@const isOver = spent > goal}
        <div>
          <div class="flex justify-between items-center mb-1">
            <span class="text-sm font-medium text-slate-700 dark:text-slate-300">{category}</span>
            <span class="text-xs {isOver ? 'text-rose-600' : 'text-slate-500 dark:text-slate-400'}">
              {formatMoney(spent, currency)} / {formatMoney(goal, currency)}
            </span>
          </div>
          <div class="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              class:bg-rose-500={isOver}
              class:bg-blue-500={!isOver}
              style="width: {percentage}%"
            ></div>
          </div>
          <p class="text-xs text-right mt-0.5 {isOver ? 'text-rose-500' : 'text-slate-400 dark:text-slate-500'}">
            {t(isOver ? 'budget.exceeded' : 'budget.used', { percent: percentage.toFixed(0) })}
          </p>
        </div>
      {/each}
    </div>
  </div>
{/if}
