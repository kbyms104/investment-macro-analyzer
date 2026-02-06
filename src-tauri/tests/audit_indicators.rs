use investment_analyzer_lib::indicators::registry::{Registry};
use sqlx::sqlite::{SqlitePoolOptions};
use chrono::{Utc, TimeZone};

#[tokio::test]
async fn audit_all_indicators() { 
    // Hardcoded path to the discovered DB
    let db_url = "sqlite://C:/Users/yun/AppData/Roaming/com.yun.investment-analyzer/indicators.db";
    
    println!("Connecting to DB: {}", db_url);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .expect("Failed to connect to DB");

    println!("\n========= INDICATOR AUDIT REPORT =========\n");

    let indicators = Registry::get_available_indicators();
    let total = indicators.len();
    println!("🔍 Total Indicators in Registry: {}", total);

    let mut stale_count = 0;
    let mut missing_count = 0;
    let mut bad_value_count = 0;

    for ind in indicators {
        // SQLite query adapting to sqlx chrono mapping
        let row: Option<(f64, chrono::NaiveDateTime)> = sqlx::query_as(
            r#"
            SELECT h.value, h.timestamp
            FROM historical_data h
            JOIN indicators i ON h.indicator_id = i.id
            WHERE i.slug = $1
            ORDER BY h.timestamp DESC
            LIMIT 1
            "#
        )
        .bind(&ind.slug)
        .fetch_optional(&pool)
        .await
        .unwrap_or_else(|e| {
            println!("Error querying {}: {}", ind.slug, e);
            None
        });

        match row {
            Some((val, date_naive)) => {
                let date = date_naive.and_utc(); // Assuming stored as UTC naive
                let days_diff = (Utc::now() - date).num_days();

                // 1. Data Freshness Check (Threshold: 90 days for quarterly data safety)
                if days_diff > 90 {
                    println!("⚠️  [STALE] {:<35} | Latest: {} ({} days ago) | Val: {:.2}", 
                        ind.name, date.format("%Y-%m-%d"), days_diff, val);
                    stale_count += 1;
                }

                // 2. Value Sanity Check
                if val == 0.0 {
                    // Allow 0.0 for spreads/curves/diffs
                    if !ind.slug.contains("spread") && !ind.slug.contains("curve") && !ind.slug.contains("diff") {
                        println!("❌ [ZERO]  {:<35} | Value is 0.0", ind.name);
                        bad_value_count += 1;
                    }
                }
                
                // 3. Negative check (Exceptions: Spreads, Growth Rates, etc)
                if val < 0.0 && !ind.slug.contains("spread") && !ind.slug.contains("curve") && !ind.slug.contains("growth") && !ind.slug.contains("diff") && !ind.slug.contains("net") && !ind.slug.contains("nfci") {
                     println!("❓ [NEG]   {:<35} | Value: {:.2} (Check consistency)", ind.name, val);
                }
            }
            None => {
                println!("❌ [EMPTY] {:<35} | No data found in DB", ind.name);
                missing_count += 1;
            }
        }
    }

    println!("\n========= SUMMARY =========");
    println!("✅ Healthy:      {}", total - stale_count - missing_count - bad_value_count);
    println!("⚠️  Stale (>90d): {}", stale_count);
    println!("❌ Missing Data: {}", missing_count);
    println!("❌ Bad Values:   {}", bad_value_count);
    println!("===========================\n");
}
