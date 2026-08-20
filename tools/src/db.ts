import pg from 'pg';
import pgvector from 'pgvector/pg';

const { Pool } = pg;

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

// ── Memory Management ────────────────────────────────────────────────────────

export async function saveMemory(content: string, embedding: number[]): Promise<void> {
  const vectorStr = `[${embedding.join(',')}]`;
  await pool.query(
    `INSERT INTO memories (content, embedding) VALUES ($1, $2::vector)`,
    [content, vectorStr]
  );
}

export async function searchMemories(
  queryEmbedding: number[],
  limit = 5
): Promise<any[]> {
  const vectorStr = `[${queryEmbedding.join(',')}]`;
  const result = await pool.query(
    `SELECT content, embedding <=> $1::vector AS distance
     FROM memories
     ORDER BY distance ASC
     LIMIT $2`,
    [vectorStr, limit]
  );
  return result.rows;
}
