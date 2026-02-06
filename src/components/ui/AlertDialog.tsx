import React from 'react';
import { GlassCard } from "./GlassCard";
import { AlertTriangle, Info, CheckCircle, XCircle } from "lucide-react";

interface AlertDialogProps {
    isOpen: boolean;
    title: string;
    description: string;
    variant?: "info" | "danger" | "success" | "warning";
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export function AlertDialog({
    isOpen,
    title,
    description,
    variant = "info",
    confirmText = "Confirm",
    cancelText = "Cancel",
    onConfirm,
    onCancel
}: AlertDialogProps) {
    if (!isOpen) return null;

    const getIcon = () => {
        switch (variant) {
            case "danger": return <AlertTriangle className="text-rose-500" size={24} />;
            case "warning": return <AlertTriangle className="text-amber-500" size={24} />;
            case "success": return <CheckCircle className="text-emerald-500" size={24} />;
            default: return <Info className="text-blue-500" size={24} />;
        }
    };

    const getButtonColor = () => {
        switch (variant) {
            case "danger": return "bg-rose-500 hover:bg-rose-600 border-rose-600";
            case "warning": return "bg-amber-500 hover:bg-amber-600 border-amber-600";
            case "success": return "bg-emerald-500 hover:bg-emerald-600 border-emerald-600";
            default: return "bg-primary hover:bg-primary/90 border-primary";
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-sm animate-in fade-in duration-200">
            <GlassCard className="w-full max-w-md p-6 shadow-2xl border-border/50 animate-in zoom-in-95 duration-200">
                <div className="flex gap-4">
                    <div className="shrink-0 pt-1">
                        {getIcon()}
                    </div>
                    <div className="flex-1 space-y-2">
                        <h3 className="text-lg font-bold leading-none tracking-tight">{title}</h3>
                        <p className="text-sm text-muted-foreground">{description}</p>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium transition-colors rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 text-sm font-bold text-white transition-all rounded-lg shadow-md border ${getButtonColor()}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </GlassCard>
        </div>
    );
}
