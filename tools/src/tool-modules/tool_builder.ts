import { ToolModule } from '../registry.js';
import { pool, getEmbedding } from '../db.js';

export const toolBuilderTools: ToolModule[] = [
  // ─── create_tool ───────────────────────────────────────────────────────────
  {
    definition: {
      type: 'function',
      function: {
        name: 'create_tool',
        description:
          'Create a new tool and register it in the tool registry. The tool code must be a JavaScript async function body (not a full function declaration) that receives (args, ctx) and returns a result. Use ctx.emit("status", "...") to send progress updates.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Unique snake_case tool name, e.g. "send_slack_message"',
            },
            description: {
              type: 'string',
              description: 'Clear description of what the tool does — used for semantic search',
            },
            category: {
              type: 'string',
              description: 'Category: filesystem, shell, web, utility, custom, etc.',
            },
            parameters_schema: {
              type: 'object',
              description: 'JSON Schema object describing the tool parameters (type: object, properties, required)',
            },
            code: {
              type: 'string',
              description:
                'Async JavaScript function body (the code inside `async (args, ctx) => { ... }`). Must return a plain object result. Can use top-level await. Import via dynamic import() if needed.',
            },
          },
          required: ['name', 'description', 'category', 'parameters_schema', 'code'],
        },
      },
    },
    category: 'meta',
    execute: async (args, ctx) => {
      ctx.emit('status', `Creating new tool: ${args.name}`);

      // Validate name format
      if (!/^[a-z][a-z0-9_]*$/.test(args.name)) {
        throw new Error('Tool name must be snake_case (lowercase letters, numbers, underscores)');
      }

      // Get embedding for description
      const embeddingModel = process.env.EMBEDDING_MODEL ?? 'nomic-embed-text';
      const embedding = await getEmbedding(args.description, embeddingModel);
      const embeddingStr = embedding ? `[${embedding.join(',')}]` : null;

      // Upsert into DB
      await pool.query(
        `INSERT INTO tools (name, description, category, schema, code, embedding, is_builtin)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6::vector, false)
         ON CONFLICT (name) DO UPDATE
           SET description = EXCLUDED.description,
               category = EXCLUDED.category,
               schema = EXCLUDED.schema,
               code = EXCLUDED.code,
               embedding = EXCLUDED.embedding,
               updated_at = NOW()`,
        [
          args.name,
          args.description,
          args.category,
          JSON.stringify(args.parameters_schema),
          args.code,
          embeddingStr,
        ]
      );

      ctx.emit('status', `Tool "${args.name}" registered in database`);

      // Write tool file to disk for persistence/inspection
      const { writeFile, mkdir } = await import('fs/promises');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const toolDir = join(__dirname, '../tool-modules/custom');
      await mkdir(toolDir, { recursive: true });
      const toolFile = join(toolDir, `${args.name}.js`);
      await writeFile(
        toolFile,
        `// Auto-generated tool: ${args.name}\n// ${args.description}\nexport const fn = async (args, ctx) => {\n${args.code}\n};\n`,
        'utf-8'
      );

      ctx.emit('status', `Tool file written to ${toolFile}`);
      return {
        created: true,
        name: args.name,
        category: args.category,
        file: toolFile,
        message: `Tool "${args.name}" is now available and can be called immediately.`,
      };
    },
  },

  // ─── update_tool ───────────────────────────────────────────────────────────
  {
    definition: {
      type: 'function',
      function: {
        name: 'update_tool',
        description: 'Update an existing custom tool\'s description, code, or parameters schema.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the tool to update' },
            description: { type: 'string', description: 'New description (optional)' },
            code: { type: 'string', description: 'New function body code (optional)' },
            parameters_schema: { type: 'object', description: 'New parameters schema (optional)' },
          },
          required: ['name'],
        },
      },
    },
    category: 'meta',
    execute: async (args, ctx) => {
      ctx.emit('status', `Updating tool: ${args.name}`);
      const updates: string[] = ['updated_at = NOW()'];
      const params: any[] = [args.name];

      if (args.description) {
        params.push(args.description);
        updates.push(`description = $${params.length}`);
        const embeddingModel = process.env.EMBEDDING_MODEL ?? 'nomic-embed-text';
        const embedding = await getEmbedding(args.description, embeddingModel);
        if (embedding) {
          params.push(`[${embedding.join(',')}]`);
          updates.push(`embedding = $${params.length}::vector`);
        }
      }
      if (args.code) {
        params.push(args.code);
        updates.push(`code = $${params.length}`);
      }
      if (args.parameters_schema) {
        params.push(JSON.stringify(args.parameters_schema));
        updates.push(`schema = $${params.length}::jsonb`);
      }

      const result = await pool.query(
        `UPDATE tools SET ${updates.join(', ')} WHERE name = $1 AND is_builtin = false`,
        params
      );

      if (result.rowCount === 0) {
        throw new Error(`Tool "${args.name}" not found or is a built-in tool (cannot modify)`);
      }

      ctx.emit('status', `Tool "${args.name}" updated`);
      return { updated: true, name: args.name };
    },
  },

  // ─── delete_tool ───────────────────────────────────────────────────────────
  {
    definition: {
      type: 'function',
      function: {
        name: 'delete_tool',
        description: 'Remove a custom tool from the registry. Built-in tools cannot be deleted.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the tool to delete' },
          },
          required: ['name'],
        },
      },
    },
    category: 'meta',
    execute: async (args, ctx) => {
      ctx.emit('status', `Deleting tool: ${args.name}`);
      const result = await pool.query(
        `DELETE FROM tools WHERE name = $1 AND is_builtin = false`,
        [args.name]
      );
      if (result.rowCount === 0) {
        throw new Error(`Tool "${args.name}" not found or is a built-in tool (cannot delete)`);
      }
      ctx.emit('status', `Tool "${args.name}" deleted from registry`);
      return { deleted: true, name: args.name };
    },
  },
];
