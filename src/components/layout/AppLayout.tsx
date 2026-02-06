import React from 'react';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
    children: React.ReactNode;
    activeTab: string;
    onTabChange: (tab: string) => void;
}

export function AppLayout({ children, activeTab, onTabChange }: AppLayoutProps) {
    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30 overflow-hidden transition-colors duration-300">
            {/* Background Gradients - Dark mode only or subtle in light */}
            <div className="fixed inset-0 z-0 pointer-events-none opacity-30 dark:opacity-100 transition-opacity duration-500">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 dark:bg-white/5 blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-secondary/10 dark:bg-zinc-800/20 blur-[120px]"></div>
            </div>

            <Sidebar activeTab={activeTab} onTabChange={onTabChange} />

            <main className="ml-64 h-screen overflow-y-auto relative z-10 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                <div className="max-w-7xl mx-auto p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
