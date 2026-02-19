use sqlx::sqlite::{SqlitePoolOptions, SqlitePool};
use sqlx::Row;
use anyhow::Result;
use std::path::Path;

pub async fn init(data_dir: &Path) -> Result<SqlitePool> {
    let db_path = data_dir.join("indicators.db");
    let database_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());
    
    println!("Connecting to SQLite database: {}", database_url);
    
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;
        
    println!("Running migrations...");
    sqlx::migrate!("./migrations").run(&pool).await?;
    
    println!("Database initialized successfully.");
    Ok(pool)
}

pub async fn save_historical_data(
    pool: &SqlitePool, 
    indicator_slug: &str, 
    data: Vec<crate::models::DataPoint>,
    source: &str,
    category: &str
) -> Result<()> {
    // 1. Get indicator ID (or ensure it exists)
    let indicator = sqlx::query(
        "SELECT id FROM indicators WHERE slug = $1"
    )
    .bind(indicator_slug)
    .fetch_optional(pool)
    .await?;

    let indicator_id = match indicator {
        Some(record) => record.try_get("id")?,
        None => {
            // Auto-create indicator if not exists with provided metadata
            let name = indicator_slug.to_uppercase(); // Simple default name
            let rec = sqlx::query(
                "INSERT INTO indicators (slug, name, category, source) VALUES ($1, $2, $3, $4) RETURNING id"
            )
            .bind(indicator_slug)
            .bind(name)
            .bind(category)
            .bind(source)
            .fetch_one(pool)
            .await?;
            let indicator_id: i64 = rec.try_get("id")?;
            indicator_id
        }
    };

    // 2. Bulk Insert (or loop for simplicity in MVP)
    // Using transaction for safety
    let mut tx = pool.begin().await?;

    for point in data {
        sqlx::query(
            "INSERT INTO historical_data (indicator_id, timestamp, value)
             VALUES ($1, $2, $3)
             ON CONFLICT (indicator_id, timestamp) DO UPDATE
             SET value = EXCLUDED.value"
        )
        .bind(indicator_id)
        .bind(point.timestamp)
        .bind(point.value)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn update_indicator_status(
    pool: &SqlitePool,
    indicator_slug: &str,
    status: &str,
    error: Option<&str>
) -> Result<()> {
    // If success, update last_updated_at to NOW()
    // If error/updating, leave last_updated_at alone (or update if needed)
    
    let now = if status == "success" {
        Some(chrono::Utc::now())
    } else {
        None
    };

    if let Some(timestamp) = now {
        sqlx::query(
            "UPDATE indicators 
             SET update_status = $1, error_message = $2, last_updated_at = $3 
             WHERE slug = $4"
        )
        .bind(status)
        .bind(error)
        .bind(timestamp)
        .bind(indicator_slug)
        .execute(pool)
        .await?;
    } else {
        sqlx::query(
            "UPDATE indicators 
             SET update_status = $1, error_message = $2 
             WHERE slug = $3"
        )
        .bind(status)
        .bind(error)
        .bind(indicator_slug)
        .execute(pool)
        .await?;
    }

    Ok(())
}

pub async fn save_tos_status(pool: &SqlitePool, version: &str, accepted: bool) -> Result<()> {
    let accepted_str = if accepted { "true" } else { "false" };
    // Reuse the existing 'settings' table (key, value)
    // Key: "TOS_ACCEPTED_VERSION" -> "v2"
    // Key: "TOS_ACCEPTED_TIMESTAMP" -> ISO string
    
    if accepted {
        let now = chrono::Utc::now().to_rfc3339();
        
        sqlx::query("INSERT INTO settings (key, value) VALUES ('TOS_ACCEPTED_VERSION', $1) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value")
            .bind(version)
            .execute(pool)
            .await?;
            
        sqlx::query("INSERT INTO settings (key, value) VALUES ('TOS_ACCEPTED_TIMESTAMP', $1) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value")
            .bind(now)
            .execute(pool)
            .await?;
    }

    Ok(())
}

pub async fn get_tos_status(pool: &SqlitePool) -> Result<Option<String>> {
    let row = sqlx::query("SELECT value FROM settings WHERE key = 'TOS_ACCEPTED_VERSION'")
        .fetch_optional(pool)
        .await?;

    Ok(row.map(|r| r.get("value")))
}


pub async fn get_stale_indicators(pool: &SqlitePool) -> Result<Vec<(String, String)>> {
    // 1. Fetch metadata for all indicators
    let records = sqlx::query(
        "SELECT slug, source, last_updated_at, refresh_interval FROM indicators"
    )
    .fetch_all(pool)
    .await?;

    let mut results = Vec::new();
    let now = chrono::Utc::now();

    for row in records {
        let slug: String = row.try_get("slug").unwrap_or_default();
        let source: String = row.try_get("source").unwrap_or_else(|_| "FRED".to_string());
        let last_updated: Option<chrono::DateTime<chrono::Utc>> = row.try_get("last_updated_at").ok();
        let refresh_str: String = row.try_get("refresh_interval").unwrap_or_else(|_| "1440m".to_string());

        // Parse refresh_interval (e.g., "60m")
        let minutes: i64 = refresh_str
            .trim_end_matches('m')
            .parse()
            .unwrap_or(1440); // Default to 24h if parse fails

        match last_updated {
            Some(last_time) => {
                // Calculate elapsed time
                let duration = now.signed_duration_since(last_time);
                if duration.num_minutes() >= minutes {
                    results.push((slug, source));
                }
            },
            None => {
                // Never updated -> Stale
                results.push((slug, source));
            }
        }
    }

    Ok(results)
}

pub async fn save_setting(pool: &SqlitePool, key: &str, value: &str) -> Result<()> {
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP"
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_setting(pool: &SqlitePool, key: &str) -> Result<String> {
    use sqlx::Row;
    let row = sqlx::query("SELECT value FROM settings WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await?;
    
    match row {
        Some(record) => Ok(record.try_get("value").unwrap_or_default()),
        None => Ok("".to_string())
    }
}

pub async fn save_api_key_v2(pool: &SqlitePool, provider: &str, key: &str) -> Result<()> {
    // 1. Ensure api_keys table exists (it should via migration, but just in case)
    // 2. Upsert
    
    // We use the `api_keys` table created in migration 20260207000002
    sqlx::query(
        "INSERT INTO api_keys (provider, key) VALUES ($1, $2)
         ON CONFLICT (provider) DO UPDATE SET key = EXCLUDED.key, updated_at = CURRENT_TIMESTAMP"
    )
    .bind(provider)
    .bind(key)
    .execute(pool)
    .await?;
    
    Ok(())
}

pub async fn get_api_key_v2(pool: &SqlitePool, provider: &str) -> Result<String> {
    use sqlx::Row;
    let row = sqlx::query("SELECT key FROM api_keys WHERE provider = $1")
        .bind(provider)
        .fetch_optional(pool)
        .await?;
    
    match row {
        Some(record) => Ok(record.try_get("key").unwrap_or_default()),
        None => Ok("".to_string())
    }
}

// Time Machine Query: Get value of all indicators at a specific timestamp
pub async fn get_history_snapshot(pool: &SqlitePool, target_date: chrono::NaiveDateTime) -> Result<Vec<(String, f64, String)>> {
    // Select the latest value on or before the target_date for EACH indicator
    // Using a correlated subquery or window function
    // Output: (slug, value, category)
    
    let rows = sqlx::query(
        r#"
        SELECT 
            i.slug,
            h.value,
            i.category
        FROM indicators i
        JOIN historical_data h ON i.id = h.indicator_id
        WHERE h.timestamp = (
            SELECT MAX(h2.timestamp)
            FROM historical_data h2
            WHERE h2.indicator_id = i.id
            AND h2.timestamp <= $1
        )
        "#
    )
    .bind(target_date)
    .fetch_all(pool)
    .await?;

    let mut result = Vec::new();
    for row in rows {
        let slug: String = row.try_get("slug")?;
        let value: f64 = row.try_get("value")?;
        let category: String = row.try_get("category")?;
        result.push((slug, value, category));
    }

    Ok(result)
}

/// Fetch all historical data for a given indicator slug
pub async fn get_historical_data(pool: &SqlitePool, indicator_slug: &str) -> Result<Vec<crate::models::DataPoint>> {
    let rows = sqlx::query_as::<_, crate::models::DataPoint>(
        r#"
        SELECT h.timestamp, h.value
        FROM historical_data h
        JOIN indicators i ON h.indicator_id = i.id
        WHERE i.slug = $1
        ORDER BY h.timestamp ASC
        "#
    )
    .bind(indicator_slug)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn seed_fng_history(pool: &SqlitePool) -> Result<usize> {
    println!("Seeding Fear & Greed History from CSVs...");
    
    let mut points = Vec::new();

    // 1. History Data
    let history_csv = include_str!("data/fng_history.csv");
    for line in history_csv.lines() {
        if line.starts_with("Date") { continue; }
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() < 2 { continue; }
        
        let date_str = parts[0].trim().replace(".", "-");
        let val_str = parts[1].trim();
        
        if let (Ok(date), Ok(val)) = (
            chrono::NaiveDate::parse_from_str(&date_str, "%Y-%m-%d"),
            val_str.parse::<f64>()
        ) {
            let timestamp = date.and_hms_opt(0, 0, 0).unwrap().and_utc();
            points.push(crate::models::DataPoint { timestamp, value: val });
        }
    }

    // 2. Recent Data (Try Runtime Load first, then Embedded)
    let runtime_path = Path::new("../docs/fng_recent.csv");
    let recent_csv_content = if runtime_path.exists() {
        println!("Loading FNG Recent Data from local file: {:?}", runtime_path);
        std::fs::read_to_string(runtime_path).unwrap_or_else(|_| include_str!("data/fng_recent.csv").to_string())
    } else {
        include_str!("data/fng_recent.csv").to_string()
    };

    for line in recent_csv_content.lines() {
        if line.starts_with("Date") { continue; }
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() < 2 { continue; }
        
        let date_str = parts[0].trim().replace(".", "-");
        let val_str = parts[1].trim();
        
        if let (Ok(date), Ok(val)) = (
            chrono::NaiveDate::parse_from_str(&date_str, "%Y-%m-%d"),
            val_str.parse::<f64>()
        ) {
            let timestamp = date.and_hms_opt(0, 0, 0).unwrap().and_utc();
            points.push(crate::models::DataPoint { timestamp, value: val });
        }
    }
    
    if points.is_empty() {
        return Ok(0);
    }

    let count = points.len();
    println!("Parsed {} FNG data points (History + Recent). Saving to DB...", count);
    
    save_historical_data(pool, "fear_greed_index", points, "Alternative", "Risk").await?;
    
    Ok(count)
}

pub async fn get_all_indicators(pool: &SqlitePool) -> Result<Vec<crate::models::Indicator>> {
    sqlx::query_as::<_, crate::models::Indicator>(
        r#"
        SELECT 
            id, slug, name, category, description, refresh_interval, source, is_active, created_at, 
            last_updated_at as updated_at,
            update_status, error_message
        FROM indicators
        ORDER BY category, name
        "#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| anyhow::anyhow!(e))
}

// =====================================================================
// API RATE LIMIT TRACKER
// =====================================================================

/// increments usage counter for the specific key (e.g. "TIINGO_USAGE_2026-02-05_14")
pub async fn increment_api_usage(pool: &SqlitePool, key: &str) -> Result<()> {
    // Upsert logic: If exists increment, else insert 1
    // SQLite upsert: INSERT ... ON CONFLICT ...
    
    // Check if exists
    let exists = sqlx::query("SELECT value FROM settings WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await?;

    if let Some(row) = exists {
        let current_val: String = row.try_get("value")?;
        let count: i64 = current_val.parse().unwrap_or(0);
        
        sqlx::query("UPDATE settings SET value = $1 WHERE key = $2")
            .bind((count + 1).to_string())
            .bind(key)
            .execute(pool)
            .await?;
    } else {
        sqlx::query("INSERT INTO settings (key, value) VALUES ($1, '1')")
            .bind(key)
            .execute(pool)
            .await?;
    }
    
    Ok(())
}

/// Checks if usage is within limit
pub async fn check_api_limit(pool: &SqlitePool, key: &str, limit: i64) -> Result<bool> {
    let row = sqlx::query("SELECT value FROM settings WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await?;

    match row {
        Some(record) => {
            let val_str: String = record.try_get("value")?;
            let count: i64 = val_str.parse().unwrap_or(0);
            Ok(count < limit)
        },
        None => Ok(true) // No usage record yet = Safe
    }
}

/// Gets current usage for key
pub async fn get_api_usage(pool: &SqlitePool, key: &str) -> Result<i64> {
    let row = sqlx::query("SELECT value FROM settings WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await?;

    if let Some(record) = row {
        let val_str: String = record.try_get("value")?;
        Ok(val_str.parse().unwrap_or(0))
    } else {
        Ok(0)
    }
}

// =====================================================================
// MARKET CALENDAR (Earnings & IPO)
// =====================================================================

#[derive(Debug, serde::Serialize)]
pub struct MarketEventRecord {
    pub id: String,
    pub event_type: String,
    pub symbol: String,
    pub event_date: String,
    pub event_time: Option<String>,
    pub data_json: String,
    pub source: String,
}

pub async fn save_market_event(pool: &SqlitePool, record: MarketEventRecord) -> Result<()> {
    sqlx::query(
        "INSERT INTO market_events (id, event_type, symbol, event_date, event_time, data_json, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
            event_time = EXCLUDED.event_time,
            data_json = EXCLUDED.data_json,
            source = EXCLUDED.source"
    )
    .bind(record.id)
    .bind(record.event_type)
    .bind(record.symbol)
    .bind(record.event_date)
    .bind(record.event_time)
    .bind(record.data_json)
    .bind(record.source)
    .execute(pool)
    .await?;
    
    Ok(())
}

pub async fn get_market_events(pool: &SqlitePool, from_date: &str, to_date: &str) -> Result<Vec<MarketEventRecord>> {
    let rows = sqlx::query(
        "SELECT id, event_type, symbol, event_date, event_time, data_json, source
         FROM market_events
         WHERE event_date BETWEEN $1 AND $2
         ORDER BY event_date ASC, symbol ASC"
    )
    .bind(from_date)
    .bind(to_date)
    .fetch_all(pool)
    .await?;

    let mut results = Vec::new();
    for row in rows {
        results.push(MarketEventRecord {
            id: row.try_get("id")?,
            event_type: row.try_get("event_type")?,
            symbol: row.try_get("symbol")?,
            event_date: row.try_get("event_date")?,
            event_time: row.try_get("event_time").ok(),
            data_json: row.try_get("data_json")?,
            source: row.try_get("source")?,
        });
    }

    Ok(results)
}

// =====================================================================
// EARNINGS HISTORY CACHE (4 Quarters)
// =====================================================================

pub struct EarningsHistoryRecord {
    pub symbol: String,
    pub data_json: String,
    pub last_updated: String,
}

pub async fn save_earnings_history(pool: &SqlitePool, symbol: &str, data_json: &str) -> Result<()> {
    sqlx::query(
        "INSERT INTO earnings_history (symbol, data_json, last_updated)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (symbol) DO UPDATE SET
            data_json = EXCLUDED.data_json,
            last_updated = CURRENT_TIMESTAMP"
    )
    .bind(symbol)
    .bind(data_json)
    .execute(pool)
    .await?;
    
    Ok(())
}

pub async fn get_earnings_history(pool: &SqlitePool, symbol: &str) -> Result<Option<EarningsHistoryRecord>> {
    let row = sqlx::query(
        "SELECT symbol, data_json, last_updated
         FROM earnings_history
         WHERE symbol = $1"
    )
    .bind(symbol)
    .fetch_optional(pool)
    .await?;

    if let Some(r) = row {
        Ok(Some(EarningsHistoryRecord {
            symbol: r.try_get("symbol")?,
            data_json: r.try_get("data_json")?,
            last_updated: r.try_get("last_updated")?,
        }))
    } else {
        Ok(None)
    }
}

// =====================================================================
// GUMROAD LICENSE KEY
// =====================================================================

pub async fn save_license_key(pool: &SqlitePool, key: &str, status: &str) -> Result<()> {
    // 1. Save Key
    sqlx::query("INSERT INTO settings (key, value) VALUES ('LICENSE_KEY', $1) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value")
        .bind(key)
        .execute(pool)
        .await?;

    // 2. Save Status
    sqlx::query("INSERT INTO settings (key, value) VALUES ('LICENSE_STATUS', $1) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value")
        .bind(status)
        .execute(pool)
        .await?;
        
    Ok(())
}

pub async fn get_license_key(pool: &SqlitePool) -> Result<Option<String>> {
    let row = sqlx::query("SELECT value FROM settings WHERE key = 'LICENSE_KEY'")
        .fetch_optional(pool)
        .await?;

    if let Some(r) = row {
        let key: String = r.try_get("value")?;
        if key.is_empty() {
            Ok(None)
        } else {
            Ok(Some(key))
        }
    } else {
        Ok(None)
    }
}
