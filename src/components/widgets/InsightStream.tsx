import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Insight, InsightCard } from './InsightCard';
import { Sparkles, RefreshCcw } from 'lucide-react';

export const InsightStream: React.FC = () => {
    const [insights, setInsights] = useState<Insight[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchInsights = async () => {
        setLoading(true);
        try {
            const data = await invoke<Insight[]>('get_market_insights');
            setInsights(data);
        } catch (error) {
            console.error("Failed to fetch insights:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInsights();
    }, []);

    if (loading && insights.length === 0) {
        return <div className="p-4 text-center text-gray-500 text-xs animate-pulse">Analyzing Market Data...</div>;
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <h2 className="text-sm font-bold text-gray-200">AI Analyst Insights</h2>
                </div>
                <button
                    onClick={fetchInsights}
                    disabled={loading}
                    className="p-1 hover:bg-white/10 rounded-md transition-colors disabled:opacity-50"
                >
                    <RefreshCcw className={`w-3 h-3 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="overflow-y-auto space-y-3 pr-1 pb-4 custom-scrollbar" style={{ maxHeight: '600px' }}>
                {insights.map((insight) => (
                    <InsightCard
                        key={insight.id}
                        insight={insight}
                        onClick={() => console.log("Clicked", insight.id)}
                    />
                ))}

                {insights.length === 0 && (
                    <div className="text-center py-8 text-gray-500 text-xs">
                        No critical insights detected at this moment.
                    </div>
                )}
            </div>
        </div>
    );
};
