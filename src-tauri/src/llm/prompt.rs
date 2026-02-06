use sqlx::SqlitePool;
use crate::analysis::{regime, statistics, technicals};
use crate::db;
use crate::indicators::registry::Registry;
use super::ReferencedIndicator;
use std::collections::HashSet;

/// Build the analysis prompt with current market data
/// Dynamically selects "Core" indicators and "Anomaly" indicators
pub async fn build_analysis_prompt(pool: &SqlitePool) -> Result<(String, Vec<ReferencedIndicator>), String> {
    let mut referenced = Vec::new();
    
    // 1. Get current regime
    let regime_data = regime::calculate_market_regime(pool).await?;
    
    // 2. Define Core Indicators (Always included)
    let core_slugs: HashSet<&str> = [
        "spx", "vix", "us_10y", "yield_curve_10y_2y", "dxy",
        "gold", "oil_wti", "bitcoin", 
        "cpi", "unrate", "fed_funds", "gdp_growth", "m2"
    ].into_iter().collect();

    // 3. Scan ALL indicators for Core + Anomalies
    let all_indicators = Registry::get_available_indicators();
    let mut core_rows = Vec::new();
    let mut anomaly_rows = Vec::new();
    let mut technical_rows = Vec::new();
    
    // Helper to format row
    fn format_row(name: &str, value: f64, z_score: f64, percentile: f64, unit: &crate::indicators::registry::UnitType) -> String {
        let val_str = match unit {
            crate::indicators::registry::UnitType::Percent => format!("{:.2}%", value),
            crate::indicators::registry::UnitType::UsdPrice => format!("${:.2}", value),
            _ => format!("{:.2}", value),
        };
        format!("| {} | {} | {:+.2}σ | {:.0}th |", name, val_str, z_score, percentile)
    }

    fn format_tech_row(name: &str, signals: &technicals::TechnicalSignals) -> Option<String> {
        if let (Some(rsi), Some(sma50), Some(sma200)) = (signals.rsi_14, signals.sma_50, signals.sma_200) {
             let rsi_status = if rsi > 70.0 { "Overbought" } else if rsi < 30.0 { "Oversold" } else { "Neutral" };
             let trend = match signals.trend_strength {
                 technicals::TrendStrength::StrongUp => "Strong Up",
                 technicals::TrendStrength::WeakUp => "Weak Up",
                 technicals::TrendStrength::StrongDown => "Strong Down",
                 technicals::TrendStrength::WeakDown => "Weak Down",
                 _ => "Sideways"
             };
             let ma_status = if sma50 > sma200 { "Bullish Cross" } else { "Bearish Cross" };
             
             Some(format!("| {} | {:.1} ({}) | {} | {} |", name, rsi, rsi_status, trend, ma_status))
        } else {
            None
        }
    }

    for meta in all_indicators {
        let slug = meta.slug.as_str();
        
        // Skip if internal (already filtered by get_available_indicators, but double check)
        if meta.category == crate::indicators::registry::Category::Internal { continue; }

        if let Ok(data) = db::get_historical_data(pool, slug).await {
            if data.len() < 30 { continue; }
            
            let latest = data.last().unwrap();
            let z_score = statistics::calculate_zscore(&data, 365 * 3).unwrap_or(0.0);
            let percentile = statistics::calculate_percentile(&data, 365 * 3).unwrap_or(50.0);
            
            let is_core = core_slugs.contains(slug);
            let is_anomaly = z_score.abs() > 1.5 || percentile < 10.0 || percentile > 90.0;
            
            if is_core || is_anomaly {
                // Determine sparkline
                let sparkline: Vec<f64> = data.iter()
                    .rev()
                    .take(30)
                    .map(|d| d.value)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect();
                
                let row = format_row(&meta.name, latest.value, z_score, percentile, &meta.unit);
                
                if is_core {
                    core_rows.push(row);
                    
                    // Add Technicals for Core items
                    let values: Vec<f64> = data.iter().map(|d| d.value).collect();
                    let signals = technicals::calculate_signals(slug, &values);
                    if let Some(tech_row) = format_tech_row(&meta.name, &signals) {
                        technical_rows.push(tech_row);
                    }

                } else {
                    anomaly_rows.push(row);
                }
                
                // Add to referenced list for frontend
                referenced.push(ReferencedIndicator {
                    slug: slug.to_string(),
                    name: meta.name.clone(),
                    value: latest.value,
                    z_score,
                    sparkline,
                });
            }
        }
    }
    
    // 4. Build prompt
    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
    
    let prompt = format!(r#"
You are a senior investment analyst at a top hedge fund.
Analyze the provided macro-economic data and give actionable insights.

RULES:
1. ONLY reference the data provided below. Do NOT invent numbers.
2. Focus on the relationship between "Core Indicators", "Technical Signals", and "Anomalies".
3. Structure: Summary -> Key Risks -> Opportunities -> Recommendation
4. Use markdown formatting.

---

## Current Market State (as of {})

**Regime:** {} (Growth: {:+.2}σ, Inflation: {:+.2}σ)
**Description:** {}

### 1. Core Market Indicators (The Pulse)
| Indicator | Value | Z-Score | Percentile |
|-----------|-------|---------|------------|
{}

### 2. Technical Signals (Trend & Momentum)
| Asset | RSI(14) | Trend Strength | MA Alignment |
|-------|---------|----------------|--------------|
{}

### 3. Significant Anomalies (Unusual Activity)
| Indicator | Value | Z-Score | Percentile |
|-----------|-------|---------|------------|
{}

---

Based on this data, provide your comprehensive market analysis. 
Highlight any anomalies that might contradict the core narrative.
"#, 
        date,
        regime_data.label,
        regime_data.growth_score,
        regime_data.inflation_score,
        regime_data.description,
        core_rows.join("\n"),
        if technical_rows.is_empty() { "| None | - | - | - |".to_string() } else { technical_rows.join("\n") },
        if anomaly_rows.is_empty() { "| None | - | - | - |".to_string() } else { anomaly_rows.join("\n") }
    );
    
    Ok((prompt, referenced))
}
