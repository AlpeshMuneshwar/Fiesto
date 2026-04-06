import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, useWindowDimensions } from 'react-native';
import client from '../api/client';
import useCooldownTimer from '../hooks/useCooldownTimer';
import ResponsiveContainer from '../components/ResponsiveContainer';

const notes = [
    'Use the same email address from the existing account where the reset code was sent.',
    'Enter the 6-digit code exactly as received.',
    'Choose a new password, then return to login with the updated credentials.',
];

export default function ResetPasswordScreen({ route, navigation }: any) {
    const { width } = useWindowDimensions();
    const isWide = width > 980;
    const { email: initialEmail } = route.params || {};
    const initialCooldownSeconds = route.params?.cooldownUntil
        ? Math.max(0, Math.ceil((route.params.cooldownUntil - Date.now()) / 1000))
        : 0;
    const {
        secondsLeft: resendCooldownSeconds,
        isCoolingDown: isResendCooldownActive,
        startCooldown: startResendCooldown,
    } = useCooldownTimer(initialCooldownSeconds);
    const [email, setEmail] = useState(initialEmail || '');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleReset = async () => {
        if (!email || !otp || !newPassword) {
            Alert.alert('Error', 'Please fill all fields');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            await client.post('/auth/reset-password', { email, otp, newPassword });
            Alert.alert('Success', 'Password reset successfully. You can now login with your new password.');
            navigation.replace('Login');
        } catch (e: any) {
            setError(e.response?.data?.error || 'We could not reset the password. Please check the code and try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (!email.trim() || isResendCooldownActive) {
            return;
        }

        setResending(true);
        setError(null);
        try {
            await client.post('/auth/forgot-password', { email });
            startResendCooldown(60);
            Alert.alert('Code Sent', 'A fresh reset code has been sent to your email.');
        } catch (e: any) {
            if (e.response?.data?.retryAfterSeconds) {
                startResendCooldown(e.response.data.retryAfterSeconds);
            }
            setError(e.response?.data?.error || 'We could not send another code right now. Please try again.');
        } finally {
            setResending(false);
        }
    };

    return (
        <View style={styles.screen}>
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <ResponsiveContainer maxWidth={1120}>
                    <View style={styles.page}>
                        <View style={styles.header}>
                            <Text style={styles.badge}>SET NEW PASSWORD</Text>
                            <Text style={styles.title}>Enter your code and choose a new password</Text>
                            <Text style={styles.subtitle}>
                                Finish the recovery flow for your existing account by confirming the email, entering the reset code, and saving a new password.
                            </Text>
                        </View>

                        <View style={[styles.grid, isWide && styles.gridWide]}>
                            <View style={[styles.side, isWide && styles.sideWide]}>
                                <View style={styles.panel}>
                                    <Text style={styles.panelLabel}>RESET STEPS</Text>
                                    {notes.map((note, index) => (
                                        <View key={note} style={[styles.listRow, index < notes.length - 1 && styles.rowBorder]}>
                                            <Text style={styles.listIndex}>{String(index + 1).padStart(2, '0')}</Text>
                                            <Text style={styles.listText}>{note}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>

                            <View style={styles.main}>
                                <View style={styles.formPanel}>
                                    <Text style={styles.formTitle}>Reset password</Text>
                                    <Text style={styles.formSubtitle}>
                                        Use the code from your email and save a new password for the existing account.
                                    </Text>

                                    <Text style={styles.fieldLabel}>Email address</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="name@example.com"
                                        placeholderTextColor="#94A3B8"
                                        value={email}
                                        onChangeText={setEmail}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                    />

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

                                    <Text style={styles.fieldLabel}>New password</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Enter your new password"
                                        placeholderTextColor="#94A3B8"
                                        secureTextEntry
                                        value={newPassword}
                                        onChangeText={setNewPassword}
                                    />

                                    {error ? (
                                        <View style={styles.errorBox}>
                                            <Text style={styles.errorText}>{error}</Text>
                                        </View>
                                    ) : null}

                                    <TouchableOpacity style={[styles.primaryButton, loading && styles.disabled]} onPress={handleReset} disabled={loading}>
                                        {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Reset password</Text>}
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[styles.secondaryButton, (resending || isResendCooldownActive) && styles.disabled]}
                                        onPress={handleResend}
                                        disabled={resending || isResendCooldownActive}
                                    >
                                        <Text style={styles.secondaryButtonText}>
                                            {resending ? 'Sending...' : isResendCooldownActive ? `Resend in ${resendCooldownSeconds}s` : 'Resend code'}
                                        </Text>
                                    </TouchableOpacity>
                                    <Text style={styles.helperText}>
                                        Check your inbox and spam folder. {isResendCooldownActive ? `You can ask for another code in ${resendCooldownSeconds}s.` : 'You can request a new code every 60 seconds.'}
                                    </Text>

                                    <TouchableOpacity style={styles.linkBlock} onPress={() => navigation.navigate('Login')}>
                                        <Text style={styles.linkBlockText}>Back to login</Text>
                                    </TouchableOpacity>
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
    subtitle: { color: '#475569', fontSize: 16, lineHeight: 26, maxWidth: 760, fontWeight: '500' },
    grid: { flexDirection: 'column' },
    gridWide: { flexDirection: 'row', alignItems: 'flex-start' },
    side: { width: '100%', marginBottom: 20 },
    sideWide: { width: 360, marginBottom: 0, marginRight: 28 },
    main: { flex: 1, minWidth: 0 },
    panel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', borderTopWidth: 4, borderTopColor: '#FF6B35', padding: 22, width: '100%', maxWidth: '100%' },
    formPanel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', borderTopWidth: 4, borderTopColor: '#0F172A', padding: 24, width: '100%', maxWidth: '100%' },
    panelLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '800', letterSpacing: 1.1, marginBottom: 10 },
    listRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    listIndex: { width: 42, borderWidth: 1, borderColor: '#0F172A', paddingVertical: 8, textAlign: 'center', color: '#0F172A', fontSize: 12, fontWeight: '900', marginRight: 14 },
    listText: { flex: 1, color: '#334155', fontSize: 14, lineHeight: 22, fontWeight: '500' },
    formTitle: { color: '#0F172A', fontSize: 30, fontWeight: '900', lineHeight: 36, marginBottom: 8 },
    formSubtitle: { color: '#475569', fontSize: 15, lineHeight: 24, marginBottom: 24, fontWeight: '500' },
    fieldLabel: { color: '#475569', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 8, marginTop: 4 },
    input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', color: '#0F172A', fontSize: 16, fontWeight: '500', paddingHorizontal: 16, paddingVertical: 16, marginBottom: 16 },
    errorBox: { borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FFF1F2', padding: 16, marginBottom: 12, width: '100%', maxWidth: '100%', alignSelf: 'stretch' },
    errorText: { color: '#B91C1C', fontSize: 14, fontWeight: '700', lineHeight: 20, width: '100%', flexShrink: 1 },
    primaryButton: { marginTop: 4, backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#0F172A', paddingVertical: 18, alignItems: 'center' },
    primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    secondaryButton: { marginTop: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#0F172A', paddingVertical: 16, alignItems: 'center' },
    secondaryButtonText: { color: '#0F172A', fontSize: 15, fontWeight: '800' },
    helperText: { color: '#64748B', fontSize: 13, lineHeight: 20, fontWeight: '500', marginTop: 10, width: '100%', flexShrink: 1 },
    linkBlock: { borderWidth: 1, borderColor: '#CBD5E1', paddingVertical: 16, paddingHorizontal: 16, backgroundColor: '#FFFFFF', marginTop: 12 },
    linkBlockText: { color: '#0F172A', fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 20 },
    disabled: { opacity: 0.7 },
});
