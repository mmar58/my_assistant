-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Tools registry table
CREATE TABLE IF NOT EXISTS tools (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  -- JSON schema for the function parameters (Ollama tool format)
  schema JSONB NOT NULL,
  -- The actual TypeScript/JS code that implements this tool (for AI-created tools)
  code TEXT,
  -- Vector embedding of description (for semantic search)
  embedding vector(768),
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tool permission policies
CREATE TABLE IF NOT EXISTS tool_permissions (
  id SERIAL PRIMARY KEY,
  tool_name TEXT NOT NULL,
  -- 'auto_approve' | 'ask' | 'deny'
  policy TEXT NOT NULL DEFAULT 'ask',
  -- JSON array of allowed directory paths (for fs tools)
  whitelisted_dirs JSONB NOT NULL DEFAULT '[]',
  -- JSON array of allowed command prefixes (for shell tools)
  whitelisted_commands JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tool_name)
);

-- Global settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default global settings
INSERT INTO settings (key, value) VALUES
  ('default_tool_policy', 'ask'),
  ('embedding_model', 'nomic-embed-text'),
  ('show_tool_reason', 'true')
ON CONFLICT (key) DO NOTHING;

-- Index for vector similarity search
CREATE INDEX IF NOT EXISTS tools_embedding_idx ON tools USING hnsw (embedding vector_cosine_ops);

-- Index for tool name lookup
CREATE INDEX IF NOT EXISTS tools_name_idx ON tools (name);
