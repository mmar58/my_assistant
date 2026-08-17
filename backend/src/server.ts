import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { chatRoutes } from './routes/chat.route.js';
import { settingsRoutes } from './routes/settings.route.js';
import { runMigrations } from './db.js';

const fastify = Fastify({ logger: true });

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : true;

fastify.register(cors, { origin: allowedOrigins });
fastify.register(chatRoutes, { prefix: '/api' });
fastify.register(settingsRoutes, { prefix: '/api' });

const start = async () => {
  try {
    await runMigrations();
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server is listening on port 3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
