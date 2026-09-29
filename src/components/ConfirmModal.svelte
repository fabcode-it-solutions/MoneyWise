<script lang="ts">
  import { getConfirmRequest } from '../lib/state.svelte.js';
  import { t } from '../lib/i18n.svelte.js';

  let request = $derived(getConfirmRequest());
</script>

{#if request}
  <div role="presentation" class="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 animate-fade-in" onclick={() => request?.resolve(false)}>
    <div role="presentation" class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-6" onclick={(e) => e.stopPropagation()}>
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
          <i class="ph ph-warning-circle text-amber-600 text-xl"></i>
        </div>
        <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">{t('confirm.title')}</h2>
      </div>

      <p class="text-sm text-slate-600 dark:text-slate-300 mb-6">{request.message}</p>

      <div class="flex gap-3">
        <button
          onclick={() => request?.resolve(false)}
          class="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors cursor-pointer"
        >{t('common.cancel')}</button>
        <button
          onclick={() => request?.resolve(true)}
          class="flex-1 py-2.5 bg-rose-600 text-white text-sm font-semibold rounded-lg hover:bg-rose-700 transition-colors cursor-pointer"
        >{t('common.ok')}</button>
      </div>
    </div>
  </div>
{/if}
