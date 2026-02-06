use crate::models::DataPoint;
use std::collections::HashMap;

/// Calculate Pearson Correlation Coefficient between two time series
/// Returns (Correlation, Count of overlapping points)
pub fn calculate_pearson_correlation(
    series_a: &[DataPoint], 
    series_b: &[DataPoint]
) -> (Option<f64>, usize) {
    if series_a.is_empty() || series_b.is_empty() {
        return (None, 0);
    }

    // 1. Align data by Date (NaiveDate) to ignore time differences (e.g. 16:00 vs 00:00)
    // Using a HashMap for O(1) lookups
    let a_map: HashMap<chrono::NaiveDate, f64> = series_a.iter()
        .map(|dp| (dp.timestamp.date_naive(), dp.value))
        .collect();

    let mut x = Vec::new();
    let mut y = Vec::new();

    // Find intersection
    for dp_b in series_b {
        if let Some(&val_a) = a_map.get(&dp_b.timestamp.date_naive()) {
            x.push(val_a);
            y.push(dp_b.value);
        }
    }

    let n = x.len();
    if n < 2 {
        return (None, n);
    }

    // 2. Compute sums
    let sum_x: f64 = x.iter().sum();
    let sum_y: f64 = y.iter().sum();
    
    let mean_x = sum_x / n as f64;
    let mean_y = sum_y / n as f64;

    let mut numer = 0.0;
    let mut denom_x = 0.0;
    let mut denom_y = 0.0;

    for i in 0..n {
        let dx = x[i] - mean_x;
        let dy = y[i] - mean_y;
        
        numer += dx * dy;
        denom_x += dx * dx;
        denom_y += dy * dy;
    }

    if denom_x == 0.0 || denom_y == 0.0 {
        return (Some(0.0), n);
    }

    let correlation = numer / (denom_x.sqrt() * denom_y.sqrt());
    
    // Clamp result to [-1.0, 1.0] to handle floating point errors
    let clamped = correlation.max(-1.0).min(1.0);

    (Some(clamped), n)
}

/// Calculate Z-Score (Standard Score)
/// (Current - Mean) / StdDev
pub fn calculate_zscore(
    data: &[DataPoint], 
    window_days: i64
) -> Option<f64> {
    if data.is_empty() {
        return None;
    }

    // Get latest value
    let latest = data.last()?.value;

    // Filter data within window (e.g., 3 years = 1095 days)
    // For simplicity, if window_days is 0, use full history
    let window_data: Vec<f64> = if window_days > 0 {
        let cutoff = chrono::Utc::now() - chrono::Duration::days(window_days);
        data.iter()
            .filter(|dp| dp.timestamp >= cutoff)
            .map(|dp| dp.value)
            .collect()
    } else {
        data.iter().map(|dp| dp.value).collect()
    };

    if window_data.len() < 2 {
        return None;
    }

    // Calculate Mean
    let sum: f64 = window_data.iter().sum();
    let mean = sum / window_data.len() as f64;

    // Calculate StdDev
    let variance: f64 = window_data.iter()
        .map(|value| {
            let diff = mean - *value;
            diff * diff
        })
        .sum::<f64>() / (window_data.len() - 1) as f64;
    
    let std_dev = variance.sqrt();

    if std_dev == 0.0 {
        return Some(0.0);
    }

    Some((latest - mean) / std_dev)
}

/// Calculate Percentile Rank (0.0 - 100.0)
pub fn calculate_percentile(data: &[DataPoint], window_days: i64) -> Option<f64> {
    if data.is_empty() {
        return None;
    }

    let latest = data.last()?.value;

     // Filter data
    let window_data: Vec<f64> = if window_days > 0 {
        let cutoff = chrono::Utc::now() - chrono::Duration::days(window_days);
        data.iter()
            .filter(|dp| dp.timestamp >= cutoff)
            .map(|dp| dp.value)
            .collect()
    } else {
        data.iter().map(|dp| dp.value).collect()
    };

    if window_data.len() < 2 {
        return None;
    }

    // Count values strictly less than latest
    let count_less = window_data.iter().filter(|&&v| v < latest).count();
    
    // Percentile Formula: (Rank / N) * 100
    Some((count_less as f64 / window_data.len() as f64) * 100.0)
}

