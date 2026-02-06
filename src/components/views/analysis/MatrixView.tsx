import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw } from "lucide-react";

interface MatrixResult {
    labels: string[];
    slugs: string[];
    matrix: number[][];
    data_points: number;
}

interface MatrixViewProps {
    selectedAssets: string[];
    range: string;
    onCellClick?: (assetA: string, assetB: string) => void;
}

export function MatrixView({ selectedAssets, range, onCellClick }: MatrixViewProps) {
    const [result, setResult] = useState<MatrixResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (selectedAssets.length < 2) {
            setResult(null);
            return;
        }

        const fetchMatrix = async () => {
            setLoading(true);
            setError(null);
            try {
                // Convert range string to days (Option<i64> in Rust)
                let windowDays: number | null = 365;
                if (range === "1M") windowDays = 30;
                else if (range === "3M") windowDays = 90;
                else if (range === "1Y") windowDays = 365;
                else if (range === "3Y") windowDays = 1095;
                else if (range === "ALL") windowDays = null;

                // Call backend with correct arguments
                const res = await invoke<MatrixResult>("calculate_correlation_matrix", {
                    slugs: selectedAssets,
                    windowDays: windowDays
                });

                setResult(res);
            } catch (e) {
                setError(String(e));
                setResult(null);
            } finally {
                setLoading(false);
            }
        };

        fetchMatrix();
    }, [selectedAssets, range]);

    if (selectedAssets.length < 2) {
        return (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
                <p>Select at least 2 indicators to generate a correlation matrix.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="animate-spin text-primary" size={32} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-64 text-destructive">
                <p>Error: {error}</p>
            </div>
        );
    }

    if (!result) return null;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                    {result.data_points} overlapping data points
                </span>
                <div className="flex items-center gap-2 text-xs">
                    <span className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded" style={{ background: getCellColor(-1.0) }} />
                        -1.0
                    </span>
                    <span className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded" style={{ background: getCellColor(0) }} />
                        0.0
                    </span>
                    <span className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded" style={{ background: getCellColor(1.0) }} />
                        +1.0
                    </span>
                </div>
            </div>

            {/* Matrix Grid */}
            <div className="overflow-x-auto">
                <div
                    className="grid gap-0.5 min-w-max"
                    style={{
                        gridTemplateColumns: `80px repeat(${result.labels.length}, minmax(60px, 1fr))`
                    }}
                >
                    {/* Header Row */}
                    <div className="h-20" /> {/* Empty corner cell */}
                    {result.labels.map((label, i) => (
                        <div
                            key={`header-${i}`}
                            className="h-20 flex items-end justify-center pb-2 text-xs font-medium text-muted-foreground"
                        >
                            <span className="truncate w-full text-center" title={label}>{label}</span>
                        </div>
                    ))}

                    {/* Data Rows */}
                    {result.matrix.map((row, i) => (
                        <React.Fragment key={`row-${i}`}>
                            {/* Row Label */}
                            <div
                                className="h-12 flex items-center justify-end px-2 text-xs font-medium text-muted-foreground"
                                title={result.labels[i]}
                            >
                                <span className="truncate w-full text-right">{result.labels[i]}</span>
                            </div>
                            {/* Cells */}
                            {row.map((value, j) => (
                                <div
                                    key={`cell-${i}-${j}`}
                                    onClick={() => {
                                        if (i !== j && onCellClick) {
                                            onCellClick(result.slugs[i], result.slugs[j]);
                                        }
                                    }}
                                    className={`h-12 flex items-center justify-center text-xs font-bold rounded transition-all ${i !== j ? 'cursor-pointer hover:ring-2 hover:ring-primary/50 hover:scale-105' : ''
                                        }`}
                                    style={{
                                        backgroundColor: getCellColor(value),
                                        // Text color: White for strong correlations (dark bg), Black for weak (light bg)
                                        color: Math.abs(value) > 0.5 ? 'white' : 'black'
                                    }}
                                    title={`${result.labels[i]} vs ${result.labels[j]}: ${value.toFixed(3)}`}
                                >
                                    {value.toFixed(2)}
                                </div>
                            ))}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Helper: Get cell background color based on correlation value
function getCellColor(value: number): string {
    // Clamp to [-1, 1]
    const clamped = Math.max(-1, Math.min(1, value));

    if (clamped >= 0) {
        // Positive: Gray → Blue
        const intensity = Math.round(clamped * 255);
        return `rgb(${255 - intensity}, ${255 - intensity * 0.4}, 255)`;
    } else {
        // Negative: Gray → Red
        const intensity = Math.round(Math.abs(clamped) * 255);
        return `rgb(255, ${255 - intensity * 0.6}, ${255 - intensity})`;
    }
}
