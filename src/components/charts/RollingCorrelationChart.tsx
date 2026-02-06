import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";

interface RollingCorrelationChartProps {
    data: { date: string; value: number }[];
    height?: number;
    windowDays: number;
}

export function RollingCorrelationChart({ data, height = 250, windowDays }: RollingCorrelationChartProps) {

    // Gradient definition for Green/Red split
    const gradientOffset = useMemo(() => {
        const dataMax = Math.max(...data.map((i) => i.value));
        const dataMin = Math.min(...data.map((i) => i.value));

        if (dataMax <= 0) {
            return 0;
        }
        if (dataMin >= 0) {
            return 1;
        }

        return dataMax / (dataMax - dataMin);
    }, [data]);

    // Custom Tooltip
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const val = payload[0].value as number;
            return (
                <div className="bg-background/95 backdrop-blur border border-border p-3 rounded-lg shadow-xl text-xs">
                    <p className="font-mono text-muted-foreground mb-1">{format(new Date(label), "MMM dd, yyyy")}</p>
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">Correlation:</span>
                        <span className={`font-bold font-mono ${val > 0 ? "text-emerald-500" : "text-rose-500"}`}>
                            {val.toFixed(3)}
                        </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                        {windowDays}-day rolling window
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <div style={{ width: "100%", height }}>
            <ResponsiveContainer>
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                            <stop offset={gradientOffset} stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset={gradientOffset} stopColor="#10b981" stopOpacity={0} />
                            <stop offset={gradientOffset} stopColor="#f43f5e" stopOpacity={0} />
                            <stop offset={gradientOffset} stopColor="#f43f5e" stopOpacity={0.3} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} vertical={false} />
                    <XAxis
                        dataKey="date"
                        tickFormatter={(str) => format(new Date(str), "MMM ''yy")}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={40}
                    />
                    <YAxis
                        domain={[-1, 1]}
                        ticks={[-1, -0.5, 0, 0.5, 1]}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" opacity={0.5} />
                    <ReferenceLine y={0.7} stroke="#10b981" strokeDasharray="3 3" opacity={0.2} label={{ value: "Strong (+0.7)", position: "insideRight", fontSize: 10, fill: "#10b981" }} />
                    <ReferenceLine y={-0.7} stroke="#f43f5e" strokeDasharray="3 3" opacity={0.2} label={{ value: "Strong (-0.7)", position: "insideRight", fontSize: 10, fill: "#f43f5e" }} />

                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#8884d8"
                        fill="url(#splitColor)"
                        strokeWidth={2}
                        animationDuration={1000}
                    />
                    {/* Overlay stroke with conditional color using another hack or just kept simple purple/grey. 
                        Actually for gradient, the stroke color is fixed. 
                        Let's use a dynamic stroke approach if needed, but a neutral or gradient-matching stroke involves multiple paths.
                        For now, keeping a neutral primary color or adapting.
                     */}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