/// Calculate Rolling Pearson Correlation
/// Returns Vec of (Date, Correlation)
pub fn calculate_rolling_pearson(
    series_a: &[DataPoint], 
    series_b: &[DataPoint],
    window_days: i64
) -> Vec<(String, f64)> {
    if series_a.is_empty() || series_b.is_empty() || window_days < 2 {
        return Vec::new();
    }

    // 1. Align data by Date
    let a_map: HashMap<chrono::NaiveDate, f64> = series_a.iter()
        .map(|dp| (dp.timestamp.date_naive(), dp.value))
        .collect();

    // Create aligned vector of (Date, val_a, val_b)
    // Sort by date to ensuring sliding window works correctly
    let mut aligned: Vec<(chrono::naive::NaiveDate, f64, f64)> = Vec::new();

    for dp_b in series_b {
        let date = dp_b.timestamp.date_naive();
        if let Some(&val_a) = a_map.get(&date) {
            aligned.push((date, val_a, dp_b.value));
        }
    }

    // Sort is essential for rolling window
    aligned.sort_by_key(|k| k.0);

    let mut results = Vec::new();
    let n = aligned.len();

    if n == 0 { return results; }

    let first_date = aligned[0].0;
    
    // 2. Sliding Window Calculation
    // We need to look back `window_days` from each point.
    // Iterating through all points.
    for i in 0..n {
        let current_date = aligned[i].0;

        // Skip warm-up period to enforce strictly "rolling" window (not expanding)
        // This ensures the X-axis shifts when window size changes
        if current_date < first_date + chrono::Duration::days(window_days) {
            continue;
        }

        let cutoff_date = current_date - chrono::Duration::days(window_days);

        // Optimization: Find start index using binary search or simple loop?
        // Since it's sliding, simple loop or keeping a start pointer is better.
        // But for clarity and simplicity (N < 5000), a backward scan or filter is fine.
        
        // Let's use a sub-slice.
        // Find the index of the first element >= cutoff_date
        let start_idx = aligned.partition_point(|x| x.0 < cutoff_date);
        
        // Slice: [start_idx ..= i]
        let window_slice = &aligned[start_idx..=i];

        if window_slice.len() < 2 {
            continue;
        }

        // Compute Pearson for window
        let count = window_slice.len();
        let sum_x: f64 = window_slice.iter().map(|k| k.1).sum();
        let sum_y: f64 = window_slice.iter().map(|k| k.2).sum();
        
        let mean_x = sum_x / count as f64;
        let mean_y = sum_y / count as f64;

        let mut numer = 0.0;
        let mut denom_x = 0.0;
        let mut denom_y = 0.0;

        for (_, x, y) in window_slice {
            let dx = x - mean_x;
            let dy = y - mean_y;
            numer += dx * dy;
            denom_x += dx * dx;
            denom_y += dy * dy;
        }

        if denom_x > 0.0 && denom_y > 0.0 {
            let correlation = numer / (denom_x.sqrt() * denom_y.sqrt());
            let clamped = correlation.max(-1.0).min(1.0);
            results.push((current_date.format("%Y-%m-%d").to_string(), clamped));
        } else {
             results.push((current_date.format("%Y-%m-%d").to_string(), 0.0));
        }
    }

    results
}

