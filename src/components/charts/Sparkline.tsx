
interface SparklineProps {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
    strokeWidth?: number;
}

export function Sparkline({
    data,
    width = 100,
    height = 40,
    color = "#10b981",
    strokeWidth = 2
}: SparklineProps) {
    if (!data || data.length < 2) return null;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1; // Avoid division by zero

    // Normalize data points to fitting the SVG coordinate system
    // SVG coordinate system: (0,0) is top-left.
    // We want min value at bottom (y=height), max value at top (y=0)

    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const normalizedVal = (val - min) / range;
        const y = height - (normalizedVal * height);
        return `${x},${y}`;
    }).join(" ");

    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
}
