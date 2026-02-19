use tauri::State;
use sqlx::SqlitePool;
use crate::db;
use crate::fetcher;

#[tauri::command]
pub async fn sync_finnhub_calendar(pool: State<'_, SqlitePool>) -> Result<String, String> {
    // 1. Get Finnhub API Key
    let api_key = db::get_api_key_v2(&pool, "FINNHUB")
        .await
        .map_err(|e| format!("Finnhub Key Missing: {}", e))?;
    
    if api_key.is_empty() {
        return Err("Finnhub API Key is not set in Settings.".to_string());
    }

    let fetcher = fetcher::calendar::CalendarFetcher::new(api_key);
    
    // 2. Define Range: 3 days ago to 14 days from now
    let now = chrono::Utc::now();
    let from = (now - chrono::Duration::days(3)).format("%Y-%m-%d").to_string();
    let to = (now + chrono::Duration::days(14)).format("%Y-%m-%d").to_string();
    
    println!("Syncing Market Calendar from {} to {}...", from, to);

    // 3. Fetch Earnings
    let earnings = fetcher.fetch_earnings(&from, &to).await.map_err(|e| e.to_string())?;
    for e in earnings {
        let id = format!("earnings_{}_{}", e.symbol, e.date);
        let data_json = serde_json::to_string(&e).unwrap_or_default();
        let record = db::MarketEventRecord {
            id,
            event_type: "earnings".to_string(),
            symbol: e.symbol,
            event_date: e.date,
            event_time: Some(e.event_time),
            data_json,
            source: "Finnhub".to_string(),
        };
        db::save_market_event(&pool, record).await.map_err(|err| err.to_string())?;
    }

    // 4. Fetch IPOs
    let ipos = fetcher.fetch_ipos(&from, &to).await.map_err(|e| e.to_string())?;
    for i in ipos {
        let id = format!("ipo_{}_{}", i.symbol, i.date);
        let data_json = serde_json::to_string(&i).unwrap_or_default();
        let record = db::MarketEventRecord {
            id,
            event_type: "ipo".to_string(),
            symbol: i.symbol,
            event_date: i.date,
            event_time: None,
            data_json,
            source: "Finnhub".to_string(),
        };
        db::save_market_event(&pool, record).await.map_err(|err| err.to_string())?;
    }

    Ok("Synced events".to_string())
}

#[tauri::command]
pub async fn get_market_calendar(pool: State<'_, SqlitePool>, from: String, to: String) -> Result<Vec<db::MarketEventRecord>, String> {
    db::get_market_events(&pool, &from, &to).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_earnings_history(pool: State<'_, SqlitePool>, symbol: String) -> Result<Vec<fetcher::calendar::EarningsHistoryEvent>, String> {
    // 1. Check Cache
    let cached = db::get_earnings_history(&pool, &symbol).await.map_err(|e| e.to_string())?;
    
    if let Some(record) = cached {
        // Check if stale (> 24h)
        let history: Vec<fetcher::calendar::EarningsHistoryEvent> = serde_json::from_str(&record.data_json)
            .map_err(|e| format!("Failed to parse cached history: {}", e))?;
        
        if !history.is_empty() {
            return Ok(history);
        }
    }

    // 2. Cache Miss or Empty -> Fetch from Finnhub
    let api_key = db::get_api_key_v2(&pool, "FINNHUB")
        .await
        .map_err(|e| format!("Finnhub Key Missing: {}", e))?;
    
    if api_key.is_empty() {
        return Err("Finnhub API Key is not set in Settings.".to_string());
    }

    let fetcher = fetcher::calendar::CalendarFetcher::new(api_key);
    let history = fetcher.fetch_earnings_history(&symbol).await.map_err(|e| e.to_string())?;

    // 3. Save to Cache
    let data_json = serde_json::to_string(&history).unwrap_or_default();
    db::save_earnings_history(&pool, &symbol, &data_json).await.map_err(|e| e.to_string())?;

    Ok(history)
}
