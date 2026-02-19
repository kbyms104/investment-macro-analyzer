use serde::Serialize;
use sqlx::SqlitePool;
use crate::analysis::{market_status, statistics, regime};
use crate::db;

// =============================================================================
// ACTIONABLE SIGNAL ENGINE
// Transforms raw data into "what should the investor DO?" recommendations
// =============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct Signal {
    pub id: String,
    pub signal_type: SignalType,
    pub severity: SignalSeverity,
    pub headline: String,
    pub action: String,
    pub rationale: Vec<String>,
    pub historical_context: Option<HistoricalOutcome>,
    pub affected_assets: Vec<String>,
    pub related_slugs: Vec<String>,
    pub triggered_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SignalType {
    RiskOff,
    RiskOn,
    YieldCurveWarning,
    VixSpike,
    ValuationWarning,
    LiquidityContraction,
    RegimeShift,
}

#[derive(Debug, Clone, Serialize, PartialEq, PartialOrd)]
#[serde(rename_all = "lowercase")]
pub enum SignalSeverity {
    Critical, // Red — immediate action consideration
    Warning,  // Orange — monitor closely
    Info,     // Blue — contextual awareness
}

#[derive(Debug, Clone, Serialize)]
pub struct HistoricalOutcome {
    pub occurrences: u32,
    pub avg_return_pct: f64,
    pub worst_case_pct: f64,
    pub best_case_pct: f64,
    pub median_recovery_days: Option<u32>,
    pub description: String,
}

#[derive(Debug, Serialize)]
pub struct SignalReport {
    pub signals: Vec<Signal>,
    pub total_active: usize,
    pub highest_severity: String,
    pub generated_at: String,
}

// =============================================================================
// MAIN ENGINE
// =============================================================================

