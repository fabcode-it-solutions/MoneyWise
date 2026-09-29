<script lang="ts">
  import { saveTransaction } from '../lib/api.js';
  import { getAllCategories } from '../lib/state.svelte.js';
  import { t } from '../lib/i18n.svelte.js';
  import CategorySelect from './CategorySelect.svelte';

  interface Props {
    show: boolean;
    results: any[];
    onclose?: () => void;
    onsave?: (saved: any[]) => void;
  }
  let { show, results, onclose, onsave }: Props = $props();

  interface Item {
    type: 'income' | 'expense';
    amount: string;
    category: string;
    date: string;
    name: string;
    note: string;
    editing: boolean;
  }

  let items = $state<Item[]>([]);

  $effect(() => {
    if (show && results?.length) {
      const today = new Date().toISOString().split('T')[0];
      items = results.map((r: any) => ({
        type: (r.type === 'income' || r.type === 'expense') ? r.type : 'expense',
        amount: r.amount != null ? String(r.amount) : '',
        category: r.category || 'Other',
        date: r.date || today,
        name: r.name || '',
        note: r.note || '',
        editing: false,
      }));
    }
  });

  let saving = $state(false);

  function availableCategories(type: string): string[] {
    return getAllCategories(type);
  }

  function toggleEdit(idx: number) {
    items[idx].editing = !items[idx].editing;
  }

  function removeItem(idx: number) {
    items = items.filter((_, i) => i !== idx);
  }

  function addBlank() {
    const today = new Date().toISOString().split('T')[0];
    items = [...items, {
      type: 'expense' as const,
      amount: '',
      category: 'Food & Dining',
      date: today,
      name: '',
      note: '',
      editing: true,
    }];
  }

  function ensureValidCategory(item: Item) {
    const cats = availableCategories(item.type);
    if (!cats.includes(item.category)) {
      item.category = cats[0];
    }
  }

  async function saveAll() {
    saving = true;
    const saved: any[] = [];
    for (const item of items) {
      const amount = parseFloat(item.amount);
      if (isNaN(amount) || amount <= 0) continue;
      const result = await saveTransaction({
        type: item.type,
        amount,
        category: item.category,
        date: item.date,
        name: item.name,
        note: item.note,
      });
      if (result) saved.push(result);
    }
    saving = false;
    items = [];
    onsave?.(saved);
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose?.();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose?.();
  }
</script>

