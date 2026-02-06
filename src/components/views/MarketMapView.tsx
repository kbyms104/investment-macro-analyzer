import { useState, useEffect } from 'react';
import { GlassCard } from "../ui/GlassCard";
import { invoke } from "@tauri-apps/api/core";
import { Maximize2, RefreshCw, LayoutGrid, Map, Play, Pause, StepBack, StepForward } from "lucide-react"; // Import new icons
import { MarketTreemap } from "../charts/MarketTreemap"; // Import new component
import { format, subDays, addDays } from "date-fns";

// Data Types
interface MapItem {
    id: string;
    slug: string;
    name: string;
    category: string;
    value: number;
    normalizedScore: number; // 0 (Opportunity/Green) to 100 (Risk/Red)
    change: number;
    description?: string;
}

interface CategoryGroup {
    name: string;
    items: MapItem[];
    avgScore: number;
}

// Remove hardcoded CATEGORIES
// const CATEGORIES = ["Valuation", "Liquidity", "Sentiment", "Crypto", "Macro", "Commodities"];

// Priority Order for Sorting Categories (US Investor Standard Flow)
const PRIORITY_ORDER = [
    "Macro",        // 1. The Big Picture (GDP, Inflation)
    "Rates",        // 2. Cost of Money (Fed, Yields)
    "Valuation",    // 3. Cheap or Expensive?
    "Liquidity",    // 4. Money Flow
    "Sentiment",    // 5. Crowd Psychology
    "Employment",   // 6. Economic Health
    "Housing",      // 7. Real Estate
    "Technicals",   // 8. Market Structure
    "Commodities",  // 9. Raw Materials
    "Crypto",       // 10. Alternative Assets
    "Other"         // 11. Rest
];

// Logic to normalize various indicators into a 0-100 Risk Score
// 100 = High Risk (Red), 0 = Low Risk (Green)
// Logic to normalize various indicators into a 0-100 Risk Score
// 100 = High Risk (Red), 0 = Low Risk (Green)
function calculateRiskScore(item: any): number {
    const val = item.value;
    const slug = item.slug;

    // Custom Logic Per Indicator (Simplified for MVP)
    if (slug === 'buffett_indicator') {
        // 50% to 150% range -> 0 to 100
        return Math.min(100, Math.max(0, (val - 50)));
    }
    if (slug.includes('yield_curve')) {
        // Negative is bad (Red), Positive is good (Green). 
        if (val < 0) return 90; // Inverted = High Risk
        if (val < 0.2) return 70; // Warning
        return 20; // Healthy
    }
    if (slug === 'fear_greed' || slug === 'bitcoin_fear_greed') {
        return val;
    }
    if (slug === 'kimchi_premium') {
        if (val > 10) return 100;
        if (val > 5) return 80;
        if (val < 0) return 10;
        return 50;
    }

    // Dynamic scoring for better visual variation during time-travel
    // Use logarithmic scaling to handle different magnitudes
    // Then map to 0-100 range with some variation
    const absVal = Math.abs(val);

    // Create variation based on value magnitude (log scale)
    // This ensures values in different ranges still produce varied scores
    let magnitudeScore: number;
    if (absVal === 0) {
        magnitudeScore = 50;
    } else if (absVal < 1) {
        magnitudeScore = 30 + (absVal * 20); // 30-50 for small values
    } else if (absVal < 100) {
        magnitudeScore = 40 + (Math.log10(absVal) * 15); // 40-70 for medium
    } else if (absVal < 10000) {
        magnitudeScore = 50 + (Math.log10(absVal) * 10); // 50-90 for larger
    } else {
        magnitudeScore = 60 + Math.min(30, Math.log10(absVal) * 5); // Cap at 90
    }

    // Add slug-based offset for variety (but smaller influence)
    const hash = slug.split('').reduce((a: number, b: string) => a + b.charCodeAt(0), 0);
    const offset = (hash % 20) - 10; // -10 to +10 offset

    // Clamp to 0-100
    return Math.max(0, Math.min(100, Math.round(magnitudeScore + offset)));
}

