use serde::Serialize;
use sqlx::{SqlitePool, Row};
use crate::models::DataPoint;

#[derive(Debug, Serialize)]
pub struct MarketStatus {
    pub risk_score: i32, // 0 (Safe) to 100 (Extreme Risk)
    pub status_key: String, // Translation key: "risk_on_aggressive", "caution", "risk_off"
    pub status_label: String, // English fallback: "Risk On (Aggressive)"
    pub key_driver: String, // Main driver slug for frontend translation
    pub drivers: Vec<RiskDriver>,
    pub summary: String, // English fallback summary
}

#[derive(Debug, Serialize)]
pub struct RiskDriver {
    pub name: String,
    pub value: f64,
    pub signal: String, // "Bullish", "Bearish", "Neutral"
    pub contribution: i32, // How much this added to risk score
}

use tauri::State;



#[tauri::command]
pub async fn calculate_market_status(pool: State<'_, SqlitePool>) -> Result<MarketStatus, String> {
    let mut score = 0;
    let mut drivers = Vec::new();

    // 1. Yield Curve (10Y - 2Y)
    // Inversion is the biggest recession predictor.
    // Query: Latest value
    let yield_curve = get_latest_value(&pool, "yield_curve_10y_2y").await;
    if let Some(val) = yield_curve {
        if val < -0.5 {
            score += 40;
            drivers.push(RiskDriver {
                name: "Yield Curve (10Y-2Y)".to_string(),
                value: val,
                signal: "Deep Inversion".to_string(),
                contribution: 40,
            });
        } else if val < 0.0 {
            score += 20;
            drivers.push(RiskDriver {
                name: "Yield Curve (10Y-2Y)".to_string(),
                value: val,
                signal: "Inverted".to_string(),
                contribution: 20,
            });
        } else {
            drivers.push(RiskDriver {
                name: "Yield Curve".to_string(),
                value: val,
                signal: "Normal".to_string(),
                contribution: 0,
            });
        }
    }

    // 2. VIX (Volatility)
    // > 30 is panic, < 15 is complacent
    let vix = get_latest_value(&pool, "vix").await;
    if let Some(val) = vix {
        if val > 30.0 {
            score += 30;
            drivers.push(RiskDriver {
                name: "VIX (Fear Index)".to_string(),
                value: val,
                signal: "Panic".to_string(),
                contribution: 30,
            });
        } else if val > 20.0 {
            score += 10;
            drivers.push(RiskDriver {
                name: "VIX".to_string(),
                value: val,
                signal: "Elevated".to_string(),
                contribution: 10,
            });
        } else {
            drivers.push(RiskDriver {
                name: "VIX".to_string(),
                value: val,
                signal: "Normal".to_string(),
                contribution: 0,
            });
        }
    }

    // 3. Buffett Indicator (Valuation)
    // > 150% is expensive
    let buffett = get_latest_value(&pool, "buffett_indicator").await;
    if let Some(val) = buffett {
        if val > 180.0 { // Percentage
            score += 20;
            drivers.push(RiskDriver {
                name: "Buffett Indicator".to_string(),
                value: val,
                signal: "Overvalued".to_string(),
                contribution: 20,
            });
        } else {
            drivers.push(RiskDriver {
                name: "Buffett Indicator".to_string(),
                value: val,
                signal: "Fair/Undervalued".to_string(),
                contribution: 0,
            });
        }
    }

    // 4. Momentum (S&P 500 vs 200 SMA)
    // S&P 500 below 200-day moving average is a major technical warning.
    let (last_spx, sma_200) = get_spx_momentum(&pool).await;
    if let (Some(price), Some(sma)) = (last_spx, sma_200) {
        if price < sma {
            score += 30;
            drivers.push(RiskDriver {
                name: "S&P 500 Momentum".to_string(),
                value: price,
                signal: "Below 200MA (Bearish)".to_string(),
                contribution: 30,
            });
        } else {
            drivers.push(RiskDriver {
                name: "S&P 500 Momentum".to_string(),
                value: price,
                signal: "Above 200MA (Bullish)".to_string(),
                contribution: 0,
            });
        }
    }

    // 5. High Yield Spread (Credit Risk)
    // Widening spreads indicate credit stress and risk-off sentiment
    let hy_spread = get_latest_value(&pool, "hy_spread").await;
    if let Some(val) = hy_spread {
        if val > 6.0 {
            score += 25;
            drivers.push(RiskDriver {
                name: "High Yield Spread".to_string(),
                value: val,
                signal: "Credit Stress".to_string(),
                contribution: 25,
            });
        } else if val > 4.0 {
            score += 10;
            drivers.push(RiskDriver {
                name: "High Yield Spread".to_string(),
                value: val,
                signal: "Elevated".to_string(),
                contribution: 10,
            });
        } else {
            drivers.push(RiskDriver {
                name: "High Yield Spread".to_string(),
                value: val,
                signal: "Normal".to_string(),
                contribution: 0,
            });
        }
    }

    // 6. ISM Manufacturing PMI (Economic Leading Indicator)
    // Below 50 = contraction, below 45 = severe contraction
    let ism_pmi = get_latest_value(&pool, "ism_pmi").await;
    if let Some(val) = ism_pmi {
        if val < 45.0 {
            score += 20;
            drivers.push(RiskDriver {
                name: "ISM Manufacturing".to_string(),
                value: val,
                signal: "Severe Contraction".to_string(),
                contribution: 20,
            });
        } else if val < 50.0 {
            score += 10;
            drivers.push(RiskDriver {
                name: "ISM Manufacturing".to_string(),
                value: val,
                signal: "Contraction".to_string(),
                contribution: 10,
            });
        } else {
            drivers.push(RiskDriver {
                name: "ISM Manufacturing".to_string(),
                value: val,
                signal: "Expansion".to_string(),
                contribution: 0,
            });
        }
    }

    // Cap score at 100
    score = score.min(100);

    let (status_key, status_label) = if score >= 60 {
        ("risk_off".to_string(), "Risk Off (Defensive)".to_string())
    } else if score >= 30 {
        ("caution".to_string(), "Caution (Neutral)".to_string())
    } else if score >= 15 {
        ("risk_on_medium".to_string(), "Risk On (Moderate)".to_string())
    } else {
        ("risk_on_aggressive".to_string(), "Risk On (Aggressive)".to_string())
    };

    let key_driver = drivers.get(0).map(|d| d.name.clone()).unwrap_or("unknown".to_string());

    let summary = format!(
        "Market Risk Score is {}. Key drivers are {}. Investment strategy should align with {} mode.",
        score,
        key_driver,
        status_label
    );

    // Save risk score to history
    let _ = save_risk_score_history(&pool, score, &status_key, &key_driver).await;

    Ok(MarketStatus {
        risk_score: score,
        status_key,
        status_label,
        key_driver,
        drivers,
        summary,
    })
}

