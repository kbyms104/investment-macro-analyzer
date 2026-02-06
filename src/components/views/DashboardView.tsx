import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Save, RotateCcw, Plus, LayoutTemplate, X, GripVertical, Search, Check } from "lucide-react";
import { GlassCard } from "../ui/GlassCard";
import { AdvancedAnalyticsChart } from "../charts/AdvancedAnalyticsChart";
import { AlertDialog } from "../ui/AlertDialog";

// --- Types ---
interface DashboardConfig {
    id: string;
    name: string;
    indicators: string[]; // List of slugs
    description: string;
}

interface IndicatorMeta {
    slug: string;
    name: string;
    category: string;
}

interface DataPoint {
    timestamp: string;
    value: number;
}

// --- Constants: Predefined Templates ---
const TEMPLATES: Record<string, DashboardConfig> = {
    recession: {
        id: "recession",
        name: "Recession Watch 🐻",
        description: "Key early warning signals for economic downturns.",
        indicators: ["yield_curve_10y_2y", "unrate", "initial_claims", "consumer_sentiment"]
    },
    inflation: {
        id: "inflation",
        name: "Inflation Hawk 🦅",
        description: "Tracking price stability and purchasing power.",
        indicators: ["cpi", "ppi", "oil_wti", "breakeven_10y"]
    },
    liquidity: {
        id: "liquidity",
        name: "Liquidity & Fed 💧",
        description: "Central bank balance sheet and money supply monitor.",
        indicators: ["fed_balance_sheet", "fed_rrp", "m2", "vix"]
    }
};

const STORAGE_KEY = "user_dashboard_config_v1";

