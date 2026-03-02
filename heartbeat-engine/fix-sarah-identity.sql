-- Fix Sarah's identity in Railway PostgreSQL database
-- Run this against the Railway PostgreSQL database

-- Update Sarah's role and client
UPDATE agents SET
  role = 'Content & Digital Marketing Executive',
  client = 'BLOOM Ecosystem'
WHERE id = 'bloomie-sarah-rodriguez';

-- Clear old chat messages with wrong identity
DELETE FROM chat_messages;

-- Create missing bloom_context table if it doesn't exist
CREATE TABLE IF NOT EXISTS bloom_context (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(100),
  context_type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  related_entities JSONB,
  tags JSONB,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for bloom_context
CREATE INDEX IF NOT EXISTS idx_bloom_context_agent_type ON bloom_context(agent_id, context_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bloom_context_expires ON bloom_context(expires_at) WHERE expires_at IS NOT NULL;

-- Verify the changes
SELECT id, name, role, client FROM agents WHERE id = 'bloomie-sarah-rodriguez';
SELECT COUNT(*) as chat_messages_remaining FROM chat_messages;
SELECT COUNT(*) as bloom_context_exists FROM information_schema.tables WHERE table_name = 'bloom_context';