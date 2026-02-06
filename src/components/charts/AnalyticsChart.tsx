import { useMemo } from 'react';
import {
    ResponsiveContainer,
    ComposedChart,
    Area,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    Brush,
    ReferenceLine
} from 'recharts';
import { format } from 'date-fns';
import { GlassCard } from '../ui/GlassCard';

export interface ChartSeries {
    name: string;
    dataKey: string;
    color: string;
    type?: 'line' | 'area' | 'bar';
    yAxisId?: 'left' | 'right';
    strokeWidth?: number;
    fillOpacity?: number;
}

export interface AnalyticsChartProps {
    title: string;
    data: any[];
    series: ChartSeries[];
    height?: number | string;
    showBrush?: boolean;
    referenceLines?: { y: number; label: string; color: string; yAxisId?: string }[];
    className?: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-background/95 backdrop-blur-xl border border-border/50 p-4 rounded-xl shadow-2xl text-xs min-w-[180px]">
                <p className="font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <span className="w-1 h-4 bg-primary rounded-full"></span>
                    {format(new Date(label), 'MMM dd, yyyy')}
                </p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center justify-between gap-4 mb-2 last:mb-0">
                        <div className="flex items-center gap-2">
                            <div
                                className="w-2 h-2 rounded-full ring-2 ring-white/10"
                                style={{ backgroundColor: entry.color }}
                            />
                            <span className="text-foreground/80 font-medium">{entry.name}</span>
                        </div>
                        <span className="font-mono font-bold text-foreground text-sm">
                            {Number(entry.value).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

export const AnalyticsChart = ({
    title,
    data,
    series,
    height = 450,
    showBrush = false,
    referenceLines = [],
    className
}: AnalyticsChartProps) => {

    // Determine if we need a right axis
    const hasRightAxis = useMemo(() => series.some(s => s.yAxisId === 'right'), [series]);

    // Style handling for flexible height
    const containerStyle = typeof height === 'number' ? { height } : { height: '100%' };

    return (
        <GlassCard className={`w-full p-1 flex flex-col relative overflow-hidden ${className || ''}`} style={containerStyle}>
            {title && (
                <div className="px-6 pt-5 pb-2 flex justify-between items-center z-10 shrink-0">
                    <h3 className="text-lg font-bold text-foreground tracking-tight">
                        {title}
                    </h3>
                </div>
            )}

            <div className="flex-1 min-h-0 w-full relative mt-2">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                        data={data}
                        margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
                    >
                        <defs>
                            {series.map((s) => (
                                <linearGradient
                                    key={`grad-${s.dataKey}`}
                                    id={`gradient-${s.dataKey}`}
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                >
                                    <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
                                    <stop offset="100%" stopColor={s.color} stopOpacity={0.0} />
                                </linearGradient>
                            ))}
                        </defs>

                        <CartesianGrid
                            vertical={false}
                            stroke="rgba(255,255,255,0.03)"
                            strokeDasharray="4 4"
                        />

                        <Legend
                            verticalAlign="top"
                            height={36}
                            iconType="circle"
                            iconSize={8}
                            wrapperStyle={{ paddingBottom: '10px', fontSize: '12px', opacity: 0.7 }}
                        />

                        <XAxis
                            dataKey="timestamp"
                            tickFormatter={(str) => format(new Date(str), 'MMM yy')}
                            stroke="#525252"
                            tick={{ fill: '#a1a1aa', fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={40}
                            dy={10}
                        />

                        {/* Left Axis */}
                        <YAxis
                            yAxisId="left"
                            orientation="left"
                            stroke="#525252"
                            tick={{ fill: '#a1a1aa', fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            domain={['auto', 'auto']}
                            dx={-10}
                        />

                        {/* Right Axis (Conditional) */}
                        {hasRightAxis && (
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                stroke="#525252"
                                tick={{ fill: '#a1a1aa', fontSize: 11 }}
                                tickLine={false}
                                axisLine={false}
                                domain={['auto', 'auto']}
                                dx={10}
                            />
                        )}

                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }} />

                        {referenceLines.map((line) => (
                            <ReferenceLine
                                key={line.label}
                                y={line.y}
                                label={{
                                    value: line.label,
                                    fill: line.color,
                                    fontSize: 10,
                                    position: 'insideBottomRight',
                                    className: "font-semibold bg-background/50 px-1 rounded" // Note: className string might not be fully supported by SVG render, relying on fill/style
                                }}
                                stroke={line.color}
                                strokeDasharray="3 3"
                                strokeOpacity={0.8}
                                yAxisId={line.yAxisId || 'left'}
                            />
                        ))}

                        {/* Data Series */}
                        {series.map((s) => {
                            if (s.type === 'area') {
                                return (
                                    <Area
                                        key={s.dataKey}
                                        yAxisId={s.yAxisId || 'left'}
                                        type="monotone"
                                        dataKey={s.dataKey}
                                        name={s.name}
                                        stroke={s.color}
                                        fill={`url(#gradient-${s.dataKey})`}
                                        strokeWidth={s.strokeWidth || 2}
                                        animationDuration={1000}
                                        activeDot={{ r: 6, strokeWidth: 0, fill: s.color }}
                                    />
                                );
                            }
                            // Default to Line
                            return (
                                <Line
                                    key={s.dataKey}
                                    yAxisId={s.yAxisId || 'left'}
                                    type="monotone"
                                    dataKey={s.dataKey}
                                    name={s.name}
                                    stroke={s.color}
                                    strokeWidth={s.strokeWidth || 2}
                                    dot={false}
                                    activeDot={{ r: 6, strokeWidth: 0, fill: s.color }}
                                    animationDuration={1000}
                                />
                            );
                        })}

                        {showBrush && (
                            <Brush
                                dataKey="timestamp"
                                height={24}
                                stroke="transparent"
                                fill="#27272a" // zinc-800
                                tickFormatter={() => ''}
                                travellerWidth={10}
                                gap={5}
                            />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </GlassCard>
    );
};
