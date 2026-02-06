import { format } from "date-fns";
import { formatValueByUnit } from "../../utils/format";

export const GlassTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-background/95 backdrop-blur-xl border border-border/50 p-4 rounded-xl shadow-2xl text-xs min-w-[180px] animate-in fade-in zoom-in-95 duration-200">
                <p className="font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <span className="w-1 h-4 bg-primary rounded-full"></span>
                    {label ? format(new Date(label), 'MMM dd, yyyy') : '--'}
                </p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center justify-between gap-4 mb-2 last:mb-0 group">
                        <div className="flex items-center gap-2">
                            <div
                                className="w-2 h-2 rounded-full ring-2 ring-white/10 group-hover:ring-white/30 transition-all"
                                style={{ backgroundColor: entry.color }}
                            />
                            <span className="text-foreground/80 font-medium">{entry.name}</span>
                        </div>
                        <span className="font-mono font-bold text-foreground text-sm">
                            {formatValueByUnit(Number(entry.value), entry.unit)}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};
