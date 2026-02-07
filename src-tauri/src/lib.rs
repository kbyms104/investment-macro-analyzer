use tauri::State;
use sqlx::SqlitePool;
use analysis::technicals::TechnicalSignals;

#[tauri::command]
async fn fetch_fred_data(pool: State<'_, SqlitePool>, api_key: String, series_id: String) -> Result<Vec<models::DataPoint>, String> {
    let fetcher = FredFetcher::new(api_key, false);
    let data = fetcher.fetch_data(&series_id).await.map_err(|e| e.to_string())?;
    
    // Save to DB
    db::save_historical_data(&pool, &series_id, data.clone(), "FRED", "Macro")
        .await
        .map_err(|e| format!("Failed to save to DB: {}", e))?;
        
    Ok(data)
}

// Yahoo fetch removed
// #[tauri::command]
// async fn fetch_yahoo_data...

#[tauri::command]
async fn calculate_indicator(pool: State<'_, SqlitePool>, api_key: String, slug: String, backfill: bool) -> Result<Vec<models::DataPoint>, String> {
    // 1. Identify Source for Rate Limiting
    let metadata = crate::indicators::registry::Registry::get_metadata(&slug);
    let source = metadata.map(|m| m.source).unwrap_or(crate::indicators::registry::SourceType::Fred); // Default safe assumption
    
    let source_str = match source {
        crate::indicators::registry::SourceType::Fred => "FRED",
        crate::indicators::registry::SourceType::Tiingo => "Tiingo",
        // crate::indicators::registry::SourceType::Upbit => "Upbit",
        crate::indicators::registry::SourceType::Binance => "Binance",
        _ => "Calculated",
    };

    // 2. Throttle BEFORE making the request (Safety First)
    if source_str != "Calculated" {
        core::rate_limiter::RateLimiter::wait(source_str).await;
    }

    core::orchestrator::calculate_and_save(&pool, &api_key, &slug, backfill, true).await
}

