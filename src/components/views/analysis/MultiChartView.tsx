import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, TrendingUp, Activity, DollarSign, Info } from "lucide-react";
import { createChart, ISeriesApi, LineSeries, ColorType } from "lightweight-charts";
import { useTheme } from "../../theme-provider";

// --- Types ---

interface AssetInfo {
    slug: string;
    name: string;
    color: string;
}

interface MultiChartDataPoint {
    date: string;
    values: Record<string, number>;
}

interface MultiChartResult {
    assets: AssetInfo[];
    data_points: MultiChartDataPoint[];
    forward_filled_indicators: string[];
}

// --- Helper Components ---

/**
 * Reusable Chart Component for 'Percent' and 'Normalized' modes
 */
const ComparisonChart = ({
    mode,
    data,
    height = 300,
    title
}: {
    mode: 'percent' | 'normalized',
    data: MultiChartResult,
    height?: number,
    title: string
}) => {
    const { theme } = useTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current || !data) return;

        const isDark = theme === 'dark';
        const chart = createChart(containerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: isDark ? '#a1a1aa' : '#52525b',
                attributionLogo: false,
            },
            grid: {
                vertLines: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                horzLines: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
            },
            rightPriceScale: {
                borderVisible: false,
                scaleMargins: { top: 0.1, bottom: 0.1 },
            },
            timeScale: { borderVisible: false },
            crosshair: {
                horzLine: { labelBackgroundColor: isDark ? '#3b82f6' : '#2563eb' },
                vertLine: { labelBackgroundColor: isDark ? '#3b82f6' : '#2563eb' },
            },
            width: containerRef.current.clientWidth,
            height: height,
        });

        const seriesMap = new Map<string, ISeriesApi<"Line">>();

        // Prepare Data
        data.assets.forEach(asset => {
            const series = chart.addSeries(LineSeries, {
                color: asset.color,
                lineWidth: 2,
                title: '', // Hide label on chart to prevent occlusion
                crosshairMarkerVisible: true,
                priceFormat: mode === 'percent'
                    ? { type: 'percent', precision: 2, minMove: 0.01 }
                    : { type: 'custom', formatter: (p: number) => p.toFixed(2) }
            });
            seriesMap.set(asset.slug, series);

            // Transformation Logic
            let seriesData: { time: string, value: number }[] = [];
            const validPoints = data.data_points.filter(dp => dp.values[asset.slug] !== undefined);

            if (validPoints.length > 0) {
                if (mode === 'percent') {
                    // 1. Percentage Change Logic: (Val - Start) / Start * 100
                    const startVal = validPoints[0].values[asset.slug];
                    seriesData = validPoints.map(dp => ({
                        time: dp.date,
                        value: ((dp.values[asset.slug] - startVal) / startVal) * 100
                    }));
                } else {
                    // 2. Normalized Logic: (Val - Min) / (Max - Min)
                    const vals = validPoints.map(dp => dp.values[asset.slug]);
                    const min = Math.min(...vals);
                    const max = Math.max(...vals);
                    const range = max - min || 1; // avoid zero div

                    seriesData = validPoints.map(dp => ({
                        time: dp.date,
                        value: (dp.values[asset.slug] - min) / range
                    }));
                }
            }

            series.setData(seriesData as any);
        });

        // Tooltip Logic
        chart.subscribeCrosshairMove(param => {
            if (!tooltipRef.current || !containerRef.current) return;

            if (
                param.point === undefined ||
                !param.time ||
                param.point.x < 0 ||
                param.point.x > containerRef.current.clientWidth ||
                param.point.y < 0 ||
                param.point.y > containerRef.current.clientHeight
            ) {
                tooltipRef.current.style.display = 'none';
                return;
            }

            tooltipRef.current.style.display = 'block';
            const dateStr = param.time as string;

            // Find raw data for this date
            const rawDataPoint = data.data_points.find(dp => dp.date === dateStr);
            const rawValues = rawDataPoint?.values || {};

            let tooltipHtml = `<div class="font-bold text-xs mb-2 pb-1 border-b border-border">${dateStr}</div>`;

            data.assets.forEach(asset => {
                const series = seriesMap.get(asset.slug);
                if (series) {
                    const dataPoint = param.seriesData.get(series) as { value: number; time: string } | undefined;
                    if (dataPoint) {
                        const rawVal = rawValues[asset.slug];
                        const displayRaw = rawVal !== undefined
                            ? rawVal.toLocaleString(undefined, { maximumFractionDigits: 2 })
                            : 'N/A';

                        const displayVal = mode === 'percent'
                            ? `${dataPoint.value >= 0 ? '+' : ''}${dataPoint.value.toFixed(2)}%`
                            : dataPoint.value.toFixed(2);

                        tooltipHtml += `
                            <div class="flex items-center justify-between gap-4 text-xs mb-1">
                                <div class="flex items-center gap-1.5 ">
                                    <div class="w-2 h-2 rounded-full" style="background-color: ${asset.color}"></div>
                                    <span class="text-muted-foreground">${asset.name}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="font-mono font-medium">${displayVal}</span>
                                    <span class="text-xs text-muted-foreground opacity-70">(${displayRaw})</span>
                                </div>
                            </div>
                        `;
                    }
                }
            });

            tooltipRef.current.innerHTML = tooltipHtml;

            // Positioning
            const tooltipWidth = 200;
            const tooltipHeight = tooltipRef.current.clientHeight;
            const x = param.point.x;
            const y = param.point.y;

            let left = x + 10;
            let top = y + 10;

            if (left + tooltipWidth > containerRef.current.clientWidth) {
                left = x - tooltipWidth - 10;
            }
            if (top + tooltipHeight > containerRef.current.clientHeight) {
                top = y - tooltipHeight - 10;
            }

            tooltipRef.current.style.left = `${Math.max(0, left)}px`;
            tooltipRef.current.style.top = `${Math.max(0, top)}px`;
        });

        chart.timeScale().fitContent();

        const handleResize = () => {
            if (containerRef.current) {
                chart.applyOptions({ width: containerRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };

    }, [data, mode, theme, height]);

    return (
        <div className="bg-card/50 border rounded-xl p-4 shadow-sm relative group">
            <div className="flex items-center gap-2 mb-4">
                {mode === 'percent' ? <TrendingUp size={18} className="text-primary" /> : <Activity size={18} className="text-primary" />}
                <h3 className="font-semibold text-sm">{title}</h3>
            </div>
            <div ref={containerRef} className="w-full relative" />

            {/* Custom Tooltip Element */}
            <div
                ref={tooltipRef}
                className="absolute z-50 hidden bg-popover/95 backdrop-blur-sm border shadow-xl rounded-lg p-3 pointer-events-none transition-opacity duration-75"
                style={{ position: 'absolute', top: 0, left: 0, minWidth: '180px' }}
            />
        </div>
    );
};

