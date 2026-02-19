use sqlx::SqlitePool;
use crate::models::DataPoint;
use crate::fetcher::fred::FredFetcher;
use crate::fetcher::yahoo::YahooFetcher;
use crate::fetcher::tiingo::TiingoFetcher;
// use crate::fetcher::upbit::UpbitFetcher;
use crate::fetcher::binance::BinanceFetcher;
use crate::fetcher::worldbank::WorldBankFetcher; // New
use crate::fetcher::eia::EiaFetcher;             // New
// use tauri::Emitter;
use crate::fetcher::alternative::AlternativeFetcher;
use crate::fetcher::DataSource;
use crate::indicators::registry::{Registry, SourceType};
use async_recursion::async_recursion;

/// Orchestrator to calculate an indicator or fetch it from a source.
#[async_recursion]

pub async fn calculate_and_save(
    pool: &SqlitePool, 
    api_key: &str, 
    indicator_slug: &str,
    backfill: bool,
    fetch_deps: bool, // NEW: Control dependency fetching
) -> Result<Vec<DataPoint>, String> {
    
    // 1. Resolve Metadata from Registry
    let metadata = Registry::get_metadata(indicator_slug);

    // 2. Handle Logic based on Source Type
    if let Some(meta) = metadata {
        println!("Orchestrator: Processing '{}' (Source: {:?}, Backfill: {})", meta.name, meta.source, backfill);
        
        match meta.source {
            SourceType::Fred => {
                let symbol = meta.source_symbol.as_deref().unwrap_or(indicator_slug);
                return fetch_and_save_raw(pool, api_key, indicator_slug, symbol, SourceType::Fred, backfill).await;
            },
            SourceType::Yahoo => {
                let symbol = meta.source_symbol.as_deref().unwrap_or(indicator_slug);
                println!("Orchestrator: Fetching Yahoo for '{}' -> Symbol: '{}'", indicator_slug, symbol);
                return fetch_and_save_raw(pool, api_key, indicator_slug, symbol, SourceType::Yahoo, backfill).await;
            },
            SourceType::Tiingo => {
                let symbol = meta.source_symbol.as_deref().unwrap_or(indicator_slug);
                println!("  > Fetching Tiingo for '{}' -> Symbol: '{}'", indicator_slug, symbol);
                return fetch_and_save_raw(pool, api_key, indicator_slug, symbol, SourceType::Tiingo, backfill).await;
            },
            // SourceType::Upbit => {
            //     let symbol = meta.source_symbol.as_deref().unwrap_or(indicator_slug);
            //     return fetch_and_save_raw(pool, api_key, indicator_slug, symbol, SourceType::Upbit, backfill).await;
            // },
            SourceType::Binance => {
                let symbol = meta.source_symbol.as_deref().unwrap_or(indicator_slug);
                println!("  > Fetching Binance for '{}' -> Symbol: '{}'", indicator_slug, symbol);
                return fetch_and_save_raw(pool, api_key, indicator_slug, symbol, SourceType::Binance, backfill).await;
            },
            SourceType::Alternative => {
                let symbol = meta.source_symbol.as_deref().unwrap_or(indicator_slug);
                // Handle cases where slug is the symbol (e.g. crypto_fear_greed)
                let symbol_to_use = if symbol == indicator_slug { indicator_slug } else { symbol };
                println!("  > Fetching Alternative for '{}' -> Symbol: '{}'", indicator_slug, symbol_to_use);
                return fetch_and_save_raw(pool, api_key, indicator_slug, symbol_to_use, SourceType::Alternative, backfill).await;
            },
            SourceType::WorldBank => {
                let symbol = meta.source_symbol.as_deref().unwrap_or(indicator_slug);
                println!("  > Fetching WorldBank for '{}' -> Symbol: '{}'", indicator_slug, symbol);
                return fetch_and_save_raw(pool, api_key, indicator_slug, symbol, SourceType::WorldBank, backfill).await;
            },
            SourceType::Eia => {
                let symbol = meta.source_symbol.as_deref().unwrap_or(indicator_slug);
                println!("  > Fetching EIA for '{}' -> Symbol: '{}'", indicator_slug, symbol);
                return fetch_and_save_raw(pool, api_key, indicator_slug, symbol, SourceType::Eia, backfill).await;
            },
            SourceType::Glassnode => {
                // TODO: Implement Glassnode fetcher in Phase 5 (Requires API Key)
                println!("  > Glassnode source not yet implemented for '{}'", indicator_slug);
                return Err(format!("Glassnode fetcher not implemented for {}", indicator_slug));
            },
            SourceType::Manual => {
                // Manual data must be entered by user, skip auto-fetch
                println!("  > Manual indicator '{}' - skipping auto-fetch (requires user input)", indicator_slug);
                return Ok(vec![]);
            },
            SourceType::Calculated => {
                // Get the calculator logic
                let calculator = Registry::get_calculator(indicator_slug)
                    .ok_or_else(|| format!("Calculator implementation not found for {}", indicator_slug))?;

                // Identify dependencies
                let required_slugs = calculator.required_inputs();
                let mut inputs = Vec::new();

                println!("  > Resolving dependencies for {}: {:?}", indicator_slug, required_slugs);

                // Recursively fetch/calculate dependencies
                for req_slug in required_slugs {
                    // If fetching dependencies is disabled (Phase 2 optimization), just read from DB
                    let data = if fetch_deps {
                        println!("    -> Fetching dependency: {}", req_slug);
                        calculate_and_save(pool, api_key, req_slug, backfill, true).await?
                    } else {
                        // Just read from DB (assuming Phase 1 already populated it)
                        // This avoids rate limits and redundant calls
                        crate::db::get_historical_data(pool, req_slug).await
                            .map_err(|e| format!("Failed to read dependency {} from DB: {}", req_slug, e))?
                    };
                    inputs.push(data);
                }

                // Calculate
                let calculated_data = calculator.calculate(inputs)
                    .await
                    .map_err(|e| format!("Calculation failed for {}: {}", indicator_slug, e))?;

                // Save Result
                crate::db::save_historical_data(pool, indicator_slug, calculated_data.clone(), "System", "Calculated")
                    .await
                    .map_err(|e| format!("Failed to save calculated indicator: {}", e))?;

                println!("  > Calculation complete for {}", indicator_slug);
                return Ok(calculated_data);
            }
        }
    }

    // 3. Fallback for Unknown Indicators
    if indicator_slug.chars().any(|c| c.is_lowercase()) && !indicator_slug.contains("-") {
         println!("Orchestrator: Skipping unknown indicator '{}' (Lower case slug detected, not a valid FRED ID).", indicator_slug);
         return Err(format!("Unknown indicator '{}'. Not a valid external ID.", indicator_slug));
    }

    println!("Orchestrator: Unknown indicator '{}'. Attempting direct FRED fetch.", indicator_slug);
    fetch_and_save_raw(pool, api_key, indicator_slug, indicator_slug, SourceType::Fred, backfill).await
}

