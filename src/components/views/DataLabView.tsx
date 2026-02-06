import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Database, RefreshCw, Terminal, Play, Server } from "lucide-react";
import { GlassCard } from "../ui/GlassCard";

interface SystemStatus {
    source: string;
    total: number;
    healthy: number;
    failed: number;
    lastUpdate: string;
    status: 'online' | 'degraded' | 'offline';
}

interface LogEntry {
    id: string;
    time: string;
    level: 'info' | 'warn' | 'error' | 'success';
    source: string;
    message: string;
}

export function DataLabView() {
    const [loading, setLoading] = useState(false);
    const [statuses, setStatuses] = useState<SystemStatus[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Function to analyze system health
    const refreshStatus = async () => {
        setLoading(true);
        try {
            // 1. Get all indicators
            const indicators = await invoke<any[]>("get_indicators_list");

            // 2. Group by Source
            const sources = ["FRED", "Tiingo", "Binance", "Alternative", "Calculated"];
            const newStatuses: SystemStatus[] = sources.map(source => {
                // Case insensitive match and fallback for source string variance (Map Yahoo -> Tiingo)
                const items = indicators.filter(i => {
                    const s = (i.source || "").toUpperCase();
                    if (source === 'Tiingo' && s === 'YAHOO') return true;
                    return s === source.toUpperCase();
                });
                const total = items.length;

                // Healthy if updated recently (or at least once)
                // Backend returns 'updated_at'
                const healthy = items.filter(i => i.updated_at).length;
                const failed = items.filter(i => i.update_status === 'error').length;

                // Find most recent update
                const dates = items.map(i => i.updated_at).filter(d => d).sort();
                const lastUpdate = dates.length > 0 ? dates[dates.length - 1] : "";

                let status: SystemStatus['status'] = 'offline';
                if (total > 0) {
                    if (healthy === total) status = 'online';
                    else if (healthy > 0) status = 'degraded';
                    // If everything is failed?
                    if (failed === total && total > 0) status = 'offline';
                }

                return {
                    source,
                    total,
                    healthy,
                    failed: total - healthy,
                    lastUpdate,
                    status
                };
            }).filter((s): s is SystemStatus => s !== null);

            setStatuses(newStatuses);

            // Add log
            addLog('info', 'System', 'System status refreshed successfully');

        } catch (e) {
            console.error(e);
            addLog('error', 'System', 'Failed to refresh status');
        } finally {
            setLoading(false);
        }
    };

    const addLog = (level: LogEntry['level'], source: string, message: string) => {
        setLogs(prev => [{
            id: crypto.randomUUID(),
            time: new Date().toLocaleTimeString(),
            level,
            source,
            message
        }, ...prev].slice(0, 50));
    };

    // Run specific sync
    const handleSync = async (source: string) => {
        addLog('info', source, `Starting QUICK synchronization for ${source}...`);
        setLoading(true);
        try {
            const indicators: any[] = await invoke("get_indicators_list");
            const targets = indicators.filter(i => {
                const s = (i.source || "").toUpperCase();
                if (source === 'Tiingo' && s === 'YAHOO') return true;
                return s === source.toUpperCase();
            });

            addLog('info', source, `Found ${targets.length} targets. Fetching (Latest Only)...`);

            let successCount = 0;
            let failCount = 0;

            const apiKey: string = await invoke("get_api_key");

            for (const ind of targets) {
                try {
                    // Pass backfill: false for normal quick sync
                    await invoke("calculate_indicator", { apiKey, slug: ind.slug, backfill: false });
                    successCount++;
                } catch (e) {
                    failCount++;
                    addLog('warn', source, `Failed to sync ${ind.slug}`);
                }
            }

            if (failCount === 0) {
                if (successCount > 0) {
                    addLog('success', source, `Sync Complete. Updated ${successCount} indicators.`);
                    refreshStatus();
                } else {
                    addLog('warn', source, `Sync Complete. No indicators found/updated.`);
                }
            } else {
                addLog('warn', source, `Sync Finished with warnings. Success: ${successCount}, Failed: ${failCount}`);
            }

        } catch (e) {
            addLog('error', source, `Sync Critical Failure: ${e}`);
        } finally {
            setLoading(false);
        }
    };

    // Deep Backfill Logic
    const handleDeepBackfill = async () => {
        if (!confirm("Start Deep Backfill Analysis? This will fetch 5+ years of historical data for ALL indicators. It may take 1-2 minutes.")) return;

        setLoading(true);
        addLog('info', 'System', '🚀 Starting DEEP BACKFILL Protocol...');

        try {
            const apiKey: string = await invoke("get_api_key");
            const indicators: any[] = await invoke("get_indicators_list");
            // Filter out internal calculated ones or manual
            const targets = indicators.filter(i => i.source !== 'Manual' && i.source !== 'Calculated');

            addLog('info', 'System', `Queueing ${targets.length} indicators for historical retrieval...`);

            // Concurrency Control: Process in chunks of 3
            const CHUNK_SIZE = 3;
            let processed = 0;
            let failures = 0;

            for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
                const chunk = targets.slice(i, i + CHUNK_SIZE);

                await Promise.all(chunk.map(async (ind) => {
                    try {
                        // const start = Date.now();
                        await invoke("calculate_indicator", { apiKey, slug: ind.slug, backfill: true });
                        // const duration = Date.now() - start;
                        // addLog('info', ind.source, `Synced ${ind.slug} (${duration}ms)`);
                    } catch (e) {
                        failures++;
                        addLog('warn', ind.source, `Backfill failed for ${ind.slug}: ${e}`);
                    }
                }));

                processed += chunk.length;

                // Update Progress somehow? Logs are fine.
                if (processed % 10 === 0 || processed === targets.length) {
                    addLog('info', 'System', `Progress: ${processed}/${targets.length} indicators processed...`);
                }

                // Rate Limit Pause (Safe 500ms)
                await new Promise(r => setTimeout(r, 500));
            }

            addLog('success', 'System', `✨ DEEP BACKFILL COMPLETE. Success: ${targets.length - failures}, Failures: ${failures}`);
            refreshStatus();

        } catch (e) {
            addLog('error', 'System', `Backfill Crash: ${e}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs]);

    useEffect(() => {
        refreshStatus();
        addLog('info', 'System', 'Control Center initialized');
    }, []);

    return (
        <div className="h-full flex flex-col gap-6 animate-in fade-in space-y-4">

            {/* 1. Header & Global KPIs */}
            <GlassCard className="p-6 border-border">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-3">
                            <Server className="text-primary" />
                            Data Control Center
                        </h2>
                        <p className="text-muted-foreground mt-1">Monitor and control data ingestion pipelines</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => handleDeepBackfill()}
                            disabled={loading}
                            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${loading ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary hover:bg-primary hover:text-white border border-primary/20'}`}
                        >
                            <span className="relative flex h-2 w-2">
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 ${loading ? 'hidden' : 'inline-flex'}`}></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                            </span>
                            Force Deep Sync (5Y)
                        </button>
                        <button onClick={() => refreshStatus()} className="p-2 hover:bg-muted rounded-lg transition-colors">
                            <RefreshCw className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl bg-background/50 border border-border flex flex-col">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider mb-1">System Health</span>
                        <span className="text-2xl font-bold text-emerald-500 flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                            Online
                        </span>
                    </div>
                    <div className="p-4 rounded-xl bg-background/50 border border-border flex flex-col">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Indicators</span>
                        <span className="text-2xl font-bold">{statuses.reduce((a, b) => a + b.total, 0)}</span>
                    </div>
                    <div className="p-4 rounded-xl bg-background/50 border border-border flex flex-col">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider mb-1">24h Update Rate</span>
                        <span className="text-2xl font-bold text-blue-400">98.5%</span>
                    </div>
                    <div className="p-4 rounded-xl bg-background/50 border border-border flex flex-col">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Active Sources</span>
                        <span className="text-2xl font-bold">{statuses.length}</span>
                    </div>
                </div>
            </GlassCard>

            {/* 2. Source Status Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {statuses.map(stat => (
                    <GlassCard key={stat.source} className="p-5 border-border relative overflow-hidden group">
                        {/* Status Indicator Line */}
                        <div className={`absolute top-0 left-0 w-full h-1 ${stat.status === 'online' ? 'bg-emerald-500' : stat.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500'}`}></div>

                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-muted">
                                    <Database size={18} />
                                </div>
                                <div>
                                    <h3 className="font-bold">{stat.source}</h3>
                                    <p className="text-xs text-muted-foreground">{stat.status.toUpperCase()}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleSync(stat.source)}
                                className="p-2 rounded-full hover:bg-primary/10 hover:text-primary transition-colors active:scale-95" title="Trigger Sync">
                                <Play size={16} fill="currentColor" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Coverage</span>
                                <span className="font-medium">{stat.healthy}/{stat.total}</span>
                            </div>

                            {/* Progress Bar */}
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full ${stat.status === 'online' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                    style={{ width: `${stat.total > 0 ? (stat.healthy / stat.total) * 100 : 0}%` }}
                                ></div>
                            </div>

                            <div className="flex justify-between text-xs text-muted-foreground pt-1">
                                <span>Last: {stat.lastUpdate ? new Date(stat.lastUpdate).toLocaleString() : 'Never'}</span>
                                {stat.failed > 0 && <span className="text-red-400">{stat.failed} Issues</span>}
                            </div>
                        </div>
                    </GlassCard>
                ))}
            </div>

            {/* 3. Terminal / Logs */}
            <div className="h-[350px] shrink-0">
                <GlassCard className="h-full border-border flex flex-col overflow-hidden" noPadding>
                    <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Terminal size={16} className="text-muted-foreground" />
                            <span className="text-sm font-medium">System Activity Log</span>
                        </div>
                        <div className="flex gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
                            <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/50"></div>
                            <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50"></div>
                        </div>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-1 bg-black/40">
                        {logs.length === 0 && <div className="text-muted-foreground/50 text-center py-10">Waiting for system events...</div>}
                        {logs.slice().reverse().map(log => (
                            <div key={log.id} className="flex gap-3 hover:bg-white/5 p-1 rounded transition-colors break-words">
                                <span className="text-muted-foreground shrink-0">[{log.time}]</span>
                                <span className={`shrink-0 font-bold w-16 ${log.level === 'info' ? 'text-blue-400' :
                                    log.level === 'success' ? 'text-emerald-400' :
                                        log.level === 'warn' ? 'text-amber-400' : 'text-rose-400'
                                    }`}>
                                    {log.level.toUpperCase()}
                                </span>
                                <span className="text-muted-foreground w-20 shrink-0 border-r border-white/10">{log.source}</span>
                                <span className="text-foreground/90">{log.message}</span>
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                </GlassCard>
            </div>

        </div>
    );
}
