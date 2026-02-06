use investment_analyzer_lib::{db, core::orchestrator};
use sqlx::sqlite::SqlitePoolOptions;
use std::path::Path;

#[tokio::main]
async fn main() {
    let data_dir = Path::new("C:/Users/yun/AppData/Roaming/com.yun.investment-analyzer");
    let db_path = data_dir.join("indicators.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());
    
    println!("Connecting to: {}", db_url);
    let pool = SqlitePoolOptions::new().connect(&db_url).await.unwrap();

    // 0. Fetch API Key
    let api_key = investment_analyzer_lib::db::get_setting(&pool, "FRED_API_KEY")
        .await
        .unwrap_or_else(|_| "".to_string());
    
    println!("Loaded API Key: {} chars", api_key.len());

    // 1. Seed Registry (To make sure SP500PE12M is in the DB tables)
    println!("Seeding Registry...");
    let _ = investment_analyzer_lib::core::seeder::seed_registry(&pool).await;

    // 2. Fetch PE
    println!("Triggering SP500PE12M...");
    match orchestrator::calculate_and_save(&pool, &api_key, "SP500PE12M", false).await {
        Ok(data) => println!("Success: Fetched {} points for PE", data.len()),
        Err(e) => println!("Error fetching PE: {}", e),
    }

    // 3. Calculate Yield Gap
    println!("Triggering Yield Gap...");
    match orchestrator::calculate_and_save(&pool, &api_key, "yield_gap", false).await {
        Ok(data) => println!("Success: Calculated {} points for Yield Gap", data.len()),
        Err(e) => println!("Error calculating Yield Gap: {}", e),
    }
    
    println!("Done.");
}
