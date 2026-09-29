<script lang="ts">
  import { untrack } from 'svelte';
  import { getExpense, getCurrentCurrency, removeExpenseItem, getExpenseTrendRange, setExpenseTrendRange, getCurrentSpaceId, getCurrentSpace, getAllCategories, getExpenseMode, navigate, confirmDialog } from '../lib/state.svelte.js';
  import { calculateExpenseSummary, calculateExpenseByCategory, calculateMemberBreakdown } from '../lib/calculations.svelte.js';
  import { calculateExpenseTrendData } from '../lib/utils.js';
  import { formatMoney } from '../lib/currency.js';
  import { deleteExpenseOnServer } from '../lib/api.js';
  import { t } from '../lib/i18n.svelte.js';
  import { getFlatpickrLocale } from '../lib/flatpickrLocale.js';
  import type { Expense, ExpenseSummary, CategoryData, TrendPoint } from '../types.js';
  import BudgetOverview from '../components/BudgetOverview.svelte';
  import RecurringUpcoming from '../components/RecurringUpcoming.svelte';
  import PieChart from '../components/PieChart.svelte';
  import TopCategories from '../components/TopCategories.svelte';
  import TrendChart from '../components/TrendChart.svelte';
  import ExpenseItem from '../components/ExpenseItem.svelte';
  import MemberBreakdown from '../components/MemberBreakdown.svelte';

  let mode = $derived(getExpenseMode());
  let modeDropdownOpen = $state<boolean>(false);

  let summary = $state<ExpenseSummary>({ total: 0, count: 0, average: 0 });
  let categoryData = $state<CategoryData[]>([]);
  let categoryTotal = $state<number>(0);
  let trendPoints = $state<TrendPoint[]>([]);
  let trendTotal = $state<number>(0);
  let trendAverage = $state<number>(0);
  let trendPeriodLabel = $state<string>('');
  let expenseItems = $state<Expense[]>([]);
  let recentExpenses = $state<Expense[]>([]);
  let displayedItems = $state<Expense[]>([]);
  let searchQuery = $state<string>('');
  let sortBy = $state<'date' | 'amount' | 'category'>('date');
  let sortDir = $state<'asc' | 'desc'>('desc');
  let trendRange = $state<string>(getExpenseTrendRange());
  let memberData = $state<CategoryData[]>([]);
  let memberTotal = $state<number>(0);
  let inSpace = $derived(!!getCurrentSpaceId());

  // Filters (list mode) — search, sort, and all filters live in one dropdown
  let filterDropdownOpen = $state<boolean>(false);
  let filterDateFrom = $state<string>('');
  let filterDateTo = $state<string>('');
  let filterAmountMin = $state<string>('');
  let filterAmountMax = $state<string>('');
  let filterCategories = $state<string[]>([]);
  let filterContributors = $state<string[]>([]);
  let filterRecurringOnly = $state<boolean>(false);
  let dateFromInputEl = $state<HTMLInputElement | null>(null);
  let dateToInputEl = $state<HTMLInputElement | null>(null);
  let fpFrom = $state<any>(null);
  let fpTo = $state<any>(null);

  let availableCategories = $derived(getAllCategories('expense'));
  let availableContributors = $derived.by(() => {
    const space = getCurrentSpace();
    if (space) return space.members.map(m => m.nickname).filter(Boolean).sort();
    const names = new Set<string>();
    for (const i of expenseItems) if (i.familyMember) names.add(i.familyMember);
    return [...names].sort();
  });
  let activeFilterCount = $derived(
    (filterDateFrom ? 1 : 0) +
    (filterDateTo ? 1 : 0) +
    (filterAmountMin ? 1 : 0) +
    (filterAmountMax ? 1 : 0) +
    (filterCategories.length > 0 ? 1 : 0) +
    (filterContributors.length > 0 ? 1 : 0) +
    (filterRecurringOnly ? 1 : 0)
  );

  // List mode's filter panel (and these date inputs) is only mounted while
  // mode === 'list', so flatpickr must attach/detach on that transition
  // rather than once on component mount.
  $effect(() => {
    if (!dateFromInputEl) return;
    let cancelled = false;
    let instance: any = null;
    import('flatpickr').then(async (mod) => {
      if (cancelled) return;
      instance = mod.default(dateFromInputEl as HTMLElement, {
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'd/m/Y',
        locale: await getFlatpickrLocale(mod.default),
        disableMobile: true,
        defaultDate: filterDateFrom || undefined,
        onChange: (selectedDates: Date[]) => {
          filterDateFrom = selectedDates[0] ? selectedDates[0].toISOString().split('T')[0] : '';
        }
      });
      fpFrom = instance;
    });
    return () => {
      cancelled = true;
      instance?.destroy();
      fpFrom = null;
    };
  });

  $effect(() => {
    if (!dateToInputEl) return;
    let cancelled = false;
    let instance: any = null;
    import('flatpickr').then(async (mod) => {
      if (cancelled) return;
      instance = mod.default(dateToInputEl as HTMLElement, {
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'd/m/Y',
        locale: await getFlatpickrLocale(mod.default),
        disableMobile: true,
        defaultDate: filterDateTo || undefined,
        onChange: (selectedDates: Date[]) => {
          filterDateTo = selectedDates[0] ? selectedDates[0].toISOString().split('T')[0] : '';
        }
      });
      fpTo = instance;
    });
    return () => {
      cancelled = true;
      instance?.destroy();
      fpTo = null;
    };
  });

  function selectMode(m: 'overview' | 'list') {
    modeDropdownOpen = false;
    navigate(m === 'list' ? '/expense/list' : '/expense');
  }

  function toggleCategoryFilter(cat: string) {
    filterCategories = filterCategories.includes(cat) ? filterCategories.filter(c => c !== cat) : [...filterCategories, cat];
  }

  function toggleContributorFilter(name: string) {
    filterContributors = filterContributors.includes(name) ? filterContributors.filter(c => c !== name) : [...filterContributors, name];
  }

  function clearFilters() {
    filterDateFrom = '';
    filterDateTo = '';
    filterAmountMin = '';
    filterAmountMax = '';
    filterCategories = [];
    filterContributors = [];
    filterRecurringOnly = false;
    fpFrom?.clear();
    fpTo?.clear();
  }

  async function refresh() {
    const expense = getExpense();
    const currency = getCurrentCurrency();
    expenseItems = expense.filter(i => i.type === 'expense');
    const [s, c, tr, m] = await Promise.all([
      calculateExpenseSummary(expense, currency),
      calculateExpenseByCategory(expense, currency),
      calculateExpenseTrendData(expense, trendRange, currency),
      calculateMemberBreakdown(expenseItems, currency)
    ]);
    if (cancelled) return;
    summary = s;
    categoryData = c.data;
    categoryTotal = c.total;
    trendPoints = tr.points;
    trendTotal = tr.total;
    trendAverage = tr.average;
    trendPeriodLabel = tr.periodLabel;
    recentExpenses = expenseItems.slice(0, 10);
    memberData = m.data;
    memberTotal = m.total;
    applyFilters();
  }

  function applyFilters() {
    let items = [...expenseItems];

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

    if (filterDateFrom) items = items.filter(i => i.date >= filterDateFrom);
    if (filterDateTo) items = items.filter(i => i.date <= filterDateTo);

    const min = parseFloat(filterAmountMin);
    if (!Number.isNaN(min)) items = items.filter(i => i.amount >= min);
    const max = parseFloat(filterAmountMax);
    if (!Number.isNaN(max)) items = items.filter(i => i.amount <= max);

    if (filterCategories.length > 0) {
      items = items.filter(i => filterCategories.includes(i.category));
    }

    if (filterContributors.length > 0) {
      items = items.filter(i => {
        const contributor = i.authorNickname || i.familyMember;
        return !!contributor && filterContributors.includes(contributor);
      });
    }

    if (filterRecurringOnly) items = items.filter(i => !!i.recurrence);

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
    trendRange;
    untrack(() => refresh());
    return () => { cancelled = true; };
  });

  $effect(() => {
    searchQuery;
    sortBy;
    sortDir;
    filterDateFrom;
    filterDateTo;
    filterAmountMin;
    filterAmountMax;
    filterCategories;
    filterContributors;
    filterRecurringOnly;
    applyFilters();
  });

  function handleTrendChange(r: string) {
    trendRange = r;
    setExpenseTrendRange(r);
  }

  function toggleSort(field: 'date' | 'amount' | 'category') {
    if (sortBy === field) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = field;
      sortDir = 'desc';
    }
  }

  function handleEdit(item: Expense) {
    const ev = new CustomEvent<Expense>('edit-expense', { detail: item });
    window.dispatchEvent(ev);
  }

  async function handleDelete(id: string) {
    if (await confirmDialog(t('expense.deleteConfirm'))) {
      const deleted = await deleteExpenseOnServer(id);
      if (deleted) {
        removeExpenseItem(id);
      } else {
        alert(t('expense.unableDelete'));
      }
    }
  }
