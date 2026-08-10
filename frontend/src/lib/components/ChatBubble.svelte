<script lang="ts">
  let { role, content }: { role: 'user' | 'assistant'; content: string; } = $props();
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
  </div>
</div>
