import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform, ScrollView, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';
import useApi from '../hooks/useApi';
import useCooldownTimer from '../hooks/useCooldownTimer';
import ResponsiveContainer from '../components/ResponsiveContainer';
import { useToast } from '../components/ToastProvider';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

function decodeJwtPayload(token?: string) {
    if (!token) return null;
    try {
        const base64 = token.split('.')[1];
        if (!base64) return null;
        const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        if (typeof globalThis.atob !== 'function') return null;
        return JSON.parse(globalThis.atob(padded));
    } catch {
        return null;
    }
}

function normalizeAuthResponse(data: any) {
    const token = data?.token || data?.accessToken || data?.data?.token || data?.data?.accessToken || null;
    const refreshToken = data?.refreshToken || data?.data?.refreshToken || null;
    const nestedUser = data?.user || data?.data?.user || null;
    const fallbackUser = nestedUser || data?.data || data || null;
    const decoded = decodeJwtPayload(token || undefined);

    const user = fallbackUser
        ? {
            ...fallbackUser,
            role: fallbackUser.role || decoded?.role || null,
            cafeId: fallbackUser.cafeId ?? decoded?.cafeId ?? null,
            id: fallbackUser.id ?? decoded?.id ?? null,
            name: fallbackUser.name ?? decoded?.name ?? null,
            email: fallbackUser.email ?? null,
        }
        : decoded
            ? {
                id: decoded.id ?? null,
                name: decoded.name ?? null,
                email: null,
                role: decoded.role ?? null,
                cafeId: decoded.cafeId ?? null,
            }
            : null;

    return { token, refreshToken, user };
}

const TRACKERS_KEY = 'discoveryTrackers';
const PROFILE_NAME_KEY = 'customerName';
const PROFILE_EMAIL_KEY = 'customerEmail';
const PROFILE_PHONE_KEY = 'customerPhone';
const DISCOVERY_OWNER_KEY = 'discoveryOwnerId';

