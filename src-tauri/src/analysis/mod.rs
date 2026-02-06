pub mod technical;
pub mod market_status;
pub mod statistics;
pub mod regime;
pub mod insight;
pub mod technicals;

use tauri::State;
use sqlx::SqlitePool;
use crate::models::DataPoint;

#[tauri::command]
pub async fn calculate_correlation(
    pool: State<'_, SqlitePool>,
    asset_a: String,
    asset_b: String,
    range: String,
    lag: Option<i64>
) -> Result<serde_json::Value, String> {
    let lag_days = lag.unwrap_or(0);
    
    // 1. Parse Range
    let now = chrono::Utc::now();
    let cutoff = match range.as_str() {
        "1M" => Some(now - chrono::Duration::days(30)),
        "3M" => Some(now - chrono::Duration::days(90)),
        "6M" => Some(now - chrono::Duration::days(180)),
        "1Y" => Some(now - chrono::Duration::days(365)),
        "3Y" => Some(now - chrono::Duration::days(365 * 3)),
        "5Y" => Some(now - chrono::Duration::days(365 * 5)),
        "ALL" => None,
        _ => None,
    };

    // 2. Fetch Data & Names
    let (name_a, data_a) = tokio::join!(
        sqlx::query_scalar::<_, String>("SELECT name FROM indicators WHERE slug = $1").bind(&asset_a).fetch_optional(&*pool),
        crate::db::get_historical_data(&pool, &asset_a)
    );
    let (name_b, data_b) = tokio::join!(
        sqlx::query_scalar::<_, String>("SELECT name FROM indicators WHERE slug = $1").bind(&asset_b).fetch_optional(&*pool),
        crate::db::get_historical_data(&pool, &asset_b)
    );

    let name_a = name_a.map_err(|e| e.to_string())?.unwrap_or(asset_a.clone());
    let data_a = data_a.map_err(|e| e.to_string())?;
    
    let name_b = name_b.map_err(|e| e.to_string())?.unwrap_or(asset_b.clone());
    let data_b = data_b.map_err(|e| e.to_string())?;

    if data_a.is_empty() || data_b.is_empty() {
        return Err("Insufficient data".to_string());
    }

    // 3. Align Data with Lag
    // We want to compare A[t] vs B[t - lag].
    // Meaning for a given date T of A, we look for B at (T - lag).
    // Example: Lag +1 (A leads / B lags). A[Jan 2] compares with B[Jan 1].
    
    use std::collections::HashMap;
    let b_map: HashMap<String, f64> = data_b.iter()
        .map(|d| (d.timestamp.format("%Y-%m-%d").to_string(), d.value))
        .collect();

    let mut paired_data = Vec::new();
    
    // Stats accumulators
    let mut vec_a = Vec::new();
    let mut vec_b = Vec::new();

    for p_a in data_a.iter() {
        if let Some(c) = cutoff {
            if p_a.timestamp < c { continue; }
        }

        let target_date = p_a.timestamp - chrono::Duration::days(lag_days);
        let target_date_str = target_date.format("%Y-%m-%d").to_string();

        if let Some(&val_b) = b_map.get(&target_date_str) {
            paired_data.push(serde_json::json!({
                "date": p_a.timestamp.format("%Y-%m-%d").to_string(),
                "val_a": p_a.value,
                "val_b": val_b,
                "normalized_a": p_a.value, // TODO: normalize if needed
                "normalized_b": val_b
            }));
            vec_a.push(p_a.value);
            vec_b.push(val_b);
        }
    }

    if vec_a.len() < 2 {
        return Err("Not enough overlapping data points".to_string());
    }

    // 4. Calculate Statistics
    let count = vec_a.len();
    
    // Correlation
    let mean_a = vec_a.iter().sum::<f64>() / count as f64;
    let mean_b = vec_b.iter().sum::<f64>() / count as f64;
    
    let mut num = 0.0;
    let mut den_a = 0.0;
    let mut den_b = 0.0;

    for i in 0..count {
        let da = vec_a[i] - mean_a;
        let db = vec_b[i] - mean_b;
        num += da * db;
        den_a += da * da;
        den_b += db * db;
    }

    let correlation = if den_a > 0.0 && den_b > 0.0 {
        num / (den_a.sqrt() * den_b.sqrt())
    } else {
        0.0
    };

    // Volatility Ratio (StdDev A / StdDev B)
    let std_a = (den_a / count as f64).sqrt();
    let std_b = (den_b / count as f64).sqrt();
    let volatility_ratio = if std_b != 0.0 { std_a / std_b } else { 0.0 };

    // Recent Trend Correlation (Last 30 points or 20%)
    let trend_window = std::cmp::min(30, count);
    let start_idx = count - trend_window;
    
    let trend_corr = if trend_window > 5 {
        let sub_a = &vec_a[start_idx..];
        let sub_b = &vec_b[start_idx..];
        // ... (simplified calculation for subset) ...
        // Re-using calculate_pearson would be better, but implementing inline for brevity
        let tm_a = sub_a.iter().sum::<f64>() / trend_window as f64;
        let tm_b = sub_b.iter().sum::<f64>() / trend_window as f64;
        let mut t_num = 0.0;
        let mut t_den_a = 0.0;
        let mut t_den_b = 0.0;
        for i in 0..trend_window {
            let da = sub_a[i] - tm_a;
            let db = sub_b[i] - tm_b;
            t_num += da * db;
            t_den_a += da * da;
            t_den_b += db * db;
        }
        if t_den_a > 0.0 && t_den_b > 0.0 {
            t_num / (t_den_a.sqrt() * t_den_b.sqrt())
        } else {
            0.0
        }
    } else {
        correlation // fallback
    };

    // Divergence Sigma (Last value diff vs Mean diff)
    // Z-Score of the Spread (A - B_adjusted)
    // Adjust B to match A's scale roughly? Or just correlation of changes?
    // Let's use simple Z-score of (ValA - ValB * (StdA/StdB) * Sign(Corr))
    // If correlated, spreads should be stable.
    let scale_factor = if std_b != 0.0 { std_a / std_b } else { 1.0 };
    let sign = if correlation >= 0.0 { 1.0 } else { -1.0 };
    
    let spreads: Vec<f64> = vec_a.iter().zip(vec_b.iter())
        .map(|(a, b)| a - (b * scale_factor * sign))
        .collect();
    
    let spread_mean = spreads.iter().sum::<f64>() / count as f64;
    let spread_var = spreads.iter().map(|s| (s - spread_mean).powi(2)).sum::<f64>() / count as f64;
    let spread_std = spread_var.sqrt();
    
    let last_spread = spreads.last().unwrap_or(&0.0);
    let divergence_sigma = if spread_std != 0.0 {
        (*last_spread - spread_mean) / spread_std
    } else {
        0.0
    };

    Ok(serde_json::json!({
        "correlation_coefficient": correlation,
        "data_points": paired_data,
        "data_points_count": count,
        "message": "Success",
        "asset_a_name": name_a,
        "asset_b_name": name_b,
        "lag": lag_days,
        "divergence_sigma": divergence_sigma,
        "volatility_ratio": volatility_ratio,
        "recent_trend": trend_corr
    }))
}

