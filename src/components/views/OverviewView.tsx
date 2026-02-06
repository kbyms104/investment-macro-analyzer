import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { TrendingUp, Activity, BarChart3, ShieldAlert, ShieldCheck, Zap, Info, X, BookOpen, Calculator } from "lucide-react";
import { GlassCard } from "../ui/GlassCard";
import { AdvancedAnalyticsChart } from "../charts/AdvancedAnalyticsChart";
import { Sparkline } from "../charts/Sparkline";
import { MarketGauge } from "../ui/MarketGauge";
import { TechnicalSignalWidget, TechnicalSignal } from "../widgets/TechnicalSignalWidget";

interface MarketStatus {
    risk_score: number;
    status_key: string; // Translation key: 'risk_on_aggressive', 'caution', 'risk_off'
    status_label: string; // English fallback
    key_driver: string; // Main driver name for translation
    drivers: RiskDriver[];
    summary: string; // English fallback
}

interface RiskDriver {
    name: string;
    value: number;
    signal: string;
    contribution: number;
}

interface DataPoint {
    timestamp: string;
    value: number;
}

interface RiskScorePoint {
    timestamp: number;
    risk_score: number;
    status_key: string;
}

type ChartPeriod = '1M' | '3M' | '6M' | '1Y' | 'ALL';

interface OverviewViewProps {
    onNavigate?: (tab: string, slug?: string) => void;
}

