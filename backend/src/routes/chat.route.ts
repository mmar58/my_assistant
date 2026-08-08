import { FastifyInstance } from 'fastify';
import ollama from 'ollama';
import { logResponse } from '../services/file.service.js';

export async function chatRoutes(fastify: FastifyInstance) {
  fastify.get('/models', async (request, reply) => {
    try {
      const response = await ollama.list();
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

    // Set headers for Server-Sent Events (SSE)
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    let fullResponse = '';

    try {
      const stream = await ollama.chat({
        model,
        messages: [{ role: 'user', content: message }],
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.message.content;
        fullResponse += content;
        
        // Write the chunk to the response stream
        reply.raw.write(`data: ${JSON.stringify({ content })}\n\n`);
      }

      // Once done, log the response and end stream
      logResponse(model, fullResponse);
      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();

    } catch (error) {
      fastify.log.error(error);
      reply.raw.write(`data: ${JSON.stringify({ error: 'An error occurred during chat' })}\n\n`);
      reply.raw.end();
    }
  });
}
