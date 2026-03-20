"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

interface ConfirmOptions {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
}

interface NotificationContextType {
    showToast: (message: string, type?: ToastType, duration?: number) => void;
    showConfirm: (options: ConfirmOptions) => void;
    showError: (message: string) => void;
    showSuccess: (message: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);

    const showToast = useCallback((message: string, type: ToastType = "info", duration = 3000) => {
        const id = Math.random().toString(36).substring(2, 9);
        const newToast: Toast = { id, message, type, duration };
        setToasts(prev => [...prev, newToast]);
        
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, duration);
    }, []);

    const showError = useCallback((message: string) => {
        showToast(message, "error", 5000);
    }, [showToast]);

    const showSuccess = useCallback((message: string) => {
        showToast(message, "success", 3000);
    }, [showToast]);

    const showConfirm = useCallback((options: ConfirmOptions) => {
        setConfirmState(options);
    }, []);

    const handleConfirm = () => {
        if (confirmState?.onConfirm) {
            confirmState.onConfirm();
        }
        setConfirmState(null);
    };

    const handleCancel = () => {
        if (confirmState?.onCancel) {
            confirmState.onCancel();
        }
        setConfirmState(null);
    };

    return (
        <NotificationContext.Provider value={{ showToast, showConfirm, showError, showSuccess }}>
            {children}
            
            {/* Toast Container */}
            <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-right fade-in duration-300 ${
                            toast.type === "success" 
                                ? "bg-emerald-500 text-white" 
                                : toast.type === "error"
                                    ? "bg-red-500 text-white"
                                    : toast.type === "warning"
                                        ? "bg-amber-500 text-white"
                                        : "bg-slate-700 text-white"
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            {toast.type === "success" && (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M20 6 9 17l-5-5" />
                                </svg>
                            )}
                            {toast.type === "error" && (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="m15 9-6 6" />
                                    <path d="m9 9 6 6" />
                                </svg>
                            )}
                            {toast.type === "warning" && (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                                    <path d="M12 9v4" />
                                    <path d="M12 17h.01" />
                                </svg>
                            )}
                            {toast.type === "info" && (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 16v-4" />
                                    <path d="M12 8h.01" />
                                </svg>
                            )}
                            <span>{toast.message}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Confirm Modal */}
            {confirmState && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            {confirmState.title && (
                                <h3 className="text-lg font-semibold text-slate-800 mb-2">{confirmState.title}</h3>
                            )}
                            <p className="text-slate-600 text-sm">{confirmState.message}</p>
                        </div>
                        <div className="px-6 py-4 bg-slate-50 rounded-b-xl flex justify-end gap-3">
                            <button
                                onClick={handleCancel}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                {confirmState.cancelText || "取消"}
                            </button>
                            <button
                                onClick={handleConfirm}
                                className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors"
                            >
                                {confirmState.confirmText || "确定"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </NotificationContext.Provider>
    );
}

export function useNotification() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error("useNotification must be used within a NotificationProvider");
    }
    return context;
}