import { useState, useEffect, useMemo } from "react";
import { GlassCard } from "../ui/GlassCard";
import { Search, Filter, RefreshCw, AlertTriangle } from "lucide-react";
import { IndicatorDetail } from "./IndicatorDetail";
import { invoke } from "@tauri-apps/api/core";
import { formatIndicatorValue } from "../../utils/format";

// DOM Types
export interface IndicatorItem {
    id: string;
    slug: string;
    name: string;
    category: string;
    unit: any;
    value: string;
    change: string;
    changeVal: number; // for sorting
    status: string;
    updated: string;
    description?: string;
    source_url?: string;
    frequency?: string;
    isError?: boolean;
    errorMessage?: string;
}

// Backend Response Type
interface IndicatorMetadata {
    slug: string;
    name: string;
    category: string;
    description?: string;
    unit: any; // UnitType from backend
    source_url?: string;
    frequency?: string;
}

const ALL_CATEGORY = "All";

interface IndicatorsViewProps {
    initialSelection?: string | null;
}

export function IndicatorsView({ initialSelection }: IndicatorsViewProps) {
    const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedIndicator, setSelectedIndicator] = useState<IndicatorItem | null>(null);
    const [indicators, setIndicators] = useState<IndicatorItem[]>([]);
    const [categories, setCategories] = useState<string[]>([ALL_CATEGORY]);
    const [loading, setLoading] = useState(false);

    // Effect to handle deep linking/initial selection
    useEffect(() => {
        if (initialSelection && indicators.length > 0) {
            const match = indicators.find(i => i.slug === initialSelection);
            if (match) {
                setSelectedIndicator(match);
                // Also switch category to 'All' or the item's category to ensure it's visible in list
                // setSelectedCategory(match.category); // Optional: might be better to stay on All
            }
        }
    }, [initialSelection, indicators]);

    const refreshData = async () => {
        setLoading(true);
        try {
            const metadataList = await invoke<IndicatorMetadata[]>("get_indicators_list");
            const visibleIndicators = metadataList.filter(m => m.category !== "Internal"); // Hide internal

            const uniqueCategories = Array.from(new Set(visibleIndicators.map(m => m.category))).sort();
            setCategories([ALL_CATEGORY, ...uniqueCategories]);

            const results = await Promise.allSettled(visibleIndicators.map(async (meta) => {
                let item: IndicatorItem = {
                    id: meta.slug,
                    slug: meta.slug,
                    name: meta.name,
                    category: meta.category,
                    unit: meta.unit,
                    value: "--",
                    change: "--",
                    changeVal: 0,
                    status: "Neutral",
                    updated: "Sync required",
                    description: meta.description,
                    source_url: meta.source_url,
                    frequency: meta.frequency
                };

                // Infer Unit if missing
                if (!item.unit) {
                    if (item.name.toUpperCase().includes("(KRW)") || item.slug.toUpperCase().includes("KRW")) {
                        item.unit = "KrwPrice";
                    } else if (item.category === "Crypto") {
                        item.unit = "UsdPrice";
                    } else if (item.category === "KoreaStocks") {
                        item.unit = "KrwPrice";
                    }
                }

                // Determine Unit (Prefer Metadata, but Override/Infer if needed)
                let effectiveUnit = meta.unit;

                // 1. Force KRW if explicitly named (overrides 'Index' or 'UsdPrice' default)
                if (meta.name.toUpperCase().includes("(KRW)") || meta.name.includes("KRW") || meta.slug.toUpperCase().includes("KRW") || meta.category === "KoreaStocks") {
                    effectiveUnit = "KrwPrice";
                }
                // 2. Infer Crypto default if missing
                else if (!effectiveUnit && meta.category === "Crypto") {
                    effectiveUnit = "UsdPrice";
                }

                // Apply to item initial state
                item.unit = effectiveUnit;

                try {
                    const res = await invoke<any[]>("get_indicator_history", {
                        slug: meta.slug,
                        range: "1Y"
                    });

                    if (res && res.length > 0) {
                        const latest = res[res.length - 1];
                        const prev = res.length > 1 ? res[res.length - 2] : latest;

                        const val = latest.value;
                        const prevVal = prev.value;
                        const changePct = prevVal !== 0 ? ((val - prevVal) / prevVal) * 100 : 0;

                        // Domain Status Logic
                        let status = "Neutral";
                        if (meta.category === "Valuation") {
                            if (meta.slug === "buffett_indicator") status = val > 150 ? "High Risk" : val > 100 ? "Warning" : "Attractive";
                        }
                        if (meta.slug.includes("yield_curve")) {
                            status = val < 0 ? "Recession Risk" : "Normal";
                        }
                        if (meta.slug === "kimchi_premium") {
                            status = val > 5 ? "High Premium" : val < 0 ? "Discount" : "Normal";
                        }

                        const date = new Date(latest.timestamp);

                        item = {
                            ...item,
                            value: formatIndicatorValue(val, meta.category, effectiveUnit), // Use effectiveUnit!
                            change: (changePct >= 0 ? "+" : "") + changePct.toFixed(2) + "%",
                            changeVal: changePct,
                            status: status,
                            updated: date.toLocaleDateString(),
                            source_url: meta.source_url,
                            frequency: meta.frequency,
                            unit: effectiveUnit // Ensure detail view gets correct unit
                        };
                    }
                } catch (e: any) {
                    item = {
                        ...item,
                        value: "Error",
                        status: "Failed",
                        isError: true,
                        errorMessage: e.toString()
                    };
                }
                return item;
            }));

            const newIndicators = results
                .filter(r => r.status === 'fulfilled')
                .map(r => (r as PromiseFulfilledResult<IndicatorItem>).value);

            setIndicators(newIndicators);

        } catch (e) {
            console.error("Failed to load indicators:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refreshData();

        let unlisten: (() => void) | undefined;
        import("@tauri-apps/api/event").then(async (mod) => {
            unlisten = await mod.listen('indicators-updated', () => refreshData());
        });
        return () => { if (unlisten) unlisten(); };
    }, []);

    const filteredData = useMemo(() => {
        return indicators.filter(item =>
            (selectedCategory === ALL_CATEGORY || item.category === selectedCategory) &&
            item.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [indicators, selectedCategory, searchTerm]);

    return (
        <div className="flex gap-4 h-[calc(100vh-140px)] animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* LEFT SIDEBAR: LIST */}
            <GlassCard className="w-96 flex flex-col border-border" noPadding>
                {/* Header: Filter & Search */}
                <div className="p-4 border-b border-white/5 space-y-3 bg-muted/20">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                            <input
                                type="text"
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-background/50 border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all outline-none"
                            />
                        </div>
                        <button onClick={refreshData} disabled={loading} className="p-2 bg-secondary hover:bg-secondary/80 rounded-lg transition-colors">
                            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>
                    {/* Category Tabs (Scrollable) */}
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium transition-all ${selectedCategory === cat
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* List Body */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-border/50">
                    {filteredData.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => setSelectedIndicator(item)}
                            className={`p-3 rounded-xl cursor-pointer transition-all border ${selectedIndicator?.id === item.id
                                ? "bg-primary/10 border-primary/30 shadow-sm"
                                : "bg-transparent border-transparent hover:bg-muted/40 hover:border-white/5"
                                }`}
                        >
                            <div className="flex justifyContent-between items-start mb-1">
                                <span className="font-medium text-sm text-foreground truncate flex-1">{item.name}</span>
                                <span className={`text-xs font-mono ml-2 ${item.changeVal > 0 ? "text-emerald-500" : item.changeVal < 0 ? "text-rose-500" : "text-muted-foreground"
                                    }`}>
                                    {item.change}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground">{item.category}</span>
                                <div className="flex items-center gap-2">
                                    {item.isError && (
                                        <div className="group/err relative">
                                            <AlertTriangle size={12} className="text-rose-500 animate-pulse" />
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-rose-950/90 border border-rose-500/30 rounded text-[10px] whitespace-nowrap opacity-0 group-hover/err:opacity-100 transition-opacity z-50 pointer-events-none">
                                                Connection Failed
                                            </div>
                                        </div>
                                    )}
                                    <span className={`font-semibold ${item.isError ? "text-rose-400" : "text-foreground/80"}`}>
                                        {item.value}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredData.length === 0 && (
                        <div className="p-8 text-center text-muted-foreground text-sm">
                            No indicators found.
                        </div>
                    )}
                </div>
            </GlassCard>

            {/* RIGHT MAIN: DETAIL */}
            <div className="flex-1 min-w-0">
                {/* Using min-w-0 to prevent flex item overflow */}
                {selectedIndicator ? (
                    <IndicatorDetail indicator={selectedIndicator} showBackButton={false} />
                ) : (
                    <GlassCard className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center">
                            <Filter size={32} className="opacity-50" />
                        </div>
                        <p>Select an indicator from the list to view details</p>
                    </GlassCard>
                )}
            </div>
        </div>
    );
}
