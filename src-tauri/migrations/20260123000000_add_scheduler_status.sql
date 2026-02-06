-- Add scheduler status tracking columns
ALTER TABLE indicators 
ADD COLUMN last_updated_at DATETIME;
ALTER TABLE indicators
ADD COLUMN update_status TEXT DEFAULT 'pending';
ALTER TABLE indicators
ADD COLUMN error_message TEXT;

-- Index for finding stale indicators quickly
CREATE INDEX IF NOT EXISTS idx_indicators_last_updated ON indicators(last_updated_at);