export function DashboardView() {
    // State
    const [currentTemplateId, setCurrentTemplateId] = useState<string>("recession");
    const [activeIndicators, setActiveIndicators] = useState<string[]>(TEMPLATES["recession"].indicators);
    const [availableIndicators, setAvailableIndicators] = useState<IndicatorMeta[]>([]);
    const [chartData, setChartData] = useState<Record<string, DataPoint[]>>({});
    const [isDirty, setIsDirty] = useState(false);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [showSavedMsg, setShowSavedMsg] = useState(false);

    // Alert State
    const [alertConfig, setAlertConfig] = useState({
        isOpen: false,
        title: "",
        description: "",
        variant: "warning" as "warning" | "danger" | "info" | "success",
        onConfirm: () => { }
    });

    // 1. Load Config & Indicators List on Mount
    useEffect(() => {
        // Load available indicators for the "Add" menu
        invoke<IndicatorMeta[]>("get_indicators_list")
            .then(list => setAvailableIndicators(list.filter(i => i.category !== "Internal")))
            .catch(err => console.error("Failed to load indicators:", err));

        // Load saved user config
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.currentTemplateId === 'custom') {
                    setCurrentTemplateId('custom');
                    setActiveIndicators(parsed.activeIndicators);
                }
            } catch (e) {
                console.error("Failed to parse saved config", e);
            }
        }
    }, []);

    // 2. Fetch Data when Active Indicators Change
    useEffect(() => {
        const fetchMissingData = async () => {
            const newData: Record<string, DataPoint[]> = { ...chartData };
            const promises = activeIndicators.map(async (slug) => {
                if (!newData[slug]) {
                    try {
                        const data = await invoke<DataPoint[]>("get_indicator_history", { slug, range: "5Y" });
                        return { slug, data };
                    } catch (e) {
                        console.error(`Failed to fetch ${slug}`, e);
                        return { slug, data: [] };
                    }
                }
                return null;
            });

            const results = await Promise.all(promises);
            let updated = false;
            results.forEach(res => {
                if (res) {
                    newData[res.slug] = res.data;
                    updated = true;
                }
            });

            if (updated) setChartData(newData);
        };

        fetchMissingData();
    }, [activeIndicators]);

    // Handlers
    const switchTemplate = (id: string) => {
        if (id === 'custom') {
            // Load custom config
            const saved = localStorage.getItem(STORAGE_KEY);
            let indicators: string[] = [];
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    indicators = parsed.activeIndicators || [];
                } catch (e) {
                    console.error("Failed to parse saved config", e);
                }
            }
            setCurrentTemplateId('custom');
            setActiveIndicators(indicators);
            setIsDirty(false);
        } else {
            const template = TEMPLATES[id];
            setCurrentTemplateId(id);
            setActiveIndicators(template.indicators);
            setIsDirty(false);
        }
    };

    const removeIndicator = (slugToRemove: string) => {
        const newAndicators = activeIndicators.filter(slug => slug !== slugToRemove);
        setActiveIndicators(newAndicators);
        setCurrentTemplateId('custom'); // Switch to custom mode
        setIsDirty(true);
    };

    const addIndicator = (slug: string) => {
        if (activeIndicators.includes(slug)) return;
        setActiveIndicators([...activeIndicators, slug]);
        setCurrentTemplateId('custom');
        setIsDirty(true);
        setShowAddMenu(false);
        setSearchTerm(""); // Clear search on add
    };

    const performSave = () => {
        const config = {
            currentTemplateId: 'custom',
            activeIndicators,
            timestamp: Date.now()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        setIsDirty(false);
        setShowSavedMsg(true);
        setTimeout(() => setShowSavedMsg(false), 2000);
        setAlertConfig(prev => ({ ...prev, isOpen: false }));
    };

    const saveCustomConfig = () => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            setAlertConfig({
                isOpen: true,
                title: "Overwrite Existing Dashboard?",
                description: "You have a previously saved 'My View' dashboard. Saving now will overwrite it with the current layout.",
                variant: "warning",
                onConfirm: performSave
            });
        } else {
            performSave();
        }
    };

    const resetToDefault = () => {
        const def = TEMPLATES["recession"];
        setCurrentTemplateId(def.id);
        setActiveIndicators(def.indicators);
        localStorage.removeItem(STORAGE_KEY);
        setIsDirty(false);
    };

    // Helper to get name
    const getMeta = (slug: string) => availableIndicators.find(i => i.slug === slug) || { name: slug, category: "Unknown" };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 min-h-screen pb-20">
            {/* Header / Toolbar */}
            <GlassCard className="p-4 border-border sticky top-4 z-40 backdrop-blur-xl bg-background/80 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">

                    {/* Template Switcher */}
                    <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 hide-scrollbar">
                        <LayoutTemplate size={18} className="text-muted-foreground mr-2 shrink-0" />

                        {/* Preset Templates */}
                        {Object.values(TEMPLATES).map(t => (
                            <button
                                key={t.id}
                                onClick={() => switchTemplate(t.id)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap border ${currentTemplateId === t.id && !isDirty
                                    ? "bg-primary text-primary-foreground border-primary shadow-md"
                                    : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border-transparent"
                                    }`}
                            >
                                {t.name}
                            </button>
                        ))}

                        {/* My Dashboard Tab */}
                        <button
                            onClick={() => switchTemplate('custom')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap border flex items-center gap-2 ${currentTemplateId === 'custom'
                                ? "bg-amber-500 text-white border-amber-600 shadow-md"
                                : "bg-muted/50 hover:bg-muted text-muted-foreground border-transparent"
                                }`}
                        >
                            <span>My View</span>
                            {isDirty && currentTemplateId === 'custom' && (
                                <span className="w-2 h-2 rounded-full bg-white animate-pulse" title="Unsaved changes" />
                            )}
                        </button>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 shrink-0">

                        {/* Add Indicator */}
                        <div className="relative">
                            <button
                                onClick={() => {
                                    setShowAddMenu(!showAddMenu);
                                    if (!showAddMenu) setSearchTerm(""); // Clear on open
                                }}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted text-sm font-medium transition-colors border border-border"
                            >
                                <Plus size={16} /> Add Widget
                            </button>

                            {/* Dropdown Menu */}
                            {showAddMenu && (
                                <div className="absolute top-full right-0 mt-2 w-72 max-h-96 overflow-y-auto bg-popover border border-border rounded-xl shadow-2xl z-50 p-2 animate-in zoom-in-95 duration-200 flex flex-col">
                                    {/* Search Header */}
                                    <div className="p-2 sticky top-0 bg-popover z-10 border-b border-border/50 mb-2">
                                        <div className="relative">
                                            <Search className="absolute left-2.5 top-2.5 text-muted-foreground w-4 h-4" />
                                            <input
                                                type="text"
                                                placeholder="Search indicators..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                autoFocus
                                                className="w-full bg-muted/50 border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50"
                                            />
                                        </div>
                                    </div>

                                    <div className="text-xs font-bold text-muted-foreground px-2 py-1 mb-2 uppercase tracking-wider">Available Indicators</div>

                                    <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
                                        {availableIndicators
                                            .filter(i => !activeIndicators.includes(i.slug))
                                            .filter(i =>
                                                i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                                i.category.toLowerCase().includes(searchTerm.toLowerCase())
                                            )
                                            .map(i => (
                                                <button
                                                    key={i.slug}
                                                    onClick={() => addIndicator(i.slug)}
                                                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted text-sm flex flex-col gap-0.5 transition-colors group"
                                                >
                                                    <span className="font-medium text-foreground group-hover:text-primary transition-colors">{i.name}</span>
                                                    <span className="text-[10px] text-muted-foreground">{i.category}</span>
                                                </button>
                                            ))}
                                        {availableIndicators.filter(i => !activeIndicators.includes(i.slug) && (i.name.toLowerCase().includes(searchTerm.toLowerCase()) || i.category.toLowerCase().includes(searchTerm.toLowerCase()))).length === 0 && (
                                            <div className="text-center py-8 text-muted-foreground text-sm">
                                                No results found
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {showAddMenu && (
                                <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
                            )}
                        </div>

                        <div className="h-6 w-px bg-border/50 mx-1" />

                        <button
                            onClick={saveCustomConfig}
                            disabled={!showSavedMsg && !isDirty && currentTemplateId !== 'custom'}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${showSavedMsg
                                ? "bg-emerald-500 text-white shadow-lg scale-105"
                                : isDirty || currentTemplateId === 'custom'
                                    ? "bg-primary text-primary-foreground shadow-lg hover:scale-105 active:scale-95"
                                    : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
                                }`}
                        >
                            {showSavedMsg ? (
                                <>
                                    <Check size={16} /> Saved!
                                </>
                            ) : (
                                <>
                                    <Save size={16} /> Save
                                </>
                            )}
                        </button>
                        {/* ... remaining code ... */}

                        <button
                            onClick={resetToDefault}
                            className="p-2 rounded-lg hover:bg-rose-500/10 hover:text-rose-500 text-muted-foreground transition-colors"
                            title="Reset to Defaults"
                        >
                            <RotateCcw size={18} />
                        </button>
                    </div>
                </div>
            </GlassCard>

            {/* Description Area */}
            {currentTemplateId !== 'custom' && !isDirty && (
                <div className="text-center py-2">
                    <p className="text-muted-foreground text-sm max-w-2xl mx-auto italic">
                        "{TEMPLATES[currentTemplateId].description}"
                    </p>
                </div>
            )}

            {/* Grid Layout */}
            {activeIndicators.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border-2 border-dashed border-border/50 rounded-3xl m-4">
                    <LayoutTemplate size={48} className="mb-4 opacity-20" />
                    <p>No widgets added. Start by selecting a template or adding a widget.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6 p-1">
                    {activeIndicators.map(slug => {
                        const data = chartData[slug];
                        const meta = getMeta(slug);
                        return (
                            <div key={slug} className="relative group">
                                <AdvancedAnalyticsChart
                                    title={meta.name}
                                    data={data || []} // Pass raw DataPoints? Component expects {timestamp, value}
                                    series={[
                                        {
                                            name: meta.name,
                                            dataKey: "value",
                                            color: "#6366f1", // Default color, ideally dynamic based on category 
                                            type: "area",
                                            fillOpacity: 0.1
                                        }
                                    ]}
                                    height={320}
                                    isLoading={!data}
                                />
                                {/* Remove Button (Visible on Hover) */}
                                <button
                                    onClick={() => removeIndicator(slug)}
                                    className="absolute top-4 right-4 p-1.5 rounded-full bg-background/80 hover:bg-rose-500 hover:text-white text-muted-foreground shadow-sm opacity-0 group-hover:opacity-100 transition-all z-10 border border-border backdrop-blur-sm"
                                    title="Remove Widget"
                                >
                                    <X size={14} />
                                </button>
                                {/* Drag Handle (Visual only for now) */}
                                <div className="absolute top-4 left-4 p-1.5 opacity-0 group-hover:opacity-30 cursor-move">
                                    <GripVertical size={14} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <AlertDialog
                isOpen={alertConfig.isOpen}
                title={alertConfig.title}
                description={alertConfig.description}
                variant={alertConfig.variant}
                onConfirm={alertConfig.onConfirm}
                onCancel={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
}
