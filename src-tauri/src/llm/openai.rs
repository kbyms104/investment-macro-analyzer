use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<Message>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Debug, Serialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct OpenAIResponse {
    choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    message: ResponseMessage,
}

#[derive(Debug, Deserialize)]
struct ResponseMessage {
    content: String,
}

/// Generate response using OpenAI API
pub async fn generate(api_key: &str, model: &str, prompt: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    
    let request = OpenAIRequest {
        model: model.to_string(),
        messages: vec![
            Message {
                role: "system".to_string(),
                content: "You are a professional investment analyst providing market insights.".to_string(),
            },
            Message {
                role: "user".to_string(),
                content: prompt.to_string(),
            },
        ],
        temperature: 0.7,
        max_tokens: 2000,
    };
    
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("OpenAI request failed: {}", e))?;
    
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI API error ({}): {}", status, body));
    }
    
    let result: OpenAIResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;
    
    result.choices
        .first()
        .map(|c| c.message.content.clone())
        .ok_or("No response from OpenAI".to_string())
}

/// Test OpenAI connection
pub async fn test_connection(api_key: &str) -> Result<bool, String> {
    let client = reqwest::Client::new();
    
    let response = client
        .get("https://api.openai.com/v1/models")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("Connection test failed: {}", e))?;
    
    Ok(response.status().is_success())
}
