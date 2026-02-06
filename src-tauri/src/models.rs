use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::{DateTime, Utc};

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Indicator {
    pub id: i32,
    pub slug: String,
    pub name: String,
    pub category: String,
    pub description: Option<String>,
    pub refresh_interval: String,
    pub source: Option<String>,
    pub is_active: bool,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    pub update_status: Option<String>,
    pub error_message: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct HistoricalData {
    pub indicator_id: i32,
    pub timestamp: DateTime<Utc>,
    pub value: f64,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone, FromRow)]
pub struct DataPoint {
    pub timestamp: DateTime<Utc>,
    pub value: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MatrixResult {
    pub labels: Vec<String>,
    pub slugs: Vec<String>,
    pub matrix: Vec<Vec<f64>>, // Use 0.0 for NaN/None to simplify JSON
    pub data_points: usize,
}
