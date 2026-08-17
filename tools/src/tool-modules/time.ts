import { ToolModule } from '../registry.js';

export const timeTools: ToolModule[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_current_time',
        description: 'Get the current date and time in a specified timezone, or local time if none is provided.',
        parameters: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description: 'IANA timezone string, e.g. "America/New_York", "Asia/Dhaka", or "UTC"',
            },
            format: {
              type: 'string',
              enum: ['iso', 'human', 'unix'],
              description: 'Output format: "iso" (ISO 8601), "human" (locale string), or "unix" (epoch seconds)',
            },
          },
          required: [],
        },
      },
    },
    category: 'utility',
    execute: async (args, ctx) => {
      const tz = args.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const now = new Date();
      ctx.emit('status', `Getting time for timezone: ${tz}`);

      let result: string;
      switch (args.format) {
        case 'unix':
          result = Math.floor(now.getTime() / 1000).toString();
          break;
        case 'iso':
          result = now.toISOString();
          break;
        default:
          result = now.toLocaleString('en-US', { timeZone: tz });
      }

      return { timezone: tz, time: result, format: args.format ?? 'human' };
    },
  },
];
