import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getGlobalToast } from '../components/ToastProvider';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:4000';
export const SOCKET_URL = API_BASE_URL;

const client = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    timeout: 10000,
});

client.interceptors.request.use(async (config) => {
    const token = await AsyncStorage.getItem('userToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

client.interceptors.response.use(
    (response) => response,
    (error) => {
        const toast = getGlobalToast();
        if (toast) {
            toast.showError(error);
        }
        return Promise.reject(error);
    }
);

export default client;