// Color scale helper returning style classes
function getRiskStyle(score: number) {
    // No Data / Empty
    if (score === -1) return {
        border: "border-muted/30",
        bg: "bg-muted/5",
        text: "text-muted-foreground/30",
        glow: "",
        label: "No Data"
    };

    // High Risk (Red)
    if (score >= 80) return {
        border: "border-rose-500/50",
        bg: "bg-rose-500/10",
        text: "text-rose-500",
        glow: "shadow-[0_0_15px_-3px_rgba(244,63,94,0.3)]",
        label: "High Risk"
    };
    // Warning (Orange)
    if (score >= 60) return {
        border: "border-orange-500/50",
        bg: "bg-orange-500/10",
        text: "text-orange-500",
        glow: "shadow-[0_0_15px_-3px_rgba(249,115,22,0.3)]",
        label: "Warning"
    };
    // Neutral (Blue/Gray - changed from Slate for better visibility)
    if (score >= 40) return {
        border: "border-blue-500/30",
        bg: "bg-blue-500/5",
        text: "text-blue-400",
        glow: "",
        label: "Neutral"
    };
    // Opportunity (Green)
    if (score >= 20) return {
        border: "border-emerald-500/50",
        bg: "bg-emerald-500/10",
        text: "text-emerald-500",
        glow: "shadow-[0_0_15px_-3px_rgba(16,185,129,0.3)]",
        label: "Good"
    };
    // Strong Opportunity (Green+)
    return {
        border: "border-emerald-400/60",
        bg: "bg-emerald-400/10",
        text: "text-emerald-400",
        glow: "shadow-[0_0_15px_-3px_rgba(52,211,153,0.4)]",
        label: "Opportunity"
    };
}

