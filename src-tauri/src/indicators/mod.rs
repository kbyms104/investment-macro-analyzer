use crate::models::DataPoint;
use anyhow::Result;
use async_trait::async_trait;

pub mod buffett;
pub mod yield_gap;
pub mod liquidity;
pub mod yield_curve;
pub mod financial_stress;
// pub mod kimchi;
pub mod copper_gold;
pub mod commodity_ratios;
pub mod macro_indicators;
pub mod liquidity_spreads;
pub mod registry;

#[async_trait]
pub trait CalculatedIndicator {
    /// Returns the unique slug (e.g., "buffett_indicator")
    fn slug(&self) -> &str;
    
    /// Returns the display name
    fn name(&self) -> &str;
    
    /// Returns a list of FRED Series IDs required for calculation
    fn required_inputs(&self) -> Vec<&str>;
    
    /// Calculate the indicator data based on inputs.
    async fn calculate(&self, inputs: Vec<Vec<DataPoint>>) -> Result<Vec<DataPoint>>;
}
