import { useState, useEffect, useRef } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface IndicatorOption {
    slug: string;
    name: string;
    source: string;
    category: string;
}

interface MultiSelectComboboxProps {
    value: string[];
    onChange: (value: string[]) => void;
    placeholder?: string;
    maxItems?: number;
    colorMap?: Record<string, string>;
}

export function MultiSelectCombobox({
    value,
    onChange,
    placeholder = "Select indicators...",
    maxItems = 8,
    colorMap
}: MultiSelectComboboxProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [options, setOptions] = useState<IndicatorOption[]>([]);
    const [loading, setLoading] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);

    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
                setQuery("");
            }
        };

        if (open) {
            // Use setTimeout to avoid immediate trigger from the click that opened it
            setTimeout(() => {
                document.addEventListener("mousedown", handleClickOutside);
            }, 0);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [open]);

    // Fetch all indicators on mount
    useEffect(() => {
        const fetchIndicators = async () => {
            setLoading(true);
            try {
                const indicators = await invoke<IndicatorOption[]>("get_indicators_list");
                setOptions(indicators.filter(i => i.source !== "Calculated"));
            } catch (e) {
                console.error("Failed to fetch indicators:", e);
            } finally {
                setLoading(false);
            }
        };
        fetchIndicators();
    }, []);

    // Filter options based on query
    const filteredOptions = query.length > 0
        ? options.filter(o =>
            o.slug.toLowerCase().includes(query.toLowerCase()) ||
            o.name.toLowerCase().includes(query.toLowerCase())
        )
        : options;

    const toggleOption = (slug: string) => {
        if (value.includes(slug)) {
            onChange(value.filter(v => v !== slug));
        } else {
            if (value.length < maxItems) {
                onChange([...value, slug]);
            }
        }
    };

    const removeOption = (slug: string) => {
        onChange(value.filter(v => v !== slug));
    };

    const getOptionName = (slug: string) => {
        return options.find(o => o.slug === slug)?.name || slug;
    };

    return (
        <div ref={containerRef} className="relative w-full">
            {/* Selected Tags */}
            {value.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {value.map((slug, idx) => (
                        <span
                            key={slug}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-primary/10 text-primary border border-primary/20"
                            style={{
                                borderLeftColor: colorMap?.[slug] || getLineColor(idx),
                                borderLeftWidth: '3px'
                            }}
                        >
                            {getOptionName(slug)}
                            <button
                                onClick={() => removeOption(slug)}
                                className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                            >
                                <X size={12} />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {/* Input */}
            <div className="relative">
                <input
                    type="text"
                    placeholder={value.length >= maxItems ? `Max ${maxItems} selected` : placeholder}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    disabled={value.length >= maxItems}
                    className="w-full bg-background border border-border rounded-xl pl-4 pr-10 py-3 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-muted-foreground disabled:opacity-50"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                    {loading ? (
                        <span className="animate-spin">⏳</span>
                    ) : (
                        <ChevronsUpDown size={16} />
                    )}
                </div>
            </div>

            {/* Dropdown */}
            {open && (
                <div className="absolute z-[9999] w-full mt-2 bg-popover/95 backdrop-blur-xl border border-border rounded-xl shadow-xl max-h-[300px] overflow-y-auto">
                    {filteredOptions.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                            {loading ? "Loading..." : "No indicators found."}
                        </div>
                    ) : (
                        <div className="p-1 space-y-0.5">
                            {filteredOptions.slice(0, 50).map((item) => {
                                const isSelected = value.includes(item.slug);
                                const isDisabled = !isSelected && value.length >= maxItems;
                                return (
                                    <button
                                        key={item.slug}
                                        onClick={() => {
                                            if (!isDisabled) {
                                                toggleOption(item.slug);
                                            }
                                        }}
                                        disabled={isDisabled}
                                        className={cn(
                                            "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between group",
                                            isSelected
                                                ? "bg-primary/10 text-primary"
                                                : isDisabled
                                                    ? "opacity-40 cursor-not-allowed"
                                                    : "hover:bg-muted text-foreground"
                                        )}
                                    >
                                        <div className="flex flex-col min-w-0">
                                            <span className="font-bold truncate">{item.name}</span>
                                            <span className="text-xs text-muted-foreground truncate">{item.slug}</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[10px] uppercase tracking-wide bg-background/50 px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground">
                                                {item.source}
                                            </span>
                                            {isSelected && <Check size={14} className="text-primary" />}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Helper: Get line color for chart
function getLineColor(index: number): string {
    const colors = [
        "#3b82f6", "#f97316", "#22c55e", "#ef4444",
        "#a855f7", "#eab308", "#06b6d4", "#ec4899"
    ];
    return colors[index % colors.length];
}

// Simple utility
function cn(...classes: (string | undefined | null | false)[]) {
    return classes.filter(Boolean).join(' ');
}
