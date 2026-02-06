use async_trait::async_trait;
use crate::models::DataPoint;
use super::DataSource;
use anyhow::{Result, anyhow};
use reqwest::Client;
use serde::Deserialize;
use chrono::TimeZone;
use scraper::{Html, Selector};

pub struct AlternativeFetcher {
    client: Client,
}

impl AlternativeFetcher {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                .build()
                .unwrap_or_else(|_| Client::new()),
        }
    }

    async fn fetch_crypto_fear_greed(&self) -> Result<Vec<DataPoint>> {
        // Fetch last 365 days
        let url = "https://api.alternative.me/fng/?limit=365&format=json";
        
        let resp = self.client.get(url)
            .send()
            .await?;

        if !resp.status().is_success() {
             return Err(anyhow!("Alternative API Error: {}", resp.status()));
        }

        #[derive(Deserialize)]
        struct FngResponse {
            data: Vec<FngData>,
        }

        #[derive(Deserialize)]
        struct FngData {
            value: String,
            timestamp: String,
        }

        let json: FngResponse = resp.json().await?;
        
        let mut data_points = Vec::new();

        for item in json.data {
            let val = item.value.parse::<f64>().unwrap_or(0.0);
            let ts = item.timestamp.parse::<i64>().unwrap_or(0);
            
            let dt = chrono::Utc.timestamp_opt(ts, 0).single().ok_or(anyhow!("Invalid timestamp"))?;
            
            data_points.push(DataPoint {
                timestamp: dt,
                value: val,
            });
        }
        
        // API returns desc order (newest first), but we might want to sort?
        // DB insertion handles sort usually, but let's reverse to be safe (oldest first)
        data_points.reverse();

        Ok(data_points)
    }

    async fn fetch_sp500_pe(&self) -> Result<Vec<DataPoint>> {
        let url = "https://www.multpl.com/s-p-500-pe-ratio/table/by-month";
        
        // Use a standard browser user agent to avoid bot detection
        let resp = self.client.get(url)
            .send()
            .await?;
            
        if !resp.status().is_success() {
            return Err(anyhow!("Multpl Error: {}", resp.status()));
        }

        let body = resp.text().await?;
        let document = Html::parse_document(&body);
        
        // CSS Selector for the table rows
        let row_selector = Selector::parse("table#datatable tbody tr").unwrap();
        let col_selector = Selector::parse("td").unwrap();

        let mut points = Vec::new();

        for row in document.select(&row_selector) {
            let cols: Vec<_> = row.select(&col_selector).collect();
            if cols.len() >= 2 {
                // Column 0: Date
                // "Jan 1, 2026" or "Jan 1, 2026 Estimate"
                let date_raw = cols[0].text().collect::<Vec<_>>().join(" ");
                let date_clean = date_raw.replace("Estimate", "").trim().to_string();

                // Column 1: Value
                // "31.52", "† 31.52", "31.52 Estimate"
                // The browser check showed: "† \n 31.52" inside text content
                let val_raw = cols[1].text().collect::<Vec<_>>().join("");
                let val_clean = val_raw
                    .replace("†", "")
                    .replace("Estimate", "")
                    .replace("\n", "")
                    .replace(" ", "");

                // Parse Date (e.g., "Jan 1, 2024")
                let naive_date = chrono::NaiveDate::parse_from_str(&date_clean, "%b %d, %Y")
                    .or_else(|_| chrono::NaiveDate::parse_from_str(&date_clean, "%B %d, %Y"));

                // Parse Value
                let val_parsed = val_clean.parse::<f64>();

                if let (Ok(date), Ok(value)) = (naive_date, val_parsed) {
                    let timestamp = date.and_hms_opt(0, 0, 0).unwrap().and_utc();
                    points.push(DataPoint { timestamp, value });
                }
            }
        }
        
        // Sort ascending
        points.sort_by_key(|p| p.timestamp);

        if points.is_empty() {
            return Err(anyhow!("No data found parsing multpl.com (Selector match failed?)"));
        }

        Ok(points)
    }
}

#[async_trait]
impl DataSource for AlternativeFetcher {
    fn name(&self) -> &str {
        "alternative"
    }

    async fn fetch_data(&self, symbol: &str) -> Result<Vec<DataPoint>> {
        if symbol == "crypto_fear_greed" {
            return self.fetch_crypto_fear_greed().await;
        } else if symbol == "fear_greed_index" {
            // CNN Fear & Greed
            let points = crate::fetcher::cnn::fetch_fear_and_greed().await?;
            return Ok(points);
        } else if symbol == "SP500PE12M" {
            return self.fetch_sp500_pe().await;
        }
        
        Err(anyhow!("Unknown alternative symbol: {}", symbol))
    }
}
