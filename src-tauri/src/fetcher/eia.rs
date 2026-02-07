use async_trait::async_trait;
use crate::models::DataPoint;
use super::DataSource;
use anyhow::{Result, anyhow};
use reqwest::Client;
use serde_json::Value;
use chrono::{TimeZone, Utc};

pub struct EiaFetcher {
    api_key: String,
    client: Client,
}

impl EiaFetcher {
    pub fn new(api_key: String) -> Self {
        let client = Client::builder()
            .build()
            .unwrap_or_else(|_| Client::new());

        Self { api_key, client }
    }

    fn parse_response(json: &Value) -> Result<Vec<DataPoint>> {
        // EIA v2 API structure:
        // { "response": { "data": [ { "period": "2023-01-06", "value": 12345, ... }, ... ] } }
        
        let data_array = json["response"]["data"]
            .as_array()
            .ok_or_else(|| anyhow!("Invalid EIA API response format: 'response.data' missing"))?;

        let mut data_points = Vec::new();

        for obs in data_array {
            // "period": "2023-01-06", "value": 12345
            if let (Some(date_str), Some(value_val)) = (obs["period"].as_str(), obs["value"].as_f64()) {
                if let Ok(naive_date) = chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
                    let timestamp = Utc.from_utc_datetime(&naive_date.and_hms_opt(0, 0, 0).unwrap());
                    
                    data_points.push(DataPoint {
                        timestamp,
                        value: value_val,
                    });
                }
            }
        }
        
        // Sort by Date ASC
        data_points.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        Ok(data_points)
    }
}

#[async_trait]
impl DataSource for EiaFetcher {
    fn name(&self) -> &str {
        "eia"
    }

    async fn fetch_data(&self, series_id: &str) -> Result<Vec<DataPoint>> {
        // EIA v2 URL structure is complex and depends on the dataset.
        // For simplicity in this MVP, we will assume `series_id` contains the full API route path 
        // OR we map specific known IDs to their route.
        // Let's assume series_id is like "TOTAL.PET_RCREST_US_WS.W" (Petroleum, Stocks, Weekly)
        // Actually, v2 uses routes like `petroleum/sum/sndw`. 
        // To keep it generic, let's treat `series_id` as the Facet/Route string.
        
        // Example: https://api.eia.gov/v2/petroleum/sum/sndw/data/?api_key=XXX&frequency=weekly&data[0]=value&facets[series][]=W_EPC0_SAX_YCU_MBBL&sort[0][column]=period&sort[0][direction]=asc
        
        println!("Fetching EIA Data for Series: {}", series_id);

        if self.api_key.is_empty() {
            println!("EIA Error: API Key is empty or missing in DB.");
            return Err(anyhow!("EIA API Key is missing"));
        }
        
        // ID Refinement for facets
        let facet_id = if series_id.starts_with("NG.") {
            series_id.strip_prefix("NG.").unwrap_or(series_id).strip_suffix(".W").unwrap_or(series_id)
        } else {
            series_id
        };

        // Base route mapping
        let route = match series_id {
            "W_EPC0_SAX_YCU_MBBL" | "WGT_EPC0_R5301_YCU_MBBL" | "W_EPUF_EER_SAX_YCU_PCT" => "petroleum/sum/sndw",
            s if s.starts_with("NG.") => "natural-gas/stor/wkly",
            _ => return Err(anyhow!("Unknown EIA Series ID format/route: {}", series_id)),
        };

        // Query params
        let mut params = vec![
            ("api_key", self.api_key.clone()),
            ("data[]", "value".to_string()),
            ("sort[0][column]", "period".to_string()),
            ("sort[0][direction]", "asc".to_string()),
        ];

        // Only add frequency if not implied by route
        if !route.contains("/wkly") && !route.contains("/sndw") {
            params.push(("frequency", "weekly".to_string()));
        }

        // Specific facets: Use 'series' for all routes as per API error logs
        params.push(("facets[series][]", facet_id.to_string()));

        let base_url = "https://api.eia.gov/v2";
        let url = format!("{}/{}/data/", base_url, route);

        println!("  > Fetching EIA Route: {} (ID: {})", route, facet_id);

        let resp = self.client.get(&url)
            .query(&params)
            .send()
            .await?;
        
        let status = resp.status();
        if !status.is_success() {
            let err_body = resp.text().await.unwrap_or_else(|_| "Unknown error body".to_string());
            println!("EIA API Error Response ({}): {}", status, err_body);
            return Err(anyhow!("EIA API Error: {} - {}", status, err_body));
        }

        let json: Value = resp.json().await?;
        
        // Debug logging for empty data (Mask API Key in logs)
        if let Some(total_str) = json["response"]["total"].as_str() {
            if total_str == "0" {
                let mut sanitized_json = json.clone();
                if let Some(req_params) = sanitized_json["request"]["params"].as_object_mut() {
                    req_params.insert("api_key".to_string(), Value::String("REDACTED".to_string()));
                }
                println!("EIA Warning: No data returned for series '{}'. Response: {}", series_id, sanitized_json);
            }
        }
        Self::parse_response(&json)
    }
}
