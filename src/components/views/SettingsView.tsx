import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Database, History, DownloadCloud, AlertTriangle, CheckCircle, Bot, Zap } from "lucide-react";
import { GlassCard } from "../ui/GlassCard";
import { AlertDialog } from "../ui/AlertDialog";

interface SyncProgress {
    current: number;
    total: number;
    slug: string;
    status: string;
}

type LLMProviderType = 'openai' | 'ollama' | 'gemini_cli';

interface LLMSettings {
    provider: LLMProviderType;
    openai_api_key: string | null;
    openai_model: string;
    ollama_model: string;
    ollama_url: string;
    gemini_model: string;
}

export function SettingsView() {
    const [apiKey, setApiKey] = useState("");
    const [tiingoApiKey, setTiingoApiKey] = useState("");
    const [isSyncing, setIsSyncing] = useState(false);
    const [progress, setProgress] = useState<SyncProgress | null>(null);
    const [syncResult, setSyncResult] = useState<string | null>(null);
    const [apiUsage, setApiUsage] = useState<{ hour: number, day: number } | null>(null);

    // LLM Settings State
    const [llmSettings, setLlmSettings] = useState<LLMSettings>({
        provider: 'openai',
        openai_api_key: null,
        openai_model: 'gpt-4o-mini',
        ollama_model: 'llama3',
        ollama_url: 'http://localhost:11434',
        gemini_model: 'flash',
    });
    const [llmTestResult, setLlmTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [llmSaving, setLlmSaving] = useState(false);

    // Custom Alert Dialog State
    const [alertDialog, setAlertDialog] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        variant: "info" | "danger" | "success" | "warning";
        onConfirm?: () => void;
        confirmText?: string;
        showCancel?: boolean;
    }>({ isOpen: false, title: "", description: "", variant: "info", showCancel: false });

    const showAlert = (title: string, description: string, variant: "info" | "danger" | "success" | "warning" = "info") => {
        setAlertDialog({ isOpen: true, title, description, variant, showCancel: false });
    };

    const showConfirm = (title: string, description: string, onConfirm: () => void, variant: "info" | "danger" | "success" | "warning" = "warning") => {
        setAlertDialog({ isOpen: true, title, description, variant, onConfirm, confirmText: "Continue", showCancel: true });
    };

    const closeAlert = () => setAlertDialog(prev => ({ ...prev, isOpen: false }));

    useEffect(() => {
        // Load API Key
        invoke("get_api_key")
            .then((key) => {
                if (typeof key === 'string') setApiKey(key);
            })
            .catch(console.error);

        // Load Tiingo API Key
        invoke("get_tiingo_api_key")
            .then((key) => {
                if (typeof key === 'string') setTiingoApiKey(key);
            })
            .catch(console.error);

        // Load Tiingo Usage
        invoke<[number, number]>("get_tiingo_usage")
            .then(([hour, day]) => setApiUsage({ hour, day }))
            .catch(console.error);

        // Load LLM Settings
        invoke<LLMSettings>("get_llm_settings")
            .then(setLlmSettings)
            .catch(console.error);

        // Listen for progress
        const unlisten = listen<SyncProgress>("sync-progress", (event) => {
            setProgress(event.payload);
        });

        return () => {
            unlisten.then(f => f());
        }
    }, []);

    const saveLLMSettings = async () => {
        setLlmSaving(true);
        try {
            await invoke("save_llm_settings", { settings: llmSettings });
            setLlmTestResult({ success: true, message: "Settings saved successfully!" });
        } catch (e) {
            setLlmTestResult({ success: false, message: "Failed to save: " + e });
        } finally {
            setLlmSaving(false);
        }
    };

    const testLLMConnection = async () => {
        setLlmTestResult(null);
        try {
            // Save first, then test
            await invoke("save_llm_settings", { settings: llmSettings });
            const result = await invoke<{ success: boolean; message: string }>("test_llm_connection");
            setLlmTestResult(result);
        } catch (e) {
            setLlmTestResult({ success: false, message: String(e) });
        }
    };

    const saveApiKey = async () => {
        try {
            await invoke("save_api_key", { apiKey });
            showAlert("Success", "API Key saved successfully!", "success");
        } catch (e) {
            showAlert("Error", "Failed to save API Key: " + e, "danger");
        }
    };

    const saveTiingoApiKey = async () => {
        try {
            await invoke("save_tiingo_api_key", { apiKey: tiingoApiKey });
            showAlert("Success", "Tiingo API Key saved successfully!", "success");
        } catch (e) {
            showAlert("Error", "Failed to save Tiingo API Key: " + e, "danger");
        }
    };

    const startFullSync = () => {
        if (!apiKey) {
            showAlert("API Key Required", "Please provide a FRED API Key first.", "warning");
            return;
        }

        showConfirm(
            "Start Full History Download?",
            "This will download the entire history for all indicators. It may take 2-3 minutes.",
            async () => {
                closeAlert();
                setIsSyncing(true);
                setSyncResult(null);
                setProgress({ current: 0, total: 0, slug: "Starting...", status: "init" });

                try {
                    const result = await invoke<string>("sync_all_history", { apiKey });
                    setSyncResult(result);
                } catch (e) {
                    setSyncResult("Failed: " + e);
                } finally {
                    setIsSyncing(false);
                    setProgress(null);
                    localStorage.setItem("has_synced_history", "true");
                }
            },
            "warning"
        );
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-500 pb-20">
            <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
                <SettingsIcon className="text-primary" size={32} />
                System Settings
            </h2>

            {/* API Configuration */}
            <GlassCard className="p-6">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Database size={20} className="text-blue-500" />
                    Data Sources
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-semibold block mb-1">FRED API Key (Required)</label>
                        <div className="flex gap-3">
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                className="flex-1 bg-background/50 border border-border rounded-lg px-4 py-2"
                                placeholder="abcdef123456..."
                            />
                            <button
                                onClick={saveApiKey}
                                className="px-6 py-2 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90 transition-colors"
                            >
                                Save
                            </button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Used for fetching US Macro data (GDP, Inflation, Yields).
                        </p>
                    </div>
                    <div>
                        <label className="text-sm font-semibold block mb-1">Tiingo API Key (Optional)</label>
                        <div className="flex gap-3">
                            <input
                                type="password"
                                value={tiingoApiKey}
                                onChange={(e) => setTiingoApiKey(e.target.value)}
                                className="flex-1 bg-background/50 border border-border rounded-lg px-4 py-2"
                                placeholder="your_tiingo_api_key..."
                            />
                            <button
                                onClick={saveTiingoApiKey}
                                className="px-6 py-2 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90 transition-colors"
                            >
                                Save
                            </button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Used for S&P 500, Gold, Silver, and other market data. Get a free key at <a href="https://www.tiingo.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">tiingo.com</a>
                        </p>

                        {apiUsage && (
                            <div className="mt-3 bg-muted/30 p-3 rounded-lg border border-border/50 text-xs">
                                <div className="flex justify-between mb-2">
                                    <span className="font-semibold text-muted-foreground flex items-center gap-1">
                                        <Zap size={12} /> API Usage Protection
                                    </span>
                                    <span className={apiUsage.day > 950 ? "text-red-400 font-bold" : "text-muted-foreground"}>
                                        Free Plan Limits
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <div className="flex justify-between mb-1 opacity-80">
                                            <span>Hourly</span>
                                            <span>{apiUsage.hour} / 450</span>
                                        </div>
                                        <div className="h-1.5 bg-secondary/50 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${apiUsage.hour > 400 ? 'bg-red-500' : 'bg-green-500'}`}
                                                style={{ width: `${Math.min(100, (apiUsage.hour / 450) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between mb-1 opacity-80">
                                            <span>Daily</span>
                                            <span>{apiUsage.day} / 950</span>
                                        </div>
                                        <div className="h-1.5 bg-secondary/50 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${apiUsage.day > 900 ? 'bg-red-500' : 'bg-blue-500'}`}
                                                style={{ width: `${Math.min(100, (apiUsage.day / 950) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Yahoo Finance */}
                    <div>
                        <label className="text-sm font-semibold block mb-1">Yahoo Finance</label>
                        <div className="flex gap-3 items-center">
                            <div className="flex-1 bg-background/50 border border-border rounded-lg px-4 py-2 text-muted-foreground flex items-center justify-between">
                                <span>Public Data Source (No Key Required)</span>
                                <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded border border-emerald-500/20">Active</span>
                            </div>
                            <button
                                onClick={async () => {
                                    try {
                                        const res = await invoke<{ success: boolean, message: string }>("test_yahoo_connection");
                                        showAlert(res.success ? "Success" : "Connection Failed", res.message, res.success ? "success" : "danger");
                                    } catch (e) {
                                        showAlert("Connection Error", String(e), "danger");
                                    }
                                }}
                                className="px-6 py-2 bg-secondary hover:bg-secondary/80 border border-border text-foreground font-bold rounded-lg transition-colors"
                            >
                                Test
                            </button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Source for Global Indices (S&P 500, Nasdaq, Nikkei, etc.).
                        </p>
                    </div>
                </div>
            </GlassCard>

            {/* AI Analyst Configuration */}
            <GlassCard className="p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Bot size={100} />
                </div>

                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Bot size={20} className="text-purple-500" />
                    AI Analyst Configuration
                    <span className="ml-2 text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 font-normal">NEW</span>
                </h3>

                <div className="space-y-6">
                    {/* Provider Selection */}
                    <div>
                        <label className="text-sm font-semibold block mb-3">LLM Provider</label>
                        <div className="grid grid-cols-3 gap-3">
                            {(['openai', 'ollama', 'gemini_cli'] as const).map((provider) => (
                                <button
                                    key={provider}
                                    onClick={() => setLlmSettings(prev => ({ ...prev, provider }))}
                                    className={`p-4 rounded-xl border transition-all text-left ${llmSettings.provider === provider
                                        ? 'bg-primary/10 border-primary/50 text-foreground'
                                        : 'bg-background/50 border-border hover:border-primary/30 text-muted-foreground'
                                        }`}
                                >
                                    <div className="font-bold text-sm">
                                        {provider === 'openai' ? 'OpenAI' : provider === 'ollama' ? 'Ollama (Local)' : 'Gemini CLI'}
                                    </div>
                                    <div className="text-xs mt-1 opacity-70">
                                        {provider === 'openai' ? 'GPT-4o, GPT-3.5' : provider === 'ollama' ? 'Llama, Mistral' : 'Flash, Pro'}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* OpenAI Settings */}
                    {llmSettings.provider === 'openai' && (
                        <div className="space-y-4 animate-in fade-in">
                            <div>
                                <label className="text-sm font-semibold block mb-1">OpenAI API Key</label>
                                <input
                                    type="password"
                                    value={llmSettings.openai_api_key || ''}
                                    onChange={(e) => setLlmSettings(prev => ({ ...prev, openai_api_key: e.target.value || null }))}
                                    className="w-full bg-background/50 border border-border rounded-lg px-4 py-2"
                                    placeholder="sk-..."
                                />
                            </div>
                            <div>
                                <label className="text-sm font-semibold block mb-1">Model</label>
                                <select
                                    value={llmSettings.openai_model}
                                    onChange={(e) => setLlmSettings(prev => ({ ...prev, openai_model: e.target.value }))}
                                    className="w-full bg-background/50 border border-border rounded-lg px-4 py-2"
                                >
                                    <option value="gpt-4o-mini">GPT-4o Mini (Recommended)</option>
                                    <option value="gpt-4o">GPT-4o</option>
                                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Ollama Settings */}
                    {llmSettings.provider === 'ollama' && (
                        <div className="space-y-4 animate-in fade-in">
                            <div>
                                <label className="text-sm font-semibold block mb-1">Ollama URL</label>
                                <input
                                    type="text"
                                    value={llmSettings.ollama_url}
                                    onChange={(e) => setLlmSettings(prev => ({ ...prev, ollama_url: e.target.value }))}
                                    className="w-full bg-background/50 border border-border rounded-lg px-4 py-2"
                                    placeholder="http://localhost:11434"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-semibold block mb-1">Model</label>
                                <input
                                    type="text"
                                    value={llmSettings.ollama_model}
                                    onChange={(e) => setLlmSettings(prev => ({ ...prev, ollama_model: e.target.value }))}
                                    className="w-full bg-background/50 border border-border rounded-lg px-4 py-2"
                                    placeholder="llama3, mistral, codellama..."
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Run <code className="bg-muted px-1 rounded">ollama pull llama3</code> to download a model.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Gemini CLI Settings */}
                    {llmSettings.provider === 'gemini_cli' && (
                        <div className="space-y-4 animate-in fade-in">
                            <div>
                                <label className="text-sm font-semibold block mb-1">Model</label>
                                <select
                                    value={llmSettings.gemini_model}
                                    onChange={(e) => setLlmSettings(prev => ({ ...prev, gemini_model: e.target.value }))}
                                    className="w-full bg-background/50 border border-border rounded-lg px-4 py-2"
                                >
                                    <option value="flash">Gemini Flash (Fast)</option>
                                    <option value="pro">Gemini Pro</option>
                                    <option value="flash-lite">Gemini Flash Lite</option>
                                </select>
                            </div>
                            <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg">
                                <p className="text-xs text-blue-400">
                                    Gemini CLI uses your Google account for authentication.
                                    Install from: <a href="https://github.com/google-gemini/gemini-cli" target="_blank" className="underline">github.com/google-gemini/gemini-cli</a>
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={testLLMConnection}
                            className="px-4 py-2 bg-muted hover:bg-muted/80 border border-border rounded-lg transition-colors"
                        >
                            Test Connection
                        </button>
                        <button
                            onClick={saveLLMSettings}
                            disabled={llmSaving}
                            className="px-6 py-2 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                            {llmSaving ? 'Saving...' : 'Save Settings'}
                        </button>
                    </div>

                    {/* Test Result */}
                    {llmTestResult && (
                        <div className={`p-3 rounded-lg flex items-center gap-2 animate-in fade-in ${llmTestResult.success
                            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                            : 'bg-red-500/10 border border-red-500/20 text-red-400'
                            }`}>
                            {llmTestResult.success ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                            <span className="text-sm">{llmTestResult.message}</span>
                        </div>
                    )}
                </div>
            </GlassCard>

            {/* Historical Data Sync */}
            <GlassCard className="p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <History size={100} />
                </div>

                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <History size={20} className="text-amber-500" />
                    Historical Data Management
                </h3>

                <div className="space-y-4">
                    <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl">
                        <h4 className="font-bold text-amber-500 flex items-center gap-2 mb-2">
                            <AlertTriangle size={16} />
                            Important
                        </h4>
                        <p className="text-sm text-muted-foreground">
                            For accurate Market Cycle analysis, the system needs at least 20 years of historical data.
                            Please run the "Full History Download" at least once.
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={startFullSync}
                            disabled={isSyncing}
                            className={`flex items-center gap-3 px-6 py-4 rounded-xl text-left border transition-all ${isSyncing
                                ? "bg-muted cursor-wait border-border"
                                : "bg-background hover:bg-muted/50 border-border hover:border-primary/50 group"
                                }`}
                        >
                            <div className={`p-3 rounded-full ${isSyncing ? "bg-muted-foreground/20" : "bg-primary/10 group-hover:bg-primary/20 text-primary"}`}>
                                <DownloadCloud size={24} className={isSyncing ? "animate-bounce" : ""} />
                            </div>
                            <div>
                                <div className="font-bold text-lg">Download Full History</div>
                                <div className="text-xs text-muted-foreground">Fetches max available data for all indicators</div>
                            </div>
                        </button>
                    </div>

                    {/* Progress Bar */}
                    {isSyncing && progress && (
                        <div className="space-y-2 animate-in fade-in">
                            <div className="flex justify-between text-xs font-mono text-muted-foreground">
                                <span>Processing: {progress.slug}</span>
                                <span>{progress.current} / {progress.total}</span>
                            </div>
                            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-300 ease-out"
                                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Result Message */}
                    {syncResult && (
                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-500 animate-in slide-in-from-left">
                            <CheckCircle size={20} />
                            <span className="font-bold">{syncResult}</span>
                        </div>
                    )}
                </div>
            </GlassCard>

            {/* About */}
            <GlassCard className="p-6">
                <h3 className="text-xl font-bold mb-2">About App</h3>
                <div className="text-sm text-muted-foreground space-y-1">
                    <p>Version: 0.1.0 (PRO)</p>
                    <p>Engine: Rust (Tauri) + React</p>
                    <p>Developer: Antigravity Agent</p>
                </div>
            </GlassCard>

            {/* Custom Alert Dialog */}
            <AlertDialog
                isOpen={alertDialog.isOpen}
                title={alertDialog.title}
                description={alertDialog.description}
                variant={alertDialog.variant}
                confirmText={alertDialog.onConfirm ? (alertDialog.confirmText || "Continue") : "OK"}
                cancelText="Cancel"
                onConfirm={() => {
                    if (alertDialog.onConfirm) {
                        alertDialog.onConfirm();
                    } else {
                        closeAlert();
                    }
                }}
                onCancel={closeAlert}
            />
        </div>
    );
}

function SettingsIcon({ className, size }: { className?: string, size?: number }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size || 24}
            height={size || 24}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        </svg>
    )
}
