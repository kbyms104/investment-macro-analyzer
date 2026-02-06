use super::CalculatedIndicator;
use crate::models::DataPoint;
use crate::core::timeseries::align_series;
use anyhow::{Result, anyhow};
use async_trait::async_trait;

pub struct BuffettIndicator;

#[async_trait]
impl CalculatedIndicator for BuffettIndicator {
    fn slug(&self) -> &str {
        "buffett_indicator"
    }

    fn name(&self) -> &str {
        "Buffett Indicator (Market Cap / GDP)"
    }

    fn required_inputs(&self) -> Vec<&str> {
        // Using registered slugs: us_market_cap (NCBEILQ027S), gdp
        vec!["us_market_cap", "gdp"]
    }

    /// Inputs expected: [0] = Market Cap (Quarterly), [1] = GDP (Quarterly)
    /// Returns quarterly Buffett Indicator values (industry standard)
    async fn calculate(&self, inputs: Vec<Vec<DataPoint>>) -> Result<Vec<DataPoint>> {
        if inputs.len() < 2 {
            return Err(anyhow!("Buffett Indicator requires 2 inputs: Market Cap and GDP"));
        }

        let market_cap = &inputs[0];
        let gdp = &inputs[1];
        
        if market_cap.is_empty() || gdp.is_empty() {
            return Err(anyhow!("Empty input data for Buffett Indicator"));
        }
        
        // Align Series: Both are Quarterly, so align_series will match timestamps
        let aligned = align_series(market_cap, gdp, "ffill");
        
        // Calculate Ratio
        let result = aligned.into_iter().map(|(ts, mc, gdp_val)| {
            // Unit Correction:
            // NCBEILQ027S (Market Cap) is in Millions
            // GDP is in Billions
            // Divide Market Cap by 1000 to convert to Billions
            let mc_billions = mc / 1000.0;
            
            DataPoint {
                timestamp: ts,
                value: (mc_billions / gdp_val) * 100.0, 
            }
        }).collect();

        Ok(result)
    }
}
