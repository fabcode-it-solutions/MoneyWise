<script lang="ts">
  import { getEmail, getIsLoggedIn, confirmDialog } from '../lib/state.svelte.js';
  import { logout } from '../lib/api.js';
  import { t } from '../lib/i18n.svelte.js';

  let { activeFilter = 'all', onnavigate, collapsed = false, oncollapsetoggle } = $props();

  let email = $derived(getEmail());
  let isLoggedIn = $derived(getIsLoggedIn());

  let navItems = $derived([
    { filter: 'expense', icon: 'ph-trend-down', label: t('nav.expense') },
    { filter: 'income', icon: 'ph-trend-up', label: t('nav.income') },
    { filter: 'spaces', icon: 'ph-users-three', label: t('nav.spaces') },
    { filter: 'summaries', icon: 'ph-newspaper', label: t('nav.summaries') },
    { filter: 'ai', icon: 'ph-chat-circle-dots', label: t('nav.ai') },
  ]);

  function handleNav(filter: string) {
    onnavigate?.(filter);
  }

  async function handleLogout() {
    if (!await confirmDialog(t('account.logoutConfirm'))) return;
    await logout();
  }
</script>

<aside class="flex flex-col h-full bg-slate-900 text-white">
  <div class="relative p-5 border-b border-slate-800 flex items-center {collapsed ? 'lg:justify-center' : 'justify-between'} gap-2">
    <div class="flex items-center gap-3 min-w-0">
      <button
        onclick={() => collapsed && oncollapsetoggle?.()}
        class="relative w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 {collapsed ? 'pointer-events-none lg:pointer-events-auto lg:cursor-pointer lg:hover:bg-blue-500 transition-colors' : 'cursor-default'}"
        title={collapsed ? t('nav.expandSidebar') : ''}
      >
        <i class="ph ph-wallet text-white text-lg"></i>
        {#if collapsed}
          <span class="hidden lg:flex absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-slate-700 border-2 border-slate-900 items-center justify-center">
            <i class="ph ph-caret-right text-[7px] text-slate-300"></i>
          </span>
        {/if}
      </button>
      <div class="min-w-0 {collapsed ? 'lg:hidden' : ''}">
        <h1 class="font-bold text-lg leading-tight truncate">MoneyWise</h1>
        <p class="text-xs text-slate-400 truncate">{t('nav.tagline')}</p>
      </div>
    </div>
    {#if !collapsed}
      <button
        onclick={() => oncollapsetoggle?.()}
        class="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
        title={t('nav.collapseSidebar')}
      >
        <i class="ph ph-caret-line-left text-sm"></i>
      </button>
    {/if}
  </div>

  <nav class="flex-1 p-3 space-y-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
    {#each navItems as item}
      <button
        onclick={() => handleNav(item.filter)}
        title={item.label}
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer {collapsed ? 'lg:justify-center' : ''} {activeFilter === item.filter ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:bg-slate-800'}"
      >
        <i class="ph {item.icon} text-lg flex-shrink-0"></i>
        <span class="{collapsed ? 'lg:hidden' : ''} truncate">{item.label}</span>
      </button>
    {/each}

  </nav>

  <div class="p-4 border-t border-slate-800">
    {#if isLoggedIn}
      <button
        onclick={() => handleNav('account')}
        title={email}
        class="w-full flex items-center gap-3 mb-3 px-1 rounded-lg transition-colors cursor-pointer hover:bg-slate-800 {collapsed ? 'lg:justify-center' : ''} {activeFilter === 'account' ? 'bg-blue-600/20' : ''}"
      >
        <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
          {(email || '?')[0].toUpperCase()}
        </div>
        <div class="min-w-0 flex-1 text-left {collapsed ? 'lg:hidden' : ''}">
          <p class="text-sm font-medium truncate {activeFilter === 'account' ? 'text-blue-400' : 'text-slate-200'}">{email}</p>
        </div>
      </button>
      <button
        onclick={handleLogout}
        title={t('nav.logout')}
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer {collapsed ? 'lg:justify-center' : ''}"
      >
        <i class="ph ph-sign-out text-lg flex-shrink-0"></i>
        <span class="{collapsed ? 'lg:hidden' : ''}">{t('nav.logout')}</span>
      </button>
    {/if}
  </div>
</aside>
