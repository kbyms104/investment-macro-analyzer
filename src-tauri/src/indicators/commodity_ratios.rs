use super::CalculatedIndicator;
use crate::models::DataPoint;
use crate::core::timeseries::align_series;
use anyhow::{Result, anyhow};
use async_trait::async_trait;

pub struct GoldSilverRatio;

#[async_trait]
impl CalculatedIndicator for GoldSilverRatio {
    fn slug(&self) -> &str {
        "gold_silver_ratio"
    }

    fn name(&self) -> &str {
        "Gold/Silver Ratio"
    }

    fn required_inputs(&self) -> Vec<&str> {
        vec!["gold", "silver"]
    }

    async fn calculate(&self, inputs: Vec<Vec<DataPoint>>) -> Result<Vec<DataPoint>> {
        if inputs.len() < 2 {
            return Err(anyhow!("Gold/Silver Ratio requires 2 inputs: Gold and Silver"));
        }

        let gold = &inputs[0];
        let silver = &inputs[1];
        
        // Align Series
        let aligned = align_series(gold, silver, "inner");
        
        let result = aligned.into_iter().map(|(ts, g, s)| {
            DataPoint {
                timestamp: ts,
                value: if s != 0.0 { g / s } else { 0.0 },
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
    async fn test_gold_silver_ratio() {
        let calculator = GoldSilverRatio;
        
        let ts = chrono::Utc.timestamp_opt(1700000000, 0).unwrap();
        
        // Scenario: Gold $2000, Silver $25 -> Ratio 80
        let gold_data = vec![DataPoint { timestamp: ts, value: 2000.0 }];
        let silver_data = vec![DataPoint { timestamp: ts, value: 25.0 }];
        
        let result = calculator.calculate(vec![gold_data, silver_data]).await.unwrap();
        
        assert_eq!(result.len(), 1);
        assert!((result[0].value - 80.0).abs() < 1e-6);
    }

    #[tokio::test]
    async fn test_zero_division_safety() {
        let calculator = GoldSilverRatio;
        let ts = chrono::Utc.timestamp_opt(1700000000, 0).unwrap();
        
        let gold_data = vec![DataPoint { timestamp: ts, value: 2000.0 }];
        let silver_data = vec![DataPoint { timestamp: ts, value: 0.0 }]; // Panic check
        
        let result = calculator.calculate(vec![gold_data, silver_data]).await.unwrap();
        
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].value, 0.0); // Should handle gracefully
    }
}
