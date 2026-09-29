<script lang="ts">
  import { onMount } from 'svelte';
  import { saveTransaction, switchSpace, uploadBulkExpenses, loadExpenses, parseReceiptsBulk } from '../lib/api.js';
  import { addExpenseItem, getCurrentCurrency, getSpaces, getCurrentSpaceId } from '../lib/state.svelte.js';
  import { getCurrencySymbol } from '../lib/currency.js';
  import { compressImageToDataUrl } from '../lib/utils.js';
  import { t } from '../lib/i18n.svelte.js';
  import { getFlatpickrLocale } from '../lib/flatpickrLocale.js';
  import type { Expense, Recurrence } from '../types.js';
  import CategorySelect from './CategorySelect.svelte';
  import BulkImportModal from './BulkImportModal.svelte';

  let { show, onclose } = $props();

  const currencySymbol = $derived(getCurrencySymbol(getCurrentCurrency()));

  let type = $state<'income' | 'expense'>('expense');
  let amount = $state(0);
  let category = $state('');
  let date = $state(new Date().toISOString().split('T')[0]);
  let name = $state('');
  let note = $state('');
  let loading = $state(false);
  let error = $state('');

  let dateInput = $state<HTMLInputElement | null>(null);
  let fp = $state<any>(null);

  // Recurrence
  let isRecurring = $state(false);
  let recurrenceFrequency = $state<'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'>('monthly');
  let recurrenceEndDate = $state('');
  let endDateInput = $state<HTMLInputElement | null>(null);
  let endDateFp = $state<any>(null);

  let spaces = $derived(getSpaces());
  let currentSpaceId = $derived(getCurrentSpaceId());
  let switchingSpace = $state(false);

  // CSV import
  let csvImporting = $state(false);
  let csvResult = $state<{ success: boolean; message: string } | null>(null);
  let csvFileInput = $state<HTMLInputElement | null>(null);

  // Receipt / OCR import
  let receiptProcessing = $state(false);
  let receiptProgress = $state('');
  let parsedReceipts = $state<any[]>([]);
  let showBulkModal = $state(false);
  let ocrPro = $state(false);
  let receiptInput = $state<HTMLInputElement | null>(null);

  async function handleSpaceChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    switchingSpace = true;
    try {
      await switchSpace(value || null);
    } finally {
      switchingSpace = false;
    }
  }

  $effect(() => {
    if (dateInput && !fp) {
      import('flatpickr').then(async (mod) => {
        fp = mod.default(dateInput as HTMLElement, {
          dateFormat: 'Y-m-d',
          altInput: true,
          altFormat: 'd/m/Y',
          locale: await getFlatpickrLocale(mod.default),
          disableMobile: true,
          defaultDate: date || 'today',
        });
      });
    }
  });

  // The end-date input only exists in the DOM while isRecurring is true, so
  // flatpickr must attach/detach on that transition rather than once on mount.
  $effect(() => {
    if (!endDateInput) return;
    let cancelled = false;
    let instance: any = null;
    import('flatpickr').then(async (mod) => {
      if (cancelled) return;
      instance = mod.default(endDateInput as HTMLElement, {
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'd/m/Y',
        locale: await getFlatpickrLocale(mod.default),
        disableMobile: true,
        defaultDate: recurrenceEndDate || undefined,
        onChange: (selectedDates: Date[]) => {
          recurrenceEndDate = selectedDates[0] ? selectedDates[0].toISOString().split('T')[0] : '';
        }
      });
      endDateFp = instance;
    });
    return () => {
      cancelled = true;
      instance?.destroy();
      endDateFp = null;
    };
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    if (!type || Number.isNaN(amount) || !category || !date) {
      error = t('form.fillRequired');
      return;
    }
    loading = true;
    try {
      let recurrence: Recurrence | null = null;
      if (isRecurring) {
        recurrence = {
          frequency: recurrenceFrequency,
          nextDueDate: date,
          endDate: recurrenceEndDate || null,
          isActive: true,
        };
      }
      const entry = await saveTransaction({ type, amount, category, date, name, note, recurrence });
      if (entry) {
        addExpenseItem(entry);
        type = 'expense';
        amount = 0;
        category = '';
        date = new Date().toISOString().split('T')[0];
        name = '';
        note = '';
        isRecurring = false;
        recurrenceFrequency = 'monthly';
        recurrenceEndDate = '';
        onclose?.();
      } else {
        error = t('form.failedSave');
      }
    } catch (err) {
      error = t('form.networkError');
    } finally {
      loading = false;
    }
  }

  // CSV import handlers
  function triggerCsvImport() {
    csvFileInput?.click();
  }

  async function handleCsvFileSelect(ev: Event) {
    const target = ev.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    csvImporting = true;
    csvResult = null;
    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      if (lines.length < 2) {
        csvResult = { success: false, message: t('form.csvEmpty') };
        return;
      }
      const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase());
      const rows = lines.slice(1).filter((l: string) => l.trim()).map((line: string) => {
        const values = line.split(',').map((v: string) => v.trim());
        const obj: Record<string, string> = {};
        headers.forEach((h: string, i: number) => obj[h] = values[i] || '');
        return obj;
      });
      const res = await uploadBulkExpenses(rows);
      await loadExpenses();
      csvResult = { success: true, message: t('form.csvImported', { count: res.count || rows.length }) };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('form.csvImportFailed');
      csvResult = { success: false, message: errorMessage };
    } finally {
      csvImporting = false;
      target.value = '';
    }
  }

  // Receipt import handlers
  async function handleBulkReceiptUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = Array.from(target.files ?? []);
    if (!files.length) return;
    receiptProcessing = true;
    receiptProgress = t('form.compressingReceipts', { count: files.length });
    const dataUrls = await Promise.all(
      files.map((f: File) => compressImageToDataUrl(f, 1920, 0.7))
    );
    receiptProgress = t('form.processingReceipts', { count: dataUrls.length });
    try {
      const data = await parseReceiptsBulk(dataUrls, ocrPro);
      receiptProgress = '';
      const flat: any[] = [];
      const today = new Date().toISOString().split('T')[0];
      for (const r of data.results ?? []) {
        if (r.error) continue;
        for (const item of r.items ?? []) {
          flat.push({
            type: item.type || 'expense',
            amount: item.amount,
            category: item.category || 'Other',
            date: r.date || today,
            name: item.name || '',
            note: item.note || '',
          });
        }
      }
      if (flat.length > 0) {
        parsedReceipts = flat;
        showBulkModal = true;
      } else {
        alert(t('form.noReceiptData'));
      }
    } catch (err) {
      console.error('Bulk receipt parse failed:', err);
      receiptProgress = '';
      alert(t('form.receiptFailed'));
    }
    receiptProcessing = false;
    target.value = '';
  }

  function handleBulkSave(saved: any[]) {
    showBulkModal = false;
    parsedReceipts = [];
    for (const item of saved) {
      addExpenseItem(item as Expense);
    }
  }

  function triggerReceiptUpload() {
    receiptInput?.click();
  }
