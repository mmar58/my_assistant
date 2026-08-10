<script lang="ts">
  import { onMount } from 'svelte';
  import ModelSelector from '$lib/components/ModelSelector.svelte';
  import ChatBubble from '$lib/components/ChatBubble.svelte';
  import ChatInput from '$lib/components/ChatInput.svelte';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Card } from '$lib/components/ui/card';

  type Message = {
    role: 'user' | 'assistant';
    content: string;
  };

  let models: any[] = $state([]);
  let selectedModel: string = $state("");
  let messages: Message[] = $state([]);
  let isGenerating = $state(false);
  let scrollAreaElement: HTMLElement | undefined = $state();

  onMount(async () => {
    try {
      const res = await fetch('http://localhost:3000/api/models');
      if (res.ok) {
        models = await res.json();
        if (models.length > 0) {
          selectedModel = models[0].name; // Default to first model
        }
      }
    } catch (e) {
      console.error("Failed to fetch models", e);
    }
  });

  const scrollToBottom = () => {
    if (scrollAreaElement) {
      // scroll-area creates a viewport div inside it, we just scroll the first child that has overflow auto/scroll
      const viewport = scrollAreaElement.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  };

  $effect(() => {
    messages;
    scrollToBottom();
  });

  async function handleSend(event: CustomEvent<{ message: string }>) {
    const userMessage = event.detail.message;
    if (!selectedModel) {
      alert("Please select a model first.");
      return;
    }

    messages = [...messages, { role: 'user', content: userMessage }];
    isGenerating = true;

    // Add empty assistant message to stream into
    messages = [...messages, { role: 'assistant', content: '' }];
    let assistantMessageIndex = messages.length - 1;

    try {
      const res = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, message: userMessage })
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                done = true;
                break;
              }
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  messages[assistantMessageIndex].content += parsed.content;
                  messages = [...messages];
                }
              } catch (e) {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("Chat error:", e);
      messages[assistantMessageIndex].content = "Sorry, an error occurred while generating the response.";
    } finally {
      isGenerating = false;
    }
  }
</script>

<div class="h-screen w-full flex bg-background items-center justify-center p-4 sm:p-8">
  <Card class="w-full max-w-4xl h-full flex flex-col shadow-2xl border border-border/50 rounded-xl overflow-hidden bg-card/80 backdrop-blur-xl">
    
    <!-- Header -->
    <header class="flex items-center justify-between p-4 border-b bg-card/50">
      <div class="flex flex-col">
        <h1 class="text-xl font-bold bg-linear-to-r from-primary to-blue-500 bg-clip-text text-transparent">Antigravity Chat</h1>
        <p class="text-xs text-muted-foreground">Powered by Ollama</p>
      </div>
      
      {#if models.length > 0}
        <ModelSelector bind:models bind:selectedModel />
      {:else}
        <div class="text-sm text-muted-foreground animate-pulse">Loading models...</div>
      {/if}
    </header>

    <!-- Chat Area -->
    <div class="flex-1 overflow-hidden relative bg-muted/20" bind:this={scrollAreaElement}>
      <ScrollArea class="h-full p-4 sm:p-6 w-full">
        {#if messages.length === 0}
          <div class="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 space-y-4">
            <div class="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
            </div>
            <p>Start a conversation by typing a message below.</p>
          </div>
        {:else}
          <div class="space-y-6 pb-4">
            {#each messages as msg}
              <ChatBubble role={msg.role} content={msg.content} />
            {/each}
            {#if isGenerating}
              <div class="flex gap-2 p-2 items-center text-sm text-muted-foreground animate-pulse ml-2">
                <div class="w-2 h-2 rounded-full bg-primary/60"></div>
                <div class="w-2 h-2 rounded-full bg-primary/60 animation-delay-150"></div>
                <div class="w-2 h-2 rounded-full bg-primary/60 animation-delay-300"></div>
              </div>
            {/if}
          </div>
        {/if}
      </ScrollArea>
    </div>

    <!-- Input Area -->
    <ChatInput on:send={handleSend} disabled={isGenerating || models.length === 0} />
  </Card>
</div>