export function MarketMapView() {
    const [loading, setLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid'); // View State
    const [groups, setGroups] = useState<CategoryGroup[]>([]);
    const [allItems, setAllItems] = useState<MapItem[]>([]); // Store flat list for Treemap

    // Time Travel State
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [isPlaying, setIsPlaying] = useState(false);
    const [minDate] = useState(new Date('2020-01-01')); // Hardcoded start valid date for simplicity
    const maxDate = new Date();

    const fetchSnapshot = async (date: Date) => {
        setLoading(true);
        try {
            const dateStr = format(date, 'yyyy-MM-dd');
            // 1. Get Metadata List (Cached or efficient)
            const metadataList = await invoke<any[]>("get_indicators_list");

            // 2. Get Snapshot Data via Rust API
            const snapshotData = await invoke<any[]>("get_snapshot_by_date", { dateStr });

            // 3. Map Snapshot to MapItems
            const validItems = snapshotData.map(item => {
                // Join with metadata to get friendly name
                const meta = metadataList.find(m => m.slug === item.slug);
                if (!meta) return null;

                return {
                    id: item.slug,
                    slug: item.slug,
                    name: meta.name,
                    category: item.category, // Use category from snapshot or metadata
                    value: item.value,
                    change: 0,
                    normalizedScore: calculateRiskScore({ slug: item.slug, value: item.value }),
                    description: meta.description
                } as MapItem;
            }).filter((i): i is MapItem => i !== null);


            // Dynamic Grouping with Priority Sorting
            // Dynamic Grouping with Priority Sorting
            const uniqueCategories = Array.from(new Set(validItems.map(i => i.category || "Uncategorized"))).sort((a, b) => {
                // Determine priority index (case-insensitive check)
                const getPriority = (cat: string) => PRIORITY_ORDER.findIndex(p => p.toLowerCase() === cat.toLowerCase());

                const idxA = getPriority(a);
                const idxB = getPriority(b);

                // If both are in the priority list, sort by index
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                // If only A is in list, it comes first
                if (idxA !== -1) return -1;
                // If only B is in list, it comes first
                if (idxB !== -1) return 1;
                // Otherwise alphabetical
                return a.localeCompare(b);
            });

            const grouped = uniqueCategories.map(cat => {
                const catItems = validItems.filter(i => (i.category || "Uncategorized") === cat);
                if (catItems.length === 0) return null;

                const avg = catItems.reduce((acc, i) => acc + i.normalizedScore, 0) / catItems.length;
                return {
                    name: cat,
                    items: catItems.sort((a, b) => b.normalizedScore - a.normalizedScore),
                    avgScore: avg
                };
            }).filter((g): g is CategoryGroup => g !== null);

            setGroups(grouped);
            setAllItems(validItems);

        } catch (e) {
            console.error("Snapshot load failed", e);
        } finally {
            setLoading(false);
        }
    };


    // Initial Load
    useEffect(() => {
        fetchSnapshot(selectedDate);
    }, []);

    // Auto-fetch ONLY during playback
    useEffect(() => {
        if (isPlaying) {
            fetchSnapshot(selectedDate);
        }
    }, [selectedDate, isPlaying]);

    // Playback Loop
    useEffect(() => {
        let interval: any;
        if (isPlaying) {
            interval = setInterval(() => {
                setSelectedDate(prev => {
                    const next = addDays(prev, 7); // Jump 1 week per tick
                    if (next > maxDate) {
                        setIsPlaying(false);
                        return maxDate;
                    }
                    return next;
                });
            }, 2000); // 2s per frame - comfortable viewing pace
        }
        return () => clearInterval(interval);
    }, [isPlaying]);

    return (
        <div className="h-full flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-500 overflow-hidden">
            {/* Header / Legend */}
            <GlassCard className="flex-shrink-0 flex items-center justify-between p-4" noPadding>
                <div className="px-6 py-4 flex items-center gap-6">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Maximize2 size={20} className="text-primary" />
                        Market Risk Map
                    </h2>
                    <div className="h-4 w-[1px] bg-border"></div>
                    {/* Legend */}
                    <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
                        <span>Opportunity</span>
                        <div className="flex gap-1">
                            <div className="w-6 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                            <div className="w-6 h-2 rounded-full bg-blue-500/30"></div>
                            <div className="w-6 h-2 rounded-full bg-orange-500/80"></div>
                            <div className="w-6 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"></div>
                        </div>
                        <span>High Risk</span>
                    </div>
                </div>
                <div className="px-6 flex items-center gap-4">
                    {/* Time Controls */}
                    <div className="flex items-center gap-2 bg-muted/30 p-1.5 rounded-lg border border-border/50">
                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            className={`p-1.5 rounded-md hover:bg-muted ${isPlaying ? 'text-primary' : 'text-muted-foreground'}`}
                        >
                            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                        </button>
                        <span className="text-xs font-mono font-bold w-24 text-center">
                            {format(selectedDate, 'yyyy-MM-dd')}
                        </span>
                        <input
                            type="range"
                            min={minDate.getTime()}
                            max={maxDate.getTime()}
                            value={selectedDate.getTime()}
                            onChange={(e) => {
                                setIsPlaying(false);
                                setSelectedDate(new Date(Number(e.target.value)));
                            }}
                            onMouseUp={() => fetchSnapshot(selectedDate)}
                            onTouchEnd={() => fetchSnapshot(selectedDate)}
                            className="w-32 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                    </div>

                    {/* View Toggle */}
                    <div className="bg-muted/50 p-1 rounded-lg flex items-center gap-1 border border-border/50">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
                            title="Grid View"
                        >
                            <LayoutGrid size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode('map')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'map' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
                            title="Treemap View"
                        >
                            <Map size={16} />
                        </button>
                    </div>

                    <div className="h-4 w-[1px] bg-border mx-2"></div>

                    <button onClick={() => fetchSnapshot(selectedDate)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                        <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
            </GlassCard>

            {/* Main Content Area */}
            <div className="relative min-h-0 pb-6 pr-2" style={{ height: 'calc(100vh - 180px)' }}>
                {viewMode === 'map' ? (
                    // TREEMAP VIEW
                    <MarketTreemap items={allItems} />
                ) : (
                    // GRID VIEW
                    <div className="h-full overflow-y-auto space-y-8 scrollbar-thin scrollbar-thumb-border/50 pr-2">
                        {groups.map(group => (
                            <div key={group.name} className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-1">{group.name}</h3>
                                    <div className="h-[1px] flex-1 bg-gradient-to-r from-border/50 to-transparent"></div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-3">
                                    {group.items.map(item => {
                                        const style = getRiskStyle(item.normalizedScore);
                                        return (
                                            <div
                                                key={item.id}
                                                className={`
                                                    relative overflow-hidden rounded-xl p-4 cursor-pointer transition-all duration-300
                                                    group border hover:scale-[1.02] hover:z-10 bg-background/40 backdrop-blur-sm
                                                    ${style.border} ${style.glow} hover:bg-background/80
                                                `}
                                            >
                                                <div className="relative z-10 flex flex-col h-[70px] justify-between">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <span className="text-[11px] font-bold text-foreground/80 uppercase tracking-tight leading-snug line-clamp-2 min-h-[2.5em]">
                                                            {item.name}
                                                        </span>
                                                        <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${style.bg.replace('/10', '')}`}></div>
                                                    </div>

                                                    <div className="flex items-end justify-between">
                                                        <div className="text-lg font-bold text-foreground tracking-tight">
                                                            {Number(item.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                        </div>
                                                        <div className={`text-[9px] font-bold uppercase tracking-wider ${style.text}`}>
                                                            {style.label}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
