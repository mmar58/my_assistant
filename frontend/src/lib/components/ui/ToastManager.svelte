<script lang="ts">
  import { toasts } from '$lib/stores/toast';
  import { fade, fly } from 'svelte/transition';
  
  // Provide icons based on toast type
  function getIcon(type: string) {
    if (type === 'success') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    }
    if (type === 'error') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  }
</script>

<div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
  {#each $toasts as toast (toast.id)}
    <div
      in:fly={{ y: 20, duration: 300 }}
      out:fade={{ duration: 200 }}
      class="flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium pointer-events-auto w-80 text-white {
        toast.type === 'success' ? 'bg-green-600' :
        toast.type === 'error' ? 'bg-red-600' :
        'bg-blue-600'
      }"
    >
      <div class="shrink-0">
        {@html getIcon(toast.type)}
      </div>
      <div class="flex-1">
        {toast.message}
      </div>
    </div>
  {/each}
</div>
