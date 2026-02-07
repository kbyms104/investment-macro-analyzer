use async_trait::async_trait;
use crate::models::DataPoint;
use super::DataSource;
use anyhow::{Result, anyhow};
use reqwest::Client;
use serde_json::Value;
use chrono::{TimeZone, Utc};

pub struct WorldBankFetcher {
    client: Client,
}

impl WorldBankFetcher {
    pub fn new() -> Self {
        let client = Client::builder()
            .build()
            .unwrap_or_else(|_| Client::new());

        Self { client }
    }

    fn parse_observations(json: &Value) -> Result<Vec<DataPoint>> {
        // World Bank API returns an array: [Metadata, [Data...]]
        // We need the second element
        let data_array = json.as_array()
            .and_then(|arr| arr.get(1))
            .and_then(|val| val.as_array())
            .ok_or_else(|| anyhow!("Invalid World Bank API response format"))?;

        let mut data_points = Vec::new();

        for obs in data_array {
            // "date": "2023", "value": 123.45 (or null)
            if let (Some(date_str), Some(value_val)) = (obs["date"].as_str(), obs["value"].as_f64()) {
                // World Bank usually returns "YYYY"
                // parse "YYYY" -> "YYYY-01-01"
                let full_date_str = format!("{}-01-01", date_str);
                
                if let Ok(naive_date) = chrono::NaiveDate::parse_from_str(&full_date_str, "%Y-%m-%d") {
                    let timestamp = Utc.from_utc_datetime(&naive_date.and_hms_opt(0, 0, 0).unwrap());
                    
                    data_points.push(DataPoint {
                        timestamp,
                        value: value_val,
                    });
                }
            } else if let (Some(date_str), Some(value_str)) = (obs["date"].as_str(), obs["value"].as_str()) {
                 // Sometimes value is a string "123.45"
                 if let Ok(val) = value_str.parse::<f64>() {
                    let full_date_str = format!("{}-01-01", date_str);
                    if let Ok(naive_date) = chrono::NaiveDate::parse_from_str(&full_date_str, "%Y-%m-%d") {
                        let timestamp = Utc.from_utc_datetime(&naive_date.and_hms_opt(0, 0, 0).unwrap());
                        data_points.push(DataPoint {
                            timestamp,
                            value: val,
                        });
                    }
                 }
            }
        }
        
        // Sort by Date ASC (API returns DESC usually)
        data_points.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        Ok(data_points)
    }
}

#[async_trait]
impl DataSource for WorldBankFetcher {
    fn name(&self) -> &str {
        "worldbank"
    }

    async fn fetch_data(&self, indicator_code: &str) -> Result<Vec<DataPoint>> {
        // Example URL: https://api.worldbank.org/v2/country/WLD/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=100
        // We fetching Global data (WLD) by default, or could be parameterized later.
        // For now, let's assume `indicator_code` IS the WB indicator ID (e.g. "NY.GDP.MKTP.KD.ZG")
        
        let url = format!(
            "https://api.worldbank.org/v2/country/WLD/indicator/{}?format=json&per_page=1000",
            indicator_code
        );

        println!("Fetching World Bank Data: {}", url);

        let resp = self.client.get(&url).send().await?;
        
        if !resp.status().is_success() {
             return Err(anyhow!("World Bank API Error: {}", resp.status()));
        }

        let json: Value = resp.json().await?;
        Self::parse_observations(&json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_parse_wb_response() {
        let json_data = json!([
            { "page": 1, "pages": 1, "per_page": 50, "total": 2 },
            [
                { "indicator": { "id": "GDP", "value": "GDP" }, "country": { "id": "WLD", "value": "World" }, "countryiso3code": "WLD", "date": "2023", "value": 3.0, "unit": "", "obs_status": "", "decimal": 1 },
                { "indicator": { "id": "GDP", "value": "GDP" }, "country": { "id": "WLD", "value": "World" }, "countryiso3code": "WLD", "date": "2022", "value": 2.5, "unit": "", "obs_status": "", "decimal": 1 }
            ]
        ]);

        let points = WorldBankFetcher::parse_observations(&json_data).unwrap();
        assert_eq!(points.len(), 2);
        assert_eq!(points[0].value, 2.5); // 2022 (Sorted ASC)
        assert_eq!(points[1].value, 3.0); // 2023
    }
}
