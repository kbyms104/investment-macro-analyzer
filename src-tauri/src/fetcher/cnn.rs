use anyhow::Result;
use reqwest::Client;
use crate::models::DataPoint;
use serde_json::Value;

// CNN Fear and Greed Fetcher
// Since official API is strict, we might need to parse the production-API endpoint or scrape.
// CNN moved to "production.dataviz.cnn.io"
// Endpoint: https://production.dataviz.cnn.io/index/fearandgreed/graphdata
// User-Agent is critical.

pub async fn fetch_fear_and_greed() -> Result<Vec<DataPoint>> {
    // API is blocked by WAF. relying on manual CSV seeding for now.
    println!("CNN Fetcher: API blocked. Using manual data only.");
    Ok(Vec::new())
}

// Fallback: Scrape main page if API fails? (Only if needed)
// Scraping is harder because of SSR/Hydration. API is preferred.
