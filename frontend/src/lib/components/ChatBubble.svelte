<script lang="ts">
  let { role, content, status }: { role: 'user' | 'assistant' | 'tool'; content: string; status?: string; } = $props();
</script>

<div class={`flex w-full ${role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
  <div class={`max-w-[80%] px-4 py-3 rounded-2xl ${
    role === 'user' 
      ? 'bg-primary text-primary-foreground rounded-br-sm' 
      : 'bg-muted text-foreground rounded-bl-sm border border-border shadow-sm'
  }`}>
    <div class="text-sm font-semibold mb-1 opacity-70">
      {role === 'user' ? 'You' : 'Assistant'}
    </div>
    <div class="whitespace-pre-wrap leading-relaxed text-[15px]">
      {content}
    </div>
    {#if status}
      <div class="mt-2 text-xs italic opacity-70 flex items-center gap-2">
        <svg class="animate-spin h-3 w-3 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span class="animate-pulse">{status}</span>
      </div>
    {/if}
  </div>
</div>
