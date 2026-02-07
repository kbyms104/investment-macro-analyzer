use tauri::{AppHandle, Manager, Emitter};
use tokio_cron_scheduler::{Job, JobScheduler};
use sqlx::{SqlitePool, Row};
use std::time::Duration;
use crate::core::orchestrator;
use crate::db;
use crate::fetcher::DataSource;

pub async fn init(pool: SqlitePool, app_handle: AppHandle) -> Result<JobScheduler, anyhow::Error> {
    let sched = JobScheduler::new().await?;
    let pool_clone = pool.clone();
    let app_handle_clone = app_handle.clone(); // Clone for scheduled job
    
    // Job: Run every 6 hours
    sched.add(
        Job::new_async("0 0 0,6,12,18 * * *", move |_uuid, _l| {
            let pool = pool_clone.clone();
            let app = app_handle_clone.clone();
            Box::pin(async move {
                println!("Running scheduled update job...");
                if let Err(e) = run_pending_updates(&pool, Some(app)).await {
                    eprintln!("Scheduled update failed: {}", e);
                }
            })
        })?
    ).await?;

    // Also run startup check immediately (spawned)
    let pool_startup = pool.clone();
    let app_startup = app_handle.clone();
    
    tokio::spawn(async move {
        // Wait a bit for app to fully start and DB migrations to complete
        tokio::time::sleep(Duration::from_secs(5)).await;
        println!("Running startup update check...");
        if let Err(e) = run_pending_updates(&pool_startup, Some(app_startup)).await {
             eprintln!("Startup update failed: {}", e);
        }
    });

    sched.start().await?;
    Ok(sched)
}

async fn run_pending_updates(pool: &SqlitePool, app_handle: Option<AppHandle>) -> Result<(), anyhow::Error> {
    // 1. Get API Key (Avoid sqlx::query! macro to bypass compile-time check if migration not run yet)
    let api_key_row = sqlx::query("SELECT value FROM settings WHERE key = $1")
        .bind("FRED_API_KEY")
        .fetch_optional(pool)
        .await?;
        
    let api_key: String = match api_key_row {
        Some(row) => row.try_get("value")?,
        None => {
            // Log only once or use debug level to avoid spamming
            println!("Skipping update: FRED_API_KEY not found in settings");
            return Ok(());
        }
    };

    // 2. Get stale indicators with source info
    let indicators = db::get_stale_indicators(pool).await?;
    
    // Get total count for reporting
    let total_count: i64 = sqlx::query("SELECT COUNT(*) as count FROM indicators")
        .fetch_one(pool)
        .await?
        .try_get("count")
        .unwrap_or(0);

    let stale_count = indicators.len();
    let fresh_count = total_count as usize - stale_count;

    println!("========================================");
    println!("📊 STARTUP INDICATOR REPORT");
    println!("   - Total Indicators: {}", total_count);
    println!("   - Fresh (Skipped):  {}", fresh_count);
    println!("   - Stale (Updating): {}", stale_count);
    println!("========================================");

    // 4. Check for Alerts (Always check, regardless of updates)
    if let Some(app) = &app_handle {
        crate::core::alerts::check_and_send_alerts(pool, app).await;
    }

    if indicators.is_empty() {
        return Ok(());
    }

    let mut update_count = 0;

    // 3. Update loop with Canary Protocol & Batching
    // We process ALL indicators, but in small batches with rest in between.
    
    // A. Canary Probe (First item)
        // A. Canary Probe (First item)
    if !indicators.is_empty() {
        println!("🐦 Launching Canary Probe to verify API health...");
        let (probe_slug, probe_source) = &indicators[0];
        
        let _ = db::update_indicator_status(pool, probe_slug, "updating", None).await;
        // Canary always fetches dependencies to be safe, or we can treat it as Base
        let probe_result = orchestrator::calculate_and_save(pool, &api_key, probe_slug, false, true).await.map(|_| ());

        match probe_result {
            Ok(_) => {
                println!("✅ Canary Probe alive! Starting batch processing...");
                let _ = db::update_indicator_status(pool, probe_slug, "success", None).await;
                update_count += 1;
                // Resting after probe
                crate::core::rate_limiter::RateLimiter::wait(probe_source).await;
            },
            Err(e) => {
                eprintln!("❌ Canary Probe died: {}. ABORTING UPDATE.", e);
                let _ = db::update_indicator_status(pool, probe_slug, "error", Some(e.as_str())).await;
                return Err(anyhow::anyhow!("Canary probe failed."));
            }
        }
    }

    // B. Main Fleet (Process the rest in batches)
    const BATCH_SIZE: usize = 10;
    
    // Skip the first one (Canary)
    let remaining_indicators: Vec<_> = indicators.iter().skip(1).collect();

    for chunk in remaining_indicators.chunks(BATCH_SIZE) {
        println!("🔹 Processing batch of {} indicators...", chunk.len());
        
        for (slug, source) in chunk {
            println!("   -> Updating: {} ({})", slug, source);
            
            let _ = db::update_indicator_status(pool, slug, "updating", None).await;
            // Standard update: fetch dependencies if needed (default behavior for single updates)
            let result = orchestrator::calculate_and_save(pool, &api_key, slug, false, true).await.map(|_| ());

            match result {
                Ok(_) => {
                    let _ = db::update_indicator_status(pool, slug, "success", None).await;
                    update_count += 1;
                },
                Err(ref e) => {
                    eprintln!("      Failed to update {}: {}", slug, e);
                    let _ = db::update_indicator_status(pool, slug, "error", Some(e.as_str())).await;
                    
                    if e.contains("403") || e.contains("429") || e.contains("400") || e.contains("Limit Reached") {
                         eprintln!("🛑 CRITICAL API ERROR or RATE LIMIT. Stopping all updates to protect quota.");
                         return Ok(()); 
                    }
                }
            }
            // Small pause between items
            crate::core::rate_limiter::RateLimiter::wait(source).await;
        }

        // Minimal PAUSE between batches (1s) just to yield CPU/IO
        if chunk.len() == BATCH_SIZE {
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }

    // PHASE 2: Re-Calculate Derived Indicators
    // Even if we updated them above individually, doing a final pass ensures 
    // that any cross-dependencies are mutually consistent.
    // Plus, it catches any indicators that weren't "stale" but might need recalc due to dependency updates.
    println!("🧮 Phase 2: Re-calculating all derived indicators to ensure consistency...");
    let (calc_success, calc_fail) = orchestrator::batch_calculate_derived_indicators(pool, &api_key, app_handle.as_ref()).await;
    println!("   -> Calculated {} indicators ({} failed)", calc_success, calc_fail);

    // Auto-calculate Risk Score History (no manual button needed!)
    println!("🧮 Auto-calculating Risk Score History...");
    match crate::analysis::market_status::backfill_risk_history_internal(pool).await {
        Ok(count) => println!("✅ Risk Score History: {} daily records calculated", count),
        Err(e) => eprintln!("❌ Risk Score backfill failed: {}", e),
    }

    if update_count > 0 {
        if let Some(app) = app_handle {
            println!("Emitting 'indicators-updated' event. Total updated: {}", update_count);
            let _ = app.emit("indicators-updated", ()); 
        }
    }

    Ok(())
}
