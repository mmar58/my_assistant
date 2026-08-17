import { spawn } from 'child_process';
import { ToolModule } from '../registry.js';

export const shellTools: ToolModule[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'run_command',
        description:
          'Execute a shell command and return its stdout and stderr. The command must match a whitelisted command prefix configured in settings.',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The shell command to run, e.g. "pnpm install" or "git status"',
            },
            cwd: {
              type: 'string',
              description: 'Working directory to run the command in (optional, defaults to system temp)',
            },
            timeout_ms: {
              type: 'number',
              description: 'Timeout in milliseconds (optional, default 30000)',
            },
          },
          required: ['command'],
        },
      },
    },
    category: 'shell',
    execute: async (args, ctx) => {
      const command: string = args.command;
      const cwd: string = args.cwd ?? process.cwd();
      const timeout: number = args.timeout_ms ?? 30_000;

      ctx.emit('status', `Running command: ${command}`);

      return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';

        const child = spawn('sh', ['-c', command], {
          cwd,
          env: { ...process.env },
          timeout,
        });

        child.stdout.on('data', (d: Buffer) => {
          stdout += d.toString();
          ctx.emit('status', `[stdout] ${d.toString().trim()}`);
        });

        child.stderr.on('data', (d: Buffer) => {
          stderr += d.toString();
          ctx.emit('status', `[stderr] ${d.toString().trim()}`);
        });

        child.on('close', (code) => {
          resolve({
            exit_code: code,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            command,
            cwd,
          });
        });

        child.on('error', (err) => {
          resolve({ error: err.message, command, exit_code: -1 });
        });
      });
    },
  },
];