{#if show}
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onclick={handleOverlayClick} onkeydown={handleKeyDown} role="dialog" aria-modal="true" tabindex="-1">
  <div class="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
    <div class="flex items-center justify-between p-5 border-b border-slate-200 shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
          <i class="ph ph-camera text-blue-600 text-xl"></i>
        </div>
        <h2 class="text-lg font-bold text-slate-800">{t('bulk.importReceipts')}</h2>
      </div>
      <button onclick={() => onclose?.()} class="text-slate-400 hover:text-slate-600 transition-colors p-1" aria-label={t('bulk.closeModal')}>
        <i class="ph ph-x text-xl"></i>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-5 space-y-3">
      {#each items as item, idx (idx)}
        <div class="border border-slate-200 rounded-xl p-4">
          {#if item.editing}
            <div class="space-y-3">
              <div class="flex gap-4">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="radio" bind:group={item.type} value="expense" onchange={() => ensureValidCategory(item)} class="text-rose-500 focus:ring-rose-400" />
                  <span class="text-sm text-slate-700">{t('type.expense')}</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="radio" bind:group={item.type} value="income" onchange={() => ensureValidCategory(item)} class="text-emerald-500 focus:ring-emerald-400" />
                  <span class="text-sm text-slate-700">{t('type.income')}</span>
                </label>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label for="item-{idx}-amount" class="text-xs text-slate-500 mb-1 block">{t('form.amount')}</label>
                  <input id="item-{idx}-amount" type="number" step="0.01" bind:value={item.amount} placeholder="0.00" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label for="item-{idx}-category" class="text-xs text-slate-500 mb-1 block">{t('form.categoryType')}</label>
                  <CategorySelect
                    id="item-{idx}-category"
                    type={item.type}
                    bind:value={item.category}
                    selectClass="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label for="item-{idx}-date" class="text-xs text-slate-500 mb-1 block">{t('form.date')}</label>
                  <input id="item-{idx}-date" type="date" bind:value={item.date} class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label for="item-{idx}-name" class="text-xs text-slate-500 mb-1 block">{t('form.name')}</label>
                  <input id="item-{idx}-name" type="text" bind:value={item.name} placeholder={t('bulk.optional')} class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div class="grid grid-cols-1 gap-3">
                <div>
                  <label for="item-{idx}-note" class="text-xs text-slate-500 mb-1 block">{t('form.note')}</label>
                  <input id="item-{idx}-note" type="text" bind:value={item.note} placeholder={t('bulk.optional')} class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div class="flex gap-2 pt-1">
                <button onclick={() => toggleEdit(idx)} class="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                  {t('bulk.done')}
                </button>
                <button onclick={() => removeItem(idx)} class="px-3 py-1.5 text-xs font-medium text-rose-600 bg-rose-50 rounded-lg hover:bg-rose-100 transition-colors">
                  <i class="ph ph-trash mr-1"></i>{t('bulk.remove')}
                </button>
              </div>
            </div>
          {:else}
            <div class="flex items-center justify-between">
              <div class="flex-1 grid grid-cols-3 sm:grid-cols-6 gap-3 text-sm">
                <div>
                  <span class="text-xs text-slate-400 block">{t('form.categoryType')}</span>
                  <span class="font-medium {item.type === 'expense' ? 'text-rose-600' : 'text-emerald-600'}">{item.type}</span>
                </div>
                <div>
                  <span class="text-xs text-slate-400 block">{t('form.amount')}</span>
                  <span class="font-semibold text-slate-800">{item.amount}</span>
                </div>
                <div>
                  <span class="text-xs text-slate-400 block">{t('form.categoryType')}</span>
                  <span class="text-slate-700">{item.category}</span>
                </div>
                <div>
                  <span class="text-xs text-slate-400 block">{t('form.date')}</span>
                  <span class="text-slate-700">{item.date}</span>
                </div>
                <div>
                  <span class="text-xs text-slate-400 block">{t('form.name')}</span>
                  <span class="text-slate-700 truncate block">{item.name || '—'}</span>
                </div>
                <div>
                  <span class="text-xs text-slate-400 block">{t('form.note')}</span>
                  <span class="text-slate-700 truncate block">{item.note || '—'}</span>
                </div>
              </div>
              <div class="flex gap-1 ml-3 shrink-0">
                <button onclick={() => toggleEdit(idx)} class="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title={t('bulk.edit')}>
                  <i class="ph ph-pencil-simple-line text-lg"></i>
                </button>
                <button onclick={() => removeItem(idx)} class="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title={t('bulk.delete')}>
                  <i class="ph ph-trash text-lg"></i>
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/each}

      {#if items.length === 0}
        <div class="text-center py-12 text-slate-400">
          <i class="ph ph-receipt text-4xl mb-2 block"></i>
          <p class="text-sm">{t('bulk.noItems')}</p>
        </div>
      {/if}
    </div>

    <div class="border-t border-slate-200 p-4 shrink-0">
      <div class="flex items-center justify-between">
        <button onclick={addBlank} class="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors px-3 py-1.5">
          <i class="ph ph-plus-circle text-lg"></i>
          {t('common.add')}
        </button>
        <div class="flex items-center gap-3">
          <span class="text-xs text-slate-400">{t('bulk.itemCount', { count: items.length })}</span>
          <button
            onclick={saveAll}
            disabled={saving || items.length === 0}
            class="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {#if saving}
              <i class="ph ph-spinner animate-spin"></i>
              {t('edit.saving')}
            {:else}
              {t('common.add')}
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
{/if}
