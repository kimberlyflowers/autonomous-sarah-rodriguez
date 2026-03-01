-- Fix Sarah's identity and clear old chat messages
-- Run this against the Railway PostgreSQL database

-- Update Sarah's role and client
UPDATE agents SET
  role = 'Content & Digital Marketing Executive',
  client = 'BLOOM Ecosystem'
WHERE id = 'bloomie-sarah-rodriguez';

-- Clear all old chat messages
DELETE FROM chat_messages;

-- Verify changes
SELECT id, name, role, client FROM agents WHERE id = 'bloomie-sarah-rodriguez';
SELECT COUNT(*) as remaining_messages FROM chat_messages;