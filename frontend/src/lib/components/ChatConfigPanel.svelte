<script lang="ts">
  import { addToast } from '$lib/stores/toast';

  const API = 'http://localhost:3000/api';

  let {
    chat,
    selectedModel = '',
    onClose,
    onSave,
  }: {
    chat: any;
    selectedModel?: string;
    onClose: () => void;
    onSave: () => void;
  } = $props();

  let systemPrompt = $state(chat?.system_prompt ?? '');
  let toolsEnabled = $state(chat?.tools_enabled !== false);
  let isSaving = $state(false);
  let isSuggestLoading = $state(false);
  let suggestion = $state<{ improved: string; changes: string } | null>(null);

  async function save() {
    isSaving = true;
    try {
      const res = await fetch(`${API}/chats/${chat.id}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_prompt: systemPrompt.trim() || null,
          tools_enabled: toolsEnabled,
        }),
      });
      if (res.ok) {
        addToast('Chat config saved!', 'success');
        onSave();
        onClose();
      } else {
        addToast('Failed to save config', 'error');
      }
    } finally {
      isSaving = false;
    }
  }

  async function getSuggestion() {
    isSuggestLoading = true;
    suggestion = null;
    try {
      const res = await fetch(`${API}/system-prompt/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_prompt: systemPrompt, model: selectedModel }),
      });
      if (res.ok) {
        const data = await res.json();
        suggestion = data;
      } else {
        addToast('AI suggestion failed', 'error');
      }
    } catch {
      addToast('Could not connect to AI for suggestions', 'error');
    } finally {
      isSuggestLoading = false;
    }
  }

  function applySuggestion() {
    if (suggestion) {
      systemPrompt = suggestion.improved;
      suggestion = null;
      addToast('Suggestion applied!', 'success');
    }
  }
</script>

<!-- Backdrop -->
<div
  class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
  onclick={onClose}
  role="none"
></div>

<!-- Panel -->
<div class="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-card border-l border-border/50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
  <!-- Header -->
  <header class="flex items-center justify-between p-5 border-b border-border/50 bg-card/80 backdrop-blur-xl shrink-0">
    <div>
      <h2 class="font-bold text-base">Chat Config</h2>
      <p class="text-xs text-muted-foreground mt-0.5 truncate max-w-[220px]">{chat?.title ?? 'This Chat'}</p>
    </div>
    <button class="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" onclick={onClose}>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
    </button>
  </header>

  <div class="flex-1 overflow-y-auto p-5 space-y-6">
    <!-- Tools Toggle -->
    <div class="bg-muted/40 rounded-xl p-4 border border-border/40">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Tool Access</h3>
      <label class="flex items-center justify-between cursor-pointer group">
        <div>
          <div class="text-sm font-medium group-hover:text-primary transition-colors">Enable Tools</div>
          <p class="text-[11px] text-muted-foreground mt-0.5">Allow the AI to use filesystem, shell, web, and memory tools in this chat.</p>
        </div>
        <button
          role="switch"
          aria-checked={toolsEnabled}
          class="relative w-11 h-6 rounded-full transition-colors shrink-0 ml-4 {toolsEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}"
          onclick={() => toolsEnabled = !toolsEnabled}
        >
          <span class="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform {toolsEnabled ? 'translate-x-5' : 'translate-x-0'}"></span>
        </button>
      </label>
    </div>

    <!-- System Prompt Override -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">System Prompt Override</h3>
          <p class="text-[11px] text-muted-foreground mt-0.5">Overrides the global prompt for this chat only.</p>
        </div>
        <button
          class="flex items-center gap-1.5 text-[11px] font-semibold bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          onclick={getSuggestion}
          disabled={isSuggestLoading}
        >
          {#if isSuggestLoading}
            <div class="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            Thinking...
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287Z"/></svg>
            AI Suggest
          {/if}
        </button>
      </div>

      <textarea
        bind:value={systemPrompt}
        rows="8"
        placeholder="Leave empty to use the global system prompt from Settings..."
        class="w-full rounded-lg border border-border/50 bg-background/60 px-3 py-2.5 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50 transition-shadow"
      ></textarea>

      {#if suggestion}
        <div class="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-xs font-semibold text-primary">AI Suggestion</p>
            <button class="text-[10px] text-muted-foreground hover:text-foreground" onclick={() => suggestion = null}>Dismiss</button>
          </div>
          {#if suggestion.changes}
            <div class="text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-2.5 whitespace-pre-line">{suggestion.changes}</div>
          {/if}
          <div class="text-xs font-mono text-foreground/80 bg-background rounded-lg p-2.5 max-h-40 overflow-y-auto border border-border/40 whitespace-pre-wrap">{suggestion.improved}</div>
          <button
            class="w-full text-sm font-semibold bg-primary text-primary-foreground py-2 rounded-lg hover:bg-primary/90 transition-colors"
            onclick={applySuggestion}
          >
            Apply Suggestion
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Footer -->
  <div class="p-5 border-t border-border/50 bg-card/80 backdrop-blur-xl shrink-0 flex gap-3">
    <button
      class="flex-1 py-2 text-sm font-medium rounded-lg border border-border/60 hover:bg-muted transition-colors"
      onclick={onClose}
    >
      Cancel
    </button>
    <button
      class="flex-1 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
      onclick={save}
      disabled={isSaving}
    >
      {isSaving ? 'Saving...' : 'Save Config'}
    </button>
  </div>
</div>
