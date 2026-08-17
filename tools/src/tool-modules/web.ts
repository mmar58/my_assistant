import { load } from 'cheerio';
import { ToolModule } from '../registry.js';

export const webTools: ToolModule[] = [
  // ─── scrape_url ────────────────────────────────────────────────────────────
  {
    definition: {
      type: 'function',
      function: {
        name: 'scrape_url',
        description:
          'Fetch a webpage and return its cleaned plain-text content (no HTML tags). Useful for reading articles, docs, or any public webpage.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to scrape' },
            selector: {
              type: 'string',
              description: 'Optional CSS selector to extract a specific element (e.g. "article", "main", "#content")',
            },
          },
          required: ['url'],
        },
      },
    },
    category: 'web',
    execute: async (args, ctx) => {
      ctx.emit('status', `Fetching: ${args.url}`);
      const res = await fetch(args.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AI-Assistant/1.0)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const html = await res.text();
      const $ = load(html);

      // Remove noise
      $('script, style, nav, footer, iframe, noscript, [aria-hidden="true"]').remove();

      const target = args.selector ? $(args.selector) : $('body');
      const text = target
        .text()
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 20_000); // limit to 20k chars

      ctx.emit('status', `Scraped ${text.length} characters from ${args.url}`);
      return { url: args.url, content: text, length: text.length };
    },
  },

  // ─── http_get ──────────────────────────────────────────────────────────────
  {
    definition: {
      type: 'function',
      function: {
        name: 'http_get',
        description: 'Make an HTTP GET request to a URL and return the response (JSON or text).',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to GET' },
            headers: {
              type: 'object',
              description: 'Optional headers as key-value pairs',
              additionalProperties: { type: 'string' },
            },
          },
          required: ['url'],
        },
      },
    },
    category: 'web',
    execute: async (args, ctx) => {
      ctx.emit('status', `GET ${args.url}`);
      const res = await fetch(args.url, {
        headers: args.headers ?? {},
        signal: AbortSignal.timeout(15_000),
      });
      const contentType = res.headers.get('content-type') ?? '';
      const body = contentType.includes('json') ? await res.json() : await res.text();
      return { status: res.status, content_type: contentType, body };
    },
  },

  // ─── http_post ─────────────────────────────────────────────────────────────
  {
    definition: {
      type: 'function',
      function: {
        name: 'http_post',
        description: 'Make an HTTP POST request with a JSON body and return the response.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to POST to' },
            body: { type: 'object', description: 'JSON body to send' },
            headers: {
              type: 'object',
              description: 'Optional additional headers',
              additionalProperties: { type: 'string' },
            },
          },
          required: ['url', 'body'],
        },
      },
    },
    category: 'web',
    execute: async (args, ctx) => {
      ctx.emit('status', `POST ${args.url}`);
      const res = await fetch(args.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(args.headers ?? {}) },
        body: JSON.stringify(args.body),
        signal: AbortSignal.timeout(15_000),
      });
      const contentType = res.headers.get('content-type') ?? '';
      const body = contentType.includes('json') ? await res.json() : await res.text();
      return { status: res.status, content_type: contentType, body };
    },
  },
];
