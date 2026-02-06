use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TechnicalSignals {
    pub slug: String,
    pub rsi_14: Option<f64>,
    pub adx_14: Option<f64>,
    pub trend_strength: TrendStrength,
    pub sma_50: Option<f64>,
    pub sma_200: Option<f64>,
    pub variance_ratio: Option<f64>,
    pub market_regime: MarketRegime,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TrendStrength {
    StrongUp,
    WeakUp,
    Neutral,
    WeakDown,
    StrongDown,
    Unknown
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MarketRegime {
    Trending,      // VR > 1.1
    MeanReverting, // VR < 0.9
    RandomWalk,    // VR ~ 1.0
    Unknown
}

/// Calculate all technical signals for a given time series
pub fn calculate_signals(slug: &str, data: &[f64]) -> TechnicalSignals {
    let rsi = calculate_rsi(data, 14);
    let adx = calculate_adx(data, 14); 
    
    let sma_50 = calculate_sma(data, 50);
    let sma_200 = calculate_sma(data, 200);
    let vr = calculate_variance_ratio(data, 10); // Check 10-day lag variance vs 1-day

    let trend = evaluate_trend(rsi, sma_50, sma_200, data.last().copied());
    let regime = evaluate_regime(vr);

    TechnicalSignals {
        slug: slug.to_string(),
        rsi_14: rsi,
        adx_14: None, 
        trend_strength: trend,
        sma_50,
        sma_200,
        variance_ratio: vr,
        market_regime: regime,
    }
}

pub fn calculate_rsi(data: &[f64], period: usize) -> Option<f64> {
    if data.len() < period + 1 {
        return None;
    }

    let mut gains = 0.0;
    let mut losses = 0.0;

    // First period
    for i in 1..=period {
        let diff = data[i] - data[i - 1];
        if diff > 0.0 {
            gains += diff;
        } else {
            losses -= diff;
        }
    }

    let mut avg_gain = gains / period as f64;
    let mut avg_loss = losses / period as f64;

    // Smoothing
    for i in (period + 1)..data.len() {
        let diff = data[i] - data[i - 1];
        if diff > 0.0 {
            avg_gain = (avg_gain * (period - 1) as f64 + diff) / period as f64;
            avg_loss = (avg_loss * (period - 1) as f64) / period as f64;
        } else {
            avg_gain = (avg_gain * (period - 1) as f64) / period as f64;
            avg_loss = (avg_loss * (period - 1) as f64 - diff) / period as f64;
        }
    }

    if avg_loss == 0.0 {
        return Some(100.0);
    }

    let rs = avg_gain / avg_loss;
    Some(100.0 - (100.0 / (1.0 + rs)))
}

pub fn calculate_sma(data: &[f64], period: usize) -> Option<f64> {
    if data.len() < period {
        return None;
    }
    let sum: f64 = data.iter().rev().take(period).sum();
    Some(sum / period as f64)
}

/// Calculate Variance Ratio (VR)
/// VR(q) = Var(r_q) / (q * Var(r_1))
/// 
/// If VR > 1: Positive correlation (Trending)
/// If VR < 1: Negative correlation (Mean Reverting)
/// If VR = 1: Random Walk
pub fn calculate_variance_ratio(data: &[f64], q: usize) -> Option<f64> {
    if data.len() < q + 2 {
        return None;
    }

    // Use returns from last 60 days for calculation (approx 3 months) to be responsive
    let window = 60.min(data.len() - q - 1);
    let slice = &data[data.len() - window..];

    // 1. Calculate Log Returns (1-day)
    let mut log_returns_1 = Vec::new();
    for i in 1..slice.len() {
        if slice[i-1] <= 0.0 { continue; }
        let r = (slice[i] / slice[i-1]).ln();
        log_returns_1.push(r);
    }

    if log_returns_1.len() < q { return None; }

    // 2. Calculate Variance of 1-day returns
    let mean_1: f64 = log_returns_1.iter().sum::<f64>() / log_returns_1.len() as f64;
    let var_1: f64 = log_returns_1.iter().map(|r| (r - mean_1).powi(2)).sum::<f64>() / (log_returns_1.len() - 1) as f64;

    // 3. Calculate q-day returns (overlapping sum of 1-day returns)
    let mut log_returns_q = Vec::new();
    for i in q..slice.len() {
        if slice[i-q] <= 0.0 { continue; }
        let r = (slice[i] / slice[i-q]).ln();
        log_returns_q.push(r);
    }
    
    // 4. Calculate Variance of q-day returns
    let mean_q: f64 = log_returns_q.iter().sum::<f64>() / log_returns_q.len() as f64;
    let var_q: f64 = log_returns_q.iter().map(|r| (r - mean_q).powi(2)).sum::<f64>() / (log_returns_q.len() - 1) as f64;

    if var_1 == 0.0 { return None; }

    // 5. Calculate VR
    let vr = var_q / (q as f64 * var_1);
    Some(vr)
}

pub fn calculate_adx(_data: &[f64], _period: usize) -> Option<f64> {
    // Requires OHLC data (High/Low/Close).
    None
}

fn evaluate_trend(rsi: Option<f64>, sma_50: Option<f64>, sma_200: Option<f64>, current: Option<f64>) -> TrendStrength {
    match (rsi, sma_50, sma_200, current) {
        (Some(r), Some(s50), Some(s200), Some(price)) => {
            if price > s50 {
                // Above SMA50 -> Generally Up
                if price > s200 {
                   if r > 70.0 { TrendStrength::StrongUp } else { TrendStrength::WeakUp }
                } else {
                   TrendStrength::WeakUp // Above 50, Below 200 (Recovering?)
                }
            } else {
                // Below SMA50 -> Generally Down
                if price < s200 {
                    if r < 30.0 { TrendStrength::StrongDown } else { TrendStrength::WeakDown }
                } else {
                    TrendStrength::WeakDown // Below 50, Above 200 (Pullback?)
                }
            }
        },
        _ => TrendStrength::Unknown
    }
}

fn evaluate_regime(vr: Option<f64>) -> MarketRegime {
    match vr {
        Some(v) if v > 1.1 => MarketRegime::Trending,
        Some(v) if v < 0.9 => MarketRegime::MeanReverting,
        Some(_) => MarketRegime::RandomWalk,
        None => MarketRegime::Unknown
    }
}
