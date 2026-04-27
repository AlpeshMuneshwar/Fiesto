import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import client from '../api/client';
import useApi from '../hooks/useApi';
import ResponsiveContainer from '../components/ResponsiveContainer';

const benefits = [
    'Create one customer account for bookings, discovery, and repeat visits.',
    'Verify your email once, then log in with password or OTP.',
    'Stay ready for QR ordering, reservation tracking, and cafe discovery.',
];

const accessNotes = [
    'Use your full name, email, and password to create the customer account.',
    'After signup, we send a verification code to activate the account.',
    'Once verified, you can log in and continue through the customer portal.',
];

export default function RegisterScreen({ navigation }: any) {
    const { width } = useWindowDimensions();
    const isWide = width > 980;

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [formError, setFormError] = useState<string | null>(null);

    const { loading, execute: register } = useApi(
        (data) => client.post('/auth/register-customer', data, {
            showSuccessToast: true,
            successMessage: 'Account created! Please verify your email.',
        }),
        {
            onError: (err) => {
                setFormError(err?.response?.data?.error || 'We could not create the account right now. Please check the details and try again.');
            },
        }
    );

    const handleRegister = async () => {
        setFormError(null);
        if (!name.trim() || !email.trim() || !password.trim()) {
            Alert.alert('Missing Info', 'Please fill in all fields.');
            return;
        }
        if (password !== confirmPassword) {
            Alert.alert('Password Mismatch', 'Passwords do not match.');
            return;
        }

        const data = await register({ name, email, password });
        if (data) {
            navigation.replace('Login', { email, showingVerification: true, loginMode: 'customer', cooldownUntil: Date.now() + 60000 });
        }
    };

    return (
        <View style={styles.screen}>
            <StatusBar style="dark" />
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <ResponsiveContainer maxWidth={1120}>
                    <View style={styles.page}>
                        <View style={styles.header}>
                            <Text style={styles.badge}>CUSTOMER REGISTRATION</Text>
                            <Text style={styles.title}>Create your Fiesto customer account</Text>
                            <Text style={styles.subtitle}>
                                One clean account for reservations, QR dining journeys, and keeping your cafe activity in one place.
                            </Text>
                        </View>

                        <View style={[styles.grid, isWide && styles.gridWide]}>
                            <View style={[styles.side, isWide && styles.sideWide]}>
                                <View style={styles.panel}>
                                    <Text style={styles.panelLabel}>WHY CREATE AN ACCOUNT</Text>
                                    {benefits.map((item) => (
                                        <View key={item} style={styles.featureBlock}>
                                            <Text style={styles.featureText}>{item}</Text>
                                        </View>
                                    ))}
                                </View>

                                <View style={styles.panel}>
                                    <Text style={styles.panelLabel}>HOW IT WORKS</Text>
                                    {accessNotes.map((item, index) => (
                                        <View key={item} style={[styles.listRow, index < accessNotes.length - 1 && styles.rowBorder]}>
                                            <Text style={styles.listIndex}>{String(index + 1).padStart(2, '0')}</Text>
                                            <Text style={styles.listText}>{item}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>

                            <View style={styles.main}>
                                <View style={styles.formPanel}>
                                    <Text style={styles.formTitle}>Set up your details</Text>
                                    <Text style={styles.formSubtitle}>
                                        After signup, we send a verification code to your email so you can activate the account and continue to login.
                                    </Text>

                                    <Text style={styles.fieldLabel}>Full name</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Your full name"
                                        placeholderTextColor="#94A3B8"
                                        value={name}
                                        onChangeText={setName}
                                    />

                                    <Text style={styles.fieldLabel}>Email address</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="name@example.com"
                                        placeholderTextColor="#94A3B8"
                                        value={email}
                                        onChangeText={setEmail}
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                    />

                                    <Text style={styles.fieldLabel}>Password</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Create a password"
                                        placeholderTextColor="#94A3B8"
                                        value={password}
                                        onChangeText={setPassword}
                                        secureTextEntry
                                    />

                                    <Text style={styles.fieldLabel}>Confirm password</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Confirm your password"
                                        placeholderTextColor="#94A3B8"
                                        value={confirmPassword}
                                        onChangeText={setConfirmPassword}
                                        secureTextEntry
                                    />

                                    {formError ? (
                                        <View style={styles.errorBox}>
                                            <Text style={styles.errorText}>{formError}</Text>
                                        </View>
                                    ) : null}

                                    <TouchableOpacity
                                        style={[styles.primaryButton, loading && styles.disabled]}
                                        onPress={handleRegister}
                                        disabled={loading}
                                    >
                                        <Text style={styles.primaryButtonText}>{loading ? 'Creating account...' : 'Create customer account'}</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity style={styles.linkBlock} onPress={() => navigation.navigate('Login', { loginMode: 'customer' })}>
                                        <Text style={styles.linkBlockText}>Already a customer? Log in</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity style={styles.linkBlock} onPress={() => navigation.navigate('CafeRegistration')}>
                                        <Text style={styles.linkBlockText}>Need client/staff account? Register cafe instead</Text>
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
    subtitle: { color: '#475569', fontSize: 16, lineHeight: 26, maxWidth: 820, fontWeight: '500' },
    grid: { flexDirection: 'column' },
    gridWide: { flexDirection: 'row', alignItems: 'flex-start' },
    side: { width: '100%', marginBottom: 20 },
    sideWide: { width: 360, marginBottom: 0, marginRight: 28 },
    main: { flex: 1, minWidth: 0 },
    panel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', borderTopWidth: 4, borderTopColor: '#FF6B35', padding: 22, marginBottom: 20, width: '100%', maxWidth: '100%' },
    formPanel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', borderTopWidth: 4, borderTopColor: '#0F172A', padding: 24, width: '100%', maxWidth: '100%' },
    panelLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '800', letterSpacing: 1.1, marginBottom: 10 },
    featureBlock: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', padding: 16, marginBottom: 12 },
    featureText: { color: '#0F172A', fontSize: 14, lineHeight: 22, fontWeight: '700' },
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
    linkBlock: { borderWidth: 1, borderColor: '#CBD5E1', paddingVertical: 16, paddingHorizontal: 16, backgroundColor: '#FFFFFF', marginTop: 12 },
    linkBlockText: { color: '#0F172A', fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 20 },
    disabled: { opacity: 0.7 },
});
