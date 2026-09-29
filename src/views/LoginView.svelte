<script lang="ts">
  import { login, register, showApp } from '../lib/api.js';
  import { navigate } from '../lib/state.svelte.js';
  import { t } from '../lib/i18n.svelte.js';
  import LanguageSelect from '../components/LanguageSelect.svelte';

  let tab = $state('login');
  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    if (!email || !password) {
      error = t('common.fillAllFields');
      return;
    }
    loading = true;
    try {
      const data = tab === 'login' ? await login(email, password) : await register(email, password);
      await showApp(data.user.email, data.user.id);
      navigate('/expense');
    } catch (err) {
      error = err instanceof Error ? err.message : t('common.unknownError');
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen bg-white flex items-center justify-center p-4">
  <div class="w-full max-w-md">
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-2">
        <h1 class="text-xl font-bold text-slate-800">MoneyWise</h1>
        <i class="ph ph-wallet text-2xl text-blue-600"></i>
      </div>
      <div class="w-36">
        <LanguageSelect />
      </div>
    </div>

    <div class="flex border border-slate-200 rounded-lg p-1 mb-6">
      <button
        class="flex-1 py-2 text-sm font-medium rounded-md transition-colors {tab === 'login' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-800'}"
        onclick={() => { tab = 'login'; error = ''; }}
      >{t('login.signIn')}</button>
      <button
        class="flex-1 py-2 text-sm font-medium rounded-md transition-colors {tab === 'register' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-800'}"
        onclick={() => { tab = 'register'; error = ''; }}
      >{t('login.register')}</button>
    </div>

    <form onsubmit={handleSubmit} class="space-y-4">
      <div>
        <label for="authEmail" class="block text-sm font-medium text-slate-700 mb-1">{t('login.email')}</label>
        <input
          id="authEmail"
          type="email"
          bind:value={email}
          placeholder={t('login.emailPlaceholder')}
          class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          autocomplete="email"
        />
      </div>
      <div>
        <label for="authPassword" class="block text-sm font-medium text-slate-700 mb-1">{t('login.password')}</label>
        <input
          id="authPassword"
          type="password"
          bind:value={password}
          placeholder="••••••••"
          class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          autocomplete={tab === 'login' ? 'current-password' : 'new-password'}
        />
      </div>

      {#if error}
        <p class="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>
      {/if}

      <button
        type="submit"
        disabled={loading}
        class="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {#if loading}
          <i class="ph ph-spinner animate-spin"></i>
          {tab === 'login' ? t('login.signingIn') : t('login.creatingAccount')}
        {:else}
          {tab === 'login' ? t('login.signIn') : t('login.createAccount')}
        {/if}
      </button>
    </form>

    <div class="mt-6">
      <div class="relative mb-6">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-slate-200"></div>
        </div>
        <div class="relative flex justify-center text-sm">
          <span class="bg-white px-2 text-slate-500">{t('login.or')}</span>
        </div>
      </div>
      <a
        href="/api/auth/google"
        class="w-full py-2.5 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 no-underline"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {t('login.signInWithGoogle')}
      </a>
    </div>
  </div>
</div>
