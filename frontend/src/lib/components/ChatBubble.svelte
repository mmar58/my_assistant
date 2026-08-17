<script lang="ts">
  import { marked } from 'marked';

  let {
    role,
    content,
    status,
    toolEvents = [],
  }: {
    role: 'user' | 'assistant' | 'tool';
    content: string;
    status?: string;
    toolEvents?: any[];
  } = $props();

  function renderMarkdown(text: string): string {
    if (!text) return '';
    try {
      return marked.parse(text) as string;
    } catch {
      return text;
    }
  }

  function toolEventIcon(event: string): string {
    const icons: Record<string, string> = {
      tool_call_start: '🔧',
      tool_executing: '⚙️',
      tool_result: '✅',
      tool_error: '❌',
      tool_denied: '🚫',
      tools_loaded: '📦',
      permission_request: '🔐',
      tool_policy_updated: '📝',
    };
    return icons[event] ?? '•';
  }

  function toolEventColor(event: string): string {
    const colors: Record<string, string> = {
      tool_call_start: 'border-blue-500/40 bg-blue-500/5',
      tool_executing: 'border-yellow-500/40 bg-yellow-500/5',
      tool_result: 'border-green-500/40 bg-green-500/5',
      tool_error: 'border-red-500/40 bg-red-500/5',
      tool_denied: 'border-red-400/40 bg-red-400/5',
      tools_loaded: 'border-purple-500/40 bg-purple-500/5',
      permission_request: 'border-orange-500/40 bg-orange-500/5',
      tool_policy_updated: 'border-teal-500/40 bg-teal-500/5',
    };
    return colors[event] ?? 'border-border/40 bg-muted/20';
  }
</script>

<div class={`flex w-full ${role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
  <div
    class={`max-w-[85%] px-4 py-3 rounded-2xl ${
      role === 'user'
        ? 'bg-primary text-primary-foreground rounded-br-sm'
        : 'bg-muted/60 text-foreground rounded-bl-sm border border-border/50 shadow-sm'
    }`}
  >
    <div class="text-xs font-semibold mb-2 opacity-60 uppercase tracking-wider">
      {role === 'user' ? 'You' : 'Assistant'}
    </div>

    <!-- Tool events (inline in assistant bubble) -->
    {#if toolEvents.length > 0}
      <div class="mb-3 space-y-1.5">
        {#each toolEvents as ev}
          <div
            class={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-mono ${toolEventColor(ev.event)}`}
          >
            <span class="shrink-0 text-sm leading-tight">{toolEventIcon(ev.event)}</span>
            <div class="min-w-0 flex-1">
              <div class="font-semibold text-foreground/80">{ev.message}</div>
              {#if ev.toolName && ev.event !== 'tools_loaded'}
                <div class="opacity-50 mt-0.5">
                  Tool: <span class="text-primary/80">{ev.toolName}</span>
                </div>
              {/if}
              {#if ev.event === 'tools_loaded' && ev.tools}
                <div class="mt-1 opacity-60 flex flex-wrap gap-1">
                  {#each ev.tools as t}
                    <span class="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px]">{t.name}</span>
                  {/each}
                </div>
              {/if}
              {#if ev.result && ev.event === 'tool_result'}
                <details class="mt-1">
                  <summary class="cursor-pointer opacity-50 hover:opacity-80">View result</summary>
                  <pre class="mt-1 text-[10px] opacity-70 overflow-auto max-h-32 whitespace-pre-wrap">{JSON.stringify(ev.result, null, 2)}</pre>
                </details>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Message content with markdown rendering -->
    {#if content}
      <div class="prose prose-sm dark:prose-invert max-w-none leading-relaxed text-[15px] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html renderMarkdown(content)}
      </div>
    {/if}

    <!-- Status indicator -->
    {#if status}
      <div class="mt-2 text-xs italic opacity-60 flex items-center gap-2">
        <svg class="animate-spin h-3 w-3 text-primary shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span class="animate-pulse">{status}</span>
      </div>
    {/if}
  </div>
</div>
