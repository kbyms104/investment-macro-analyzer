import { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Check, ShieldAlert, LockKeyhole, X } from 'lucide-react';

interface LegalConsentModalProps {
    onAgreed: () => void;
    variant?: 'consent' | 'review';
    onClose?: () => void;
    tosVersion?: string;
}

const DISCLAIMER_CONTENT = (
    <div className="space-y-6 text-gray-300 font-sans selection:bg-red-500/30">
        <div className="text-center border-b border-white/10 pb-6 mb-6">
            <h1 className="text-2xl font-bold text-white tracking-tight mb-2">TERMS OF USE & RISK DISCLOSURE</h1>
            <p className="text-sm text-gray-500 uppercase tracking-widest font-mono">Last Updated: February 9, 2026</p>
        </div>

        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-lg text-sm text-red-200 mb-8 max-w-2xl mx-auto">
            <p className="font-bold mb-1 text-center">⚠️ IMPORTANT NOTICE</p>
            <p className="text-center opacity-90">
                BY ACCESSING THIS SOFTWARE, YOU EXPRESSLY AGREE TO BE BOUND BY THE TERMS BELOW, INCLUDING THE <strong>CLASS ACTION WAIVER</strong> AND <strong>RISK DISCLOSURE</strong>.
            </p>
        </div>

        <div className="space-y-8">
            <section>
                <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                    <span className="text-gray-500 font-mono text-xs border border-white/20 rounded px-1.5 py-0.5">01</span>
                    NO INVESTMENT ADVICE
                </h3>
                <p className="text-sm leading-relaxed text-justify">
                    The Software is provided for <strong>informational and educational purposes only</strong>. The Software and its developers are NOT registered investment advisers, brokers, or financial analysts. Nothing provided through the Software constitutes a recommendation to buy, sell, or hold any security or financial instrument. You are solely responsible for your own investment decisions.
                </p>
            </section>

            <section>
                <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                    <span className="text-gray-500 font-mono text-xs border border-white/20 rounded px-1.5 py-0.5">02</span>
                    HIGH RISK WARNING
                </h3>
                <div className="text-sm leading-relaxed text-justify space-y-3">
                    <p>
                        Stock, Option, and Crypto trading involves <strong>substantial risk of loss</strong>. Technical analysis, fundamental indicators, and historical data do NOT guarantee future results.
                    </p>
                    <div className="pl-4 border-l-2 border-red-500/30 italic text-gray-400 text-xs">
                        <strong>CFTC RULE 4.41:</strong> HYPOTHETICAL OR SIMULATED PERFORMANCE RESULTS HAVE CERTAIN LIMITATIONS. UNLIKE AN ACTUAL PERFORMANCE RECORD, SIMULATED RESULTS DO NOT REPRESENT ACTUAL TRADING. ALSO, SINCE THE TRADES HAVE NOT BEEN EXECUTED, THE RESULTS MAY HAVE UNDER-OR-OVER COMPENSATED FOR THE IMPACT, IF ANY, OF CERTAIN MARKET FACTORS, SUCH AS LACK OF LIQUIDITY.
                    </div>
                </div>
            </section>

            <section>
                <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                    <span className="text-gray-500 font-mono text-xs border border-white/20 rounded px-1.5 py-0.5">03</span>
                    DISCLAIMER OF WARRANTIES ("AS-IS")
                </h3>
                <p className="text-sm leading-relaxed text-justify uppercase text-xs tracking-wide text-gray-400">
                    THE SOFTWARE AND ALL DATA ARE PROVIDED <strong>"AS IS" WITHOUT WARRANTY OF ANY KIND</strong>. THE DEVELOPERS EXPRESSLY DISCLAIM ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO ACCURACY, TIMELINESS, COMPLETENESS, OR FITNESS FOR A PARTICULAR PURPOSE. DATA FEED ERRORS, LAGS, OR OMISSIONS MAY OCCUR.
                </p>
            </section>

            <section>
                <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                    <span className="text-gray-500 font-mono text-xs border border-white/20 rounded px-1.5 py-0.5">04</span>
                    LIMITATION OF LIABILITY
                </h3>
                <p className="text-sm leading-relaxed text-justify uppercase text-xs tracking-wide text-gray-400">
                    TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE DEVELOPER BE LIABLE FOR ANY DAMAGES WHATSOEVER (INCLUDING, WITHOUT LIMITATION, <strong>TRADING LOSSES, LOST PROFITS</strong>, OR ANY OTHER PECUNIARY LOSS) ARISING OUT OF THE USE OR INABILITY TO USE THIS SOFTWARE.
                </p>
            </section>

            <section>
                <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                    <span className="text-gray-500 font-mono text-xs border border-white/20 rounded px-1.5 py-0.5">05</span>
                    CLASS ACTION WAIVER
                </h3>
                <p className="text-sm leading-relaxed text-justify text-red-200 border border-red-500/20 bg-red-950/20 p-3 rounded">
                    <strong>BY USING THIS SOFTWARE, YOU AGREE THAT ANY DISPUTE RESOLUTION PROCEEDINGS WILL BE CONDUCTED ONLY ON AN INDIVIDUAL BASIS AND NOT IN A CLASS, CONSOLIDATED, OR REPRESENTATIVE ACTION.</strong> YOU EXPRESSLY WAIVE YOUR RIGHT TO PARTICIPATE AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS ACTION OR REPRESENTATIVE PROCEEDING.
                </p>
            </section>

            <section>
                <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                    <span className="text-gray-500 font-mono text-xs border border-white/20 rounded px-1.5 py-0.5">06</span>
                    DATA COMPLIANCE (BYOK)
                </h3>
                <p className="text-sm leading-relaxed text-justify">
                    The Software is a client-side visualization tool. Users are responsible for providing their own API keys (FRED, Finnhub, etc.) and complying with the third-party providers' Terms of Service. The Software does not re-distribute data to unauthorized parties.
                </p>
            </section>

            <section>
                <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                    <span className="text-gray-500 font-mono text-xs border border-white/20 rounded px-1.5 py-0.5">07</span>
                    GOVERNING LAW
                </h3>
                <p className="text-sm leading-relaxed text-justify">
                    These Terms shall be governed by and construed in accordance with the laws of the <strong>State of Delaware</strong>, without regard to its conflict of law provisions.
                </p>
            </section>
        </div>

        <div className="border-t border-white/10 pt-8 mt-8 text-center">
            <p className="text-xs text-gray-600 font-mono">END OF AGREEMENT</p>
        </div>
    </div>
);

