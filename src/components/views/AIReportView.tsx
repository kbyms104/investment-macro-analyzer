import { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Bot, RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle, ExternalLink, ChevronDown, Check, Calendar, Clock, History } from "lucide-react";
import { GlassCard } from "../ui/GlassCard";
import ReactMarkdown from 'react-markdown';


interface ReferencedIndicator {
    slug: string;
    name: string;
    value: number;
    z_score: number;
    sparkline: number[];
    tag?: string; // Optional for backward compatibility
}

interface AIReport {
    id?: number; // Optional, added on frontend load
    content: string;
    referenced_indicators: ReferencedIndicator[];
    generated_at: string;
    provider: string;
    model: string;
}

interface AIReportSummary {
    id: number;
    generated_at: string;
    provider: string;
    model: string;
    preview: string;
}

// Mini Sparkline Component
const Sparkline: React.FC<{ data: number[], color?: string }> = ({ data, color = '#10b981' }) => {
    if (!data.length) return null;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const width = 80;
    const height = 24;

    const points = data.map((v, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((v - min) / range) * height;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width={width} height={height} className="inline-block">
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
};

// Indicator Card for Sidebar
const IndicatorCard: React.FC<{ indicator: ReferencedIndicator }> = ({ indicator }) => {
    const isPositive = indicator.z_score > 0.5;
    const isNegative = indicator.z_score < -0.5;
    const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus; // Minus is not imported, but was in original code. Keeping for now.
    const trendColor = isPositive ? 'text-green-400' : isNegative ? 'text-red-400' : 'text-gray-400';

    return (
        <div className="p-3 bg-background/50 rounded-lg border border-border hover:border-primary/30 transition-colors">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-medium text-muted-foreground truncate flex-1">
                    {indicator.name}
                </span>
                <TrendIcon className={`w-4 h-4 ${trendColor} flex-shrink-0`} />
            </div>
            <div className="flex justify-between items-center">
                <span className="text-lg font-bold">
                    {indicator.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span className={`text-xs font-mono ${trendColor}`}>
                    {indicator.z_score >= 0 ? '+' : ''}{indicator.z_score.toFixed(2)}σ
                </span>
            </div>
            <div className="mt-2">
                <Sparkline
                    data={indicator.sparkline}
                    color={isPositive ? '#10b981' : isNegative ? '#ef4444' : '#6b7280'}
                />
            </div>
        </div>
    );
};

export function AIReportView() {
    const [report, setReport] = useState<AIReport | null>(null);
    const [history, setHistory] = useState<AIReportSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Group history by date
    const groupedHistory = useMemo(() => {
        const groups: Record<string, AIReportSummary[]> = {};
        history.forEach(item => {
            const date = item.generated_at.split(' ')[0]; // YYYY-MM-DD
            if (!groups[date]) groups[date] = [];
            groups[date].push(item);
        });
        return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0])); // Sort by date desc
    }, [history]);

    const fetchHistory = async () => {
        try {
            const data = await invoke<AIReportSummary[]>('get_ai_report_history');
            setHistory(data);
        } catch (e) {
            console.error("Failed to fetch history", e);
        }
    };

    const loadReport = async (id: number) => {
        setLoading(true);
        setError(null);
        setIsDropdownOpen(false); // Close dropdown on selection
        try {
            const data = await invoke<AIReport>('get_ai_report', { id });
            setReport({ ...data, id }); // Inject ID for UI highlight
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    const generateReport = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await invoke<AIReport>('generate_ai_report');
            setReport(data);
            fetchHistory(); // Refresh history after generation
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    // Click outside handler for dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const formatTime = (dateStr: string) => {
        // Assuming UTC string from server, simple parse
        const parts = dateStr.split(' ');
        if (parts.length > 1) return parts[1];
        return dateStr;
    };

    return (
        <div className="h-full flex flex-col animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 relative">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30">
                        <Bot className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                                AI Market Report
                            </h2>

                            {/* History Dropdown */}
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-zinc-800/50 hover:bg-zinc-800 rounded-full text-xs font-medium text-zinc-400 hover:text-white transition-colors border border-zinc-700/50"
                                >
                                    {report ? (
                                        <>
                                            <Calendar className="w-3 h-3" />
                                            {report.generated_at}
                                        </>
                                    ) : (
                                        "Select Report"
                                    )}
                                    <ChevronDown className="w-3 h-3 opacity-50" />
                                </button>

                                {isDropdownOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-72 bg-[#121214] border border-zinc-800 rounded-xl shadow-2xl z-50 max-h-96 overflow-y-auto custom-scrollbar p-2 animate-in fade-in zoom-in-95 duration-200">
                                        {groupedHistory.length === 0 ? (
                                            <div className="p-4 text-center text-xs text-muted-foreground">
                                                No history found
                                            </div>
                                        ) : (
                                            groupedHistory.map(([date, items]) => (
                                                <div key={date} className="mb-2 last:mb-0">
                                                    <div className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider sticky top-0 bg-[#121214] z-10">
                                                        {formatDate(date)}
                                                    </div>
                                                    <div className="space-y-1">
                                                        {items.map(item => (
                                                            <button
                                                                key={item.id}
                                                                onClick={() => loadReport(item.id)}
                                                                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between group ${report?.id === item.id ? 'bg-primary/20 text-white' : 'hover:bg-zinc-800 text-zinc-300 hover:text-white'
                                                                    }`}
                                                            >
                                                                <div className="flex flex-col min-w-0 flex-1 pr-2">
                                                                    {/* Title / Preview */}
                                                                    <div className="text-sm font-medium text-zinc-200 truncate mb-1">
                                                                        {item.preview.replace(/^[#*>\s]+/, '') /* Clean markdown chars */}
                                                                    </div>

                                                                    {/* Metadata */}
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500 border border-zinc-700/50 truncate max-w-[80px]">
                                                                            {item.provider} · {item.model}
                                                                        </span>
                                                                        <div className="flex items-center gap-1 text-[10px] text-zinc-600">
                                                                            <Clock className="w-2.5 h-2.5" />
                                                                            {formatTime(item.generated_at)}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                {report?.id === item.id && (
                                                                    <Check className="w-4 h-4 text-primary" />
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={generateReport}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        {loading ? 'Generating...' : 'New Analysis'}
                    </button>
                </div>
            </div>

            {/* Time Travel Banner */}
            {report && report.generated_at && (
                <div className="mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-amber-500/20 rounded-md">
                            <History className="w-4 h-4 text-amber-500" />
                        </div>
                        <div>
                            <span className="text-amber-500 font-bold text-sm">Time Travel Mode Active</span>
                            <span className="text-amber-500/70 text-xs ml-2">
                                Showing market state as of {new Date(report.generated_at).toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Error State */}
            {error && (
                <GlassCard className="p-4 border-red-500/30 bg-red-500/10 mb-4">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold text-red-400">Failed to generate report</p>
                            <p className="text-sm text-muted-foreground mt-1">{error}</p>
                            <p className="text-xs text-muted-foreground mt-2">
                                Check Settings → AI Analyst Configuration to configure your LLM provider.
                            </p>
                        </div>
                    </div>
                </GlassCard>
            )}

            {/* Main Content - Full Width */}
            <div className="flex-1 flex gap-6 overflow-hidden">
                {/* Report Content */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        <GlassCard className="p-6 min-h-full">
                            {loading ? (
                                <div className="space-y-4 animate-pulse">
                                    <div className="h-6 bg-muted rounded w-1/3" />
                                    <div className="h-4 bg-muted rounded w-full" />
                                    <div className="h-4 bg-muted rounded w-5/6" />
                                    <div className="h-4 bg-muted rounded w-4/6" />
                                    <div className="h-6 bg-muted rounded w-1/4 mt-6" />
                                    <div className="h-4 bg-muted rounded w-full" />
                                    <div className="h-4 bg-muted rounded w-3/4" />
                                </div>
                            ) : report ? (
                                <article className="prose prose-invert prose-sm max-w-none">
                                    <ReactMarkdown
                                        components={{
                                            h2: ({ children }: { children?: React.ReactNode }) => (
                                                <h2 className="text-xl font-bold text-foreground border-b border-border pb-2 mt-6 first:mt-0">
                                                    {children}
                                                </h2>
                                            ),
                                            h3: ({ children }: { children?: React.ReactNode }) => (
                                                <h3 className="text-lg font-semibold text-foreground mt-4">
                                                    {children}
                                                </h3>
                                            ),
                                            ul: ({ children }: { children?: React.ReactNode }) => (
                                                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                                                    {children}
                                                </ul>
                                            ),
                                            p: ({ children }: { children?: React.ReactNode }) => (
                                                <p className="text-muted-foreground leading-relaxed">
                                                    {children}
                                                </p>
                                            ),
                                            strong: ({ children }: { children?: React.ReactNode }) => (
                                                <strong className="text-foreground font-semibold">
                                                    {children}
                                                </strong>
                                            ),
                                        }}
                                    >
                                        {report.content}
                                    </ReactMarkdown>
                                </article>
                            ) : (
                                <div className="text-center text-muted-foreground py-20 flex flex-col items-center justify-center h-full">
                                    <Bot className="w-16 h-16 mb-6 opacity-20" />
                                    <h3 className="text-lg font-medium mb-2">Select a report from history</h3>
                                    <p className="max-w-xs text-sm">Or generate a new analysis to get fresh market insights based on current data.</p>
                                    <button
                                        onClick={generateReport}
                                        className="mt-6 px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-colors"
                                    >
                                        Generate New Report
                                    </button>
                                </div>
                            )}
                        </GlassCard>
                    </div>
                </div>

                {/* Sidebar - Referenced Indicators (Only show if report is loaded) */}
                {report && (
                    <div className="w-72 flex-shrink-0 overflow-y-auto pr-2 custom-scrollbar">
                        <GlassCard className="p-4 sticky top-0 max-h-[calc(100vh-120px)] overflow-y-auto custom-scrollbar">
                            <h3 className="text-sm font-bold text-muted-foreground mb-4 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" />
                                Key Indicators
                            </h3>

                            <div className="space-y-4">
                                {/* Group by Tag */}
                                {(() => {
                                    const groups: Record<string, ReferencedIndicator[]> = {};
                                    report.referenced_indicators.forEach(ind => {
                                        const tag = ind.tag || (ind.z_score > 1.5 || ind.z_score < -1.5 ? 'Anomaly' : 'Core');
                                        if (!groups[tag]) groups[tag] = [];
                                        groups[tag].push(ind);
                                    });

                                    // Order: Sentiment -> Anomaly -> Core
                                    const order = ['Sentiment', 'Anomaly', 'Core'];
                                    const sortedKeys = Object.keys(groups).sort((a, b) => {
                                        const indexA = order.indexOf(a);
                                        const indexB = order.indexOf(b);
                                        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                                        if (indexA !== -1) return -1;
                                        if (indexB !== -1) return 1;
                                        return a.localeCompare(b);
                                    });

                                    return sortedKeys.map(tag => (
                                        <details key={tag} className="group" open={tag !== 'Core'}>
                                            <summary className="flex items-center justify-between cursor-pointer list-none mb-2 select-none group-open:mb-3">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-1.5 h-1.5 rounded-full ${tag === 'Anomaly' ? 'bg-red-400' :
                                                            tag === 'Sentiment' ? 'bg-amber-400' : 'bg-blue-400'
                                                        }`} />
                                                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                                        {tag} ({groups[tag].length})
                                                    </span>
                                                </div>
                                                <ChevronDown className="w-3 h-3 text-zinc-600 transition-transform group-open:rotate-180" />
                                            </summary>
                                            <div className="space-y-3 pl-2 border-l border-zinc-800/50">
                                                {groups[tag].map(ind => (
                                                    <IndicatorCard key={ind.slug} indicator={ind} />
                                                ))}
                                            </div>
                                        </details>
                                    ));
                                })()}
                            </div>

                            {/* Link to Settings */}
                            <div className="mt-4 pt-4 border-t border-border">
                                <a
                                    href="#"
                                    onClick={(e) => { e.preventDefault(); /* TODO: navigate to settings */ }}
                                    className="text-xs text-primary hover:underline flex items-center gap-1"
                                >
                                    <ExternalLink className="w-3 h-3" />
                                    Configure AI Provider
                                </a>
                            </div>
                        </GlassCard>
                    </div>
                )}
            </div>
        </div>
    );
}
