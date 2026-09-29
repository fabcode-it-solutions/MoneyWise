<script lang="ts">
  import { t } from '../lib/i18n.svelte.js';
  let { result, onclose } = $props();
</script>

{#if result}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onclick={(e) => { if (e.target === e.currentTarget) onclose?.(); }} onkeydown={(e) => { if (e.key === 'Escape') onclose?.(); }} role="dialog" aria-modal="true" tabindex="-1">
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
          <i class="ph ph-check-circle text-emerald-600 text-xl"></i>
        </div>
        <h2 class="text-lg font-bold text-slate-800">{t('importResult.title')}</h2>
      </div>

      <div class="bg-slate-50 rounded-lg p-4 space-y-2 mb-4">
        <div class="flex items-center justify-between text-sm">
          <span class="text-slate-600">{t('importResult.imported')}</span>
          <span class="font-semibold text-emerald-600">{result.imported}</span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-slate-600">{t('importResult.skipped')}</span>
          <span class="font-semibold text-amber-600">{result.skipped}</span>
        </div>
      </div>

      {#if result.errors && result.errors.length > 0}
        <div class="mb-4">
          <h3 class="text-sm font-medium text-slate-700 mb-2">{t('importResult.errors')}</h3>
          <div class="max-h-32 overflow-y-auto space-y-1">
            {#each result.errors as err}
              <p class="text-xs text-rose-600 bg-rose-50 px-2 py-1 rounded">{err}</p>
            {/each}
          </div>
        </div>
      {/if}

      <button
        onclick={() => onclose?.()}
        class="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
      >{t('common.done')}</button>
    </div>
  </div>
{/if}
