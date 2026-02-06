use async_trait::async_trait;
use anyhow::Result;
use crate::models::DataPoint;

pub mod fred;
// pub mod yahoo; // Removed as part of BYOK migration
pub mod tiingo;
// pub mod upbit; // Removed as part of Crypto Cleanup
pub mod binance;
pub mod alternative;
pub mod cnn;

#[async_trait]
pub trait DataSource {
    fn name(&self) -> &str;
    async fn fetch_data(&self, symbol: &str) -> Result<Vec<DataPoint>>;
}
