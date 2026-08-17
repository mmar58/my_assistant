import pg from 'pg';
import pgvector from 'pgvector/pg';

const { Pool } = pg;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
pgvector.registerTypes(pg.types as any);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error', err);
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
