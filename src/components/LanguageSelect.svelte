<script lang="ts">
  import { locales, getLocale, setLocale } from '../lib/i18n.svelte.js';
  import { t } from '../lib/i18n.svelte.js';

  let current = $derived(getLocale());
</script>

<select
  value={current}
  aria-label={t('common.language')}
  onchange={(e) => setLocale((e.target as HTMLSelectElement).value as 'en' | 'es')}
  class="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
>
  {#each locales as l (l.code)}
    <option value={l.code}>{l.label}</option>
  {/each}
</select>
