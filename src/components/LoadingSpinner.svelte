<script lang="ts">
  let { size = 'sm' } = $props();

  let iconSize = $derived(size === 'sm' ? 'text-base' : 'text-2xl');
</script>

<div class="flex items-center justify-center p-4">
  <i class="ph ph-circle-notch animate-spin {iconSize} text-blue-500"></i>
</div>
