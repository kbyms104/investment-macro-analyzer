use async_trait::async_trait;
use crate::models::DataPoint;
use super::DataSource;
use anyhow::{Result, anyhow};
use reqwest::Client;
use serde_json::Value;
use chrono::{TimeZone, Utc};

pub struct FredFetcher {
    api_key: String,
    client: Client,
    backfill: bool,
}

use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};

impl FredFetcher {
    pub fn new(api_key: String, backfill: bool) -> Self {
        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, HeaderValue::from_static("InvestmentAnalyzer/1.0"));
        
        let client = Client::builder()
            .default_headers(headers)
            .build()
            .unwrap_or_else(|_| Client::new());

        Self { api_key, client, backfill }
    }
}

#[async_trait]
impl DataSource for FredFetcher {
    fn name(&self) -> &str {
        "fred"
    }

    async fn fetch_data(&self, series_id: &str) -> Result<Vec<DataPoint>> {
        // 1. Sanitize the API key (trim whitespace, lowercase)
        let sanitized_key = self.api_key.trim().to_lowercase();
        
        // 2. Logging length for debugging (never log the actual key)
        println!("FRED Fetching with key length: {}", sanitized_key.len());

        if sanitized_key.is_empty() {
             return Err(anyhow!("FRED API Key is empty or missing!"));
        }

        if sanitized_key.len() != 32 {
             println!("WARNING: FRED API Key length is {}, not 32! This will likely fail.", sanitized_key.len());
        }

        let mut url = format!(
            "https://api.stlouisfed.org/fred/series/observations?series_id={}&api_key={}&file_type=json",
            series_id, sanitized_key
        );

        // Apply Backfill if enabled
        if self.backfill {
             url.push_str("&observation_start=2015-01-01");
             println!("  > FRED Backfill Mode Active: Fetching from 2015-01-01");
        }

        let resp = self.client.get(&url).send().await?;
        
        if !resp.status().is_success() {
            let status = resp.status();
            let error_text = resp.text().await.unwrap_or_default();
            return Err(anyhow!("FRED API Error: {} - Body: {}", status, error_text));
        }

        let json: Value = resp.json().await?;
        Self::parse_observations(&json)
    }
}

impl FredFetcher {
    fn parse_observations(json: &Value) -> Result<Vec<DataPoint>> {
        let observations = json["observations"]
            .as_array()
            .ok_or_else(|| anyhow!("No observations found in FRED response"))?;

        let mut data_points = Vec::new();

        for obs in observations {
            // "date": "2023-01-01", "value": "123.45"
            if let (Some(date_str), Some(value_str)) = (obs["date"].as_str(), obs["value"].as_str()) {
                // Handle "." (missing data) which FRED returns sometimes
                if value_str == "." {
                    continue;
                }

                if let Ok(value) = value_str.parse::<f64>() {
                    // Start of day in UTC
                    let naive_date = chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d")?;
                    let timestamp = Utc.from_utc_datetime(&naive_date.and_hms_opt(0, 0, 0).unwrap());
                    
                    data_points.push(DataPoint {
                        timestamp,
                        value,
                    });
                }
            }
        }

        Ok(data_points)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_parse_valid_response() {
        let json_data = json!({
            "observations": [
                { "date": "2023-01-01", "value": "123.45" },
                { "date": "2023-01-02", "value": "124.56" }
            ]
        });

        let points = FredFetcher::parse_observations(&json_data).unwrap();
        assert_eq!(points.len(), 2);
        assert_eq!(points[0].value, 123.45);
        assert_eq!(points[1].value, 124.56);
    }

    #[test]
    fn test_parse_missing_value() {
        let json_data = json!({
            "observations": [
                { "date": "2023-01-01", "value": "." },
                { "date": "2023-01-02", "value": "100.0" }
            ]
        });

        let points = FredFetcher::parse_observations(&json_data).unwrap();
        assert_eq!(points.len(), 1); // "." should be skipped
        assert_eq!(points[0].value, 100.0);
    }
    
    #[test]
    fn test_parse_invalid_format() {
        let json_data = json!({ "error": "bad request" });
        let result = FredFetcher::parse_observations(&json_data);
        assert!(result.is_err());
    }
}