/**
 * Grid of individual Price Charts
 */
const PriceGrid = ({ data }: { data: MultiChartResult }) => {
    const { theme } = useTheme();

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.assets.map(asset => (
                <SinglePriceChart key={asset.slug} asset={asset} data={data} theme={theme} />
            ))}
        </div>
    );
};

const SinglePriceChart = ({ asset, data, theme }: { asset: AssetInfo, data: MultiChartResult, theme: string }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const isDark = theme === 'dark';

        const chart = createChart(containerRef.current, {
            layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: isDark ? '#a1a1aa' : '#52525b', attributionLogo: false },
            grid: { horzLines: { visible: false }, vertLines: { visible: false } },
            rightPriceScale: { borderVisible: false },
            timeScale: { borderVisible: false, visible: true },
            height: 150,
            width: containerRef.current.clientWidth,
        });

        const series = chart.addSeries(LineSeries, {
            color: asset.color,
            lineWidth: 2,
        });

        const seriesData = data.data_points
            .filter(dp => dp.values[asset.slug] !== undefined)
            .map(dp => ({
                time: dp.date,
                value: dp.values[asset.slug]
            }));

        series.setData(seriesData as any);
        chart.timeScale().fitContent();

        return () => chart.remove();
    }, [asset, data, theme]);

    return (
        <div className="bg-card/30 border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ background: asset.color }} />
                <span className="text-xs font-medium">{asset.name}</span>
            </div>
            <div ref={containerRef} className="w-full" />
        </div>
    );
}


// --- Main View ---

interface MultiChartViewProps {
    selectedAssets: string[];
    range: string;
    onColorsChange?: (colors: Record<string, string>) => void;
}

const CHART_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#e11d48', '#84cc16'];

