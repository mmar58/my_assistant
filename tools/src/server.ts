import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';

import {
  registerBuiltinTools,
  loadCustomTools,
  getAllDefinitions,
  registerCustomTool,
} from './registry.js';
import { executeTool } from './executor.js';
import { getToolPermission, getDefaultPolicy } from './permissions.js';

// ── Import all built-in tool modules ──────────────────────────────────────────
import { filesystemTools } from './tool-modules/filesystem.js';
import { shellTools } from './tool-modules/shell.js';
import { webTools } from './tool-modules/web.js';
import { timeTools } from './tool-modules/time.js';
import { searchTools } from './tool-modules/search.js';
import { toolBuilderTools } from './tool-modules/tool_builder.js';
import { memoryTools } from './tool-modules/memory.js';

const fastify = Fastify({ logger: true });

fastify.register(cors, { origin: true });

// ── GET /api/tools — Return all registered tool definitions ──────────────────
fastify.get('/api/tools', async () => {
  return { tools: getAllDefinitions() };
});

// ── GET /api/tools/categories — List tools grouped by category ───────────────
fastify.get('/api/tools/categories', async () => {
  const defs = getAllDefinitions();
  const grouped: Record<string, any[]> = {};
  // We store category in DB; for now group by tool name prefix
  for (const def of defs) {
    const cat = (def as any).category ?? 'general';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ name: def.function.name, description: def.function.description });
  }
  return grouped;
});

// ── POST /api/tools/execute — Execute a tool by name ─────────────────────────
fastify.post('/api/tools/execute', async (request, reply) => {
  const { name, arguments: args } = request.body as {
    name: string;
    arguments: Record<string, any>;
  };

  if (!name) {
    return reply.status(400).send({ error: 'Tool name is required' });
  }

  fastify.log.info({ name, args }, 'Executing tool');

  // ── Permission check ────────────────────────────────────────────────────────
  const permission = await getToolPermission(name);
  const defaultPolicy = await getDefaultPolicy();
  const policy = permission?.policy ?? defaultPolicy;

  // Shell command whitelist enforcement
  if (name === 'run_command' && args.command) {
    const whitelist = permission?.whitelisted_commands ?? [];
    if (whitelist.length > 0) {
      const isAllowed = whitelist.some((prefix: string) => {
        if (prefix.endsWith(' *')) return args.command.startsWith(prefix.slice(0, -2).trim());
        return args.command.startsWith(prefix);
      });
      if (!isAllowed) {
        return reply.status(403).send({
          error: `Command "${args.command}" is not in the allowed command whitelist.`,
          whitelisted_commands: whitelist,
        });
      }
    }
  }

  // Filesystem path whitelist enforcement
  const fsTools = ['read_file', 'write_file', 'list_dir', 'delete_path', 'move_path', 'stat_path', 'create_dir'];
  if (fsTools.includes(name)) {
    const whitelist = permission?.whitelisted_dirs ?? [];
    const targetPath = args.path ?? args.source ?? '';
    if (whitelist.length > 0 && targetPath) {
      const { resolve } = await import('path');
      const resolved = resolve(targetPath);
      const isAllowed = whitelist.some((dir: string) => resolved.startsWith(resolve(dir)));
      if (!isAllowed) {
        return reply.status(403).send({
          error: `Path "${targetPath}" is not in the allowed directory whitelist.`,
          whitelisted_dirs: whitelist,
        });
      }
    }
  }

  // ── Execute ─────────────────────────────────────────────────────────────────
  const execResult = await executeTool(name, args ?? {});

  if (!execResult.success) {
    return reply.status(500).send({
      error: execResult.error,
      statusEvents: execResult.statusEvents,
    });
  }

  // If this was create_tool, hot-register it so it's available immediately
  if (name === 'create_tool' && execResult.result?.created) {
    try {
      const toolArgs = args as any;
      registerCustomTool(
        toolArgs.name,
        toolArgs.description,
        toolArgs.parameters_schema,
        toolArgs.code
      );
      fastify.log.info(`Hot-registered new custom tool: ${toolArgs.name}`);
    } catch (e) {
      fastify.log.warn(`Failed to hot-register custom tool: ${String(e)}`);

    }
  }

  return {
    result: execResult.result,
    statusEvents: execResult.statusEvents,
  };
});

// ── GET /api/tools/:name — Get info about a specific tool ────────────────────
fastify.get('/api/tools/:name', async (request, reply) => {
  const { name } = request.params as { name: string };
  const def = getAllDefinitions().find((d) => d.function.name === name);
  if (!def) return reply.status(404).send({ error: `Tool "${name}" not found` });
  const permission = await getToolPermission(name);
  return { definition: def, permission };
});

// ── Startup ──────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    // Register all built-in tools
    await registerBuiltinTools([
      ...filesystemTools,
      ...shellTools,
      ...webTools,
      ...timeTools,
      ...searchTools,
      ...toolBuilderTools,
      ...memoryTools,
    ]);

    // Load custom AI-created tools from DB
    await loadCustomTools();

    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    console.log('Tools service listening on port 3001');
    console.log(`Registered ${getAllDefinitions().length} tools total`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
