use async_trait::async_trait;
use crate::models::DataPoint;
use super::DataSource;
use anyhow::{Result, anyhow};
use reqwest::Client;
use serde::Deserialize;
use chrono::{TimeZone, Utc};

pub struct BinanceFetcher {
    client: Client,
    base_url: String,
    api_key: Option<String>,
}

impl BinanceFetcher {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            client: Client::new(),
            base_url: "https://fapi.binance.com".to_string(),
            api_key,
        }
    }

    fn auth_request(&self, url: &str) -> reqwest::RequestBuilder {
        let mut req = self.client.get(url);
        if let Some(key) = &self.api_key {
            req = req.header("X-MBX-APIKEY", key);
        }
        req
    }

    /// Fetch historical klines (candlestick data) for price
    async fn fetch_klines(&self, symbol: &str) -> Result<Vec<DataPoint>> {
        let url = format!("{}/fapi/v1/klines", self.base_url);
        
        let params = [
            ("symbol", symbol),
            ("interval", "1d"),
            ("limit", "1000"), 
        ];

        // Klines are public
        let resp = self.client.get(&url)
            .query(&params)
            .send()
            .await?;

        if !resp.status().is_success() {
             return Err(anyhow!("Binance Kline Error: {}", resp.status()));
        }

        let json: Vec<Vec<serde_json::Value>> = resp.json().await?;
        let mut data_points = Vec::new();

        for candle in json {
            if let (Some(ts_v), Some(close_v)) = (candle.get(0), candle.get(4)) {
                let ts = ts_v.as_i64().ok_or(anyhow!("Invalid timestamp"))?;
                let close_str = close_v.as_str().ok_or(anyhow!("Invalid close price"))?;
                let value = close_str.parse::<f64>()?;

                let datetime = Utc.timestamp_millis_opt(ts).single().ok_or(anyhow!("Invalid datetime"))?;

                data_points.push(DataPoint {
                    timestamp: datetime,
                    value,
                });
            }
        }

        Ok(data_points)
    }

    /// Fetch Open Interest History (Requires KEY often)
    async fn fetch_open_interest(&self, symbol: &str) -> Result<Vec<DataPoint>> {
        let url = format!("{}/futures/data/openInterestHist", self.base_url);
        
        let params = [
            ("symbol", symbol),
            ("period", "1d"),
            ("limit", "500"),
        ];

        let resp = self.auth_request(&url).query(&params).send().await?;
        
        if !resp.status().is_success() {
            return Err(anyhow!("Binance OI Error: {}", resp.status()));
        }

        #[derive(Deserialize)]
        struct OIData {
            #[serde(rename = "sumOpenInterestValue")]
            value: String,
            timestamp: i64,
        }

        let json: Vec<OIData> = resp.json().await?;

        let data = json.into_iter().map(|item| {
            let val = item.value.parse::<f64>().unwrap_or(0.0);
            let dt = Utc.timestamp_millis_opt(item.timestamp).single().unwrap();
            DataPoint { timestamp: dt, value: val }
        }).collect();

        Ok(data)
    }

    /// Fetch Funding Rate History
    async fn fetch_funding_rate(&self, symbol: &str) -> Result<Vec<DataPoint>> {
        let url = format!("{}/fapi/v1/fundingRate", self.base_url);
        
        let params = [
            ("symbol", symbol),
            ("limit", "1000"), 
        ];

        let resp = self.auth_request(&url).query(&params).send().await?;

        if !resp.status().is_success() {
             return Err(anyhow!("Binance Funding Error: {}", resp.status()));
        }

        #[derive(Deserialize)]
        struct FundingData {
            #[serde(rename = "fundingRate")]
            rate: String,
            #[serde(rename = "fundingTime")]
            time: i64,
        }

        let json: Vec<FundingData> = resp.json().await?;

        let data = json.into_iter().map(|item| {
            let raw_rate = item.rate.parse::<f64>().unwrap_or(0.0);
            let percent_rate = raw_rate * 100.0;
            let dt = Utc.timestamp_millis_opt(item.time).single().unwrap();
            DataPoint { timestamp: dt, value: percent_rate }
        }).collect();

        Ok(data)
    }

    /// Fetch Long/Short Ratio
    async fn fetch_ls_ratio(&self, symbol: &str) -> Result<Vec<DataPoint>> {
        let url = format!("{}/futures/data/globalLongShortAccountRatio", self.base_url);
        
        let params = [
            ("symbol", symbol),
            ("period", "1d"),
            ("limit", "500"), 
        ];

        let resp = self.auth_request(&url).query(&params).send().await?;

        if !resp.status().is_success() {
             return Err(anyhow!("Binance LS Ratio Error: {}", resp.status()));
        }

        #[derive(Deserialize)]
        struct LSRatioData {
            #[serde(rename = "longShortRatio")]
            ratio: String,
            timestamp: i64,
        }

        let json: Vec<LSRatioData> = resp.json().await?;

        let data = json.into_iter().map(|item| {
            let val = item.ratio.parse::<f64>().unwrap_or(0.0);
            let dt = Utc.timestamp_millis_opt(item.timestamp).single().unwrap();
            DataPoint { timestamp: dt, value: val }
        }).collect();

        Ok(data)
    }
}

#[async_trait]
impl DataSource for BinanceFetcher {
    fn name(&self) -> &str {
        "binance"
    }

    async fn fetch_data(&self, symbol: &str) -> Result<Vec<DataPoint>> {
        if symbol.ends_with("_FUNDING") {
            let actual_symbol = symbol.replace("_FUNDING", "");
            return self.fetch_funding_rate(&actual_symbol).await;
        } else if symbol.ends_with("_OI") {
            let actual_symbol = symbol.replace("_OI", "");
            return self.fetch_open_interest(&actual_symbol).await;
        } else if symbol.ends_with("_LS") {
            let actual_symbol = symbol.replace("_LS", "");
            return self.fetch_ls_ratio(&actual_symbol).await;
        } else {
            return self.fetch_klines(symbol).await;
        }
    }
}
