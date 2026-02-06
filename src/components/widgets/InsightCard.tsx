import React from 'react';
import { AlertTriangle, TrendingUp, Info, ArrowRight, Zap } from 'lucide-react';

export type InsightSeverity = 'critical' | 'high' | 'medium' | 'low';
export type InsightCategory = 'regime' | 'risk' | 'opportunity' | 'macro';

export interface Insight {
    id: string;
    title: string;
    description: string;
    severity: InsightSeverity;
    category: InsightCategory;
    score: number;
    related_slug?: string;
    date: string;
}

interface InsightCardProps {
    insight: Insight;
    onClick?: () => void;
}

const severityConfig = {
    critical: {
        color: 'text-red-500',
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        icon: AlertTriangle,
        label: 'Critical Alert'
    },
    high: {
        color: 'text-orange-500',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/20',
        icon: Zap,
        label: 'High Priority'
    },
    medium: {
        color: 'text-yellow-500',
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/20',
        icon: TrendingUp,
        label: 'Notable'
    },
    low: {
        color: 'text-blue-500',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/20',
        icon: Info,
        label: 'Info'
    }
};

export const InsightCard: React.FC<InsightCardProps> = ({ insight, onClick }) => {
    const config = severityConfig[insight.severity] || severityConfig.low;
    const Icon = config.icon;

    return (
        <div
            className={`
                relative p-4 rounded-xl border ${config.border} ${config.bg} 
                hover:bg-opacity-20 transition-all cursor-pointer group
                flex flex-col gap-2 backdrop-blur-sm
            `}
            onClick={onClick}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    <span className={`text-xs font-semibold ${config.color} uppercase tracking-wider`}>
                        {config.label}
                    </span>
                </div>
                <span className="text-[10px] text-gray-400 font-mono">
                    {insight.date}
                </span>
            </div>

            <h3 className="font-bold text-gray-100 text-sm leading-tight group-hover:text-white transition-colors">
                {insight.title}
            </h3>

            <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
                {insight.description}
            </p>

            {insight.related_slug && (
                <div className="mt-2 flex items-center text-[10px] text-gray-500 group-hover:text-primary transition-colors gap-1">
                    See Chart <ArrowRight className="w-3 h-3" />
                </div>
            )}
        </div>
    );
};
