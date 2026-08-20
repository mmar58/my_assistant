-- Add context tracking to messages
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS prompt_eval_count INT,
ADD COLUMN IF NOT EXISTS eval_count INT;

-- Add summary to chats
ALTER TABLE chats
ADD COLUMN IF NOT EXISTS summary TEXT,
ADD COLUMN IF NOT EXISTS use_summary BOOLEAN NOT NULL DEFAULT FALSE;
