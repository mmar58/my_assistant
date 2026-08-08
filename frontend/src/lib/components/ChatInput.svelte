<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import * as Input from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { SendHorizontal } from 'lucide-svelte';

  let message = "";
  export let disabled = false;

  const dispatch = createEventDispatcher();

  function handleSubmit() {
    if (message.trim() && !disabled) {
      dispatch('send', { message: message.trim() });
      message = "";
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }
</script>

<div class="flex items-center gap-2 p-4 border-t bg-background">
  <Input.Root>
    <Input.Root 
      bind:value={message} 
      {disabled} 
      placeholder="Type your message..." 
      class="flex-1 bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary shadow-sm h-12"
      on:keydown={handleKeydown}
    />
  </Input.Root>
  <Button 
    size="icon" 
    class="h-12 w-12 rounded-full shrink-0 shadow-md transition-all hover:scale-105 active:scale-95" 
    {disabled} 
    on:click={handleSubmit}
  >
    <SendHorizontal class="w-5 h-5" />
    <span class="sr-only">Send</span>
  </Button>
</div>