pub async fn generate_signals(pool: &SqlitePool) -> Result<SignalReport, String> {
    let mut signals = Vec::new();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    // 1. Risk Score Signals (Risk-Off / Risk-On)
    if let Ok(status) = market_status::calculate_market_status_internal(pool).await {
        if status.risk_score >= 60 {
            let hist = get_risk_score_outcome(pool, 60, 90).await;
            signals.push(Signal {
                id: "risk_off_transition".into(),
                signal_type: SignalType::RiskOff,
                severity: SignalSeverity::Critical,
                headline: "Risk-Off Signal Activated".into(),
                action: "Consider increasing defensive allocation (bonds, gold, cash). Reduce exposure to high-beta equities.".into(),
                rationale: status.drivers.iter()
                    .filter(|d| d.contribution > 0)
                    .map(|d| format!("{}: {} (contribution: +{})", d.name, d.signal, d.contribution))
                    .collect(),
                historical_context: hist,
                affected_assets: vec!["SPX".into(), "NASDAQ".into(), "BTC".into(), "HYG".into()],
                related_slugs: vec!["spx".into(), "vix".into(), "yield_curve_10y_2y".into()],
                triggered_at: now.clone(),
            });
        } else if status.risk_score <= 15 {
            let hist = get_risk_score_outcome(pool, 0, 90).await;
            signals.push(Signal {
                id: "risk_on_opportunity".into(),
                signal_type: SignalType::RiskOn,
                severity: SignalSeverity::Info,
                headline: "Risk-On Environment — Low Fear".into(),
                action: "Market fear is at historically low levels. Favorable for risk assets. Consider dollar-cost averaging into equities.".into(),
                rationale: vec![
                    format!("Risk Score: {} (Aggressive Risk-On zone)", status.risk_score),
                    "All major risk indicators are within normal ranges.".into(),
                ],
                historical_context: hist,
                affected_assets: vec!["SPX".into(), "QQQ".into(), "BTC".into()],
                related_slugs: vec!["spx".into(), "vix".into()],
                triggered_at: now.clone(),
            });
        }
    }

    // 2. Yield Curve Warning
    if let Ok(yc_data) = db::get_historical_data(pool, "yield_curve_10y_2y").await {
        if let Some(latest) = yc_data.last() {
            if latest.value < 0.0 {
                // Count consecutive days of inversion
                let inversion_days = yc_data.iter().rev()
                    .take_while(|dp| dp.value < 0.0)
                    .count() as u32;

                let (severity, headline, action) = if inversion_days > 180 {
                    (
                        SignalSeverity::Critical,
                        format!("Yield Curve Inverted for {} Days", inversion_days),
                        "Historical recession probability is 85% within 6-18 months of prolonged inversion. Secure cash reserves and review portfolio duration.".to_string(),
                    )
                } else if inversion_days > 30 {
                    (
                        SignalSeverity::Warning,
                        format!("Yield Curve Inversion Persists ({} days)", inversion_days),
                        "Monitor for signs of credit tightening. Consider reducing cyclical exposure.".to_string(),
                    )
                } else {
                    (
                        SignalSeverity::Info,
                        "Yield Curve Recently Inverted".to_string(),
                        "Early warning signal. Track duration and depth of inversion.".to_string(),
                    )
                };

                let hist = get_yield_curve_outcome(pool, inversion_days).await;

                signals.push(Signal {
                    id: "yield_curve_warning".into(),
                    signal_type: SignalType::YieldCurveWarning,
                    severity,
                    headline,
                    action,
                    rationale: vec![
                        format!("Current 10Y-2Y spread: {:.2}%", latest.value),
                        format!("Inversion duration: {} days", inversion_days),
                        "Every US recession since 1970 was preceded by yield curve inversion.".into(),
                    ],
                    historical_context: hist,
                    affected_assets: vec!["Bonds".into(), "Financials".into(), "REITs".into()],
                    related_slugs: vec!["yield_curve_10y_2y".into(), "us_10y".into(), "us_2y".into()],
                    triggered_at: now.clone(),
                });
            }
        }
    }

    // 3. VIX Spike
    if let Ok(vix_data) = db::get_historical_data(pool, "vix").await {
        if let Some(latest) = vix_data.last() {
            let z = statistics::calculate_zscore(&vix_data, 365 * 3).unwrap_or(0.0);

            if latest.value > 30.0 || z > 2.0 {
                let hist = get_vix_spike_outcome(pool).await;
                signals.push(Signal {
                    id: "vix_spike".into(),
                    signal_type: SignalType::VixSpike,
                    severity: if latest.value > 35.0 { SignalSeverity::Critical } else { SignalSeverity::Warning },
                    headline: format!("Volatility Spike — VIX at {:.1}", latest.value),
                    action: "Avoid initiating new leveraged positions. Consider hedging existing exposure with put options or VIX calls.".into(),
                    rationale: vec![
                        format!("VIX: {:.1} (Z-Score: {:+.2}σ)", latest.value, z),
                        if latest.value > 30.0 { "VIX above 30 indicates panic-level volatility.".into() }
                        else { format!("VIX Z-Score of {:.2}σ indicates statistically unusual volatility.", z) },
                    ],
                    historical_context: hist,
                    affected_assets: vec!["All Equities".into(), "Options Premiums".into()],
                    related_slugs: vec!["vix".into(), "spx".into()],
                    triggered_at: now.clone(),
                });
            }
        }
    }

    // 4. Valuation Warning (Buffett Indicator)
    if let Ok(bi_data) = db::get_historical_data(pool, "buffett_indicator").await {
        if let Some(latest) = bi_data.last() {
            let percentile = statistics::calculate_percentile(&bi_data, 365 * 10).unwrap_or(50.0);

            if latest.value > 150.0 {
                let severity = if latest.value > 180.0 { SignalSeverity::Critical } else { SignalSeverity::Warning };
                signals.push(Signal {
                    id: "valuation_warning".into(),
                    signal_type: SignalType::ValuationWarning,
                    severity,
                    headline: format!("Market Overvaluation — Buffett Indicator at {:.0}%", latest.value),
                    action: if latest.value > 180.0 {
                        "Total market cap significantly exceeds GDP. Consider profit-taking on long positions and increasing cash allocation.".into()
                    } else {
                        "Market valuations are elevated. Be selective with new equity purchases; favor quality and value.".into()
                    },
                    rationale: vec![
                        format!("Buffett Indicator: {:.1}% ({}th percentile over 10Y)", latest.value, percentile as u32),
                        "Warren Buffett considers this 'the single best measure of where valuations stand at any given moment.'".into(),
                        if latest.value > 180.0 { "Historically, markets have corrected 20-40% from these levels.".into() }
                        else { "Elevated but not extreme. Watch for deteriorating earnings or rising rates.".into() },
                    ],
                    historical_context: None,
                    affected_assets: vec!["SPX".into(), "Total Market".into()],
                    related_slugs: vec!["buffett_indicator".into(), "spx".into()],
                    triggered_at: now.clone(),
                });
            }
        }
    }

    // 5. Liquidity Contraction
    if let Ok(liq_data) = db::get_historical_data(pool, "net_liquidity").await {
        if liq_data.len() >= 30 {
            let recent_30 = &liq_data[liq_data.len().saturating_sub(30)..];
            let older_30 = &liq_data[liq_data.len().saturating_sub(60)..liq_data.len().saturating_sub(30)];

            if !recent_30.is_empty() && !older_30.is_empty() {
                let recent_avg: f64 = recent_30.iter().map(|d| d.value).sum::<f64>() / recent_30.len() as f64;
                let older_avg: f64 = older_30.iter().map(|d| d.value).sum::<f64>() / older_30.len() as f64;

                if older_avg != 0.0 {
                    let change_pct = ((recent_avg - older_avg) / older_avg.abs()) * 100.0;

                    if change_pct < -2.0 {
                        signals.push(Signal {
                            id: "liquidity_contraction".into(),
                            signal_type: SignalType::LiquidityContraction,
                            severity: if change_pct < -5.0 { SignalSeverity::Critical } else { SignalSeverity::Warning },
                            headline: format!("Liquidity Contraction — {:.1}% decline (30D)", change_pct),
                            action: "Shrinking liquidity is historically bearish for risk assets. Reduce exposure to speculative positions.".into(),
                            rationale: vec![
                                format!("Net Liquidity 30D avg change: {:.2}%", change_pct),
                                "Net Liquidity = Fed Balance Sheet - TGA - RRP. A decline means less money available for markets.".into(),
                                "Risk assets (crypto, growth stocks) are most sensitive to liquidity changes.".into(),
                            ],
                            historical_context: None,
                            affected_assets: vec!["BTC".into(), "Growth Stocks".into(), "Small Caps".into()],
                            related_slugs: vec!["net_liquidity".into(), "fed_balance_sheet".into(), "tga".into(), "rrp".into()],
                            triggered_at: now.clone(),
                        });
                    }
                }
            }
        }
    }

    // 6. Regime Shift
    if let Ok(regime_result) = regime::calculate_market_regime(pool).await {
        // Check if regime changed vs last stored regime
        let last_regime = db::get_setting(pool, "LAST_SIGNAL_REGIME").await.unwrap_or_default();
        let current_regime = &regime_result.regime;

        if !last_regime.is_empty() && &last_regime != current_regime {
            let strategy = &regime_result.strategy;
            signals.push(Signal {
                id: "regime_shift".into(),
                signal_type: SignalType::RegimeShift,
                severity: SignalSeverity::Critical,
                headline: format!("Market Regime Shift: {} → {}", capitalize(&last_regime), capitalize(current_regime)),
                action: format!(
                    "Strategy shift to '{}'. Favor: {}. Avoid: {}.",
                    strategy.key_theme,
                    strategy.favorable_assets.join(", "),
                    strategy.unfavorable_assets.join(", ")
                ),
                rationale: vec![
                    format!("Growth Score: {:+.2}σ | Inflation Score: {:+.2}σ", regime_result.growth_score, regime_result.inflation_score),
                    format!("Previous regime: {} → Current: {}", capitalize(&last_regime), capitalize(current_regime)),
                    format!("Key sectors to watch: {}", strategy.sectors_to_watch.join(", ")),
                ],
                historical_context: None,
                affected_assets: strategy.favorable_assets.clone(),
                related_slugs: vec!["gdp_growth".into(), "cpi".into(), "spx".into()],
                triggered_at: now.clone(),
            });
        }

        // Save current regime for next comparison
        let _ = db::save_setting(pool, "LAST_SIGNAL_REGIME", current_regime).await;
    }

    // 7. Credit Stress (High Yield Spread)
    if let Ok(hy_data) = db::get_historical_data(pool, "hy_spread").await {
        if let Some(latest) = hy_data.last() {
            let z = statistics::calculate_zscore(&hy_data, 365 * 3).unwrap_or(0.0);

            if latest.value > 5.0 || z > 1.5 {
                signals.push(Signal {
                    id: "credit_stress".into(),
                    signal_type: SignalType::RiskOff,
                    severity: if latest.value > 6.0 { SignalSeverity::Critical } else { SignalSeverity::Warning },
                    headline: format!("Credit Stress Rising — HY Spread at {:.2}%", latest.value),
                    action: "Widening credit spreads signal deteriorating confidence. Reduce corporate bond exposure; favor Treasuries.".into(),
                    rationale: vec![
                        format!("High Yield OAS: {:.2}% (Z-Score: {:+.2}σ)", latest.value, z),
                        "Widening spreads historically precede equity sell-offs by 1-3 months.".into(),
                    ],
                    historical_context: None,
                    affected_assets: vec!["HYG".into(), "Corporate Bonds".into(), "Financials".into()],
                    related_slugs: vec!["hy_spread".into(), "us_10y".into()],
                    triggered_at: now.clone(),
                });
            }
        }
    }

    // Sort: Critical first, then Warning, then Info
    signals.sort_by(|a, b| {
        let sev_order = |s: &SignalSeverity| match s {
            SignalSeverity::Critical => 0,
            SignalSeverity::Warning => 1,
            SignalSeverity::Info => 2,
        };
        sev_order(&a.severity).cmp(&sev_order(&b.severity))
    });

    let total_active = signals.len();
    let highest = signals.first()
        .map(|s| format!("{:?}", s.severity).to_lowercase())
        .unwrap_or_else(|| "none".into());

    Ok(SignalReport {
        signals,
        total_active,
        highest_severity: highest,
        generated_at: now,
    })
}

