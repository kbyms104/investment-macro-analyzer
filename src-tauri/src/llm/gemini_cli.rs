use std::process::Command;
use std::fs;
use std::path::Path;

/// Generate response using Gemini CLI via Node.js wrapper
/// Wrapper handles environment isolation and proper piping
pub async fn generate(model: &str, prompt: &str) -> Result<String, String> {
    let model = model.to_string();
    let prompt = prompt.to_string();
    
    let result = tokio::task::spawn_blocking(move || {
        // Map model names to gemini-cli aliases
        let model_alias = match model.as_str() {
            "flash" => "flash",
            "pro" => "pro",
            "flash-lite" => "flash-lite",
            "auto" => "auto",
            other => other,
        };
        
        // Write prompt to temp file
        let temp_dir = std::env::temp_dir();
        let prompt_file = temp_dir.join("gemini_prompt.txt");
        
        if let Err(e) = fs::write(&prompt_file, &prompt) {
            return Err(format!("Failed to write prompt file: {}", e));
        }
        
        // Locate wrapper script
        // In dev: src-tauri/scripts/gemini_wrapper.cjs
        // We assume CWD is src-tauri during dev
        let script_path = Path::new("scripts").join("gemini_wrapper.cjs");
        
        if !script_path.exists() {
             // Fallback: try absolute path based on manifest dir if possible, 
             // or check if we are in project root
             if Path::new("src-tauri/scripts/gemini_wrapper.cjs").exists() {
                 // We are in project root
             } else {
                 return Err(format!("Wrapper script not found at: {}", script_path.display()));
             }
        }
        
        let script_path_str = if script_path.exists() {
            script_path.to_string_lossy().to_string()
        } else {
            "src-tauri/scripts/gemini_wrapper.cjs".to_string()
        };
        
        // Execute node wrapper
        // node script.js <model> <prompt_file>
        
        let output = if cfg!(windows) {
             Command::new("cmd")
                .args([
                    "/C",
                    "node",
                    &script_path_str,
                    model_alias,
                    prompt_file.to_string_lossy().as_ref()
                ])
                .output()
        } else {
             Command::new("node")
                .args([
                    &script_path_str,
                    model_alias,
                    prompt_file.to_string_lossy().as_ref()
                ])
                .output()
        };
        
        // Clean up prompt file
        let _ = fs::remove_file(&prompt_file);
        
        match output {
            Ok(o) => {
                if o.status.success() {
                    let response = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    if response.is_empty() {
                         // Check stderr for clues if empty
                        let stderr = String::from_utf8_lossy(&o.stderr);
                        if !stderr.is_empty() {
                            return Err(format!("Gemini Wrapper returned empty but stderr had: {}", stderr));
                        }
                        return Err("Gemini CLI returned empty response".to_string());
                    }
                    Ok(response)
                } else {
                    let stderr = String::from_utf8_lossy(&o.stderr).to_string();
                    let stdout = String::from_utf8_lossy(&o.stdout).to_string(); // Wrapper might print error to stdout
                    
                    Err(format!("Gemini Error: {}\n{}", stderr.trim(), stdout.trim()))
                }
            },
            Err(e) => Err(format!("Failed to execute Node wrapper: {}", e)),
        }
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;
    
    result
}

/// Test if Gemini CLI is installed via Node wrapper
pub async fn test_connection() -> Result<bool, String> {
    let result = tokio::task::spawn_blocking(|| {
        // Simple check: `gemini --version` via direct command 
        // We can still trust direct version check, or use wrapper if needed.
        // Let's stick to direct check for version as it's simpler and less prone to environment issues
        // (Version check doesn't scan project files)
        
        let commands_to_try = ["gemini", "gemini.cmd"];
        
        for cmd in commands_to_try {
            if let Ok(o) = Command::new(cmd).arg("--version").output() {
                if o.status.success() {
                    return Ok(true);
                }
            }
        }
        
        // Fallback: Check if node is available
        if Command::new("node").arg("--version").output().is_ok() {
             // If node exists, we can try to run gemini via npx as last resort check
             if Command::new("npx").args(["gemini", "--version"]).output().is_ok() {
                 return Ok(true);
             }
        }

        Err("Gemini CLI not found. Install with: npm install -g @google/gemini-cli".to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;
    
    result
}

/// Get version of Gemini CLI
pub async fn get_version() -> Result<String, String> {
    let result = tokio::task::spawn_blocking(|| {
        let commands_to_try = ["gemini", "gemini.cmd"];
        
        for cmd in commands_to_try {
            if let Ok(o) = Command::new(cmd).arg("--version").output() {
                 if o.status.success() {
                    return Ok(String::from_utf8_lossy(&o.stdout).trim().to_string());
                }
            }
        }
         Err("Unknown".to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;
    
    result
}
