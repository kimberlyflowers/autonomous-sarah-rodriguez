-- =====================================================
-- SUPABASE MESSAGES TABLE MIGRATION
-- Chat messages storage for multi-tenant architecture
-- =====================================================

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  files JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Enable Row Level Security
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for messages table
-- Users can only see their own messages
CREATE POLICY "Users can view their own messages"
  ON messages FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own messages
CREATE POLICY "Users can insert their own messages"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own messages
CREATE POLICY "Users can update their own messages"
  ON messages FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only delete their own messages
CREATE POLICY "Users can delete their own messages"
  ON messages FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger to update session's updated_at when messages are added
CREATE OR REPLACE FUNCTION update_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE sessions 
  SET updated_at = NOW() 
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_update_session_timestamp
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_session_timestamp();

COMMENT ON TABLE messages IS 'Chat messages for all users - Supabase is source of truth';
COMMENT ON COLUMN messages.session_id IS 'Foreign key to sessions table';
COMMENT ON COLUMN messages.user_id IS 'User ID for RLS isolation';
COMMENT ON COLUMN messages.role IS 'Message role: user or assistant';
COMMENT ON COLUMN messages.content IS 'Message text content';
COMMENT ON COLUMN messages.files IS 'Optional JSON array of file attachments';
