pub mod openai;
pub mod ollama;
pub mod gemini_cli;
pub mod prompt;

use serde::{Serialize, Deserialize};
use sqlx::SqlitePool;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LLMProviderType {
    OpenAI,
    Ollama,
    #[serde(rename = "gemini_cli")]
    GeminiCLI,
}

impl Default for LLMProviderType {
    fn default() -> Self {
        LLMProviderType::OpenAI
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMSettings {
    pub provider: LLMProviderType,
    pub openai_api_key: Option<String>,
    pub openai_model: String,
    pub ollama_model: String,
    pub ollama_url: String,
    pub gemini_model: String,
}

impl Default for LLMSettings {
    fn default() -> Self {
        LLMSettings {
            provider: LLMProviderType::OpenAI,
            openai_api_key: None,
            openai_model: "gpt-4o-mini".to_string(),
            ollama_model: "llama3".to_string(),
            ollama_url: "http://localhost:11434".to_string(),
            gemini_model: "flash".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIReport {
    pub content: String,
    pub referenced_indicators: Vec<ReferencedIndicator>,
    pub generated_at: String,
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferencedIndicator {
    pub slug: String,
    pub name: String,
    pub value: f64,
    pub z_score: f64,
    pub sparkline: Vec<f64>,
    #[serde(default)]
    pub tag: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIReportSummary {
    pub id: i64,
    pub generated_at: String,
    pub provider: String,
    pub model: String,
    pub preview: String,
}

/// Generate AI Report using the configured provider and save to DB
pub async fn generate_report(pool: &SqlitePool) -> Result<AIReport, String> {
    // 1. Load settings
    let settings = load_settings(pool).await?;
    
    // 2. Build prompt with market data
    let (prompt, referenced) = prompt::build_analysis_prompt(pool).await?;
    
    // 3. Call appropriate provider
    let (content, model_used) = match settings.provider {
        LLMProviderType::OpenAI => {
            let key = settings.openai_api_key.ok_or("OpenAI API Key not configured")?;
            let response = openai::generate(&key, &settings.openai_model, &prompt).await?;
            (response, settings.openai_model)
        },
        LLMProviderType::Ollama => {
            let response = ollama::generate(&settings.ollama_url, &settings.ollama_model, &prompt).await?;
            (response, settings.ollama_model)
        },
        LLMProviderType::GeminiCLI => {
            let response = gemini_cli::generate(&settings.gemini_model, &prompt).await?;
            (response, settings.gemini_model)
        },
    };
    
    let generated_at = chrono::Utc::now().format("%Y-%m-%d %H:%M UTC").to_string();
    let provider_str = format!("{:?}", settings.provider);

    // 4. Save to Database
    let referenced_json = serde_json::to_string(&referenced).unwrap_or_else(|_| "[]".to_string());
    
    let _ = sqlx::query("INSERT INTO ai_reports (content, provider, model, referenced_indicators, created_at) VALUES ($1, $2, $3, $4, $5)")
        .bind(&content)
        .bind(&provider_str)
        .bind(&model_used)
        .bind(&referenced_json)
        .bind(&generated_at)
        .execute(pool)
        .await
        .map_err(|e| println!("Failed to save report: {}", e)); // Log error but don't fail the request

    Ok(AIReport {
        content,
        referenced_indicators: referenced,
        generated_at,
        provider: provider_str,
        model: model_used,
    })
}

/// Get history of AI reports (summaries only)
pub async fn get_report_history(pool: &SqlitePool) -> Result<Vec<AIReportSummary>, String> {
    use sqlx::Row;
    
    let rows = sqlx::query("SELECT id, content, provider, model, created_at FROM ai_reports ORDER BY id DESC LIMIT 20")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let summaries = rows.iter().map(|row| {
        let content: String = row.get("content");
        // Create a preview (first 100 chars or first line)
        let preview = content.lines().next().unwrap_or(&content).chars().take(80).collect::<String>() + "...";
        
        AIReportSummary {
            id: row.get("id"),
            generated_at: row.get("created_at"),
            provider: row.get("provider"),
            model: row.get("model"),
            preview,
        }
    }).collect();

    Ok(summaries)
}

/// Get a specific report by ID
pub async fn get_report(pool: &SqlitePool, id: i64) -> Result<AIReport, String> {
    use sqlx::Row;

    let row = sqlx::query("SELECT content, referenced_indicators, created_at, provider, model FROM ai_reports WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Report not found")?;

    let referenced_json: String = row.get("referenced_indicators");
    let referenced: Vec<ReferencedIndicator> = serde_json::from_str(&referenced_json).unwrap_or_default();

    Ok(AIReport {
        content: row.get("content"),
        referenced_indicators: referenced,
        generated_at: row.get("created_at"),
        provider: row.get("provider"),
        model: row.get("model"),
    })
}

/// Load LLM settings from database
pub async fn load_settings(pool: &SqlitePool) -> Result<LLMSettings, String> {
    use sqlx::Row;
    
    let mut settings = LLMSettings::default();
    
    // Query all LLM settings
    let rows = sqlx::query("SELECT key, value FROM settings WHERE key LIKE 'llm_%'")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    
    for row in rows {
        let key: String = row.try_get("key").unwrap_or_default();
        let value: String = row.try_get("value").unwrap_or_default();
        
        match key.as_str() {
            "llm_provider" => {
                settings.provider = match value.as_str() {
                    "openai" => LLMProviderType::OpenAI,
                    "ollama" => LLMProviderType::Ollama,
                    "gemini_cli" => LLMProviderType::GeminiCLI,
                    _ => LLMProviderType::OpenAI,
                };
            },
            "llm_openai_key" => settings.openai_api_key = if value.is_empty() { None } else { Some(value) },
            "llm_openai_model" => settings.openai_model = value,
            "llm_ollama_model" => settings.ollama_model = value,
            "llm_ollama_url" => settings.ollama_url = value,
            "llm_gemini_model" => settings.gemini_model = value,
            _ => {}
        }
    }
    
    Ok(settings)
}

/// Save LLM settings to database
pub async fn save_settings(pool: &SqlitePool, settings: &LLMSettings) -> Result<(), String> {
    let provider_str = match settings.provider {
        LLMProviderType::OpenAI => "openai",
        LLMProviderType::Ollama => "ollama",
        LLMProviderType::GeminiCLI => "gemini_cli",
    };
    
    let pairs = vec![
        ("llm_provider", provider_str.to_string()),
        ("llm_openai_key", settings.openai_api_key.clone().unwrap_or_default()),
        ("llm_openai_model", settings.openai_model.clone()),
        ("llm_ollama_model", settings.ollama_model.clone()),
        ("llm_ollama_url", settings.ollama_url.clone()),
        ("llm_gemini_model", settings.gemini_model.clone()),
    ];
    
    for (key, value) in pairs {
        sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)")
            .bind(key)
            .bind(value)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}
