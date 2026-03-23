import axios, { InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getGlobalToast } from '../components/ToastProvider';

// Extend AxiosRequestConfig to support toast notifications
declare module 'axios' {
    export interface AxiosRequestConfig {
        showSuccessToast?: boolean;
        successMessage?: string;
        showErrorToast?: boolean; // Default is true
    }
}

const isWeb = typeof window !== 'undefined';
export const API_BASE_URL = 'https://thalloid-liza-unscholastically.ngrok-free.dev';
export const SOCKET_URL = API_BASE_URL;

const baseURL = `${API_BASE_URL}/api`;

const client = axios.create({
    baseURL,
    timeout: 15000, // 15 second timeout
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request Interceptor: Attach Auth Token
client.interceptors.request.use(async (config) => {
    const token = await AsyncStorage.getItem('userToken');
    if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
});

// Response Interceptor: Global Success/Error Handling via Toast
client.interceptors.response.use(
    (response) => {
        const config = response.config;
        
        // Show success toast if requested
        if (config.showSuccessToast) {
            const toast = getGlobalToast();
            if (toast) {
                toast.showSuccess(config.successMessage || 'Action completed successfully');
            }
        }
        
        return response;
    },
    (error) => {
        const config = error.config;
        const status = error.response ? error.response.status : 'NETWORK_ERROR';
        const errorData = error.response?.data?.error || error.message || 'Unknown error occurred';

        console.error(`[API Error] ${status}: ${errorData}`, config?.url);

        // Show toast for every API error automatically (unless explicitly disabled)
        if (config?.showErrorToast !== false) {
            const toast = getGlobalToast();
            if (toast) {
                // Skip showing toast for 401 on refresh attempts (handled by auth flow)
                const isRefreshAttempt = config?.url?.includes('/auth/refresh');
                if (!isRefreshAttempt) {
                    toast.showError(error);
                }
            }
        }

        return Promise.reject(error);
    }
);

export default client;