/// Save risk score to history table (one entry per day max)
async fn save_risk_score_history(
    pool: &SqlitePool,
    score: i32,
    status_key: &str,
    key_driver: &str,
) -> Result<(), sqlx::Error> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    
    let today_start = now - (now % 86400); // Midnight UTC today
    
    // Check if we already have an entry for today
    let existing: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM risk_score_history WHERE timestamp >= ? LIMIT 1"
    )
    .bind(today_start)
    .fetch_optional(pool)
    .await?;
    
    if existing.is_none() {
        // Insert new daily record
        sqlx::query(
            "INSERT INTO risk_score_history (timestamp, risk_score, status_key, key_driver) VALUES (?, ?, ?, ?)"
        )
        .bind(now)
        .bind(score)
        .bind(status_key)
        .bind(key_driver)
        .execute(pool)
        .await?;
    }
    
    Ok(())
}

async fn get_latest_value(pool: &SqlitePool, slug: &str) -> Option<f64> {
    sqlx::query("SELECT value FROM historical_data WHERE indicator_id = (SELECT id FROM indicators WHERE slug = ?) ORDER BY timestamp DESC LIMIT 1")
        .bind(slug)
        .fetch_optional(pool)
        .await
        .ok()?
        .map(|row| row.try_get("value").ok())?
}