export function MultiChartView({ selectedAssets, range, onColorsChange }: MultiChartViewProps) {
    const [result, setResult] = useState<MultiChartResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const colorAssignments = useRef<Record<string, string>>({});

    // Fetch data
    useEffect(() => {
        if (selectedAssets.length < 1) {
            setResult(null);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                // Call backend
                const res = await invoke<any>("get_multi_chart_data", {
                    slugs: selectedAssets,
                    range: range
                });

                // Backend now return { data: HashMap, names: HashMap }
                const rawData = res.data || {};
                const names = res.names || {};

                const assets: AssetInfo[] = [];
                const rawDataMap: Record<string, Record<string, number>> = {};
                const datesSet = new Set<string>();

                // Stable Color Assignment Logic
                // We use a ref to persist color choices across renders/fetches
                // But since we are inside `fetchData` which is an async closure, we need to be careful.
                // Actually, we can just calculate the assignment based on the current `selectedAssets` and the *previous* assignment state.
                // However, `selectedAssets` is the source of truth for "active" assets.

                // 1. Identify which colors are currently "held" by persisting assets
                const newAssignments: Record<string, string> = {};
                const usedColors = new Set<string>();

                // First pass: Keep existing colors for active assets
                selectedAssets.forEach(slug => {
                    const existingColor = colorAssignments.current[slug];
                    if (existingColor) {
                        newAssignments[slug] = existingColor;
                        usedColors.add(existingColor);
                    }
                });

                // Second pass: Assign new colors to new assets
                selectedAssets.forEach(slug => {
                    if (!newAssignments[slug]) {
                        // Find first unused color
                        let assigned = CHART_PALETTE.find(c => !usedColors.has(c));
                        if (!assigned) {
                            // Recycle colors if we run out
                            const idx = Object.keys(newAssignments).length;
                            assigned = CHART_PALETTE[idx % CHART_PALETTE.length];
                        }
                        newAssignments[slug] = assigned;
                        usedColors.add(assigned);
                    }
                });

                // Update Ref
                colorAssignments.current = newAssignments;

                // Notify parent
                if (onColorsChange) {
                    onColorsChange(newAssignments);
                }

                // 2. Parse Assets using stable colors AND selected order
                selectedAssets.forEach(slug => {
                    const points = rawData[slug];
                    if (points) {
                        assets.push({
                            slug,
                            name: names[slug] || slug,
                            color: newAssignments[slug] || '#888888' // Fallback
                        });
                        points.forEach((p: any) => {
                            const dateStr = p.timestamp.split('T')[0];
                            datesSet.add(dateStr);
                            if (!rawDataMap[dateStr]) rawDataMap[dateStr] = {};
                            rawDataMap[dateStr][slug] = p.value;
                        });
                    }
                });

                const sortedDates = Array.from(datesSet).sort();

                // 3. Perform Forward Fill
                const filledDataPoints: MultiChartDataPoint[] = [];
                const lastKnownValues: Record<string, number | null> = {};
                const forwardFilledSlugs = new Set<string>();

                // Initialize last values
                assets.forEach(a => lastKnownValues[a.slug] = null);

                sortedDates.forEach(date => {
                    const currentValues: Record<string, number> = {};

                    assets.forEach(asset => {
                        const slug = asset.slug;
                        const rawVal = rawDataMap[date]?.[slug];

                        if (rawVal !== undefined && rawVal !== null) {
                            currentValues[slug] = rawVal;
                            lastKnownValues[slug] = rawVal;
                        } else {
                            if (lastKnownValues[slug] !== null) {
                                currentValues[slug] = lastKnownValues[slug]!;
                                forwardFilledSlugs.add(asset.name);
                            }
                        }
                    });

                    filledDataPoints.push({
                        date,
                        values: currentValues
                    });
                });

                setResult({
                    assets,
                    data_points: filledDataPoints,
                    forward_filled_indicators: Array.from(forwardFilledSlugs)
                });

            } catch (e) {
                setError(String(e));
                setResult(null);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [selectedAssets, range]);

    if (selectedAssets.length < 1) {
        return (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
                <p>Select at least 1 indicator to analysis.</p>
            </div>
        );
    }

    if (error) {
        return <div className="text-destructive p-4">Error: {error}</div>;
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-12">

            {/* Header / Legend */}
            {result && (
                <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-2 border-b flex flex-wrap gap-4 items-center">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Active Assets</span>
                    {result.assets.map((asset) => (
                        <div key={asset.slug} className="flex items-center gap-1.5 px-2 py-1 bg-secondary/50 rounded-md text-xs">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: asset.color }} />
                            <span className="font-medium">{asset.name.toUpperCase()}</span>
                        </div>
                    ))}
                    {loading && <RefreshCw className="animate-spin text-primary ml-auto" size={16} />}
                </div>
            )}

            {/* Forward Fill Warning Banner */}
            {result && result.forward_filled_indicators.length > 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <Info size={18} className="text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <span className="font-medium text-amber-500">Forward Fill Applied:</span>{" "}
                        <span className="text-muted-foreground">
                            {result.forward_filled_indicators.join(", ")} — Missing dates are filled with the last known value.
                        </span>
                    </div>
                </div>
            )}

            {/* 1. Relative Performance (%) */}
            {result && (
                <section>
                    <ComparisonChart
                        mode="percent"
                        data={result}
                        height={320}
                        title="Relative Performance (%)"
                    />
                    <p className="text-xs text-muted-foreground mt-2 px-2">
                        Shows percentage return relative to the start of the period. Good for comparing growth.
                    </p>
                </section>
            )}

            {/* 2. Normailzed Trend (0-1) */}
            {result && (
                <section>
                    <ComparisonChart
                        mode="normalized"
                        data={result}
                        height={250}
                        title="Trend Correlation (Normalized)"
                    />
                    <p className="text-xs text-muted-foreground mt-2 px-2">
                        Scales all assets 0 to 1 based on their range. Good for spotting similar movement patterns.
                    </p>
                </section>
            )}

            {/* 3. Price Grid */}
            {result && (
                <section>
                    <div className="flex items-center gap-2 mb-4 px-1">
                        <DollarSign size={18} className="text-primary" />
                        <h3 className="font-semibold text-sm">Price History</h3>
                    </div>
                    <PriceGrid data={result} />
                </section>
            )}

        </div>
    );
}

