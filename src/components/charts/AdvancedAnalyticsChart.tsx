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
import { GlassTooltip } from '../ui/GlassTooltip';
import { formatValueByUnit, formatLargeNumber, UnitType } from '../../utils/format';

export interface ChartSeries {
    name: string;
    dataKey: string;
    color: string;
    type?: 'line' | 'area' | 'bar';
    yAxisId?: 'left' | 'right';
    strokeWidth?: number;
    fillOpacity?: number;
    unit?: UnitType;
}

export interface AdvancedAnalyticsChartProps {
    title: string;
    data: any[];
    series: ChartSeries[];
    height?: number | string;
    showBrush?: boolean;
    referenceLines?: { y: number; label: string; color: string; yAxisId?: string }[];
    className?: string;
    isLoading?: boolean;
    maxDate?: string; // Format: YYYY-MM-DD
}

export const AdvancedAnalyticsChart = ({
    title,
    data,
    series,
    height = 450,
    showBrush = false,
    referenceLines = [],
    className,
    isLoading = false,
    maxDate
}: AdvancedAnalyticsChartProps) => {

    // Filter data if maxDate is provided (Time Travel)
    const filteredData = useMemo(() => {
        if (!maxDate) return data;
        const target = new Date(maxDate).getTime();
        return data.filter(d => new Date(d.timestamp).getTime() <= target);
    }, [data, maxDate]);

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

            {isLoading && (
                <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-20 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                        <span className="text-xs text-muted-foreground font-mono">Loading data...</span>
                    </div>
                </div>
            )}

            <div className="flex-1 min-h-0 w-full relative mt-2">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                        data={filteredData}
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
                            tickFormatter={(str) => {
                                try {
                                    return format(new Date(str), 'MMM yy');
                                } catch (e) {
                                    return '';
                                }
                            }}
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
                            tickFormatter={(val) => {
                                const leftSeries = series.find(s => !s.yAxisId || s.yAxisId === 'left');
                                if (leftSeries?.unit === 'KrwPrice') return formatLargeNumber(val, '₩');
                                if (leftSeries?.unit === 'UsdPrice') return formatLargeNumber(val, '$');
                                return leftSeries?.unit ? formatValueByUnit(val, leftSeries.unit) : formatLargeNumber(val);
                            }}
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
                                tickFormatter={(val) => {
                                    const rightSeries = series.find(s => s.yAxisId === 'right');
                                    return rightSeries?.unit ? formatValueByUnit(val, rightSeries.unit) : val.toLocaleString();
                                }}
                            />
                        )}

                        <Tooltip content={<GlassTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }} />

                        {referenceLines.map((line) => (
                            <ReferenceLine
                                key={line.label}
                                y={line.y}
                                label={{
                                    value: line.label,
                                    fill: line.color,
                                    fontSize: 10,
                                    position: 'insideBottomRight',
                                    fillOpacity: 0.8,
                                }}
                                stroke={line.color}
                                strokeDasharray="3 3"
                                strokeOpacity={0.8}
                                yAxisId={line.yAxisId || 'left'}
                            />
                        ))}

                        {/* Data Series */}
                        {series.map((s) => {
                            // Smart Dot Logic: Show dots if data is sparse (< 20 points)
                            const showDots = filteredData.length < 20 || filteredData.length === 1;
                            const dotProps = showDots ? { r: 4, strokeWidth: 0, fill: s.color } : false;

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
                                        dot={dotProps as any}
                                        unit={s.unit as any}
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
                                    dot={dotProps as any}
                                    activeDot={{ r: 6, strokeWidth: 0, fill: s.color }}
                                    animationDuration={1000}
                                    unit={s.unit as any}
                                    connectNulls={true}
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
