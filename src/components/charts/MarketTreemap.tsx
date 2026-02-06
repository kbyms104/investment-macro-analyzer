import { useMemo, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ResponsiveTreeMap } from '@nivo/treemap';

interface MapItem {
    name: string;
    slug: string;
    value: number;
    normalizedScore: number; // 0-100 (Risk Score)
    category: string;
    description?: string;
}

interface MarketTreemapProps {
    items: MapItem[];
    onItemClick?: (slug: string) => void;
}

interface TooltipState {
    visible: boolean;
    x: number;
    y: number;
    data: any | null;
}

// Color logic shared with other charts
const getColor = (score: number) => {
    if (score >= 80) return "#be123c"; // rose-700
    if (score >= 60) return "#c2410c"; // orange-700
    if (score >= 40) return "#1e293b"; // slate-800
    if (score >= 20) return "#047857"; // emerald-700
    return "#065f46"; // emerald-800
};

// Smart Tooltip Component - Renders via Portal with boundary detection
const SmartTooltip = ({ tooltip }: { tooltip: TooltipState }) => {
    const [position, setPosition] = useState({ left: 0, top: 0 });
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!tooltip.visible || !tooltip.data) return;

        // Tooltip dimensions (approximate)
        const tooltipWidth = 220;
        const tooltipHeight = 140;
        const margin = 12;
        const cursorOffset = 16;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let left = tooltip.x + cursorOffset;
        let top = tooltip.y + cursorOffset;

        // Flip horizontally if near right edge
        if (left + tooltipWidth > viewportWidth - margin) {
            left = tooltip.x - tooltipWidth - cursorOffset;
        }

        // Flip vertically if near bottom edge
        if (top + tooltipHeight > viewportHeight - margin) {
            top = tooltip.y - tooltipHeight - cursorOffset;
        }

        // Clamp to viewport (safety)
        left = Math.max(margin, Math.min(left, viewportWidth - tooltipWidth - margin));
        top = Math.max(margin, Math.min(top, viewportHeight - tooltipHeight - margin));

        setPosition({ left, top });
    }, [tooltip.x, tooltip.y, tooltip.visible, tooltip.data]);

    if (!mounted || !tooltip.visible || !tooltip.data) return null;

    const data = tooltip.data;

    return createPortal(
        <div
            className="fixed z-[9999] pointer-events-none animate-in fade-in zoom-in-95 duration-150"
            style={{
                left: position.left,
                top: position.top,
            }}
        >
            <div className="bg-popover/95 border border-border text-popover-foreground px-3 py-2.5 rounded-lg shadow-2xl text-xs backdrop-blur-xl">
                <div className="font-bold mb-1.5 text-sm">{data.name}</div>
                <div className="flex justify-between gap-6 text-muted-foreground">
                    <span>Current Value:</span>
                    <span className="font-mono font-bold text-foreground">
                        {Number(data.originalValue).toLocaleString()}
                    </span>
                </div>
                <div className="flex justify-between gap-6 text-muted-foreground mt-1">
                    <span>Risk Score:</span>
                    <span className={`font-mono font-bold ${data.normalizedScore >= 60 ? "text-rose-500" : "text-emerald-500"}`}>
                        {data.normalizedScore}/100
                    </span>
                </div>
                {data.description && (
                    <div className="mt-2 pt-2 border-t border-border/50 text-[10px] opacity-70 max-w-[200px] leading-relaxed">
                        {data.description}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

// Tooltip Context - Shared between TreeMapWrapper and CustomNode
let globalTooltipHandler: {
    show: (x: number, y: number, data: any) => void;
    hide: () => void;
} | null = null;

// Custom Node Component for complete control over tile content
const CustomNode = ({ node, style, onClick }: any) => {
    // Helper to prevent NaN propagation
    const safeVal = (val: any) => {
        const num = Number(val);
        return isNaN(num) ? 0 : num;
    };

    // Robust Fallback: Nivo provides animated values in 'style', 
    // but we fallback to static 'node' values if animation isn't ready.
    const x = safeVal(style?.x ?? node.x ?? node.x0);
    const y = safeVal(style?.y ?? node.y ?? node.y0);
    const width = safeVal(style?.width ?? node.width ?? (node.x1 - node.x0));
    const height = safeVal(style?.height ?? node.height ?? (node.y1 - node.y0));
    const color = style?.color ?? node.color ?? ((node.data && node.data.normalizedScore !== undefined) ? getColor(node.data.normalizedScore) : '#333');

    const handleMouseEnter = (event: React.MouseEvent<SVGGElement>) => {
        if (!node.isParent && node.data && globalTooltipHandler) {
            globalTooltipHandler.show(event.clientX, event.clientY, node.data);
        }
    };

    const handleMouseMove = (event: React.MouseEvent<SVGGElement>) => {
        if (!node.isParent && node.data && globalTooltipHandler) {
            globalTooltipHandler.show(event.clientX, event.clientY, node.data);
        }
    };

    const handleMouseLeave = () => {
        if (globalTooltipHandler) {
            globalTooltipHandler.hide();
        }
    };

    // Only render leaf nodes (actual indicators)
    if (node.isParent) {
        return (
            <g
                transform={`translate(${x},${y})`}
                onMouseEnter={handleMouseEnter}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            >
                <rect
                    width={width}
                    height={height}
                    fill={node.color} // Parents often use computed color or just bg
                    stroke="#000"
                    strokeWidth={2}
                    strokeOpacity={0.2}
                />
                {/* Parent Label (Category) - only if large enough */}
                {width > 60 && height > 30 && (
                    <text
                        x={4}
                        y={14}
                        fill="rgba(255,255,255,0.4)"
                        fontSize={10}
                        fontWeight="bold"
                        style={{ pointerEvents: 'none', textTransform: 'uppercase' }}
                    >
                        {node.id}
                    </text>
                )}
            </g>
        )
    }

    return (
        <g
            transform={`translate(${x},${y})`}
            onMouseEnter={handleMouseEnter}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => onClick?.(node, e)}
            style={{ cursor: 'pointer' }}
        >
            <rect
                width={width}
                height={height}
                fill={color}
                stroke="#000"
                strokeWidth={1}
                strokeOpacity={0.1}
                className="hover:brightness-110 transition-all duration-200"
            />

            {/* Rich Content via ForeignObject */}
            <foreignObject width={width} height={height} style={{ overflow: 'hidden', pointerEvents: 'none' }}>
                <div className={`w-full h-full flex flex-col justify-between p-1.5 text-white ${width < 50 ? 'items-center justify-center p-0' : ''}`}>

                    {/* Header: Name */}
                    {width > 40 && height > 20 && (
                        <div className="font-bold leading-tight drop-shadow-md" style={{ fontSize: Math.min(11, width / 8) + 'px' }}>
                            <span className="line-clamp-2">{node.data.name}</span>
                        </div>
                    )}

                    {/* Footer: Value & Score */}
                    {width > 60 && height > 40 && (
                        <div className="flex items-end justify-between mt-auto w-full">
                            <span className="font-mono font-bold tracking-tighter drop-shadow-sm opacity-90" style={{ fontSize: '10px' }}>
                                {Number(node.data.originalValue).toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 })}
                            </span>
                            <span className={`font-bold text-[9px] px-1 rounded-sm bg-black/20 backdrop-blur-sm self-end`}>
                                {node.data.normalizedScore}
                            </span>
                        </div>
                    )}

                    {/* Fallback for tiny tiles */}
                    {width <= 40 && (
                        <span className="text-[8px] font-bold opacity-50">...</span>
                    )}
                </div>
            </foreignObject>
        </g>
    );
};

