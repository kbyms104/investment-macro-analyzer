import React from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    className?: string;
    hoverEffect?: boolean;
    noPadding?: boolean;
}

export function GlassCard({ children, className = "", hoverEffect = false, noPadding = false, ...props }: GlassCardProps) {
    return (
        <div
            className={`glass-panel rounded-xl ${noPadding ? '' : 'p-6'} ${hoverEffect ? 'glass-panel-hover cursor-pointer' : ''} ${className}`}
            {...props}
        >
            {children}
        </div>
    );
}
