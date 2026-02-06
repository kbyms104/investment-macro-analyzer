use sqlx::SqlitePool;
use crate::models::DataPoint;
use crate::fetcher::fred::FredFetcher;
use crate::fetcher::tiingo::TiingoFetcher;
// use crate::fetcher::upbit::UpbitFetcher;
use crate::fetcher::binance::BinanceFetcher;
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
    backfill: bool
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
                    let data = calculate_and_save(pool, api_key, req_slug, backfill).await?;
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

    let data = fetcher.fetch_data(source_symbol)
        .await
        .map_err(|e| format!("Fetch failed for {} ({}): {}", slug, source_symbol, e))?;

    let source_name = match source_type {
        SourceType::Fred => "FRED",
        SourceType::Tiingo => "Tiingo",
        // SourceType::Upbit => "Upbit",
        SourceType::Binance => "Binance",
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
