import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GlassCard } from "../ui/GlassCard";
import { Info, Activity, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { MacroHeatmapGrid } from "./analysis/MacroHeatmapGrid";
import { InsightStream } from "../widgets/InsightStream";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "../ui/tooltip/index";

// --- Types ---
interface RegimeResult {
    regime: string;         // goldilocks, reflation, stagflation, recession
    growth_score: number;
    inflation_score: number;
    label: string;
    description: string;
    color: string;
    historical_path: RegimePoint[];
    strategy: InvestmentStrategy;
    history_stripe: RegimeStripeItem[];
}

interface RegimeStripeItem {
    date: string;
    regime: string;
    color: string;
    g_score: number;
    i_score: number;
}


interface RegimePoint {
    date: string;
    growth_score: number;
    inflation_score: number;
}

interface InvestmentStrategy {
    key_theme: string;
    favorable_assets: string[];
    unfavorable_assets: string[];
    sectors_to_watch: string[];
}

interface HeatmapItem {
    slug: string;
    name: string;
    z_score: number;
    percentile: number;
    category: string;
}

export function MarketCycleView() {
    const [regime, setRegime] = useState<RegimeResult | null>(null);
    const [heatmap, setHeatmap] = useState<HeatmapItem[]>([]);
    // const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            // setLoading(true);
            try {
                const regimeRes = await invoke<RegimeResult>("get_market_regime");
                const heatmapRes = await invoke<HeatmapItem[]>("get_macro_heatmap");

                setRegime(regimeRes);
                setHeatmap(heatmapRes);
            } catch (e) {
                console.error("Failed to load market cycle data", e);
            } finally {
                // setLoading(false);
            }
        };
        loadData();
    }, []);

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header */}
            <div>
                <h2 className="text-3xl font-bold flex items-center gap-3">
                    <Activity className="text-primary" />
                    Market Cycle Intelligence
                </h2>
                <p className="text-muted-foreground mt-1">
                    Macro-economic regime detection and anomaly scanning.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* 1. Business Cycle Quadrant (2 Columns Wide) */}
                <div className="lg:col-span-2 space-y-6">
                    <GlassCard className="p-6 h-[500px] relative border-border flex flex-col items-center justify-center overflow-hidden">
                        <h3 className="absolute top-6 left-6 font-bold text-lg flex items-center gap-2">
                            Business Cycle Clock
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger><Info size={14} className="text-muted-foreground" /></TooltipTrigger>
                                    <TooltipContent>
                                        <p>X-Axis: Economic Growth (GDP, PMI)<br />Y-Axis: Inflation (CPI, PCE)</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </h3>

                        {/* Chart Area */}
                        <div className="relative w-[400px] h-[400px] border-2 border-border/50 rounded-full bg-background/50 backdrop-blur-sm">

                            {/* Axis Lines */}
                            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-border/80 z-10"></div>
                            <div className="absolute left-0 right-0 top-1/2 h-px bg-border/80 z-10"></div>

                            {/* Quadrant Labels */}
                            {/* Q2: Stagflation (Left Top) */}
                            <div className="absolute top-10 left-10 text-center z-20">
                                <span className="font-bold text-rose-500">Stagflation</span>
                                <div className="text-[10px] text-muted-foreground">Risk Off</div>
                            </div>

                            {/* Q1: Reflation (Right Top) */}
                            <div className="absolute top-10 right-10 text-center z-20">
                                <span className="font-bold text-amber-500">Reflation</span>
                                <div className="text-[10px] text-muted-foreground">Rotation</div>
                            </div>

                            {/* Q3: Recession (Left Bottom) */}
                            <div className="absolute bottom-10 left-10 text-center z-20">
                                <span className="font-bold text-blue-500">Recession</span>
                                <div className="text-[10px] text-muted-foreground">Deflation</div>
                            </div>

                            {/* Q4: Goldilocks (Right Bottom) */}
                            <div className="absolute bottom-10 right-10 text-center z-20">
                                <span className="font-bold text-emerald-500">Goldilocks</span>
                                <div className="text-[10px] text-muted-foreground">Risk On</div>
                            </div>

                            {/* Zones Backgrounds (Ideally dynamic based on active) */}
                            <div className={`absolute top-0 left-0 w-1/2 h-1/2 rounded-tl-full transition-all duration-500`} style={{ backgroundColor: regime?.regime === 'stagflation' ? '#ef4444' : 'transparent', opacity: regime?.regime === 'stagflation' ? 0.2 : 0 }} />
                            <div className={`absolute top-0 right-0 w-1/2 h-1/2 rounded-tr-full transition-all duration-500`} style={{ backgroundColor: regime?.regime === 'reflation' ? '#f59e0b' : 'transparent', opacity: regime?.regime === 'reflation' ? 0.2 : 0 }} />
                            <div className={`absolute bottom-0 left-0 w-1/2 h-1/2 rounded-bl-full transition-all duration-500`} style={{ backgroundColor: regime?.regime === 'recession' ? '#3b82f6' : 'transparent', opacity: regime?.regime === 'recession' ? 0.2 : 0 }} />
                            <div className={`absolute bottom-0 right-0 w-1/2 h-1/2 rounded-br-full transition-all duration-500`} style={{ backgroundColor: regime?.regime === 'goldilocks' ? '#10b981' : 'transparent', opacity: regime?.regime === 'goldilocks' ? 0.2 : 0 }} />

                            {/* 6-Month Trajectory Path */}
                            {regime && regime.historical_path && regime.historical_path.length > 1 && (
                                <svg
                                    className="absolute inset-0 w-full h-full z-20 pointer-events-none"
                                    viewBox="0 0 100 100"
                                    preserveAspectRatio="none"
                                >
                                    {/* Path Line */}
                                    <polyline
                                        fill="none"
                                        stroke={regime.color}
                                        strokeWidth="0.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        opacity={0.6}
                                        points={regime.historical_path.map((p: { growth_score: number; inflation_score: number; date: string }) => {
                                            const x = Math.min(100, Math.max(0, 50 + (p.growth_score / 6) * 100));
                                            const y = Math.min(100, Math.max(0, 50 - (p.inflation_score / 6) * 100));
                                            return `${x},${y}`;
                                        }).join(' ')}
                                    />

                                    {/* Historical Dots (Oldest to Newest-1) */}
                                    {regime.historical_path.slice(0, -1).map((p: { growth_score: number; inflation_score: number; date: string }, i: number) => {
                                        const x = Math.min(100, Math.max(0, 50 + (p.growth_score / 6) * 100));
                                        const y = Math.min(100, Math.max(0, 50 - (p.inflation_score / 6) * 100));
                                        const opacity = 0.2 + (i / regime.historical_path.length) * 0.6; // Fade in
                                        return (
                                            <circle
                                                key={p.date}
                                                cx={x}
                                                cy={y}
                                                r={0.8 + i * 0.15}
                                                fill={regime.color}
                                                opacity={opacity}
                                            />
                                        );
                                    })}
                                </svg>
                            )}

                            {/* The Dot (Current Status) */}
                            {regime && (
                                <div
                                    className="absolute w-6 h-6 bg-white border-2 border-primary rounded-full shadow-[0_0_20px_currentColor] transition-all duration-1000 z-30 flex items-center justify-center font-bold text-[10px] text-black"
                                    style={{
                                        // Map score -3 to +3 to percentage 0% to 100%
                                        // Center is 50%, 50%
                                        // Score 0 -> 50%
                                        // Score +3 -> 100%
                                        // Score -3 -> 0%
                                        left: `${Math.min(100, Math.max(0, 50 + (regime.growth_score / 6) * 100))}%`,
                                        top: `${Math.min(100, Math.max(0, 50 - (regime.inflation_score / 6) * 100))}%`,
                                        transform: 'translate(-50%, -50%)',
                                        color: regime.color
                                    }}
                                >
                                    <div className="w-2 h-2 rounded-full bg-current animate-ping absolute opacity-70"></div>
                                    <div className="w-3 h-3 rounded-full bg-current relative"></div>
                                </div>
                            )}
                        </div>

                        {/* Labels for Axes */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs font-bold text-muted-foreground/50 tracking-widest uppercase">
                            Economic Growth (GDP)
                        </div>
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 -rotate-90 text-xs font-bold text-muted-foreground/50 tracking-widest uppercase origin-center">
                            Inflation (CPI)
                        </div>
                    </GlassCard>

                    {/* Historical Timeline (Real Data) */}
                    <GlassCard className="p-4 border-border flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-bold text-muted-foreground">Historical Context (Last 3 Years)</div>
                            <div className="text-[10px] text-muted-foreground/60">Monthly Regimes</div>
                        </div>

                        {/* Stripe Bar */}
                        <div className="h-4 w-full flex">
                            {regime?.history_stripe?.map((item: any, i: number) => (
                                <div
                                    key={i}
                                    className="flex-1 h-full hover:brightness-110 transition-all cursor-crosshair relative group border-r border-black/10 last:border-0 first:rounded-l last:rounded-r"
                                    style={{ backgroundColor: item.color }}
                                >
                                    {/* Tooltip on Hover */}
                                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[10px] px-2 py-1.5 rounded border border-border shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 flex flex-col items-center gap-0.5">
                                        <span className="font-bold opacity-70">{item.date}</span>
                                        <span className="capitalize font-black" style={{ color: item.color }}>{item.regime}</span>
                                        <div className="flex gap-2 text-[9px] mt-0.5 opacity-80 font-mono">
                                            <span>G: {item.g_score > 0 ? "+" : ""}{item.g_score.toFixed(1)}</span>
                                            <span>I: {item.i_score > 0 ? "+" : ""}{item.i_score.toFixed(1)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Fallback */}
                            {(!regime?.history_stripe || regime.history_stripe.length === 0) && (
                                <div className="w-full h-full bg-muted/20 animate-pulse rounded"></div>
                            )}
                        </div>

                        <div className="flex justify-between text-[10px] text-muted-foreground font-mono px-0.5 opacity-50">
                            <span>3 Years Ago</span>
                            <span>Now</span>
                        </div>
                    </GlassCard>

                    {/* [NEW] Macro Heatmap Grid (Bento) */}
                    <div className="pt-2">
                        <MacroHeatmapGrid items={heatmap} loading={!regime} />
                    </div>
                </div>

                {/* 2. Side Panel (Unified Intelligence) */}
                <div className="space-y-6">
                    {/* Compact Intelligence Card */}
                    {regime && (
                        <GlassCard className="p-6 border-l-4 relative overflow-hidden flex flex-col gap-5" style={{ borderLeftColor: regime.color }}>

                            {/* 1. Diagnosis Section: Header & Scores */}
                            <div className="space-y-4">
                                {/* Header */}
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Current Regime</span>
                                        <Activity className="opacity-20" size={20} style={{ color: regime.color }} />
                                    </div>
                                    <h2 className="text-3xl font-black tracking-tight" style={{ color: regime.color }}>{regime.label}</h2>
                                    <p className="text-sm font-medium text-muted-foreground leading-snug mt-2">
                                        {regime.description}
                                    </p>
                                </div>

                                {/* Scores - Compact Row */}
                                <div className="flex gap-3">
                                    <div className="flex-1 bg-muted/40 p-3 rounded-lg border border-border/50 flex flex-col items-center justify-center hover:bg-muted/60 transition-colors">
                                        <span className="text-[9px] uppercase font-bold text-muted-foreground mb-0.5">Growth Score</span>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-lg font-black font-mono tracking-tight">{regime.growth_score > 0 ? "+" : ""}{regime.growth_score.toFixed(2)}</span>
                                            <span className="text-xs font-bold text-muted-foreground">σ</span>
                                        </div>
                                    </div>
                                    <div className="flex-1 bg-muted/40 p-3 rounded-lg border border-border/50 flex flex-col items-center justify-center hover:bg-muted/60 transition-colors">
                                        <span className="text-[9px] uppercase font-bold text-muted-foreground mb-0.5">Inflation Score</span>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-lg font-black font-mono tracking-tight">{regime.inflation_score > 0 ? "+" : ""}{regime.inflation_score.toFixed(2)}</span>
                                            <span className="text-xs font-bold text-muted-foreground">σ</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 2. Strategy Section (Integrated Divider) */}
                            <div className="border-t border-border/50 pt-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Strategic Overlay</span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-border/50 bg-background/50 text-foreground/80">
                                        {regime.strategy.key_theme}
                                    </span>
                                </div>

                                {/* Action Grid */}
                                <div className="grid grid-cols-2 gap-4">
                                    {/* Buy Side */}
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-1.5 text-emerald-500">
                                            <TrendingUp size={12} strokeWidth={3} />
                                            <span className="text-[10px] font-black uppercase">Overweight</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {regime.strategy.favorable_assets.map(a => (
                                                <span key={a} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 leading-none whitespace-nowrap">
                                                    {a}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Sell Side */}
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-1.5 text-rose-500">
                                            <TrendingDown size={12} strokeWidth={3} />
                                            <span className="text-[10px] font-black uppercase">Underweight</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {regime.strategy.unfavorable_assets.map(a => (
                                                <span key={a} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 leading-none whitespace-nowrap">
                                                    {a}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Watch List */}
                                <div className="bg-secondary/30 rounded-lg p-2.5 flex items-start gap-2 border border-border/30">
                                    <span className="text-[10px] font-bold uppercase text-muted-foreground whitespace-nowrap mt-0.5">Watch:</span>
                                    <p className="text-[11px] font-medium leading-tight text-foreground/90">
                                        {regime.strategy.sectors_to_watch.join(", ")}
                                    </p>
                                </div>
                            </div>
                        </GlassCard>
                    )}

                    {/* [NEW] AI Analyst Insights */}
                    <GlassCard className="p-4 border-border overflow-hidden h-[400px]">
                        <InsightStream />
                    </GlassCard>

                    {/* [RESTORED] Anomaly Heatmap List (Original) */}
                    <GlassCard className="p-0 border-border overflow-hidden flex flex-col max-h-[400px]">
                        <div className="p-4 border-b border-border bg-muted/20">
                            <h3 className="font-bold flex items-center gap-2">
                                <AlertTriangle size={16} className="text-amber-500" />
                                Anomaly Scanner
                            </h3>
                        </div>
                        <div className="overflow-y-auto flex-1 p-2 space-y-1">
                            {heatmap.map(item => (
                                <div key={item.slug} className="flex items-center justify-between p-2 hover:bg-white/5 rounded transition-colors group">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium flex items-center gap-2">
                                            {item.name}
                                            {Math.abs(item.z_score) > 2.0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-500 font-bold">EXTREME</span>}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">{item.category}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className={`font-mono text-sm font-bold ${item.z_score > 1.5 ? "text-rose-400" :
                                            item.z_score < -1.5 ? "text-blue-400" : "text-emerald-400"
                                            }`}>
                                            {item.z_score > 0 ? "+" : ""}{item.z_score.toFixed(1)}σ
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">
                                            {item.percentile.toFixed(0)}th %
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </GlassCard>
                </div>
            </div>
        </div>
    );
}

