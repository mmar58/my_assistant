<script lang="ts">
  let {
    requestId,
    toolName,
    reason,
    args,
    onRespond,
  }: {
    requestId: string;
    toolName: string;
    reason: string;
    args: Record<string, any>;
    onRespond: (result: 'approve_once' | 'approve_always' | 'deny') => void;
  } = $props();

  let responding = $state(false);

  async function respond(result: 'approve_once' | 'approve_always' | 'deny') {
    responding = true;
    try {
      await fetch('http://localhost:3000/api/permissions/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, result }),
      });
      onRespond(result);
    } catch (e) {
      console.error('Failed to respond to permission request', e);
      responding = false;
    }
  }
</script>

<!-- Backdrop -->
<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
  <div class="w-full max-w-md bg-card border border-border/60 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
    <!-- Header -->
    <div class="px-6 pt-6 pb-4 border-b border-border/40 bg-gradient-to-b from-orange-500/10 to-transparent">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/20 border border-orange-500/40 shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-orange-400">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <div>
          <h2 class="text-base font-bold text-foreground">Permission Required</h2>
          <p class="text-xs text-muted-foreground mt-0.5">AI wants to use a tool</p>
        </div>
      </div>
    </div>

    <!-- Body -->
    <div class="px-6 py-5 space-y-4">
      <!-- Tool name -->
      <div>
        <p class="text-xs text-muted-foreground uppercase tracking-wider mb-1 font-medium">Tool</p>
        <code class="inline-flex items-center gap-1.5 rounded-lg bg-muted/60 border border-border/40 px-3 py-1.5 text-sm font-mono text-primary">
          🔧 {toolName}
        </code>
      </div>

      <!-- Reason -->
      <div>
        <p class="text-xs text-muted-foreground uppercase tracking-wider mb-1 font-medium">Reason</p>
        <p class="text-sm text-foreground/90 rounded-lg bg-muted/30 border border-border/30 px-3 py-2">{reason}</p>
      </div>

      <!-- Arguments -->
      {#if Object.keys(args).length > 0}
        <div>
          <p class="text-xs text-muted-foreground uppercase tracking-wider mb-1 font-medium">Arguments</p>
          <pre class="rounded-lg bg-muted/40 border border-border/30 px-3 py-2 text-xs font-mono overflow-auto max-h-32 text-foreground/80 whitespace-pre-wrap">{JSON.stringify(args, null, 2)}</pre>
        </div>
      {/if}
    </div>

    <!-- Actions -->
    <div class="px-6 pb-6 flex flex-col gap-2">
      <div class="grid grid-cols-2 gap-2">
        <button
          onclick={() => respond('approve_once')}
          disabled={responding}
          class="flex items-center justify-center gap-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold px-4 py-2.5 transition-all duration-150 disabled:opacity-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          Allow Once
        </button>
        <button
          onclick={() => respond('deny')}
          disabled={responding}
          class="flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold px-4 py-2.5 transition-all duration-150 disabled:opacity-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          Deny
        </button>
      </div>
      <button
        onclick={() => respond('approve_always')}
        disabled={responding}
        class="w-full flex items-center justify-center gap-2 rounded-xl border border-border/60 hover:bg-muted/60 text-sm text-muted-foreground hover:text-foreground font-medium px-4 py-2 transition-all duration-150 disabled:opacity-50"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>
        Always Allow "{toolName}"
      </button>
    </div>
  </div>
</div>