/// Helper to fetch raw data from external providers and save to DB
async fn fetch_and_save_raw(
    pool: &SqlitePool, 
    api_key: &str, 
    slug: &str, 
    source_symbol: &str, 
    source_type: SourceType,
    backfill: bool
) -> Result<Vec<DataPoint>, String> {
    
    let fetcher: Box<dyn DataSource + Send + Sync> = match source_type {
        SourceType::Fred => Box::new(FredFetcher::new(api_key.to_string(), backfill)),
        SourceType::Yahoo => Box::new(YahooFetcher::new()),
        SourceType::Tiingo => {
            // Tiingo API key from settings or fallback to FRED key (legacy behavior, but we have separate key now)
            let tiingo_key = crate::db::get_setting(pool, "TIINGO_API_KEY").await
                .unwrap_or_else(|_| "".to_string()); // Don't use FRED key as fallback, use empty if missing
            
            Box::new(TiingoFetcher::new(tiingo_key, backfill, Some(pool.clone())))
        },
        // SourceType::Upbit => Box::new(UpbitFetcher::new()),
        SourceType::Binance => {
            let binance_key = crate::db::get_setting(pool, "BINANCE_API_KEY").await.ok();
            Box::new(BinanceFetcher::new(binance_key))
        },
        SourceType::WorldBank => Box::new(WorldBankFetcher::new()),
        SourceType::Eia => {
             let eia_key = crate::db::get_api_key_v2(pool, "EIA").await.unwrap_or_default();
             Box::new(EiaFetcher::new(eia_key))
        },
        SourceType::Alternative => Box::new(AlternativeFetcher::new()),
        
        // These will be implemented in later phases
        SourceType::Manual => {
            println!("  > Manual indicator '{}' - skipping fetch.", slug);
            return Ok(vec![]);
        },
        SourceType::Glassnode => {
            return Err(format!("Source type {:?} not yet implemented for {}", source_type, slug));
        },
        SourceType::Calculated => {
            return Err(format!("Calculated indicators should not reach fetch_and_save_raw: {}", slug));
        }
    };

    let data: Vec<DataPoint> = fetcher.fetch_data(source_symbol)
        .await
        .map_err(|e| format!("Fetch failed for {} ({}): {}", slug, source_symbol, e))?;

    let source_name = match source_type {
        SourceType::Fred => "FRED",
        SourceType::Yahoo => "Yahoo",
        SourceType::Tiingo => "Tiingo",
        // SourceType::Upbit => "Upbit",
        SourceType::Binance => "Binance",
        SourceType::WorldBank => "WorldBank", // New
        SourceType::Eia => "EIA",             // New
        SourceType::Glassnode => "Glassnode",
        SourceType::Alternative => "Alternative",
        SourceType::Manual => "Manual",
        SourceType::Calculated => "Calculated",
    };

    crate::db::save_historical_data(pool, slug, data.clone(), source_name, "Macro")
        .await
        .map_err(|e| format!("Failed to save raw data: {}", e))?;

    Ok(data)
}

