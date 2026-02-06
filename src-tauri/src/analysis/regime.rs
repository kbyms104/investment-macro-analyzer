use sqlx::SqlitePool;
use crate::analysis::statistics;
use crate::db;
use serde::Serialize;
// use anyhow::Result;

#[derive(Debug, Serialize)]
pub struct RegimeResult {
    pub regime: String,          // The current phase
    pub growth_score: f64,       // X-axis
    pub inflation_score: f64,    // Y-axis
    pub label: String,           // Display Label
    pub description: String,     // Investment advice
    pub color: String,           // UI color
    
    // New Fields
    pub historical_path: Vec<RegimePoint>,
    pub strategy: InvestmentStrategy,
    pub history_stripe: Vec<RegimeStripeItem>,
}

#[derive(Debug, Serialize)]
pub struct RegimeStripeItem {
    pub date: String,
    pub regime: String,
    pub color: String,
    pub g_score: f64,
    pub i_score: f64,
}

#[derive(Debug, Serialize)]
pub struct RegimePoint {
    pub date: String,
    pub growth_score: f64,
    pub inflation_score: f64,
}

#[derive(Debug, Serialize)]
pub struct InvestmentStrategy {
    pub key_theme: String,
    pub favorable_assets: Vec<String>,
    pub unfavorable_assets: Vec<String>,
    pub sectors_to_watch: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct HeatmapItem {
    pub slug: String,
    pub name: String,
    pub z_score: f64,
    pub percentile: f64,
    pub category: String,
}

// 🎯 Indicators used for Regime Detection
// Growth: GDP, Retail Sales, Industrial Production, PMI (ISM)
// Inflation: CPI, PPI, PCE

pub async fn calculate_market_regime(pool: &SqlitePool) -> Result<RegimeResult, String> {
    
    let growth_indicators = vec!["gdp_growth", "industrial_prod", "retail_sales", "capacity_util"];
    let inflation_indicators = vec!["cpi", "ppi", "pce"];

    // 1. Calculate Baselines (Mean/StdDev) for all indicators over last 5 years
    // We need this to normalize historical points consistently.
    use std::collections::HashMap;
    struct Baseline { mean: f64, std: f64, data: Vec<crate::models::DataPoint> }
    let mut baselines: HashMap<String, Baseline> = HashMap::new();
    
    let all_indicators = [growth_indicators.clone(), inflation_indicators.clone()].concat();
    
    for slug in &all_indicators {
        if let Ok(data) = db::get_historical_data(pool, slug).await {
            // Calculate stats over last 5 years
            if let Some((mean, std)) = statistics::calculate_mean_std(&data, 365 * 5) {
                baselines.insert(slug.to_string(), Baseline { mean, std, data });
            }
        }
    }

    // Helper to Calculate Score at a specific date
    let calculate_score_at_date = |indicators: &Vec<&str>, query_date: chrono::DateTime<chrono::Utc>| -> f64 {
        let mut scores = Vec::new();
        for slug in indicators {
             if let Some(base) = baselines.get(*slug) {
                 // Find data point closest to query_date (<= query_date)
                 // Data is sorted ASC. We want the largest date <= query_date.
                 // So we reverse and find the first one <= query_date.
                 if let Some(dp) = base.data.iter().rev().find(|d| d.timestamp <= query_date) {
                     if base.std != 0.0 {
                         scores.push((dp.value - base.mean) / base.std);
                     }
                 }
             }
        }
        if scores.is_empty() { 0.0 } else { scores.iter().sum::<f64>() / scores.len() as f64 }
    };

    // --- NEW: Generate 3-Year History Stripe ---
    let mut history_stripe = Vec::new();
    let now = chrono::Utc::now();
    
    for i in 0..36 {
        let date = now - chrono::Duration::days(30 * i);
        let g_score = calculate_score_at_date(&growth_indicators, date);
        let i_score = calculate_score_at_date(&inflation_indicators, date);
        
        let (regime, color) = match (g_score >= 0.0, i_score >= 0.0) {
            (true, false) => ("goldilocks", "#10b981"),
            (true, true) => ("reflation", "#f59e0b"),
            (false, true) => ("stagflation", "#ef4444"),
            (false, false) => ("recession", "#3b82f6"),
        };
        
        history_stripe.insert(0, RegimeStripeItem {
            date: date.format("%Y-%m").to_string(),
            regime: regime.to_string(),
            color: color.to_string(),
            g_score,
            i_score,
        });
    }

    // 2. Generate Path (Current + Last 6 months)
    let mut historical_path = Vec::new();
    
    for i in 0..7 { // 0 to 6 months ago (7 points total)
        let date = now - chrono::Duration::days(30 * i);
        let g_score = calculate_score_at_date(&growth_indicators, date);
        let i_score = calculate_score_at_date(&inflation_indicators, date);
        
        let point = RegimePoint {
            date: date.format("%Y-%m-%d").to_string(),
            growth_score: g_score,
            inflation_score: i_score
        };
        // Insert at beginning for chronological order (Oldest -> Newest)
        historical_path.insert(0, point);
    }

    // Current Score is the last point
    let current_point = historical_path.last().unwrap();
    let growth_score = current_point.growth_score;
    let inflation_score = current_point.inflation_score;


    // 3. Determine Regime
    // Quadrant Logic
    
    let (regime, label, description, color, strategy) = match (growth_score >= 0.0, inflation_score >= 0.0) {
        (true, false) => (
            "goldilocks", 
            "Goldilocks (Risk-On)", 
            "Growth is getting stronger while inflation remains low. Ideal for Equities.",
            "#10b981", // Emerald
            InvestmentStrategy {
                key_theme: "Maximum Risk On".to_string(),
                favorable_assets: vec!["Equities (Tech, Growth)".to_string(), "Corporate Bonds".to_string(), "Real Estate".to_string()],
                unfavorable_assets: vec!["Cash".to_string(), "Gold (Defensive)".to_string()],
                sectors_to_watch: vec!["Technology".to_string(), "Discretionary".to_string()]
            }
        ),
        (true, true) => (
            "reflation", 
            "Reflation (Rotation)", 
            "Both growth and inflation are rising. Commodities and Cyclicals tend to outperform.",
            "#f59e0b", // Amber
            InvestmentStrategy {
                key_theme: "Inflation Hedge".to_string(),
                favorable_assets: vec!["Commodities".to_string(), "Value Stocks".to_string(), "TIPS".to_string()],
                unfavorable_assets: vec!["Long-term Bonds".to_string(), "High-PE Growth".to_string()],
                sectors_to_watch: vec!["Energy".to_string(), "Materials".to_string(), "Financials".to_string()]
            }
        ),
        (false, true) => (
            "stagflation", 
            "Stagflation (Risk-Off)", 
            "Growth slows but inflation persists. Defensive assets and Cash are preferred.",
            "#ef4444", // Red
            InvestmentStrategy {
                key_theme: "Preservation".to_string(),
                favorable_assets: vec!["Gold".to_string(), "Cash".to_string(), "Commodities".to_string()],
                unfavorable_assets: vec!["Equities".to_string(), "Bonds".to_string()],
                sectors_to_watch: vec!["Energy".to_string(), "Defensive Havens".to_string()]
            }
        ),
        (false, false) => (
            "recession", 
            "Recession (Deflation)", 
            "Economic contraction with falling prices. High quality Bonds and Gold offer protection.",
            "#3b82f6", // Blue
            InvestmentStrategy {
                key_theme: "Duration Play".to_string(),
                favorable_assets: vec!["Govt Bonds (Long Duration)".to_string(), "Gold".to_string(), "Defensive Stocks".to_string()],
                unfavorable_assets: vec!["Commodities".to_string(), "Cyclical Stocks".to_string()],
                sectors_to_watch: vec!["Utilities".to_string(), "Staples".to_string(), "Healthcare".to_string()]
            }
        ),
    };

    Ok(RegimeResult {
        regime: regime.to_string(),
        growth_score,
        inflation_score,
        label: label.to_string(),
        description: description.to_string(),
        color: color.to_string(),
        historical_path,
        strategy,
        history_stripe
    })
}

pub async fn get_anomaly_heatmap(pool: &SqlitePool) -> Result<Vec<HeatmapItem>, String> {
    let key_indicators = vec![
        "gdp_growth", "cpi", "ppi", "unrate", "fed_funds", "yield_curve_10y_2y", "vix", "oil_wti", "sp500", "m2"
    ];

    let mut items = Vec::new();

    for slug in key_indicators {
        if let Ok(data) = db::get_historical_data(pool, slug).await {
             // 5 Year window
             if let Some(z) = statistics::calculate_zscore(&data, 365 * 5) {
                 if let Some(p) = statistics::calculate_percentile(&data, 365 * 5) {
                     // Get Name
                     let name = crate::indicators::registry::Registry::get_metadata(slug)
                        .map(|m| m.name)
                        .unwrap_or(slug.to_string());
                     
                     let category = crate::indicators::registry::Registry::get_metadata(slug)
                        .map(|m| format!("{:?}", m.category))
                        .unwrap_or("Unknown".to_string());

                     items.push(HeatmapItem {
                         slug: slug.to_string(),
                         name,
                         z_score: z,
                         percentile: p,
                         category,
                     });
                 }
             }
        }
    }

    // Sort by absolute Z-Score descending (Most anomalous first)
    items.sort_by(|a, b| b.z_score.abs().partial_cmp(&a.z_score.abs()).unwrap());

    Ok(items)
}
