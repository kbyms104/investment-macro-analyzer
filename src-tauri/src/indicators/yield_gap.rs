use super::CalculatedIndicator;
use crate::models::DataPoint;
use crate::core::timeseries::align_series;
use anyhow::{Result, anyhow};
use async_trait::async_trait;

pub struct YieldGap;

#[async_trait]
impl CalculatedIndicator for YieldGap {
    fn slug(&self) -> &str {
        "yield_gap"
    }

    fn name(&self) -> &str {
        "Yield Gap (Earnings Yield - 10Y Treasury)"
    }

    fn required_inputs(&self) -> Vec<&str> {
        vec!["SP500PE12M", "us_10y"] // S&P 500 PE Ratio, 10-Year Treasury Constant Maturity Rate
    }

    /// Inputs expected: [0] = S&P 500 PE Ratio, [1] = 10Y Treasury Yield (DGS10)
    async fn calculate(&self, inputs: Vec<Vec<DataPoint>>) -> Result<Vec<DataPoint>> {
        if inputs.len() < 2 {
            return Err(anyhow!("Yield Gap requires 2 inputs: PE Ratio and 10Y Yield"));
        }

        let pe_ratio = &inputs[0];
        let bond_yield = &inputs[1];
        
        // Align Series: PE is often monthly/daily, Bond Yield is daily.
        let aligned = align_series(pe_ratio, bond_yield, "ffill");
        
        // Calculate Yield Gap
        let result = aligned.into_iter().map(|(ts, pe, yield_val)| {
            // Earnings Yield = 1 / PE * 100
            // Yield Gap = Earnings Yield - Bond Yield
            // Note: Bond yield is usually in percentage (e.g., 4.5 for 4.5%).
            // PE is a ratio (e.g., 20.0). 1/20 = 0.05 = 5.0%.
            
            let earnings_yield = if pe != 0.0 { (1.0 / pe) * 100.0 } else { 0.0 };
            let gap = earnings_yield - yield_val;
            
            DataPoint {
                timestamp: ts,
                value: gap, 
            }
        }).collect();

        Ok(result)
    }
}