export function MarketTreemap({ items }: MarketTreemapProps) {
    // Custom tooltip state (replaces Nivo's tooltip)
    const [tooltip, setTooltip] = useState<TooltipState>({
        visible: false,
        x: 0,
        y: 0,
        data: null
    });

    // Memoized tooltip handlers
    const showTooltip = useCallback((x: number, y: number, data: any) => {
        setTooltip({ visible: true, x, y, data });
    }, []);

    const hideTooltip = useCallback(() => {
        setTooltip(prev => ({ ...prev, visible: false }));
    }, []);

    // Register global handler for CustomNode to use
    useEffect(() => {
        globalTooltipHandler = { show: showTooltip, hide: hideTooltip };
        return () => {
            globalTooltipHandler = null;
        };
    }, [showTooltip, hideTooltip]);

    // Transform flat items into Nivo Hierarchical Data
    const data = useMemo(() => {
        return {
            name: "Market",
            children: Array.from(new Set(items.map(i => i.category))).map(cat => ({
                name: cat,
                children: items
                    .filter(i => i.category === cat)
                    .map(i => ({
                        name: i.name,
                        value: Math.abs(i.normalizedScore - 50) + 20, // Size by extremity
                        originalValue: i.value,
                        normalizedScore: i.normalizedScore,
                        description: i.description,
                        category: i.category
                    }))
            }))
        };
    }, [items]);

    return (
        <div className="w-full h-full bg-muted/5 rounded-xl border border-border/20 overflow-hidden relative">
            <ResponsiveTreeMap
                data={data}
                identity="name"
                value="value"
                valueFormat=".02s"
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                label={() => ''} // Disable default label
                nodeComponent={CustomNode} // Use our custom component
                labelSkipSize={0}
                innerPadding={2}
                outerPadding={2}
                parentLabelTextColor={{
                    from: 'color',
                    modifiers: [['brighter', 2]]
                }}
                borderColor={{
                    from: 'color',
                    modifiers: [['darker', 0.1]]
                }}
                colors={(node: any) => {
                    // Node color based on Risk Score
                    if (node.data.normalizedScore !== undefined) {
                        return getColor(node.data.normalizedScore);
                    }
                    return "#1e293b"; // Fallback/Parent color
                }}
                nodeOpacity={1}
                borderWidth={2}
                enableParentLabel={true}
                motionConfig="stiff" // Fast animation to match data update speed
            />

            {/* Custom Smart Tooltip - Rendered via Portal */}
            <SmartTooltip tooltip={tooltip} />
        </div>
    );
}
