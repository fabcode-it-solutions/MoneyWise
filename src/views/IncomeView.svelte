<script lang="ts">
  import { untrack } from 'svelte';
  import { getExpense, getCurrentCurrency, addExpenseItem, removeExpenseItem, getCurrentSpaceId, confirmDialog } from '../lib/state.svelte.js';
  import { calculateIncomeSummary, calculateMemberBreakdown } from '../lib/calculations.svelte.js';
  import { formatMoney } from '../lib/currency.js';
  import { deleteExpenseOnServer } from '../lib/api.js';
  import { t } from '../lib/i18n.svelte.js';
  import type { Expense, CategoryData } from '../types.js';
  import ExpenseItem from '../components/ExpenseItem.svelte';
  import MemberBreakdown from '../components/MemberBreakdown.svelte';
  import RecurringUpcoming from '../components/RecurringUpcoming.svelte';
  import IncomeForm from '../components/IncomeForm.svelte';

  let summary = $state<{ total: number; count: number; average: number }>({ total: 0, count: 0, average: 0 });
  let incomeItems = $state<Expense[]>([]);
  let displayedItems = $state<Expense[]>([]);
  let searchQuery = $state<string>('');
  let sortBy = $state<'date' | 'amount' | 'category'>('date');
  let sortDir = $state<'asc' | 'desc'>('desc');
  let memberData = $state<CategoryData[]>([]);
  let memberTotal = $state<number>(0);
  let inSpace = $derived(!!getCurrentSpaceId());

  async function refresh() {
    const expense = getExpense();
    const currency = getCurrentCurrency();
    incomeItems = expense.filter(i => i.type === 'income');
    summary = await calculateIncomeSummary(expense, currency);
    if (cancelled) return;
    const m = await calculateMemberBreakdown(incomeItems, currency);
    if (cancelled) return;
    memberData = m.data;
    memberTotal = m.total;
    applyFilters();
  }

  function applyFilters() {
    let items = [...incomeItems];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i =>
        (i.category?.toLowerCase().includes(q)) ||
        (i.name?.toLowerCase().includes(q)) ||
        (i.note?.toLowerCase().includes(q)) ||
        (i.familyMember?.toLowerCase().includes(q)) ||
        (i.authorNickname?.toLowerCase().includes(q))
      );
    }

    items.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') {
        cmp = a.date.localeCompare(b.date);
      } else if (sortBy === 'amount') {
        cmp = a.amount - b.amount;
      } else if (sortBy === 'category') {
        cmp = (a.category || '').localeCompare(b.category || '');
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    displayedItems = items;
  }

  let cancelled = $state<boolean>(false);

  $effect(() => {
    cancelled = false;
    getExpense();
    getCurrentCurrency();
    untrack(() => refresh());
    return () => { cancelled = true; };
  });

  $effect(() => {
    searchQuery;
    sortBy;
    sortDir;
    applyFilters();
  });

  function toggleSort(field: 'date' | 'amount' | 'category') {
    if (sortBy === field) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = field;
      sortDir = 'desc';
    }
  }

  async function handleAdd(saved: Expense | null) {
    if (saved) addExpenseItem(saved);
  }

  function handleEdit(item: Expense) {
    const ev = new CustomEvent<Expense>('edit-income', { detail: item });
    window.dispatchEvent(ev);
  }

  async function handleDelete(id: string) {
    if (await confirmDialog(t('income.deleteConfirm'))) {
      const deleted = await deleteExpenseOnServer(id);
      if (deleted) {
        removeExpenseItem(id);
      } else {
        alert(t('income.unableDelete'));
      }
    }
  }
</script>

<div class="space-y-6">
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
      <p class="text-sm text-slate-500 dark:text-slate-400">{t('income.total')}</p>
      <p class="text-2xl font-bold text-emerald-600">{formatMoney(summary.total, getCurrentCurrency())}</p>
    </div>
    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
      <p class="text-sm text-slate-500 dark:text-slate-400">{t('income.entries')}</p>
      <p class="text-2xl font-bold text-slate-800 dark:text-slate-100">{summary.count}</p>
    </div>
    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
      <p class="text-sm text-slate-500 dark:text-slate-400">{t('income.average')}</p>
      <p class="text-2xl font-bold text-blue-600">{formatMoney(summary.average, getCurrentCurrency())}</p>
    </div>
  </div>

  <RecurringUpcoming type="income" />

  <IncomeForm onadd={handleAdd} />

  {#if inSpace}
    <MemberBreakdown {memberData} total={memberTotal} currency={getCurrentCurrency()} />
  {/if}

  <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100">{t('income.entries')}</h2>
      <div class="flex flex-col sm:flex-row gap-3 flex-1 sm:justify-end">
        <div class="relative max-w-xs w-full">
          <i class="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
          <input type="text" placeholder={t('income.searchPlaceholder')}
            bind:value={searchQuery}
            class="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div class="flex gap-1">
          {#each [{k:'date' as const,l:t('list.sortDate')},{k:'amount' as const,l:t('list.sortAmount')}] as opt}
            <button onclick={() => toggleSort(opt.k)}
              class="px-3 py-2 text-xs rounded-lg font-medium transition-colors {sortBy === opt.k ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}">
              {opt.l}
              {#if sortBy === opt.k}
                <i class="ph ph-caret-{sortDir === 'asc' ? 'up' : 'down'} ml-1"></i>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    </div>

    {#if displayedItems.length === 0}
      <p class="text-slate-500 dark:text-slate-400 text-center py-8">{searchQuery ? t('income.noMatching') : t('income.noEntriesYet')}</p>
    {:else}
      <ul class="space-y-2">
        {#each displayedItems as item (item.id)}
          <ExpenseItem {item}
            options={{
              showTypeBadge: false,
              useTypeIcon: true,
              iconBgClass: 'bg-emerald-100',
              iconColorClass: 'text-emerald-600',
              amountColorClass: 'text-emerald-600',
              amountPrefix: '+'
            }}
            onedit={handleEdit}
            ondelete={handleDelete} />
        {/each}
      </ul>
    {/if}
  </div>
</div>
