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
  const { readFile, readdir } = await import('fs/promises');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = join(__dirname, '../migrations');
  
  const files = await readdir(migrationsDir);
  const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

  for (const file of sqlFiles) {
    const sql = await readFile(join(migrationsDir, file), 'utf-8');
    await pool.query(sql);
    console.log(`✓ Applied migration: ${file}`);
  }
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

// ── Chat and Message Management ──────────────────────────────────────────────

export async function createChat(title: string, model: string): Promise<string> {
  const result = await pool.query(
    `INSERT INTO chats (title, last_model) VALUES ($1, $2) RETURNING id`,
    [title, model]
  );
  return result.rows[0].id;
}

export async function getChats(): Promise<any[]> {
  const result = await pool.query(
    `SELECT id, title, last_model, summary, use_summary, created_at, updated_at FROM chats ORDER BY updated_at DESC`
  );
  return result.rows;
}

export async function getChat(id: string): Promise<any | null> {
  const result = await pool.query(
    `SELECT id, title, last_model, summary, use_summary, created_at, updated_at FROM chats WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function updateChat(id: string, title?: string, last_model?: string): Promise<void> {
  if (title && last_model) {
    await pool.query(
      `UPDATE chats SET title = $1, last_model = $2, updated_at = NOW() WHERE id = $3`,
      [title, last_model, id]
    );
  } else if (title) {
    await pool.query(`UPDATE chats SET title = $1, updated_at = NOW() WHERE id = $2`, [title, id]);
  } else if (last_model) {
    await pool.query(`UPDATE chats SET last_model = $1, updated_at = NOW() WHERE id = $2`, [last_model, id]);
  }
}

export async function updateChatSummary(id: string, summary: string): Promise<void> {
  await pool.query(`UPDATE chats SET summary = $1, updated_at = NOW() WHERE id = $2`, [summary, id]);
}

export async function toggleChatSummaryMode(id: string, useSummary: boolean): Promise<void> {
  await pool.query(`UPDATE chats SET use_summary = $1, updated_at = NOW() WHERE id = $2`, [useSummary, id]);
}

export async function deleteChat(id: string): Promise<void> {
  await pool.query(`DELETE FROM chats WHERE id = $1`, [id]);
}

export async function addMessage(
  chatId: string,
  role: string,
  content: string,
  toolCalls?: any[],
  promptEvalCount?: number,
  evalCount?: number
): Promise<void> {
  await pool.query(
    `INSERT INTO messages (chat_id, role, content, tool_calls, prompt_eval_count, eval_count) VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
    [chatId, role, content, toolCalls ? JSON.stringify(toolCalls) : null, promptEvalCount ?? null, evalCount ?? null]
  );
  await pool.query(`UPDATE chats SET updated_at = NOW() WHERE id = $1`, [chatId]);
}

export async function getChatMessages(chatId: string): Promise<any[]> {
  const result = await pool.query(
    `SELECT id, role, content, tool_calls, prompt_eval_count, eval_count, created_at FROM messages WHERE chat_id = $1 ORDER BY created_at ASC`,
    [chatId]
  );
  return result.rows;
}