</script>

{#if show}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onclick={(e) => { if (e.target === e.currentTarget) onclose?.(); }} onkeydown={(e) => { if (e.key === 'Escape') onclose?.(); }} role="dialog" aria-modal="true" tabindex="-1">
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold text-slate-800">{t('form.quickAdd')}</h2>
        <button onclick={() => onclose?.()} class="text-slate-400 hover:text-slate-600 transition-colors" aria-label={t('common.close')}>
          <i class="ph ph-x text-xl"></i>
        </button>
      </div>

      <form onsubmit={handleSubmit} class="space-y-4">
        <div class="flex gap-3">
          <label class="flex-1 flex items-center justify-center gap-2 cursor-pointer border {type === 'expense' ? 'border-rose-300 bg-rose-50' : 'border-slate-200'} rounded-lg py-2.5 transition-colors">
            <input type="radio" name="mqType" value="expense" bind:group={type} class="sr-only" />
            <i class="ph ph-trend-down {type === 'expense' ? 'text-rose-600' : 'text-slate-400'}"></i>
            <span class="text-sm font-medium {type === 'expense' ? 'text-rose-600' : 'text-slate-600'}">{t('type.expense')}</span>
          </label>
          <label class="flex-1 flex items-center justify-center gap-2 cursor-pointer border {type === 'income' ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'} rounded-lg py-2.5 transition-colors">
            <input type="radio" name="mqType" value="income" bind:group={type} class="sr-only" />
            <i class="ph ph-trend-up {type === 'income' ? 'text-emerald-600' : 'text-slate-400'}"></i>
            <span class="text-sm font-medium {type === 'income' ? 'text-emerald-600' : 'text-slate-600'}">{t('type.income')}</span>
          </label>
        </div>

        {#if spaces.length > 0}
          <div>
            <label for="mqSpace" class="block text-sm font-medium text-slate-700 mb-1">{t('form.space')}</label>
            <select
              id="mqSpace"
              value={currentSpaceId ?? ''}
              onchange={handleSpaceChange}
              disabled={switchingSpace}
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:opacity-60"
            >
              <option value="">{t('header.personal')}</option>
              {#each spaces as space}
                <option value={space.id}>{space.name}</option>
              {/each}
            </select>
          </div>
        {/if}

        <div>
          <label for="mqName" class="block text-sm font-medium text-slate-700 mb-1">{t('form.name')}</label>
          <input
            id="mqName"
            type="text"
            bind:value={name}
            placeholder={t('form.optionalName')}
            class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        <div>
          <label for="mqAmount" class="block text-sm font-medium text-slate-700 mb-1">{t('form.amount')}</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium">{currencySymbol}</span>
            <input
              id="mqAmount"
              type="number"
              step="0.01"
              min="0"
              bind:value={amount}
              placeholder="0.00"
              class="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        <div>
          <label for="mqCategory" class="block text-sm font-medium text-slate-700 mb-1">{t('form.categoryType')}</label>
          <CategorySelect
            id="mqCategory"
            type={type}
            bind:value={category}
            selectClass="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        <div>
          <label for="mqDate" class="block text-sm font-medium text-slate-700 mb-1">{t('form.date')}</label>
          <input
            id="mqDate"
            bind:this={dateInput}
            bind:value={date}
            class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        <div>
          <label for="mqNote" class="block text-sm font-medium text-slate-700 mb-1">{t('form.note')}</label>
          <input
            id="mqNote"
            type="text"
            bind:value={note}
            placeholder={t('form.optionalNote')}
            class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        <div class="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <i class="ph ph-repeat text-blue-600"></i>
              <span class="text-sm font-medium text-slate-700">{t('form.recurringTransaction')}</span>
            </div>
            <button type="button" onclick={() => isRecurring = !isRecurring} aria-label={t('form.recurringTransaction')}
              class="relative w-10 h-5 rounded-full transition-colors {isRecurring ? 'bg-blue-600' : 'bg-slate-300'}">
              <div class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform {isRecurring ? 'translate-x-5' : ''}"></div>
            </button>
          </div>
          {#if isRecurring}
            <div class="space-y-3 mt-3 animate-fade-in">
              <div>
                <label for="mq-frequency" class="block text-xs font-medium text-slate-500 mb-1">{t('form.frequency')}</label>
                <div class="flex gap-1">
                  {#each [
                    { v: 'daily' as const, l: t('freq.daily') },
                    { v: 'weekly' as const, l: t('freq.weekly') },
                    { v: 'biweekly' as const, l: t('freq.biweekly') },
                    { v: 'monthly' as const, l: t('freq.monthly') },
                    { v: 'yearly' as const, l: t('freq.yearly') }
                  ] as opt}
                    <button type="button" onclick={() => recurrenceFrequency = opt.v}
                      class="px-2.5 py-1 text-xs rounded-md font-medium transition-colors {recurrenceFrequency === opt.v ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-200'}">
                      {opt.l}
                    </button>
                  {/each}
                </div>
              </div>
              <div>
                <label for="mq-enddate" class="block text-xs font-medium text-slate-500 mb-1">{t('form.endDateOptional')}</label>
                <input id="mq-enddate" bind:this={endDateInput} type="text" bind:value={recurrenceEndDate} placeholder={t('form.noEndDate')}
                  class="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-md text-slate-800 text-xs focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
          {/if}
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
            {t('form.adding')}
          {:else}
            <i class="ph ph-plus-circle"></i>
            {t('form.addEntry')}
          {/if}
        </button>
      </form>

      <!-- Import section -->
      <div class="mt-6 pt-6 border-t border-slate-200">
        <div class="flex items-center gap-2 mb-3">
          <i class="ph ph-lightning text-blue-600"></i>
          <h3 class="text-sm font-semibold text-slate-700">{t('form.import')}</h3>
        </div>

        <!-- Receipt / OCR import -->
        <div class="mb-3">
          <button onclick={triggerReceiptUpload} disabled={receiptProcessing} class="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600 transition-colors cursor-pointer disabled:text-slate-300">
            <i class="ph ph-camera"></i>
            <span>{receiptProcessing ? t('form.importing') : t('form.importReceipts')}</span>
          </button>
          <div class="flex gap-2 mt-2">
            <label class="flex-1 flex flex-col gap-0.5 cursor-pointer border rounded-lg px-3 py-2 transition-colors {!ocrPro ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}">
              <span class="flex items-center gap-1.5">
                <input type="radio" name="ocrMode" checked={!ocrPro} onchange={() => ocrPro = false} class="text-blue-600 focus:ring-blue-500" />
                <span class="text-xs font-medium text-slate-700">{t('form.basicOcr', { count: 3 })}</span>
              </span>
              <span class="text-[11px] text-slate-500 leading-snug">{t('form.basicOcrDesc')}</span>
            </label>
            <label class="flex-1 flex flex-col gap-0.5 cursor-pointer border rounded-lg px-3 py-2 transition-colors {ocrPro ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}">
              <span class="flex items-center gap-1.5">
                <input type="radio" name="ocrMode" checked={ocrPro} onchange={() => ocrPro = true} class="text-blue-600 focus:ring-blue-500" />
                <span class="text-xs font-medium text-slate-700">{t('form.proOcr', { count: 6 })}</span>
              </span>
              <span class="text-[11px] text-slate-500 leading-snug">{t('form.proOcrDesc')}</span>
            </label>
          </div>
          <input bind:this={receiptInput} type="file" accept="image/*" multiple class="hidden" onchange={handleBulkReceiptUpload} />
          {#if receiptProgress}
            <div class="flex items-center gap-2 text-sm text-slate-500 mt-2">
              <i class="ph ph-circle-notch animate-spin"></i>
              <span>{receiptProgress}</span>
            </div>
          {/if}
        </div>

        <!-- CSV import -->
        <div>
          <button onclick={triggerCsvImport} disabled={csvImporting} class="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600 transition-colors cursor-pointer disabled:text-slate-300">
            <i class="ph ph-file-csv"></i>
            <span>{csvImporting ? t('form.importing') : t('form.importCsv')}</span>
          </button>
          <input bind:this={csvFileInput} type="file" accept=".csv" class="hidden" onchange={handleCsvFileSelect} />
          {#if csvImporting}
            <div class="flex items-center gap-2 text-sm text-slate-500 mt-2">
              <i class="ph ph-circle-notch animate-spin"></i>
              <span>{t('form.importingCsv')}</span>
            </div>
          {/if}
          {#if csvResult}
            <div class="mt-2 px-3 py-2 rounded-lg text-sm {csvResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}">
              {#if csvResult.success}
                <i class="ph ph-check-circle mr-1"></i>
              {:else}
                <i class="ph ph-x-circle mr-1"></i>
              {/if}
              {csvResult.message}
              {#if csvResult.success}
                <button onclick={() => { csvResult = null; onclose?.(); }} class="ml-2 text-blue-600 hover:underline">{t('common.close')}</button>
              {:else}
                <button onclick={() => csvResult = null} class="ml-2 text-blue-600 hover:underline">{t('common.dismiss')}</button>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<BulkImportModal
  show={showBulkModal}
  results={parsedReceipts}
  onclose={() => { showBulkModal = false; parsedReceipts = []; }}
  onsave={handleBulkSave}
/>
