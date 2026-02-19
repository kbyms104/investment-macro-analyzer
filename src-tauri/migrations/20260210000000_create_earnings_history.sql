-- Migration to create earnings_history table for caching 4-quarter history

CREATE TABLE IF NOT EXISTS earnings_history (
    symbol TEXT PRIMARY KEY,
    data_json TEXT NOT NULL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster symbol lookups (redundant but good practice)
CREATE INDEX IF NOT EXISTS idx_earnings_history_symbol ON earnings_history(symbol);
