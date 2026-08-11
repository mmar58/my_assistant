import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';

const fastify = Fastify({ logger: true });

fastify.register(cors, { origin: true });

// Define tools
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Get the current time and date in the requested timezone, or local time if none provided.',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'The timezone to get the time for, e.g. "America/New_York" or "UTC"'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather for a specific location.',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g. "San Francisco, CA"'
          },
          unit: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            description: 'The temperature unit to use'
          }
        },
        required: ['location']
      }
    }
  }
];

fastify.get('/api/tools', async (request, reply) => {
  return { tools: TOOLS };
});

fastify.post('/api/tools/execute', async (request, reply) => {
  const { name, arguments: args } = request.body as { name: string; arguments: any };

  fastify.log.info({ name, args }, 'Executing tool');

  try {
    if (name === 'get_current_time') {
      const tz = args.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const time = new Date().toLocaleString('en-US', { timeZone: tz });
      return { result: `The current time in ${tz} is ${time}` };
    } 
    
    if (name === 'get_weather') {
      // Mock weather response
      return { result: `The current weather in ${args.location} is sunny and 72 degrees.` };
    }

    return reply.status(404).send({ error: `Tool ${name} not found` });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Tool execution failed' });
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    console.log(`Tools service listening on port 3001`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
