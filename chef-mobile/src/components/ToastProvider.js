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

const ToastContext = createContext(null);

export function useToast() {
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

let globalToastRef = null;

export function getGlobalToast() {
    return globalToastRef;
}

function parseApiError(error) {
    if (!error.response) {
        if (error.message?.includes('Network Error')) {
            return {
                type: 'error',
                title: '🌐 Connection Failed',
                message: 'Unable to reach the server. Please check your internet connection.',
            };
        }
        return {
            type: 'error',
            title: '❌ Error',
            message: error.message || 'An unexpected error occurred.',
        };
    }

    const { status, data } = error.response;
    const serverError = data?.error || 'Something went wrong';
    
    switch (status) {
        case 400: return { type: 'warning', title: '⚠️ Invalid Request', message: serverError };
        case 401: return { type: 'error', title: '🔒 Unauthorized', message: serverError };
        case 500: return { type: 'error', title: '💥 Server Error', message: 'Internal server error. Please try again later.' };
        default: return { type: 'error', title: `Error ${status}`, message: serverError };
    }
}

const COLORS = {
    error: { bg: '#1a0a0a', border: '#ff4444', text: '#ff6b6b', subtext: '#ff9999' },
    success: { bg: '#0a1a0a', border: '#44ff44', text: '#6bff6b', subtext: '#99ff99' },
    warning: { bg: '#1a1a0a', border: '#ffaa44', text: '#ffcc6b', subtext: '#ffdd99' },
    info: { bg: '#0a0a1a', border: '#4488ff', text: '#6baaff', subtext: '#99ccff' },
};

function ToastItem({ toast, onDismiss }) {
    const slideAnim = useRef(new Animated.Value(-100)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const colors = COLORS[toast.type];

    React.useEffect(() => {
        Animated.parallel([
            Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();

        const timer = setTimeout(() => dismissToast(), 4000);
        return () => clearTimeout(timer);
    }, []);

    const dismissToast = () => {
        Animated.parallel([
            Animated.timing(slideAnim, { toValue: -100, duration: 250, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]).start(() => onDismiss(toast.id));
    };

    return (
        <Animated.View style={[styles.toastContainer, { backgroundColor: colors.bg, borderLeftColor: colors.border, transform: [{ translateY: slideAnim }], opacity: opacityAnim }]}>
            <TouchableOpacity style={styles.toastContent} onPress={dismissToast} activeOpacity={0.8}>
                <View style={styles.toastHeader}>
                    <Text style={[styles.toastTitle, { color: colors.text }]}>{toast.title}</Text>
                    <Text style={[styles.dismissBtn, { color: colors.subtext }]}>✕</Text>
                </View>
                <Text style={[styles.toastMessage, { color: colors.subtext }]}>{toast.message}</Text>
            </TouchableOpacity>
        </Animated.View>
    );
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const toastIdRef = useRef(0);

    const showToast = useCallback((toast) => {
        const id = `toast_${++toastIdRef.current}_${Date.now()}`;
        setToasts((prev) => [...prev, { ...toast, id }].slice(-3));
    }, []);

    const showError = useCallback((error) => showToast(parseApiError(error)), [showToast]);
    const showSuccess = useCallback((message, title) => showToast({ type: 'success', title: title || '✅ Success', message }), [showToast]);
    const dismissToast = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

    const contextValue = { showToast, showError, showSuccess };
    globalToastRef = contextValue;

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
            <View style={styles.toastOverlay} pointerEvents="box-none">
                {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />)}
            </View>
        </ToastContext.Provider>
    );
}

const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';
const toastWidth = isWeb ? Math.min(450, width - 32) : width - 32;

const styles = StyleSheet.create({
    toastOverlay: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 30, left: 0, right: 0, alignItems: 'center', zIndex: 99999, elevation: 99999, pointerEvents: 'box-none' },
    toastContainer: { width: toastWidth, marginBottom: 8, borderRadius: 12, borderLeftWidth: 4, overflow: 'hidden', elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16 },
    toastContent: { padding: 14 },
    toastHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    toastTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
    dismissBtn: { fontSize: 16, fontWeight: '600', paddingLeft: 12, opacity: 0.7 },
    toastMessage: { fontSize: 13, lineHeight: 18, opacity: 0.9 },
});
