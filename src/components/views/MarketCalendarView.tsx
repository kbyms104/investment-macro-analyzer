import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Calendar, RefreshCw, Landmark, Briefcase, Search, Info } from "lucide-react";
import { GlassCard } from "../ui/GlassCard";
import { EarningsDetailModal } from "./calendar/EarningsDetailModal";

interface MarketEventRecord {
    id: string;
    event_type: string;
    symbol: string;
    event_date: string;
    event_time: string | null;
    data_json: string;
    source: string;
}

export function MarketCalendarView() {
    const [events, setEvents] = useState<MarketEventRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterType, setFilterType] = useState<"all" | "earnings" | "ipo">("all");

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSymbol, setSelectedSymbol] = useState("");
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);

    const fetchEvents = async () => {
        setIsLoading(true);
        try {
            // Fetch for a wider range in full view (e.g., 2 weeks)
            const now = new Date();
            const from = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const to = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const data = await invoke<MarketEventRecord[]>("get_market_calendar", { from, to });
            setEvents(data || []);
        } catch (error) {
            console.error("Failed to fetch calendar events:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            await invoke("sync_finnhub_calendar");
            await fetchEvents();
        } catch (error) {
            console.error("Failed to sync calendar:", error);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleOpenDetail = async (symbol: string) => {
        setSelectedSymbol(symbol);
        setIsModalOpen(true);
        setIsHistoryLoading(true);
        setHistoryData([]);

        try {
            const history = await invoke<any[]>("get_earnings_history", { symbol });
            setHistoryData(history || []);
        } catch (error) {
            console.error("Failed to load earnings history:", error);
        } finally {
            setIsHistoryLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
    }, []);

    const filteredEvents = events.filter(e => {
        const matchesSearch = e.symbol.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = filterType === "all" || e.event_type === filterType;

        // Data-driven noise reduction: Skip cards with zero financial data
        try {
            const details = JSON.parse(e.data_json);
            if (e.event_type === "earnings") {
                const hasData = details.eps_estimate !== null || details.eps_actual !== null;
                if (!hasData) return false;
            } else if (e.event_type === "ipo") {
                const hasData = details.price !== null || details.number_of_shares !== null;
                if (!hasData) return false;
            }
        } catch (err) {
            console.error("Failed to parse event data for filtering:", err);
        }

        return matchesSearch && matchesFilter;
    });

    // Group by date
    const groupedEvents = filteredEvents.reduce((acc, event) => {
        if (!acc[event.event_date]) acc[event.event_date] = [];
        acc[event.event_date].push(event);
        return acc;
    }, {} as Record<string, MarketEventRecord[]>);

    const sortedDates = Object.keys(groupedEvents).sort();

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* Header Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative flex-1 md:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                        <input
                            type="text"
                            placeholder="Search symbol..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-background/50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-sm"
                        />
                    </div>

                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value as any)}
                        className="px-4 py-2 bg-background/50 border border-border rounded-xl focus:outline-none text-sm font-medium"
                    >
                        <option value="all">All Events</option>
                        <option value="earnings">Earnings</option>
                        <option value="ipo">IPOs</option>
                    </select>
                </div>

                <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="flex items-center gap-2 px-6 py-2 bg-primary/90 hover:bg-primary text-primary-foreground rounded-xl transition-all shadow-lg shadow-primary/20 text-sm font-medium disabled:opacity-50"
                >
                    <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
                    {isSyncing ? "Syncing..." : "Sync Finnhub"}
                </button>
            </div>

            {isLoading && !isSyncing ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <RefreshCw className="animate-spin text-primary" size={32} />
                    <p className="text-muted-foreground animate-pulse font-mono text-sm uppercase tracking-widest">Loading Market Data...</p>
                </div>
            ) : sortedDates.length > 0 ? (
                <div className="space-y-8">
                    {sortedDates.map(date => (
                        <div key={date} className="space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="h-px flex-1 bg-border/50"></div>
                                <h3 className="text-sm font-bold font-mono text-primary bg-primary/5 px-4 py-1 rounded-full border border-primary/10">
                                    {date}
                                </h3>
                                <div className="h-px flex-1 bg-border/50"></div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {groupedEvents[date].map(event => {
                                    const details = JSON.parse(event.data_json);
                                    const isEarnings = event.event_type === "earnings";

                                    return (
                                        <GlassCard
                                            key={event.id}
                                            onClick={() => isEarnings && handleOpenDetail(event.symbol)}
                                            className={`p-4 border-border/60 transition-all group overflow-hidden relative cursor-pointer active:scale-95 ${isEarnings ? "hover:border-amber-500/40 hover:bg-amber-500/[0.02]" : "hover:border-emerald-500/40 hover:bg-emerald-500/[0.02]"
                                                }`}
                                        >
                                            {/* Accent background */}
                                            <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-5 -translate-y-1/2 translate-x-1/2 ${isEarnings ? "bg-amber-500" : "bg-emerald-500"}`}></div>

                                            <div className="flex justify-between items-start mb-4 relative z-10">
                                                <div>
                                                    <h4 className="text-xl font-black tracking-tight group-hover:text-primary transition-colors">{event.symbol}</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        {isEarnings ? (
                                                            <Landmark size={12} className="text-amber-500" />
                                                        ) : (
                                                            <Briefcase size={12} className="text-emerald-500" />
                                                        )}
                                                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                                            {event.event_type}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${isEarnings ? "bg-amber-500/10 border-amber-500/20 text-amber-500" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                                                        }`}>
                                                        {isEarnings ? (event.event_time || "TBA") : details.exchange}
                                                    </div>
                                                    {isEarnings && (
                                                        <div className="flex items-center gap-1 mt-1 justify-end text-[8px] text-muted-foreground font-bold">
                                                            <Info size={8} /> CLICK FOR HISTORY
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 mt-2 relative z-10">
                                                {isEarnings ? (
                                                    <>
                                                        <div className="bg-muted/30 p-2 rounded-lg border border-border/50">
                                                            <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter">Estimate</div>
                                                            <div className="text-sm font-mono font-bold text-primary">{details.eps_estimate || "--"}</div>
                                                        </div>
                                                        <div className="bg-muted/30 p-2 rounded-lg border border-border/50">
                                                            <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter">Actual</div>
                                                            <div className="text-sm font-mono font-bold">{details.eps_actual || "Waiting..."}</div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="bg-muted/30 p-2 rounded-lg border border-border/50">
                                                            <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter">Price Range</div>
                                                            <div className="text-sm font-mono font-bold text-emerald-500">{details.price || "--"}</div>
                                                        </div>
                                                        <div className="bg-muted/30 p-2 rounded-lg border border-border/50">
                                                            <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter">Shares</div>
                                                            <div className="text-sm font-mono font-bold">{details.number_of_shares ? (details.number_of_shares / 1000000).toFixed(1) + 'M' : "N/A"}</div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </GlassCard>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-4 bg-muted/20 border border-dashed border-border rounded-3xl">
                    <Calendar size={48} className="text-muted-foreground/30" />
                    <div>
                        <p className="text-lg font-bold text-muted-foreground">No events found for the current range.</p>
                        <p className="text-sm text-muted-foreground/60">Try searching for a different symbol or sync with Finnhub.</p>
                    </div>
                </div>
            )}

            {/* Earnings Detail Modal */}
            <EarningsDetailModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                symbol={selectedSymbol}
                history={historyData}
                loading={isHistoryLoading}
            />
        </div>
    );
}
