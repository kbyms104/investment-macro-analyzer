import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, TrendingUp, TrendingDown, Search } from "lucide-react";
import { SymbolCombobox } from "../../ui/SymbolCombobox";

interface CorrelationRank {
    slug: string;
    name: string;
    coefficient: number;
    direction: string;
}

interface RankedResult {
    reference_name: string;
    reference_slug: string;
    correlations: CorrelationRank[];
    data_points: number;
}

interface RankedViewProps {
    range: string;
    onRowClick?: (referenceSlug: string, targetSlug: string) => void;
}

type SortMode = 'strength_desc' | 'val_desc' | 'val_asc' | 'name_asc';
type FilterDirection = 'all' | 'positive' | 'negative';

export function RankedView({ range, onRowClick }: RankedViewProps) {
    const [reference, setReference] = useState("spx");
    const [result, setResult] = useState<RankedResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filters & Sort
    const [searchTerm, setSearchTerm] = useState("");
    const [sortMode, setSortMode] = useState<SortMode>("strength_desc");
    const [filterDirection, setFilterDirection] = useState<FilterDirection>("all");

    // Logic for sorting and filtering
    const processedList = result?.correlations.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.slug.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDirection = filterDirection === 'all'
            ? true
            : filterDirection === 'positive'
                ? item.coefficient > 0
                : item.coefficient < 0;
        return matchesSearch && matchesDirection;
    }).sort((a, b) => {
        switch (sortMode) {
            case 'strength_desc': return Math.abs(b.coefficient) - Math.abs(a.coefficient);
            case 'val_desc': return b.coefficient - a.coefficient;
            case 'val_asc': return a.coefficient - b.coefficient;
            case 'name_asc': return a.name.localeCompare(b.name);
            default: return 0;
        }
    }) || [];

    useEffect(() => {
        if (!reference) return;

        const fetchRanked = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await invoke<RankedResult>("calculate_ranked_correlations", {
                    targetSlug: reference,
                    range: range
                });
                setResult(res);
            } catch (e) {
                setError(String(e));
                setResult(null);
            } finally {
                setLoading(false);
            }
        };

        fetchRanked();
    }, [reference, range]);

    return (
        <div className="space-y-6">
            {/* Reference Selector */}
            <div className="max-w-sm">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                    Reference Indicator
                </label>
                <SymbolCombobox
                    value={reference}
                    onChange={setReference}
                    source="ALL"
                    placeholder="Select reference..."
                />
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <RefreshCw className="animate-spin text-primary" size={32} />
                </div>
            ) : error ? (
                <div className="flex items-center justify-center h-64 text-destructive">
                    <p>Error: {error}</p>
                </div>
            ) : result ? (
                <div className="space-y-4">
                    <div className="flex flex-col gap-4">
                        {/* Header Stats */}
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold">
                                Correlations with <span className="text-primary">{result.reference_name}</span>
                            </h3>
                            <span className="text-sm text-muted-foreground">
                                {result.correlations.length} indicators analyzed
                            </span>
                        </div>

                        {/* Controls Toolbar */}
                        <div className="flex flex-col md:flex-row gap-3 p-3 bg-muted/40 rounded-xl border border-border/50">
                            {/* Search */}
                            <div className="flex-1 relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                                <input
                                    type="text"
                                    placeholder="Filter by name..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>

                            {/* Direction Filter */}
                            <div className="flex p-1 bg-background rounded-lg border border-border">
                                {(['all', 'positive', 'negative'] as const).map(d => (
                                    <button
                                        key={d}
                                        onClick={() => setFilterDirection(d)}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-all ${filterDirection === d ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                    >
                                        {d}
                                    </button>
                                ))}
                            </div>

                            {/* Sort */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-muted-foreground uppercase">Sort:</span>
                                <select
                                    value={sortMode}
                                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                                    className="h-9 px-3 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                                >
                                    <option value="strength_desc">Strongest (Abs)</option>
                                    <option value="val_desc">Most Positive</option>
                                    <option value="val_asc">Most Negative</option>
                                    <option value="name_asc">Name (A-Z)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Ranked List */}
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {processedList.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                No indicators match your filters.
                            </div>
                        ) : (
                            processedList.map((item, idx) => (
                                <div
                                    key={item.slug}
                                    onClick={() => onRowClick?.(result.reference_slug, item.slug)}
                                    className="flex items-center gap-4 p-3 rounded-xl bg-card border border-border/40 hover:bg-muted/50 hover:border-primary/30 cursor-pointer transition-all group shadow-sm"
                                >
                                    {/* Rank */}
                                    <div className="w-8 text-center shrink-0">
                                        <span className="text-sm text-muted-foreground font-mono font-medium">#{idx + 1}</span>
                                    </div>

                                    {/* Name */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium truncate group-hover:text-primary transition-colors">
                                                {item.name}
                                            </span>
                                            {Math.abs(item.coefficient) >= 0.7 && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold border border-primary/20">
                                                    STRONG
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate">
                                            {item.slug}
                                        </div>
                                    </div>

                                    {/* Coefficient */}
                                    <div className={`flex items-center gap-2 font-bold shrink-0 ${item.coefficient >= 0 ? 'text-emerald-500' : 'text-rose-500'
                                        }`}>
                                        {item.coefficient >= 0 ? (
                                            <TrendingUp size={16} />
                                        ) : (
                                            <TrendingDown size={16} />
                                        )}
                                        <span className="w-16 text-right font-mono text-sm">
                                            {item.coefficient >= 0 ? '+' : ''}{item.coefficient.toFixed(3)}
                                        </span>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
                                        <div
                                            className={`h-full rounded-full transition-all ${item.coefficient >= 0 ? 'bg-emerald-500' : 'bg-rose-500'
                                                }`}
                                            style={{ width: `${Math.abs(item.coefficient) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
