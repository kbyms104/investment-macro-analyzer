import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, TrendingDown, Calendar, DollarSign, BarChart3 } from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    ReferenceLine
} from 'recharts';

interface EarningsHistoryEvent {
    date: string;
    eps_estimate: number | null;
    eps_actual: number | null;
    quarter: number;
    year: number;
}

interface EarningsDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    symbol: string;
    history: EarningsHistoryEvent[];
    loading: boolean;
}

export function EarningsDetailModal({ isOpen, onClose, symbol, history, loading }: EarningsDetailModalProps) {
    if (!isOpen) return null;

    // Smart Toggle: Detect if all estimates are missing
    const hasConsensus = history.some(item => item.eps_estimate !== null);

    // Prepare data for chart
    const chartData = [...history].reverse().map(item => ({
        name: `Q${item.quarter} ${item.year % 100}`,
        actual: item.eps_actual,
        estimate: hasConsensus ? item.eps_estimate : null,
        surprise: item.eps_actual && item.eps_estimate ?
            ((item.eps_actual - item.eps_estimate) / Math.abs(item.eps_estimate) * 100).toFixed(1) : 0
    }));

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="w-full max-w-2xl bg-background border border-border/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-border/50 flex items-center justify-between bg-muted/30">
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                                <BarChart3 className="text-primary" />
                                {symbol} <span className="text-muted-foreground font-normal text-lg">Earnings History</span>
                            </h2>
                            <p className="text-sm text-muted-foreground">Historical EPS Performance (Last 4 Quarters)</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-muted rounded-full transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-8">
                        {loading ? (
                            <div className="h-64 flex flex-col items-center justify-center space-y-4">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                                <p className="text-muted-foreground animate-pulse">Fetching financial history...</p>
                            </div>
                        ) : history.length === 0 ? (
                            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                                <p>No historical earnings data found for this symbol.</p>
                            </div>
                        ) : (
                            <>
                                {/* Chart Section */}
                                <div className="h-64 w-full bg-muted/20 rounded-xl p-4 border border-border/30">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                            <XAxis
                                                dataKey="name"
                                                stroke="#888"
                                                fontSize={12}
                                                tickLine={false}
                                                axisLine={false}
                                            />
                                            <YAxis
                                                stroke="#888"
                                                fontSize={12}
                                                tickLine={false}
                                                axisLine={false}
                                                tickFormatter={(value) => `$${value}`}
                                            />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' }}
                                                itemStyle={{ fontSize: '12px' }}
                                            />
                                            <ReferenceLine y={0} stroke="#666" />
                                            {hasConsensus && <Bar dataKey="estimate" fill="#444" radius={[4, 4, 0, 0]} name="Estimate" />}
                                            <Bar dataKey="actual" radius={[4, 4, 0, 0]} name="Actual">
                                                {chartData.map((entry, index) => {
                                                    const isBeat = hasConsensus && entry.actual !== null && entry.estimate !== null && entry.actual >= entry.estimate;
                                                    const barColor = hasConsensus
                                                        ? (isBeat ? '#10b981' : '#f43f5e')
                                                        : '#3b82f6'; // Professional blue if no consensus
                                                    return (
                                                        <Cell
                                                            key={`cell-${index}`}
                                                            fill={barColor}
                                                        />
                                                    );
                                                })}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Table Section */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                        <Calendar size={14} /> Quarterly Details
                                    </h3>
                                    <div className="overflow-hidden border border-border/50 rounded-xl">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-muted/50 text-xs font-bold uppercase text-muted-foreground">
                                                    <th className="p-3">Quarter</th>
                                                    <th className="p-3">Date</th>
                                                    {hasConsensus && <th className="p-3">Estimate</th>}
                                                    <th className="p-3">Actual</th>
                                                    {hasConsensus && <th className="p-3">Surprise</th>}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/30">
                                                {history.map((item, idx) => {
                                                    const surprise = item.eps_actual !== null && item.eps_estimate !== null && item.eps_estimate !== 0
                                                        ? ((item.eps_actual - item.eps_estimate) / Math.abs(item.eps_estimate) * 100).toFixed(1)
                                                        : null;
                                                    const isBeat = surprise !== null && parseFloat(surprise) >= 0;

                                                    return (
                                                        <tr key={idx} className="hover:bg-muted/20 transition-colors text-sm">
                                                            <td className="p-3 font-mono">Q{item.quarter} {item.year}</td>
                                                            <td className="p-3 text-muted-foreground">{item.date}</td>
                                                            {hasConsensus && (
                                                                <td className="p-3 font-mono">${item.eps_estimate?.toFixed(3) ?? '--'}</td>
                                                            )}
                                                            <td className="p-3 font-mono font-bold">
                                                                {item.eps_actual !== null ? `$${item.eps_actual.toFixed(3)}` : 'N/A'}
                                                            </td>
                                                            {hasConsensus && (
                                                                <td className="p-3">
                                                                    {surprise !== null ? (
                                                                        <span className={`flex items-center gap-1 font-bold ${isBeat ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                                            {isBeat ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                                            {surprise}%
                                                                        </span>
                                                                    ) : '--'}
                                                                </td>
                                                            )}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 bg-muted/10 border-t border-border/50 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest flex items-center justify-center gap-2">
                            <DollarSign size={10} /> Data provided by Finnhub API • Cached locally
                        </p>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
