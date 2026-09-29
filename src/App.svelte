<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchCsrfToken, checkSession } from './lib/api.js';
  import { getIsLoggedIn, getAuthChecking, setAuthChecking, getCurrentCurrency, initRouter, getCurrentView, navigate } from './lib/state.svelte.js';
  import { getCurrencySymbol } from './lib/currency.js';
  import type { Expense } from './types.js';
  import Sidebar from './components/Sidebar.svelte';
  import BottomNav from './components/BottomNav.svelte';
  import Header from './components/Header.svelte';
  import ExpenseView from './views/ExpenseView.svelte';
  import LoginView from './views/LoginView.svelte';
  import ConfirmModal from './components/ConfirmModal.svelte';

  let sidebarCollapsed = $state<boolean>(typeof localStorage !== 'undefined' && localStorage.getItem('sw_sidebar_collapsed') === 'true');
  let editingItem = $state<Expense | null>(null);
  let showCurrencyModal = $state<boolean>(false);
  let showMobileQuickAdd = $state<boolean>(false);
  let showAiChat = $state<boolean>(false);
  let importResult = $state<any>(null);
  let deleteAllModalOpen = $state<boolean>(false);

  // Views/modals beyond the landing Expense view are loaded on demand so the
  // initial bundle only pays for what's shown on first paint. Each loader
  // result is cached in its slot so re-opening/re-navigating doesn't re-fetch.
  let IncomeView = $state<any>(null);
  let AccountView = $state<any>(null);
  let SummariesView = $state<any>(null);
  let SpacesView = $state<any>(null);
  let AiChatPanel = $state<any>(null);
  let EditModal = $state<any>(null);
  let CurrencyModal = $state<any>(null);
  let ImportModal = $state<any>(null);
  let DeleteAllModal = $state<any>(null);
  let MobileQuickAdd = $state<any>(null);

  $effect(() => {
    if (view === 'income' && !IncomeView) import('./views/IncomeView.svelte').then(m => IncomeView = m.default);
    else if (view === 'account' && !AccountView) import('./views/AccountView.svelte').then(m => AccountView = m.default);
    else if (view === 'summaries' && !SummariesView) import('./views/SummariesView.svelte').then(m => SummariesView = m.default);
    else if (view === 'spaces' && !SpacesView) import('./views/SpacesView.svelte').then(m => SpacesView = m.default);
    else if (view === 'ai' && !AiChatPanel) import('./components/AiChatPanel.svelte').then(m => AiChatPanel = m.default);
  });

  $effect(() => { if (editingItem && !EditModal) import('./components/EditModal.svelte').then(m => EditModal = m.default); });
  $effect(() => { if (showCurrencyModal && !CurrencyModal) import('./components/CurrencyModal.svelte').then(m => CurrencyModal = m.default); });
  $effect(() => { if (importResult && !ImportModal) import('./components/ImportModal.svelte').then(m => ImportModal = m.default); });
  $effect(() => { if (deleteAllModalOpen && !DeleteAllModal) import('./components/DeleteAllModal.svelte').then(m => DeleteAllModal = m.default); });
  $effect(() => { if (showMobileQuickAdd && !MobileQuickAdd) import('./components/MobileQuickAdd.svelte').then(m => MobileQuickAdd = m.default); });
  $effect(() => { if (showAiChat && !AiChatPanel) import('./components/AiChatPanel.svelte').then(m => AiChatPanel = m.default); });

  function handleNavigate(filter: string) {
    navigate('/' + filter);
  }

  function toggleSidebarCollapsed() {
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem('sw_sidebar_collapsed', String(sidebarCollapsed));
  }

  function handleEditItem(e: CustomEvent) {
    editingItem = e.detail;
  }

  $effect(() => {
    if (typeof window !== 'undefined') {
      const listener = (e: Event) => handleEditItem(e as CustomEvent<Expense>);
      window.addEventListener('edit-expense', listener as EventListener);
      window.addEventListener('edit-income', listener as EventListener);
      window.addEventListener('edit-item', listener as EventListener);
      return () => {
        window.removeEventListener('edit-expense', listener as EventListener);
        window.removeEventListener('edit-income', listener as EventListener);
        window.removeEventListener('edit-item', listener as EventListener);
      };
    }
  });

  // Lets any part of the app (not just the mobile bottom nav) open the Quick
  // Add modal, e.g. the Header's "Add Entry" button on desktop.
  $effect(() => {
    if (typeof window !== 'undefined') {
      const listener = () => { showMobileQuickAdd = true; };
      window.addEventListener('open-quick-add', listener);
      return () => window.removeEventListener('open-quick-add', listener);
    }
  });

  onMount(async () => {
    initRouter();
    await Promise.allSettled([fetchCsrfToken(), checkSession()]);
    setAuthChecking(false);
    if (!getIsLoggedIn() && getCurrentView() !== 'login') {
      navigate('/login');
    } else if (getIsLoggedIn() && getCurrentView() === 'login') {
      navigate('/expense');
    }
  });

  let view = $derived(getCurrentView());
