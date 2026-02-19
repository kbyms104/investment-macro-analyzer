use async_trait::async_trait;
use anyhow::Result;
use crate::models::DataPoint;

pub mod fred;
pub mod yahoo;
pub mod tiingo;
pub mod cnn;
// pub mod upbit; // Disabled for now
pub mod binance;
pub mod worldbank; // New
pub mod eia; // New
pub mod calendar; // New
pub mod alternative;

#[async_trait]
pub trait DataSource: Send + Sync {
    fn name(&self) -> &str;
    async fn fetch_data(&self, series_id: &str) -> Result<Vec<DataPoint>>;
}
