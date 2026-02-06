import { GlassCard } from "../ui/GlassCard";
import { Gauge, TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown } from "lucide-react";

export interface TechnicalSignal {
    slug: string;
    rsi_14: number | null;
    adx_14: number | null;
    trend_strength: "StrongUp" | "WeakUp" | "Neutral" | "WeakDown" | "StrongDown" | "Unknown";
    sma_50: number | null;
    sma_200: number | null;
    market_regime: "Trending" | "MeanReverting" | "RandomWalk" | "Unknown";
}

interface TechnicalSignalWidgetProps {
    data: TechnicalSignal;
    assetName: string;
}

const TrendIcon = ({ trend }: { trend: string }) => {
    switch (trend) {
        case 'StrongUp': return <TrendingUp className="h-5 w-5 text-green-500" />;
        case 'WeakUp': return <ArrowUp className="h-5 w-5 text-green-300" />;
        case 'StrongDown': return <TrendingDown className="h-5 w-5 text-red-500" />;
        case 'WeakDown': return <ArrowDown className="h-5 w-5 text-red-300" />;
        default: return <Minus className="h-5 w-5 text-gray-400" />;
    }
};

const RSIGauge = ({ value }: { value: number | null }) => {
    if (value === null) return <div className="text-gray-500">N/A</div>;

    let color = "text-gray-400";
    if (value > 70) color = "text-red-500"; // Overbought
    else if (value < 30) color = "text-green-500"; // Oversold
    else color = "text-blue-400"; // Neutral

    return (
        <div className="flex flex-col items-center">
            <Gauge className={`h-6 w-6 ${color} mb-1`} />
            <span className={`text-sm font-bold ${color}`}>{value.toFixed(1)}</span>
            <span className="text-[10px] text-gray-500">RSI (14)</span>
        </div>
    );
};

export const TechnicalSignalWidget: React.FC<TechnicalSignalWidgetProps> = ({ data, assetName }) => {
    const isGoldenCross = (data.sma_50 && data.sma_200) ? data.sma_50 > data.sma_200 : false;

    // Format Trend String "StrongUp" -> "Strong Up"
    const trendLabel = data.trend_strength.replace(/([A-Z])/g, ' $1').trim();

    return (
        <GlassCard className="p-4 border-zinc-800">
            <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-medium text-gray-200">{assetName}</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-400">
                    {data.market_regime}
                </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
                {/* Trend Section */}
                <div className="flex flex-col items-center justify-center p-2 bg-zinc-950/50 rounded-lg">
                    <TrendIcon trend={data.trend_strength} />
                    <span className="text-[10px] mt-1 text-gray-300">{trendLabel}</span>
                </div>

                {/* RSI Section */}
                <div className="flex flex-col items-center justify-center p-2 bg-zinc-950/50 rounded-lg">
                    <RSIGauge value={data.rsi_14} />
                </div>

                {/* MA Section */}
                <div className="flex flex-col items-center justify-center p-2 bg-zinc-950/50 rounded-lg">
                    <div className={`text-xs font-bold ${isGoldenCross ? 'text-green-400' : 'text-red-400'}`}>
                        {isGoldenCross ? 'Bullish' : 'Bearish'}
                    </div>
                    <span className="text-[10px] text-gray-500 mt-1">MA Cross</span>
                </div>
            </div>
        </GlassCard>
    );
};
