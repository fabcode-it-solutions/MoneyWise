<script lang="ts">
  import { currencies, popularCurrencies } from '../lib/constants.js';
  import { getCurrentCurrency, setCurrentCurrency, getRatesAreLive } from '../lib/state.svelte.js';
  import { t } from '../lib/i18n.svelte.js';

  let { onclose } = $props();

  let search = $state('');
  let current = $derived(getCurrentCurrency());
  let ratesAreLive = $derived(getRatesAreLive());
  let filteredPopular = $derived(popularCurrencies.filter(c => c.toLowerCase().includes(search.toLowerCase())));
  let filteredAll = $derived(currencies.filter(c => c.toLowerCase().includes(search.toLowerCase())));

  function select(currency: string) {
    setCurrentCurrency(currency);
    onclose?.();
  }
</script>

<div role="presentation" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onclick={(e) => { if (e.target === e.currentTarget) onclose?.(); }}>
  <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
    <div class="flex items-center justify-between p-4 border-b border-slate-200">
      <h2 class="text-lg font-bold text-slate-800">{t('currency.title')}</h2>
      <button aria-label={t('common.close')} onclick={() => onclose?.()} class="text-slate-400 hover:text-slate-600 transition-colors">
        <i class="ph ph-x text-xl"></i>
      </button>
    </div>

    {#if !ratesAreLive}
      <div class="flex items-start gap-2 mx-4 mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
        <i class="ph ph-warning-circle text-amber-500 text-sm mt-0.5 flex-shrink-0"></i>
        <span>{t('currency.ratesUnavailable')}</span>
      </div>
    {/if}

    <div class="p-4 border-b border-slate-200">
      <div class="relative">
        <i class="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
        <input
          type="text"
          bind:value={search}
          placeholder={t('currency.searchPlaceholder')}
          class="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>
    </div>

    <div class="p-4 overflow-y-auto flex-1 space-y-4">
      {#if filteredPopular.length > 0}
        <div>
          <h3 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{t('currency.popular')}</h3>
          <div class="flex flex-wrap gap-2">
            {#each filteredPopular as currency}
              <button
                onclick={() => select(currency)}
                class="px-3 py-2 rounded-lg text-sm font-medium transition-all {currency === current ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}"
              >{currency}</button>
            {/each}
          </div>
        </div>
      {/if}

      {#if filteredAll.length > 0}
        <div>
          <h3 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{t('currency.allCurrencies')}</h3>
          <div class="flex flex-wrap gap-1.5">
            {#each filteredAll as currency}
              <button
                onclick={() => select(currency)}
                class="px-2 py-1.5 rounded-lg text-xs font-medium transition-all {currency === current ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}"
              >{currency}</button>
            {/each}
          </div>
        </div>
      {/if}

      {#if filteredAll.length === 0 && filteredPopular.length === 0}
        <p class="text-sm text-slate-500 text-center py-4">{t('currency.noCurrencies')}</p>
      {/if}
    </div>
  </div>
</div>
