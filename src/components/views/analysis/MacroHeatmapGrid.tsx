import { motion } from "framer-motion";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "../../ui/tooltip/index";
import { AlertTriangle, TrendingUp, TrendingDown, Activity } from "lucide-react";

export interface HeatmapItem {
    slug: string;
    name: string;
    z_score: number;
    percentile: number;
    category: string;
}

interface MacroHeatmapGridProps {
    items: HeatmapItem[];
    loading?: boolean;
}

export function MacroHeatmapGrid({ items, loading = false }: MacroHeatmapGridProps) {
    if (loading) {
        return <div className="animate-pulse bg-muted/20 h-[400px] rounded-xl" />;
    }

    // Sort: Absolute Z-Score Descending (Most Anomalous first)
    const sortedItems = [...items].sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score));

    // Helper: Determine Color & Intensity
    const getStyle = (z: number) => {
        if (z >= 2.0) return { bg: "bg-rose-500/20", border: "border-rose-500/50", text: "text-rose-500", icon: "text-rose-400" }; // Extreme Heat
        if (z >= 1.0) return { bg: "bg-amber-500/20", border: "border-amber-500/50", text: "text-amber-500", icon: "text-amber-400" }; // Warm
        if (z <= -2.0) return { bg: "bg-blue-600/30", border: "border-blue-500/50", text: "text-blue-400", icon: "text-blue-400" }; // Extreme Cold
        if (z <= -1.0) return { bg: "bg-cyan-500/20", border: "border-cyan-500/50", text: "text-cyan-400", icon: "text-cyan-400" }; // Cool

        return { bg: "bg-slate-500/10", border: "border-white/10", text: "text-muted-foreground", icon: "text-slate-500" }; // Normal
    };

    return (
        <div className="space-y-4">
            <h3 className="font-bold flex items-center gap-2 text-lg">
                <Activity className="text-primary" size={20} />
                Anomaly Heatmap (Bento Grid)
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 auto-rows-[100px]">
                {sortedItems.map((item, index) => {
                    const style = getStyle(item.z_score);

                    // Layout Logic: Top 1 is Large (2x2), Top 2-3 are Wide (2x1) or Tall (1x2)
                    // For simplicity: Rank 1 -> Col Span 2, Row Span 2
                    // Rank 2, 3 -> Col Span 2
                    // Others -> Col Span 1

                    let spanClass = "col-span-1 row-span-1";
                    if (index === 0) spanClass = "col-span-2 row-span-2";
                    else if (index === 1 || index === 2) spanClass = "col-span-2 row-span-1";

                    return (
                        <TooltipProvider key={item.slug}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <motion.div
                                        layout
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ duration: 0.3, delay: index * 0.05 }}
                                        className={`
                                            ${spanClass} 
                                            relative rounded-xl border p-4 flex flex-col justify-between
                                            transition-all hover:scale-[1.02] hover:z-50 cursor-default
                                            ${style.bg} ${style.border}
                                            backdrop-blur-sm shadow-sm
                                        `}
                                    >
                                        {/* Header */}
                                        <div className="flex justify-between items-start">
                                            <span className={`text-[10px] uppercase font-bold tracking-wider opacity-70 ${style.text}`}>
                                                {item.category}
                                            </span>
                                            {Math.abs(item.z_score) > 2.0 && (
                                                <AlertTriangle size={14} className={style.icon} />
                                            )}
                                        </div>

                                        {/* Main Value */}
                                        <div>
                                            <div className="font-bold text-sm md:text-base leading-tight">
                                                {item.name}
                                            </div>
                                            <div className={`font-mono font-black text-xl md:text-2xl tracking-tighter ${style.text}`}>
                                                {item.z_score > 0 ? "+" : ""}{item.z_score.toFixed(2)}σ
                                            </div>
                                        </div>

                                        {/* Footer / Trend */}
                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium">
                                            <span>Rank: {item.percentile.toFixed(0)}%</span>
                                            {item.z_score > 0 ? (
                                                <TrendingUp size={12} className={style.icon} />
                                            ) : (
                                                <TrendingDown size={12} className={style.icon} />
                                            )}
                                        </div>

                                        {/* Pulse Effect for Extreme Anomalies */}
                                        {Math.abs(item.z_score) > 2.5 && (
                                            <div className={`absolute inset-0 rounded-xl animate-pulse ring-2 ring-inset ring-${item.z_score > 0 ? 'rose' : 'blue'}-500/20`} />
                                        )}
                                    </motion.div>
                                </TooltipTrigger>
                                <TooltipContent className="z-[100] bg-zinc-950/90 backdrop-blur-md border-zinc-800 text-white shadow-2xl">
                                    <div className="text-xs space-y-1">
                                        <p className="font-bold text-sm">{item.name}</p>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-zinc-400">
                                            <span>Z-Score:</span>
                                            <span className={`font-mono font-bold ${item.z_score > 0 ? "text-rose-400" : "text-blue-400"}`}>
                                                {item.z_score.toFixed(4)}
                                            </span>

                                            <span>Percentile:</span>
                                            <span className="font-mono text-zinc-200">{item.percentile.toFixed(1)}%</span>
                                        </div>
                                        <p className="text-[10px] border-t border-white/10 pt-1 mt-1 text-zinc-500">
                                            {Math.abs(item.z_score) > 2.0 ? "⚠️ Extreme Anomaly" : "Normal Range"}
                                        </p>
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    );
                })}
            </div>
        </div>
    );
}
