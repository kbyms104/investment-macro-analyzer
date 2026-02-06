use super::CalculatedIndicator;
use crate::models::DataPoint;
use crate::core::timeseries::align_series;
use anyhow::{Result, anyhow};
use async_trait::async_trait;

pub struct YieldCurve10Y2Y;
pub struct YieldCurve10Y3M;

#[async_trait]
impl CalculatedIndicator for YieldCurve10Y2Y {
    fn slug(&self) -> &str {
        "yield_curve_10y_2y"
    }
    fn name(&self) -> &str {
        "Yield Curve Spread (10Y - 2Y)"
    }
    fn required_inputs(&self) -> Vec<&str> {
        vec!["us_10y", "us_2y"]
    }
    async fn calculate(&self, inputs: Vec<Vec<DataPoint>>) -> Result<Vec<DataPoint>> {
        calculate_spread(&inputs, "10Y (DGS10)", "2Y (DGS2)")
    }
}

#[async_trait]
impl CalculatedIndicator for YieldCurve10Y3M {
    fn slug(&self) -> &str {
        "yield_curve_10y_3m"
    }
    fn name(&self) -> &str {
        "Yield Curve Spread (10Y - 3M)"
    }
    fn required_inputs(&self) -> Vec<&str> {
        vec!["us_10y", "us_3m"]
    }
    async fn calculate(&self, inputs: Vec<Vec<DataPoint>>) -> Result<Vec<DataPoint>> {
        calculate_spread(&inputs, "10Y (DGS10)", "3M (DGS3MO)")
    }
}

/// Helper to calculate spread between two series (A - B)
fn calculate_spread(inputs: &[Vec<DataPoint>], name_a: &str, name_b: &str) -> Result<Vec<DataPoint>> {
    if inputs.len() < 2 {
        return Err(anyhow!("Spread calculation requires 2 inputs: {} and {}", name_a, name_b));
    }

    let series_a = &inputs[0];
    let series_b = &inputs[1];
    
    // Align Series
    // inner join ensures we only calculate spread when both rates exist
    let aligned = align_series(series_a, series_b, "inner");
    
    // Calculate Spread: A - B
    let result = aligned.into_iter().map(|(ts, val_a, val_b)| {
        DataPoint {
            timestamp: ts,
            value: val_a - val_b,
        }
    }).collect();

    Ok(result)
}