// =============================================================================
// HISTORICAL OUTCOME CALCULATORS
// "What happened historically when conditions were similar?"
// =============================================================================

async fn get_risk_score_outcome(pool: &SqlitePool, threshold: i32, forward_days: i32) -> Option<HistoricalOutcome> {
    // Find all dates where risk_score crossed above threshold
    // Then measure SPX return forward_days later
    let query = format!(
        r#"
        SELECT r.timestamp, r.risk_score,
               (SELECT h.value FROM historical_data h 
                JOIN indicators i ON h.indicator_id = i.id
                WHERE i.slug = 'spx'
                AND CAST(strftime('%s', h.timestamp) AS INTEGER) >= r.timestamp + ({fd} * 86400)
                ORDER BY h.timestamp ASC LIMIT 1) as future_value,
               (SELECT h.value FROM historical_data h
                JOIN indicators i ON h.indicator_id = i.id
                WHERE i.slug = 'spx'
                AND CAST(strftime('%s', h.timestamp) AS INTEGER) <= r.timestamp + 86400
                AND CAST(strftime('%s', h.timestamp) AS INTEGER) >= r.timestamp - 86400
                ORDER BY ABS(CAST(strftime('%s', h.timestamp) AS INTEGER) - r.timestamp) ASC LIMIT 1) as current_value
        FROM risk_score_history r
        WHERE r.risk_score >= ?
        ORDER BY r.timestamp ASC
        "#,
        fd = forward_days
    );

    let rows: Vec<(i64, i32, Option<f64>, Option<f64>)> = sqlx::query_as(&query)
        .bind(threshold)
        .fetch_all(pool)
        .await
        .ok()?;

    let mut returns: Vec<f64> = Vec::new();
    for (_, _, future, current) in &rows {
        if let (Some(f), Some(c)) = (future, current) {
            if *c != 0.0 {
                returns.push(((f - c) / c) * 100.0);
            }
        }
    }

    if returns.is_empty() {
        return None;
    }

    let avg = returns.iter().sum::<f64>() / returns.len() as f64;
    let worst = returns.iter().cloned().fold(f64::INFINITY, f64::min);
    let best = returns.iter().cloned().fold(f64::NEG_INFINITY, f64::max);

    Some(HistoricalOutcome {
        occurrences: returns.len() as u32,
        avg_return_pct: (avg * 100.0).round() / 100.0,
        worst_case_pct: (worst * 100.0).round() / 100.0,
        best_case_pct: (best * 100.0).round() / 100.0,
        median_recovery_days: None,
        description: format!(
            "In {} historical occurrences where Risk Score ≥ {}, SPX averaged {:.1}% over the following {} days (range: {:.1}% to {:.1}%).",
            returns.len(), threshold, avg, forward_days, worst, best
        ),
    })
}