// ============================================================================
// BATCH HELPERS (Two-Phase Sync)
// ============================================================================

/// Phase 1: Sync all Base Indicators (Non-Calculated)
/// Returns (success_count, fail_count)
pub async fn batch_sync_base_indicators(
    pool: &SqlitePool, 
    api_key: &str,
    app_handle: Option<&tauri::AppHandle>
) -> (usize, usize) {
    use tauri::Emitter;

    let indicators = Registry::get_available_indicators();
    let base_indicators: Vec<_> = indicators.into_iter()
        .filter(|i| i.source != SourceType::Calculated && i.source != SourceType::Manual)
        .collect();
    
    let total = base_indicators.len();
    let mut success = 0;
    let mut fail = 0;

    println!("Phase 1: Syncing {} Base Indicators...", total);

    for (idx, ind) in base_indicators.iter().enumerate() {
        // Emit Progress
        if let Some(app) = app_handle {
             let _ = app.emit("sync-progress", serde_json::json!({
                "current": idx + 1,
                "total": total,
                "slug": ind.slug,
                "status": "fetching"
            }));
        }

        // Add delay for Rate Limiting
        crate::core::rate_limiter::RateLimiter::wait(match ind.source {
            SourceType::Fred => "FRED",
            SourceType::Tiingo => "Tiingo",
            SourceType::Binance => "Binance",
            _ => "Default"
        }).await;

        match calculate_and_save(pool, api_key, &ind.slug, true, true).await {
            Ok(_) => success += 1,
            Err(e) => {
                println!("Failed to sync {}: {}", ind.slug, e);
                fail += 1;
            }
        }
    }
    (success, fail)
}

/// Phase 2: Calculate all Derived Indicators
/// Uses existing DB data (fetch_deps = false)
pub async fn batch_calculate_derived_indicators(
    pool: &SqlitePool, 
    api_key: &str,
    app_handle: Option<&tauri::AppHandle>
) -> (usize, usize) {
    use tauri::Emitter;

    let indicators = Registry::get_available_indicators();
    let calc_indicators: Vec<_> = indicators.into_iter()
        .filter(|i| i.source == SourceType::Calculated)
        .collect();
    
    let total = calc_indicators.len();
    let mut success = 0;
    let mut fail = 0;

    println!("Phase 2: Calculating {} Derived Indicators...", total);

    for (idx, ind) in calc_indicators.iter().enumerate() {
        if let Some(app) = app_handle {
             let _ = app.emit("sync-progress", serde_json::json!({
                "current": idx + 1,
                "total": total,
                "slug": ind.slug,
                "status": "calculating"
            }));
        }

        // Important: fetch_deps = false (Use DB data)
        match calculate_and_save(pool, api_key, &ind.slug, true, false).await {
            Ok(_) => success += 1,
            Err(e) => {
                println!("Failed to calculate {}: {}", ind.slug, e);
                fail += 1;
            }
        }
    }
    (success, fail)
}
