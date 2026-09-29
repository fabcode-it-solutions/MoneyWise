<script lang="ts">
  import { getAllCategories, getCustomCategories, addCustomCategory, removeCustomCategory, confirmDialog } from '../lib/state.svelte.js';
  import { t } from '../lib/i18n.svelte.js';

  let { type = 'expense', value = $bindable(''), selectClass = '', id = '' } = $props();

  let adding = $state(false);
  let newCategory = $state('');
  let inputEl = $state<HTMLInputElement | null>(null);

  let categories = $derived.by(() => {
    const cats = getAllCategories(type);
    return value && !cats.includes(value) ? [value, ...cats] : cats;
  });
  let isCustomSelected = $derived(getCustomCategories(type).includes(value));

  async function deleteSelected() {
    if (!isCustomSelected) return;
    if (!await confirmDialog(t('category.deleteConfirm', { name: value }))) return;
    removeCustomCategory(type, value);
    value = '';
  }

  function handleChange(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    if (v === '__add__') {
      adding = true;
      newCategory = '';
      setTimeout(() => inputEl?.focus(), 50);
    } else {
      value = v;
    }
  }

  function confirmAdd() {
    const name = addCustomCategory(type, newCategory);
    if (name) value = name;
    adding = false;
  }

  function cancelAdd() {
    adding = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmAdd();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelAdd();
    }
  }
</script>

{#if adding}
  <div class="flex gap-2">
    <input
      bind:this={inputEl}
      bind:value={newCategory}
      type="text"
      placeholder={t('category.newCategoryPlaceholder')}
      onkeydown={handleKeydown}
      class={selectClass}
    />
    <button type="button" onclick={confirmAdd} title={t('category.addCategory')} class="px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm cursor-pointer">
      <i class="ph ph-check"></i>
    </button>
    <button type="button" onclick={cancelAdd} title={t('common.cancel')} class="px-3 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm cursor-pointer">
      <i class="ph ph-x"></i>
    </button>
  </div>
{:else}
  <div class="flex gap-2">
    <select {id} {value} onchange={handleChange} class={selectClass}>
      {#if !value}
        <option value="" disabled>{t('category.selectCategory')}</option>
      {/if}
      {#each categories as cat}
        <option value={cat}>{cat}</option>
      {/each}
      <option value="__add__">{t('category.addNewCategory')}</option>
    </select>
    {#if isCustomSelected}
      <button type="button" onclick={deleteSelected} title={t('category.deleteCustomCategory')} class="px-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm cursor-pointer">
        <i class="ph ph-trash"></i>
      </button>
    {/if}
  </div>
{/if}
