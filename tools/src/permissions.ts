import { pool } from './db.js';

/** Get tool permission policy from DB */
export async function getToolPermission(toolName: string): Promise<{
  policy: string;
  whitelisted_dirs: string[];
  whitelisted_commands: string[];
} | null> {
  try {
    const result = await pool.query(
      `SELECT policy, whitelisted_dirs, whitelisted_commands FROM tool_permissions WHERE tool_name = $1`,
      [toolName]
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Get global default tool policy */
export async function getDefaultPolicy(): Promise<string> {
  try {
    const result = await pool.query(`SELECT value FROM settings WHERE key = 'default_tool_policy'`);
    return result.rows[0]?.value ?? 'ask';
  } catch {
    return 'ask';
  }
}