export function OverviewView({ onNavigate }: OverviewViewProps) {
    const { t } = useTranslation();
    const [status, setStatus] = useState<MarketStatus | null>(null);
    const [buffettData, setBuffettData] = useState<any[]>([]);
    const [yieldGapData, setYieldGapData] = useState<any[]>([]);
    const [spxData, setSpxData] = useState<any[]>([]);
    const [vixData, setVixData] = useState<any[]>([]);
    const [showMethodology, setShowMethodology] = useState(false);
    const [riskHistory, setRiskHistory] = useState<RiskScorePoint[]>([]);
    const [selectedPeriod, setSelectedPeriod] = useState<ChartPeriod>('1Y');

    // New State for Technical Signals
    const [techSignals, setTechSignals] = useState<TechnicalSignal[]>([]);

    useEffect(() => {
        const fetchAllData = async () => {
            try {
                // 1. Fetch Market Status (Engine)
                const statusRes = await invoke<MarketStatus>("calculate_market_status");
                setStatus(statusRes);

                // 2. Fetch Chart Data
                const periodToDays = (p: ChartPeriod): number => {
                    switch (p) {
                        case '1M': return 30;
                        case '3M': return 90;
                        case '6M': return 180;
                        case '1Y': return 365;
                        case 'ALL': return 3650; // 10 years
                    }
                };

                const [buffettRes, yieldRes, spxRes, vixRes, riskHistoryRes] = await Promise.all([
                    invoke<DataPoint[]>("get_indicator_history", { slug: "buffett_indicator", range: "5Y" }),
                    invoke<DataPoint[]>("get_indicator_history", { slug: "yield_curve_10y_2y", range: "1Y" }),
                    invoke<DataPoint[]>("get_indicator_history", { slug: "spx", range: "5Y" }),
                    invoke<DataPoint[]>("get_indicator_history", { slug: "vix", range: "1Y" }),
                    invoke<RiskScorePoint[]>("get_risk_score_history", { days: periodToDays(selectedPeriod) })
                ]);

                if (buffettRes) setBuffettData(buffettRes);
                if (yieldRes) setYieldGapData(yieldRes);
                if (spxRes) setSpxData(spxRes);
                if (vixRes) setVixData(vixRes);
                if (riskHistoryRes) setRiskHistory(riskHistoryRes);

                // 3. Fetch Technical Signals for Key Assets
                const keyAssets = [
                    { slug: "spx", name: "S&P 500" },
                    { slug: "binance_btc_usdt", name: "Bitcoin (Binance)" },
                    { slug: "gold", name: "Gold" },
                    { slug: "us_10y", name: "US 10Y Yield" }
                ];

                const signals = await Promise.all(
                    keyAssets.map(async (asset) => {
                        try {
                            // Note: In real app, we should probably have a 'get_multiple_technical_signals' to reduce calls
                            const sig = await invoke<TechnicalSignal>("get_technical_signals", { slug: asset.slug });
                            // sig comes with slug, we might want to attach name or rely on slug
                            return sig;
                        } catch (e) {
                            console.error(`Failed to fetch signal for ${asset.slug}`, e);
                            return null;
                        }
                    })
                );

                setTechSignals(signals.filter(s => s !== null) as TechnicalSignal[]);

            } catch (error) {
                console.error("Failed to load overview data:", error);
            }
        };

        fetchAllData();
    }, [selectedPeriod]);

    const lastBuffett = buffettData[buffettData.length - 1]?.value.toFixed(1) || "--";
    const lastYieldCurve = yieldGapData[yieldGapData.length - 1]?.value.toFixed(2) || "--";

    // Helper: Translate status_key to localized string, fallback to English
    const getTranslatedStatus = () => {
        if (!status) return t('overview.calculating');
        return t(`status.${status.status_key}`, status.status_label);
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700">

            {/* Hero Section: Market Sentiment Engine */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <GlassCard className="lg:col-span-2 p-8 border-border overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

                    <div className="flex flex-col md:flex-row items-center gap-10 relative z-10">
                        {/* Left: Gauge */}
                        <div className="flex-shrink-0">
                            <MarketGauge
                                score={status?.risk_score || 0}
                            />
                        </div>

                        {/* Right: Status & Quick Stats */}
                        <div className="flex-1 space-y-4 text-center md:text-left">
                            <div>
                                <h3 className={`text-4xl font-black tracking-tight mb-3 ${(status?.risk_score || 0) >= 60 ? "text-rose-500" : (status?.risk_score || 0) >= 30 ? "text-amber-500" : "text-emerald-500"
                                    }`}>
                                    {getTranslatedStatus()}
                                </h3>

                                {/* Quick Stats Bar */}
                                <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-4">
                                    {status?.drivers.slice(0, 6).map((driver, idx) => {
                                        const isNegative = driver.contribution > 0;
                                        return (
                                            <div
                                                key={idx}
                                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${isNegative
                                                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                                    }`}
                                            >
                                                <span className="opacity-70">{driver.name.split(' ')[0]}</span>
                                                <span className="font-bold">
                                                    {typeof driver.value === 'number'
                                                        ? driver.value.toFixed(driver.value < 10 ? 2 : 1)
                                                        : driver.value
                                                    }
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex flex-wrap justify-center md:justify-start gap-3">
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/50 border border-border text-[10px] font-bold uppercase tracking-wider">
                                    <ShieldCheck size={14} className="text-emerald-500" />
                                    {t('overview.model_version')}
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/50 border border-border text-[10px] font-bold uppercase tracking-wider">
                                    <Zap size={14} className="text-primary" />
                                    {t('overview.live_data')}
                                </div>
                            </div>
                        </div>
                    </div>
                </GlassCard>

                {/* Top Drivers Card */}
                <GlassCard className="p-6 border-border flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                            <Activity size={14} /> {t('overview.risk_drivers')}
                        </h4>
                        <button
                            onClick={() => setShowMethodology(true)}
                            className="text-[10px] text-primary hover:underline flex items-center gap-1 font-medium"
                        >
                            <Info size={12} /> {t('overview.how_it_works')}
                        </button>
                    </div>

                    <div className="flex-1 space-y-3">
                        {status?.drivers.slice(0, 3).map((driver, i) => (
                            <div key={i} className="p-3 rounded-xl bg-muted/30 border border-border/50 flex justify-between items-center group hover:bg-muted/50 transition-colors cursor-help relative" title={getDriverTooltip(driver.name)}>
                                <div>
                                    <div className="text-sm font-bold flex items-center gap-2">
                                        {driver.name}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">{driver.signal}</div>
                                </div>
                                <div className={`text-sm font-mono font-bold ${driver.contribution > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                                    {driver.contribution > 0 ? `+${driver.contribution}` : "0"}pts
                                </div>
                            </div>
                        ))}
                        {(!status || status.drivers.length === 0) && (
                            <div className="h-full flex items-center justify-center text-muted-foreground text-xs italic">
                                {t('overview.no_signals')}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => onNavigate?.("indicators")}
                        className="mt-4 w-full py-2 text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/5 rounded-lg transition-colors border border-primary/10"
                    >
                        {t('overview.view_full_analysis')}
                    </button>
                </GlassCard>
            </div>



            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title={t('stats.buffett_indicator')}
                    value={`${lastBuffett}%`}
                    change={t('stats.valuation')}
                    icon={<BarChart3 size={16} />}
                    status={Number(lastBuffett) > 150 ? "danger" : Number(lastBuffett) > 100 ? "warning" : "success"}
                    delay={0}
                    onClick={() => onNavigate?.("indicators", "buffett_indicator")}
                    sparklineData={buffettData.map(d => d.value)}
                />
                <StatCard
                    title={t('stats.yield_curve')}
                    value={`${lastYieldCurve}%`}
                    change={t('stats.spread')}
                    icon={<Activity size={16} />}
                    status={Number(lastYieldCurve) < 0 ? "danger" : Number(lastYieldCurve) < 0.2 ? "warning" : "success"}
                    delay={100}
                    onClick={() => onNavigate?.("indicators", "yield_curve_10y_2y")}
                    sparklineData={yieldGapData.map(d => d.value)}
                />
                <StatCard
                    title={t('stats.vix')}
                    value={status?.drivers.find(d => d.name.includes("VIX"))?.value.toFixed(1) || "--"}
                    change={t('stats.volatility')}
                    icon={<ShieldAlert size={16} />}
                    status={(status?.drivers.find(d => d.name.includes("VIX"))?.value || 0) > 30 ? "danger" : "neutral"}
                    delay={200}
                    onClick={() => onNavigate?.("indicators", "vix")}
                    sparklineData={vixData.map(d => d.value)}
                />
                <StatCard
                    title={t('stats.spx_momentum')}
                    value={status?.drivers.find(d => d.name.includes("Momentum"))?.signal || "Normal"}
                    change={t('stats.trend')}
                    icon={<TrendingUp size={16} />}
                    status={status?.drivers.find(d => d.name.includes("Momentum")) ? "danger" : "success"}
                    delay={300}
                    onClick={() => onNavigate?.("indicators", "spx")}
                    sparklineData={spxData.map(d => d.value)}
                />
            </div>

            {/* Technical Signals Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {techSignals.length > 0 ? (
                    techSignals.map((signal) => (
                        <TechnicalSignalWidget
                            key={signal.slug}
                            data={signal}
                            assetName={signal.slug.toUpperCase().replace("_", " ")}
                        />
                    ))
                ) : (
                    // Skeletons
                    Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-32 rounded-xl bg-zinc-900/50 animate-pulse border border-zinc-800" />
                    ))
                )}
            </div>

            {/* Main Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[400px]">
                <GlassCard className="p-4">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-semibold text-muted-foreground">{t('overview.historical_risk')}</h3>
                        <div className="flex gap-1 items-center">
                            {(['1M', '3M', '6M', '1Y', 'ALL'] as ChartPeriod[]).map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setSelectedPeriod(p)}
                                    className={`px-2 py-0.5 text-xs rounded transition-colors ${selectedPeriod === p
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-zinc-800 text-muted-foreground hover:bg-zinc-700'
                                        }`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>

                    <AdvancedAnalyticsChart
                        title=""
                        data={riskHistory.length > 0
                            ? riskHistory.map((d) => ({
                                timestamp: new Date(d.timestamp * 1000).toISOString(),
                                score: d.risk_score
                            }))
                            : buffettData.map((d) => ({
                                timestamp: d.timestamp,
                                score: status?.risk_score || 0
                            }))
                        }
                        series={[
                            { name: "Risk Score", dataKey: "score", color: "#6366f1", type: "area", fillOpacity: 0.1 }
                        ]}
                        height={280}
                    />
                </GlassCard >

                <GlassCard className="p-4">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-semibold text-muted-foreground">Buffett Indicator (Valuation Model)</h3>
                    </div>
                    <AdvancedAnalyticsChart
                        title=""
                        data={(() => {
                            // Use SPX dates for x-axis continuity, forward-fill Buffett values
                            const buffettSorted = [...buffettData].sort((a, b) =>
                                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                            );

                            let lastBuffett: number | null = null;
                            return spxData.map((s) => {
                                const spxTime = new Date(s.timestamp).getTime();
                                // Find the most recent Buffett value on or before this date
                                for (const b of buffettSorted) {
                                    if (new Date(b.timestamp).getTime() <= spxTime) {
                                        lastBuffett = b.value;
                                    }
                                }
                                return {
                                    timestamp: s.timestamp,
                                    buffett: lastBuffett
                                };
                            });
                        })()}
                        series={[
                            { name: "Buffett Indicator", dataKey: "buffett", color: "#f43f5e", yAxisId: "left", type: "line", strokeWidth: 2 }
                        ]}
                        referenceLines={[
                            { y: 180, label: "Bubble (>180%)", color: "#ef4444" },
                            { y: 140, label: "Overvalued (>140%)", color: "#f59e0b" },
                            { y: 100, label: "Fair Value (100%)", color: "#10b981" },
                            { y: 75, label: "Undervalued (<75%)", color: "#3b82f6" }
                        ]}
                        height={280}
                    />
                </GlassCard>
            </div >

            {/* Methodology Drawer (Overlay) */}
            {
                showMethodology && (
                    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowMethodology(false)}>
                        <div className="w-full max-w-md h-full bg-background border-l border-border shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-300" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center mb-8">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <BookOpen className="text-primary" size={24} />
                                    Risk Model V4.1
                                </h2>
                                <button onClick={() => setShowMethodology(false)} className="p-2 hover:bg-muted rounded-full transition-colors">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="space-y-8">
                                <section>
                                    <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Calculation Logic</h3>
                                    <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-4">
                                        <div className="flex items-start gap-3">
                                            <Calculator className="text-primary mt-1" size={18} />
                                            <div className="text-sm leading-relaxed">
                                                The <strong className="text-foreground">Risk Score (0-100)</strong> is a weighted sum of 4 key macroeconomic indicators. Higher scores indicate higher probability of recession or correction.
                                            </div>
                                        </div>
                                        <div className="h-px bg-border/50" />
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div className="font-mono text-muted-foreground">Range</div>
                                            <div className="font-bold text-right">0 (Safe) → 100 (Crash Risk)</div>
                                            <div className="font-mono text-muted-foreground">Update Freq</div>
                                            <div className="font-bold text-right">Real-time (Every 10s)</div>
                                        </div>
                                    </div>
                                </section>

                                <section>
                                    <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Weight Distribution</h3>
                                    <div className="space-y-3">
                                        <ModelFactor
                                            name="Yield Curve (10Y-2Y)"
                                            weight="40%"
                                            trigger="< -0.5%"
                                            desc="Best historical predictor of recessions. Inversion indicates short-term risk > long-term growth."
                                        />
                                        <ModelFactor
                                            name="VIX (Volatility)"
                                            weight="30%"
                                            trigger="> 30.0"
                                            desc="The 'Fear Gauge'. Extreme levels indicate panic selling and market instability."
                                        />
                                        <ModelFactor
                                            name="S&P 500 Momentum"
                                            weight="30%"
                                            trigger="< 200 SMA"
                                            desc="Technical breakdown signal. Prices falling below long-term trend indicates bear market."
                                        />
                                        <ModelFactor
                                            name="Buffett Indicator"
                                            weight="20%"
                                            trigger="> 180%"
                                            desc="Valuation metric (Market Cap / GDP). Official data is quarterly; daily values are estimated using S&P 500 correlation."
                                        />
                                    </div>
                                </section>

                                <section>
                                    <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Signal Interpretation</h3>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                            <div className="text-sm"><strong className="text-emerald-500">0 - 30 (Risk On):</strong> Growth focus. Economic expansions.</div>
                                        </div>
                                        <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                                            <div className="w-2 h-2 rounded-full bg-amber-500" />
                                            <div className="text-sm"><strong className="text-amber-500">30 - 60 (Caution):</strong> Neutral. Hedging recommended.</div>
                                        </div>
                                        <div className="flex items-center gap-3 p-3 rounded-lg border border-rose-500/20 bg-rose-500/5">
                                            <div className="w-2 h-2 rounded-full bg-rose-500" />
                                            <div className="text-sm"><strong className="text-rose-500">60 - 100 (Risk Off):</strong> Defensive. High cash/bond allocation.</div>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

function getDriverTooltip(name: string): string {
    if (name.includes("Yield")) return "Inverted yield curve predicts recession within 6-18 months.";
    if (name.includes("VIX")) return "Volatility Index measures market expectation of near-term fluctuation.";
    if (name.includes("Buffett")) return "Ratio of Total Market Cap to GDP. Measures valuation.";
    if (name.includes("Momentum")) return "Price position relative to 200-day Simple Moving Average.";
    return "";
}

function ModelFactor({ name, weight, trigger, desc }: { name: string, weight: string, trigger: string, desc: string }) {
    return (
        <div className="p-3 rounded-xl bg-background border border-border hover:border-primary/30 transition-colors">
            <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-sm">{name}</span>
                <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded">{weight} Weight</span>
            </div>
            <div className="text-xs text-rose-500 font-mono mb-2">Trigger: {trigger}</div>
            <div className="text-xs text-muted-foreground leading-snug">
                {desc}
            </div>
        </div>
    );
}

// Helper Components
function StatCard({
    title,
    value,
    change,
    status,
    icon,
    delay,
    onClick,
    sparklineData
}: {
    title: string,
    value: string,
    change: string,
    status: 'danger' | 'warning' | 'success' | 'neutral',
    icon: any,
    delay: number,
    onClick?: () => void,
    sparklineData?: number[]
}) {
    const statusColors = {
        danger: "text-rose-600 dark:text-rose-400 border-rose-500/30 bg-rose-500/10",
        warning: "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10",
        success: "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
        neutral: "text-slate-600 dark:text-gray-400 border-gray-500/30 bg-gray-500/10"
    };

    const valueColor = status === 'danger' ? 'text-rose-600 dark:text-rose-500' : 'text-foreground';
    const sparklineColor = status === 'danger' ? '#e11d48' : status === 'warning' ? '#d97706' : '#10b981';

    return (
        <div onClick={onClick} className={onClick ? "cursor-pointer group" : ""}>
            <GlassCard hoverEffect className={`flex flex-col gap-8 h-full group-hover:border-primary/50 transition-colors relative overflow-hidden`} style={{ animationDelay: `${delay}ms` }}>
                <div className="flex justify-between items-start relative z-10">
                    <span className="p-2 rounded-lg bg-black/5 dark:bg-white/5 text-muted-foreground group-hover:text-primary transition-colors">
                        {icon}
                    </span>
                    <span className={`text-[10px] px-2 py-1 rounded-full border font-bold uppercase tracking-wider ${statusColors[status]}`}>
                        {change}
                    </span>
                </div>
                <div className="relative z-10 w-full">
                    <h3 className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.1em] mb-1">{title}</h3>
                    <div className="flex items-end justify-between gap-2">
                        <span className={`text-2xl font-black tracking-tight ${valueColor}`}>
                            {value}
                        </span>
                        {sparklineData && sparklineData.length > 0 && (
                            <div className="flex-1 w-full h-12 opacity-50 group-hover:opacity-100 transition-opacity mb-1">
                                <Sparkline data={sparklineData} color={sparklineColor} width={100} height={48} strokeWidth={2} />
                            </div>
                        )}
                    </div>
                </div>
            </GlassCard>
        </div>
    );
}
