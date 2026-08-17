import { FastifyInstance } from 'fastify';
import ollama from 'ollama';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import {
  getEmbedding,
  getSetting,
  searchTools,
  getAllToolSchemas,
  getToolPermission,
  upsertToolPermission,
} from '../db.js';
import { createPermissionRequest } from '../permission-store.js';

const TOOLS_SERVICE_URL = process.env.TOOLS_SERVICE_URL ?? 'http://127.0.0.1:3001';

/** Fetch tool schemas from the tools microservice (which loads from DB) */
async function fetchAllTools(): Promise<any[]> {
  try {
    const res = await fetch(`${TOOLS_SERVICE_URL}/api/tools`);
    if (res.ok) {
      const data = (await res.json()) as { tools: any[] };
      return data.tools ?? [];
    }
  } catch {
    // fallback: load directly from DB
    const rows = await getAllToolSchemas();
    return rows.map((r) => ({ type: 'function', function: { name: r.name, description: r.description, parameters: r.schema } }));
  }
  return [];
}

/** Convert a tool row to Ollama function schema format */
function rowToOllamaTool(row: any) {
  return {
    type: 'function',
    function: {
      name: row.name,
      description: row.description,
      parameters: row.schema,
    },
  };
}

export async function chatRoutes(fastify: FastifyInstance) {
  // ─── Models ─────────────────────────────────────────────────────────────────
  fastify.get('/models', async (request, reply) => {
    try {
      const response = await ollama.list();
      return response.models;
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch models' });
    }
  });

  // ─── Chat ───────────────────────────────────────────────────────────────────
  fastify.post('/chat', async (request, reply) => {
    const { model, message } = request.body as { model: string; message: string };

    if (!model || !message) {
      return reply.status(400).send({ error: 'Model and message are required' });
    }

    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');

    async function* generate() {
      // ── Helper: emit status messages ──────────────────────────────────────
      const status = (msg: string) =>
        `data: ${JSON.stringify({ type: 'status', message: msg })}\n\n`;
      const content = (text: string) =>
        `data: ${JSON.stringify({ type: 'content', content: text })}\n\n`;
      const toolEvent = (payload: object) =>
        `data: ${JSON.stringify({ type: 'tool_event', ...payload })}\n\n`;

      // ── 1. Check model capabilities ───────────────────────────────────────
      yield status('Checking model capabilities...');
      let modelSupportTools = false;
      try {
        const modelInfo = await ollama.show({ model });
        modelSupportTools = (modelInfo as any).capabilities?.includes('tools') ?? false;
      } catch {
        yield status('Could not determine model capabilities, proceeding without tools.');
      }

      // ── 2. Get embedding model from settings ──────────────────────────────
      const embeddingModel = (await getSetting('embedding_model')) ?? process.env.EMBEDDING_MODEL ?? 'nomic-embed-text';

      // ── 3. Semantic search for relevant tools ─────────────────────────────
      let tools: any[] = [];
      if (modelSupportTools) {
        yield status('Searching for relevant tools...');
        try {
          const embedding = await getEmbedding(message, embeddingModel);
          if (embedding) {
            const rows = await searchTools(embedding, 12);
            tools = rows.map(rowToOllamaTool);
            if (tools.length > 0) {
              yield toolEvent({
                event: 'tools_loaded',
                tools: rows.map((r) => ({ name: r.name, description: r.description, category: r.category })),
                message: `Found ${tools.length} relevant tools for this request`,
              });
            } else {
              // Fallback: load all tools (might be first run, no embeddings yet)
              tools = await fetchAllTools();
            }
          } else {
            tools = await fetchAllTools();
          }
        } catch (e) {
          fastify.log.warn(`Tool search failed, loading all tools: ${String(e)}`);

          tools = await fetchAllTools();
        }
      }

      // ── 4. Main LLM loop ──────────────────────────────────────────────────
      const messages: any[] = [{ role: 'user', content: message }];
      let isDone = false;
      let iterationCount = 0;
      const MAX_ITERATIONS = 20;

      yield status('Thinking...');

      while (!isDone && iterationCount < MAX_ITERATIONS) {
        iterationCount++;

        const stream = await ollama.chat({
          model,
          messages,
          tools: modelSupportTools && tools.length > 0 ? tools : undefined,
          stream: true,
        });

        let fullResponse = '';
        let toolCalls: any[] = [];

        for await (const chunk of stream) {
          if (chunk.message.tool_calls && chunk.message.tool_calls.length > 0) {
            toolCalls = chunk.message.tool_calls;
          } else if (chunk.message.content) {
            fullResponse += chunk.message.content;
            yield content(chunk.message.content);
          }
        }

        // ── Tool calls ──────────────────────────────────────────────────────
        if (toolCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: fullResponse,
            tool_calls: toolCalls,
          });

          for (const tc of toolCalls) {
            const toolName = tc.function.name;
            const toolArgs = tc.function.arguments ?? {};

            yield toolEvent({
              event: 'tool_call_start',
              toolName,
              args: toolArgs,
              message: `Calling tool: ${toolName}`,
            });

            // ── Permission check ──────────────────────────────────────────
            const permission = await getToolPermission(toolName);
            const defaultPolicy = (await getSetting('default_tool_policy')) ?? 'ask';
            const effectivePolicy = permission?.policy ?? defaultPolicy;

            if (effectivePolicy === 'deny') {
              yield toolEvent({
                event: 'tool_denied',
                toolName,
                message: `Tool "${toolName}" is denied by policy.`,
              });
              messages.push({ role: 'tool', content: JSON.stringify({ error: `Tool "${toolName}" was denied by user policy.` }) });
              continue;
            }

            if (effectivePolicy === 'ask') {
              const requestId = randomUUID();
              yield toolEvent({
                event: 'permission_request',
                requestId,
                toolName,
                args: toolArgs,
                reason: `AI wants to use "${toolName}" to fulfill your request.`,
                message: `Waiting for your approval to use "${toolName}"...`,
              });

              // Block here until user responds (long-poll)
              const userDecision = await createPermissionRequest(
                requestId,
                toolName,
                `AI wants to use "${toolName}" to fulfill your request.`,
                toolArgs
              );

              if (userDecision === 'deny') {
                yield toolEvent({
                  event: 'tool_denied',
                  toolName,
                  message: `You denied the use of "${toolName}".`,
                });
                messages.push({ role: 'tool', content: JSON.stringify({ error: `Tool "${toolName}" was denied by the user.` }) });
                continue;
              }

              if (userDecision === 'approve_always') {
                await upsertToolPermission(
                  toolName,
                  'auto_approve',
                  permission?.whitelisted_dirs ?? [],
                  permission?.whitelisted_commands ?? []
                );
                yield toolEvent({
                  event: 'tool_policy_updated',
                  toolName,
                  policy: 'auto_approve',
                  message: `"${toolName}" is now set to auto-approve.`,
                });
              }
            }

            // ── Execute tool ──────────────────────────────────────────────
            try {
              yield toolEvent({
                event: 'tool_executing',
                toolName,
                message: `Executing ${toolName}...`,
              });

              const execRes = await fetch(`${TOOLS_SERVICE_URL}/api/tools/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: toolName, arguments: toolArgs }),
              });

              const execData = await execRes.json();

              yield toolEvent({
                event: 'tool_result',
                toolName,
                result: execData,
                message: `Tool "${toolName}" completed`,
              });

              messages.push({ role: 'tool', content: JSON.stringify(execData) });
            } catch (e) {
              yield toolEvent({
                event: 'tool_error',
                toolName,
                message: `Tool "${toolName}" failed to execute.`,
              });
              messages.push({ role: 'tool', content: JSON.stringify({ error: 'Tool execution failed' }) });
            }
          }
          // Loop back to let model process tool results
        } else {
          // No tool calls — we're done
          yield 'data: [DONE]\n\n';
          isDone = true;
        }
      }

      if (!isDone) {
        yield content('\n\n⚠️ Maximum iteration limit reached.');
        yield 'data: [DONE]\n\n';
      }
    }

    return reply.send(Readable.from(generate()));
  });
}
