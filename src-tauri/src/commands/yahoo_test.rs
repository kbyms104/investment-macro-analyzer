
use crate::ConnectionTestResult;

#[tauri::command]
pub async fn test_yahoo_connection() -> Result<ConnectionTestResult, String> {
    use crate::fetcher::DataSource;
    let fetcher = crate::fetcher::yahoo::YahooFetcher::new();
    // Test with S&P 500
    match fetcher.fetch_data("^GSPC").await {
        Ok(_) => Ok(ConnectionTestResult { success: true, message: "Yahoo Finance is reachable".to_string() }),
        Err(e) => Ok(ConnectionTestResult { success: false, message: format!("Yahoo Connection Failed: {}", e) }),
    }
}
