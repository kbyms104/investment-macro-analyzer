use crate::models::DataPoint;
use crate::indicators::CalculatedIndicator;
use anyhow::{Result, anyhow};
use async_trait::async_trait;
use chrono::{Datelike, Utc};

// ============================================================================
// Rule of 20: P/E Ratio + CPI YoY (Valuation)
// ============================================================================
pub struct RuleOf20;

#[async_trait]
impl CalculatedIndicator for RuleOf20 {
    fn slug(&self) -> &str {
        "rule_of_20"
    }

    fn name(&self) -> &str {
        "Rule of 20"
    }

    fn required_inputs(&self) -> Vec<&str> {
        vec![
            "SP500PE12M", // S&P 500 PE Ratio
            "cpi"         // CPI YoY (via FRED)
        ]
    }

    async fn calculate(&self, inputs: Vec<Vec<DataPoint>>) -> Result<Vec<DataPoint>> {
        if inputs.len() != 2 {
            return Err(anyhow!("Rule of 20 requires SP500PE12M and CPI"));
        }

        let pe_data = &inputs[0];
        let cpi_data = &inputs[1];
        
        // 1. Convert CPI Index to YoY Inflation Rate
        // Inflation = ((CPI_today - CPI_1year_ago) / CPI_1year_ago) * 100
        let mut cpi_yoy_map = std::collections::HashMap::new();

        for i in 12..cpi_data.len() {
            let current = &cpi_data[i];
            
            // Look for data point ~1 year ago
            // We compare year and month directly from timestamp
            if let Some(prev) = cpi_data.iter().find(|d| d.timestamp.year() == current.timestamp.year() - 1 && d.timestamp.month() == current.timestamp.month()) {
                if prev.value != 0.0 {
                    let inflation = ((current.value - prev.value) / prev.value) * 100.0;
                    // Store purely by date (stripped of time) for easier lookup? 
                    // Or usually timestamp is 00:00:00. Let's assume day match is close enough or use month keys.
                    // For safety, let's just store the timestamp.
                    cpi_yoy_map.insert(current.timestamp, inflation);
                }
            }
        }

        let mut result = Vec::new();

        // 2. Calculate Rule of 20: PE + Inflation
        for pe in pe_data {
            // Find matching CPI YoY (latest available before or on pe.timestamp)
            let mut close_cpi = None;
            let mut close_date_diff = i64::MAX;

            for (ts, inflation) in &cpi_yoy_map {
                if *ts <= pe.timestamp {
                    let diff = (pe.timestamp - *ts).num_days();
                    // Allow up to ~ 2 months lag for CPI data matching PE data
                    if diff < close_date_diff && diff < 65 { 
                        close_date_diff = diff;
                        close_cpi = Some(inflation);
                    }
                }
            }

            if let Some(inf) = close_cpi {
                let value = pe.value + inf;
                result.push(DataPoint {
                    timestamp: pe.timestamp,
                    value,
                });
            }
        }
        
        result.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
        Ok(result)
    }
}

// ============================================================================
// VIX Term Structure: VIX 3M / VIX (Sentiment/Fear)
// ============================================================================
pub struct VixTermStructure;

#[async_trait]
impl CalculatedIndicator for VixTermStructure {
    fn slug(&self) -> &str {
        "vix_term_structure"
    }

    fn name(&self) -> &str {
        "VIX Term Structure"
    }

    fn required_inputs(&self) -> Vec<&str> {
        vec![
            "vix_3m", // VIX 3 Month
            "vix"     // VIX Standard
        ]
    }

    async fn calculate(&self, inputs: Vec<Vec<DataPoint>>) -> Result<Vec<DataPoint>> {
        if inputs.len() != 2 {
            return Err(anyhow!("VIX Term Structure requires VIX3M and VIX"));
        }

        let vix3m_data = &inputs[0];
        let vix_data = &inputs[1];
        
        let mut result = Vec::new();

        // Join on exact timestamp (assuming daily data aligns)
        for v3 in vix3m_data {
             // Simple exact match
             if let Some(v1) = vix_data.iter().find(|d| d.timestamp == v3.timestamp) {
                 if v1.value != 0.0 {
                     let ratio = v3.value / v1.value;
                     result.push(DataPoint {
                         timestamp: v3.timestamp,
                         value: ratio,
                     });
                 }
             } else {
                // Fallback: try finding same day if time differs?
                // Often Yahoo data has 00:00:00 UTC vs other sources.
                // If both are from Yahoo/Fred they usually align.
                // Let's add a "same day" check fallback if exact match fails
                 if let Some(v1) = vix_data.iter().find(|d| d.timestamp.date_naive() == v3.timestamp.date_naive()) {
                     if v1.value != 0.0 {
                         let ratio = v3.value / v1.value;
                         result.push(DataPoint {
                             timestamp: v3.timestamp, // Keep V3 timestamp
                             value: ratio,
                         });
                    }
                 }
             }
        }
        
        result.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
        Ok(result)
    }
}

// ============================================================================
// NDX/SPX Ratio (Risk Appetite)
// ============================================================================
pub struct NdxSpxRatio;

#[async_trait]
impl CalculatedIndicator for NdxSpxRatio {
    fn slug(&self) -> &str {
        "ndx_spx_ratio"
    }

    fn name(&self) -> &str {
        "NDX / SPX Ratio"
    }

    fn required_inputs(&self) -> Vec<&str> {
        vec![
            "ndx", // Nasdaq 100
            "spx"  // S&P 500
        ]
    }

    async fn calculate(&self, inputs: Vec<Vec<DataPoint>>) -> Result<Vec<DataPoint>> {
        if inputs.len() != 2 {
             return Err(anyhow!("NDX/SPX Ratio requires 2 inputs"));
        }
        
        let ndx = &inputs[0];
        let spx = &inputs[1];
        
        let mut result = Vec::new();

        for n in ndx {
             // Exact match
             if let Some(s) = spx.iter().find(|d| d.timestamp == n.timestamp) {
                 if s.value != 0.0 {
                     result.push(DataPoint {
                         timestamp: n.timestamp,
                         value: n.value / s.value,
                     });
                 }
             } else {
                // Same day fallback
                if let Some(s) = spx.iter().find(|d| d.timestamp.date_naive() == n.timestamp.date_naive()) {
                    if s.value != 0.0 {
                         result.push(DataPoint {
                             timestamp: n.timestamp,
                             value: n.value / s.value,
                         });
                    }
                }
             }
        }
        
        result.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
        Ok(result)
    }
}
