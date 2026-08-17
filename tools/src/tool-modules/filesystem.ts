import * as fs from 'fs/promises';
import * as fss from 'fs';
import * as path from 'path';
import { ToolModule } from '../registry.js';

const SCHEMA_BASE = (props: Record<string, any>, required: string[] = []) => ({
  type: 'object',
  properties: props,
  required,
});

export const filesystemTools: ToolModule[] = [
  // ─── list_dir ──────────────────────────────────────────────────────────────
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_dir',
        description: 'List the contents of a directory, showing files and subdirectories with sizes.',
        parameters: SCHEMA_BASE({
          path: { type: 'string', description: 'Absolute or relative directory path to list' },
          show_hidden: { type: 'boolean', description: 'Include hidden files (starting with .)' },
        }, ['path']),
      },
    },
    category: 'filesystem',
    execute: async (args, ctx) => {
      const dirPath = path.resolve(args.path);
      ctx.emit('status', `Listing directory: ${dirPath}`);
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const items = await Promise.all(
        entries
          .filter((e) => args.show_hidden || !e.name.startsWith('.'))
          .map(async (e) => {
            let size: number | undefined;
            if (e.isFile()) {
              try {
                const stat = await fs.stat(path.join(dirPath, e.name));
                size = stat.size;
              } catch {}
            }
            return { name: e.name, type: e.isDirectory() ? 'dir' : 'file', size };
          })
      );
      return { path: dirPath, count: items.length, items };
    },
  },

  // ─── read_file ─────────────────────────────────────────────────────────────
  {
    definition: {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read the contents of a file. Returns the text content.',
        parameters: SCHEMA_BASE({
          path: { type: 'string', description: 'Absolute or relative file path to read' },
          start_line: { type: 'number', description: 'Start line (1-indexed, optional)' },
          end_line: { type: 'number', description: 'End line (1-indexed, optional)' },
        }, ['path']),
      },
    },
    category: 'filesystem',
    execute: async (args, ctx) => {
      const filePath = path.resolve(args.path);
      ctx.emit('status', `Reading file: ${filePath}`);
      const content = await fs.readFile(filePath, 'utf-8');
      if (args.start_line || args.end_line) {
        const lines = content.split('\n');
        const start = (args.start_line ?? 1) - 1;
        const end = args.end_line ?? lines.length;
        return { path: filePath, content: lines.slice(start, end).join('\n'), total_lines: lines.length };
      }
      return { path: filePath, content, size_bytes: Buffer.byteLength(content) };
    },
  },

  // ─── write_file ────────────────────────────────────────────────────────────
  {
    definition: {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Write or overwrite content to a file. Creates the file and any parent directories if they do not exist.',
        parameters: SCHEMA_BASE({
          path: { type: 'string', description: 'Absolute or relative file path to write' },
          content: { type: 'string', description: 'Content to write into the file' },
          append: { type: 'boolean', description: 'If true, append to the file instead of overwriting' },
        }, ['path', 'content']),
      },
    },
    category: 'filesystem',
    execute: async (args, ctx) => {
      const filePath = path.resolve(args.path);
      ctx.emit('status', `${args.append ? 'Appending to' : 'Writing'} file: ${filePath}`);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      if (args.append) {
        await fs.appendFile(filePath, args.content, 'utf-8');
      } else {
        await fs.writeFile(filePath, args.content, 'utf-8');
      }
      const stat = await fs.stat(filePath);
      return { path: filePath, size_bytes: stat.size, action: args.append ? 'appended' : 'written' };
    },
  },

  // ─── create_dir ────────────────────────────────────────────────────────────
  {
    definition: {
      type: 'function',
      function: {
        name: 'create_dir',
        description: 'Create a directory (and any necessary parent directories).',
        parameters: SCHEMA_BASE({
          path: { type: 'string', description: 'Absolute or relative path for the new directory' },
        }, ['path']),
      },
    },
    category: 'filesystem',
    execute: async (args, ctx) => {
      const dirPath = path.resolve(args.path);
      ctx.emit('status', `Creating directory: ${dirPath}`);
      await fs.mkdir(dirPath, { recursive: true });
      return { path: dirPath, created: true };
    },
  },

  // ─── delete_path ───────────────────────────────────────────────────────────
  {
    definition: {
      type: 'function',
      function: {
        name: 'delete_path',
        description: 'Delete a file or directory (recursive for directories). This is irreversible.',
        parameters: SCHEMA_BASE({
          path: { type: 'string', description: 'Absolute or relative path to delete' },
        }, ['path']),
      },
    },
    category: 'filesystem',
    execute: async (args, ctx) => {
      const targetPath = path.resolve(args.path);
      ctx.emit('status', `Deleting: ${targetPath}`);
      await fs.rm(targetPath, { recursive: true, force: true });
      return { path: targetPath, deleted: true };
    },
  },

  // ─── move_path ─────────────────────────────────────────────────────────────
  {
    definition: {
      type: 'function',
      function: {
        name: 'move_path',
        description: 'Move or rename a file or directory.',
        parameters: SCHEMA_BASE({
          source: { type: 'string', description: 'Source path (file or directory)' },
          destination: { type: 'string', description: 'Destination path' },
        }, ['source', 'destination']),
      },
    },
    category: 'filesystem',
    execute: async (args, ctx) => {
      const src = path.resolve(args.source);
      const dest = path.resolve(args.destination);
      ctx.emit('status', `Moving: ${src} → ${dest}`);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.rename(src, dest);
      return { source: src, destination: dest, moved: true };
    },
  },

  // ─── stat_path ─────────────────────────────────────────────────────────────
  {
    definition: {
      type: 'function',
      function: {
        name: 'stat_path',
        description: 'Get metadata about a file or directory: size, type, timestamps.',
        parameters: SCHEMA_BASE({
          path: { type: 'string', description: 'Absolute or relative path to inspect' },
        }, ['path']),
      },
    },
    category: 'filesystem',
    execute: async (args, ctx) => {
      const targetPath = path.resolve(args.path);
      ctx.emit('status', `Stat: ${targetPath}`);
      const stat = await fs.stat(targetPath);
      return {
        path: targetPath,
        type: stat.isDirectory() ? 'dir' : stat.isFile() ? 'file' : 'other',
        size_bytes: stat.size,
        created_at: stat.birthtime,
        modified_at: stat.mtime,
      };
    },
  },
];
