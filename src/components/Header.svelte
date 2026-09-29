<script lang="ts">
  import { getCurrentCurrency, getIsLoggedIn, getRatesAreLive, getSpaces, getCurrentSpaceId, getPendingInvites, navigate } from '../lib/state.svelte.js';
  import { getCurrencySymbol } from '../lib/currency.js';
  import { fetchPendingInvites, respondToInvite, switchSpace } from '../lib/api.js';
  import { t } from '../lib/i18n.svelte.js';

  let { onopencurrency, view = '' } = $props();

  let currentCurrency = $derived(getCurrentCurrency());
  let isLoggedIn = $derived(getIsLoggedIn());
  let symbol = $derived(getCurrencySymbol(currentCurrency));
  let ratesAreLive = $derived(getRatesAreLive());

  let spaces = $derived(getSpaces());
  let currentSpaceId = $derived(getCurrentSpaceId());
  let currentSpace = $derived(spaces.find(s => s.id === currentSpaceId));
  let switcherOpen = $state(false);
  let notificationsOpen = $state(false);
  let responding = $state('');
  let notificationError = $state('');
  let pendingInvites = $derived(getPendingInvites());

  async function selectSpace(spaceId: string | null) {
    switcherOpen = false;
    await switchSpace(spaceId);
  }

  function nicknameFor(space: any): string {
    const owner = space.members.find((m: any) => m.role === 'owner');
    return owner?.nickname || t('header.theOwner');
  }

  async function respond(spaceId: string, accept: boolean) {
    notificationError = '';
    responding = spaceId;
    try {
      await respondToInvite(spaceId, accept);
    } catch (err: any) {
      notificationError = err.message || t('header.failedRespondInvite');
      await fetchPendingInvites();
    } finally {
      responding = '';
    }
  }

  function openQuickAdd() {
    window.dispatchEvent(new CustomEvent('open-quick-add'));
  }
</script>

<header class="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 lg:px-6 h-16 flex items-center justify-center lg:justify-end sticky top-0 z-30">

  <div class="flex items-center gap-2">
    {#if isLoggedIn && view !== 'ai'}
      <button
        onclick={openQuickAdd}
        class="hidden lg:flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
      >
        <i class="ph ph-plus-circle text-lg"></i>
        <span>{t('header.addEntry')}</span>
      </button>
      <div class="relative">
        <button
          onclick={() => switcherOpen = !switcherOpen}
          class="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
        >
          <i class="ph {currentSpace ? 'ph-users-three' : 'ph-user'} text-lg"></i>
          <span class="max-w-[8rem] truncate">{currentSpace ? currentSpace.name : t('header.personal')}</span>
          <i class="ph ph-caret-down text-xs"></i>
        </button>

        {#if switcherOpen}
          <div role="presentation" class="fixed inset-0 z-40" onclick={() => switcherOpen = false}></div>
          <div class="absolute right-0 mt-2 w-56 max-w-[calc(100vw_-_1.5rem)] max-h-[min(20rem,60vh)] overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg z-50 py-1 animate-fade-in">
            <button
              onclick={() => selectSpace(null)}
              class="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors {!currentSpaceId ? 'text-blue-600 font-medium' : 'text-slate-700 dark:text-slate-200'}"
            >
              <i class="ph ph-user"></i>
              {t('header.personal')}
            </button>
            {#each spaces as space (space.id)}
              <button
                onclick={() => selectSpace(space.id)}
                class="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors truncate {currentSpaceId === space.id ? 'text-blue-600 font-medium' : 'text-slate-700 dark:text-slate-200'}"
              >
                <i class="ph ph-users-three"></i>
                <span class="truncate">{space.name}</span>
              </button>
            {/each}
            <div class="border-t border-slate-100 dark:border-slate-700 my-1"></div>
            <button
              onclick={() => { switcherOpen = false; navigate('/spaces'); }}
              class="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <i class="ph ph-gear"></i>
              {t('header.manageHubs')}
            </button>
          </div>
        {/if}
      </div>
      <div class="relative">
        <button
          onclick={() => { notificationsOpen = !notificationsOpen; notificationError = ''; }}
          aria-label={t('header.notifications')}
          class="relative flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
        >
          <i class="ph ph-bell text-lg"></i>
          <span class="hidden sm:inline">{t('header.notifications')}</span>
          {#if pendingInvites.length > 0}
            <span class="min-w-5 h-5 px-1 flex items-center justify-center rounded-full bg-rose-500 text-white text-xs font-bold">{pendingInvites.length}</span>
          {/if}
        </button>

        {#if notificationsOpen}
          <div role="presentation" class="fixed inset-0 z-40" onclick={() => notificationsOpen = false}></div>
          <div class="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[min(24rem,70vh)] overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg z-50 p-3 animate-fade-in">
            <div class="flex items-center justify-between mb-2">
              <h2 class="font-semibold text-slate-800 dark:text-slate-100">{t('header.notifications')}</h2>
              {#if pendingInvites.length > 0}
                <span class="text-xs text-slate-500 dark:text-slate-400">{t('header.inviteCount', { count: pendingInvites.length })}</span>
              {/if}
            </div>
            {#if notificationError}
              <p class="text-xs text-rose-600 bg-rose-50 dark:bg-rose-900/30 px-2 py-1.5 rounded mb-2">{notificationError}</p>
            {/if}
            {#if pendingInvites.length === 0}
              <p class="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">{t('header.noNotifications')}</p>
            {:else}
              <ul class="space-y-2">
                {#each pendingInvites as space (space.id)}
                  <li class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                    <p class="text-sm text-slate-700 dark:text-slate-200 mb-2">
                      {t('header.invitedYouTo', { name: nicknameFor(space), space: space.name })}
                    </p>
                    <div class="flex gap-2">
                      <button onclick={() => respond(space.id, true)} disabled={responding === space.id} class="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors">{t('header.accept')}</button>
                      <button onclick={() => respond(space.id, false)} disabled={responding === space.id} class="flex-1 py-1.5 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 disabled:opacity-50 text-slate-700 dark:text-slate-200 text-xs font-medium rounded transition-colors">{t('header.decline')}</button>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      </div>
      <button
        onclick={() => onopencurrency?.()}
        title={ratesAreLive ? '' : t('header.exchangeRatesUnavailable')}
        class="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
      >
        <i class="ph ph-currency-circle-dollar"></i>
        <span class="hidden sm:inline">{symbol}{currentCurrency}</span>
        {#if !ratesAreLive}
          <i class="ph ph-warning-circle text-amber-500 text-base" aria-label={t('header.exchangeRatesUnavailable')}></i>
        {/if}
      </button>
    {/if}
  </div>
</header>
