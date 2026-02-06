use sqlx::sqlite::SqlitePoolOptions;
use sqlx::Row;
use std::path::PathBuf;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let home = std::env::var("USERPROFILE")?;
    let db_path = PathBuf::from(home)
        .join("AppData")
        .join("Roaming")
        .join("com.yun.investment-analyzer")
        .join("indicators.db");

    println!("Connecting to: {:?}", db_path);

    if !db_path.exists() {
        println!("❌ DB Not Found!");
        return Ok(());
    }

    let url = format!("sqlite://{}?mode=ro", db_path.to_string_lossy());
    let pool = SqlitePoolOptions::new().connect(&url).await?;

    let rows = sqlx::query(
        r#"
        SELECT 
            i.slug, 
            i.source, 
            COUNT(*) as total_rows, 
            MIN(h.timestamp) as first_date, 
            MAX(h.timestamp) as last_date 
        FROM indicators i 
        LEFT JOIN historical_data h ON i.id = h.indicator_id  
        GROUP BY i.slug, i.source
        ORDER BY i.source, i.slug;
        "#
    )
    .fetch_all(&pool)
    .await?;

    println!("{:<30} | {:<15} | {:<8} | {:<20} | {:<20}", "Slug", "Source", "Count", "Start", "End");
    println!("{}", "-".repeat(100));

    for row in rows {
        let slug: String = row.try_get("slug").unwrap_or_default();
        let source: String = row.try_get("source").unwrap_or_default();
        let count: i64 = row.try_get("total_rows").unwrap_or(0);
        let start: Option<String> = row.try_get("first_date").ok().flatten();
        let end: Option<String> = row.try_get("last_date").ok().flatten();

        println!("{:<30} | {:<15} | {:<8} | {:<20} | {:<20}", 
            slug, 
            source, 
            count, 
            start.unwrap_or_else(|| "N/A".to_string()), 
            end.unwrap_or_else(|| "N/A".to_string())
        );
    }

    Ok(())
}
