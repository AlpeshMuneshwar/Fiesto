import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import useApi from '../hooks/useApi';
import ResponsiveContainer from '../components/ResponsiveContainer';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

export default function LoginScreen({ navigation }: any) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    
    // New: Use universal API hook
    const { loading, error, execute: login } = useApi(
        (data) => client.post('/auth/login', data, { 
            showSuccessToast: true, 
            successMessage: 'Welcome back!' 
        })
    );

    const registerPushToken = async () => {
        try {
            if (Platform.OS === 'web') return;
            if (!Device.isDevice) return;
            
            const { status } = await Notifications.getPermissionsAsync();
            if (status !== 'granted') {
                const { status: newStatus } = await Notifications.requestPermissionsAsync();
                if (newStatus !== 'granted') return;
            }

            const tokenData = await Notifications.getExpoPushTokenAsync();
            await client.post('/auth/push-token', { pushToken: tokenData.data });
        } catch (e) {
            console.log('Push token registration failed (non-critical):', e);
        }
    };

    const handleLogin = async () => {
        if (!email.trim() || !password.trim()) {
            Alert.alert('Missing Fields', 'Please enter both email and password');
            return;
        }

        const data = await login({ email, password });
        
        if (data) {
            await AsyncStorage.setItem('userToken', data.token);
            await AsyncStorage.setItem('userRole', data.user.role);
            await AsyncStorage.setItem('user', JSON.stringify(data.user)); 
            if (data.user.cafeId) {
                await AsyncStorage.setItem('cafeId', data.user.cafeId);
            }

            registerPushToken();

            if (data.user.role === 'WAITER') {
                navigation.replace('WaiterDashboard');
            } else if (data.user.role === 'CHEF') {
                navigation.replace('ChefDashboard');
            } else if (data.user.role === 'ADMIN') {
                navigation.replace('AdminDashboard');
            } else if (data.user.role === 'SUPER_ADMIN') {
                navigation.replace('SuperAdminDashboard');
            } else {
                navigation.replace('ScanTable');
            }
        }
    };

    return (
        <View style={styles.container}>
            <ResponsiveContainer maxWidth={500}>
                <Text style={styles.title} accessibilityRole="header">Staff Login</Text>

                {error ? <Text style={styles.errorText} accessibilityLiveRegion="assertive">{error.response?.data?.error || error.message || 'Login failed'}</Text> : null}

                <TextInput
                    style={[styles.input, error && !email ? styles.inputError : null]}
                    placeholder="Email"
                    value={email}
                    onChangeText={(v) => { setEmail(v); }}
                    autoCapitalize="none"
                    accessibilityLabel="Email Address"
                    accessibilityHint="Enter your staff email address"
                />

                <TextInput
                    style={[styles.input, error && !password ? styles.inputError : null]}
                    placeholder="Password"
                    value={password}
                    onChangeText={(v) => { setPassword(v); }}
                    secureTextEntry
                    accessibilityLabel="Password"
                    accessibilityHint="Enter your password"
                />

                <TouchableOpacity 
                    style={{ alignSelf: 'flex-end', marginBottom: 15 }}
                    onPress={() => navigation.navigate('ForgotPassword')}
                    accessibilityRole="button"
                    accessibilityLabel="Forgot Password Text"
                >
                    <Text style={{ color: '#3B82F6', fontWeight: '600', fontSize: 13 }}>Forgot Password?</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.button, loading && { opacity: 0.7 }]}
                    onPress={handleLogin}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: loading }}
                >
                    <Text style={styles.buttonText}>{loading ? 'Logging in...' : 'Login'}</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    onPress={() => navigation.navigate('ScanTable')} 
                    style={{ marginTop: 25 }}
                    accessibilityRole="button"
                >
                    <Text style={{ color: '#007AFF', textAlign: 'center', fontWeight: '500' }}>Customer? Go to Scan Table</Text>
                </TouchableOpacity>
            </ResponsiveContainer>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: '#F8FAFC' },
    title: { fontSize: 26, fontWeight: '800', marginBottom: 25, textAlign: 'center', color: '#0F172A' },
    input: { borderWidth: 1, borderColor: '#CBD5E1', padding: 14, marginBottom: 15, borderRadius: 10, backgroundColor: 'white', color: '#0F172A' },
    inputError: { borderColor: '#EF4444' },
    errorText: { color: '#EF4444', marginBottom: 12, textAlign: 'center', fontWeight: '500', fontSize: 14 },
    button: { backgroundColor: '#0EA5E9', padding: 16, borderRadius: 12, alignItems: 'center' },
    buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});
