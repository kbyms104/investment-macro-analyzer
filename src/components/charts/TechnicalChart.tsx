import { createChart, ColorType, IChartApi, AreaSeries } from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import { GlassCard } from '../ui/GlassCard';

interface TechnicalChartProps {
    data: { time: string; value: number }[];
    title?: string;
    colors?: {
        backgroundColor?: string;
        lineColor?: string;
        textColor?: string;
        areaTopColor?: string;
        areaBottomColor?: string;
    };
}

export const TechnicalChart = (props: TechnicalChartProps) => {
    const {
        data,
        title,
        colors: {
            backgroundColor = 'transparent',
            lineColor = '#2962FF',
            textColor = 'white',
            areaTopColor = '#2962FF',
            areaBottomColor = 'rgba(41, 98, 255, 0.28)',
        } = {},
    } = props;

    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const handleResize = () => {
            chart.applyOptions({ width: chartContainerRef.current!.clientWidth });
        };

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: backgroundColor },
                textColor,
                attributionLogo: false,
            },
            width: chartContainerRef.current.clientWidth,
            height: 400,
            grid: {
                vertLines: { color: 'rgba(197, 203, 206, 0.1)' },
                horzLines: { color: 'rgba(197, 203, 206, 0.1)' },
            },
        });

        chart.timeScale().fitContent();

        const newSeries = chart.addSeries(AreaSeries, {
            lineColor: lineColor,
            topColor: areaTopColor,
            bottomColor: areaBottomColor,
        });

        newSeries.setData(data);

        window.addEventListener('resize', handleResize);
        chartRef.current = chart;

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [data, backgroundColor, lineColor, textColor, areaTopColor, areaBottomColor]);

    return (
        <GlassCard className="w-full h-full p-4 relative flex flex-col items-stretch">
            {title && <h3 className="text-sm font-medium text-muted-foreground mb-2 absolute top-6 left-6 z-10">{title}</h3>}
            <div ref={chartContainerRef} className="w-full h-[400px]" />
        </GlassCard>
    );
};
