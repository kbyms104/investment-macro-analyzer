-- Risk Score History Table
-- Stores daily calculated risk scores for historical charting

CREATE TABLE IF NOT EXISTS risk_score_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    risk_score INTEGER NOT NULL,
    status_key TEXT NOT NULL,
    key_driver TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast date-range queries
CREATE INDEX IF NOT EXISTS idx_risk_score_timestamp ON risk_score_history(timestamp DESC);
