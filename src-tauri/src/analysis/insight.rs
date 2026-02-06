use sqlx::SqlitePool;
use serde::{Serialize, Deserialize};
use crate::analysis::regime;
use crate::analysis::statistics;
use crate::db;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum InsightSeverity {
    Critical, // 🚨 Red: Immediate Action / Danger
    High,     // 🟠 Orange: Significant Risk / Opportunity
    Medium,   // 🟡 Yellow: Watch / Context
    Low,      // 🔵 Blue: Info / Educational
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum InsightCategory {
    Regime,       // Market Cycle (Goldilocks etc)
    Risk,         // High Volatility, Crash Signal
    Opportunity,  // Valuation, Reversal
    Macro,        // General Economy (GDP, CPI)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Insight {
    pub id: String,
    pub title: String,
    pub description: String,
    pub severity: InsightSeverity,
    pub category: InsightCategory,
    pub score: u32, // For sorting (Higher = Top)
    pub related_slug: Option<String>, // For linking to charts
    pub date: String,
}

pub async fn generate_market_insights(pool: &SqlitePool) -> Result<Vec<Insight>, String> {
    let mut insights = Vec::new();

    // 1. Analyze Market Regime
    // We reuse the existing logic but look deeper
    let regime_res = regime::calculate_market_regime(pool).await?;
    
    // Check for Regime Shift (simulated for now by checking current vs previous month if possible, 
    // or just emphasizing the current state if it's extreme)
    // For this MVP, we will highlight the CURRENT regime as the top insight.
    
    let (regime_title, regime_desc, regime_severity, regime_score) = match regime_res.regime.as_str() {
        "stagflation" => (
            "⚠️ Stagflation Risk", 
            "Rising inflation with slowing growth. This is the most challenging environment for assets. Cash and Gold are preferred.",
            InsightSeverity::Critical,
            100
        ),
        "recession" => (
            "📉 Recessionary Conditions", 
            "Economic contraction detected. Focus on capital preservation and defensive assets (Bonds, Gold).",
            InsightSeverity::Critical,
            95
        ),
        "reflation" => (
            "🔥 Reflationary Growth", 
            "Growth and inflation are picking up. Commodities and cyclical stocks tend to outperform.",
            InsightSeverity::High,
            80
        ),
        "goldilocks" => (
            "✨ Goldilocks Regime", 
            "Strong growth with low inflation. Ideal environment for equities and risk assets.",
            InsightSeverity::High,
            85
        ),
        _ => ("Unknown Regime", "Insufficient data.", InsightSeverity::Low, 0),
    };

    insights.push(Insight {
        id: "regime_status".to_string(),
        title: regime_title.to_string(),
        description: regime_desc.to_string(),
        severity: regime_severity,
        category: InsightCategory::Regime,
        score: regime_score,
        related_slug: None,
        date: chrono::Utc::now().format("%Y-%m-%d").to_string(),
    });

    // 2. Anomaly Detection (Key Risks/Opportunities)
    // We check a few critical indicators
    let watch_list = vec!["vix", "yield_curve_10y_2y", "oil_wti", "sp500"];
    
    for slug in watch_list {
        if let Ok(data) = db::get_historical_data(pool, slug).await {
            // Check Z-Score (3-year window)
            if let Some(z) = statistics::calculate_zscore(&data, 365 * 3) {
                let abs_z = z.abs();
                
                // Significant Anomaly
                if abs_z > 2.0 {
                    let name = slug.to_uppercase(); // Simple name
                    
                    // Use owned Strings to avoid borrow issues
                    let (title, desc, severity, score): (String, String, InsightSeverity, u32) = 
                        if slug == "vix" && z > 2.0 {
                            (
                                "High Volatility Alert".to_string(),
                                "VIX is trading 2 standard deviations above normal. Expect market turbulence.".to_string(),
                                InsightSeverity::Critical,
                                90
                            )
                        } else if slug == "yield_curve_10y_2y" && z < -1.5 {
                            (
                                "Yield Curve Inversion Deepens".to_string(),
                                "The 10Y-2Y spread is significantly inverted, signaling potential recession risk.".to_string(),
                                InsightSeverity::Critical,
                                92
                            )
                        } else if abs_z > 3.0 {
                            (
                                format!("Extreme Movement: {}", name),
                                format!("{} is at an extreme statistical outlier level (Z: {:.2}). Mean reversion is likely.", name, z),
                                InsightSeverity::High,
                                70
                            )
                        } else {
                            (
                                format!("Notable Move: {}", name),
                                format!("{} is showing significant deviation from the mean (Z: {:.2}).", name, z),
                                InsightSeverity::Medium,
                                50
                            )
                        };

                    insights.push(Insight {
                        id: format!("anomaly_{}", slug),
                        title,
                        description: desc,
                        severity,
                        category: InsightCategory::Risk,
                        score,
                        related_slug: Some(slug.to_string()),
                        date: chrono::Utc::now().format("%Y-%m-%d").to_string(),
                    });
                }
            }
        }
    }

    // 3. Simple Strategy/Tip (Context)
    insights.push(Insight {
        id: "daily_tip".to_string(),
        title: "Investment Tip".to_string(),
        description: "Diversification is your only free lunch. Ensure your portfolio isn't over-exposed to a single factor.".to_string(),
        severity: InsightSeverity::Low,
        category: InsightCategory::Macro,
        score: 10,
        related_slug: None,
        date: chrono::Utc::now().format("%Y-%m-%d").to_string(),
    });

    // Sort by Score Descending
    insights.sort_by(|a, b| b.score.cmp(&a.score));

    Ok(insights)
}
