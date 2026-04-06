import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import useApi from '../hooks/useApi';
import ResponsiveContainer from '../components/ResponsiveContainer';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

export default function LoginScreen({ navigation, route }: any) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [isOtpMode, setIsOtpMode] = useState(false);
    const [showingVerification, setShowingVerification] = useState(false);
    const isCustomerMode = route.params?.loginMode === 'customer';
    const loginTitle = isCustomerMode ? 'Client Login' : 'Staff Login';
    const loginSubtitle = isCustomerMode
        ? 'Log in to manage bookings, explore cafes, and continue your dining journey.'
        : 'Access the waiter, chef, admin, and super admin dashboards.';

    React.useEffect(() => {
        if (route.params?.email) {
            setEmail(route.params.email);
        }
        if (route.params?.showingVerification) {
            setShowingVerification(true);
        }
    }, [route.params]);
    
    // API Hooks
    const { loading, error, execute: login } = useApi(
        (data) => client.post('/auth/login', data, { 
            showSuccessToast: true, 
            successMessage: 'Welcome back!' 
        })
    );

    const { loading: otpLoading, execute: sendOtpAction } = useApi(
        (data) => client.post('/auth/request-otp', data, {
            showSuccessToast: true,
            successMessage: 'OTP sent to your email'
        })
    );

    const { loading: verifyLoading, execute: verifyEmailAction } = useApi(
        (data) => client.post('/auth/verify-email', data, {
            showSuccessToast: true,
            successMessage: 'Email verified! You can now login.'
        })
    );

    const { loading: otpLoginLoading, execute: loginOtpAction } = useApi(
        (data) => client.post('/auth/login-otp', data, {
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

    const onLoginSuccess = async (data: any) => {
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
            } else if (data.user.role === 'CUSTOMER') {
                navigation.replace('DiscoveryPortal');
            } else {
                navigation.replace('ScanTable');
            }
        }
    };

    const handleLogin = async () => {
        if (!email.trim() || (!isOtpMode && !password.trim())) {
            Alert.alert('Missing Fields', 'Please enter email and ' + (isOtpMode ? 'OTP' : 'password'));
            return;
        }

        let data;
        if (isOtpMode) {
            data = await loginOtpAction({ email, otp, purpose: 'LOGIN' });
        } else {
            try {
                data = await login({ email, password });
            } catch (err: any) {
                if (err.response?.data?.needsVerification) {
                    setShowingVerification(true);
                    return;
                }
            }
            // If useApi handled it but we need to check needsVerification manually because useApi might catch it
            if (!data && error?.response?.data?.needsVerification) {
                setShowingVerification(true);
                return;
            }
        }
        
        if (data) {
            await onLoginSuccess(data);
        }
    };

    const handleSendOtp = async () => {
        if (!email.trim()) {
            Alert.alert('Email Required', 'Please enter your email to receive an OTP');
            return;
        }
        await sendOtpAction({ email, purpose: showingVerification ? 'VERIFY_EMAIL' : 'LOGIN' });
    };

    const handleVerifyEmail = async () => {
        if (!otp.trim()) return;
        const success = await verifyEmailAction({ email, otp });
        if (success) {
            setShowingVerification(false);
            setOtp('');
        }
    };

    if (showingVerification) {
        return (
            <View style={styles.container}>
                <ResponsiveContainer maxWidth={500}>
                    <Text style={styles.title}>Verify Your Email</Text>
                    <Text style={{ textAlign: 'center', marginBottom: 20, color: '#64748B' }}>
                        A verification code was sent to {email}. Please enter it below to activate your account.
                    </Text>

                    <TextInput
                        style={styles.input}
                        placeholder="6-digit OTP"
                        value={otp}
                        onChangeText={setOtp}
                        keyboardType="number-pad"
                        maxLength={6}
                    />

                    <TouchableOpacity
                        style={[styles.button, verifyLoading && { opacity: 0.7 }]}
                        onPress={handleVerifyEmail}
                        disabled={verifyLoading}
                    >
                        <Text style={styles.buttonText}>{verifyLoading ? 'Verifying...' : 'Verify Email'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={handleSendOtp} style={{ marginTop: 20 }}>
                        <Text style={{ color: '#3B82F6', textAlign: 'center', fontWeight: '600' }}>Resend Code</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setShowingVerification(false)} style={{ marginTop: 15 }}>
                        <Text style={{ color: '#64748B', textAlign: 'center' }}>Back to Login</Text>
                    </TouchableOpacity>
                </ResponsiveContainer>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ResponsiveContainer maxWidth={500}>
                <Text style={styles.title} accessibilityRole="header">{loginTitle}</Text>
                <Text style={styles.subtitle}>{loginSubtitle}</Text>

                {error && !error.response?.data?.needsVerification ? (
                    <Text style={styles.errorText} accessibilityLiveRegion="assertive">
                        {error.response?.data?.error || error.message || 'Login failed'}
                    </Text>
                ) : null}

                <TextInput
                    style={[styles.input, error && !email ? styles.inputError : null]}
                    placeholder="Email"
                    value={email}
                    onChangeText={(v) => { setEmail(v); }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />

                {!isOtpMode ? (
                    <TextInput
                        style={[styles.input, error && !password ? styles.inputError : null]}
                        placeholder="Password"
                        value={password}
                        onChangeText={(v) => { setPassword(v); }}
                        secureTextEntry
                    />
                ) : (
                    <View>
                        <TextInput
                            style={styles.input}
                            placeholder="6-digit OTP"
                            value={otp}
                            onChangeText={setOtp}
                            keyboardType="number-pad"
                            maxLength={6}
                        />
                        <TouchableOpacity 
                            onPress={handleSendOtp} 
                            style={{ alignSelf: 'flex-end', marginTop: -10, marginBottom: 15 }}
                            disabled={otpLoading}
                        >
                            <Text style={{ color: '#3B82F6', fontWeight: '600', fontSize: 13 }}>
                                {otpLoading ? 'Sending...' : 'Send OTP'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                <TouchableOpacity 
                    style={{ alignSelf: 'flex-end', marginBottom: 15 }}
                    onPress={() => navigation.navigate('ForgotPassword')}
                >
                    <Text style={{ color: '#3B82F6', fontWeight: '600', fontSize: 13 }}>Forgot Password?</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.button, (loading || otpLoginLoading) && { opacity: 0.7 }]}
                    onPress={handleLogin}
                    disabled={loading || otpLoginLoading}
                >
                    <Text style={styles.buttonText}>
                        {loading || otpLoginLoading ? 'Processing...' : (isOtpMode ? 'Login with OTP' : 'Login')}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    onPress={() => setIsOtpMode(!isOtpMode)} 
                    style={{ marginTop: 20 }}
                >
                    <Text style={{ color: '#64748B', textAlign: 'center', fontWeight: '600' }}>
                        {isOtpMode ? 'Use Password instead' : 'Login with OTP'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    onPress={() => navigation.navigate('ScanTable')} 
                    style={{ marginTop: 25 }}
                >
                    <Text style={{ color: '#007AFF', textAlign: 'center', fontWeight: '500' }}>
                        {isCustomerMode ? 'Joining through a table QR? Go to Scan Table' : 'Customer? Go to Scan Table'}
                    </Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 20, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 20 }}>
                    <Text style={{ color: '#64748B' }}>{isCustomerMode ? "Don't have an account? " : 'Need a client account? '}</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                        <Text style={{ color: '#0EA5E9', fontWeight: '800' }}>Sign Up</Text>
                    </TouchableOpacity>
                </View>
            </ResponsiveContainer>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: '#F8FAFC' },
    title: { fontSize: 26, fontWeight: '800', marginBottom: 10, textAlign: 'center', color: '#0F172A' },
    subtitle: { color: '#64748B', textAlign: 'center', fontSize: 14, lineHeight: 21, marginBottom: 20 },
    input: { borderWidth: 1, borderColor: '#CBD5E1', padding: 14, marginBottom: 15, borderRadius: 10, backgroundColor: 'white', color: '#0F172A' },
    inputError: { borderColor: '#EF4444' },
    errorText: { color: '#EF4444', marginBottom: 12, textAlign: 'center', fontWeight: '500', fontSize: 14 },
    button: { backgroundColor: '#0EA5E9', padding: 16, borderRadius: 12, alignItems: 'center' },
    buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});
