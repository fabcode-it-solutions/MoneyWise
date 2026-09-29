<script lang="ts">
  import { navigate } from '../lib/state.svelte.js';
  import { t } from '../lib/i18n.svelte.js';

  let {
    activeFilter = 'expense',
    onquickadd,
    onai,
  }: {
    activeFilter?: string;
    onquickadd?: () => void;
    onai?: () => void;
  } = $props();

  let navItems = $derived([
    { filter: 'expense', icon: 'ph-trend-down', label: t('nav.expense') },
    { filter: 'income', icon: 'ph-trend-up', label: t('nav.income') },
  ]);

  let rightItems = $derived([
    { filter: 'account', icon: 'ph-user', label: t('nav.account') },
  ]);

  let aiButton = $derived({ icon: 'ph-brain', label: t('nav.ai') });

  function handleNav(filter: string) {
    navigate('/' + filter);
  }
</script>

<nav class="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center h-[72px] safe-area-bottom lg:hidden pointer-events-none">
  <!-- Curved notch background -->
  <div
    class="absolute inset-x-0 bottom-0 h-[60px] bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 rounded-t-[24px] shadow-[0_-2px_12px_rgba(0,0,0,0.06)] pointer-events-auto"
    style="-webkit-mask: radial-gradient(circle 28px at 50% -4px, transparent 28px, black 28px); mask: radial-gradient(circle 28px at 50% -4px, transparent 28px, black 28px);"
  ></div>

  <!-- Semi-circle concave cutout extension removed — now done via CSS mask on the background -->

  <!-- Nav items -->
  <div class="relative flex items-center justify-between w-full max-w-lg px-6 z-10 pointer-events-auto">
    <!-- Left items -->
    <div class="flex items-center justify-around flex-1">
      {#each navItems as item}
        <button
          onclick={() => handleNav(item.filter)}
          class="flex flex-col items-center gap-0.5 py-1.5 px-3 min-w-0 transition-colors cursor-pointer {activeFilter === item.filter ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}"
        >
          <i class="ph {item.icon} text-xl"></i>
          <span class="text-[10px] font-medium leading-tight">{item.label}</span>
        </button>
      {/each}
    </div>

    <!-- Center Quick Add -->
    <button
      onclick={() => onquickadd?.()}
      class="relative -mt-3 w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer flex-shrink-0"
      aria-label={t('nav.quickAdd')}
    >
      <i class="ph ph-plus text-2xl"></i>
    </button>

    <!-- Right items -->
    <div class="flex items-center justify-around flex-1">
      {#each rightItems as item}
        <button
          onclick={() => handleNav(item.filter)}
          class="flex flex-col items-center gap-0.5 py-1.5 px-3 min-w-0 transition-colors cursor-pointer {activeFilter === item.filter ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}"
        >
          <i class="ph {item.icon} text-xl"></i>
          <span class="text-[10px] font-medium leading-tight">{item.label}</span>
        </button>
      {/each}
      <!-- AI Button -->
      <button
        onclick={() => onai?.()}
        class="flex flex-col items-center gap-0.5 py-1.5 px-3 min-w-0 transition-colors cursor-pointer text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
      >
        <i class="ph {aiButton.icon} text-xl"></i>
        <span class="text-[10px] font-medium leading-tight">{aiButton.label}</span>
      </button>
    </div>
  </div>
</nav>

<style>
  .safe-area-bottom {
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
</style>
