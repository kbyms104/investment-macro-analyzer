import { useState } from "react";
import { X, Globe, Moon, Sun, Info, ExternalLink, Code2, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../theme-provider";

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Tab = "general" | "about";

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const { t, i18n } = useTranslation();
    const { theme, setTheme } = useTheme();
    const [activeTab, setActiveTab] = useState<Tab>("general");

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-2xl bg-background border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        Settings
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex h-[500px]">
                    {/* Sidebar Tabs */}
                    <div className="w-48 border-r border-border bg-muted/10 p-2 space-y-1">
                        <TabButton
                            active={activeTab === "general"}
                            onClick={() => setActiveTab("general")}
                            icon={<Globe size={18} />}
                            label="General"
                        />
                        <TabButton
                            active={activeTab === "about"}
                            onClick={() => setActiveTab("about")}
                            icon={<Info size={18} />}
                            label="About & Licenses"
                        />
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-6 overflow-y-auto">
                        {activeTab === "general" && (
                            <div className="space-y-6">
                                {/* Language */}
                                <section className="space-y-3">
                                    <h3 className="text-sm font-bold uppercase text-muted-foreground tracking-wider">Language</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => i18n.changeLanguage('en')}
                                            className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${i18n.language === 'en'
                                                ? 'bg-primary/10 border-primary text-primary font-bold'
                                                : 'border-border hover:bg-muted'
                                                }`}
                                        >
                                            <Globe size={16} />
                                            English
                                        </button>
                                        <button
                                            onClick={() => i18n.changeLanguage('ko')}
                                            className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${i18n.language === 'ko'
                                                ? 'bg-primary/10 border-primary text-primary font-bold'
                                                : 'border-border hover:bg-muted'
                                                }`}
                                        >
                                            <Globe size={16} />
                                            한국어
                                        </button>
                                    </div>
                                </section>

                                {/* Theme */}
                                <section className="space-y-3">
                                    <h3 className="text-sm font-bold uppercase text-muted-foreground tracking-wider">Appearance</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => setTheme('light')}
                                            className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${theme === 'light'
                                                ? 'bg-primary/10 border-primary text-primary font-bold'
                                                : 'border-border hover:bg-muted'
                                                }`}
                                        >
                                            <Sun size={16} />
                                            Light
                                        </button>
                                        <button
                                            onClick={() => setTheme('dark')}
                                            className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${theme === 'dark'
                                                ? 'bg-primary/10 border-primary text-primary font-bold'
                                                : 'border-border hover:bg-muted'
                                                }`}
                                        >
                                            <Moon size={16} />
                                            Dark
                                        </button>
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === "about" && (
                            <div className="space-y-6">
                                {/* App Info */}
                                <div className="text-center py-4 border-b border-border">
                                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                        <Code2 size={32} className="text-primary" />
                                    </div>
                                    <h3 className="text-xl font-bold">Investment Analyzer</h3>
                                    <p className="text-sm text-muted-foreground">Version 0.1.0 (Beta)</p>
                                    <p className="text-xs text-muted-foreground mt-1">Built with Rust & React</p>
                                </div>

                                {/* Open Source Licenses */}
                                <div className="space-y-3">
                                    <h4 className="text-sm font-bold flex items-center gap-2">
                                        <ShieldCheck size={16} className="text-emerald-500" />
                                        Open Source Attribution
                                    </h4>
                                    <div className="space-y-2">
                                        <LicenseItem
                                            name="React"
                                            license="MIT"
                                            url="https://react.dev/"
                                            description="A JavaScript library for building user interfaces"
                                        />
                                        <LicenseItem
                                            name="Tauri"
                                            license="MIT / Apache 2.0"
                                            url="https://tauri.app/"
                                            description="Build smaller, faster, and more secure desktop applications"
                                        />
                                        <LicenseItem
                                            name="Lightweight Charts"
                                            license="Apache 2.0"
                                            url="https://github.com/tradingview/lightweight-charts"
                                            description="High-performance financial charts by TradingView"
                                        />
                                        <LicenseItem
                                            name="Recharts"
                                            license="MIT"
                                            url="https://recharts.org/"
                                            description="Redefined chart library built with React and D3"
                                        />
                                        <LicenseItem
                                            name="Lucide React"
                                            license="ISC"
                                            url="https://lucide.dev/"
                                            description="Beautiful & consistent icons"
                                        />

                                    </div>
                                </div>


                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${active
                ? "bg-background shadow-sm text-foreground border border-border/50"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
        >
            {icon}
            {label}
        </button>
    );
}

function LicenseItem({ name, license, url, description }: { name: string, license: string, url: string, description: string }) {
    return (
        <div className="p-3 rounded-lg border border-border bg-background/50 hover:bg-background transition-colors">
            <div className="flex justify-between items-start mb-1">
                <h5 className="font-bold text-sm">{name}</h5>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{license}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{description}</p>
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-1">
                View Project <ExternalLink size={10} />
            </a>
        </div>
    );
}
