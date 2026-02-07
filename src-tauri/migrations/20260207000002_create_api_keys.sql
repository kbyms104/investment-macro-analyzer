-- Create api_keys table for storing external provider keys
CREATE TABLE IF NOT EXISTS api_keys (
    provider TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial empty/placeholder rows if needed (Optional)
-- INSERT OR IGNORE INTO api_keys (provider, key) VALUES ('FRED', '');
-- INSERT OR IGNORE INTO api_keys (provider, key) VALUES ('EIA', '');
-- INSERT OR IGNORE INTO api_keys (provider, key) VALUES ('FINNHUB', '');
