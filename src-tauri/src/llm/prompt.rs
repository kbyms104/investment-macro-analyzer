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
    
    // Fear & Greed Data
    let mut fng_data = String::from("| No recent Fear & Greed data found |");

    // Helper to format row
    fn format_row(name: &str, value: f64, z_score: f64, percentile: f64, change: Option<f64>, direction: &str, unit: &crate::indicators::registry::UnitType) -> String {
        let val_str = match unit {
            crate::indicators::registry::UnitType::Percent => format!("{:.2}%", value),
            crate::indicators::registry::UnitType::UsdPrice => format!("${:.2}", value),
            _ => format!("{:.2}", value),
        };
        let change_str = change.map(|c| format!("{:+.2}%", c)).unwrap_or_else(|| "N/A".to_string());
        format!("| {} | {} | {} | {} | {:+.2}σ | {:.0}th |", name, val_str, change_str, direction, z_score, percentile)
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
                
                let change = statistics::calculate_change(&data);
                let direction = statistics::calculate_direction(&data, 30);
                let row = format_row(&meta.name, latest.value, z_score, percentile, change, &direction, &meta.unit);

                // Special handling for Fear & Greed to put it in its own section later
                if slug == "fear_greed_index" {
                    fng_data = format!("| {} | {} | {:+.2}σ | {} |", 
                        meta.name, val_str(&meta.unit, latest.value), z_score, direction);
                }
                
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
                
                let tag = if slug == "fear_greed_index" {
                    "Sentiment".to_string()
                } else if is_core {
                    "Core".to_string()
                } else {
                    "Anomaly".to_string()
                };

                // Add to referenced list for frontend
                referenced.push(ReferencedIndicator {
                    slug: slug.to_string(),
                    name: meta.name.clone(),
                    value: latest.value,
                    z_score,
                    sparkline,
                    tag,
                });
            }
        }
    }
    
    // 4. Build prompt
    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
    
    let prompt = format!(r#"
You are a senior investment analyst at a top hedge fund.
Analyze the provided macro-economic data and give actionable insights.

---
### ANALYSIS PROTOCOL (Chain-of-Thought)
Before writing your final report, perform the following steps internally:
1. **Identify Divergences:** Are any "Core Indicators" trending in opposite directions (e.g., Yields rising while Tech stocks rise)?
2. **Anomaly Stress-Test:** How do the "Significant Anomalies" contradict or confirm the current "Market Regime"?
3. **Sentiment Check:** Does the "Fear & Greed" state justify the current "Technical Signals"?
4. **Conclusion Synthesis:** Based on these contradictions, what is the SINGLE greatest risk and the SINGLE greatest opportunity?
---

RULES:
1. ONLY reference the data provided below. Do NOT invent numbers.
2. Structure: Follow the **EXACT** markdown template below.
3. Language: Korean (한국어로 작성).
4. Tone: Professional, Insightful, Direct.

---

### REPORT TEMPLATE (Fill in the blanks)

# 📅 [YYYY-MM-DD] 투자 분석 리포트

## 1. 🔍 요약 (Executive Summary)
- **시장 국면:** [Current Regime]
- **핵심 요약:** [3-4 sentences summarizing the market state, specifically mentioning key divergence or anomalies]

## 2. ⚠️ 주요 리스크 (Key Risks)
- [Risk 1: Specific data point and why it is a risk]
- [Risk 2: Another specific data point]
- **심리 분석:** [Fear & Greed index interpretation]

## 3. 🚀 기회 요인 (Opportunities)
- [Opportunity 1: Asset or Sector with positive setup]
- [Opportunity 2: Mean reversion or trend continuation setup]

## 4. 📝 최종 제언 (Recommendation)
- **결론:** [Bullish / Bearish / Neutral]
- **대응 전략:** [Specific actionable advice based on the analysis]

---

## Current Market State (as of {})

**Regime:** {} (Growth: {:+.2}σ, Inflation: {:+.2}σ)
**Description:** {}

### 1. Market Sentiment (Psychology)
| Indicator | Value | Z-Score | 30D Trend |
|-----------|-------|---------|-----------|
{}

### 2. Core Market Indicators (The Pulse)
| Indicator | Value | Day Change | 30D Trend | Z-Score | Percentile |
|-----------|-------|------------|-----------|---------|------------|
{}

### 3. Technical Signals (Trend & Momentum)
| Asset | RSI(14) | Trend Strength | MA Alignment |
|-------|---------|----------------|--------------|
{}

### 4. Significant Anomalies (Unusual Activity)
| Indicator | Value | Day Change | 30D Trend | Z-Score | Percentile |
|-----------|-------|------------|-----------|---------|------------|
{}

---

Based on this data, fill out the REPORT TEMPLATE above.
Ensure the analysis is cohesive and data-driven.
"#, 
        date,
        regime_data.label,
        regime_data.growth_score,
        regime_data.inflation_score,
        regime_data.description,
        fng_data,
        core_rows.join("\n"),
        if technical_rows.is_empty() { "| None | - | - | - |".to_string() } else { technical_rows.join("\n") },
        if anomaly_rows.is_empty() { "| None | - | - | - |".to_string() } else { anomaly_rows.join("\n") }
    );
    
    Ok((prompt, referenced))
}

fn val_str(unit: &crate::indicators::registry::UnitType, value: f64) -> String {
    match unit {
        crate::indicators::registry::UnitType::Percent => format!("{:.2}%", value),
        crate::indicators::registry::UnitType::UsdPrice => format!("${:.2}", value),
        _ => format!("{:.2}", value),
    }
}
