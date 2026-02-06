import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GitCompare, RefreshCw, TrendingUp, TrendingDown, Minus, Grid3X3, LineChart, Trophy, Link2 } from "lucide-react";
import { GlassCard } from "../ui/GlassCard";
import { SymbolCombobox } from "../ui/SymbolCombobox";
import { MultiSelectCombobox } from "../ui/MultiSelectCombobox";
import { AdvancedAnalyticsChart } from "../charts/AdvancedAnalyticsChart"; // Import new chart component
import { RollingCorrelationChart } from "../charts/RollingCorrelationChart"; // Import new chart


// Sub-views
import { MatrixView } from "./analysis/MatrixView";
import { MultiChartView } from "./analysis/MultiChartView";
import { RankedView } from "./analysis/RankedView";

// === Types ===
interface CorrelationResult {
    correlation_coefficient: number;
    data_points: DataPointPair[];
    data_points_count: number;
    message: string;
    asset_a_name: string;
    asset_b_name: string;
    lag?: number;
    divergence_sigma?: number;
    volatility_ratio?: number;
    recent_trend?: number;
}

interface LaggedResult {
    optimal_lag: number;
    max_correlation: number;
    asset_a_name: string;
    asset_b_name: string;
}

interface DataPointPair {
    date: string;
    val_a: number;
    val_b: number;
    normalized_a: number;
    normalized_b: number;
}

type AnalysisMode = "matrix" | "multi" | "ranked" | "pair";

const MODES: { id: AnalysisMode; label: string; icon: React.ElementType }[] = [
    { id: "matrix", label: "Matrix", icon: Grid3X3 },
    { id: "multi", label: "Multi-Chart", icon: LineChart },
    { id: "ranked", label: "Ranked", icon: Trophy },
    { id: "pair", label: "Pair", icon: Link2 },
];

const RANGES = ["1M", "3M", "1Y", "5Y", "ALL"];

