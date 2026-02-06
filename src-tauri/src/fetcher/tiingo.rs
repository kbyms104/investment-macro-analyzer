use async_trait::async_trait;
use crate::models::DataPoint;
use super::DataSource;
use anyhow::{Result, anyhow};
use reqwest::Client;
use serde::Deserialize;
use chrono::{TimeZone, Utc};
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT, AUTHORIZATION};

/// Tiingo API response structure for daily prices
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TiingoPriceData {
    date: String,
    close: f64,
    // Other fields: open, high, low, volume, adjOpen, adjHigh, adjLow, adjClose, adjVolume, divCash, splitFactor
}

use sqlx::SqlitePool;

pub struct TiingoFetcher {
    api_key: String,
    client: Client,
    backfill: bool,
    pool: Option<SqlitePool>, // Option mostly to keep tests simpler if needed, but we'll use it
}

impl TiingoFetcher {
    pub fn new(api_key: String, backfill: bool, pool: Option<SqlitePool>) -> Self {
        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, HeaderValue::from_static("InvestmentAnalyzer/1.0"));
        
        // Tiingo uses Authorization header with Token prefix
        if let Ok(auth_value) = HeaderValue::from_str(&format!("Token {}", api_key)) {
            headers.insert(AUTHORIZATION, auth_value);
        }
        
        let client = Client::builder()
            .default_headers(headers)
            .build()
            .unwrap_or_else(|_| Client::new());

        Self { api_key, client, backfill, pool }
    }
}

#[async_trait]
impl DataSource for TiingoFetcher {
    fn name(&self) -> &str {
        "tiingo"
    }

    async fn fetch_data(&self, symbol: &str) -> Result<Vec<DataPoint>> {
        // 0. Check Rate Limit if pool is available
        if let Some(pool) = &self.pool {
            let now = chrono::Local::now();
            let hour_key = format!("TIINGO_USAGE_{}", now.format("%Y-%m-%d_%H"));
            let day_key = format!("TIINGO_USAGE_{}", now.format("%Y-%m-%d"));
            
            // Limit: 450 per hour (Safety margin for 500 limit)
            if !crate::db::check_api_limit(pool, &hour_key, 450).await? {
                return Err(anyhow!("🛑 Tiingo Hourly Limit Reached (450/500). Protection active."));
            }
            // Limit: 950 per day (Safety margin for 1000 limit)
            if !crate::db::check_api_limit(pool, &day_key, 950).await? {
                return Err(anyhow!("🛑 Tiingo Daily Limit Reached (950/1000). Protection active."));
            }
        }

        // 1. Validate API key
        let sanitized_key = self.api_key.trim();
        
        println!("Tiingo Fetching symbol: {} with key length: {}", symbol, sanitized_key.len());

        if sanitized_key.is_empty() {
             return Err(anyhow!("Tiingo API Key is empty or missing!"));
        }

        // 2. Determine endpoint based on symbol type
        // Tiingo supports: stocks (tiingo/daily), crypto (tiingo/crypto), forex (tiingo/fx)
        let url = if symbol.contains("usd") || symbol.contains("btc") || symbol.contains("eth") {
            // Crypto endpoint
            format!(
                "https://api.tiingo.com/tiingo/crypto/prices?tickers={}&resampleFreq=1day&token={}",
                symbol, sanitized_key
            )
        } else if symbol.contains("usd") && !symbol.contains("btc") {
            // FX endpoint (for forex pairs like eurusd, usdjpy)
            format!(
                "https://api.tiingo.com/tiingo/fx/{}/prices?token={}",
                symbol, sanitized_key
            )
        } else {
            // Default: Stock/ETF endpoint
            let mut base_url = format!(
                "https://api.tiingo.com/tiingo/daily/{}/prices?token={}",
                symbol.to_lowercase(), sanitized_key
            );
            
            // Apply Backfill if enabled
            if self.backfill {
                base_url.push_str("&startDate=2015-01-01");
                println!("  > Tiingo Backfill Mode Active: Fetching from 2015-01-01");
            }
            
            base_url
        };

        let resp = self.client.get(&url).send().await?;
        
        // Increment usage if request was sent (regardless of 200 OK or error, Tiingo counts it)
        if let Some(pool) = &self.pool {
            let now = chrono::Local::now();
            let hour_key = format!("TIINGO_USAGE_{}", now.format("%Y-%m-%d_%H"));
            let day_key = format!("TIINGO_USAGE_{}", now.format("%Y-%m-%d"));
            let _ = crate::db::increment_api_usage(pool, &hour_key).await;
            let _ = crate::db::increment_api_usage(pool, &day_key).await;
        }

        if !resp.status().is_success() {
            let status = resp.status();
            let error_text = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Tiingo API Error for {}: {} - Body: {}", symbol, status, error_text));
        }

        let json_text = resp.text().await?;
        Self::parse_response(&json_text, symbol)
    }
}

impl TiingoFetcher {
    fn parse_response(json_text: &str, symbol: &str) -> Result<Vec<DataPoint>> {
        // Tiingo returns an array of price objects
        let prices: Vec<TiingoPriceData> = serde_json::from_str(json_text)
            .map_err(|e| anyhow!("Failed to parse Tiingo response for {}: {} - Response: {}", symbol, e, &json_text[..json_text.len().min(200)]))?;

        let mut data_points = Vec::new();

        for price in prices {
            // Parse date: Tiingo uses ISO format like "2023-01-03T00:00:00+00:00"
            let date_str = &price.date[..10]; // Take just YYYY-MM-DD part
            
            if let Ok(naive_date) = chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
                let timestamp = Utc.from_utc_datetime(&naive_date.and_hms_opt(0, 0, 0).unwrap());
                
                data_points.push(DataPoint {
                    timestamp,
                    value: price.close,
                });
            }
        }

        if data_points.is_empty() {
            println!("WARNING: Tiingo returned 0 data points for symbol: {}", symbol);
        } else {
            println!("Tiingo fetched {} data points for {}", data_points.len(), symbol);
        }

        Ok(data_points)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_response() {
        let json_data = r#"[
            {"date": "2023-01-03T00:00:00+00:00", "close": 380.82, "open": 384.37, "high": 386.43, "low": 377.83},
            {"date": "2023-01-04T00:00:00+00:00", "close": 383.76, "open": 383.18, "high": 385.88, "low": 380.00}
        ]"#;

        let points = TiingoFetcher::parse_response(json_data, "spy").unwrap();
        assert_eq!(points.len(), 2);
        assert_eq!(points[0].value, 380.82);
        assert_eq!(points[1].value, 383.76);
    }

    #[test]
    fn test_parse_empty_response() {
        let json_data = "[]";
        let points = TiingoFetcher::parse_response(json_data, "unknown").unwrap();
        assert_eq!(points.len(), 0);
    }
}
