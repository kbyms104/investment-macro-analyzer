use std::time::Duration;
use tokio::time::sleep;
use rand::Rng; // We need to add 'rand' crate or implement simple random

pub struct RateLimiter;

impl RateLimiter {
    /// Wait appropriate duration based on the data source
    pub async fn wait(source: &str) {
        match source.to_uppercase().as_str() {
            "FRED" => {
                // Aggressive WAF avoidance with Jitter
                let delay = {
                    let mut rng = rand::thread_rng();
                    rng.gen_range(1500..3000)
                };
                sleep(Duration::from_millis(delay)).await;
            },
            "TIINGO" => {
                // Tiingo: 500 requests/hour for free tier = ~1.2/sec
                // 1 second delay is safe and respectful
                let delay = {
                    let mut rng = rand::thread_rng();
                    rng.gen_range(1000..2000)
                };
                sleep(Duration::from_millis(delay)).await;
            },
            "UPBIT" | "BINANCE" => {
                // Exchanges often allow 10 req/sec or more.
                // Minimal delay to prevent burst flood.
                sleep(Duration::from_millis(100)).await;
            },
            _ => {
                // Default minimal safe delay
                sleep(Duration::from_millis(100)).await;
            }
        }
    }
}