</script>

<div class="space-y-6">
  <div class="flex flex-wrap items-center gap-3">
    <div class="relative inline-block">
      <button type="button" onclick={() => modeDropdownOpen = !modeDropdownOpen}
        aria-label={t('expense.viewMode')}
        class="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-semibold text-slate-800 dark:text-slate-100 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">
        <i class="ph {mode === 'list' ? 'ph-list-bullets' : 'ph-squares-four'} text-blue-600"></i>
        {mode === 'list' ? t('expense.modeList') : t('expense.modeOverview')}
        <i class="ph ph-caret-down text-xs text-slate-400"></i>
      </button>

      {#if modeDropdownOpen}
        <div role="presentation" class="fixed inset-0 z-40" onclick={() => modeDropdownOpen = false}></div>
        <div class="absolute left-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg z-50 py-1 animate-fade-in">
          <button onclick={() => selectMode('overview')}
            class="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors {mode === 'overview' ? 'text-blue-600 font-medium' : 'text-slate-700 dark:text-slate-200'}">
            <i class="ph ph-squares-four"></i>
            {t('expense.modeOverview')}
            {#if mode === 'overview'}<i class="ph ph-check ml-auto text-blue-600"></i>{/if}
          </button>
          <button onclick={() => selectMode('list')}
            class="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors {mode === 'list' ? 'text-blue-600 font-medium' : 'text-slate-700 dark:text-slate-200'}">
            <i class="ph ph-list-bullets"></i>
            {t('expense.modeList')}
            {#if mode === 'list'}<i class="ph ph-check ml-auto text-blue-600"></i>{/if}
          </button>
        </div>
      {/if}
    </div>

    {#if mode === 'list'}
      <div class="relative inline-block">
        <button type="button" onclick={() => filterDropdownOpen = !filterDropdownOpen}
          class="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-semibold text-slate-800 dark:text-slate-100 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">
          <i class="ph ph-funnel text-blue-600"></i>
          {t('filter.filters')}
          {#if activeFilterCount > 0}
            <span class="min-w-4 h-4 px-1 flex items-center justify-center rounded-full text-[10px] font-bold bg-blue-600 text-white">{activeFilterCount}</span>
          {/if}
          <i class="ph ph-caret-down text-xs text-slate-400"></i>
        </button>

        {#if filterDropdownOpen}
          <div role="presentation" class="fixed inset-0 z-40" onclick={() => filterDropdownOpen = false}></div>
          <div class="absolute left-0 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[32rem] overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg z-50 p-4 space-y-4 animate-fade-in">
            <div>
              <label for="expense-filter-search" class="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t('expense.searchPlaceholder')}</label>
              <div class="relative">
                <i class="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                <input id="expense-filter-search" type="text" placeholder={t('expense.searchPlaceholder')}
                  bind:value={searchQuery}
                  class="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div>
              <p class="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t('list.sortDate')} / {t('list.sortAmount')}</p>
              <div class="flex gap-1">
                {#each [{k:'date' as const,l:t('list.sortDate')},{k:'amount' as const,l:t('list.sortAmount')}] as opt}
                  <button onclick={() => toggleSort(opt.k)}
                    class="px-3 py-1.5 text-xs rounded-lg font-medium transition-colors {sortBy === opt.k ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}">
                    {opt.l}
                    {#if sortBy === opt.k}
                      <i class="ph ph-caret-{sortDir === 'asc' ? 'up' : 'down'} ml-1"></i>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="expense-filter-date-from" class="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t('filter.dateFrom')}</label>
                <input id="expense-filter-date-from" bind:this={dateFromInputEl} type="text" bind:value={filterDateFrom} placeholder={t('filter.dateFrom')}
                  class="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label for="expense-filter-date-to" class="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t('filter.dateTo')}</label>
                <input id="expense-filter-date-to" bind:this={dateToInputEl} type="text" bind:value={filterDateTo} placeholder={t('filter.dateTo')}
                  class="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="expense-filter-amount-min" class="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t('filter.amountMin')}</label>
                <input id="expense-filter-amount-min" type="number" step="0.01" bind:value={filterAmountMin} placeholder="0.00"
                  class="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label for="expense-filter-amount-max" class="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t('filter.amountMax')}</label>
                <input id="expense-filter-amount-max" type="number" step="0.01" bind:value={filterAmountMax} placeholder="0.00"
                  class="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div>
              <p class="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t('filter.category')}</p>
              {#if availableCategories.length === 0}
                <p class="text-xs text-slate-400 dark:text-slate-500">{t('filter.allCategories')}</p>
              {:else}
                <div class="max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-lg">
                  {#each availableCategories as cat (cat)}
                    <label class="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-slate-700 dark:text-slate-200">
                      <input type="checkbox" checked={filterCategories.includes(cat)} onchange={() => toggleCategoryFilter(cat)} class="rounded text-blue-600 focus:ring-blue-500" />
                      <span class="truncate">{cat}</span>
                    </label>
                  {/each}
                </div>
              {/if}
            </div>

            {#if availableContributors.length > 0}
              <div>
                <p class="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t('filter.contributor')}</p>
                <div class="max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-lg">
                  {#each availableContributors as name (name)}
                    <label class="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-slate-700 dark:text-slate-200">
                      <input type="checkbox" checked={filterContributors.includes(name)} onchange={() => toggleContributorFilter(name)} class="rounded text-blue-600 focus:ring-blue-500" />
                      <span class="truncate">{name}</span>
                    </label>
                  {/each}
                </div>
              </div>
            {/if}

            <label class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" bind:checked={filterRecurringOnly} class="rounded text-blue-600 focus:ring-blue-500" />
              {t('filter.recurringOnly')}
            </label>

            {#if activeFilterCount > 0}
              <button onclick={clearFilters} class="text-xs font-medium text-blue-600 hover:underline cursor-pointer">
                {t('filter.clear')}
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if mode === 'overview'}
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <p class="text-sm text-slate-500 dark:text-slate-400">{t('expense.total')}</p>
        <p class="text-2xl font-bold text-rose-600">{formatMoney(summary.total, getCurrentCurrency())}</p>
      </div>
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <p class="text-sm text-slate-500 dark:text-slate-400">{t('expense.entries')}</p>
        <p class="text-2xl font-bold text-slate-800 dark:text-slate-100">{summary.count}</p>
      </div>
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <p class="text-sm text-slate-500 dark:text-slate-400">{t('expense.average')}</p>
        <p class="text-2xl font-bold text-orange-600">{formatMoney(summary.average, getCurrentCurrency())}</p>
      </div>
    </div>

    <BudgetOverview />

    <RecurringUpcoming type="expense" />

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <PieChart {categoryData} total={categoryTotal} currency={getCurrentCurrency()} />
      <TopCategories {categoryData} total={categoryTotal} currency={getCurrentCurrency()} />
    </div>

    <TrendChart points={trendPoints} total={trendTotal} average={trendAverage} periodLabel={trendPeriodLabel} currency={getCurrentCurrency()} range={trendRange} onRangeChange={handleTrendChange} />

    {#if inSpace}
      <MemberBreakdown {memberData} total={memberTotal} currency={getCurrentCurrency()} />
    {/if}

    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100">{t('expense.recentExpenses')}</h2>
        <button onclick={() => selectMode('list')} class="text-xs font-medium text-blue-600 hover:underline cursor-pointer">
          {t('expense.modeList')}
        </button>
      </div>
      {#if recentExpenses.length === 0}
        <p class="text-slate-500 dark:text-slate-400 text-center py-8">{t('expense.noEntriesYet')}</p>
      {:else}
        <ul class="space-y-2">
          {#each recentExpenses as item (item.id)}
            <ExpenseItem {item}
              options={{
                showTypeBadge: false,
                useTypeIcon: true,
                iconBgClass: 'bg-rose-100',
                iconColorClass: 'text-rose-600',
                amountColorClass: 'text-rose-600',
                amountPrefix: ''
              }}
              onedit={() => {}}
              ondelete={handleDelete} />
          {/each}
        </ul>
      {/if}
    </div>
  {:else}
    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
      {#if displayedItems.length === 0}
        <p class="text-slate-500 dark:text-slate-400 text-center py-8">{searchQuery || activeFilterCount > 0 ? t('expense.noMatching') : t('expense.noEntriesYet')}</p>
      {:else}
        <ul class="space-y-2">
          {#each displayedItems as item (item.id)}
            <ExpenseItem {item}
              options={{
                showTypeBadge: false,
                useTypeIcon: true,
                iconBgClass: 'bg-rose-100',
                iconColorClass: 'text-rose-600',
                amountColorClass: 'text-rose-600',
                amountPrefix: '-'
              }}
              onedit={handleEdit}
              ondelete={handleDelete} />
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>