async fn get_spx_momentum(pool: &SqlitePool) -> (Option<f64>, Option<f64>) {
    // This is simplified. In a real app, we'd calculate SMA-200 from DB.
    // For now, let's try to get the latest price and a calculated SMA if available.
    let price = get_latest_value(pool, "spx").await;
    
    // We'll calculate a simple average of last 200 points for SMA
    let sma = sqlx::query(
        "SELECT AVG(value) FROM (SELECT value FROM historical_data WHERE indicator_id = (SELECT id FROM indicators WHERE slug = 'spx') ORDER BY timestamp DESC LIMIT 200)"
    )
    .fetch_one(pool)
    .await
    .ok()
    .and_then(|row| row.try_get::<f64, _>(0).ok());

    (price, sma)
}

/// Risk score history data point for frontend charting
#[derive(Debug, Serialize)]
pub struct RiskScorePoint {
    pub timestamp: i64,
    pub risk_score: i32,
    pub status_key: String,
}

/// Get risk score history for the specified number of days
#[tauri::command]
pub async fn get_risk_score_history(
    pool: State<'_, SqlitePool>,
    days: Option<u32>,
) -> Result<Vec<RiskScorePoint>, String> {
    let days = days.unwrap_or(365); // Default 1 year
    let cutoff = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64 - (days as i64 * 86400);

    let rows: Vec<(i64, i32, String)> = sqlx::query_as(
        "SELECT timestamp, risk_score, status_key FROM risk_score_history WHERE timestamp >= ? ORDER BY timestamp ASC"
    )
    .bind(cutoff)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(timestamp, risk_score, status_key)| {
        RiskScorePoint { timestamp, risk_score, status_key }
    }).collect())
}

/// Backfill historical risk scores from existing indicator data
/// This calculates risk scores for each day where we have historical data
/// Backfill historical risk scores from existing indicator data
/// Uses Forward Fill logic: maintains the last known value for each indicator
/// to ensure consistent daily scoring even if some indicators don't update every day.

