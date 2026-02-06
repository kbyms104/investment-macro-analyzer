use super::CalculatedIndicator;
use crate::models::DataPoint;
use crate::core::timeseries::align_series;
use anyhow::{Result, anyhow};
use async_trait::async_trait;

pub struct CommercialPaperSpread;
pub struct SofrSpread;

#[async_trait]
impl CalculatedIndicator for CommercialPaperSpread {
    fn slug(&self) -> &str {
        "cp_bill_spread"
    }

    fn name(&self) -> &str {
        "Commercial Paper Spread"
    }

    fn required_inputs(&self) -> Vec<&str> {
        vec!["cp_3m_rate", "us_3m"]
    }

    async fn calculate(&self, inputs: Vec<Vec<DataPoint>>) -> Result<Vec<DataPoint>> {
        if inputs.len() < 2 {
            return Err(anyhow!("CP Spread requires 2 inputs: CP 3M and T-Bill 3M"));
        }

        let cp_rate = &inputs[0];
        let t_bill = &inputs[1];
        
        let aligned = align_series(cp_rate, t_bill, "inner");
        
        // Spread = CP Rate - Risk Free Rate
        let result = aligned.into_iter().map(|(ts, cp, tb)| {
            DataPoint {
                timestamp: ts,
                value: cp - tb,
            }
        }).collect();

        Ok(result)
    }
}

#[async_trait]
impl CalculatedIndicator for SofrSpread {
    fn slug(&self) -> &str {
        "sofr_spread"
    }

    fn name(&self) -> &str {
        "SOFR - Fed Funds Spread"
    }

    fn required_inputs(&self) -> Vec<&str> {
        vec!["sofr_30d", "fed_funds"] 
    }

    async fn calculate(&self, inputs: Vec<Vec<DataPoint>>) -> Result<Vec<DataPoint>> {
        if inputs.len() < 2 {
            return Err(anyhow!("SOFR Spread requires 2 inputs: SOFR and Fed Funds"));
        }

        let sofr = &inputs[0];
        let effr = &inputs[1];
        
        let aligned = align_series(sofr, effr, "inner");
        
        let result = aligned.into_iter().map(|(ts, s, f)| {
            DataPoint {
                timestamp: ts,
                value: s - f,
            }
        }).collect();

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[tokio::test]
    async fn test_cp_spread_calculation() {
        let calculator = CommercialPaperSpread;
        
        let ts = chrono::Utc.timestamp_opt(1700000000, 0).unwrap();
        
        // Scenario 1: Normal Spread (5.35% - 5.10% = 0.25%)
        let cp_data = vec![DataPoint { timestamp: ts, value: 5.35 }];
        let tb_data = vec![DataPoint { timestamp: ts, value: 5.10 }];
        
        let result = calculator.calculate(vec![cp_data, tb_data]).await.unwrap();
        
        assert_eq!(result.len(), 1);
        assert!((result[0].value - 0.25).abs() < 1e-6, "Expected 0.25, got {}", result[0].value);
    }

    #[tokio::test]
    async fn test_sofr_spread_calculation() {
        let calculator = SofrSpread;
        
        let ts = chrono::Utc.timestamp_opt(1700000000, 0).unwrap();
        
        // Scenario: SOFR 5.31%, Fed Funds 5.33% = -0.02% (Tight liquidity or technical factor)
        let sofr_data = vec![DataPoint { timestamp: ts, value: 5.31 }];
        let effr_data = vec![DataPoint { timestamp: ts, value: 5.33 }];
        
        let result = calculator.calculate(vec![sofr_data, effr_data]).await.unwrap();
        
        assert_eq!(result.len(), 1);
        assert!((result[0].value - (-0.02)).abs() < 1e-6, "Expected -0.02, got {}", result[0].value);
    }
}
