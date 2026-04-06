import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    TouchableOpacity,
    Dimensions,
    Platform,
} from 'react-native';

// ==========================================
// Types
// ==========================================

export type ToastType = 'error' | 'success' | 'warning' | 'info';

interface Toast {
    id: string;
    type: ToastType;
    title: string;
    message: string;
    details?: string[]; // For Zod validation field errors
    duration?: number;
}

interface ToastContextValue {
    showToast: (toast: Omit<Toast, 'id'>) => void;
    showError: (error: any) => void;
    showSuccess: (message: string, title?: string) => void;
    showWarning: (message: string, title?: string) => void;
    showInfo: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// ==========================================
// Hook to use toast anywhere
// ==========================================

export function useToast(): ToastContextValue {
    const context = useContext(ToastContext);
    if (!context) {
        // Fallback for when used outside provider (e.g., API interceptor)
        return {
            showToast: () => {},
            showError: () => {},
            showSuccess: () => {},
            showWarning: () => {},
            showInfo: () => {},
        };
    }
    return context;
}

// Global reference for use outside React tree (API interceptor)
let globalToastRef: ToastContextValue | null = null;

export function getGlobalToast(): ToastContextValue | null {
    return globalToastRef;
}

// ==========================================
// Parse any API error into human-readable toast
// ==========================================

function parseApiError(error: any): Omit<Toast, 'id'> {
    // 1. Connection/Network errors (no response)
    if (!error.response) {
        if (error.message?.includes('Network Error')) {
            return {
                type: 'error',
                title: '🌐 Connection Failed',
                message: 'Unable to reach the server. Please check your internet connection or data usage.',
            };
        }
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            return {
                type: 'error',
                title: '⏱️ Request Timeout',
                message: 'The server took too long to respond. Please check your connection and try again.',
            };
        }
        return {
            type: 'error',
            title: '❌ Execution Error',
            message: error.message || 'A silent crash or unexpected local error occurred.',
        };
    }

    // 2. Server Response errors
    const { status, data } = error.response;
    
    // Extract server-provided error message with priority
    const serverError = data?.message || data?.error || data?.msg || 'Something went wrong on the server';
    
    // Extract validation details (e.g. from Zod/Express-Validator)
    let details: string[] | undefined = undefined;
    if (data?.details && Array.isArray(data.details)) {
        details = data.details.map((d: any) => 
            typeof d === 'string' ? d : `${d.field ? `${d.field}: ` : ''}${d.message || d.msg || 'Invalid value'}`
        );
    } else if (data?.errors && Array.isArray(data.errors)) {
        // Handle alternative 'errors' array format
        details = data.errors.map((d: any) => d.msg || d.message || JSON.stringify(d));
    }

    switch (status) {
        case 400:
            return {
                type: 'warning',
                title: '⚠️ Bad Request',
                message: serverError,
                details,
            };
        case 401:
            // Custom titles based on server response (e.g. Invalid credentials vs Token expired)
            const isLoginError = serverError === 'Invalid credentials';
            return {
                type: 'error',
                title: isLoginError ? '❌ Login Failed' : '🔒 Session Expired',
                message: isLoginError ? 'Please check your email and password and try again.' : (serverError || 'Your session has expired. Please log in again.'),
            };
        case 403:
            return {
                type: 'error',
                title: '🚫 Permission Denied',
                message: serverError || 'You do not have permission to perform this action.',
            };
        case 404:
            return {
                type: 'warning',
                title: '🔍 Resource Not Found',
                message: serverError || 'The requested item could not be found.',
            };
        case 409:
            return {
                type: 'warning',
                title: '⚡ Data Conflict',
                message: serverError || 'This action conflicts with existing data.',
            };
        case 413:
            return {
                type: 'warning',
                title: '📦 Payload Too Large',
                message: 'The data you are trying to send is too large for the server to process.',
            };
        case 422:
            return {
                type: 'warning',
                title: '📝 Validation Error',
                message: serverError || 'The data provided is invalid.',
                details,
            };
        case 429:
            return {
                type: 'error',
                title: '🛑 Too Many Requests',
                message: 'You have been rate-limited. Please wait a few minutes before trying again.',
            };
        case 500:
            return {
                type: 'error',
                title: '💥 Internal Server Error',
                message: 'The server encountered an unexpected condition. Please try again later.',
            };
        case 502:
        case 503:
        case 504:
            return {
                type: 'error',
                title: '🛰️ Gateway/Proxy Error',
                message: 'The server is currently unavailable or being updated. Please try again shortly.',
            };
        default:
            return {
                type: 'error',
                title: `Error ${status}`,
                message: serverError,
                details,
            };
    }
}

// ==========================================
// Toast Colors
// ==========================================

const COLORS: Record<ToastType, { bg: string; border: string; text: string; subtext: string }> = {
    error: {
        bg: '#1a0a0a',
        border: '#ff4444',
        text: '#ff6b6b',
        subtext: '#ff9999',
    },
    success: {
        bg: '#0a1a0a',
        border: '#44ff44',
        text: '#6bff6b',
        subtext: '#99ff99',
    },
    warning: {
        bg: '#1a1a0a',
        border: '#ffaa44',
        text: '#ffcc6b',
        subtext: '#ffdd99',
    },
    info: {
        bg: '#0a0a1a',
        border: '#4488ff',
        text: '#6baaff',
        subtext: '#99ccff',
    },
};

