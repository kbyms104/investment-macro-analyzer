use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct OllamaResponse {
    response: String,
}

/// Generate response using local Ollama API
pub async fn generate(base_url: &str, model: &str, prompt: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    
    let request = OllamaRequest {
        model: model.to_string(),
        prompt: prompt.to_string(),
        stream: false,
    };
    
    let url = format!("{}/api/generate", base_url);
    
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {}. Is Ollama running?", e))?;
    
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Ollama API error ({}): {}", status, body));
    }
    
    let result: OllamaResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;
    
    Ok(result.response)
}

/// Test Ollama connection and check if model exists
pub async fn test_connection(base_url: &str, model: &str) -> Result<bool, String> {
    let client = reqwest::Client::new();
    
    // Check if Ollama is running
    let url = format!("{}/api/tags", base_url);
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Ollama not reachable: {}", e))?;
    
    if !response.status().is_success() {
        return Err("Ollama is not responding".to_string());
    }
    
    // Check if model is available
    #[derive(Deserialize)]
    struct TagsResponse {
        models: Vec<ModelInfo>,
    }
    
    #[derive(Deserialize)]
    struct ModelInfo {
        name: String,
    }
    
    let tags: TagsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;
    
    let model_exists = tags.models.iter().any(|m| m.name.starts_with(model));
    
    if !model_exists {
        return Err(format!("Model '{}' not found. Run: ollama pull {}", model, model));
    }
    
    Ok(true)
}

/// Get list of available Ollama models
pub async fn list_models(base_url: &str) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    
    let url = format!("{}/api/tags", base_url);
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Ollama not reachable: {}", e))?;
    
    #[derive(Deserialize)]
    struct TagsResponse {
        models: Vec<ModelInfo>,
    }
    
    #[derive(Deserialize)]
    struct ModelInfo {
        name: String,
    }
    
    let tags: TagsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;
    
    Ok(tags.models.into_iter().map(|m| m.name).collect())
}
