import { ToolModule } from '../registry.js';
import { pool } from '../db.js';

export const searchTools: ToolModule[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'search_tools',
        description:
          'Search the tool registry by name, category, or description to find tools that can help with a task. Use this before trying to create a new tool to avoid duplicates.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural language description of what you need, e.g. "read a file" or "make HTTP request"',
            },
            category: {
              type: 'string',
              description: 'Filter by category (optional): filesystem, shell, web, utility, custom',
            },
          },
          required: ['query'],
        },
      },
    },
    category: 'meta',
    execute: async (args, ctx) => {
      ctx.emit('status', `Searching tools for: "${args.query}"`);

      const conditions: string[] = [`(name ILIKE $1 OR description ILIKE $1)`];
      const params: any[] = [`%${args.query}%`];

      if (args.category) {
        params.push(args.category);
        conditions.push(`category = $${params.length}`);
      }

      const result = await pool.query(
        `SELECT name, description, category, schema FROM tools WHERE ${conditions.join(' AND ')} ORDER BY category, name LIMIT 20`,
        params
      );

      ctx.emit('status', `Found ${result.rows.length} matching tools`);
      return {
        query: args.query,
        count: result.rows.length,
        tools: result.rows.map((r) => ({
          name: r.name,
          description: r.description,
          category: r.category,
          parameters: r.schema,
        })),
      };
    },
  },

  {
    definition: {
      type: 'function',
      function: {
        name: 'list_all_tools',
        description: 'List all available tools in the registry, optionally filtered by category.',
        parameters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Filter by category (optional)',
            },
          },
          required: [],
        },
      },
    },
    category: 'meta',
    execute: async (args, ctx) => {
      ctx.emit('status', 'Listing all available tools...');
      const cond = args.category ? 'WHERE category = $1' : '';
      const params = args.category ? [args.category] : [];
      const result = await pool.query(
        `SELECT name, description, category FROM tools ${cond} ORDER BY category, name`,
        params
      );
      ctx.emit('status', `Found ${result.rows.length} tools`);
      return { count: result.rows.length, tools: result.rows };
    },
  },
];
