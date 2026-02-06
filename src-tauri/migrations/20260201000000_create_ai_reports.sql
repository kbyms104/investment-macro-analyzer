CREATE TABLE IF NOT EXISTS ai_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    referenced_indicators TEXT NOT NULL, -- Stored as JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_reports_created_at ON ai_reports(created_at DESC);
