use async_trait::async_trait;
use crate::models::DataPoint;
use crate::indicators::CalculatedIndicator;

pub struct FinancialStress;

#[async_trait]
impl CalculatedIndicator for FinancialStress {
    fn slug(&self) -> &str {
        "financial_stress"
    }

    fn name(&self) -> &str {
        "St. Louis Fed Financial Stress Index"
    }

    fn required_inputs(&self) -> Vec<&str> {
        vec!["STLFSI4"]
    }

    async fn calculate(&self, inputs: Vec<Vec<DataPoint>>) -> anyhow::Result<Vec<DataPoint>> {
        // We only expect one input: STLFSI4
        if inputs.is_empty() {
            return Err(anyhow::anyhow!("Missing input data (STLFSI4)"));
        }

        let stlfsi_data = &inputs[0];
        
        // Pass-through: The index itself is the indicator.
        // We can just clone it.
        // Or we could normalize it, but the raw index is 0-centered (avg stress).
        Ok(stlfsi_data.clone())
    }
}
