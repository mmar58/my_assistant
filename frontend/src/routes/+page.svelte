<script lang="ts">
  import { onMount } from 'svelte';
  import ModelSelector from '$lib/components/ModelSelector.svelte';
  import ChatBubble from '$lib/components/ChatBubble.svelte';
  import ChatInput from '$lib/components/ChatInput.svelte';
  import ToolPermissionModal from '$lib/components/ToolPermissionModal.svelte';
  import ChatConfigPanel from '$lib/components/ChatConfigPanel.svelte';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Card } from '$lib/components/ui/card';

  const API = 'http://localhost:3000/api';

  type Message = {
    role: 'user' | 'assistant' | 'tool' | 'system';
    content: string;
    status?: string;
    toolEvents?: any[];
    promptEvalCount?: number;
    evalCount?: number;
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
  let chats: any[] = $state([]);
  let selectedChatId: string | null = $state(null);
  let isGenerating = $state(false);
  let scrollAreaElement: HTMLElement | undefined = $state();
  let pendingPermission: PendingPermission | null = $state(null);
  
  // Advanced features state
  let rightSidebarOpen = $state(false);
  let summaryText = $state('');
  let isSummarizing = $state(false);
  let activeMenuId = $state<string | null>(null);
  let chatConfigOpen = $state(false);

  // Token tracking — updated from last message's eval counts
  let lastPromptTokens = $state(0);
  let lastEvalTokens = $state(0);

  let currentChat = $derived(chats.find(c => c.id === selectedChatId));
  let contextLength = $derived(models.find(m => m.name === selectedModel)?.details?.context_length ?? 8192);
  let totalUsedTokens = $derived(lastPromptTokens + lastEvalTokens);
  let tokenPct = $derived(Math.min(100, Math.round((totalUsedTokens / contextLength) * 100)));

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
    loadChats();
  });

  async function loadChats() {
    try {
      const res = await fetch(`${API}/chats`);
      if (res.ok) chats = await res.json();
    } catch (e) {
      console.error('Failed to load chats', e);
    }
  }

  async function selectChat(id: string) {
    selectedChatId = id;
    const chat = chats.find(c => c.id === id);
    if (chat && chat.last_model) selectedModel = chat.last_model;

    try {
      const res = await fetch(`${API}/chats/${id}/messages`);
      if (res.ok) {
        const history = await res.json();
        messages = history.map((m: any) => ({
          role: m.role,
          content: m.content,
          toolEvents: m.tool_calls || [],
          promptEvalCount: m.prompt_eval_count,
          evalCount: m.eval_count
        }));
        if (currentChat?.use_summary) {
           // We might just show it via the UI, or the backend already sent it as the first message
        }
      }
    } catch (e) {
      console.error('Failed to load messages', e);
    }
  }

  function newChat() {
    selectedChatId = null;
    messages = [];
    rightSidebarOpen = false;
    chatConfigOpen = false;
    lastPromptTokens = 0;
    lastEvalTokens = 0;
  }

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

  // Handle clicks outside dropdown menus
  function handleWindowClick(e: MouseEvent) {
    if (!(e.target as HTMLElement).closest('.chat-menu-container')) {
      activeMenuId = null;
    }
  }

  onMount(() => {
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
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
        body: JSON.stringify({ model: selectedModel, message: userMessage, chatId: selectedChatId }),
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        if (readerDone) {
          done = true;
          break;
        }
        if (!value) continue;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the last incomplete line in the buffer

        for (const line of lines) {
          if (!line.trim()) continue;
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

              } else if (parsed.type === 'context_usage') {
                const prev = messages[assistantIdx];
                messages[assistantIdx] = { ...prev, promptEvalCount: parsed.prompt, evalCount: parsed.eval };
                messages = [...messages];
                // Update header token meter
                if (parsed.prompt) lastPromptTokens = parsed.prompt;
                if (parsed.eval) lastEvalTokens = parsed.eval;

              } else if (parsed.type === 'tool_event') {
                if (parsed.event === 'chat_created') {
                  selectedChatId = parsed.chatId;
                  loadChats();
                  continue;
                } else if (parsed.event === 'chat_title_updated') {
                  loadChats();
                  continue;
                }

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

  async function renameChat(id: string) {
    activeMenuId = null;
    const chat = chats.find(c => c.id === id);
    const title = prompt('Enter new chat title:', chat?.title);
    if (title) {
      await fetch(`${API}/chats/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      loadChats();
    }
  }

  async function autoRenameChat(id: string) {
    activeMenuId = null;
    try {
      await fetch(`${API}/chats/${id}/auto-rename`, { method: 'POST' });
      loadChats();
    } catch {}
  }

  async function deleteChat(id: string) {
    activeMenuId = null;
    if (confirm('Are you sure you want to delete this chat?')) {
      await fetch(`${API}/chats/${id}`, { method: 'DELETE' });
      if (selectedChatId === id) newChat();
      loadChats();
    }
  }

  async function summarizeChat(id: string) {
    activeMenuId = null;
    if (selectedChatId !== id) await selectChat(id);
    rightSidebarOpen = true;
    isSummarizing = true;
    try {
      const res = await fetch(`${API}/chats/${id}/summarize`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        summaryText = data.summary;
        loadChats(); // Reload to get updated chat.summary
      }
    } finally {
      isSummarizing = false;
    }
  }

  async function toggleSummaryMode() {
    if (!currentChat) return;
    const newMode = !currentChat.use_summary;
    await fetch(`${API}/chats/${currentChat.id}/toggle-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ use_summary: newMode })
    });
    await loadChats();
    await selectChat(currentChat.id); // Reload messages
  }
</script>

<svelte:head>
  <title>AI Assistant</title>
</svelte:head>

<div class="h-screen w-full flex bg-background p-4 sm:p-8 gap-4">
  <!-- Sidebar -->
  <Card class="w-64 hidden md:flex flex-col shadow-2xl border border-border/50 rounded-xl overflow-hidden bg-card/80 backdrop-blur-xl shrink-0">
    <div class="p-4 border-b">
      <button class="w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium hover:bg-primary/90 transition-colors" onclick={newChat}>
        + New Chat
      </button>
    </div>
    <ScrollArea class="flex-1 p-2">
      <div class="flex flex-col gap-1">
        {#each chats as chat}
          <div class="relative group">
            <button 
              class="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors {selectedChatId === chat.id ? 'bg-muted font-medium' : 'hover:bg-muted/50 text-muted-foreground'}"
              onclick={() => selectChat(chat.id)}
            >
              <div class="truncate pr-24">{chat.title}</div>
              <div class="text-[10px] text-muted-foreground/60">{new Date(chat.updated_at).toLocaleDateString()}</div>
            </button>
            
            <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm p-1 rounded-md shadow-sm border">
              <!-- Rename -->
              <button class="p-1 rounded hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground transition-colors" title="Rename" onclick={(e) => { e.stopPropagation(); renameChat(chat.id); }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </button>
              <!-- Auto Rename -->
              <button class="p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors" title="Auto-Rename (AI)" onclick={(e) => { e.stopPropagation(); autoRenameChat(chat.id); }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287Z"/></svg>
              </button>
              <!-- Summarize -->
              <button class="p-1 rounded hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground transition-colors" title="Summarize" onclick={(e) => { e.stopPropagation(); summarizeChat(chat.id); }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h20"/><path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="m4 8 8-4 8 4"/></svg>
              </button>
              <!-- Delete -->
              <button class="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-500 transition-colors" title="Delete" onclick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        {/each}
      </div>
    </ScrollArea>
  </Card>

  <!-- Main Chat -->
  <Card class="flex-1 h-full flex flex-col shadow-2xl border border-border/50 rounded-xl overflow-hidden bg-card/80 backdrop-blur-xl">

    <!-- Header -->
    <header class="flex items-center justify-between p-4 border-b bg-card/50 shrink-0 gap-3">
      <div class="flex flex-col shrink-0">
        <h1 class="text-xl font-bold bg-linear-to-r from-primary to-blue-500 bg-clip-text text-transparent">
          AI Assistant
        </h1>
        <p class="text-xs text-muted-foreground">Powered by Ollama + pgvector</p>
      </div>

      <!-- Token Meter (shows when a chat is active & tokens available) -->
      {#if selectedChatId && totalUsedTokens > 0}
        <div class="flex-1 min-w-0 max-w-xs group/meter relative">
          <div class="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span class="font-medium">{totalUsedTokens.toLocaleString()} tokens used</span>
            <span class="{tokenPct > 80 ? 'text-red-500' : tokenPct > 50 ? 'text-yellow-500' : 'text-green-500'} font-semibold">{100 - tokenPct}% free</span>
          </div>
          <div class="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-700 {tokenPct > 80 ? 'bg-red-500' : tokenPct > 50 ? 'bg-yellow-500' : 'bg-primary'}"
              style="width: {tokenPct}%"
            ></div>
          </div>
          <!-- Tooltip -->
          <div class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover/meter:opacity-100 transition-opacity bg-popover text-popover-foreground text-[10px] px-3 py-2 rounded-lg shadow-lg border whitespace-nowrap pointer-events-none z-10 flex flex-col items-center gap-0.5">
            <span class="font-semibold text-xs">{tokenPct}% Context Used</span>
            <span class="opacity-70">Prompt: {lastPromptTokens.toLocaleString()} • Response: {lastEvalTokens.toLocaleString()}</span>
            <span class="opacity-70">Remaining: {(contextLength - totalUsedTokens).toLocaleString()} / {contextLength.toLocaleString()} total</span>
          </div>
        </div>
      {/if}

      <div class="flex items-center gap-2 shrink-0">
        {#if models.length > 0}
          <ModelSelector bind:models bind:selectedModel />
        {:else}
          <div class="text-sm text-muted-foreground animate-pulse">Loading models...</div>
        {/if}

        <!-- Per-chat config (only when a chat is active) -->
        {#if selectedChatId}
          <button
            class="p-2 rounded-lg border border-border/60 bg-muted/40 hover:bg-primary/10 hover:border-primary/40 hover:text-primary text-muted-foreground transition-colors {chatConfigOpen ? 'bg-primary/10 border-primary/40 text-primary' : ''}"
            title="Chat Config"
            onclick={() => chatConfigOpen = !chatConfigOpen}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
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
                promptEvalCount={msg.promptEvalCount}
                evalCount={msg.evalCount}
                modelContextLength={contextLength}
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

  <!-- Right Sidebar (Context & Summary) -->
  {#if rightSidebarOpen && selectedChatId}
    <Card class="w-80 hidden lg:flex flex-col shadow-2xl border border-border/50 rounded-xl overflow-hidden bg-card/80 backdrop-blur-xl shrink-0">
      <header class="flex items-center justify-between p-4 border-b bg-card/50">
        <h2 class="font-bold text-sm">Chat Context</h2>
        <button class="text-muted-foreground hover:text-foreground" onclick={() => rightSidebarOpen = false}>✕</button>
      </header>
      <ScrollArea class="flex-1 p-4">
        <div class="space-y-6">
          <div class="bg-muted/50 rounded-lg p-3 border border-border/40">
            <h3 class="text-xs font-semibold uppercase tracking-wider mb-3 text-muted-foreground">Memory Mode</h3>
            <label class="flex items-start gap-3 text-sm cursor-pointer group">
              <input type="checkbox" checked={currentChat?.use_summary} onchange={toggleSummaryMode} class="mt-1 w-4 h-4 rounded text-primary" />
              <div class="flex-1">
                <div class="font-medium group-hover:text-primary transition-colors">Use Summarized History</div>
                <p class="text-[10px] text-muted-foreground mt-1 leading-relaxed">If checked, the AI will only see the summary below instead of the full message history. This drastically reduces token usage and improves speed for long chats.</p>
              </div>
            </label>
          </div>

          <div>
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current Summary</h3>
              <button class="text-[10px] bg-primary text-primary-foreground font-semibold px-2 py-1 rounded shadow hover:bg-primary/90 transition-colors disabled:opacity-50" onclick={() => summarizeChat(selectedChatId!)} disabled={isSummarizing}>
                {isSummarizing ? 'Generating...' : 'Regenerate'}
              </button>
            </div>
            
            <div class="bg-card border rounded-lg p-3">
              {#if isSummarizing}
                <div class="text-sm text-muted-foreground animate-pulse flex items-center gap-2">
                  <div class="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  Analyzing conversation...
                </div>
              {:else if currentChat?.summary}
                <div class="text-sm prose prose-sm dark:prose-invert max-w-none text-foreground/90">
                  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                  {@html currentChat.summary}
                </div>
              {:else if summaryText}
                 <div class="text-sm prose prose-sm dark:prose-invert max-w-none text-foreground/90">
                  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                  {@html summaryText}
                </div>
              {:else}
                <p class="text-sm text-muted-foreground italic">No summary generated yet.</p>
              {/if}
            </div>
          </div>
        </div>
      </ScrollArea>
    </Card>
  {/if}
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

<!-- Chat Config Panel -->
{#if chatConfigOpen && currentChat}
  <ChatConfigPanel
    chat={currentChat}
    selectedModel={selectedModel}
    onClose={() => chatConfigOpen = false}
    onSave={() => loadChats()}
  />
{/if}
