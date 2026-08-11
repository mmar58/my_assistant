import { FastifyInstance } from 'fastify';
import ollama from 'ollama';
import { logResponse } from '../services/file.service.js';
import { Readable } from 'stream';

export async function chatRoutes(fastify: FastifyInstance) {
  fastify.get('/models', async (request, reply) => {
    try {
      const response = await ollama.list();
      console.log('Ollama response', response)
      return response.models;
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch models' });
    }
  });

  fastify.post('/chat', async (request, reply) => {
    const { model, message } = request.body as { model: string; message: string };

    if (!model || !message) {
      return reply.status(400).send({ error: 'Model and message are required' });
    }

    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');

    try {
      async function* generate() {
        let tools = [];
        try {
          const toolsRes = await fetch('http://127.0.0.1:3001/api/tools');
          if (toolsRes.ok) {
            const data = await toolsRes.json() as any;
            tools = data.tools || [];
          }
        } catch (e) {
          fastify.log.error('Failed to fetch tools from microservice');
        }

        let messages: any[] = [{ role: 'user', content: message }];
        let isDone = false;

        // Check if this model supports tool use
        let modelSupportTools = false;
        try {
          const modelInfo = await ollama.show({ model });
          modelSupportTools = (modelInfo as any).capabilities?.includes('tools') ?? false;
          if (!modelSupportTools) {
            fastify.log.info(`Model ${model} does not support tools, skipping tool injection.`);
          }
        } catch (e) {
          fastify.log.warn('Could not determine model capabilities, proceeding without tools');
        }

        while (!isDone) {
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
              // We don't yield here yet, we will yield below so we can include arguments
            } else if (chunk.message.content) {
              const content = chunk.message.content;
              fullResponse += content;
              yield `data: ${JSON.stringify({ type: 'content', content })}\n\n`;
            }
          }

          if (toolCalls.length > 0) {
            messages.push({
              role: 'assistant',
              content: fullResponse,
              tool_calls: toolCalls
            });

            for (const tc of toolCalls) {
              // Yield the tool call as content so the user sees it inline
              yield `data: ${JSON.stringify({ type: 'content', content: `\n\n> *Calling tool: ${tc.function.name}* \n> *Arguments: ${JSON.stringify(tc.function.arguments)}*\n` })}\n\n`;
              
              try {
                const execRes = await fetch('http://127.0.0.1:3001/api/tools/execute', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: tc.function.name, arguments: tc.function.arguments })
                });
                
                const execData = await execRes.json();
                
                messages.push({
                  role: 'tool',
                  content: JSON.stringify(execData),
                });

                // Yield the tool result as content
                yield `data: ${JSON.stringify({ type: 'content', content: `> *Result: ${JSON.stringify(execData)}*\n\n` })}\n\n`;
              } catch (e) {
                messages.push({
                  role: 'tool',
                  content: JSON.stringify({ error: 'Tool execution failed' })
                });
                yield `data: ${JSON.stringify({ type: 'content', content: `> *Result: Failed to execute tool*\n\n` })}\n\n`;
              }
            }
            // Loop restarts to let model process tool results
          } else {
            logResponse(model, fullResponse);
            yield 'data: [DONE]\n\n';
            isDone = true;
          }
        }
      }

      return reply.send(Readable.from(generate()));
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to initialize chat stream' });
    }
  });
}