/// Calculate Mean and Standard Deviation
pub fn calculate_mean_std(data: &[DataPoint], window_days: i64) -> Option<(f64, f64)> {
    if data.is_empty() { return None; }
    
    let window_data: Vec<f64> = if window_days > 0 {
        let cutoff = chrono::Utc::now() - chrono::Duration::days(window_days);
        data.iter()
            .filter(|dp| dp.timestamp >= cutoff)
            .map(|dp| dp.value)
            .collect()
    } else {
        data.iter().map(|dp| dp.value).collect()
    };

    if window_data.len() < 2 { return None; }

    let sum: f64 = window_data.iter().sum();
    let mean = sum / window_data.len() as f64;

    let variance: f64 = window_data.iter()
        .map(|value| {
            let diff = mean - *value;
            diff * diff
        })
        .sum::<f64>() / (window_data.len() - 1) as f64;
    
    let std_dev = variance.sqrt();
    
    Some((mean, std_dev))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn create_datapoint(date: &str, value: f64) -> DataPoint {
        DataPoint {
            timestamp: chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
                .unwrap()
                .and_hms_opt(0, 0, 0)
                .unwrap()
                .and_utc(),
            value,
        }
    }

    #[test]
    fn test_pearson_correlation() {
        // Perfect positive correlation
        let a = vec![
            create_datapoint("2023-01-01", 1.0),
            create_datapoint("2023-01-02", 2.0),
            create_datapoint("2023-01-03", 3.0),
        ];
        let b = vec![
            create_datapoint("2023-01-01", 2.0),
            create_datapoint("2023-01-02", 4.0),
            create_datapoint("2023-01-03", 6.0),
        ];

        let (corr, count) = calculate_pearson_correlation(&a, &b);
        assert_eq!(count, 3);
        assert!((corr.unwrap() - 1.0).abs() < 1e-9);

        // Perfect negative correlation
        let c = vec![
            create_datapoint("2023-01-01", 3.0),
            create_datapoint("2023-01-02", 2.0),
            create_datapoint("2023-01-03", 1.0),
        ];
        let (corr_neg, _) = calculate_pearson_correlation(&a, &c);
        assert!((corr_neg.unwrap() - (-1.0)).abs() < 1e-9);
    }

    #[test]
    fn test_zscore() {
        let data = vec![
            create_datapoint("2023-01-01", 10.0),
            create_datapoint("2023-01-02", 20.0),
            create_datapoint("2023-01-03", 30.0), // Mean = 20, StdDev = 10
        ];

        // Latest is 30. (30 - 20) / 10 = 1.0
        let z = calculate_zscore(&data, 0);
        assert!((z.unwrap() - 1.0).abs() < 1e-9);
    }

    #[test]
    fn test_percentile() {
        let data = vec![
            create_datapoint("2023-01-01", 10.0),
            create_datapoint("2023-01-02", 20.0),
            create_datapoint("2023-01-03", 30.0), // Rank 2 (0, 1, 2) -> 2/3 = 66.6%
            create_datapoint("2023-01-04", 40.0), // Latest = 40. Values < 40: 10,20,30 (3 items). Total 4. 3/4 = 75%
        ];

        let p = calculate_percentile(&data, 0);
        assert_eq!(p.unwrap(), 75.0);
    }

    #[test]
    fn test_rolling_pearson() {
        // Create two series that start perfectly correlated then switch to perfectly negative
        // let days = 10; // Unused
        let mut a = Vec::new();
        let mut b = Vec::new();

        // Day 1-5: Positive correlation (x, x)
        for i in 1..=5 {
            let date = format!("2023-01-{:02}", i);
            a.push(create_datapoint(&date, i as f64));
            b.push(create_datapoint(&date, i as f64));
        }
        
        // Day 6-10: Negative correlation (x, -x)
        for i in 6..=10 {
            let date = format!("2023-01-{:02}", i);
            a.push(create_datapoint(&date, i as f64));
            b.push(create_datapoint(&date, -(i as f64)));
        }

        // Window size 3. 
        // Window ending at Day 3: [1,2,3] vs [1,2,3] -> Corr 1.0
        // Window ending at Day 5: [3,4,5] vs [3,4,5] -> Corr 1.0
        // Window ending at Day 8: [6,7,8] vs [-6,-7,-8] -> Corr -1.0
        
        // Note: window_days is days delta. For 3 daily points, we need 2 days delta.
        // Jan 8 - 2 days = Jan 6. Includes Jan 6, 7, 8.
        let rolling = calculate_rolling_pearson(&a, &b, 2);
        
        // Should have results starting from window size.
        // aligned length is 10.
        // i=0 (Day1) -> window size 1 (<2) -> skip
        // i=1 (Day2) -> window size 2 -> calc
        
        // Let's check Day 3 (Index 2) -> 2023-01-03
        // Window [Jan 1, 2, 3] -> Corr 1.0
        let day3 = rolling.iter().find(|r| r.0 == "2023-01-03").unwrap();
        assert!((day3.1 - 1.0).abs() < 1e-9);

        // Check Day 8 (Index 7) -> 2023-01-08. Window [6,7,8]. A=[6,7,8], B=[-6,-7,-8]. Corr should be -1.0
        let day8 = rolling.iter().find(|r| r.0 == "2023-01-08").unwrap();
        assert!((day8.1 - (-1.0)).abs() < 1e-9);
    }
}

