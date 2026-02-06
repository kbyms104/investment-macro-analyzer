import { useState, useEffect, useRef } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface SearchResult {
    symbol: string;
    shortname: string;
    exch_disp: string;
    type_disp: string;
}

interface SymbolComboboxProps {
    value: string;
    onChange: (value: string) => void;
    source?: "FRED" | "YAHOO" | "ALL";
    placeholder?: string;
}

const defaultYahooSymbols: SearchResult[] = [
    { symbol: "^GSPC", shortname: "S&P 500", exch_disp: "INDEX", type_disp: "Index" },
    { symbol: "^DJI", shortname: "Dow Jones", exch_disp: "INDEX", type_disp: "Index" },
    { symbol: "^IXIC", shortname: "NASDAQ Composite", exch_disp: "INDEX", type_disp: "Index" },
    { symbol: "SPY", shortname: "SPDR S&P 500 ETF", exch_disp: "PCX", type_disp: "ETF" },
    { symbol: "QQQ", shortname: "Invesco QQQ Trust", exch_disp: "NMS", type_disp: "ETF" },
    { symbol: "AAPL", shortname: "Apple Inc.", exch_disp: "NMS", type_disp: "Equity" },
    { symbol: "MSFT", shortname: "Microsoft", exch_disp: "NMS", type_disp: "Equity" },
    { symbol: "GOOGL", shortname: "Alphabet Inc.", exch_disp: "NMS", type_disp: "Equity" },
    { symbol: "AMZN", shortname: "Amazon.com", exch_disp: "NMS", type_disp: "Equity" },
    { symbol: "GC=F", shortname: "Gold Futures", exch_disp: "CMX", type_disp: "Commodity" },
    { symbol: "CL=F", shortname: "Crude Oil Futures", exch_disp: "NYM", type_disp: "Commodity" },
    { symbol: "BTC-USD", shortname: "Bitcoin USD", exch_disp: "CCC", type_disp: "Crypto" },
];

export function SymbolCombobox({
    value,
    onChange,
    source = "YAHOO",
    placeholder = "Type to search..."
}: SymbolComboboxProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>(defaultYahooSymbols);
    const [loading, setLoading] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);

    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        if (open) {
            setTimeout(() => {
                document.addEventListener("mousedown", handleClickOutside);
            }, 0);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [open]);

    // Search logic
    useEffect(() => {
        if (source === "ALL" || source === "FRED") {
            // Fetch from local DB
            const fetchAll = async () => {
                setLoading(true);
                try {
                    const indicators = await invoke<any[]>("get_indicators_list");
                    const mapped: SearchResult[] = indicators.map(ind => ({
                        symbol: ind.slug,
                        shortname: ind.name,
                        exch_disp: ind.source || "Unknown",
                        type_disp: ind.category || "Indicator"
                    }));
                    if (query.length > 0) {
                        setResults(mapped.filter(s =>
                            s.symbol.toLowerCase().includes(query.toLowerCase()) ||
                            s.shortname.toLowerCase().includes(query.toLowerCase())
                        ));
                    } else {
                        setResults(mapped);
                    }
                } catch (e) {
                    console.error("Fetch indicators failed:", e);
                    setResults([]);
                } finally {
                    setLoading(false);
                }
            };
            fetchAll();
        } else if (source === "YAHOO") {
            if (query.length > 1) {
                const timer = setTimeout(async () => {
                    setLoading(true);
                    try {
                        const searchResults = await invoke<SearchResult[]>("search_yahoo_symbol", { query });
                        setResults(searchResults);
                    } catch (e) {
                        console.error("Search failed:", e);
                        setResults([]);
                    } finally {
                        setLoading(false);
                    }
                }, 500); // 500ms debounce
                return () => clearTimeout(timer);
            } else {
                setResults(defaultYahooSymbols);
            }
        }
    }, [query, source]);

    // Sync query with value when not focused
    useEffect(() => {
        if (value && !open) {
            const selected = results.find(r => r.symbol === value);
            if (selected) {
                setQuery(selected.shortname || selected.symbol);
            } else if (source === "ALL") {
                // If not in current results, we may need to wait for mapped results
                // querying will happen in the search logic useEffect
            }
        }
    }, [value, open, results]);

    return (
        <div ref={containerRef} className="relative w-full">
            <div className="relative">
                <input
                    type="text"
                    placeholder={placeholder}
                    value={query} // We drive the input with query, not value, to allow typing
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                        // If user clears input, clear value? Maybe not.
                    }}
                    onFocus={() => setOpen(true)}
                    className="w-full bg-background border border-border rounded-xl pl-4 pr-10 py-3 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-muted-foreground"
                />

                {/* Right Icon */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                    {loading ? (
                        <span className="loading loading-spinner loading-xs"></span>
                    ) : (
                        <ChevronsUpDown size={16} />
                    )}
                </div>
            </div>

            {/* Dropdown Menu */}
            {open && (
                <div className="absolute z-[9999] w-full mt-2 bg-popover/95 backdrop-blur-xl border border-border rounded-xl shadow-xl max-h-[300px] overflow-y-auto overflow-x-hidden">
                    {results.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                            No results found.
                        </div>
                    ) : (
                        <div className="p-1 space-y-0.5">
                            {results.slice(0, 50).map((item) => (
                                <button
                                    key={item.symbol}
                                    type="button"
                                    onClick={() => {
                                        onChange(item.symbol);
                                        setQuery(item.shortname || item.symbol);
                                        setOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-muted transition-colors flex items-center justify-between group ${value === item.symbol ? "bg-primary/10 text-primary" : ""
                                        }`}
                                >
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-bold truncate">{item.shortname || item.symbol}</span>
                                        <span className="text-xs text-muted-foreground truncate">{item.symbol}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[10px] uppercase tracking-wide bg-background/50 px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground">
                                            {item.exch_disp}
                                        </span>
                                        {value === item.symbol && <Check size={14} className="text-primary" />}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
