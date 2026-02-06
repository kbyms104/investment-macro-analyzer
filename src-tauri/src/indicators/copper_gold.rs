use async_trait::async_trait;
use crate::models::DataPoint;
use crate::indicators::CalculatedIndicator;
use crate::core::timeseries;

pub struct CopperGoldRatio;

#[async_trait]
impl CalculatedIndicator for CopperGoldRatio {
    fn slug(&self) -> &str {
        "copper_gold_ratio"
    }

    fn name(&self) -> &str {
        "Copper/Gold Ratio"
    }

    fn required_inputs(&self) -> Vec<&str> {
        vec!["copper", "gold"]
    }

    async fn calculate(&self, inputs: Vec<Vec<DataPoint>>) -> anyhow::Result<Vec<DataPoint>> {
        if inputs.len() < 2 {
            return Err(anyhow::anyhow!("Missing input data (copper, gold)"));
        }

        let copper_data = &inputs[0];
        let gold_data = &inputs[1];

        // Align the time series using the correct function signature
        // Returns Vec<(DateTime<Utc>, f64, f64)> where f64s are (copper, gold)
        let aligned = timeseries::align_series(copper_data, gold_data, "ffill");
        
        if aligned.is_empty() {
            return Err(anyhow::anyhow!("No overlapping data after alignment"));
        }

        // Calculate ratio: Copper / Gold * 1000 (scaling for readability)
        let result: Vec<DataPoint> = aligned.iter()
            .filter_map(|(ts, copper_val, gold_val)| {
                if *gold_val != 0.0 {
                    Some(DataPoint {
                        timestamp: *ts,
                        value: (copper_val / gold_val) * 1000.0, // Scale to make it readable
                    })
                } else {
                    None
                }
            })
            .collect();

        Ok(result)
    }
}