/// Internal function callable from scheduler (no Tauri State needed)
pub async fn backfill_risk_history_internal(pool: &SqlitePool) -> Result<u32, String> {
    // 1. Fetch all raw data points sorted by time
    // Note: historical_data.timestamp is DATETIME (TEXT), so convert to Unix epoch
    let all_data: Vec<(i64, String, f64)> = sqlx::query_as(
        r#"
        SELECT CAST(strftime('%s', h.timestamp) AS INTEGER) as ts, i.slug, h.value
        FROM historical_data h
        JOIN indicators i ON h.indicator_id = i.id
        WHERE i.slug IN ('yield_curve_10y_2y', 'vix', 'buffett_indicator', 'ism_pmi', 'hy_spread', 'spx')
        ORDER BY h.timestamp ASC
        "#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    if all_data.is_empty() {
        println!("DEBUG: No historical data found for backfill.");
        return Ok(0);
    }

    println!("DEBUG: Fetched {} rows. Starting forward-fill backfill...", all_data.len());

    // 2. Identify Time Range (but cap to 2021-01-01 to ensure SPX momentum works)
    // SPX data only available from 2021, so starting earlier fills spx_history with zeros
    let min_start_ts: i64 = 1609459200; // 2021-01-01 00:00:00 UTC
    let start_ts = all_data.first().unwrap().0.max(min_start_ts);
    let end_ts = all_data.last().unwrap().0;
    let start_day = start_ts - (start_ts % 86400);
    let end_day = end_ts - (end_ts % 86400);

    println!("DEBUG: Backfill date range: {} to {} (capped to 2021+)", start_day, end_day);

    // 3. Group data by day for efficient lookup
    use std::collections::HashMap;
    let mut data_by_day: HashMap<i64, HashMap<String, f64>> = HashMap::new();
    for (ts, slug, value) in all_data {
        let day = ts - (ts % 86400);
        data_by_day.entry(day).or_default().insert(slug, value);
    }

    // 4. Iterate Start -> End daily, maintaining last known values
    let mut current_values: HashMap<String, f64> = HashMap::new();
    let mut inserted = 0u32;

    // Use a transaction for speed
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // OPTION A: Flush all history to prevent "Ghost Data" (0-score artifacts)
    println!("DEBUG: Flushing risk_score_history table...");
    sqlx::query("DELETE FROM risk_score_history")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    
    let mut current_day = start_day;
    let mut spx_history: Vec<f64> = Vec::with_capacity(200); // For 200-day SMA calculation
    while current_day <= end_day {
        // Update current values with any new data from this day
        if let Some(day_updates) = data_by_day.get(&current_day) {
            for (slug, val) in day_updates {
                current_values.insert(slug.clone(), *val);
            }
        }

        // We need at least some data to calculate score
        if !current_values.is_empty() {
             // --- RISK CALCULATION Logic (Mirror of calculate_market_status) ---
            let mut score = 0i32;
            let mut key_driver = "unknown".to_string();

            // Yield Curve (10Y-2Y)
            if let Some(&val) = current_values.get("yield_curve_10y_2y") {
                if val < -0.5 {
                    score += 40;
                    key_driver = "Yield Curve".to_string();
                } else if val < 0.0 {
                    score += 20;
                    if key_driver == "unknown" { key_driver = "Yield Curve".to_string(); }
                }
            }

            // VIX (FIXED: 15 → 10 to match live calc)
            if let Some(&val) = current_values.get("vix") {
                if val > 30.0 {
                    score += 30;
                    if key_driver == "unknown" { key_driver = "VIX".to_string(); }
                } else if val > 20.0 {
                    score += 10; // Fixed from 15
                }
            }

            // Buffett Indicator
            if let Some(&val) = current_values.get("buffett_indicator") {
                if val > 180.0 {
                    score += 20;
                    if key_driver == "unknown" { key_driver = "Buffett Indicator".to_string(); }
                } else if val > 140.0 {
                    score += 10;
                }
            }

            // High Yield Spread
             if let Some(&val) = current_values.get("hy_spread") {
                if val > 6.0 {
                    score += 25;
                    if key_driver == "unknown" { key_driver = "High Yield Spread".to_string(); }
                } else if val > 4.0 {
                    score += 10;
                }
            }

            // ISM PMI
            if let Some(&val) = current_values.get("ism_pmi") {
                if val < 45.0 {
                    score += 20;
                     if key_driver == "unknown" { key_driver = "ISM PMI".to_string(); }
                } else if val < 50.0 {
                    score += 10;
                }
            }

            // SPX Momentum (200-day SMA check)
            // Calculate rolling 200 SMA from spx_history
            if let Some(&spx_val) = current_values.get("spx") {
                spx_history.push(spx_val);
                if spx_history.len() > 200 {
                    spx_history.remove(0);
                }
                if spx_history.len() >= 200 {
                    let sma_200: f64 = spx_history.iter().sum::<f64>() / 200.0;
                    if spx_val < sma_200 {
                        score += 30;
                        if key_driver == "unknown" { key_driver = "S&P 500 Momentum".to_string(); }
                    }
                }
            }

            score = score.min(100);

             let status_key = if score >= 60 {
                "risk_off"
            } else if score >= 30 {
                "caution"
            } else if score >= 15 {
                "risk_on_medium"
            } else {
                "risk_on_aggressive"
            };

            // UPSERT: Overwrite existing data to fix any "0" scores from previous bugs
            sqlx::query(
                "INSERT OR REPLACE INTO risk_score_history (timestamp, risk_score, status_key, key_driver) VALUES (?, ?, ?, ?)"
            )
            .bind(current_day)
            .bind(score)
            .bind(status_key)
            .bind(&key_driver)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
            
            inserted += 1;
        }

        current_day += 86400; // Next day
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    println!("DEBUG: Backfill complete. Inserted {} daily records.", inserted);
    Ok(inserted)
}

