use investment_analyzer_lib::{db, core::orchestrator};
use sqlx::sqlite::SqlitePoolOptions;
use std::path::Path;
use sqlx::Row;

#[tokio::main]
async fn main() {
    let data_dir = Path::new("C:/Users/yun/AppData/Roaming/com.yun.investment-analyzer");
    let db_path = data_dir.join("indicators.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());
    
    println!("🔍 Diagnostic - Connecting to: {}", db_url);
    let pool = SqlitePoolOptions::new().connect(&db_url).await.unwrap();

    let indicators = vec!["us_10y", "SP500PE12M", "yield_gap"];

    println!("\n{:<15} | {:<10} | {:<25} | {:<10}", "Slug", "Count", "Latest Date", "Latest Val");
    println!("{}", "-".repeat(70));

    for slug in indicators {
        // 1. Get Count
        let count_row = sqlx::query(
            "SELECT COUNT(*) as count FROM historical_data h JOIN indicators i ON h.indicator_id = i.id WHERE i.slug = $1"
        )
        .bind(slug)
        .fetch_one(&pool)
        .await
        .unwrap();
        let count: i64 = count_row.get("count");

        // 2. Get Latest
        let latest_row = sqlx::query(
            "SELECT h.timestamp, h.value FROM historical_data h JOIN indicators i ON h.indicator_id = i.id WHERE i.slug = $1 ORDER BY h.timestamp DESC LIMIT 1"
        )
        .bind(slug)
        .fetch_optional(&pool)
        .await
        .unwrap();

        if let Some(row) = latest_row {
            let ts: chrono::NaiveDateTime = row.get("timestamp");
            let val: f64 = row.get("value");
            println!("{:<15} | {:<10} | {:<25} | {:.4}", slug, count, ts.to_string(), val);
        } else {
            println!("{:<15} | {:<10} | {:<25} | -", slug, 0, "NO DATA");
        }
    }
    println!("\nDone.");
}
