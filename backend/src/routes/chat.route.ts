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
  createChat,
  getChats,
  getChat,
  updateChat,
  deleteChat,
  addMessage,
  getChatMessages,
  updateChatSummary,
  toggleChatSummaryMode,
  updateChatConfig,
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

  // ─── Chat Management ────────────────────────────────────────────────────────
  fastify.get('/chats', async (request, reply) => {
    try {
      const chats = await getChats();
      return chats;
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch chats' });
    }
  });

  fastify.post('/chats', async (request, reply) => {
    const { title, model } = request.body as { title: string; model: string };
    try {
      const id = await createChat(title || 'New Chat', model || 'llama3');
      return { id };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to create chat' });
    }
  });

  fastify.get('/chats/:id/messages', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const messages = await getChatMessages(id);
      return messages;
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch messages' });
    }
  });

  fastify.delete('/chats/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteChat(id);
      return { success: true };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to delete chat' });
    }
  });

  fastify.put('/chats/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { title } = request.body as { title: string };
    try {
      await updateChat(id, title);
      return { success: true };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to update chat' });
    }
  });

  fastify.post('/chats/:id/auto-rename', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const chat = await getChat(id);
      if (!chat) return reply.status(404).send({ error: 'Chat not found' });
      const history = await getChatMessages(id);
      // Grab up to last 10 messages for context
      const recent = history.slice(-10).map(h => `${h.role}: ${h.content}`).join('\n');
      const response = await ollama.chat({
        model: chat.last_model || 'llama3',
        messages: [
          { role: 'user', content: `Based on this conversation, generate a 3-5 word title for the chat. Reply ONLY with the title. Do not use quotes.\n\n${recent}` }
        ]
      });
      const title = response.message.content.trim().replace(/^["']|["']$/g, '');
      await updateChat(id, title);
      return { success: true, title };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to auto-rename chat' });
    }
  });

  fastify.post('/chats/:id/summarize', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const chat = await getChat(id);
      if (!chat) return reply.status(404).send({ error: 'Chat not found' });
      const history = await getChatMessages(id);
      const fullText = history.map(h => `${h.role}: ${h.content}`).join('\n');
      
      const response = await ollama.chat({
        model: chat.last_model || 'llama3',
        messages: [
          { role: 'system', content: 'You are an AI assistant helping to compress chat context. Summarize the following conversation comprehensively. Capture all key facts, user preferences, conclusions, and important context so the AI can continue the conversation effectively without losing track of what happened.' },
          { role: 'user', content: fullText }
        ]
      });
      const summary = response.message.content.trim();
      await updateChatSummary(id, summary);
      
      return { success: true, summary };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to summarize chat' });
    }
  });

  fastify.post('/chats/:id/toggle-summary', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { use_summary } = request.body as { use_summary: boolean };
    try {
      await toggleChatSummaryMode(id, use_summary);
      return { success: true };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to toggle summary mode' });
    }
  });

  fastify.put('/chats/:id/config', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { system_prompt, tools_enabled } = request.body as { system_prompt: string | null; tools_enabled: boolean };
    try {
      await updateChatConfig(id, system_prompt ?? null, tools_enabled ?? true);
      return { success: true };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to update chat config' });
    }
  });

  fastify.post('/system-prompt/suggest', async (request, reply) => {
    const { current_prompt, model } = request.body as { current_prompt: string; model: string };
    try {
      const useModel = model || 'llama3';
      const response = await ollama.chat({
        model: useModel,
        messages: [
          { role: 'system', content: 'You are an expert AI prompt engineer. Your job is to improve system prompts to make AI assistants more helpful, precise, and effective. When given a system prompt, provide an improved version and briefly explain the key changes you made.' },
          { role: 'user', content: `Please improve this system prompt. Return ONLY a JSON object with two fields: "improved" (the improved prompt text) and "changes" (a short bulleted list of what you changed).\n\nCurrent prompt:\n${current_prompt || '(empty - create a good general-purpose assistant prompt)'}` }
        ]
      });
      try {
        const raw = response.message.content.trim();
        // Try to extract JSON from the response
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return { improved: parsed.improved, changes: parsed.changes };
        }
      } catch {}
      return { improved: response.message.content, changes: '' };
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to generate suggestion' });
    }
  });

  // ─── Chat ───────────────────────────────────────────────────────────────────
  fastify.post('/chat', async (request, reply) => {
    let { model, message, chatId } = request.body as { model: string; message: string; chatId?: string };

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

      // ── 4. Load history, system prompt, and save user message ─────────────
      let messages: any[] = [];
      let chatToolsEnabled = true;

      if (!chatId) {
        chatId = await createChat('New Chat', model);
        yield toolEvent({ event: 'chat_created', chatId });
        // Inject global system prompt for new chats
        const globalPrompt = await getSetting('system_prompt');
        if (globalPrompt) {
          messages.push({ role: 'system', content: globalPrompt });
        }
      } else {
        await updateChat(chatId, undefined, model);
        const chat = await getChat(chatId);
        chatToolsEnabled = chat?.tools_enabled !== false; // default true

        // Inject system prompt: per-chat override takes priority over global
        const chatPrompt = chat?.system_prompt;
        const globalPrompt = await getSetting('system_prompt');
        const effectivePrompt = chatPrompt || globalPrompt;
        if (effectivePrompt) {
          messages.push({ role: 'system', content: effectivePrompt });
        }

        if (chat?.use_summary && chat.summary) {
          messages.push({ role: 'system', content: `[Conversation History Summary]: ${chat.summary}` });
        } else {
          const history = await getChatMessages(chatId);
          for (const h of history) {
            messages.push({ role: h.role, content: h.content, tool_calls: h.tool_calls });
          }
        }
      }

      await addMessage(chatId, 'user', message);
      messages.push({ role: 'user', content: message });
      
      // ── 5. Main LLM loop ──────────────────────────────────────────────────
      let isDone = false;
      let iterationCount = 0;
      const MAX_ITERATIONS = 20;

      yield status('Thinking...');

      while (!isDone && iterationCount < MAX_ITERATIONS) {
        iterationCount++;

        const stream = await ollama.chat({
          model,
          messages,
          tools: modelSupportTools && chatToolsEnabled && tools.length > 0 ? tools : undefined,
          stream: true,
        });

        let fullResponse = '';
        let toolCalls: any[] = [];

        let promptEvalCount: number | undefined;
        let evalCount: number | undefined;

        for await (const chunk of stream) {
          if ((chunk as any).prompt_eval_count) promptEvalCount = (chunk as any).prompt_eval_count;
          if ((chunk as any).eval_count) evalCount = (chunk as any).eval_count;

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
          if (chatId) await addMessage(chatId, 'assistant', fullResponse, toolCalls, promptEvalCount, evalCount);

          if (promptEvalCount || evalCount) {
            yield `data: ${JSON.stringify({ type: 'context_usage', prompt: promptEvalCount, eval: evalCount })}\n\n`;
          }

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
              if (chatId) await addMessage(chatId, 'tool', JSON.stringify({ error: `Tool "${toolName}" was denied by user policy.` }));
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
                if (chatId) await addMessage(chatId, 'tool', JSON.stringify({ error: `Tool "${toolName}" was denied by the user.` }));
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
              if (chatId) await addMessage(chatId, 'tool', JSON.stringify(execData));
            } catch (e) {
              yield toolEvent({
                event: 'tool_error',
                toolName,
                message: `Tool "${toolName}" failed to execute.`,
              });
              messages.push({ role: 'tool', content: JSON.stringify({ error: 'Tool execution failed' }) });
              if (chatId) await addMessage(chatId, 'tool', JSON.stringify({ error: 'Tool execution failed' }));
            }
          }
          // Loop back to let model process tool results
        } else {
          // No tool calls — save assistant response and we're done
          if (chatId) await addMessage(chatId, 'assistant', fullResponse, undefined, promptEvalCount, evalCount);
          
          if (promptEvalCount || evalCount) {
            yield `data: ${JSON.stringify({ type: 'context_usage', prompt: promptEvalCount, eval: evalCount })}\n\n`;
          }
          yield 'data: [DONE]\n\n';
          isDone = true;

          // Auto-generate title asynchronously (don't block)
          if (!request.body.chatId && chatId) {
            ollama.chat({
              model,
              messages: [
                { role: 'user', content: `Summarize this prompt in 3-5 words max for a chat title: ${message}` }
              ]
            }).then(async (titleStream) => {
              const title = titleStream.message.content.trim().replace(/^["']|["']$/g, '');
              await updateChat(chatId as string, title);
              // Since the stream might be closed, we can't yield to it. 
              // The frontend will just see the new title when it reloads chats, 
              // but we can't push it via this closed stream anymore.
            }).catch(() => {});
          }
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