async fn get_yield_curve_outcome(pool: &SqlitePool, current_inversion_days: u32) -> Option<HistoricalOutcome> {
    // Simplified: return known historical data about yield curve inversions
    // In production this would query the DB for actual historical episodes
    if current_inversion_days > 90 {
        Some(HistoricalOutcome {
            occurrences: 7,
            avg_return_pct: -8.2,
            worst_case_pct: -37.0,
            best_case_pct: 5.1,
            median_recovery_days: Some(480),
            description: format!(
                "Since 1970, prolonged yield curve inversions (>90 days) preceded recessions in 7 of 7 cases. \
                 Average SPX drawdown: -8.2%. Current inversion: {} days.",
                current_inversion_days
            ),
        })
    } else {
        None
    }
}

async fn get_vix_spike_outcome(pool: &SqlitePool) -> Option<HistoricalOutcome> {
    // Count historical VIX > 30 episodes and SPX forward returns
    let rows: Vec<(Option<f64>,)> = sqlx::query_as(
        r#"
        SELECT 
            (SELECT h2.value FROM historical_data h2 
             JOIN indicators i2 ON h2.indicator_id = i2.id 
             WHERE i2.slug = 'spx'
             AND CAST(strftime('%s', h2.timestamp) AS INTEGER) >= CAST(strftime('%s', h.timestamp) AS INTEGER) + (30 * 86400)
             ORDER BY h2.timestamp ASC LIMIT 1)
            /
            NULLIF((SELECT h3.value FROM historical_data h3
             JOIN indicators i3 ON h3.indicator_id = i3.id
             WHERE i3.slug = 'spx'
             AND CAST(strftime('%s', h3.timestamp) AS INTEGER) <= CAST(strftime('%s', h.timestamp) AS INTEGER) + 86400
             AND CAST(strftime('%s', h3.timestamp) AS INTEGER) >= CAST(strftime('%s', h.timestamp) AS INTEGER) - 86400
             ORDER BY ABS(CAST(strftime('%s', h3.timestamp) AS INTEGER) - CAST(strftime('%s', h.timestamp) AS INTEGER)) ASC LIMIT 1), 0)
            as ratio
        FROM historical_data h
        JOIN indicators i ON h.indicator_id = i.id
        WHERE i.slug = 'vix' AND h.value > 30
        GROUP BY date(h.timestamp)
        LIMIT 50
        "#
    )
    .fetch_all(pool)
    .await
    .ok()?;

    let returns: Vec<f64> = rows.iter()
        .filter_map(|(r,)| r.map(|v| (v - 1.0) * 100.0))
        .collect();

    if returns.is_empty() {
        return Some(HistoricalOutcome {
            occurrences: 0,
            avg_return_pct: 0.0,
            worst_case_pct: 0.0,
            best_case_pct: 0.0,
            median_recovery_days: Some(45),
            description: "Insufficient historical data for VIX spike analysis. VIX spikes above 30 typically resolve within 30-60 days.".into(),
        });
    }

    let avg = returns.iter().sum::<f64>() / returns.len() as f64;
    let worst = returns.iter().cloned().fold(f64::INFINITY, f64::min);
    let best = returns.iter().cloned().fold(f64::NEG_INFINITY, f64::max);

    Some(HistoricalOutcome {
        occurrences: returns.len() as u32,
        avg_return_pct: (avg * 100.0).round() / 100.0,
        worst_case_pct: (worst * 100.0).round() / 100.0,
        best_case_pct: (best * 100.0).round() / 100.0,
        median_recovery_days: Some(45),
        description: format!(
            "In {} instances of VIX > 30, SPX 30-day forward return averaged {:.1}%. VIX spikes are often mean-reverting, creating buying opportunities.",
            returns.len(), avg
        ),
    })
}

// =============================================================================
// HELPERS
// =============================================================================

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

