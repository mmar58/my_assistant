/**
 * In-memory store for pending tool permission requests.
 * Maps requestId → { resolve, reject } for long-poll waiting.
 */

type PermissionResult = 'approve_once' | 'approve_always' | 'deny';

interface PendingRequest {
  resolve: (result: PermissionResult) => void;
  toolName: string;
  reason: string;
  args: Record<string, any>;
  createdAt: number;
}

const pending = new Map<string, PendingRequest>();

/** Create a new pending permission request, returns a promise that resolves when user responds */
export function createPermissionRequest(
  requestId: string,
  toolName: string,
  reason: string,
  args: Record<string, any>
): Promise<PermissionResult> {
  return new Promise((resolve) => {
    pending.set(requestId, { resolve, toolName, reason, args, createdAt: Date.now() });

    // Auto-deny after 2 minutes if no response
    setTimeout(() => {
      if (pending.has(requestId)) {
        pending.get(requestId)!.resolve('deny');
        pending.delete(requestId);
      }
    }, 120_000);
  });
}

/** Get a pending request info (for the frontend to display) */
export function getPendingRequest(requestId: string) {
  const req = pending.get(requestId);
  if (!req) return null;
  return {
    requestId,
    toolName: req.toolName,
    reason: req.reason,
    args: req.args,
    createdAt: req.createdAt,
  };
}

/** Respond to a pending permission request */
export function respondToPermission(requestId: string, result: PermissionResult): boolean {
  const req = pending.get(requestId);
  if (!req) return false;
  req.resolve(result);
  pending.delete(requestId);
  return true;
}

/** List all currently pending requests */
export function listPendingRequests() {
  return Array.from(pending.entries()).map(([id, req]) => ({
    requestId: id,
    toolName: req.toolName,
    reason: req.reason,
    args: req.args,
    createdAt: req.createdAt,
  }));
}
