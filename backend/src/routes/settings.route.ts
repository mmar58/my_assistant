import { FastifyInstance } from 'fastify';
import {
  getAllSettings,
  setSetting,
  getAllToolPermissions,
  upsertToolPermission,
} from '../db.js';
import {
  listPendingRequests,
  getPendingRequest,
  respondToPermission,
} from '../permission-store.js';

export async function settingsRoutes(fastify: FastifyInstance) {
  // ─── Settings ──────────────────────────────────────────────────────────────

  fastify.get('/settings', async () => {
    return getAllSettings();
  });

  fastify.post('/settings', async (request, reply) => {
    const updates = request.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      await setSetting(key, value);
    }
    return { ok: true };
  });

  // ─── Tool Permissions ───────────────────────────────────────────────────────

  fastify.get('/settings/tool-permissions', async () => {
    return getAllToolPermissions();
  });

  fastify.post('/settings/tool-permissions', async (request, reply) => {
    const { toolName, policy, whitelistedDirs, whitelistedCommands } = request.body as {
      toolName: string;
      policy: string;
      whitelistedDirs: string[];
      whitelistedCommands: string[];
    };
    if (!toolName || !policy) {
      return reply.status(400).send({ error: 'toolName and policy are required' });
    }
    await upsertToolPermission(
      toolName,
      policy,
      whitelistedDirs ?? [],
      whitelistedCommands ?? []
    );
    return { ok: true };
  });

  // ─── Permission Requests (long-poll) ────────────────────────────────────────

  /** List all pending permission requests */
  fastify.get('/permissions/pending', async () => {
    return listPendingRequests();
  });

  /** Long-poll: wait until a specific requestId gets a response or 30s timeout */
  fastify.get('/permissions/pending/:requestId', async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    const existing = getPendingRequest(requestId);
    if (!existing) {
      return reply.status(404).send({ error: 'Permission request not found' });
    }
    return existing;
  });

  /** User responds to a permission request */
  fastify.post('/permissions/respond', async (request, reply) => {
    const { requestId, result } = request.body as {
      requestId: string;
      result: 'approve_once' | 'approve_always' | 'deny';
    };
    const ok = respondToPermission(requestId, result);
    if (!ok) {
      return reply.status(404).send({ error: 'Permission request not found or already resolved' });
    }
    return { ok: true };
  });
}
