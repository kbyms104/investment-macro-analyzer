import React from 'react';

export const TooltipProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export const Tooltip = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="relative inline-block group">
            {children}
        </div>
    );
};

export const TooltipTrigger = ({ children }: { children: React.ReactNode, asChild?: boolean }) => {
    return <span className='cursor-help'>{children}</span>;
};

export const TooltipContent = ({ children, className }: { children: React.ReactNode, className?: string }) => {
    // Merge defaults with custom className (simple string concat)
    const defaultClasses = "absolute z-50 px-2 py-1 text-xs text-white bg-black rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bottom-full left-1/2 -translate-x-1/2 mb-1 pointer-events-none";
    const finalClass = className ? `${className} opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2` : defaultClasses;

    return (
        <div className={finalClass}>
            {children}
            {/* Arrow (Hidden if custom class is provided to avoid style conflict) */}
            {!className && <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black"></div>}
        </div>
    );
};
