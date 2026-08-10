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
      const stream = await ollama.chat({
        model,
        messages: [{ role: 'user', content: message }],
        stream: true,
      });

      async function* generate() {
        let fullResponse = '';
        try {
          for await (const chunk of stream) {
            const content = chunk.message.content;
            fullResponse += content;
            yield `data: ${JSON.stringify({ content })}\n\n`;
          }
          logResponse(model, fullResponse);
          yield 'data: [DONE]\n\n';
        } catch (error) {
          fastify.log.error(error);
          yield `data: ${JSON.stringify({ error: 'An error occurred during chat' })}\n\n`;
        }
      }

      return reply.send(Readable.from(generate()));
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to initialize chat stream' });
    }
  });
}
