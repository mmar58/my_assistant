import pg from 'pg';
import pgvector from 'pgvector/pg';

const { Pool } = pg;

// Register pgvector types happens in runMigrations

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error', err);
});

pool.on('connect', async (client) => {
  try {
    await pgvector.registerTypes(client);
  } catch (err) {
    console.error('Failed to register pgvector types:', err);
  }
});

/** Run the DB migration SQL on startup */
export async function runMigrations(): Promise<void> {
  const { readFile } = await import('fs/promises');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const sql = await readFile(join(__dirname, '../migrations/001_init.sql'), 'utf-8');
  await pool.query(sql);
  
  // pgvector types are registered via pool.on('connect')
  
  console.log('✓ Database migrations applied');
}

/** Get an embedding vector for a text string using Ollama */
export async function getEmbedding(text: string, model: string): Promise<number[] | null> {
  try {
    const res = await fetch('http://127.0.0.1:11434/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { embeddings?: number[][] };
    return data.embeddings?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Search tools by semantic similarity to a query embedding */
export async function searchTools(
  queryEmbedding: number[],
  limit = 10
): Promise<any[]> {
  const vectorStr = `[${queryEmbedding.join(',')}]`;
  const result = await pool.query(
    `SELECT name, description, category, schema, embedding <=> $1::vector AS distance
     FROM tools
     ORDER BY distance ASC
     LIMIT $2`,
    [vectorStr, limit]
  );
  return result.rows;
}

/** Get all tools (full schema for LLM) without embedding filter */
export async function getAllToolSchemas(): Promise<any[]> {
  const result = await pool.query(
    `SELECT name, description, category, schema FROM tools ORDER BY category, name`
  );
  return result.rows;
}

/** Get a setting value */
export async function getSetting(key: string): Promise<string | null> {
  const result = await pool.query(`SELECT value FROM settings WHERE key = $1`, [key]);
  return result.rows[0]?.value ?? null;
}

/** Set a setting value */
export async function setSetting(key: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}

/** Get all settings as key-value map */
export async function getAllSettings(): Promise<Record<string, string>> {
  const result = await pool.query(`SELECT key, value FROM settings`);
  return Object.fromEntries(result.rows.map((r) => [r.key, r.value]));
}

/** Get tool permission policy */
export async function getToolPermission(toolName: string): Promise<{
  policy: string;
  whitelisted_dirs: string[];
  whitelisted_commands: string[];
} | null> {
  const result = await pool.query(
    `SELECT policy, whitelisted_dirs, whitelisted_commands
     FROM tool_permissions WHERE tool_name = $1`,
    [toolName]
  );
  return result.rows[0] ?? null;
}

/** Upsert tool permission */
export async function upsertToolPermission(
  toolName: string,
  policy: string,
  whitelistedDirs: string[],
  whitelistedCommands: string[]
): Promise<void> {
  await pool.query(
    `INSERT INTO tool_permissions (tool_name, policy, whitelisted_dirs, whitelisted_commands)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     ON CONFLICT (tool_name) DO UPDATE
       SET policy = EXCLUDED.policy,
           whitelisted_dirs = EXCLUDED.whitelisted_dirs,
           whitelisted_commands = EXCLUDED.whitelisted_commands`,
    [toolName, policy, JSON.stringify(whitelistedDirs ?? []), JSON.stringify(whitelistedCommands ?? [])]
  );
}

/** List all tool permissions */
export async function getAllToolPermissions(): Promise<any[]> {
  const result = await pool.query(
    `SELECT tool_name, policy, whitelisted_dirs, whitelisted_commands FROM tool_permissions`
  );
  return result.rows;
}
