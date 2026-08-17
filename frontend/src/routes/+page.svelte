<script lang="ts">
  import { onMount } from 'svelte';
  import ModelSelector from '$lib/components/ModelSelector.svelte';
  import ChatBubble from '$lib/components/ChatBubble.svelte';
  import ChatInput from '$lib/components/ChatInput.svelte';
  import ToolPermissionModal from '$lib/components/ToolPermissionModal.svelte';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Card } from '$lib/components/ui/card';

  const API = 'http://localhost:3000/api';

  type Message = {
    role: 'user' | 'assistant' | 'tool';
    content: string;
    status?: string;
    toolEvents?: any[];
  };

  type PendingPermission = {
    requestId: string;
    toolName: string;
    reason: string;
    args: Record<string, any>;
  };

  let models: any[] = $state([]);
  let selectedModel: string = $state('');
  let messages: Message[] = $state([]);
  let isGenerating = $state(false);
  let scrollAreaElement: HTMLElement | undefined = $state();
  let pendingPermission: PendingPermission | null = $state(null);

  onMount(async () => {
    try {
      const res = await fetch(`${API}/models`);
      if (res.ok) {
        models = await res.json();
        if (models.length > 0) selectedModel = models[0].name;
      }
    } catch (e) {
      console.error('Failed to fetch models', e);
    }
  });

  const scrollToBottom = () => {
    if (scrollAreaElement) {
      const viewport = scrollAreaElement.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    }
  };

  $effect(() => {
    messages;
    scrollToBottom();
  });

  async function handleSend(event: CustomEvent<{ message: string }>) {
    const userMessage = event.detail.message;
    if (!selectedModel) { alert('Please select a model first.'); return; }

    messages = [...messages, { role: 'user', content: userMessage }];
    isGenerating = true;
    messages = [...messages, { role: 'assistant', content: '', toolEvents: [] }];
    let assistantIdx = messages.length - 1;

    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, message: userMessage }),
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (!value) continue;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') { done = true; break; }

          try {
            const parsed = JSON.parse(raw);

            if (parsed.type === 'status') {
              messages[assistantIdx] = { ...messages[assistantIdx], status: parsed.message };
              messages = [...messages];

            } else if (parsed.type === 'content') {
              const prev = messages[assistantIdx];
              messages[assistantIdx] = {
                ...prev,
                status: undefined,
                content: prev.content + parsed.content,
              };
              messages = [...messages];

            } else if (parsed.type === 'tool_event') {
              const prev = messages[assistantIdx];
              const evts = [...(prev.toolEvents ?? [])];

              if (parsed.event === 'permission_request') {
                // Show modal — stream is paused server-side until we respond
                pendingPermission = {
                  requestId: parsed.requestId,
                  toolName: parsed.toolName,
                  reason: parsed.reason,
                  args: parsed.args ?? {},
                };
                evts.push({ ...parsed });
              } else {
                // Clear permission modal once resolved
                if (
                  parsed.event === 'tool_executing' ||
                  parsed.event === 'tool_denied' ||
                  parsed.event === 'tool_error'
                ) {
                  pendingPermission = null;
                }
                evts.push({ ...parsed });
              }

              messages[assistantIdx] = { ...prev, status: parsed.message, toolEvents: evts };
              messages = [...messages];
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (e) {
      console.error('Chat error:', e);
      messages[assistantIdx] = {
        ...messages[assistantIdx],
        content: 'Sorry, an error occurred while generating the response.',
      };
    } finally {
      isGenerating = false;
      pendingPermission = null;
      messages[assistantIdx] = { ...messages[assistantIdx], status: undefined };
      messages = [...messages];
    }
  }

  function handlePermissionResponse(result: 'approve_once' | 'approve_always' | 'deny') {
    pendingPermission = null;
  }
</script>

<svelte:head>
  <title>AI Assistant</title>
</svelte:head>

<div class="h-screen w-full flex bg-background items-center justify-center p-4 sm:p-8">
  <Card class="w-full max-w-4xl h-full flex flex-col shadow-2xl border border-border/50 rounded-xl overflow-hidden bg-card/80 backdrop-blur-xl">

    <!-- Header -->
    <header class="flex items-center justify-between p-4 border-b bg-card/50 shrink-0">
      <div class="flex flex-col">
        <h1 class="text-xl font-bold bg-linear-to-r from-primary to-blue-500 bg-clip-text text-transparent">
          AI Assistant
        </h1>
        <p class="text-xs text-muted-foreground">Powered by Ollama + pgvector</p>
      </div>

      <div class="flex items-center gap-3">
        {#if models.length > 0}
          <ModelSelector bind:models bind:selectedModel />
        {:else}
          <div class="text-sm text-muted-foreground animate-pulse">Loading models...</div>
        {/if}

        <a
          href="/settings"
          class="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 hover:bg-muted/80 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          Settings
        </a>
      </div>
    </header>

    <!-- Chat Area -->
    <div class="flex-1 overflow-hidden relative bg-muted/20" bind:this={scrollAreaElement}>
      <ScrollArea class="h-full p-4 sm:p-6 w-full">
        {#if messages.length === 0}
          <div class="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 space-y-4">
            <div class="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary">
                <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/>
                <path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
              </svg>
            </div>
            <div class="text-center space-y-1">
              <p class="font-medium">Start a conversation</p>
              <p class="text-sm">The AI has access to filesystem, shell, web scraping, and self-creating tools.</p>
            </div>
          </div>
        {:else}
          <div class="space-y-6 pb-4">
            {#each messages as msg}
              <ChatBubble
                role={msg.role}
                content={msg.content}
                status={msg.status}
                toolEvents={msg.toolEvents ?? []}
              />
            {/each}
            {#if isGenerating}
              <div class="flex gap-1.5 p-2 items-center text-sm text-muted-foreground ml-2">
                {#each [0, 1, 2] as i}
                  <div
                    class="w-2 h-2 rounded-full bg-primary/60 animate-bounce"
                    style="animation-delay: {i * 150}ms"
                  ></div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </ScrollArea>
    </div>

    <!-- Input Area -->
    <ChatInput onsend={handleSend} disabled={isGenerating || models.length === 0} />
  </Card>
</div>

<!-- Permission Modal (portal-style overlay) -->
{#if pendingPermission}
  <ToolPermissionModal
    requestId={pendingPermission.requestId}
    toolName={pendingPermission.toolName}
    reason={pendingPermission.reason}
    args={pendingPermission.args}
    onRespond={handlePermissionResponse}
  />
{/if}