export default function LoginScreen({ navigation, route }: any) {
    const { width } = useWindowDimensions();
    const isWide = width > 980;
    const showCustomPasswordToggle = Platform.OS !== 'web';
    const toast = useToast();
    const initialCooldownSeconds = route.params?.cooldownUntil
        ? Math.max(0, Math.ceil((route.params.cooldownUntil - Date.now()) / 1000))
        : 0;
    const {
        secondsLeft: otpCooldownSeconds,
        isCoolingDown: isOtpCooldownActive,
        startCooldown: startOtpCooldown,
    } = useCooldownTimer(initialCooldownSeconds);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [isOtpMode, setIsOtpMode] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [showingVerification, setShowingVerification] = useState(false);

    const isCustomerMode = route.params?.loginMode === 'customer';
    const title = showingVerification ? 'Verify your email' : isCustomerMode ? 'Customer Login' : 'Client / Staff Login';
    const badge = showingVerification ? 'ACCOUNT VERIFICATION' : isCustomerMode ? 'CUSTOMER ACCESS' : 'CLIENT / STAFF ACCESS';
    const subtitle = showingVerification
        ? `We sent a verification code to ${email || 'your email address'}. Enter it below to activate the account.`
        : isCustomerMode
            ? 'For diners using discovery, bookings, and takeaway tracking.'
            : 'For cafe owners, admins, managers, waiters, chefs, and super admin accounts.';

    const accessNotes = showingVerification
        ? [
            'A verification code was sent to your email address.',
            'Enter the 6-digit code below to activate your account.',
            'If needed, resend the code from this screen and then return to login.',
        ]
        : isCustomerMode
            ? [
                'Password and OTP login work only for existing customer accounts.',
                'If you are new, create a customer account first and verify your email.',
                'Use Scan Table if you are joining directly from a cafe QR code.',
            ]
            : [
                'Staff login works only for accounts already created by the admin.',
                'OTP login is for existing waiter, chef, admin, and super admin accounts.',
                'If you need the customer flow, use Scan Table or create a client account.',
            ];

    const featureNotes = isCustomerMode
        ? [
                'Manage bookings and return visits.',
                'Browse cafes and continue your dining flow.',
                'Use password or OTP after your account has been created and verified.',
            ]
        : [
            'Open operational dashboards from one entry point.',
            'Keep kitchen, waiter, and admin access in sync.',
            'Use OTP as a fallback on staff accounts that already exist.',
        ];

    useEffect(() => {
        if (route.params?.email) setEmail(route.params.email);
        if (route.params?.showingVerification) setShowingVerification(true);
    }, [route.params]);

    const { loading, error: loginError, execute: login } = useApi(
        (data) => client.post('/auth/login', data),
        {
            onError: (err) => {
                if (err?.response?.data?.needsVerification) {
                    setShowingVerification(true);
                }
            },
        }
    );

    const { loading: otpLoading, error: otpRequestError, execute: sendOtpAction } = useApi(
        (data) => client.post('/auth/request-otp', data, {
            showSuccessToast: true,
            successMessage: showingVerification ? 'Verification code sent to your email' : 'OTP sent to your email',
        }),
        {
            onSuccess: () => startOtpCooldown(60),
            onError: (err) => {
                const retryAfterSeconds = err?.response?.data?.retryAfterSeconds;
                if (retryAfterSeconds) {
                    startOtpCooldown(retryAfterSeconds);
                }
            },
        }
    );

    const { loading: verifyLoading, error: verifyError, execute: verifyEmailAction } = useApi(
        (data) => client.post('/auth/verify-email', data, { showSuccessToast: true, successMessage: 'Email verified! You can now login.' })
    );

    const { loading: otpLoginLoading, error: otpLoginError, execute: loginOtpAction } = useApi(
        (data) => client.post('/auth/login-otp', data)
    );

    const registerPushToken = async () => {
        try {
            if (Platform.OS === 'web' || !Device.isDevice) return;
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
        if (!data) return;

        const auth = normalizeAuthResponse(data);
        const role = auth.user?.role;

        if (!auth.token) {
            console.error('Unexpected login response: missing token', data);
            Alert.alert('Login Error', 'Login succeeded but the response was incomplete. Please try again.');
            return;
        }

        await AsyncStorage.setItem('userToken', auth.token);
        if (auth.refreshToken) {
            await AsyncStorage.setItem('refreshToken', auth.refreshToken);
        }
        if (role) {
            await AsyncStorage.setItem('userRole', role);
        }
        if (auth.user) {
            const previousOwnerId = await AsyncStorage.getItem(DISCOVERY_OWNER_KEY);
            await AsyncStorage.setItem('user', JSON.stringify(auth.user));
            if (auth.user.cafeId) {
                await AsyncStorage.setItem('cafeId', auth.user.cafeId);
            }
            if (role === 'CUSTOMER') {
                const currentOwnerId = String(auth.user.id || '');
                if (previousOwnerId && previousOwnerId !== currentOwnerId) {
                    await AsyncStorage.removeItem(TRACKERS_KEY);
                }
                await AsyncStorage.multiSet([
                    [PROFILE_NAME_KEY, String(auth.user.name || '').trim()],
                    [PROFILE_EMAIL_KEY, String(auth.user.email || '').trim().toLowerCase()],
                    [PROFILE_PHONE_KEY, String(auth.user.phoneNumber || '').trim()],
                    [DISCOVERY_OWNER_KEY, currentOwnerId],
                ]);
            }
        }

        if (!role) {
            console.error('Unexpected login response: missing role', data);
            Alert.alert('Login Error', 'Signed in, but your account role was missing. Please try again.');
            return;
        }

        registerPushToken();
        toast.showSuccess('Welcome back!');

        if (role === 'WAITER') navigation.replace('WaiterDashboard');
        else if (role === 'CHEF') navigation.replace('ChefDashboard');
        else if (role === 'MANAGER') navigation.replace('ManagerDashboard');
        else if (role === 'ADMIN') navigation.replace('AdminDashboard');
        else if (role === 'SUPER_ADMIN') navigation.replace('SuperAdminDashboard');
        else if (role === 'CUSTOMER') navigation.replace('DiscoveryPortal');
        else navigation.replace('ScanTable');
    };

    const handleLogin = async () => {
        if (!email.trim() || (!isOtpMode && !password.trim()) || (isOtpMode && !otp.trim())) {
            Alert.alert('Missing Fields', `Please enter email and ${isOtpMode ? 'OTP' : 'password'}`);
            return;
        }

        let data;
        if (isOtpMode) {
            data = await loginOtpAction({ email, otp, purpose: 'LOGIN' });
        } else {
            data = await login({ email, password });
            if (!data && loginError?.code === 'EMAIL_NOT_VERIFIED') {
                setShowingVerification(true);
                return;
            }
        }

        if (data) await onLoginSuccess(data);
    };

    const handleSendOtp = async () => {
        if (!email.trim()) {
            Alert.alert('Email Required', 'Please enter your email to receive an OTP');
            return;
        }
        if (isOtpCooldownActive) {
            return;
        }
        await sendOtpAction({ email, purpose: showingVerification ? 'VERIFY_EMAIL' : 'LOGIN' });
    };

    const handleVerifyEmail = async () => {
        if (!otp.trim()) {
            Alert.alert('Code Required', 'Please enter the 6-digit verification code');
            return;
        }
        const success = await verifyEmailAction({ email, otp });
        if (success) {
            setShowingVerification(false);
            setOtp('');
            setIsOtpMode(false);
        }
    };

    const activeError = showingVerification
        ? verifyError || otpRequestError
        : isOtpMode
            ? otpLoginError || otpRequestError
            : loginError;

    const errorMessage = activeError
        ? activeError.message || 'Login failed'
        : null;
    const otpTimingNote = isOtpCooldownActive
        ? `You can request another code in ${otpCooldownSeconds}s.`
        : 'You can request a new code every 60 seconds.';
    const otpEligibilityNote = isCustomerMode
        ? 'OTP login is only for existing customer accounts. If you are new, create the account first.'
        : 'OTP login is for existing client/staff accounts already created by the cafe admin.';

    return (
        <View style={styles.screen}>
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <ResponsiveContainer maxWidth={1120}>
                    <View style={styles.page}>
                        <View style={styles.header}>
                            <Text style={styles.badge}>{badge}</Text>
                            <Text style={styles.title}>{title}</Text>
                            <Text style={styles.subtitle}>{subtitle}</Text>
                        </View>

                        <View style={[styles.grid, isWide && styles.gridWide]}>
                            <View style={[styles.side, isWide && styles.sideWide]}>
                                <View style={styles.panel}>
                                    <Text style={styles.panelLabel}>{showingVerification ? 'NEXT STEPS' : 'ACCESS NOTES'}</Text>
                                    {accessNotes.map((note, index) => (
                                        <View key={note} style={[styles.listRow, index < accessNotes.length - 1 && styles.rowBorder]}>
                                            <Text style={styles.listIndex}>{String(index + 1).padStart(2, '0')}</Text>
                                            <Text style={styles.listText}>{note}</Text>
                                        </View>
                                    ))}
                                </View>

                                {!showingVerification && (
                                    <View style={styles.panel}>
                                        <Text style={styles.panelLabel}>{isCustomerMode ? 'CLIENT FLOW' : 'STAFF FLOW'}</Text>
                                        {featureNotes.map((note) => (
                                            <View key={note} style={styles.featureBlock}>
                                                <Text style={styles.featureText}>{note}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>

                            <View style={styles.main}>
                                <View style={styles.formPanel}>
                                    {!showingVerification ? (
                                        <>
                                            <View style={styles.modeSwitcher}>
                                                <TouchableOpacity
                                                    style={[styles.modeTab, isCustomerMode && styles.modeTabActive]}
                                                    onPress={() => navigation.replace('Login', { loginMode: 'customer' })}
                                                >
                                                    <Text style={[styles.modeTabText, isCustomerMode && styles.modeTabTextActive]}>Customer</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.modeTab, !isCustomerMode && styles.modeTabActive]}
                                                    onPress={() => navigation.replace('Login', { loginMode: 'staff' })}
                                                >
                                                    <Text style={[styles.modeTabText, !isCustomerMode && styles.modeTabTextActive]}>Client / Staff</Text>
                                                </TouchableOpacity>
                                            </View>

                                            <View style={styles.switcher}>
                                                <TouchableOpacity style={[styles.switchTab, !isOtpMode && styles.switchTabActive]} onPress={() => setIsOtpMode(false)}>
                                                    <Text style={[styles.switchTabText, !isOtpMode && styles.switchTabTextActive]}>Password</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity style={[styles.switchTab, isOtpMode && styles.switchTabActive]} onPress={() => setIsOtpMode(true)}>
                                                    <Text style={[styles.switchTabText, isOtpMode && styles.switchTabTextActive]}>OTP</Text>
                                                </TouchableOpacity>
                                            </View>

                                            {errorMessage && activeError?.code !== 'EMAIL_NOT_VERIFIED' ? (
                                                <View style={styles.errorBox}>
                                                    <Text style={styles.errorText}>{errorMessage}</Text>
                                                </View>
                                            ) : null}

                                            <Text style={styles.fieldLabel}>Email address</Text>
                                            <TextInput
                                                style={[styles.input, activeError && !email ? styles.inputError : null]}
                                                placeholder="name@example.com"
                                                placeholderTextColor="#94A3B8"
                                                value={email}
                                                onChangeText={setEmail}
                                                autoCapitalize="none"
                                                keyboardType="email-address"
                                            />

                                            {!isOtpMode ? (
                                                <>
                                                    <Text style={styles.fieldLabel}>Password</Text>
                                                    <View style={[styles.passwordField, activeError && !password ? styles.inputError : null]}>
                                                        <TextInput
                                                            style={styles.passwordInput}
                                                            placeholder="Enter your password"
                                                            placeholderTextColor="#94A3B8"
                                                            value={password}
                                                            onChangeText={setPassword}
                                                            secureTextEntry={showCustomPasswordToggle ? !isPasswordVisible : true}
                                                        />
                                                        {showCustomPasswordToggle ? (
                                                            <TouchableOpacity
                                                                style={styles.passwordToggle}
                                                                onPress={() => setIsPasswordVisible((current) => !current)}
                                                                accessibilityRole="button"
                                                                accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
                                                            >
                                                                <Ionicons
                                                                    name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
                                                                    size={20}
                                                                    color="#475569"
                                                                />
                                                            </TouchableOpacity>
                                                        ) : null}
                                                    </View>

                                                    <TouchableOpacity style={styles.linkBlock} onPress={() => navigation.navigate('ForgotPassword')}>
                                                        <Text style={styles.linkBlockText}>Forgot password</Text>
                                                    </TouchableOpacity>
                                                </>
                                            ) : (
                                                <>
                                                    <Text style={styles.fieldLabel}>6-digit OTP</Text>
                                                    <TextInput
                                                        style={styles.input}
                                                        placeholder="123456"
                                                        placeholderTextColor="#94A3B8"
                                                        value={otp}
                                                        onChangeText={setOtp}
                                                        keyboardType="number-pad"
                                                        maxLength={6}
                                                    />

                                                    <TouchableOpacity style={[styles.secondaryButton, (otpLoading || isOtpCooldownActive) && styles.disabled]} onPress={handleSendOtp} disabled={otpLoading || isOtpCooldownActive}>
                                                        <Text style={styles.secondaryButtonText}>
                                                            {otpLoading ? 'Sending...' : isOtpCooldownActive ? `Resend in ${otpCooldownSeconds}s` : 'Send OTP to email'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <Text style={styles.helperText}>{otpEligibilityNote} {otpTimingNote}</Text>
                                                </>
                                            )}

                                            <TouchableOpacity style={[styles.primaryButton, (loading || otpLoginLoading) && styles.disabled]} onPress={handleLogin} disabled={loading || otpLoginLoading}>
                                                <Text style={styles.primaryButtonText}>{loading || otpLoginLoading ? 'Processing...' : isOtpMode ? 'Login with OTP' : 'Login'}</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity style={styles.linkBlock} onPress={() => navigation.navigate('ScanTable')}>
                                                <Text style={styles.linkBlockText}>{isCustomerMode ? 'Joining from a table QR? Go to Scan Table' : 'Need customer QR flow? Go to Scan Table'}</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={styles.linkBlock}
                                                onPress={() => isCustomerMode ? navigation.navigate('Register') : navigation.navigate('CafeRegistration')}
                                            >
                                                <Text style={styles.linkBlockText}>
                                                    {isCustomerMode ? 'New customer? Create customer account' : 'Need client account? Register your cafe'}
                                                </Text>
                                            </TouchableOpacity>
                                        </>
                                    ) : (
                                        <>
                                            {errorMessage ? (
                                                <View style={styles.errorBox}>
                                                    <Text style={styles.errorText}>{errorMessage}</Text>
                                                </View>
                                            ) : null}

                                            <Text style={styles.fieldLabel}>Email address</Text>
                                            <TextInput style={[styles.input, styles.inputDisabled]} value={email} editable={false} />

                                            <Text style={styles.fieldLabel}>6-digit verification code</Text>
                                            <TextInput
                                                style={styles.input}
                                                placeholder="123456"
                                                placeholderTextColor="#94A3B8"
                                                value={otp}
                                                onChangeText={setOtp}
                                                keyboardType="number-pad"
                                                maxLength={6}
                                            />

                                            <TouchableOpacity style={[styles.primaryButton, verifyLoading && styles.disabled]} onPress={handleVerifyEmail} disabled={verifyLoading}>
                                                <Text style={styles.primaryButtonText}>{verifyLoading ? 'Verifying...' : 'Verify email'}</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity style={[styles.secondaryButton, (otpLoading || isOtpCooldownActive) && styles.disabled]} onPress={handleSendOtp} disabled={otpLoading || isOtpCooldownActive}>
                                                <Text style={styles.secondaryButtonText}>
                                                    {otpLoading ? 'Sending...' : isOtpCooldownActive ? `Resend in ${otpCooldownSeconds}s` : 'Resend code'}
                                                </Text>
                                            </TouchableOpacity>
                                            <Text style={styles.helperText}>Check your inbox and spam folder. {otpTimingNote}</Text>

                                            <TouchableOpacity style={styles.linkBlock} onPress={() => setShowingVerification(false)}>
                                                <Text style={styles.linkBlockText}>Back to login</Text>
                                            </TouchableOpacity>
                                        </>
                                    )}
                                </View>
                            </View>
                        </View>
                    </View>
                </ResponsiveContainer>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#FFFFFF' },
    scroll: { paddingVertical: 28, backgroundColor: '#FFFFFF' },
    page: { paddingHorizontal: 20 },
    header: { paddingTop: 12, paddingBottom: 28, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 24 },
    badge: { alignSelf: 'flex-start', backgroundColor: '#FFF1EB', borderWidth: 1, borderColor: '#FFD7C8', color: '#C2410C', fontSize: 12, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
    title: { color: '#0F172A', fontSize: 40, fontWeight: '900', lineHeight: 46, marginBottom: 10, maxWidth: 760 },
    subtitle: { color: '#475569', fontSize: 16, lineHeight: 26, maxWidth: 820, fontWeight: '500' },
    grid: { flexDirection: 'column' },
    gridWide: { flexDirection: 'row', alignItems: 'flex-start' },
    side: { width: '100%', marginBottom: 20 },
    sideWide: { width: 360, marginBottom: 0, marginRight: 28 },
    main: { flex: 1, minWidth: 0 },
    panel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', borderTopWidth: 4, borderTopColor: '#FF6B35', padding: 22, marginBottom: 20, width: '100%', maxWidth: '100%' },
    formPanel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', borderTopWidth: 4, borderTopColor: '#0F172A', padding: 24, width: '100%', maxWidth: '100%' },
    panelLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '800', letterSpacing: 1.1, marginBottom: 10 },
    modeSwitcher: { flexDirection: 'row', marginBottom: 14 },
    modeTab: { flex: 1, borderWidth: 1, borderColor: '#D7DEE7', paddingVertical: 12, alignItems: 'center', backgroundColor: '#FFFFFF', marginRight: 10 },
    modeTabActive: { borderColor: '#0F172A', backgroundColor: '#EEF2FF' },
    modeTabText: { color: '#64748B', fontSize: 13, fontWeight: '800' },
    modeTabTextActive: { color: '#0F172A' },
    listRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    listIndex: { width: 42, borderWidth: 1, borderColor: '#0F172A', paddingVertical: 8, textAlign: 'center', color: '#0F172A', fontSize: 12, fontWeight: '900', marginRight: 14 },
    listText: { flex: 1, color: '#334155', fontSize: 14, lineHeight: 22, fontWeight: '500' },
    featureBlock: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', padding: 16, marginBottom: 12 },
    featureText: { color: '#0F172A', fontSize: 14, lineHeight: 22, fontWeight: '700' },
    switcher: { flexDirection: 'row', marginBottom: 22 },
    switchTab: { flex: 1, borderWidth: 1, borderColor: '#D7DEE7', paddingVertical: 14, alignItems: 'center', marginRight: 12, backgroundColor: '#FFFFFF' },
    switchTabActive: { borderColor: '#0F172A', backgroundColor: '#FFF7F3' },
    switchTabText: { color: '#64748B', fontSize: 15, fontWeight: '700' },
    switchTabTextActive: { color: '#0F172A' },
    fieldLabel: { color: '#475569', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 8, marginTop: 4 },
    input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', color: '#0F172A', fontSize: 16, fontWeight: '500', paddingHorizontal: 16, paddingVertical: 16, marginBottom: 16 },
    passwordField: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', marginBottom: 16 },
    passwordInput: { flex: 1, color: '#0F172A', fontSize: 16, fontWeight: '500', paddingLeft: 16, paddingVertical: 16 },
    passwordToggle: { width: 54, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: '#E2E8F0' },
    inputDisabled: { backgroundColor: '#F8FAFC', color: '#64748B' },
    inputError: { borderColor: '#DC2626' },
    primaryButton: { marginTop: 4, backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#0F172A', paddingVertical: 18, alignItems: 'center' },
    primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    secondaryButton: { marginTop: 2, marginBottom: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#0F172A', paddingVertical: 16, alignItems: 'center' },
    secondaryButtonText: { color: '#0F172A', fontSize: 15, fontWeight: '800' },
    helperText: { color: '#64748B', fontSize: 13, lineHeight: 20, fontWeight: '500', marginBottom: 10, width: '100%', flexShrink: 1 },
    linkBlock: { borderWidth: 1, borderColor: '#CBD5E1', paddingVertical: 16, paddingHorizontal: 16, backgroundColor: '#FFFFFF', marginTop: 12 },
    linkBlockText: { color: '#0F172A', fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 20 },
    errorBox: { borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FFF1F2', padding: 16, marginBottom: 18, width: '100%', maxWidth: '100%', alignSelf: 'stretch' },
    errorText: { color: '#B91C1C', fontSize: 14, fontWeight: '700', lineHeight: 20, width: '100%', flexShrink: 1 },
    disabled: { opacity: 0.7 },
});
