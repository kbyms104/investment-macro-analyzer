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

    // 2. Recent Data
    let recent_csv = include_str!("data/fng_recent.csv");
    for line in recent_csv.lines() {
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