// ... Re-export all analysis commands
use crate::models::MatrixResult;
use std::collections::HashMap;

// ... Re-export all analysis commands
#[tauri::command]
pub async fn calculate_correlation_matrix(
    pool: State<'_, SqlitePool>,
    slugs: Vec<String>,
    window_days: Option<i64>
) -> Result<MatrixResult, String> {
    if slugs.len() < 2 {
        return Err("At least 2 indicators are required".to_string());
    }

    // 1. Fetch Metadata (Names) for Labels
    let mut labels = Vec::new();
    for slug in &slugs {
        let name: Option<String> = sqlx::query_scalar("SELECT name FROM indicators WHERE slug = $1")
            .bind(slug)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        labels.push(name.unwrap_or(slug.clone()));
    }

    // 2. Fetch and Filter Data
    let mut data_map: HashMap<String, Vec<DataPoint>> = HashMap::new();
    let cutoff = if let Some(days) = window_days {
        Some(chrono::Utc::now() - chrono::Duration::days(days))
    } else {
        None
    };

    for slug in &slugs {
        let raw_data = crate::db::get_historical_data(&pool, slug).await
            .map_err(|e| e.to_string())?;
        
        // Filter by date if needed
        let filtered: Vec<DataPoint> = if let Some(date_limit) = cutoff {
            raw_data.into_iter().filter(|dp| dp.timestamp >= date_limit).collect()
        } else {
            raw_data
        };
        
        data_map.insert(slug.clone(), filtered);
    }

    // 3. Compute Matrix
    let n = slugs.len();
    let mut matrix = vec![vec![0.0; n]; n];
    let mut min_overlap = usize::MAX; 

    for i in 0..n {
        for j in 0..n {
            if i == j {
                matrix[i][j] = 1.0;
                continue;
            }

            if j < i {
                matrix[i][j] = matrix[j][i];
                continue;
            }

            let series_a = data_map.get(&slugs[i]).ok_or("Data missing")?;
            let series_b = data_map.get(&slugs[j]).ok_or("Data missing")?;

            // Alignment Logic inside Pearson Calculation
            let (corr, count) = statistics::calculate_pearson_correlation(series_a, series_b);
            let val = corr.unwrap_or(0.0);
            
            matrix[i][j] = val;
            matrix[j][i] = val; // Symmetry

            if count < min_overlap {
                min_overlap = count;
            }
        }
    }
    
    if min_overlap == usize::MAX {
        min_overlap = 0;
    }

    Ok(MatrixResult {
        labels,
        slugs,
        matrix,
        data_points: min_overlap
    })
}