// ==========================================
// Individual Toast Item Component
// ==========================================

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
    const slideAnim = useRef(new Animated.Value(-100)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const colors = COLORS[toast.type];

    React.useEffect(() => {
        // Slide in
        Animated.parallel([
            Animated.spring(slideAnim, {
                toValue: 0,
                tension: 80,
                friction: 12,
                useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start();

        // Auto-dismiss
        const duration = toast.duration || (toast.details ? 8000 : 4000);
        const timer = setTimeout(() => {
            dismissToast();
        }, duration);

        return () => clearTimeout(timer);
    }, []);

    const dismissToast = () => {
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: -100,
                duration: 250,
                useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start(() => onDismiss(toast.id));
    };

    return (
        <Animated.View
            style={[
                styles.toastContainer,
                {
                    backgroundColor: colors.bg,
                    borderLeftColor: colors.border,
                    transform: [{ translateY: slideAnim }],
                    opacity: opacityAnim,
                },
            ]}
        >
            <TouchableOpacity
                style={styles.toastContent}
                onPress={dismissToast}
                activeOpacity={0.8}
            >
                <View style={styles.toastHeader}>
                    <Text style={[styles.toastTitle, { color: colors.text }]}>{toast.title}</Text>
                    <Text style={[styles.dismissBtn, { color: colors.subtext }]}>✕</Text>
                </View>

                <Text style={[styles.toastMessage, { color: colors.subtext }]}>{toast.message}</Text>

                {toast.details && toast.details.length > 0 && (
                    <View style={styles.detailsContainer}>
                        {toast.details.map((detail, idx) => (
                            <Text key={idx} style={[styles.detailItem, { color: colors.subtext }]}>
                                • {detail}
                            </Text>
                        ))}
                    </View>
                )}
            </TouchableOpacity>
        </Animated.View>
    );
}

// ==========================================
// Toast Provider (wraps entire app)
// ==========================================

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toastIdRef = useRef(0);

    const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
        const id = `toast_${++toastIdRef.current}_${Date.now()}`;
        setToasts((prev) => {
            // Keep max 3 toasts visible
            const updated = [...prev, { ...toast, id }];
            return updated.slice(-3);
        });
    }, []);

    const showError = useCallback((error: any) => {
        const parsed = parseApiError(error);
        showToast(parsed);
    }, [showToast]);

    const showSuccess = useCallback((message: string, title?: string) => {
        showToast({ type: 'success', title: title || '✅ Success', message });
    }, [showToast]);

    const showWarning = useCallback((message: string, title?: string) => {
        showToast({ type: 'warning', title: title || '⚠️ Warning', message });
    }, [showToast]);

    const showInfo = useCallback((message: string, title?: string) => {
        showToast({ type: 'info', title: title || 'ℹ️ Info', message });
    }, [showToast]);

    const dismissToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const contextValue: ToastContextValue = {
        showToast,
        showError,
        showSuccess,
        showWarning,
        showInfo,
    };

    // Set global ref so API interceptor can use it
    globalToastRef = contextValue;

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
            {/* Toast overlay — renders above everything */}
            <View style={styles.toastOverlay} pointerEvents="box-none">
                {toasts.map((toast) => (
                    <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
                ))}
            </View>
        </ToastContext.Provider>
    );
}

// ==========================================
// Styles
// ==========================================

const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';
const toastWidth = isWeb ? Math.min(450, width - 32) : width - 32;
const webTextWrap = isWeb ? ({ wordBreak: 'break-word', overflowWrap: 'anywhere' } as any) : {};

const styles = StyleSheet.create({
    toastOverlay: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 50 : 30,
        left: 0,
        right: 0,
        width: '100%',
        paddingHorizontal: 16,
        alignItems: 'center',
        zIndex: 99999,
        elevation: 99999,
        pointerEvents: 'box-none',
    },
    toastContainer: {
        width: '100%',
        maxWidth: toastWidth,
        marginBottom: 8,
        borderRadius: 12,
        borderLeftWidth: 4,
        overflow: 'hidden',
        ...(isWeb
            ? {
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  backdropFilter: 'blur(10px)',
              }
            : {
                  elevation: 20,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.4,
                  shadowRadius: 16,
              }),
    } as any,
    toastContent: {
        padding: 14,
        width: '100%',
    },
    toastHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    toastTitle: {
        fontSize: 15,
        fontWeight: '700',
        flex: 1,
        minWidth: 0,
        flexShrink: 1,
        ...webTextWrap,
    },
    dismissBtn: {
        fontSize: 16,
        fontWeight: '600',
        paddingLeft: 12,
        opacity: 0.7,
    },
    toastMessage: {
        fontSize: 13,
        lineHeight: 18,
        opacity: 0.9,
        width: '100%',
        flexShrink: 1,
        ...webTextWrap,
    },
    detailsContainer: {
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    detailItem: {
        fontSize: 12,
        lineHeight: 18,
        opacity: 0.8,
        width: '100%',
        flexShrink: 1,
        ...webTextWrap,
    },
});

export { parseApiError };
