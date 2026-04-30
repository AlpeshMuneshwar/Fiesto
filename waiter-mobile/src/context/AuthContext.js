import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

const AuthContext = createContext();

const parseStoredUser = async (storedUser) => {
    if (!storedUser) {
        return null;
    }

    try {
        return JSON.parse(storedUser);
    } catch (error) {
        console.error('Invalid stored waiter user payload', error);
        await AsyncStorage.removeItem('user');
        await AsyncStorage.removeItem('userToken');
        return null;
    }
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadUser = async () => {
            try {
                const storedUser = await AsyncStorage.getItem('user');
                const parsedUser = await parseStoredUser(storedUser);
                setUser(parsedUser);
            } catch (e) {
                console.error('Failed to load user', e);
            } finally {
                setLoading(false);
            }
        };
        loadUser();
    }, []);

    const login = async (email, password) => {
        try {
            const res = await client.post('/auth/login', { email, password });
            const { user, token } = res.data;
            if (user.role !== 'WAITER' && user.role !== 'ADMIN') {
                throw new Error('Unauthorized role for this application');
            }
            await AsyncStorage.setItem('userToken', token);
            await AsyncStorage.setItem('user', JSON.stringify(user));
            setUser(user);
            return user;
        } catch (e) {
            if (e.response?.data?.needsVerification) {
                const err = new Error('Verification Required');
                err.needsVerification = true;
                err.email = e.response.data.email;
                throw err;
            }
            const err = new Error(e.response?.data?.error || e.message || 'Login failed');
            err.code = e.response?.data?.code;
            throw err;
        }
    };

    const loginWithOtp = async (email, otp) => {
        try {
            const res = await client.post('/auth/login-otp', { email, otp, purpose: 'LOGIN' });
            const { user, token } = res.data;
            if (user.role !== 'WAITER' && user.role !== 'ADMIN') {
                throw new Error('Unauthorized role for this application');
            }
            await AsyncStorage.setItem('userToken', token);
            await AsyncStorage.setItem('user', JSON.stringify(user));
            setUser(user);
            return user;
        } catch (e) {
            const err = new Error(e.response?.data?.error || e.message || 'Login failed');
            err.code = e.response?.data?.code;
            throw err;
        }
    };

    const requestOtp = async (email, purpose) => {
        await client.post('/auth/request-otp', { email, purpose });
    };

    const verifyEmail = async (email, otp) => {
        await client.post('/auth/verify-email', { email, otp });
    };

    const resetPassword = async (email, otp, newPassword) => {
        await client.post('/auth/reset-password', { email, otp, newPassword });
    };

    const logout = async () => {
        await AsyncStorage.removeItem('userToken');
        await AsyncStorage.removeItem('user');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, loginWithOtp, requestOtp, verifyEmail, resetPassword, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
