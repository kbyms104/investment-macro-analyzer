-- Indicators Master Table
CREATE TABLE IF NOT EXISTS indicators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug VARCHAR(100) UNIQUE NOT NULL, 
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    refresh_interval VARCHAR(50) DEFAULT '1d',
    source VARCHAR(100),
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Historical Data (Time-series)
CREATE TABLE IF NOT EXISTS historical_data (
    indicator_id INTEGER REFERENCES indicators(id) ON DELETE CASCADE,
    timestamp DATETIME NOT NULL,
    value REAL NOT NULL,
    metadata TEXT,
    PRIMARY KEY (indicator_id, timestamp)
);

-- Index for fast time-range queries
CREATE INDEX IF NOT EXISTS idx_history_timestamp ON historical_data(timestamp);

-- Assets (for custom portfolio or specific stocks)
CREATE TABLE IF NOT EXISTS assets (
    ticker VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200),
    asset_class VARCHAR(50),
    is_active BOOLEAN DEFAULT 1
);
