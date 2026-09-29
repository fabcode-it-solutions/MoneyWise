<script lang="ts">
  import { sendAiMessage, fetchAiQuota, loadExpenses } from '../lib/api.js';
  import { getAiChats, getActiveAiChat, startNewAiChat, selectAiChat, deleteAiChat, setActiveAiChatMessages, setActiveAiChatSpaceId, getSpaces, getCurrentSpaceId, type AiChatMessage, type AiChat } from '../lib/state.svelte.js';
  import { t } from '../lib/i18n.svelte.js';

  let { show = false, onclose, embedded = false } = $props<{
    show?: boolean;
    onclose?: () => void;
    embedded?: boolean;
  }>();

  let active = $derived(embedded || show);

  let activeChat = $derived(getActiveAiChat());
  let messages = $derived<AiChatMessage[]>(activeChat.messages.length === 0
    ? [{ role: 'assistant', content: t('ai.newConversation') }]
    : activeChat.messages);
  let recentChats = $derived<AiChat[]>(getAiChats());
  let isSavedChat = $derived(recentChats.some(c => c.id === activeChat.id));

  let input = $state<string>('');
  let sending = $state<boolean>(false);
  let weeklyRemaining = $state<number>(115);
  let cooldownUntil = $state<number>(0);
  let cooldownTimer = $state<number>(0);
  let cooldownInterval = $state<ReturnType<typeof setInterval> | null>(null);
  let showChatsMenu = $state<boolean>(false);

  // The ledger this conversation targets. New/legacy chats fall back to the
  // app's current Hub selection until the user pins one from the in-chat
  // picker; once pinned, the chat keeps its own Hub independent of that
  // selection.
  let pinnedSpaceId = $derived(activeChat.spaceId === undefined ? getCurrentSpaceId() : activeChat.spaceId);
  let spaces = $derived(getSpaces());
  let aiSpace = $derived(pinnedSpaceId ? spaces.find(s => s.id === pinnedSpaceId) ?? null : null);
  let contextLabel = $derived(aiSpace ? t('ai.hubContext', { name: aiSpace.name }) : t('header.personal'));
  let pickerOpen = $state<boolean>(false);

  let messagesEl = $state<HTMLElement | null>(null);
  let inputEl = $state<HTMLTextAreaElement | null>(null);

  const quickPrompts = $derived([
    t('ai.quick1'),
    t('ai.quick2'),
    t('ai.quick3'),
    t('ai.quick4'),
  ]);

  $effect(() => {
    if (active) {
      fetchAiQuota().then(q => {
        weeklyRemaining = q.weeklyRemaining;
      }).catch(() => {});
      setTimeout(() => inputEl?.focus(), 100);
    }
  });

  $effect(() => {
    if (messagesEl) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  });

  function newChat() {
    startNewAiChat();
    showChatsMenu = false;
    setTimeout(() => inputEl?.focus(), 100);
  }

  function openChat(id: string) {
    selectAiChat(id);
    showChatsMenu = false;
    setTimeout(() => inputEl?.focus(), 100);
  }

  function deleteChat(id: string) {
    deleteAiChat(id);
    showChatsMenu = false;
    setTimeout(() => inputEl?.focus(), 100);
  }

  function selectAiSpace(spaceId: string | null) {
    setActiveAiChatSpaceId(spaceId);
    pickerOpen = false;
    setTimeout(() => inputEl?.focus(), 100);
  }

  function resizeInput() {
    const el = inputEl;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  function sendPrompt(text: string) {
    input = text;
    send();
  }

  async function send() {
    const text = input.trim();
    if (!text || sending || Date.now() < cooldownUntil) return;
    input = '';
    resizeInput();
    sending = true;
    const history = activeChat.messages;
    const withUser: AiChatMessage[] = [...history, { role: 'user', content: text }];
    setActiveAiChatMessages([...withUser, { role: 'assistant', content: '...' }]);
    try {
      const res = await sendAiMessage(text, history, aiSpace ? aiSpace.id : null);
      if (res.weeklyRemaining !== undefined) weeklyRemaining = res.weeklyRemaining;
      const reply = res.reply || t('ai.sorry');
      setActiveAiChatMessages([...withUser, { role: 'assistant', content: reply }]);
      if (res.dataChanged) loadExpenses();
    } catch (err: any) {
      const msg = err?.message || t('form.networkError');
      setActiveAiChatMessages([...withUser, { role: 'assistant', content: msg }]);
      if (err.status === 429 && err.retryAfter) {
        cooldownUntil = Date.now() + err.retryAfter * 1000;
        cooldownTimer = err.retryAfter;
      }
    } finally {
      sending = false;
    }
  }

  $effect(() => {
    if (cooldownUntil > Date.now()) {
      const interval = setInterval(() => {
        const remaining = Math.ceil(Math.max(0, cooldownUntil - Date.now()) / 1000);
        cooldownTimer = remaining;
        if (remaining <= 0) {
          clearInterval(interval);
          cooldownUntil = 0;
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }
</script>

{#snippet panelContent()}
  <div class="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
    <div class="flex items-center gap-2">
      <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
        <i class="ph-fill ph-brain text-blue-600 dark:text-blue-400 text-sm"></i>
      </div>
      <div>
        <h2 class="text-sm font-bold text-slate-800 dark:text-slate-100">{t('ai.assistant')}</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">{t('ai.poweredByAI')}</p>
      </div>
    </div>
    <div class="flex items-center gap-1 relative">
      <button onclick={newChat} class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1" title={t('ai.newChat')}>
        <i class="ph ph-plus-circle text-lg"></i>
      </button>
      {#if isSavedChat}
        <button
          onclick={() => deleteChat(activeChat.id)}
          class="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors p-1"
          title={t('ai.deleteChat')}
        >
          <i class="ph ph-trash text-lg"></i>
        </button>
      {/if}
      <button
        onclick={() => showChatsMenu = !showChatsMenu}
        class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1"
        title={t('ai.recentChats')}
      >
        <i class="ph ph-clock-counter-clockwise text-lg"></i>
      </button>
      {#if showChatsMenu}
        <div role="presentation" class="fixed inset-0 z-10" onclick={() => showChatsMenu = false}></div>
        <div class="absolute right-0 top-full mt-1 w-64 max-w-[calc(100vw_-_1.5rem)] max-h-[min(20rem,60vh)] overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-20">
          {#if recentChats.length === 0}
            <p class="text-xs text-slate-400 dark:text-slate-500 px-3 py-3 text-center">{t('ai.noChatsYet')}</p>
          {:else}
            {#each recentChats as chat}
              <div class="flex items-center group {chat.id === activeChat.id ? 'bg-slate-100 dark:bg-slate-700' : ''} hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <button
                  onclick={() => openChat(chat.id)}
                  class="flex-1 min-w-0 text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 truncate {chat.id === activeChat.id ? 'font-medium' : ''}"
                >
                  {chat.title}
                </button>
                <button
                  onclick={() => deleteChat(chat.id)}
                  class="flex-shrink-0 px-2 py-2 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  title={t('ai.deleteChat')}
                  aria-label={t('ai.deleteChat')}
                >
                  <i class="ph ph-trash"></i>
                </button>
              </div>
            {/each}
          {/if}
        </div>
      {/if}
      {#if !embedded}
        <button onclick={() => onclose?.()} class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1" aria-label={t('ai.closeChat')}>
          <i class="ph ph-x text-xl"></i>
        </button>
      {/if}
    </div>
  </div>

  <div bind:this={messagesEl} class="flex-1 overflow-y-auto p-4 space-y-4">
    {#each messages as msg}
      {#if msg.role === 'user'}
        <div class="flex justify-end">
          <div class="bg-blue-600 text-white rounded-2xl rounded-tr-none px-4 py-2.5 text-sm max-w-[85%]">{msg.content}</div>
        </div>
      {:else}
        <div class="flex gap-2">
          <div class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
            <i class="ph-fill ph-brain text-blue-600 dark:text-blue-400 text-sm"></i>
          </div>
          <div class="bg-slate-100 dark:bg-slate-700 rounded-2xl rounded-tl-none px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 max-w-[85%] whitespace-pre-wrap">
            {#if msg.content === '...'}
              <span class="inline-flex items-center gap-1 py-0.5 text-slate-500 dark:text-slate-300">
                <span class="typing-dot"></span>
                <span class="typing-dot" style="animation-delay: 0.15s"></span>
                <span class="typing-dot" style="animation-delay: 0.3s"></span>
              </span>
            {:else}
              {msg.content}
            {/if}
          </div>
        </div>
      {/if}
    {/each}
  </div>

  <div class="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
    <div class="flex items-center justify-between gap-2 text-xs text-slate-400 dark:text-slate-500 mb-1.5 px-1">
      <div class="relative min-w-0">
        <button
          onclick={() => pickerOpen = !pickerOpen}
          class="flex items-center gap-1 min-w-0 max-w-[13rem] px-1.5 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 cursor-pointer"
          title={t('ai.ledgerTitle')}
        >
          <i class="ph {aiSpace ? 'ph-users-three' : 'ph-user'} text-slate-400 dark:text-slate-500"></i>
          <span class="truncate">{contextLabel}</span>
          <i class="ph ph-caret-down text-[10px] flex-shrink-0"></i>
        </button>
        {#if pickerOpen}
          <div role="presentation" class="fixed inset-0 z-40" onclick={() => pickerOpen = false}></div>
          <div class="absolute left-0 bottom-full mb-1 w-56 max-w-[calc(100vw_-_1.5rem)] max-h-[min(20rem,50vh)] overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg z-50 py-1 animate-fade-in">
            <button
              onclick={() => selectAiSpace(null)}
              class="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors {!pinnedSpaceId ? 'text-blue-600 font-medium' : 'text-slate-700 dark:text-slate-200'}"
            >
              <i class="ph ph-user"></i>
              <span class="truncate">{t('header.personal')}</span>
              {#if !pinnedSpaceId}
                <i class="ph ph-check text-blue-600 ml-auto flex-shrink-0"></i>
              {/if}
            </button>
            {#each spaces as space (space.id)}
              <button
                onclick={() => selectAiSpace(space.id)}
                class="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors {pinnedSpaceId === space.id ? 'text-blue-600 font-medium' : 'text-slate-700 dark:text-slate-200'}"
              >
                <i class="ph ph-users-three"></i>
                <span class="truncate">{space.name}</span>
                {#if pinnedSpaceId === space.id}
                  <i class="ph ph-check text-blue-600 ml-auto flex-shrink-0"></i>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <span class="flex-shrink-0">{t('ai.weekLeft', { count: weeklyRemaining })}</span>
    </div>

    {#if activeChat.messages.length === 0}
      <div class="flex gap-2 overflow-x-auto pb-2 px-1 -mx-1 custom-scrollbar">
        {#each quickPrompts as prompt}
          <button
            onclick={() => sendPrompt(prompt)}
            class="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 transition-colors cursor-pointer"
          >
            {prompt}
          </button>
        {/each}
      </div>
    {/if}

    <div class="rounded-2xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-sm transition-all focus-within:shadow-md focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-400">
      <textarea
        bind:this={inputEl}
        bind:value={input}
        onkeydown={handleKeydown}
        oninput={resizeInput}
        rows={1}
        enterkeyhint="send"
        placeholder={cooldownTimer > 0 ? t('ai.cooldown', { seconds: cooldownTimer }) : aiSpace ? t('ai.askAboutHub') : t('ai.askAbout')}
        disabled={sending || cooldownTimer > 0}
        class="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none disabled:opacity-50"
      ></textarea>
      <div class="flex items-center justify-between gap-2 px-2 pb-1.5">
        <span class="hidden sm:inline pl-1 text-[10px] text-slate-400 dark:text-slate-500">{t('ai.sendHint')}</span>
        <div class="flex items-center gap-1.5 ml-auto">
          <button
            onclick={send}
            disabled={!input.trim() || sending || cooldownTimer > 0}
            aria-label={t('ai.sendMessage')}
            class="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all {!input.trim() || cooldownTimer > 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}"
          >
            {#if sending}
              <i class="ph ph-spinner animate-spin text-sm"></i>
            {:else if cooldownTimer > 0}
              <span class="text-[11px] font-bold">{cooldownTimer}s</span>
            {:else}
              <i class="ph-fill ph-paper-plane-right text-sm"></i>
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/snippet}

{#if embedded}
  <div class="h-full flex flex-col bg-white dark:bg-slate-800">
    {@render panelContent()}
  </div>
{:else if show}
  <div class="fixed inset-0 z-50 bg-white dark:bg-slate-800 flex flex-col animate-fade-in">
    {@render panelContent()}
  </div>
{/if}

<style>
  .typing-dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 9999px;
    background: currentColor;
    animation: typing-bounce 1.2s infinite ease-in-out;
  }

  @keyframes typing-bounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
    30% { transform: translateY(-3px); opacity: 1; }
  }
</style>
