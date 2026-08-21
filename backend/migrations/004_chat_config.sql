-- Per-chat configuration columns
ALTER TABLE chats
ADD COLUMN IF NOT EXISTS system_prompt TEXT,
ADD COLUMN IF NOT EXISTS tools_enabled BOOLEAN NOT NULL DEFAULT TRUE;
