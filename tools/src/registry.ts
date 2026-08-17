import { pool } from './db.js';

/** Context passed to every tool execute function */
export interface ToolContext {
  /** Emit a status message visible to the user */
  emit: (type: 'status' | 'info' | 'warning', message: string) => void;
}

/** A tool module — definition + executor */
export interface ToolModule {
  definition: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  };
  category: string;
  execute: (args: Record<string, any>, ctx: ToolContext) => Promise<any>;
}

// Internal map: tool name → executor
const executors = new Map<string, (args: Record<string, any>, ctx: ToolContext) => Promise<any>>();

// All registered tool definitions (for the LLM)
let toolDefinitions: any[] = [];

/**
 * Register built-in tool modules into the in-memory registry
 * and upsert their definitions into the database.
 */
export async function registerBuiltinTools(modules: ToolModule[]): Promise<void> {
  const embeddingModel = process.env.EMBEDDING_MODEL ?? 'nomic-embed-text';

  for (const mod of modules) {
    const { name, description, parameters } = mod.definition.function;

    // Register executor
    executors.set(name, mod.execute);

    // Get embedding
    let embeddingStr: string | null = null;
    try {
      const res = await fetch('http://127.0.0.1:11434/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: embeddingModel, input: description }),
      });
      if (res.ok) {
        const data = (await res.json()) as { embeddings?: number[][] };
        const vec = data.embeddings?.[0];
        if (vec) embeddingStr = `[${vec.join(',')}]`;
      }
    } catch {
      // embedding optional
    }

    // Upsert into DB
    try {
      await pool.query(
        `INSERT INTO tools (name, description, category, schema, embedding, is_builtin)
         VALUES ($1, $2, $3, $4::jsonb, $5::vector, true)
         ON CONFLICT (name) DO UPDATE
           SET description = EXCLUDED.description,
               category = EXCLUDED.category,
               schema = EXCLUDED.schema,
               embedding = COALESCE(EXCLUDED.embedding, tools.embedding),
               updated_at = NOW()`,
        [name, description, mod.category, JSON.stringify(parameters), embeddingStr]
      );
    } catch (e) {
      console.warn(`Failed to upsert tool "${name}" into DB:`, e);
    }

    toolDefinitions.push(mod.definition);
  }

  console.log(`✓ Registered ${modules.length} built-in tools`);
}

/**
 * Load custom (AI-created) tools from the database and register their executors
 * using dynamic eval of stored code.
 */
export async function loadCustomTools(): Promise<void> {
  const result = await pool.query(
    `SELECT name, description, category, schema, code FROM tools WHERE is_builtin = false AND code IS NOT NULL`
  );

  for (const row of result.rows) {
    try {
      // Dynamically create executor from stored code
      const fn = new Function(
        'args',
        'ctx',
        `return (async (args, ctx) => { ${row.code} })(args, ctx)`
      );
      executors.set(row.name, fn as any);

      // Add definition if not already present
      if (!toolDefinitions.find((d) => d.function.name === row.name)) {
        toolDefinitions.push({
          type: 'function',
          function: {
            name: row.name,
            description: row.description,
            parameters: row.schema,
          },
        });
      }
    } catch (e) {
      console.warn(`Failed to load custom tool "${row.name}":`, e);
    }
  }

  console.log(`✓ Loaded ${result.rows.length} custom tools from DB`);
}

/** Get all registered tool definitions */
export function getAllDefinitions(): any[] {
  return toolDefinitions;
}

/** Get an executor for a tool by name */
export function getExecutor(
  name: string
): ((args: Record<string, any>, ctx: ToolContext) => Promise<any>) | undefined {
  return executors.get(name);
}

/** Re-register a newly created custom tool without restart */
export function registerCustomTool(
  name: string,
  description: string,
  parameters: any,
  code: string
): void {
  try {
    const fn = new Function(
      'args',
      'ctx',
      `return (async (args, ctx) => { ${code} })(args, ctx)`
    );
    executors.set(name, fn as any);

    const existing = toolDefinitions.findIndex((d) => d.function.name === name);
    const def = { type: 'function', function: { name, description, parameters } };
    if (existing >= 0) {
      toolDefinitions[existing] = def;
    } else {
      toolDefinitions.push(def);
    }
  } catch (e) {
    console.warn(`Failed to hot-register custom tool "${name}":`, e);
  }
}