#[tauri::command]
pub async fn calculate_ranked_correlations(
    pool: State<'_, SqlitePool>,
    target_slug: String,
    range: String
) -> Result<serde_json::Value, String> {
    
    // 1. Parse Range
    let now = chrono::Utc::now();
    let cutoff = match range.as_str() {
        "1M" => Some(now - chrono::Duration::days(30)),
        "3M" => Some(now - chrono::Duration::days(90)),
        "6M" => Some(now - chrono::Duration::days(180)),
        "1Y" => Some(now - chrono::Duration::days(365)),
        "3Y" => Some(now - chrono::Duration::days(365 * 3)),
        "5Y" => Some(now - chrono::Duration::days(365 * 5)),
        "ALL" => None,
        _ => None,
    };

    // 2. Fetch Target Data & Name
    let target_name: String = sqlx::query_scalar("SELECT name FROM indicators WHERE slug = $1")
        .bind(&target_slug)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or(target_slug.clone());

    let target_data = crate::db::get_historical_data(&pool, &target_slug).await
        .map_err(|e| e.to_string())?;
    
    // Filter Target Data
    let target_filtered: Vec<DataPoint> = if let Some(d) = cutoff {
        target_data.into_iter().filter(|dp| dp.timestamp >= d).collect()
    } else {
        target_data
    };

    if target_filtered.is_empty() {
        return Err("No data for target indicator in selected range".to_string());
    }

    // 3. Fetch Candidates (Active Only)
    let candidates: Vec<(String, String)> = sqlx::query_as("SELECT slug, name FROM indicators WHERE is_active = 1 AND slug != $1")
        .bind(&target_slug)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut ranks = Vec::new();
    let mut min_data_points = usize::MAX;

    // 4. Loop & Calculate
    // Note: This is sequential and unoptimized (N+1 queries). Acceptable for <100 indicators.
    for (slug, name) in candidates {
        let raw_data = crate::db::get_historical_data(&pool, &slug).await
            .map_err(|e| e.to_string())?;
        
        // Filter Candidate
        let candidate_filtered: Vec<DataPoint> = if let Some(d) = cutoff {
            raw_data.into_iter().filter(|dp| dp.timestamp >= d).collect()
        } else {
            raw_data
        };

        if candidate_filtered.len() < 10 { continue; } // Skip insufficient data

        let (corr_opt, count) = statistics::calculate_pearson_correlation(&target_filtered, &candidate_filtered);
        
        if let Some(corr) = corr_opt {
             ranks.push(serde_json::json!({
                 "slug": slug,
                 "name": name,
                 "coefficient": corr,
                 "direction": if corr > 0.0 { "Positive" } else { "Negative" }
             }));
             if count < min_data_points { min_data_points = count; }
        }
    }

    if min_data_points == usize::MAX { min_data_points = 0; }

    // 5. Sort by ABS correlation descending
    ranks.sort_by(|a, b| {
        let coef_a = a["coefficient"].as_f64().unwrap_or(0.0).abs();
        let coef_b = b["coefficient"].as_f64().unwrap_or(0.0).abs();
        coef_b.partial_cmp(&coef_a).unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(serde_json::json!({
        "reference_name": target_name,
        "reference_slug": target_slug,
        "correlations": ranks,
        "data_points": min_data_points
    }))
}

#[tauri::command]
pub async fn get_multi_chart_data(
    pool: State<'_, SqlitePool>,
    slugs: Vec<String>,
    range: String
) -> Result<serde_json::Value, String> {
    
    let mut series_map = std::collections::HashMap::new();
    let mut name_map = std::collections::HashMap::new();
    
    // Determine cutoff date based on range
    let now = chrono::Utc::now();
    let cutoff = match range.as_str() {
        "1M" => Some(now - chrono::Duration::days(30)),
        "3M" => Some(now - chrono::Duration::days(90)),
        "6M" => Some(now - chrono::Duration::days(180)),
        "1Y" => Some(now - chrono::Duration::days(365)),
        "3Y" => Some(now - chrono::Duration::days(365 * 3)),
        "5Y" => Some(now - chrono::Duration::days(365 * 5)),
        "ALL" => None,
        _ => None, // Default to ALL if unknown
    };

    for slug in slugs {
         // Fetch Name
         let name: Option<String> = sqlx::query_scalar("SELECT name FROM indicators WHERE slug = $1")
            .bind(&slug)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?;
         
         name_map.insert(slug.clone(), name.unwrap_or(slug.clone()));

         // Fetch Data
         let raw_data = crate::db::get_historical_data(&pool, &slug).await
            .map_err(|e| e.to_string())?;

         let filtered_data = if let Some(date_limit) = cutoff {
             raw_data.into_iter()
                .filter(|dp| dp.timestamp >= date_limit)
                .collect::<Vec<_>>()
         } else {
             raw_data
         };

         series_map.insert(slug, filtered_data);
    }
    
    Ok(serde_json::json!({
        "data": series_map,
        "names": name_map
    }))
}

#[tauri::command]
pub async fn find_optimal_lag(
    pool: State<'_, SqlitePool>,
    target_slug: String,
    indicator_slug: String,
    range: String,
    max_lag: i32
) -> Result<serde_json::Value, String> {
    
     // 1. Parse Range
    let now = chrono::Utc::now();
    let cutoff = match range.as_str() {
        "1M" => Some(now - chrono::Duration::days(30)),
        "3M" => Some(now - chrono::Duration::days(90)),
        "6M" => Some(now - chrono::Duration::days(180)),
        "1Y" => Some(now - chrono::Duration::days(365)),
        "3Y" => Some(now - chrono::Duration::days(365 * 3)),
        "5Y" => Some(now - chrono::Duration::days(365 * 5)),
        "ALL" => None,
        _ => None,
    };

    // 2. Fetch Data
    let (name_a, data_a) = tokio::join!(
        sqlx::query_scalar::<_, String>("SELECT name FROM indicators WHERE slug = $1").bind(&target_slug).fetch_optional(&*pool),
        crate::db::get_historical_data(&pool, &target_slug)
    );
    let (name_b, data_b) = tokio::join!(
        sqlx::query_scalar::<_, String>("SELECT name FROM indicators WHERE slug = $1").bind(&indicator_slug).fetch_optional(&*pool),
        crate::db::get_historical_data(&pool, &indicator_slug)
    );

    let name_a = name_a.map_err(|e| e.to_string())?.unwrap_or(target_slug.clone());
    let data_a = data_a.map_err(|e| e.to_string())?;
    
    let name_b = name_b.map_err(|e| e.to_string())?.unwrap_or(indicator_slug.clone());
    let data_b = data_b.map_err(|e| e.to_string())?;

    if data_a.is_empty() || data_b.is_empty() {
        return Err("Insufficient data".to_string());
    }

    // 3. Prepare Data Structures
    // Use HashMap for B for fast lookup
    use std::collections::HashMap;
    let b_map: HashMap<String, f64> = data_b.iter()
        .map(|d| (d.timestamp.format("%Y-%m-%d").to_string(), d.value))
        .collect();
    
    // Filter A once
    let a_filtered: Vec<&DataPoint> = if let Some(c) = cutoff {
        data_a.iter().filter(|d| d.timestamp >= c).collect()
    } else {
        data_a.iter().collect()
    };

    if a_filtered.len() < 10 {
         return Err("Insufficient data in range".to_string());
    }

    let mut optimal_lag = 0;
    let mut max_abs_corr = -1.0;
    let mut max_corr_signed = 0.0;

    // 4. Search Loop
    let start_lag = -max_lag;
    let end_lag = max_lag;

    // We can step by 1. For +/- 180, it's 361 iterations.
    for lag in start_lag..=end_lag {
        let mut vec_a = Vec::with_capacity(a_filtered.len());
        let mut vec_b = Vec::with_capacity(a_filtered.len());

        for p_a in &a_filtered {
             let target_date = p_a.timestamp - chrono::Duration::days(lag as i64);
             let target_date_str = target_date.format("%Y-%m-%d").to_string();
             
             if let Some(&val_b) = b_map.get(&target_date_str) {
                 vec_a.push(p_a.value);
                 vec_b.push(val_b);
             }
        }

        if vec_a.len() < 10 { continue; }

        // Pearson Calculation Inline
        let count = vec_a.len();
        let mean_a = vec_a.iter().sum::<f64>() / count as f64;
        let mean_b = vec_b.iter().sum::<f64>() / count as f64;
        
        let mut num = 0.0;
        let mut den_a = 0.0;
        let mut den_b = 0.0;

        for i in 0..count {
            let da = vec_a[i] - mean_a;
            let db = vec_b[i] - mean_b;
            num += da * db;
            den_a += da * da;
            den_b += db * db;
        }

        let corr = if den_a > 0.0 && den_b > 0.0 {
            num / (den_a.sqrt() * den_b.sqrt())
        } else {
            0.0
        };

        if corr.abs() > max_abs_corr {
            max_abs_corr = corr.abs();
            max_corr_signed = corr;
            optimal_lag = lag;
        }
    }

    Ok(serde_json::json!({
        "optimal_lag": optimal_lag,
        "max_correlation": max_corr_signed,
        "asset_a_name": name_a,
        "asset_b_name": name_b
    }))
}

// === NEW COMMANDS ===

#[tauri::command]
pub async fn get_market_regime(pool: State<'_, SqlitePool>) -> Result<regime::RegimeResult, String> {
    regime::calculate_market_regime(&pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_macro_heatmap(pool: State<'_, SqlitePool>) -> Result<Vec<regime::HeatmapItem>, String> {
    regime::get_anomaly_heatmap(&pool).await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn get_rolling_correlation(
    pool: State<'_, SqlitePool>,
    asset_a: String,
    asset_b: String,
    window_days: i64
) -> Result<serde_json::Value, String> {
    // 1. Fetch Data & Names (Reusing logic for consistency)
    let (name_a, data_a) = tokio::join!(
        sqlx::query_scalar::<_, String>("SELECT name FROM indicators WHERE slug = $1").bind(&asset_a).fetch_optional(&*pool),
        crate::db::get_historical_data(&pool, &asset_a)
    );
    let (name_b, data_b) = tokio::join!(
        sqlx::query_scalar::<_, String>("SELECT name FROM indicators WHERE slug = $1").bind(&asset_b).fetch_optional(&*pool),
        crate::db::get_historical_data(&pool, &asset_b)
    );

    let name_a = name_a.map_err(|e| e.to_string())?.unwrap_or(asset_a.clone());
    let data_a = data_a.map_err(|e| e.to_string())?;
    
    let name_b = name_b.map_err(|e| e.to_string())?.unwrap_or(asset_b.clone());
    let data_b = data_b.map_err(|e| e.to_string())?;

    if data_a.is_empty() || data_b.is_empty() {
        return Err("Insufficient data".to_string());
    }

    // 2. Calculate Rolling Correlation
    let rolling_data = statistics::calculate_rolling_pearson(&data_a, &data_b, window_days);

    Ok(serde_json::json!({
        "asset_a_name": name_a,
        "asset_b_name": name_b,
        "window_days": window_days,
        "rolling_data": rolling_data
    }))
}
