<script lang="ts">
  import { onMount } from 'svelte';

  const API = 'http://localhost:3000/api';
  const TOOLS_API = 'http://localhost:3001/api';

  // ── State ────────────────────────────────────────────────────────────────────
  let activeTab: 'permissions' | 'whitelists' | 'embedding' | 'tools' = $state('permissions');
  let saving = $state(false);
  let saveMsg = $state('');

  // Settings from DB
  let defaultPolicy: string = $state('ask');
  let embeddingModel: string = $state('nomic-embed-text');
  let showToolReason: boolean = $state(true);

  // Ollama models
  let ollamaModels: any[] = $state([]);

  // Tool permissions from DB
  let toolPermissions: any[] = $state([]);
  let allTools: any[] = $state([]);

  // Whitelists (stored in tool_permissions per tool, but we keep a global whitelist in settings)
  let globalWhitelistDirs: string[] = $state([]);
  let globalWhitelistCommands: string[] = $state([]);
  let newDir = $state('');
  let newCmd = $state('');

  // Per-tool policy edits
  let editingPermissions: Record<string, { policy: string; dirs: string; commands: string }> = $state({});

  onMount(async () => {
    await Promise.all([loadSettings(), loadOllamaModels(), loadToolPermissions(), loadTools()]);
  });

  async function loadSettings() {
    try {
      const res = await fetch(`${API}/settings`);
      if (res.ok) {
        const data = await res.json();
        defaultPolicy = data.default_tool_policy ?? 'ask';
        embeddingModel = data.embedding_model ?? 'nomic-embed-text';
        showToolReason = data.show_tool_reason !== 'false';
        globalWhitelistDirs = JSON.parse(data.global_whitelist_dirs ?? '[]');
        globalWhitelistCommands = JSON.parse(data.global_whitelist_commands ?? '[]');
      }
    } catch {}
  }

  async function loadOllamaModels() {
    try {
      const res = await fetch(`${API}/models`);
      if (res.ok) ollamaModels = await res.json();
    } catch {}
  }

  async function loadToolPermissions() {
    try {
      const res = await fetch(`${API}/settings/tool-permissions`);
      if (res.ok) {
        toolPermissions = await res.json();
        for (const tp of toolPermissions) {
          editingPermissions[tp.tool_name] = {
            policy: tp.policy,
            dirs: (tp.whitelisted_dirs ?? []).join('\n'),
            commands: (tp.whitelisted_commands ?? []).join('\n'),
          };
        }
      }
    } catch {}
  }

  async function loadTools() {
    try {
      const res = await fetch(`${TOOLS_API}/tools`);
      if (res.ok) {
        const data = await res.json();
        allTools = data.tools ?? [];
        // Initialize editing state for tools not in DB yet
        for (const t of allTools) {
          const name = t.function.name;
          if (!editingPermissions[name]) {
            editingPermissions[name] = { policy: defaultPolicy, dirs: '', commands: '' };
          }
        }
      }
    } catch {}
  }

  async function saveGlobalSettings() {
    saving = true;
    saveMsg = '';
    try {
      await fetch(`${API}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_tool_policy: defaultPolicy,
          embedding_model: embeddingModel,
          show_tool_reason: showToolReason ? 'true' : 'false',
          global_whitelist_dirs: JSON.stringify(globalWhitelistDirs),
          global_whitelist_commands: JSON.stringify(globalWhitelistCommands),
        }),
      });
      saveMsg = '✓ Settings saved';
    } catch {
      saveMsg = '✗ Failed to save';
    } finally {
      saving = false;
      setTimeout(() => (saveMsg = ''), 3000);
    }
  }

  async function saveToolPermission(toolName: string) {
    const ep = editingPermissions[toolName];
    if (!ep) return;
    const dirs = ep.dirs
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const commands = ep.commands
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await fetch(`${API}/settings/tool-permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName,
          policy: ep.policy,
          whitelistedDirs: dirs,
          whitelistedCommands: commands,
        }),
      });
    } catch {}
  }

  async function saveAllToolPermissions() {
    saving = true;
    saveMsg = '';
    try {
      for (const name of Object.keys(editingPermissions)) {
        await saveToolPermission(name);
      }
      saveMsg = '✓ Tool permissions saved';
    } catch {
      saveMsg = '✗ Failed to save some permissions';
    } finally {
      saving = false;
      setTimeout(() => (saveMsg = ''), 3000);
    }
  }

  function addDir() {
    if (newDir.trim()) {
      globalWhitelistDirs = [...globalWhitelistDirs, newDir.trim()];
      newDir = '';
    }
  }

  function removeDir(i: number) {
    globalWhitelistDirs = globalWhitelistDirs.filter((_, idx) => idx !== i);
  }

  function addCmd() {
    if (newCmd.trim()) {
      globalWhitelistCommands = [...globalWhitelistCommands, newCmd.trim()];
      newCmd = '';
    }
  }

  function removeCmd(i: number) {
    globalWhitelistCommands = globalWhitelistCommands.filter((_, idx) => idx !== i);
  }

  const policyOptions = [
    { value: 'ask', label: 'Ask Permission', desc: 'Show a modal before each use', icon: '🔐' },
    { value: 'auto_approve', label: 'Auto Approve', desc: 'Always allow without asking', icon: '✅' },
    { value: 'deny', label: 'Deny', desc: 'Never allow this tool', icon: '🚫' },
  ];

  const tabs = [
    { id: 'permissions', label: 'Tool Policies', icon: '🔐' },
    { id: 'whitelists', label: 'Whitelists', icon: '📁' },
    { id: 'embedding', label: 'Embedding Model', icon: '🧠' },
    { id: 'tools', label: 'All Tools', icon: '🔧' },
  ] as const;
