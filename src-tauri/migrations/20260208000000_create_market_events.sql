-- Create a table to store earnings and IPO events
CREATE TABLE market_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL, -- 'earnings', 'ipo'
    symbol TEXT NOT NULL,
    event_date TEXT NOT NULL, -- YYYY-MM-DD
    event_time TEXT,          -- hour, or 'am', 'pm' (often for earnings)
    data_json TEXT,           -- Extra fields like EPS estimate, revenue, IPO price, etc.
    source TEXT DEFAULT 'Finnhub',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_market_event_date ON market_events(event_date);
CREATE INDEX idx_market_event_type ON market_events(event_type);
