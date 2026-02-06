// Simplified AI Insight Widget (Navigation/Status only)
import { useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { GlassCard } from "../ui/GlassCard";
import { ArrowRight, Clock, Bot } from "lucide-react";

interface AIReportSummary {
    id: number;
    generated_at: string;
    provider: string;
    model: string;
    preview: string;
}

export const AIInsightWidget = ({ onNavigate }: { onNavigate?: (view: string) => void }) => {
    const [latestReport, setLatestReport] = useState<AIReportSummary | null>(null);

    useEffect(() => {
        const fetchLatest = async () => {
            try {
                const history = await invoke<AIReportSummary[]>("get_ai_report_history");
                if (history && history.length > 0) {
                    setLatestReport(history[0]);
                }
            } catch (err) {
                console.error("Failed to fetch history summary", err);
            }
        };
        fetchLatest();
    }, []);

    // Helper to format "X hours ago" or just date if old
    const getTimeAgo = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));

        if (diffHrs < 1) return "Just now";
        if (diffHrs < 24) return `${diffHrs} hours ago`;
        return date.toLocaleDateString();
    };

    return (
        <GlassCard
            className="w-full relative overflow-hidden p-0 border-zinc-800 group cursor-pointer hover:border-zinc-700 transition-all"
            onClick={() => onNavigate && onNavigate('ai_report')}
        >
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

            <div className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-xl border border-indigo-500/30">
                        <Bot className="h-5 w-5 text-indigo-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-zinc-300">AI Market Report</h3>
                        <div className="flex items-center gap-2 mt-1">
                            {latestReport ? (
                                <>
                                    <span className="text-xs text-green-400 font-medium flex items-center gap-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                                        Analysis Ready
                                    </span>
                                    <span className="text-xs text-zinc-600">•</span>
                                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {getTimeAgo(latestReport.generated_at)}
                                    </span>
                                </>
                            ) : (
                                <span className="text-xs text-zinc-500">No reports generated yet</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-500 group-hover:text-indigo-400 transition-colors bg-zinc-900/50 px-3 py-1.5 rounded-lg border border-zinc-800 group-hover:border-indigo-500/30">
                    <span>View Report</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                </div>
            </div>
        </GlassCard>
    );
};