export function CorrelationLabView() {
    // Mode & Range
    const [mode, setMode] = useState<AnalysisMode>("matrix");
    const [range, setRange] = useState("1Y");

    // Multi-select for Matrix/Multi modes
    const [selectedAssets, setSelectedAssets] = useState<string[]>(["spx", "binance_btc_usdt"]);
    // Color synchronization
    const [colorMap, setColorMap] = useState<Record<string, string>>({});
    const handleColorChange = useCallback((colors: Record<string, string>) => {
        setColorMap(prev => {
            // Only update if changed to avoid re-renders
            const isDifferent = Object.entries(colors).some(([k, v]) => prev[k] !== v) ||
                Object.keys(prev).length !== Object.keys(colors).length;
            return isDifferent ? colors : prev;
        });
    }, []);

    // Pair mode state (old behavior)
    const [assetA, setAssetA] = useState("spx");
    const [assetB, setAssetB] = useState("binance_btc_usdt");
    const [pairResult, setPairResult] = useState<CorrelationResult | null>(null);
    const [pairLoading, setPairLoading] = useState(false);
    const [assetMetas, setAssetMetas] = useState<Record<string, any>>({});
    const [lag, setLag] = useState(0);
    const [optimalLoading, setOptimalLoading] = useState(false);

    // Rolling Correlation State
    const [rollingWindow, setRollingWindow] = useState(90);
    const [rollingData, setRollingData] = useState<any[] | null>(null);

    // Fetch meta for pair mode
    useEffect(() => {
        const fetchMetas = async () => {
            try {
                const list = await invoke<any[]>("get_indicators_list");
                const metaA = list.find(i => i.slug === assetA);
                const metaB = list.find(i => i.slug === assetB);
                setAssetMetas({
                    [assetA]: metaA,
                    [assetB]: metaB
                });
            } catch (e) {
                console.error("Failed to fetch asset metas:", e);
            }
        };
        fetchMetas();
    }, [assetA, assetB]);

    // === Pair Mode Functions ===
    const runPairAnalysis = useCallback(async () => {
        if (mode !== "pair") return;
        setPairLoading(true);
        // setRollingData(null); // Managed by separate effect now
        try {
            const res = await invoke<CorrelationResult>("calculate_correlation", {
                assetA: assetA,
                assetB: assetB,
                range,
                lag
            });
            setPairResult(res);
        } catch (e) {
            console.error("Correlation analysis failed:", e);
            setPairResult(null);
        } finally {
            setPairLoading(false);
        }
    }, [assetA, assetB, range, mode, lag]);

    // Independent Rolling Data Fetch
    useEffect(() => {
        const fetchRolling = async () => {
            if (mode !== "pair") return;
            // distinct loading state could be nice, but simple is fine
            try {
                const r = await invoke<any>("get_rolling_correlation", {
                    assetA: assetA,
                    assetB: assetB,
                    windowDays: rollingWindow
                });
                setRollingData(r.rolling_data);
            } catch (e) {
                console.error("Rolling fetch failed:", e);
                setRollingData(null);
            }
        };

        if (mode === "pair") {
            fetchRolling();
        }
    }, [mode, assetA, assetB, rollingWindow]);

    const findOptimal = async () => {
        setOptimalLoading(true);
        try {
            const res = await invoke<LaggedResult>("find_optimal_lag", {
                targetSlug: assetA,
                indicatorSlug: assetB,
                range: range,
                maxLag: 180
            });
            setLag(res.optimal_lag);
        } catch (e) {
            console.error("Failed to find optimal lag:", e);
        } finally {
            setOptimalLoading(false);
        }
    };

    // Trigger pair analysis when in pair mode
    useEffect(() => {
        if (mode === "pair") {
            runPairAnalysis();
        }
    }, [mode, assetA, assetB, range, lag]);


    // === Navigation Handlers ===
    const handleMatrixCellClick = (slugA: string, slugB: string) => {
        setAssetA(slugA);
        setAssetB(slugB);
        setMode("pair");
    };

    const handleRankedRowClick = (refSlug: string, targetSlug: string) => {
        setAssetA(refSlug);
        setAssetB(targetSlug);
        setMode("pair");
    };

    // === Correlation Label Helper ===
    const getCorrelationLabel = (coef: number) => {
        const abs = Math.abs(coef);
        if (abs >= 0.7) return { text: coef > 0 ? "Strong Positive" : "Strong Negative", color: coef > 0 ? "text-emerald-400" : "text-rose-400", Icon: coef > 0 ? TrendingUp : TrendingDown };
        if (abs >= 0.4) return { text: coef > 0 ? "Moderate Positive" : "Moderate Negative", color: coef > 0 ? "text-sky-400" : "text-amber-400", Icon: coef > 0 ? TrendingUp : TrendingDown };
        return { text: "Weak / No Correlation", color: "text-muted-foreground", Icon: Minus };
    };

    const correlationInfo = pairResult ? getCorrelationLabel(pairResult.correlation_coefficient) : null;

    return (
        <div className="h-full flex flex-col gap-6 animate-in fade-in">
            {/* Header Card */}
            <GlassCard className="p-6 border-border overflow-visible relative z-20">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                            <GitCompare className="text-primary" size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold">Correlation Lab</h2>
                            <p className="text-sm text-muted-foreground">Multi-mode correlation analysis</p>
                        </div>
                    </div>
                </div>

                {/* Mode Tabs */}
                <div className="flex gap-2 p-1 bg-muted rounded-xl border border-border mb-6">
                    {MODES.map(m => (
                        <button
                            key={m.id}
                            onClick={() => setMode(m.id)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${mode === m.id
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            <m.icon size={16} />
                            {m.label}
                        </button>
                    ))}
                </div>

                {/* Controls - Vary by Mode */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end overflow-visible">
                    {/* Asset Selection - Depends on Mode */}
                    {(mode === "matrix" || mode === "multi") && (
                        <div className="md:col-span-2 space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Select Indicators ({selectedAssets.length}/8)
                            </label>
                            <MultiSelectCombobox
                                value={selectedAssets}
                                onChange={setSelectedAssets}
                                placeholder="Select indicators to compare..."
                                maxItems={mode === "multi" ? 8 : 20}
                                colorMap={mode === "multi" ? colorMap : undefined}
                            />
                        </div>
                    )}

                    {mode === "pair" && (
                        <>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Asset A (Blue)</label>
                                <SymbolCombobox value={assetA} onChange={setAssetA} source="ALL" placeholder="e.g. spx" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Asset B (Orange)</label>
                                <SymbolCombobox value={assetB} onChange={setAssetB} source="ALL" placeholder="e.g. btc" />
                            </div>
                        </>
                    )}

                    {mode === "ranked" && (
                        <div className="md:col-span-2">
                            {/* RankedView has its own selector */}
                        </div>
                    )}

                    {/* Period Selector (All Modes) */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Period</label>
                        <div className="flex p-1 bg-muted rounded-lg border border-border">
                            {RANGES.map(r => (
                                <button
                                    key={r}
                                    onClick={() => setRange(r)}
                                    className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${range === r
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                        }`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </GlassCard>

            {/* Content Area - Mode Specific */}
            <GlassCard className="flex-1 min-h-[400px] border-border p-6">
                {mode === "matrix" && (
                    <MatrixView
                        selectedAssets={selectedAssets}
                        range={range}
                        onCellClick={handleMatrixCellClick}
                    />
                )}

                {mode === "multi" && (
                    <MultiChartView
                        selectedAssets={selectedAssets}
                        range={range}
                        onColorsChange={handleColorChange}
                    />
                )}

                {mode === "ranked" && (
                    <RankedView
                        range={range}
                        onRowClick={handleRankedRowClick}
                    />
                )}

                {mode === "pair" && (
                    <>
                        {/* Correlation Controls & Stats */}
                        <div className="flex flex-col md:flex-row gap-6 mb-8 items-start">
                            {/* Lag Slider Control */}
                            <div className="flex-1 w-full space-y-3 p-5 rounded-2xl bg-muted/20 border border-border/50">
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-sm font-bold flex items-center gap-2">
                                        <RefreshCw size={14} className={optimalLoading ? "animate-spin" : ""} />
                                        Time Shift (Lag Analysis)
                                    </label>
                                    <span className={`text-sm font-mono font-bold px-2 py-0.5 rounded ${lag !== 0 ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                                        {lag > 0 ? `+${lag}` : lag} days
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="-180"
                                    max="180"
                                    value={lag}
                                    onChange={(e) => setLag(parseInt(e.target.value))}
                                    className="w-full accent-primary"
                                />
                                <div className="flex justify-between text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                                    <span>{assetB} leads (-180d)</span>
                                    <button
                                        onClick={() => setLag(0)}
                                        className="hover:text-primary transition-colors font-bold"
                                    >
                                        Reset to Zero
                                    </button>
                                    <span>{assetA} leads (+180d)</span>
                                </div>

                                <button
                                    onClick={findOptimal}
                                    disabled={optimalLoading || pairLoading}
                                    className="w-full mt-2 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-xs font-bold transition-all flex items-center justify-center gap-2"
                                >
                                    {optimalLoading ? "Searching..." : "✨ Auto-Find Golden Lag"}
                                </button>
                            </div>

                            {/* Stats */}
                            <GlassCard className="flex-[1.5] w-full flex flex-col p-6 bg-muted/20 border border-border/50">
                                {/* Top: Correlation Score + Data Points */}
                                <div className="border-b border-border/30 pb-4 mb-4 flex justify-between items-center shrink-0">
                                    <div>
                                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Correlation Score</span>
                                        <div className={`text-4xl font-black ${correlationInfo?.color || "text-foreground"}`}>
                                            {pairResult ? pairResult.correlation_coefficient.toFixed(3) : "--"}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Data Points</span>
                                        <div className="text-xl font-bold text-foreground">
                                            {pairResult ? pairResult.data_points_count : "--"}
                                        </div>
                                    </div>
                                </div>

                                {/* Bottom: Insight Grid (2x2) */}
                                <div className="flex-1 pt-2">
                                    <div className="grid grid-cols-2 gap-3 h-full">

                                        {/* 1. Trend (Rolling Correlation) */}
                                        <div className="p-3 rounded-xl bg-background/30 border border-border/50 flex flex-col justify-center">
                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Recent Trend (30d)</span>
                                            <div className="flex items-end gap-2">
                                                <span className={`text-xl font-bold ${pairResult?.recent_trend && pairResult.recent_trend > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                    {pairResult?.recent_trend?.toFixed(2) || "--"}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground mb-1">
                                                    {pairResult && pairResult.recent_trend && Math.abs(pairResult.recent_trend - pairResult.correlation_coefficient) > 0.2
                                                        ? (pairResult.recent_trend > pairResult.correlation_coefficient ? "↗ Strengthening" : "↘ Weakening")
                                                        : "→ Stable"}
                                                </span>
                                            </div>
                                        </div>

                                        {/* 2. Volatility Ratio */}
                                        <div className="p-3 rounded-xl bg-background/30 border border-border/50 flex flex-col justify-center">
                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Volatility Ratio</span>
                                            <div className="flex items-end gap-2">
                                                <span className="text-xl font-bold text-foreground">
                                                    {pairResult?.volatility_ratio?.toFixed(1) || "--"}x
                                                </span>
                                                <span className="text-[10px] text-muted-foreground mb-1">
                                                    Risk Parity
                                                </span>
                                            </div>
                                        </div>

                                        {/* 3. Lead/Lag */}
                                        <div className={`p-3 rounded-xl border border-border/50 flex flex-col justify-center ${lag !== 0 ? "bg-purple-500/10 border-purple-500/30" : "bg-background/30"}`}>
                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Lead / Lag</span>
                                            <div className="flex items-end gap-2">
                                                <span className={`text-sm font-bold ${lag !== 0 ? "text-purple-400" : "text-muted-foreground"}`}>
                                                    {lag === 0 ? "Synced" : (lag > 0 ? `${assetA} Leads` : `${assetB} Leads`)}
                                                </span>
                                                {lag !== 0 && (
                                                    <span className="text-[10px] text-purple-400/80 mb-0.5 font-mono bg-purple-500/10 px-1 rounded">
                                                        {Math.abs(lag)}d
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* 4. Divergence (Actionable Signal) */}
                                        <div className={`p-3 rounded-xl border border-border/50 flex flex-col justify-center ${pairResult && Math.abs(pairResult.divergence_sigma || 0) > 2.0 ? "bg-red-500/10 border-red-500/30 animate-pulse" : "bg-background/30"}`}>
                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Divergence</span>
                                            <div className="flex items-end gap-2">
                                                <span className={`text-sm font-bold ${pairResult && Math.abs(pairResult.divergence_sigma || 0) > 2.0 ? "text-red-400" : "text-muted-foreground"}`}>
                                                    {pairResult && Math.abs(pairResult.divergence_sigma || 0) > 2.0 ? "⚠️ High Spread" : "Normal"}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground mb-0.5 font-mono">
                                                    σ={pairResult?.divergence_sigma?.toFixed(1) || "0.0"}
                                                </span>
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            </GlassCard>
                        </div>

                        {/* Analysis Insight Card */}
                        {pairResult && (
                            <GlassCard className="mb-8 p-5 border-border/50 bg-primary/5">
                                <div className="flex items-start gap-4">
                                    <div className="p-2 rounded-lg bg-primary/10 text-primary mt-1 shrink-0">
                                        <div className="h-5 w-5 flex items-center justify-center">
                                            <TrendingUp size={18} />
                                        </div>
                                    </div>
                                    <div className="space-y-3 flex-1">
                                        <div>
                                            <h3 className="text-base font-bold flex items-center gap-2">
                                                Analysis Insight
                                                <span className="text-[10px] font-normal text-muted-foreground px-2 py-0.5 rounded-full border border-border bg-background/50">
                                                    AI Generated
                                                </span>
                                            </h3>
                                            <p className="text-sm text-foreground/80 mt-1 leading-relaxed">
                                                Based on {range} data, <strong>{pairResult.asset_a_name}</strong> and <strong>{pairResult.asset_b_name}</strong> show a
                                                <span className={`font-bold ${pairResult.correlation_coefficient > 0 ? " text-emerald-500" : " text-rose-500"}`}>
                                                    {Math.abs(pairResult.correlation_coefficient) >= 0.7 ? " strong" : Math.abs(pairResult.correlation_coefficient) >= 0.4 ? " moderate" : " weak"}
                                                    {pairResult.correlation_coefficient > 0 ? " positive" : " negative"} correlation
                                                </span>
                                                ({pairResult.correlation_coefficient.toFixed(2)}).

                                                {lag !== 0 && (
                                                    <>
                                                        {" "}Detecting a <strong>{Math.abs(lag)}-day lag</strong> significantly optimizes this relationship, suggesting
                                                        {lag > 0 ? ` ${pairResult.asset_a_name} moves before ${pairResult.asset_b_name}` : ` ${pairResult.asset_b_name} moves before ${pairResult.asset_a_name}`}.
                                                    </>
                                                )}

                                                {pairResult.volatility_ratio && pairResult.volatility_ratio > 1.5 && (
                                                    <>
                                                        {" "}Note that <strong>{pairResult.asset_a_name}</strong> is significantly more volatile ({pairResult.volatility_ratio.toFixed(1)}x) than {pairResult.asset_b_name}.
                                                    </>
                                                )}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                                            <div className="text-xs bg-background/50 p-2 rounded-lg border border-border/30">
                                                <span className="font-semibold text-muted-foreground block mb-0.5">Strength Assessment</span>
                                                {Math.abs(pairResult.correlation_coefficient) >= 0.7
                                                    ? "Predictive relationship. Suitable for pair trading strategies."
                                                    : Math.abs(pairResult.correlation_coefficient) >= 0.4
                                                        ? "Noticeable trend similarity/inversion. Use for general confirmation."
                                                        : "Decoupled price action. Little to no predictive value."}
                                            </div>
                                            <div className="text-xs bg-background/50 p-2 rounded-lg border border-border/30">
                                                <span className="font-semibold text-muted-foreground block mb-0.5">Lag Implication</span>
                                                {lag === 0
                                                    ? "Real-time synchronization. Events impact both assets simultaneously."
                                                    : lag > 0
                                                        ? `${pairResult.asset_a_name} acts as a leading indicator for ${pairResult.asset_b_name}.`
                                                        : `${pairResult.asset_b_name} acts as a leading indicator for ${pairResult.asset_a_name}.`}
                                            </div>
                                            <div className="text-xs bg-background/50 p-2 rounded-lg border border-border/30">
                                                <span className="font-semibold text-muted-foreground block mb-0.5">Divergence Check</span>
                                                {Math.abs(pairResult.divergence_sigma || 0) > 2.0
                                                    ? "⚠️ Extreme divergence detected. Mean reversion highly probable."
                                                    : Math.abs(pairResult.divergence_sigma || 0) > 1.0
                                                        ? "Moderate spread beyond normal noise. Monitor for reversion."
                                                        : "Spread is within normal statistical bounds."}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </GlassCard>
                        )}

                        {/* Pair Chart - Advanced Analytics Chart Upgrade */}
                        {pairResult ? (
                            <div className="space-y-6">
                                <AdvancedAnalyticsChart
                                    title={`${pairResult.asset_a_name} vs ${pairResult.asset_b_name}`}
                                    data={pairResult.data_points.map(p => ({
                                        timestamp: p.date,
                                        val_a: p.val_a,
                                        val_b: p.val_b
                                    }))}
                                    series={[
                                        { name: pairResult.asset_a_name, dataKey: "val_a", color: "#3b82f6", yAxisId: "left", type: "area", fillOpacity: 0.1, unit: assetMetas[assetA]?.unit },
                                        { name: pairResult.asset_b_name, dataKey: "val_b", color: "#f97316", yAxisId: "right", type: "line", strokeWidth: 2, unit: assetMetas[assetB]?.unit }
                                    ]}
                                    showBrush={true}
                                    height={400}
                                />

                                {/* Rolling Correlation Section */}
                                <div className="pt-4 border-t border-border/50">
                                    <div className="flex justify-between items-center mb-4">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-lg font-bold flex items-center gap-2">
                                                Rolling Correlation History

                                            </h3>
                                        </div>
                                        <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-lg border border-border/30">
                                            <span className="text-[10px] uppercase font-bold text-muted-foreground px-2">Window:</span>
                                            {[30, 90, 180].map(w => (
                                                <button
                                                    key={w}
                                                    onClick={() => setRollingWindow(w)}
                                                    className={`text-xs px-3 py-1 rounded-md font-medium transition-all ${rollingWindow === w
                                                        ? "bg-background shadow-sm text-primary border border-border/50"
                                                        : "text-muted-foreground hover:text-foreground"
                                                        }`}
                                                >
                                                    {w} Days
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {rollingData ? (
                                        <RollingCorrelationChart
                                            data={rollingData.map((d: any) => ({ date: d[0], value: d[1] }))}
                                            windowDays={rollingWindow}
                                            height={250}
                                        />
                                    ) : (
                                        <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                                            Loading Rolling Analysis...
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="h-[400px] flex items-center justify-center bg-muted/5 border border-border/20 rounded-xl">
                                {pairLoading ? (
                                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                        <RefreshCw className="animate-spin text-primary" size={32} />
                                        <span>Analyzing Correlation...</span>
                                    </div>
                                ) : (
                                    <span className="text-muted-foreground">Select assets to analyze</span>
                                )}
                            </div>
                        )}
                    </>
                )}
            </GlassCard>
        </div>
    );
}
