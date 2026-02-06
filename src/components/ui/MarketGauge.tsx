interface MarketGaugeProps {
    score: number; // 0 to 100
}

export function MarketGauge({ score }: MarketGaugeProps) {
    // Determine color based on score
    const getColor = (s: number) => {
        if (s >= 70) return "#f43f5e"; // rose-500
        if (s >= 40) return "#f59e0b"; // amber-500
        return "#10b981"; // emerald-500
    };

    const color = getColor(score);
    const rotation = (score / 100) * 180 - 90; // Map 0-100 to -90deg to +90deg

    return (
        <div className="relative w-full max-w-[300px] aspect-[2/1] flex flex-col items-center justify-end overflow-hidden group">
            {/* Background Arch */}
            <div className="absolute inset-0 border-[16px] border-muted/20 rounded-t-full"></div>

            {/* Active Progress Arch (Simulated with clip-path or heavy border trick) */}
            <div
                className="absolute inset-0 border-[16px] rounded-t-full transition-all duration-1000 ease-out"
                style={{
                    borderColor: color,
                    clipPath: `inset(0 ${100 - score}% 0 0)`, // Simplified visual
                    opacity: 0.8
                }}
            ></div>

            {/* Needle */}
            <div
                className="absolute bottom-0 w-1 h-24 bg-foreground origin-bottom transition-transform duration-1000 ease-out z-10"
                style={{ transform: `rotate(${rotation}deg)` }}
            >
                <div className="absolute -top-1 -left-1 w-3 h-3 rounded-full bg-primary shadow-lg shadow-primary/50"></div>
            </div>

            {/* Bottom Info */}
            <div className="relative z-20 text-center pb-2 bg-background/50 backdrop-blur-sm px-4 rounded-t-xl">
                <div className="text-4xl font-black tracking-tighter transition-colors duration-500" style={{ color }}>
                    {score}
                </div>
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                    Risk Score
                </div>
            </div>

            {/* Glow effect */}
            <div
                className="absolute -bottom-10 w-40 h-20 blur-[60px] opacity-20 transition-colors duration-1000"
                style={{ backgroundColor: color }}
            ></div>
        </div>
    );
}
