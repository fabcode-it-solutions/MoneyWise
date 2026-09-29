<script lang="ts">
  import { getPendingInvites } from '../lib/state.svelte.js';
  import { respondToInvite } from '../lib/api.js';
  import { t } from '../lib/i18n.svelte.js';

  let invites = $derived(getPendingInvites());
  let responding = $state<string>('');
  let error = $state('');

  function nicknameFor(space: any): string {
    const owner = space.members.find((m: any) => m.role === 'owner');
    return owner?.nickname || t('invite.theOwner');
  }

  async function respond(spaceId: string, accept: boolean) {
    error = '';
    responding = spaceId;
    try {
      await respondToInvite(spaceId, accept);
    } catch (err: any) {
      error = err.message || t('invite.respondFailed');
    } finally {
      responding = '';
    }
  }
</script>

{#if invites.length > 0}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 animate-fade-in">
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6">
      <div class="flex items-center gap-2 mb-4">
        <i class="ph ph-envelope-simple-open text-xl text-blue-600"></i>
        <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">{t('invite.title', { count: invites.length })}</h2>
      </div>

      {#if error}
        <p class="text-sm text-rose-600 bg-rose-50 dark:bg-rose-900/30 px-3 py-2 rounded-lg mb-3">{error}</p>
      {/if}

      <ul class="space-y-3">
        {#each invites as space (space.id)}
          <li class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
            <p class="text-sm text-slate-700 dark:text-slate-200 mb-3">
              <span class="font-semibold">{nicknameFor(space)}</span> {t('invite.invitedYouTo')}
              <span class="font-semibold">{space.name}</span>.
            </p>
            <div class="flex gap-2">
              <button
                onclick={() => respond(space.id, true)}
                disabled={responding === space.id}
                class="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {t('invite.accept')}
              </button>
              <button
                onclick={() => respond(space.id, false)}
                disabled={responding === space.id}
                class="flex-1 py-2 bg-slate-100 dark:bg-slate-600 hover:bg-slate-200 dark:hover:bg-slate-500 disabled:opacity-50 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg transition-colors"
              >
                {t('invite.decline')}
              </button>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  </div>
{/if}
