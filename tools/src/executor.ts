import { getExecutor, ToolContext } from './registry.js';
import { getToolPermission } from './permissions.js';
import { resolve } from 'path';

/** Result of executing a tool */
export interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  statusEvents: { type: string; message: string }[];
}

/** Execute a registered tool by name with given arguments */
export async function executeTool(
  name: string,
  args: Record<string, any>
): Promise<ExecutionResult> {
  const executor = getExecutor(name);
  const statusEvents: { type: string; message: string }[] = [];

  if (!executor) {
    return { success: false, error: `Tool "${name}" not found in registry`, statusEvents };
  }

  const ctx: ToolContext = {
    emit: (type, message) => {
      statusEvents.push({ type, message });
    },
  };

  try {
    const result = await executor(args, ctx);
    return { success: true, result, statusEvents };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? 'Unknown error',
      statusEvents,
    };
  }
}

/** Check if a command matches a whitelisted prefix */
export function isCommandWhitelisted(command: string, whitelist: string[]): boolean {
  if (whitelist.length === 0) return false;
  return whitelist.some((prefix) => {
    // Support glob-style: "pnpm *" matches "pnpm install foo"
    if (prefix.endsWith(' *')) {
      return command.startsWith(prefix.slice(0, -2).trim());
    }
    return command.startsWith(prefix);
  });
}

/** Check if a path is under a whitelisted directory */
export function isPathWhitelisted(targetPath: string, whitelist: string[]): boolean {
  if (whitelist.length === 0) return false;
  const resolved = resolve(targetPath);
  return whitelist.some((dir) => resolved.startsWith(resolve(dir)));
}
