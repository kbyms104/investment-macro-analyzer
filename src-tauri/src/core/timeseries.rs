use crate::models::DataPoint;
use chrono::{DateTime, Utc};
use std::collections::BTreeMap;

/// Aligns two time series by matching timestamps.
/// Since financial data often has different frequencies (e.g., Daily vs Quarterly),
/// we usually "forward fill" the lower frequency data to match the higher frequency data.
/// 
/// Returns a vector of tuples (timestamp, value_a, value_b).
pub fn align_series(
    series_a: &[DataPoint], 
    series_b: &[DataPoint], 
    _method: &str
) -> Vec<(DateTime<Utc>, f64, f64)> {
    // 1. Convert to simple BTreeMaps for easy lookup by date
    let map_a: BTreeMap<DateTime<Utc>, f64> = series_a.iter().map(|dp| (dp.timestamp, dp.value)).collect();
    let map_b: BTreeMap<DateTime<Utc>, f64> = series_b.iter().map(|dp| (dp.timestamp, dp.value)).collect();
    
    let mut result = Vec::new();
    
    // Determine the union of relevant dates based on method.
    // For "inner" join:
    // Only dates present in BOTH. But usually we want "ffill" (forward fill).
    
    // Let's assume Series A is the "Master" frequency (e.g., Daily Stock Price)
    // and Series B is the "Slow" frequency (e.g., Quarterly GDP).
    // We iterate through Series A, and find the latest available value from Series B.
    
    let mut last_b_val: Option<f64> = None;
    let mut b_iter = map_b.iter().peekable();
    
    for (date_a, val_a) in &map_a {
        // Advance B iterator until we pass date_a
        while let Some((date_b, val_b)) = b_iter.peek() {
            if *date_b <= date_a {
                last_b_val = Some(**val_b);
                b_iter.next();
            } else {
                break;
            }
        }
        
        // If we want a strict join, we check if date_b == date_a. 
        // But for ffill (most econ data), we use last known.
        if let Some(val_b) = last_b_val {
            result.push((*date_a, *val_a, val_b));
        }
    }
    
    result
}


/// Result of multi-series alignment
pub struct MultiAlignedData {
    pub timestamp: DateTime<Utc>,
    pub values: Vec<f64>,
}

/// Aligns multiple time series using forward fill.
/// Resulting timestamps are the union of all input timestamps (sorted).
/// Rows are emitted only when ALL series have at least one value (warm-up period is skipped).
pub fn align_series_multi(
    series_list: Vec<&Vec<DataPoint>>, 
    _method: &str
) -> Vec<MultiAlignedData> {
    if series_list.is_empty() {
        return Vec::new();
    }

    // 1. Collect all unique timestamps
    let mut all_timestamps: std::collections::BTreeSet<DateTime<Utc>> = std::collections::BTreeSet::new();
    for series in &series_list {
        for dp in *series {
            all_timestamps.insert(dp.timestamp);
        }
    }

    let mut result = Vec::new();
    let mut current_values: Vec<Option<f64>> = vec![None; series_list.len()];
    
    // We also need iterators for each series to efficiently find values
    // But since we are iterating through all_timestamps, a map lookup or a peekable iter is fine.
    // Given the sorted nature, peekable iter is most efficient.
    let mut iters: Vec<_> = series_list.iter().map(|s| s.iter().peekable()).collect();

    for ts in all_timestamps {
        
        // Update current values if match found
        for (i, iter) in iters.iter_mut().enumerate() {
            // Unwind iterator until we hit ts or go past it
            while let Some(dp) = iter.peek() {
                if dp.timestamp < ts {
                    // This is an old point, but effectively "current" until widely passed.
                    // Wait, if we are strictly iterating through Union timestamps, 
                    // we should consume points that match `ts`.
                    // Points earlier than `ts` should have been processed in previous loops.
                    // However, if series A has point at T1, and series B has T2 (T1 < T2).
                    // Loop T1: 
                    //   Iter A has T1. Match. Update val A. consume A.
                    //   Iter B has T2. T2 > T1. No match. Keep val B (None).
                    //   Result: val A, None. Skip.
                    // Loop T2:
                    //   Iter A has T3 (or End). T3 > T2. No match. Keep val A (prev T1).
                    //   Iter B has T2. Match. Update val B. consume B.
                    //   Result: val A (T1), val B (T2). Emit!
                    
                    // So logic: Check if peek().timestamp == ts. If so, update current, consume.
                    // If peek().timestamp < ts, this implies we missed it?
                    // No, because `all_timestamps` contains ALL timestamps.
                    // So we should never have peek() < ts unless we messed up order.
                    // Actually, multiple updates can verify this.
                    iter.next(); // Consume old
                } else if dp.timestamp == ts {
                     current_values[i] = Some(dp.value);
                     iter.next(); // Consume
                } else {
                    break; // dp.timestamp > ts, future point
                }
            }
        }

        // Check availability
        if current_values.iter().all(|v| v.is_some()) {
             result.push(MultiAlignedData {
                 timestamp: ts,
                 values: current_values.iter().map(|v| v.unwrap()).collect(),
             });
        }
    }

    result
}

/// Calculate correlation between two series
#[allow(dead_code)]
pub fn correlation(series: &[(DateTime<Utc>, f64, f64)]) -> Option<f64> {
    let n = series.len() as f64;
    if n < 2.0 { return None; }
    
    let sum_x: f64 = series.iter().map(|(_, x, _)| x).sum();
    let sum_y: f64 = series.iter().map(|(_, _, y)| y).sum();
    let sum_xy: f64 = series.iter().map(|(_, x, y)| x * y).sum();
    let sum_xx: f64 = series.iter().map(|(_, x, _)| x * x).sum();
    let sum_yy: f64 = series.iter().map(|(_, _, y)| y * y).sum();
    
    let numerator = n * sum_xy - sum_x * sum_y;
    let denominator = ((n * sum_xx - sum_x * sum_x) * (n * sum_yy - sum_y * sum_y)).sqrt();
    
    if denominator == 0.0 { None } else { Some(numerator / denominator) }
}
