import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, useWindowDimensions } from 'react-native';
import client from '../api/client';
import ResponsiveContainer from '../components/ResponsiveContainer';

const notes = [
    'Password recovery works only for email addresses that already have an account.',
    'We send a 6-digit code to that existing account email.',
    'Use the next screen to enter the code and set a new password.',
];

export default function ForgotPasswordScreen({ navigation }: any) {
    const { width } = useWindowDimensions();
    const isWide = width > 980;
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSend = async () => {
        if (!email.trim()) {
            Alert.alert('Email Required', 'Please enter your email address.');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            await client.post('/auth/forgot-password', { email });
            Alert.alert('OTP Sent', 'A 6-digit verification code has been sent to your email.');
            navigation.navigate('ResetPassword', { email, cooldownUntil: Date.now() + 60000 });
        } catch (e: any) {
            setError(e.response?.data?.error || 'We could not send the reset code. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.screen}>
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <ResponsiveContainer maxWidth={1120}>
                    <View style={styles.page}>
                        <View style={styles.header}>
                            <Text style={styles.badge}>PASSWORD RECOVERY</Text>
                            <Text style={styles.title}>Reset access with a verification code</Text>
                            <Text style={styles.subtitle}>
                                This recovery flow is for existing accounts. Request a code here, then set a new password on the next screen.
                            </Text>
                        </View>

                        <View style={[styles.grid, isWide && styles.gridWide]}>
                            <View style={[styles.side, isWide && styles.sideWide]}>
                                <View style={styles.panel}>
                                    <Text style={styles.panelLabel}>RECOVERY FLOW</Text>
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
                                    <Text style={styles.formTitle}>Send reset code</Text>
                                    <Text style={styles.formSubtitle}>
                                        Use the email already linked to your account. We will send a 6-digit code you can use to reset the password.
                                    </Text>

                                    <Text style={styles.fieldLabel}>Email address</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="name@example.com"
                                        placeholderTextColor="#94A3B8"
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        value={email}
                                        onChangeText={setEmail}
                                    />

                                    {error ? (
                                        <View style={styles.errorBox}>
                                            <Text style={styles.errorText}>{error}</Text>
                                        </View>
                                    ) : null}

                                    <TouchableOpacity style={[styles.primaryButton, loading && styles.disabled]} onPress={handleSend} disabled={loading}>
                                        {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Send reset OTP</Text>}
                                    </TouchableOpacity>

                                    <Text style={styles.helperText}>
                                        Only existing accounts can receive a reset code. If you are new, create an account first.
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
    helperText: { color: '#64748B', fontSize: 13, lineHeight: 20, fontWeight: '500', marginTop: 10, width: '100%', flexShrink: 1 },
    linkBlock: { borderWidth: 1, borderColor: '#CBD5E1', paddingVertical: 16, paddingHorizontal: 16, backgroundColor: '#FFFFFF', marginTop: 12 },
    linkBlockText: { color: '#0F172A', fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 20 },
    disabled: { opacity: 0.7 },
});
