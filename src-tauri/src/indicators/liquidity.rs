use super::CalculatedIndicator;
use crate::models::DataPoint;
use crate::core::timeseries::align_series;
use anyhow::{Result, anyhow};
use async_trait::async_trait;

pub struct NetLiquidity;

#[async_trait]
impl CalculatedIndicator for NetLiquidity {
    fn slug(&self) -> &str {
        "net_liquidity"
    }

    fn name(&self) -> &str {
        "Net Liquidity (Fed Assets - TGA - RRP)"
    }

    fn required_inputs(&self) -> Vec<&str> {
        vec!["fed_balance_sheet", "treasury_tga", "fed_rrp"] // Fed Total Assets, TGA, RRP
    }

    /// Inputs expected: [0] = Fed Balance Sheet (WALCL), [1] = TGA (WTREGEN), [2] = RRP (RRPONTSYD)
    async fn calculate(&self, inputs: Vec<Vec<DataPoint>>) -> Result<Vec<DataPoint>> {
        if inputs.len() < 3 {
            return Err(anyhow!("Net Liquidity requires 3 inputs: Fed Assets, TGA, RRP"));
        }

        let fed_assets = &inputs[0];
        let tga = &inputs[1];
        let rrp = &inputs[2];
        
        // Align 3 series? The helper `align_series` currently does 2.
        // We can chain them. 
        // 1. Align Fed and TGA
        let step1 = align_series(fed_assets, tga, "ffill");
        
        let step1_series: Vec<DataPoint> = step1.iter().map(|(ts, val_fed, val_tga)| {
            // UNIT CORRECTION:
            // WALCL (Fed Assets) is in Millions of Dollars.
            // WTREGEN (TGA) is in Millions of Dollars.
            // We convert both to pure USD (x 1,000,000).
            let fed_usd = val_fed * 1_000_000.0;
            let tga_usd = val_tga * 1_000_000.0;
            DataPoint { timestamp: *ts, value: fed_usd - tga_usd }
        }).collect();
        
        // 2. Align (Fed - TGA) with RRP
        let step2 = align_series(&step1_series, rrp, "ffill");
        
        let result = step2.into_iter().map(|(ts, val_interim, val_rrp)| {
            // UNIT CORRECTION:
            // RRPONTSYD (RRP) is in Billions of Dollars.
            // Convert to pure USD (x 1,000,000,000).
            let rrp_usd = val_rrp * 1_000_000_000.0;

            // Net Liquidity = (Fed Assets - TGA) - RRP
            DataPoint {
                timestamp: ts,
                value: val_interim - rrp_usd,
            }
        }).collect();

        Ok(result)
    }
}
