<script lang="ts">
  import { untrack } from 'svelte';
  import { getExpense, getCurrentCurrency, setExpense, getBudgetGoals, setBudgetGoals, getCustomCategories, removeCustomCategory, getHiddenCategories, hideCategory, unhideCategory, getCurrentSpaceId, getSpaces, getUserId, confirmDialog } from '../lib/state.svelte.js';
  import { getCurrencySymbol, formatMoney } from '../lib/currency.js';
  import { t, getLocale } from '../lib/i18n.svelte.js';
  import { changePassword, deleteAllExpenses, deleteAccount, getProfile, deleteSpace, logout, uploadBulkExpenses, loadExpenses } from '../lib/api.js';
  import { calculateSummary } from '../lib/calculations.svelte.js';
  import { defaultExpenseCategories, defaultIncomeCategories } from '../lib/constants.js';
  import type { Profile, Expense, Summary } from '../types.js';
  import LanguageSelect from '../components/LanguageSelect.svelte';

  let profile = $state<Profile | null>(null);
  let stats = $state<Summary & { incomeCount: number; expenseCount: number }>({ income: 0, expenses: 0, balance: 0, expenseCount: 0, incomeCount: 0 });
  let isDark = $state<boolean>(document.documentElement.classList.contains('dark'));
  let currentPassword = $state<string>('');
  let newPassword = $state<string>('');
  let confirmPassword = $state<string>('');
  let passwordMessage = $state<string>('');
  let passwordError = $state<string>('');
  let newGoalCategory = $state<string>('');
  let newGoalAmount = $state<string>('');
  let goalMessage = $state<string>('');
  let importResult = $state<{ success: boolean; message: string } | null>(null);
  let isImporting = $state<boolean>(false);
  let isDeletingAll = $state<boolean>(false);
  let isDeletingAccount = $state<boolean>(false);
  let deleteAccountError = $state<string>('');

  async function loadProfile() {
    try {
      const data = await getProfile();
      profile = data;
    } catch {
      profile = { email: '' };
    }
  }

  async function refreshStats() {
    const expense = getExpense();
    const currency = getCurrentCurrency();
    const s = await calculateSummary(expense, currency);
    const incomeCount = expense.filter(i => i.type === 'income').length;
    const expenseCount = expense.filter(i => i.type === 'expense').length;
    stats = { ...s, incomeCount, expenseCount };
  }

  $effect(() => {
    getExpense();
    getCurrentCurrency();
    untrack(() => refreshStats());
  });

  $effect(() => {
    loadProfile();
  });

  function toggleDark() {
    isDark = !isDark;
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }

  async function handleChangePassword() {
    passwordMessage = '';
    passwordError = '';
    if (!currentPassword || !newPassword) {
      passwordError = t('common.fillAllFields');
      return;
    }
    if (newPassword.length < 6) {
      passwordError = t('account.passwordMinLength');
      return;
    }
    if (newPassword !== confirmPassword) {
      passwordError = t('account.passwordsDoNotMatch');
      return;
    }
    try {
      await changePassword(currentPassword, newPassword);
      passwordMessage = t('account.passwordUpdated');
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
    } catch (err) {
      passwordError = err instanceof Error ? err.message : t('common.unknownError');
    }
  }

  function handleExportCsv() {
    const expenses = getExpense();
    if (expenses.length === 0) return;
    const inSpace = !!getCurrentSpaceId();
    const headers = inSpace
      ? ['type', 'amount', 'category', 'date', 'name', 'contributor', 'note', 'currency']
      : ['type', 'amount', 'category', 'date', 'name', 'familyMember', 'note', 'currency'];
    const rows = expenses.map(e => headers.map(h => {
      const key = h === 'contributor' ? 'authorNickname' : h;
      const val = (e as Record<string, any>)[key] || '';
      return String(val).includes(',') ? `"${val}"` : val;
    }).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  let fileInput = $state<HTMLInputElement | null>(null);

  function triggerImport() {
    fileInput?.click();
  }

  async function handleFileSelect(ev: Event) {
    const target = ev.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    isImporting = true;
    importResult = null;
    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      if (lines.length < 2) {
        importResult = { success: false, message: t('account.csvEmpty') };
        return;
      }
      const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase());
      const rows = lines.slice(1).filter((l: string) => l.trim()).map((line: string) => {
        const values = line.split(',').map((v: string) => v.trim());
        const obj: Record<string, string> = {};
        headers.forEach((h: string, i: number) => obj[h] = values[i] || '');
        return obj;
      });
      const res = await uploadBulkExpenses(rows);
      await loadExpenses();
      importResult = { success: true, message: t('account.csvImported', { count: res.count || rows.length }) };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('account.csvImportFailed');
      importResult = { success: false, message: errorMessage };
    } finally {
      isImporting = false;
      target.value = '';
    }
  }

  function handleAddGoal() {
    goalMessage = '';
    if (!newGoalCategory || !newGoalAmount) {
      goalMessage = t('account.enterCategoryAndAmount');
      return;
    }
    const amount = parseFloat(newGoalAmount);
    if (isNaN(amount) || amount <= 0) {
      goalMessage = t('account.enterValidAmount');
      return;
    }
    const goals = { ...getBudgetGoals(), [newGoalCategory]: amount };
    setBudgetGoals(goals);
    newGoalCategory = '';
    newGoalAmount = '';
    goalMessage = t('account.goalAdded');
  }

  function handleDeleteGoal(category: string) {
    const goals = { ...getBudgetGoals() };
    delete goals[category];
    setBudgetGoals(goals);
  }

  async function handleDeleteCategory(type: string, name: string) {
    if (!await confirmDialog(t('account.deleteCategoryConfirm', { name }))) return;
    removeCustomCategory(type, name);
  }

  function toggleHiddenCategory(type: string, name: string, hidden: boolean) {
    if (hidden) unhideCategory(type, name);
    else hideCategory(type, name);
  }

  async function handleDeleteHub(spaceId: string, name: string) {
    if (!await confirmDialog(t('account.deleteHubConfirm', { name }))) return;
    try {
      await deleteSpace(spaceId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('common.unknownError');
      alert(t('account.failedDeleteHub', { message: errorMessage }));
    }
  }

  async function handleDeleteAll() {
    if (!await confirmDialog(t('account.deleteAllConfirm1'))) return;
    if (!await confirmDialog(t('account.deleteAllConfirm2'))) return;
    isDeletingAll = true;
    try {
      await deleteAllExpenses();
      setExpense([]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('common.unknownError');
      alert(t('account.failedDeleteAll', { message: errorMessage }));
    } finally {
      isDeletingAll = false;
    }
  }

  async function handleDeleteAccount() {
    if (!await confirmDialog(t('account.deleteAccountConfirm1'))) return;
    if (!await confirmDialog(t('account.deleteAccountConfirm2'))) return;
    isDeletingAccount = true;
    deleteAccountError = '';
    try {
      await deleteAccount();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('common.unknownError');
      deleteAccountError = t('account.failedDeleteAccount', { message: errorMessage });
    } finally {
      isDeletingAccount = false;
    }
  }

  async function handleLogout() {
    if (!await confirmDialog(t('account.logoutConfirm'))) return;
    await logout();
  }

  let ownedSpaces = $derived(getSpaces().filter(s => s.members.find(m => m.userId === getUserId())?.role === 'owner'));
  let goals = $derived(Object.entries(getBudgetGoals()));
  let customExpenseCategories = $derived(getCustomCategories('expense'));
  let customIncomeCategories = $derived(getCustomCategories('income'));
  let hiddenExpenseCategories = $derived(getHiddenCategories('expense'));
  let hiddenIncomeCategories = $derived(getHiddenCategories('income'));
</script>

<div class="w-full space-y-4">
  <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
    <div class="flex items-center gap-4">
      <div class="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
        {profile?.email ? profile.email[0].toUpperCase() : '?'}
      </div>
      <div class="min-w-0 flex-1 overflow-hidden">
        <h2 class="text-xl font-bold text-slate-800 dark:text-slate-100 truncate" title={profile?.email}>{profile?.email || t('common.loading')}</h2>
        <p class="text-sm text-slate-500 dark:text-slate-400 truncate">
          {#if profile?.createdAt}
            {t('account.memberSince', { date: new Date(profile.createdAt).toLocaleDateString(getLocale()) })}
          {:else}
            {profile ? t('account.accountDetails') : ''}
          {/if}
        </p>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
    <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">{t('account.stats')}</h3>
    <div class="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-4">
      <div class="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
        <p class="text-xs text-slate-500 dark:text-slate-400">{t('account.totalIncome')}</p>
        <p class="text-lg font-bold text-emerald-600">{formatMoney(stats.income, getCurrentCurrency())}</p>
      </div>
      <div class="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
        <p class="text-xs text-slate-500 dark:text-slate-400">{t('account.totalExpenses')}</p>
        <p class="text-lg font-bold text-rose-600">{formatMoney(stats.expenses, getCurrentCurrency())}</p>
      </div>
      <div class="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
        <p class="text-xs text-slate-500 dark:text-slate-400">{t('account.netBalance')}</p>
        <p class="text-lg font-bold {stats.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}">{formatMoney(stats.balance, getCurrentCurrency())}</p>
      </div>
      <div class="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
        <p class="text-xs text-slate-500 dark:text-slate-400">{t('account.transactions')}</p>
        <p class="text-lg font-bold text-slate-800 dark:text-slate-100">{stats.incomeCount + stats.expenseCount}</p>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
    <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">{t('account.export')}</h3>
    <div class="grid grid-cols-1 sm:flex sm:flex-wrap gap-3">
      <button onclick={handleExportCsv}
        class="w-full sm:w-auto px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2">
        <i class="ph ph-download"></i>
        {t('account.exportCsv')}
      </button>
    </div>
  </div>

  <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-100">{t('account.darkMode')}</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400">{t('account.toggleDarkTheme')}</p>
      </div>
      <button aria-label="Toggle dark mode" onclick={toggleDark}
        class="relative w-12 h-6 rounded-full transition-colors {isDark ? 'bg-blue-500' : 'bg-slate-300'}">
        <div class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform {isDark ? 'translate-x-6' : ''} flex items-center justify-center">
          <i class="ph {isDark ? 'ph-moon text-slate-800' : 'ph-sun text-yellow-500'} text-xs"></i>
        </div>
      </button>
    </div>
  </div>

  <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
    <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">{t('account.changePassword')}</h3>
    <div class="space-y-3">
      <input type="password" placeholder={t('account.currentPassword')} bind:value={currentPassword}
        class="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input type="password" placeholder={t('account.newPassword')} bind:value={newPassword}
        class="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input type="password" placeholder={t('account.confirmNewPassword')} bind:value={confirmPassword}
        class="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <button onclick={handleChangePassword}
        class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium">{t('account.updatePassword')}</button>
      {#if passwordMessage}
        <p class="text-sm text-emerald-600">{passwordMessage}</p>
      {/if}
      {#if passwordError}
        <p class="text-sm text-rose-600">{passwordError}</p>
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
    <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">{t('account.signOut')}</h3>
    <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('account.signOutDescription')}</p>
    <button onclick={handleLogout}
      class="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-2">
      <i class="ph ph-sign-out text-base"></i>
      {t('nav.logout')}
    </button>
  </div>

  <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
    <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">{t('account.budgetGoals')}</h3>
    <div class="flex flex-col sm:flex-row gap-2 mb-4">
      <input type="text" placeholder={t('account.categoryPlaceholder')} bind:value={newGoalCategory}
        class="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <div class="flex gap-2">
        <input type="number" placeholder={t('account.amountPlaceholder')} bind:value={newGoalAmount}
          class="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button onclick={handleAddGoal}
          class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium">{t('common.add')}</button>
      </div>
    </div>
    {#if goalMessage}
      <p class="text-sm text-slate-500 dark:text-slate-400 mb-3">{goalMessage}</p>
    {/if}
    {#if goals.length === 0}
      <p class="text-sm text-slate-500 dark:text-slate-400">{t('account.noBudgetGoals')}</p>
    {:else}
      <ul class="space-y-2">
        {#each goals as [category, amount]}
          <li class="flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
            <span class="font-medium text-slate-800 dark:text-slate-100">{category}</span>
            <div class="flex items-center gap-3">
              <span class="text-slate-600 dark:text-slate-300">{formatMoney(Number(amount), getCurrentCurrency())}</span>
              <button aria-label={t('account.deleteGoal')} onclick={() => handleDeleteGoal(category)} class="text-rose-500 hover:text-rose-700 transition-colors">
                <i class="ph ph-trash text-sm"></i>
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
    <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">{t('account.manageCategories')}</h3>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div class="space-y-4">
        <p class="text-xs font-medium text-slate-500 dark:text-slate-400">{t('type.expense')}</p>
        <div>
          <p class="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">{t('account.builtIn')}</p>
          <ul class="space-y-2">
            {#each defaultExpenseCategories as cat}
              {@const hidden = hiddenExpenseCategories.includes(cat)}
              <li class="flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <span class="font-medium {hidden ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-800 dark:text-slate-100'}">{cat}</span>
                <button aria-label={hidden ? t('account.showCategory') : t('account.hideCategory')} onclick={() => toggleHiddenCategory('expense', cat, hidden)} class="text-slate-500 hover:text-blue-600 transition-colors">
                  <i class="ph {hidden ? 'ph-eye-slash' : 'ph-eye'} text-sm"></i>
                </button>
              </li>
            {/each}
          </ul>
        </div>
        <div>
          <p class="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">{t('account.custom')}</p>
          {#if customExpenseCategories.length === 0}
            <p class="text-sm text-slate-400 dark:text-slate-500">{t('account.none')}</p>
          {:else}
            <ul class="space-y-2">
              {#each customExpenseCategories as cat}
                <li class="flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                  <span class="font-medium text-slate-800 dark:text-slate-100">{cat}</span>
                  <button aria-label={t('account.deleteCategory')} onclick={() => handleDeleteCategory('expense', cat)} class="text-rose-500 hover:text-rose-700 transition-colors">
                    <i class="ph ph-trash text-sm"></i>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
      <div class="space-y-4">
        <p class="text-xs font-medium text-slate-500 dark:text-slate-400">{t('type.income')}</p>
        <div>
          <p class="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">{t('account.builtIn')}</p>
          <ul class="space-y-2">
            {#each defaultIncomeCategories as cat}
              {@const hidden = hiddenIncomeCategories.includes(cat)}
              <li class="flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <span class="font-medium {hidden ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-800 dark:text-slate-100'}">{cat}</span>
                <button aria-label={hidden ? t('account.showCategory') : t('account.hideCategory')} onclick={() => toggleHiddenCategory('income', cat, hidden)} class="text-slate-500 hover:text-blue-600 transition-colors">
                  <i class="ph {hidden ? 'ph-eye-slash' : 'ph-eye'} text-sm"></i>
                </button>
              </li>
            {/each}
          </ul>
        </div>
        <div>
          <p class="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">{t('account.custom')}</p>
          {#if customIncomeCategories.length === 0}
            <p class="text-sm text-slate-400 dark:text-slate-500">{t('account.none')}</p>
          {:else}
            <ul class="space-y-2">
              {#each customIncomeCategories as cat}
                <li class="flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                  <span class="font-medium text-slate-800 dark:text-slate-100">{cat}</span>
                  <button aria-label={t('account.deleteCategory')} onclick={() => handleDeleteCategory('income', cat)} class="text-rose-500 hover:text-rose-700 transition-colors">
                    <i class="ph ph-trash text-sm"></i>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
    <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">{t('account.language')}</h3>
    <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('account.languageDescription')}</p>
    <div class="max-w-xs">
      <LanguageSelect />
    </div>
  </div>

  <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-red-200 dark:border-red-800 p-6">
    <h3 class="text-lg font-semibold text-red-600 mb-4">{t('account.dangerZone')}</h3>
    <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('account.deleteAllDescription')}</p>
    <button onclick={handleDeleteAll} disabled={isDeletingAll}
      class="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg transition-colors text-sm font-medium">
      {isDeletingAll ? t('account.deleting') : t('account.deleteAllTransactions')}
    </button>

    <div class="mt-6 pt-6 border-t border-red-100 dark:border-red-900/40">
      <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('account.deleteAccountDescription')}</p>
      <button onclick={handleDeleteAccount} disabled={isDeletingAccount}
        class="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors text-sm font-medium">
        {isDeletingAccount ? t('account.deletingAccount') : t('account.deleteAccount')}
      </button>
      {#if deleteAccountError}
        <p class="text-sm text-rose-600 mt-2">{deleteAccountError}</p>
      {/if}
    </div>

    {#if ownedSpaces.length > 0}
      <div class="mt-6 pt-6 border-t border-red-100 dark:border-red-900/40">
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-3">{t('account.deleteHubDescription')}</p>
        <ul class="space-y-2">
          {#each ownedSpaces as space}
            <li class="flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
              <span class="font-medium text-slate-800 dark:text-slate-100">{space.name}</span>
              <button onclick={() => handleDeleteHub(space.id, space.name)}
                class="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-xs font-medium">
                {t('account.deleteHub')}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
</div>
