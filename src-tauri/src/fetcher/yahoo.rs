use crate::models::DataPoint;
use super::DataSource;
use anyhow::{Result, anyhow};
use async_trait::async_trait;
use chrono::{Utc, TimeZone};
use yahoo_finance_api as yahoo;
use time::OffsetDateTime;

pub struct YahooFetcher;

impl YahooFetcher {
    pub fn new() -> Self {
        YahooFetcher
    }
}

#[async_trait]
impl DataSource for YahooFetcher {
    fn name(&self) -> &str {
        "Yahoo"
    }

    async fn fetch_data(&self, symbol: &str) -> Result<Vec<DataPoint>> {
        let provider = yahoo::YahooConnector::new()
            .map_err(|e| anyhow!("Failed to init Yahoo Connector: {}", e))?;
        
        // Yahoo API uses 'time' crate instead of 'chrono'
        // We need to convert or just generate using time crate
        
        let now = OffsetDateTime::now_utc();
        let start = now - time::Duration::days(365 * 10); // 10 Years
        
        let resp = provider.get_quote_history(symbol, start, now).await
            .map_err(|e| anyhow!("Yahoo API Error: {}", e))?;
            
        let quotes = resp.quotes()
            .map_err(|e| anyhow!("Failed to parse Yahoo quotes: {}", e))?;
        
        let mut data_points = Vec::new();
        
        for quote in quotes {
            // Yahoo quotes use u64 timestamp (seconds)
            let timestamp = Utc.timestamp_opt(quote.timestamp as i64, 0)
                .unwrap();
                
            data_points.push(DataPoint {
                timestamp,
                value: quote.close,
            });
        }
        
        if data_points.is_empty() {
            return Err(anyhow!("No data returned for symbol: {}", symbol));
        }

        // Sort by date just in case
        data_points.sort_by_key(|k| k.timestamp);

        Ok(data_points)
    }
}
