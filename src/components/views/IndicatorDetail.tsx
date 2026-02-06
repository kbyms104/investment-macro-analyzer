import { AdvancedAnalyticsChart } from "../charts/AdvancedAnalyticsChart";
import { ArrowLeft, Clock, BarChart2, AlertTriangle, ExternalLink, Calendar } from "lucide-react";
import { GlassCard } from "../ui/GlassCard";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { formatValueByUnit } from "../../utils/format";

interface DataPoint {
    timestamp: string;
    value: number;
}

interface IndicatorDetailProps {
    indicator: any; // Type should be refined if possible (IndicatorItem)
    onBack?: () => void; // Optional now
    showBackButton?: boolean; // Control visibility
}

export function IndicatorDetail({ indicator, onBack, showBackButton = true }: IndicatorDetailProps) {
    const [chartData, setChartData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [range, setRange] = useState("ALL");

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const slug = indicator.slug;
                if (slug) {
                    const res = await invoke<DataPoint[]>("get_indicator_history", {
                        slug: slug,
                        range: range
                    });
                    if (res) {
                        setChartData(res.map(d => ({ timestamp: d.timestamp, value: d.value })));
                    }
                } else {
                    setChartData([]);
                }
            } catch (err) {
                console.error(err);
                setChartData([]);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [indicator, range]);

    return (
        <div className="flex flex-col gap-4 h-full animate-in fade-in duration-300">
            {/* Top: Main Chart Area */}
            <div className="flex-[2] min-h-0 flex flex-col gap-4">
                <GlassCard className="flex-1 flex flex-col min-h-0" noPadding>
                    <div className="p-6 h-full flex flex-col gap-6">
                        {/* Header */}
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                {showBackButton && onBack && (
                                    <button
                                        onClick={onBack}
                                        className="p-2 rounded-xl bg-background border border-border hover:bg-muted transition-colors"
                                    >
                                        <ArrowLeft size={20} className="text-foreground" />
                                    </button>
                                )}
                                <div>
                                    <h2 className="text-2xl font-bold text-foreground">{indicator.name}</h2>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border uppercase tracking-wide">
                                            {indicator.category}
                                        </span>
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Clock size={12} /> Last updated: {indicator.updated}
                                        </span>
                                        {indicator.description && indicator.source_url && (
                                            <a
                                                href={indicator.source_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[10px] text-primary hover:underline flex items-center gap-1"
                                            >
                                                Source <ExternalLink size={10} />
                                            </a>
                                        )}
                                        {indicator.description && indicator.frequency && (
                                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                <Calendar size={10} /> {indicator.frequency}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Range Selectors moved to Header right side */}
                            <div className="flex gap-1 bg-muted/30 p-1 rounded-lg border border-border/50">
                                {['1Y', '5Y', 'ALL'].map(r => (
                                    <button
                                        key={r}
                                        onClick={() => setRange(r)}
                                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${range === r ? 'bg-background text-primary shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Chart Area */}
                        <div className="flex-1 min-h-0 relative -ml-2">
                            {loading ? (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="loading loading-spinner text-primary">Loading Data...</span>
                                </div>
                            ) : (
                                <AdvancedAnalyticsChart
                                    title=""
                                    data={chartData.length > 0 ? chartData : []}
                                    series={[{ name: "Value", dataKey: "value", color: "#3b82f6", type: "area", fillOpacity: 0.1, unit: indicator.unit }]}
                                    showBrush={true}
                                    height={"100%"}
                                    className="flex-1"
                                />
                            )}
                        </div>
                    </div>
                </GlassCard>
            </div>

            {/* Bottom: Stats Grid */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* 1. Value Card */}
                <GlassCard className="p-6 flex flex-col justify-center relative overflow-hidden group">
                    {/* Background Accent */}
                    <div className={`absolute -right-6 -top-6 w-32 h-32 rounded-full blur-3xl opacity-10 transition-colors ${indicator.change.startsWith('+') ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>

                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                        Current Value
                    </h3>
                    <div className={`font-bold text-foreground mb-3 tracking-tight ${indicator.value.length > 15 ? 'text-2xl' : indicator.value.length > 10 ? 'text-4xl' : 'text-5xl'}`} title={String(indicator.value)}>
                        {indicator.value}
                    </div>
                    <div className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold w-fit ${indicator.change.startsWith('+') ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : indicator.change.startsWith('-') ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-muted text-muted-foreground'}`}>
                        {indicator.change}
                        <span className="ml-2 text-[10px] opacity-60 font-normal uppercase">24h Change</span>
                    </div>
                </GlassCard>

                {/* 2. Analysis Card */}
                <GlassCard className="p-6 flex flex-col justify-center border-amber-500/20 bg-amber-500/5 relative overflow-hidden">
                    <div className="absolute -left-6 -bottom-6 w-24 h-24 rounded-full bg-amber-500/10 blur-2xl"></div>
                    <div className="relative z-10">
                        <h3 className="text-sm font-bold text-amber-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <AlertTriangle size={16} />
                            Signal Analysis
                        </h3>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="px-4 py-2 rounded-xl bg-background/50 border border-amber-500/30 backdrop-blur-sm">
                                <span className="block text-[10px] text-muted-foreground uppercase mb-0.5">Sentiment</span>
                                <span className="text-lg font-bold text-foreground">{indicator.status}</span>
                            </div>
                        </div>
                        <p className="text-sm text-foreground/80 leading-relaxed font-medium">
                            {indicator.category === "Valuation" && "Market valuation is stretched. Correction risk holds significant weight."}
                            {indicator.category === "Liquidity" && "Liquidity trend is the primary driver. Watch for Fed policy shifts."}
                            {!["Valuation", "Liquidity"].includes(indicator.category) && "Current trend suggests monitoring for breakout signals."}
                        </p>
                    </div>
                </GlassCard>

                {/* 3. Recent Data List */}
                <GlassCard className="flex flex-col min-h-0 bg-secondary/5" noPadding>
                    <div className="p-4 border-b border-border/50 flex justify-between items-center bg-muted/20">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <BarChart2 size={16} className="text-muted-foreground" />
                            Recent Data
                        </h3>
                        <span className="text-[10px] text-muted-foreground bg-background px-2 py-1 rounded border border-border">10 Days</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-border/50">
                        {(chartData.slice(-15).reverse() || []).map((pt, i) => (
                            <div key={i} className="flex justify-between items-center px-4 py-2.5 hover:bg-white/5 rounded-lg transition-colors group">
                                <span className="text-xs font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                                    {new Date(pt.timestamp).toLocaleDateString()}
                                </span>
                                <span className="text-sm font-bold text-foreground/90 font-mono">
                                    {formatValueByUnit(pt.value, indicator.unit)}
                                </span>
                            </div>
                        ))}
                        {chartData.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-8">
                                <div className="w-8 h-8 rounded-full border-2 border-muted border-t-primary animate-spin"></div>
                                <span className="text-xs"> syncing data... </span>
                            </div>
                        )}
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}
