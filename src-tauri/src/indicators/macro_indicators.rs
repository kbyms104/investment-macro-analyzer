use super::CalculatedIndicator;
use crate::models::DataPoint;
use crate::core::timeseries::align_series;
use anyhow::{Result, anyhow};
use async_trait::async_trait;

pub struct RealYield10Y;

#[async_trait]
impl CalculatedIndicator for RealYield10Y {
    fn slug(&self) -> &str {
        "real_yield"
    }

    fn name(&self) -> &str {
        "Real Yield (10Y)"
    }

    fn required_inputs(&self) -> Vec<&str> {
        vec!["us_10y", "breakeven_10y"] // DGS10, T10YIE
    }

    async fn calculate(&self, inputs: Vec<Vec<DataPoint>>) -> Result<Vec<DataPoint>> {
        if inputs.len() < 2 {
            return Err(anyhow!("Real Yield requires 2 inputs: 10Y Yield and Breakeven Inflation"));
        }

        let yield_nominal = &inputs[0];
        let inflation_exp = &inputs[1];
        
        // Align Series
        let aligned = align_series(yield_nominal, inflation_exp, "inner");
        
        let result = aligned.into_iter().map(|(ts, nominal, inflation)| {
            DataPoint {
                timestamp: ts,
                value: nominal - inflation, // Real Yield = Nominal - Expected Inflation
            }
        }).collect();

        Ok(result)
    }
}
