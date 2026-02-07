use sqlx::{SqlitePool, Row};
use crate::indicators::registry::{Category, Registry, SourceType};

/// Convert Category enum to string for DB storage
fn category_to_string(category: &Category) -> &'static str {
    match category {
        Category::Valuation => "Valuation",
        Category::Liquidity => "Liquidity",
        Category::UsMacro => "US Macro",
        Category::UsStocks => "US Stocks",
        Category::KoreaMacro => "Korea Macro",
        Category::KoreaStocks => "Korea Stocks",
        Category::Crypto => "Crypto",
        Category::Commodities => "Commodities",
        Category::RealEstate => "Real Estate",
        Category::Global => "Global",
        Category::Risk => "Risk",
        Category::Technical => "Technical",
        Category::Internal => "Internal",
    }
}

/// Convert SourceType enum to string for DB storage
fn source_to_string(source: &SourceType) -> &'static str {
    match source {
        SourceType::Fred => "FRED",
        SourceType::Yahoo => "Yahoo",
        SourceType::Tiingo => "Tiingo",
        // SourceType::Upbit => "Upbit",
        SourceType::Binance => "Binance",
        SourceType::Glassnode => "Glassnode",
        SourceType::Alternative => "Alternative",
        SourceType::Manual => "Manual",
        SourceType::Calculated => "Calculated",
    }
}

pub async fn seed_registry(pool: &SqlitePool) -> Result<(), anyhow::Error> {
    let stats = Registry::get_stats();
    println!("Seeding database with {} indicators from Registry (visible: {})...", stats.total, stats.visible);
    
    // Get ALL indicators including internal ones for seeding
    let indicators = Registry::get_all_indicators();

    for meta in indicators.iter() {
        let source_str = source_to_string(&meta.source);
        let category_str = category_to_string(&meta.category);

        let refresh_interval = match meta.source {
            SourceType::Tiingo | SourceType::Binance => "60m",
            _ => "1440m",
        };

        // Upsert indicator with refresh_interval
        sqlx::query(
            "INSERT INTO indicators (slug, name, category, source, refresh_interval) 
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (slug) DO UPDATE 
             SET name = EXCLUDED.name, 
                 category = EXCLUDED.category,
                 source = EXCLUDED.source,
                 refresh_interval = EXCLUDED.refresh_interval"
        )
        .bind(&meta.slug)
        .bind(&meta.name)
        .bind(category_str)
        .bind(source_str)
        .bind(refresh_interval)
        .execute(pool)
        .await?;
    }

    // CLEANUP: Remove indicators that are no longer in the registry (e.g. renamed or deleted)
    let active_slugs: Vec<String> = indicators
        .iter()
        .map(|m| m.slug.clone())
        .collect();

    // CLEANUP: Remove indicators that are no longer in the registry
    let all_db_indicators = sqlx::query("SELECT slug FROM indicators")
        .fetch_all(pool)
        .await?;
    
    for row in all_db_indicators {
        let slug: String = row.try_get("slug")?;
        if !active_slugs.contains(&slug) {
            sqlx::query("DELETE FROM indicators WHERE slug = ?1")
                .bind(&slug)
                .execute(pool)
                .await?;
            println!("Cleaned up stale indicator: {}", slug);
        }
    }
    
    println!("Seeding complete. Stats: FRED={}, Yahoo={}, Tiingo={}, Binance={}, Calculated={}", 
             stats.fred, stats.yahoo, stats.tiingo, stats.binance, stats.calculated);
    Ok(())
}
