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
import { normalizeApiError } from '../utils/api-error';

export type ToastType = 'error' | 'success' | 'warning' | 'info';

interface Toast {
    id: string;
    type: ToastType;
    title: string;
    message: string;
    details?: string[];
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

export function useToast(): ToastContextValue {
    const context = useContext(ToastContext);
    if (!context) {
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

let globalToastRef: ToastContextValue | null = null;

export function getGlobalToast(): ToastContextValue | null {
    return globalToastRef;
}

function parseApiError(error: any): Omit<Toast, 'id'> {
    const normalized = normalizeApiError(error);
    return {
        type: [400, 404, 409, 413, 422].includes(Number(normalized.status)) ? 'warning' : 'error',
        title: normalized.requestId ? `${normalized.title} · ${normalized.requestId}` : normalized.title,
        message: normalized.message,
        details: normalized.details,
    };
}

const COLORS: Record<ToastType, { bg: string; border: string; text: string; subtext: string }> = {
    error: { bg: '#1a0a0a', border: '#ff4444', text: '#ff6b6b', subtext: '#ff9999' },
    success: { bg: '#0a1a0a', border: '#44ff44', text: '#6bff6b', subtext: '#99ff99' },
    warning: { bg: '#1a1a0a', border: '#ffaa44', text: '#ffcc6b', subtext: '#ffdd99' },
    info: { bg: '#0a0a1a', border: '#4488ff', text: '#6baaff', subtext: '#99ccff' },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
    const slideAnim = useRef(new Animated.Value(-100)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const colors = COLORS[toast.type];

    React.useEffect(() => {
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

        const duration = toast.duration || (toast.details ? 8000 : 4000);
        const timer = setTimeout(() => dismissToast(), duration);
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
            <TouchableOpacity style={styles.toastContent} onPress={dismissToast} activeOpacity={0.8}>
                <View style={styles.toastHeader}>
                    <Text style={[styles.toastTitle, { color: colors.text }]}>{toast.title}</Text>
                    <Text style={[styles.dismissBtn, { color: colors.subtext }]}>x</Text>
                </View>

                <Text style={[styles.toastMessage, { color: colors.subtext }]}>{toast.message}</Text>

                {toast.details && toast.details.length > 0 && (
                    <View style={styles.detailsContainer}>
                        {toast.details.map((detail, idx) => (
                            <Text key={idx} style={[styles.detailItem, { color: colors.subtext }]}>
                                - {detail}
                            </Text>
                        ))}
                    </View>
                )}
            </TouchableOpacity>
        </Animated.View>
    );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toastIdRef = useRef(0);

    const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
        const id = `toast_${++toastIdRef.current}_${Date.now()}`;
        setToasts((prev) => [...prev, { ...toast, id }].slice(-3));
    }, []);

    const showError = useCallback((error: any) => {
        showToast(parseApiError(error));
    }, [showToast]);

    const showSuccess = useCallback((message: string, title?: string) => {
        showToast({ type: 'success', title: title || 'Success', message });
    }, [showToast]);

    const showWarning = useCallback((message: string, title?: string) => {
        showToast({ type: 'warning', title: title || 'Warning', message });
    }, [showToast]);

    const showInfo = useCallback((message: string, title?: string) => {
        showToast({ type: 'info', title: title || 'Info', message });
    }, [showToast]);

    const dismissToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const contextValue: ToastContextValue = {
        showToast,
        showError,
        showSuccess,
        showWarning,
        showInfo,
    };

    globalToastRef = contextValue;

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
            <View style={styles.toastOverlay} pointerEvents="box-none">
                {toasts.map((toast) => (
                    <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
                ))}
            </View>
        </ToastContext.Provider>
    );
}

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
            ? { boxShadow: '0 8px 32px rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)' }
            : {
                  elevation: 20,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.4,
                  shadowRadius: 16,
              }),
    } as any,
    toastContent: { padding: 14, width: '100%' },
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
    dismissBtn: { fontSize: 16, fontWeight: '600', paddingLeft: 12, opacity: 0.7 },
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