#[tauri::command]
async fn save_api_key(pool: State<'_, SqlitePool>, api_key: String) -> Result<(), String> {
    db::save_setting(&pool, "FRED_API_KEY", &api_key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_api_key(pool: State<'_, SqlitePool>) -> Result<String, String> {
    use sqlx::Row;
    let row = sqlx::query("SELECT value FROM settings WHERE key = $1")
        .bind("FRED_API_KEY")
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    match row {
        Some(record) => Ok(record.try_get("value").unwrap_or_default()),
        None => Ok("".to_string())
    }
}

#[tauri::command]
async fn save_tiingo_api_key(pool: State<'_, SqlitePool>, api_key: String) -> Result<(), String> {
    db::save_setting(&pool, "TIINGO_API_KEY", &api_key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_tiingo_api_key(pool: State<'_, SqlitePool>) -> Result<String, String> {
    db::get_setting(&pool, "TIINGO_API_KEY")
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_provider_api_key(pool: State<'_, SqlitePool>, provider: String, key: String) -> Result<(), String> {
    db::save_api_key_v2(&pool, &provider, &key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_provider_api_key(pool: State<'_, SqlitePool>, provider: String) -> Result<String, String> {
    db::get_api_key_v2(&pool, &provider)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn get_indicator_history(pool: State<'_, SqlitePool>, slug: String, range: String) -> Result<Vec<models::DataPoint>, String> {
    // 1. Determine date limit based on range
    let limit_clause = match range.as_str() {
        "1W" => "AND timestamp >= datetime('now', '-7 days')",
        "1M" => "AND timestamp >= datetime('now', '-1 month')",
        "3M" => "AND timestamp >= datetime('now', '-3 months')",
        "1Y" => "AND timestamp >= datetime('now', '-1 year')",
        "5Y" => "AND timestamp >= datetime('now', '-5 years')",
        _ => "", // ALL
    };

    // 2. Query (Deduplicated by Day)
    // We group by date and take the entry with the MAX timestamp for that day (End of Day value).
    let query_str = format!(
        r#"
        SELECT MAX(h.timestamp) as timestamp, h.value, h.metadata
        FROM historical_data h
        JOIN indicators i ON h.indicator_id = i.id
        WHERE i.slug = $1 {}
        GROUP BY strftime('%Y-%m-%d', h.timestamp)
        ORDER BY h.timestamp ASC
        "#,
        limit_clause
    );

    let rows = sqlx::query_as::<_, models::DataPoint>(&query_str)
        .bind(slug)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows)
}


#[derive(serde::Serialize)]
pub struct SnapshotItem {
    pub slug: String,
    pub value: f64,
    pub category: String,
}

#[tauri::command]
async fn get_snapshot_by_date(pool: State<'_, SqlitePool>, date_str: String) -> Result<Vec<SnapshotItem>, String> {
    // Parse "YYYY-MM-DD"
    let date = chrono::NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date format (YYYY-MM-DD): {}", e))?
        .and_hms_opt(23, 59, 59) // End of day
        .unwrap();

    let data = db::get_history_snapshot(&pool, date)
        .await
        .map_err(|e| e.to_string())?;

    let items = data.into_iter().map(|(slug, value, category)| SnapshotItem {
        slug,
        value,
        category,
    }).collect();

    Ok(items)
}

#[derive(Clone, serde::Serialize)]
struct SyncProgress {
    current: usize,
    total: usize,
    slug: String,
    status: String,
}

#[tauri::command]
async fn sync_all_history(pool: State<'_, SqlitePool>, api_key: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    
    // Phase 1: Sync Base Indicators
    // This fetches data from FRED, Yahoo, Tiingo, Binance, etc.
    let (base_success, base_fail) = core::orchestrator::batch_sync_base_indicators(&pool, &api_key, Some(&app_handle)).await;
    
    // Phase 2: Calculate Derived Indicators
    // This uses the data fetched in Phase 1 to compute Yield Curves, Buffett Indicator, etc.
    // Crucially, it does NOT fetch data again (fetch_deps=false), preventing rate limits and redundancy.
    let (calc_success, calc_fail) = core::orchestrator::batch_calculate_derived_indicators(&pool, &api_key, Some(&app_handle)).await;

    let total_success = base_success + calc_success;
    let total_fail = base_fail + calc_fail;

    Ok(format!("Synced {} indicators ({} failed)", total_success, total_fail))
}

#[tauri::command]
async fn get_market_insights(pool: State<'_, SqlitePool>) -> Result<Vec<analysis::insight::Insight>, String> {
    analysis::insight::generate_market_insights(&pool).await
}

pub mod db;
pub mod models;
pub mod fetcher;
pub mod core;
pub mod indicators;
pub mod analysis;
pub mod llm;
pub mod commands;

use tauri::Manager;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
};
use crate::fetcher::DataSource;
use crate::fetcher::fred::FredFetcher;

// Yahoo search removed
// #[tauri::command]
// async fn search_yahoo_symbol...

// ========== LLM Commands ==========

#[tauri::command]
async fn get_tiingo_usage(pool: State<'_, SqlitePool>) -> Result<(i64, i64), String> {
    let now = chrono::Local::now();
    let hour_key = format!("TIINGO_USAGE_{}", now.format("%Y-%m-%d_%H"));
    let day_key = format!("TIINGO_USAGE_{}", now.format("%Y-%m-%d"));
    
    let hour_usage = db::get_api_usage(&pool, &hour_key).await.unwrap_or(0);
    let day_usage = db::get_api_usage(&pool, &day_key).await.unwrap_or(0);
    
    Ok((hour_usage, day_usage))
}

#[tauri::command]
async fn generate_ai_report(pool: State<'_, SqlitePool>) -> Result<llm::AIReport, String> {
    llm::generate_report(&pool).await
}

#[tauri::command]
async fn get_llm_settings(pool: State<'_, SqlitePool>) -> Result<llm::LLMSettings, String> {
    llm::load_settings(&pool).await
}

#[tauri::command]
async fn save_llm_settings(pool: State<'_, SqlitePool>, settings: llm::LLMSettings) -> Result<(), String> {
    llm::save_settings(&pool, &settings).await
}

#[tauri::command]
async fn get_ai_report_history(pool: State<'_, SqlitePool>) -> Result<Vec<llm::AIReportSummary>, String> {
    llm::get_report_history(&pool).await
}

#[tauri::command]
async fn get_ai_report(pool: State<'_, SqlitePool>, id: i64) -> Result<llm::AIReport, String> {
    llm::get_report(&pool, id).await
}

#[derive(serde::Serialize)]
pub struct ConnectionTestResult {
    pub success: bool,
    pub message: String,
}

#[tauri::command]
async fn test_llm_connection(pool: State<'_, SqlitePool>) -> Result<ConnectionTestResult, String> {
    let settings = llm::load_settings(&pool).await?;
    
    match settings.provider {
        llm::LLMProviderType::OpenAI => {
            match settings.openai_api_key {
                Some(key) => {
                    match llm::openai::test_connection(&key).await {
                        Ok(true) => Ok(ConnectionTestResult { success: true, message: "OpenAI connected successfully".to_string() }),
                        Ok(false) => Ok(ConnectionTestResult { success: false, message: "OpenAI API returned error".to_string() }),
                        Err(e) => Ok(ConnectionTestResult { success: false, message: e }),
                    }
                },
                None => Ok(ConnectionTestResult { success: false, message: "OpenAI API Key not configured".to_string() }),
            }
        },
        llm::LLMProviderType::Ollama => {
            match llm::ollama::test_connection(&settings.ollama_url, &settings.ollama_model).await {
                Ok(true) => Ok(ConnectionTestResult { success: true, message: "Ollama connected successfully".to_string() }),
                Ok(false) => Ok(ConnectionTestResult { success: false, message: "Ollama connection failed".to_string() }),
                Err(e) => Ok(ConnectionTestResult { success: false, message: e }),
            }
        },
        llm::LLMProviderType::GeminiCLI => {
            match llm::gemini_cli::test_connection().await {
                Ok(true) => Ok(ConnectionTestResult { success: true, message: "Gemini CLI is installed".to_string() }),
                Ok(false) => Ok(ConnectionTestResult { success: false, message: "Gemini CLI not found".to_string() }),
                Err(e) => Ok(ConnectionTestResult { success: false, message: e }),
            }
        },
    }
}

#[tauri::command]
async fn get_indicators_list(pool: State<'_, SqlitePool>) -> Result<Vec<models::Indicator>, String> {
    db::get_all_indicators(&pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_technical_signals(pool: State<'_, SqlitePool>, slug: String) -> Result<TechnicalSignals, String> {
    // 1. Fetch historical data
    let data = db::get_historical_data(&pool, &slug).await.map_err(|e| e.to_string())?;
    
    // 2. Extract values
    let values: Vec<f64> = data.iter().map(|d| d.value).collect();
    
    // 3. Calculate signals
    Ok(analysis::technicals::calculate_signals(&slug, &values))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let data_dir = app_handle.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("./data"));
            if !data_dir.exists() {
                let _ = std::fs::create_dir_all(&data_dir);
            }
            let app_handle_for_db = app.handle().clone();
            let data_dir_for_db = data_dir.clone();

            tauri::async_runtime::block_on(async move {
                match db::init(&data_dir_for_db).await {
                    Ok(pool) => {
                        app_handle_for_db.manage(pool.clone());
                        
                        // Seed DB from Registry (Sync)
                        if let Err(e) = core::seeder::seed_registry(&pool).await {
                            eprintln!("Failed to seed registry: {}", e);
                        }

                        // Initialize Scheduler
                        let app_handle = app.handle().clone();
                        match core::scheduler::init(pool.clone(), app_handle).await {
                            Ok(sched) => {
                                app.manage(sched);
                                println!("Scheduler initialized successfully");

                                // Seed Fear & Greed History (Manual CSV)
                                if let Err(e) = db::seed_fng_history(&pool).await {
                                    eprintln!("Failed to seed FNG history: {}", e);
                                }
                            },
                            Err(e) => eprintln!("Failed to init scheduler: {}", e),
                        }
                    }
                    Err(e) => {
                        eprintln!("Error initializing database: {}", e);
                        // In a real app, might want to show a dialog or exit
                        panic!("Database initialization failed: {}", e);
                    }
                }
            });

            // System Tray Setup
            let quit_i = MenuItem::with_id(&app_handle, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(&app_handle, "show", "Show", true, None::<&str>)?;
            let menu = Menu::with_items(&app_handle, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::with_id("tray")
                .icon(app_handle.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(&app_handle)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                window.hide().unwrap();
                api.prevent_close();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            greet, 
            fetch_fred_data, 
            fetch_fred_data, 
            // fetch_yahoo_data, 
            calculate_indicator, 
            save_api_key, 
            get_api_key,
            save_tiingo_api_key,
            get_tiingo_api_key,
            save_provider_api_key,
            get_provider_api_key,
            get_indicator_history,
            // search_yahoo_symbol,
            get_indicators_list,
            analysis::calculate_correlation,
            analysis::calculate_correlation_matrix,
            analysis::calculate_ranked_correlations,
            analysis::get_multi_chart_data,
            analysis::find_optimal_lag,
            analysis::find_optimal_lag,
            analysis::market_status::calculate_market_status,
            analysis::market_status::get_risk_score_history,
            get_snapshot_by_date,
            analysis::get_market_regime,
            analysis::get_macro_heatmap,
            analysis::get_rolling_correlation,
            sync_all_history,
            get_market_insights,
            generate_ai_report,
            get_llm_settings,
            get_llm_settings,
            save_llm_settings,
            get_ai_report_history,
            get_ai_report,
            save_llm_settings,
            test_llm_connection,
            get_technical_signals,
            get_tiingo_usage,
            commands::yahoo_test::test_yahoo_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