</script>

<svelte:head>
  <title>Settings — AI Assistant</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
  <!-- Top bar -->
  <header class="sticky top-0 z-10 border-b border-border/50 bg-card/80 backdrop-blur-xl px-6 py-4 flex items-center gap-4">
    <a href="/" class="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      Back to Chat
    </a>
    <div class="h-5 w-px bg-border"></div>
    <h1 class="text-lg font-bold">Settings</h1>
    <div class="ml-auto flex items-center gap-3">
      {#if saveMsg}
        <span class="text-sm {saveMsg.startsWith('✓') ? 'text-green-500' : 'text-red-500'} animate-in fade-in">{saveMsg}</span>
      {/if}
    </div>
  </header>

  <div class="max-w-5xl mx-auto p-6 flex gap-6">
    <!-- Sidebar nav -->
    <nav class="w-52 shrink-0 space-y-1">
      {#each tabs as tab}
        <button
          onclick={() => (activeTab = tab.id)}
          class={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-left transition-all ${
            activeTab === tab.id
              ? 'bg-primary/15 text-primary font-semibold'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          }`}
        >
          <span>{tab.icon}</span>
          {tab.label}
        </button>
      {/each}
    </nav>

    <!-- Content -->
    <div class="flex-1 min-w-0">

      <!-- ── Tab: Tool Policies ─────────────────────────────────────────────── -->
      {#if activeTab === 'permissions'}
        <div class="space-y-6">
          <div>
            <h2 class="text-xl font-bold">Tool Permission Policies</h2>
            <p class="text-sm text-muted-foreground mt-1">Control how the AI is allowed to use each tool.</p>
          </div>

          <!-- Global default -->
          <div class="rounded-xl border border-border/50 bg-card/60 p-5 space-y-4">
            <h3 class="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Global Default Policy</h3>
            <div class="grid grid-cols-3 gap-3">
              {#each policyOptions as opt}
                <button
                  onclick={() => (defaultPolicy = opt.value)}
                  class={`flex flex-col items-center rounded-xl border p-4 text-center transition-all ${
                    defaultPolicy === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border/50 bg-muted/20 text-muted-foreground hover:border-border hover:bg-muted/40'
                  }`}
                >
                  <span class="text-2xl mb-2">{opt.icon}</span>
                  <span class="font-semibold text-sm">{opt.label}</span>
                  <span class="text-xs opacity-70 mt-1">{opt.desc}</span>
                </button>
              {/each}
            </div>

            <label class="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                bind:checked={showToolReason}
                class="w-4 h-4 rounded"
              />
              <span class="text-sm">Show AI's reason when asking permission</span>
            </label>
          </div>

          <!-- Per-tool overrides -->
          <div class="rounded-xl border border-border/50 bg-card/60 p-5 space-y-4">
            <h3 class="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Per-Tool Overrides</h3>
            <div class="space-y-3">
              {#each allTools as tool}
                {@const name = tool.function.name}
                {@const ep = editingPermissions[name] ?? { policy: defaultPolicy, dirs: '', commands: '' }}
                <div class="rounded-lg border border-border/40 bg-muted/20 p-3">
                  <div class="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <code class="text-sm font-mono text-primary">{name}</code>
                      <p class="text-xs text-muted-foreground mt-0.5">{tool.function.description}</p>
                    </div>
                    <select
                      value={ep.policy}
                      onchange={(e) => {
                        editingPermissions[name] = { ...ep, policy: (e.target as HTMLSelectElement).value };
                      }}
                      class="rounded-lg border border-border/60 bg-card text-sm px-2 py-1.5"
                    >
                      {#each policyOptions as opt}
                        <option value={opt.value}>{opt.icon} {opt.label}</option>
                      {/each}
                    </select>
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <button
            onclick={async () => { await saveGlobalSettings(); await saveAllToolPermissions(); }}
            disabled={saving}
            class="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-2.5 text-sm transition-all disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Policies'}
          </button>
        </div>

      <!-- ── Tab: Whitelists ────────────────────────────────────────────────── -->
      {:else if activeTab === 'whitelists'}
        <div class="space-y-6">
          <div>
            <h2 class="text-xl font-bold">Whitelists</h2>
            <p class="text-sm text-muted-foreground mt-1">Restrict which directories and commands the AI can access.</p>
          </div>

          <!-- Directory whitelist -->
          <div class="rounded-xl border border-border/50 bg-card/60 p-5 space-y-4">
            <h3 class="font-semibold text-sm uppercase tracking-wider text-muted-foreground">📁 Allowed Directories</h3>
            <p class="text-xs text-muted-foreground">Filesystem tools (read_file, write_file, list_dir, etc.) will only be allowed to access paths inside these directories. Leave empty to allow all paths.</p>
            <div class="space-y-2">
              {#each globalWhitelistDirs as dir, i}
                <div class="flex items-center gap-2">
                  <code class="flex-1 rounded-lg bg-muted/40 border border-border/40 px-3 py-1.5 text-sm font-mono text-foreground/80">{dir}</code>
                  <button onclick={() => removeDir(i)} aria-label="Remove directory" class="text-muted-foreground hover:text-red-400 transition-colors p-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>
              {/each}
              <div class="flex gap-2">
                <input
                  type="text"
                  bind:value={newDir}
                  placeholder="/home/user/projects"
                  onkeydown={(e) => e.key === 'Enter' && addDir()}
                  class="flex-1 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button onclick={addDir} class="rounded-lg bg-muted/60 hover:bg-muted border border-border/60 px-3 py-1.5 text-sm transition-colors">Add</button>
              </div>
            </div>
          </div>

          <!-- Command whitelist -->
          <div class="rounded-xl border border-border/50 bg-card/60 p-5 space-y-4">
            <h3 class="font-semibold text-sm uppercase tracking-wider text-muted-foreground">⌨️ Allowed Command Prefixes</h3>
            <p class="text-xs text-muted-foreground">The <code class="bg-muted px-1 rounded">run_command</code> tool will only allow commands matching these prefixes. Use <code class="bg-muted px-1 rounded">pnpm *</code> to allow all pnpm commands. Leave empty to allow all commands (dangerous).</p>
            <div class="space-y-2">
              {#each globalWhitelistCommands as cmd, i}
                <div class="flex items-center gap-2">
                  <code class="flex-1 rounded-lg bg-muted/40 border border-border/40 px-3 py-1.5 text-sm font-mono text-foreground/80">{cmd}</code>
                  <button onclick={() => removeCmd(i)} aria-label="Remove command" class="text-muted-foreground hover:text-red-400 transition-colors p-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>
              {/each}
              <div class="flex gap-2">
                <input
                  type="text"
                  bind:value={newCmd}
                  placeholder="pnpm * or git status"
                  onkeydown={(e) => e.key === 'Enter' && addCmd()}
                  class="flex-1 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button onclick={addCmd} class="rounded-lg bg-muted/60 hover:bg-muted border border-border/60 px-3 py-1.5 text-sm transition-colors">Add</button>
              </div>
            </div>
          </div>

          <button
            onclick={saveGlobalSettings}
            disabled={saving}
            class="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-2.5 text-sm transition-all disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Whitelists'}
          </button>
        </div>

      <!-- ── Tab: Embedding Model ────────────────────────────────────────────── -->
      {:else if activeTab === 'embedding'}
        <div class="space-y-6">
          <div>
            <h2 class="text-xl font-bold">Embedding Model</h2>
            <p class="text-sm text-muted-foreground mt-1">Choose which Ollama model to use for embedding tool descriptions and user prompts into pgvector.</p>
          </div>

          <div class="rounded-xl border border-border/50 bg-card/60 p-5 space-y-4">
            <h3 class="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Select Model</h3>
            <div class="space-y-2">
              {#if ollamaModels.length === 0}
                <p class="text-sm text-muted-foreground">Loading Ollama models...</p>
              {:else}
                {#each ollamaModels as model}
                  <label class={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all ${
                    embeddingModel === model.name
                      ? 'border-primary bg-primary/10'
                      : 'border-border/40 bg-muted/20 hover:border-border/80'
                  }`}>
                    <input
                      type="radio"
                      name="embedding_model"
                      value={model.name}
                      bind:group={embeddingModel}
                      class="w-4 h-4 text-primary"
                    />
                    <div class="flex-1 min-w-0">
                      <div class="font-mono text-sm font-semibold truncate">{model.name}</div>
                      {#if model.details?.parameter_size}
                        <div class="text-xs text-muted-foreground mt-0.5">{model.details.parameter_size}</div>
                      {/if}
                    </div>
                    {#if embeddingModel === model.name}
                      <span class="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium shrink-0">Active</span>
                    {/if}
                  </label>
                {/each}
              {/if}
            </div>

            <div class="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-400">
              <strong>Tip:</strong> For best results use a dedicated embedding model like <code class="bg-blue-500/10 px-1 rounded">nomic-embed-text</code> or <code class="bg-blue-500/10 px-1 rounded">mxbai-embed-large</code>.
              Run <code class="bg-blue-500/10 px-1 rounded">ollama pull nomic-embed-text</code> to download.
            </div>
          </div>

          <button
            onclick={saveGlobalSettings}
            disabled={saving}
            class="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-2.5 text-sm transition-all disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Embedding Model'}
          </button>
        </div>

      <!-- ── Tab: All Tools ─────────────────────────────────────────────────── -->
      {:else if activeTab === 'tools'}
        <div class="space-y-6">
          <div>
            <h2 class="text-xl font-bold">All Tools</h2>
            <p class="text-sm text-muted-foreground mt-1">
              {allTools.length} tools registered.
              The AI can also create new tools at runtime using the <code class="bg-muted px-1 rounded text-primary">create_tool</code> tool.
            </p>
          </div>

          <!-- Group by category -->
          {#each ['filesystem', 'shell', 'web', 'utility', 'meta', 'custom', 'general'] as cat}
            {@const catTools = allTools.filter((t) => {
              const name = t.function.name;
              if (cat === 'filesystem') return ['list_dir','read_file','write_file','create_dir','delete_path','move_path','stat_path'].includes(name);
              if (cat === 'shell') return ['run_command'].includes(name);
              if (cat === 'web') return ['scrape_url','http_get','http_post'].includes(name);
              if (cat === 'utility') return ['get_current_time'].includes(name);
              if (cat === 'meta') return ['search_tools','list_all_tools','create_tool','update_tool','delete_tool'].includes(name);
              return true;
            })}
            {#if catTools.length > 0}
              <div class="rounded-xl border border-border/50 bg-card/60 overflow-hidden">
                <div class="px-4 py-2.5 border-b border-border/40 bg-muted/30">
                  <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground capitalize">{cat}</h3>
                </div>
                <div class="divide-y divide-border/30">
                  {#each catTools as tool}
                    <div class="px-4 py-3 flex items-start gap-3">
                      <code class="text-sm font-mono text-primary shrink-0 mt-0.5">{tool.function.name}</code>
                      <p class="text-sm text-muted-foreground">{tool.function.description}</p>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      {/if}

    </div>
  </div>
</div>
