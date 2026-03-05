-- HQ Command Center - Run in Junk Line Supabase SQL Editor
-- Project: oschjeuhejqibymdaqxw

CREATE TABLE IF NOT EXISTS hq_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_key TEXT UNIQUE NOT NULL DEFAULT 'gibson',
  rhythm JSONB DEFAULT '{}',
  tasks JSONB DEFAULT '[]',
  notes JSONB DEFAULT '[]',
  needle_movers JSONB DEFAULT '[]',
  content_ideas JSONB DEFAULT '[]',
  images JSONB DEFAULT '[]',
  nci INTEGER DEFAULT 0
);

-- Seed your row
INSERT INTO hq_data (user_key) VALUES ('gibson')
ON CONFLICT (user_key) DO NOTHING;

-- Open RLS (personal tool, no auth needed)
ALTER TABLE hq_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to hq_data"
  ON hq_data FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auto-update timestamp on save
CREATE OR REPLACE FUNCTION update_hq_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hq_data_updated_at
  BEFORE UPDATE ON hq_data
  FOR EACH ROW
  EXECUTE FUNCTION update_hq_updated_at();
