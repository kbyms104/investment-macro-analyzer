import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Calendar, ChevronDown, ChevronUp, RefreshCw, Landmark, Briefcase } from "lucide-react";
import { GlassCard } from "../ui/GlassCard";

interface MarketEventRecord {
    id: string;
    event_type: string;
    symbol: string;
    event_date: string;
    event_time: string | null;
    data_json: string;
    source: string;
}

export function MarketCalendarWidget() {
    const [events, setEvents] = useState<MarketEventRecord[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    const fetchEvents = async () => {
        setIsLoading(true);
        try {
            const now = new Date();
            const from = now.toISOString().split('T')[0];
            const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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
            alert("Failed to sync calendar. Check Finnhub API Key in Settings.");
        } finally {
            setIsSyncing(false);
        }
    };

    useEffect(() => {
        fetchEvents();
    }, []);

    const earnings = events.filter(e => e.event_type === "earnings");
    const ipos = events.filter(e => e.event_type === "ipo");

    return (
        <GlassCard className="border-border overflow-hidden">
            <div className="p-4 flex justify-between items-center bg-muted/20">
                <div className="flex items-center gap-2">
                    <Calendar size={18} className="text-primary" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Market Calendar</h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono border border-primary/20">
                        Next 7 Days
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {isLoading && <span className="text-[10px] text-muted-foreground animate-pulse leading-none">Loading...</span>}
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className={`p-1.5 rounded-lg hover:bg-muted transition-colors ${isSyncing ? 'animate-spin opacity-50' : ''}`}
                        title="Sync with Finnhub"
                    >
                        <RefreshCw size={14} />
                    </button>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                </div>
            </div>

            {isExpanded && (
                <div className="p-4 space-y-6 animate-in slide-in-from-top-2 duration-300">
                    {/* Earnings Section */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Landmark size={14} className="text-amber-500" />
                            <h4 className="text-xs font-bold text-muted-foreground tracking-widest uppercase">Earnings</h4>
                            <div className="flex-1 h-px bg-border/50"></div>
                            <span className="text-[10px] font-bold text-muted-foreground">{earnings.length}</span>
                        </div>

                        {earnings.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {earnings.map(e => {
                                    const details = JSON.parse(e.data_json);
                                    return (
                                        <div key={e.id} className="p-2.5 rounded-lg bg-zinc-950/40 border border-border/50 flex justify-between items-center group hover:border-primary/30 transition-colors">
                                            <div>
                                                <div className="text-xs font-black tracking-tight">{e.symbol}</div>
                                                <div className="text-[10px] text-muted-foreground">{e.event_date}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[10px] font-bold text-primary">{e.event_time || "N/A"}</div>
                                                <div className="text-[10px] text-muted-foreground">Est: {details.eps_estimate || "--"}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-[10px] text-muted-foreground italic h-10 flex items-center justify-center border border-dashed border-border/50 rounded-lg">
                                No upcoming earnings
                            </div>
                        )}
                    </div>

                    {/* IPOs Section */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Briefcase size={14} className="text-emerald-500" />
                            <h4 className="text-xs font-bold text-muted-foreground tracking-widest uppercase">IPOs</h4>
                            <div className="flex-1 h-px bg-border/50"></div>
                            <span className="text-[10px] font-bold text-muted-foreground">{ipos.length}</span>
                        </div>

                        {ipos.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {ipos.map(e => {
                                    const details = JSON.parse(e.data_json);
                                    return (
                                        <div key={e.id} className="p-2.5 rounded-lg bg-zinc-950/40 border border-border/50 flex justify-between items-center group hover:border-primary/30 transition-colors">
                                            <div>
                                                <div className="text-sm font-black tracking-tight">{e.symbol}</div>
                                                <div className="text-[10px] text-muted-foreground">{e.event_date}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[10px] font-bold text-emerald-500">{details.exchange || "IPO"}</div>
                                                <div className="text-[10px] text-muted-foreground">Price: {details.price || "--"}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-[10px] text-muted-foreground italic h-10 flex items-center justify-center border border-dashed border-border/50 rounded-lg">
                                No upcoming IPOs
                            </div>
                        )}
                    </div>
                </div>
            )}

            {!isExpanded && (
                <div className="px-4 py-2 flex gap-4 overflow-x-auto scrollbar-hide">
                    {earnings.length > 0 && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <Landmark size={12} className="text-amber-500" />
                            <span className="text-[10px] font-bold">{earnings.length} Earnings</span>
                        </div>
                    )}
                    {ipos.length > 0 && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <Briefcase size={12} className="text-emerald-500" />
                            <span className="text-[10px] font-bold">{ipos.length} IPOs</span>
                        </div>
                    )}
                    {earnings.length === 0 && ipos.length === 0 && (
                        <span className="text-[10px] text-muted-foreground italic">No events in next 7 days</span>
                    )}
                </div>
            )}
        </GlassCard>
    );
}