export default function LegalConsentModal({ onAgreed, variant = 'consent', onClose, tosVersion = 'v2' }: LegalConsentModalProps) {
    const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
    const [checkTerms, setCheckTerms] = useState(false);
    const [checkAge, setCheckAge] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const contentRef = useRef<HTMLDivElement>(null);

    const handleScroll = () => {
        if (contentRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
            // Allow a small buffer (e.g. 50px) for rounding errors/ease of use
            if (scrollHeight - scrollTop - clientHeight < 50) {
                setHasScrolledToBottom(true);
            }
        }
    };

    const handleAggregate = async () => {
        try {
            setIsSubmitting(true);
            await invoke('accept_tos', { version: tosVersion });
            onAgreed();
        } catch (error) {
            console.error('Failed to accept TOS:', error);
            alert('Failed to save consent. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const isAgreed = hasScrolledToBottom && checkTerms && checkAge;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="w-full max-w-3xl bg-[#0f1115] border border-red-500/30 rounded-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-300">

                {/* Header */}
                <div className="p-6 border-b border-white/10 bg-red-950/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-500/20 rounded-full text-red-400">
                            <ShieldAlert size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                {variant === 'review' ? 'Terms of Use (Review)' : 'Legal Agreement'}
                            </h2>
                            <p className="text-xs text-gray-400">
                                {variant === 'review' ? 'Read-only mode' : 'Please read carefully'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-xs font-mono text-red-400 bg-red-950/30 px-3 py-1 rounded border border-red-500/20">
                            <LockKeyhole size={12} />
                            SEC/CFTC COMPLIANT
                        </div>
                        {variant === 'review' && onClose && (
                            <button
                                onClick={onClose}
                                className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Scrollable Content */}
                <div
                    ref={contentRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto p-8 bg-[#0a0a0a]"
                >
                    {DISCLAIMER_CONTENT}
                    <div className="h-4"></div>
                </div>

                {/* Footer Actions (Review vs Consent) */}
                <div className="p-6 border-t border-white/10 bg-[#0f1115] space-y-4">

                    {variant === 'consent' ? (
                        <>
                            <div className="space-y-3">
                                <label className={`flex items-center gap-3 p-3 rounded border transition-colors cursor-pointer ${checkTerms ? 'border-emerald-500/50 bg-emerald-950/10' : 'border-white/10 hover:bg-white/5'
                                    }`}>
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${checkTerms ? 'bg-emerald-500 border-transparent text-black' : 'border-gray-500 bg-transparent'
                                        }`}>
                                        {checkTerms && <Check size={14} strokeWidth={3} />}
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="hidden"
                                        checked={checkTerms}
                                        onChange={() => setCheckTerms(!checkTerms)}
                                        disabled={!hasScrolledToBottom}
                                    />
                                    <span className={hasScrolledToBottom ? "text-gray-200" : "text-gray-500 select-none"}>
                                        I have read and agree to all the Terms, including the <strong>Class Action Waiver</strong>.
                                    </span>
                                    {!hasScrolledToBottom && <span className="text-xs text-red-400 ml-auto">(Scroll to bottom)</span>}
                                </label>

                                <label className={`flex items-center gap-3 p-3 rounded border transition-colors cursor-pointer ${checkAge ? 'border-emerald-500/50 bg-emerald-950/10' : 'border-white/10 hover:bg-white/5'
                                    }`}>
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${checkAge ? 'bg-emerald-500 border-transparent text-black' : 'border-gray-500 bg-transparent'
                                        }`}>
                                        {checkAge && <Check size={14} strokeWidth={3} />}
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="hidden"
                                        checked={checkAge}
                                        onChange={() => setCheckAge(!checkAge)}
                                        disabled={!hasScrolledToBottom}
                                    />
                                    <span className={hasScrolledToBottom ? "text-gray-200" : "text-gray-500 select-none"}>
                                        I understand that trading involves high risk and I am at least <strong>18 years of age</strong>.
                                    </span>
                                </label>
                            </div>

                            <button
                                onClick={handleAggregate}
                                disabled={!isAgreed || isSubmitting}
                                className={`w-full py-4 rounded font-bold text-lg tracking-wide transition-all ${isAgreed
                                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                                    : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                    }`}
                            >
                                {isSubmitting ? 'SAVING...' : 'I AGREE & PROCEED TO DASHBOARD'}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={onClose}
                            className="w-full py-3 rounded font-bold text-lg tracking-wide transition-all bg-gray-800 hover:bg-gray-700 text-white border border-white/10"
                        >
                            Close
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