</script>

{#if getAuthChecking()}
  <div class="h-screen flex items-center justify-center bg-white">
    <i class="ph ph-circle-notch animate-spin text-3xl text-blue-500"></i>
  </div>
{:else if view === 'login'}
  <LoginView />
{:else}
<div class="h-screen flex overflow-hidden bg-slate-50 dark:bg-slate-900">

  <div class="fixed lg:static inset-y-0 left-0 z-50 w-64 {sidebarCollapsed ? 'lg:w-16' : 'lg:w-64'} flex-shrink-0 transform transition-all duration-300 lg:translate-x-0 -translate-x-full lg:translate-x-0 invisible lg:visible">
    <Sidebar activeFilter={view} onnavigate={handleNavigate} collapsed={sidebarCollapsed} oncollapsetoggle={toggleSidebarCollapsed} />
  </div>

  <div class="flex-1 flex flex-col min-w-0 h-full relative z-0">
    {#if view !== 'ai'}
      <Header
        onopencurrency={() => showCurrencyModal = true}
        view={view}
      />
    {/if}

    <main class="flex-1 min-h-0 {view === 'ai' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto overflow-x-hidden custom-scrollbar p-4 lg:p-6 pb-20 lg:pb-6'}">
      {#if view === 'expense'}
        <ExpenseView />
      {:else if view === 'income' && IncomeView}
        <IncomeView />
      {:else if view === 'account' && AccountView}
        <AccountView />
      {:else if view === 'summaries' && SummariesView}
        <SummariesView />
      {:else if view === 'spaces' && SpacesView}
        <SpacesView />
      {:else if view === 'ai' && AiChatPanel}
        <AiChatPanel embedded />
      {:else}
        <div class="h-full flex items-center justify-center">
          <i class="ph ph-circle-notch animate-spin text-3xl text-blue-500"></i>
        </div>
      {/if}
    </main>
  </div>
</div>

{#if view !== 'login' && view !== 'ai'}
  <BottomNav activeFilter={view} onquickadd={() => showMobileQuickAdd = true} onai={() => showAiChat = true} />
{/if}
{/if}

<ConfirmModal />

{#if editingItem && EditModal}
  <EditModal
    expenseItem={editingItem}
    onclose={() => editingItem = null}
    onsaved={() => editingItem = null}
  />
{/if}

{#if showCurrencyModal && CurrencyModal}
  <CurrencyModal onclose={() => showCurrencyModal = false} />
{/if}


{#if importResult && ImportModal}
  <ImportModal result={importResult} onclose={() => importResult = null} />
{/if}

{#if deleteAllModalOpen && DeleteAllModal}
  <DeleteAllModal
    onclose={() => deleteAllModalOpen = false}
    onconfirm={() => deleteAllModalOpen = false}
  />
{/if}

{#if showMobileQuickAdd && MobileQuickAdd}
  <MobileQuickAdd show={showMobileQuickAdd} onclose={() => showMobileQuickAdd = false} />
{/if}

{#if showAiChat && AiChatPanel}
  <AiChatPanel show={showAiChat} onclose={() => showAiChat = false} />
{/if}

<!-- The mobile Quick Add is triggered from the center of the bottom nav bar -->
