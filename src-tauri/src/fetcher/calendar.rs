use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
// use serde_json::Value;

#[derive(Debug, Serialize, Deserialize)]
pub struct EarningsEvent {
    pub symbol: String,
    pub date: String,
    #[serde(rename(deserialize = "hour"))]
    pub event_time: String,
    #[serde(rename(deserialize = "epsEstimate"))]
    pub eps_estimate: Option<f64>,
    #[serde(rename(deserialize = "epsActual"))]
    pub eps_actual: Option<f64>,
    #[serde(rename(deserialize = "revenueEstimate"))]
    pub revenue_estimate: Option<f64>,
    #[serde(rename(deserialize = "revenueActual"))]
    pub revenue_actual: Option<f64>,
    pub quarter: i32,
    pub year: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EarningsHistoryEvent {
    #[serde(alias = "period")]
    pub date: String,
    #[serde(alias = "estimate")]
    pub eps_estimate: Option<f64>,
    #[serde(alias = "actual")]
    pub eps_actual: Option<f64>,
    pub quarter: i32,
    pub year: i32,
    pub surprise: Option<f64>,
    #[serde(alias = "surprisePercent")]
    pub surprise_percent: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IpoEvent {
    pub symbol: String,
    pub date: String,
    pub name: String,
    pub exchange: String,
    pub price: Option<String>,
    #[serde(rename(deserialize = "numberOfShares"))]
    pub number_of_shares: Option<f64>,
    #[serde(rename(deserialize = "totalSharesValue"))]
    pub total_shares_value: Option<f64>,
    pub status: String,
}

#[derive(Debug, Deserialize)]
struct EarningsResponse {
    #[serde(rename = "earningsCalendar")]
    pub earnings: Vec<EarningsEvent>,
}

#[derive(Debug, Deserialize)]
struct IpoResponse {
    #[serde(rename = "ipoCalendar")]
    pub ipos: Vec<IpoEvent>,
}

pub struct CalendarFetcher {
    api_key: String,
}

impl CalendarFetcher {
    pub fn new(api_key: String) -> Self {
        Self { api_key }
    }

    pub async fn fetch_earnings(&self, from: &str, to: &str) -> Result<Vec<EarningsEvent>> {
        let url = format!(
            "https://finnhub.io/api/v1/calendar/earnings?from={}&to={}&token={}",
            from, to, self.api_key
        );

        let client = reqwest::Client::new();
        let resp = client.get(&url).send().await?;

        if !resp.status().is_success() {
            return Err(anyhow!("Finnhub Calendar API Error: {}", resp.status()));
        }

        let data: EarningsResponse = resp.json().await?;
        Ok(data.earnings)
    }

    pub async fn fetch_ipos(&self, from: &str, to: &str) -> Result<Vec<IpoEvent>> {
        let url = format!(
            "https://finnhub.io/api/v1/calendar/ipo?from={}&to={}&token={}",
            from, to, self.api_key
        );

        let client = reqwest::Client::new();
        let resp = client.get(&url).send().await?;

        if !resp.status().is_success() {
            return Err(anyhow!("Finnhub IPO API Error: {}", resp.status()));
        }

        let data: IpoResponse = resp.json().await?;
        Ok(data.ipos)
    }

    pub async fn fetch_earnings_history(&self, symbol: &str) -> Result<Vec<EarningsHistoryEvent>> {
        let url = format!(
            "https://finnhub.io/api/v1/stock/earnings?symbol={}&token={}",
            symbol, self.api_key
        );

        let client = reqwest::Client::new();
        let resp = client.get(&url).send().await?;

        if !resp.status().is_success() {
            return Err(anyhow!("Finnhub Earnings History Error: {} - Symbol: {}", resp.status(), symbol));
        }

        // Finnhub returns an array directly for /stock/earnings
        let data: Vec<EarningsHistoryEvent> = resp.json().await?;
        Ok(data)
    }
}
