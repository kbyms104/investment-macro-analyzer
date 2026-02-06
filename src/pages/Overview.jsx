import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';

// --- Styles & Components ---

const Card = ({ children, className = "" }) => (
    <div className={`bg-gray-800 bg-opacity-60 backdrop-filter backdrop-blur-lg border border-gray-700 rounded-xl p-6 shadow-xl ${className}`}>
        {children}
    </div>
);

const Badge = ({ label, type = "neutral" }) => {
    const colors = {
        risk_on: "bg-green-500/20 text-green-400 border-green-500/30",
        caution: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
        risk_off: "bg-red-500/20 text-red-400 border-red-500/30",
        neutral: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    };
    return (
        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${colors[type] || colors.neutral}`}>
            {label}
        </span>
    );
};

const Gauge = ({ score }) => {
    // Score: 0 (Safe) -> 100 (Risk)
    // We want to map this to rotation: -90deg (Safe) -> 90deg (Risk)
    const rotation = (score / 100) * 180 - 90;

    let color = "#22c55e"; // Green
    if (score > 30) color = "#eab308"; // Yellow
    if (score > 60) color = "#ef4444"; // Red

    return (
        <div className="relative w-64 h-32 overflow-hidden mx-auto mb-6">
            {/* Background Arc */}
            <div className="absolute w-64 h-64 rounded-full border-[20px] border-gray-700 top-0 left-0 box-border"></div>

            {/* Needle Container (Rotates) */}
            <motion.div
                className="absolute w-full h-full flex justify-center items-end origin-bottom"
                initial={{ rotate: -90 }}
                animate={{ rotate: rotation }}
                transition={{ type: "spring", stiffness: 60, damping: 15 }}
                style={{ transformOrigin: "50% 100%" }}
            >
                {/* Needle */}
                <div className="w-1 h-32 bg-white rounded-t-full relative z-10" style={{ backgroundColor: color }}></div>
                {/* Center Cap */}
                <div className="absolute w-4 h-4 bg-white rounded-full bottom-0 z-20 shadow-lg"></div>
            </motion.div>

            {/* Labels */}
            <div className="absolute bottom-2 left-4 text-xs text-green-500 font-bold">SAFE</div>
            <div className="absolute bottom-2 right-4 text-xs text-red-500 font-bold">RISK</div>
        </div>
    );
};

const Overview = () => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchMarketStatus();
    }, []);

    const fetchMarketStatus = async () => {
        try {
            setLoading(true);
            const res = await invoke('calculate_market_status');
            console.log("Market Status:", res);
            setStatus(res);
            setError(null);
        } catch (err) {
            console.error("Failed to fetch market status:", err);
            setError(err.toString());
        } finally {
            setLoading(false);
        }
    };

    const getStatusType = (label) => {
        if (label.includes("Risk On")) return "risk_on";
        if (label.includes("Caution")) return "caution";
        if (label.includes("Risk Off")) return "risk_off";
        return "neutral";
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center text-gray-400 animate-pulse">
                <div className="text-center">
                    <div className="text-2xl mb-2">🔍 Analyzing Markets...</div>
                    <div className="text-sm">Crunching Macro Data</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-center md:w-1/2">
                    <div className="text-red-500 text-6xl mb-4">⚠️</div>
                    <h2 className="text-xl font-bold text-white mb-2">Analysis Failed</h2>
                    <p className="text-gray-400 mb-6">{error}</p>
                    <button
                        onClick={fetchMarketStatus}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-colors"
                    >
                        Retry Analysis
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 h-full overflow-y-auto custom-scrollbar">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex justify-between items-end border-b border-gray-700 pb-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-1">Market Dashboard</h1>
                        <p className="text-gray-400 text-sm">Real-time macro risk analysis</p>
                    </div>
                    <button
                        onClick={fetchMarketStatus}
                        className="text-gray-500 hover:text-white transition-colors"
                        title="Refresh Analysis"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                {/* Hero Section: Market Status */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Main Gauge Card */}
                    <Card className="md:col-span-2 flex flex-col items-center justify-center text-center relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 opacity-50"></div>

                        <h2 className="text-gray-400 uppercase tracking-widest text-xs font-bold mb-8">Current Market Regime</h2>

                        <Gauge score={status.risk_score} />

                        <div className="mt-4">
                            <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">
                                {status.status_label}
                            </h1>
                            <p className="text-gray-400 font-medium max-w-md mx-auto">
                                {status.summary}
                            </p>
                        </div>
                    </Card>

                    {/* Key Stats / Quick View */}
                    <Card className="flex flex-col justify-center space-y-6">
                        <div className="text-center">
                            <div className="text-5xl font-black text-white mb-1">{status.risk_score}</div>
                            <div className="text-gray-500 text-xs uppercase font-bold">Total Risk Score</div>
                        </div>

                        <div className="space-y-3 pt-6 border-t border-gray-700">
                            {status.drivers.slice(0, 3).map((driver, i) => (
                                <div key={i} className="flex justify-between items-center text-sm">
                                    <span className="text-gray-300">{driver.name}</span>
                                    <span className={`font-mono font-bold ${driver.contribution > 0 ? "text-red-400" : "text-green-400"}`}>
                                        {driver.contribution > 0 ? `+${driver.contribution}` : "OK"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

                {/* Driving Factors Grid */}
                <div>
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <span className="text-blue-500">◆</span> Key Risk Drivers
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {status.drivers.map((driver, idx) => (
                            <Card key={idx} className="hover:bg-gray-700/50 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-gray-200">{driver.name}</h4>
                                    <Badge
                                        label={driver.signal}
                                        type={driver.contribution >= 30 ? "risk_off" : driver.contribution > 0 ? "caution" : "risk_on"}
                                    />
                                </div>
                                <div className="flex items-end gap-2 mt-4">
                                    <span className="text-2xl font-mono text-white">
                                        {typeof driver.value === 'number' ? driver.value.toFixed(2) : driver.value}
                                    </span>
                                    <span className="text-xs text-gray-500 mb-1">current value</span>
                                </div>
                                {driver.contribution > 0 && (
                                    <div className="mt-3 text-xs text-red-400 flex items-center gap-1">
                                        ⚠️ Adds +{driver.contribution} to risk score
                                    </div>
                                )}
                            </Card>
                        ))}
                    </div>
                </div>

                {/* AI Insight Placeholder */}
                <Card className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border-blue-500/20">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-blue-500/10 rounded-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white mb-1">AI Analyst Insight</h3>
                            <p className="text-gray-300 leading-relaxed">
                                The macro environment is currently showing mixed signals. While liquidity remains supportive, the steep inversion of the yield curve suggests caution. The "Risk On" signal is fragile; consider hedging if VIX rises above 20.
                            </p>
                            <div className="mt-4 flex gap-2">
                                <button className="px-3 py-1 bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 text-xs rounded border border-blue-500/30 transition-colors">
                                    Generate Deep Dive Report
                                </button>
                            </div>
                        </div>
                    </div>
                </Card>

            </div>
        </div>
    );
};

export default Overview;
