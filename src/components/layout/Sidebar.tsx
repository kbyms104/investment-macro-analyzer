import { LayoutDashboard, Activity, Database, Settings, Zap, LayoutGrid, GitCompare, BarChart3, RotateCw, Bot, CalendarDays } from "lucide-react";

interface SidebarProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
    return (
        <aside className="w-64 border-r border-border bg-background/80 dark:bg-black/90 backdrop-blur-xl flex flex-col h-full fixed left-0 top-0 z-20">
            <div className="p-8">
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Zap size={18} className="text-primary fill-primary/20" />
                    </div>
                    Inv.AI
                </h1>
                <p className="text-xs text-muted-foreground mt-2 pl-1 font-mono">v0.1.0 PRO</p>
            </div>

            <nav className="flex-1 px-4 space-y-2 py-4">
                <SidebarItem
                    icon={<LayoutDashboard size={20} />}
                    label="Overview"
                    active={activeTab === "overview"}
                    onClick={() => onTabChange("overview")}
                />
                <SidebarItem
                    icon={<RotateCw size={20} />}
                    label="Market Cycle"
                    active={activeTab === "market_cycle"}
                    onClick={() => onTabChange("market_cycle")}
                />
                <SidebarItem
                    icon={<CalendarDays size={20} />}
                    label="Market Calendar"
                    active={activeTab === "market_calendar"}
                    onClick={() => onTabChange("market_calendar")}
                />
                <SidebarItem
                    icon={<BarChart3 size={20} />}
                    label="Dashboards"
                    active={activeTab === "dashboards"}
                    onClick={() => onTabChange("dashboards")}
                />
                <SidebarItem
                    icon={<Activity size={20} />}
                    label="Indicators"
                    active={activeTab === "indicators"}
                    onClick={() => onTabChange("indicators")}
                />
                <SidebarItem
                    icon={<LayoutGrid size={20} />}
                    label="Market Map"
                    active={activeTab === "market_map"}
                    onClick={() => onTabChange("market_map")}
                />
                <SidebarItem
                    icon={<GitCompare size={20} />}
                    label="Correlation Lab"
                    active={activeTab === "correlation"}
                    onClick={() => onTabChange("correlation")}
                />
                <SidebarItem
                    icon={<Bot size={20} />}
                    label="AI Report"
                    active={activeTab === "ai_report"}
                    onClick={() => onTabChange("ai_report")}
                />
                <SidebarItem
                    icon={<Database size={20} />}
                    label="Data Ingestion"
                    active={activeTab === "data-ingestion"}
                    onClick={() => onTabChange("data-ingestion")}
                />
                <SidebarItem
                    icon={<Settings size={20} />}
                    label="Settings"
                    active={activeTab === "settings"}
                    onClick={() => onTabChange("settings")}
                />
            </nav>

            <div className="p-6 border-t border-border">
                <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground bg-muted/50 p-3 rounded-lg border border-border/50">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse"></div>
                    SYSTEM ONLINE
                </div>
            </div>
        </aside>
    );
}

function SidebarItem({ icon, label, active, onClick, badge }: { icon: any, label: string, active: boolean, onClick: () => void, badge?: string }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group relative overflow-hidden ${active
                ? "bg-primary/10 text-primary shadow-sm border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
        >
            {active && <div className="absolute left-0 top-0 h-full w-[3px] bg-primary shadow-[0_0_10px_currentColor]"></div>}
            <span className={`relative z-10 duration-200 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>{icon}</span>
            <span className="relative z-10">{label}</span>
            {badge && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold">
                    {badge}
                </span>
            )}
        </button>
    );
}
