use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter};
use crate::analysis::regime;
use tauri_plugin_notification::NotificationExt;

// Alert Types
// 1. Regime Change
// 2. Anomaly (Z-Score > 2.0)

pub async fn check_and_send_alerts(pool: &SqlitePool, app: &AppHandle) {
    println!("🔔 Checking for alerts...");
    
    // 1. Regime Change Alert
    // We need to know the LAST regime. Stored in settings?
    if let Ok(current_regime_res) = regime::calculate_market_regime(pool).await {
        let current_regime = current_regime_res.regime;
        let last_regime = crate::db::get_setting(pool, "LAST_MARKET_REGIME").await.unwrap_or_default();
        
        if !last_regime.is_empty() && last_regime != current_regime {
            // Regime Changed!
            let title = "Market Regime Change detected!";
            let body = format!("Market has shifted from {} to {}. Check your portfolio.", last_regime, current_regime);
            
            send_notification(app, &title, &body);
            
            // Save new regime
            let _ = crate::db::save_setting(pool, "LAST_MARKET_REGIME", &current_regime).await;
        } else if last_regime.is_empty() {
             // First run, just save
             let _ = crate::db::save_setting(pool, "LAST_MARKET_REGIME", &current_regime).await;
        }
    }

    // 2. Anomaly Alert
    if let Ok(heatmap) = regime::get_anomaly_heatmap(pool).await {
        for item in heatmap {
            // Only alert on NEW extreme anomalies (Z-Score > 2.5) to avoid spam
            // We need a way to track "already alerted" - for MVP we skip per-item tracking and just be conservative
            if item.z_score.abs() > 2.5 {
                // Check if we alerted this recently? (Skip for MVP complexity)
                // Just log for now, or send if very extreme
                if item.z_score.abs() > 3.0 {
                     let title = format!("🚨 Extreme Anomaly: {}", item.name);
                     let body = format!("Z-Score reached {:.1}σ. Highly unusual activity.", item.z_score);
                     send_notification(app, &title, &body);
                }
            }
        }
    }
}

fn send_notification(app: &AppHandle, title: &str, body: &str) {
    println!("SENDING NOTIFICATION: {} - {}", title, body);
    
    // Use Tauri Notification Plugin
    let _ = app.notification()
        .builder()
        .title(title)
        .body(body)
        .show();
        
    // Also emit event to Frontend for "Toast" or "Activity Log"
    let _ = app.emit("alert", AlertPayload {
        title: title.to_string(),
        body: body.to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    });
}

#[derive(serde::Serialize, Clone)]
struct AlertPayload {
    title: String,
    body: String,
    timestamp: String,
}
