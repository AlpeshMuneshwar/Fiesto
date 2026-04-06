import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import client from '../api/client';
import { LinearGradient } from 'expo-linear-gradient';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function CafeRegistrationScreen({ navigation }: any) {
    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState(1); // 1: Email, 2: Details & OTP
    const [form, setForm] = useState({
        cafeName: '',
        cafeSlug: '',
        ownerName: '',
        ownerEmail: '',
        ownerPassword: '',
        otp: '',
    });

    const handleRequestOTP = async () => {
        if (!form.ownerEmail || !form.ownerEmail.includes('@')) {
            setError('Please enter a valid operational email');
            return;
        }
        setVerifying(true);
        setError(null);
        try {
            await client.post('/auth/request-registration-otp', { 
                email: form.ownerEmail,
                purpose: 'VERIFY_EMAIL'
            }, {
                showSuccessToast: true,
                successMessage: 'Verification code sent to your inbox!'
            });
            setStep(2);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to send OTP. Please check your network.');
        } finally {
            setVerifying(false);
        }
    };

    const handleRegister = async () => {
        const { cafeName, cafeSlug, ownerName, ownerEmail, ownerPassword, otp } = form;
        if (!cafeName || !cafeSlug || !ownerName || !ownerEmail || !ownerPassword || !otp) {
            setError('All fields are required to secure your cafe');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            await client.post('/tenant/register', form, {
                showSuccessToast: true,
                successMessage: 'Welcome to the future of dining!'
            });
            navigation.navigate('Login', { email: form.ownerEmail });
        } catch (err: any) {
            setError(err.response?.data?.error || 'Registration failed. Is the OTP correct?');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.mainWrapper}>
            <LinearGradient
                colors={['#0F172A', '#1E293B', '#334155']}
                style={StyleSheet.absoluteFill}
            />
            
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <ResponsiveContainer maxWidth={500}>
                    <View style={styles.container}>
                        <View style={styles.headerBox}>
                            <Text style={styles.badge}>FOR BUSINESS OWNERS</Text>
                            <Text style={styles.title}>CafeQR Onboarding</Text>
                            <Text style={styles.subtitle}>Let's get your digital menu live in seconds.</Text>
                        </View>

                        <View style={styles.card}>
                            {/* Step Indicator */}
                            <View style={styles.stepIndicator}>
                                <View style={[styles.stepDot, step >= 1 && styles.activeDot]} />
                                <View style={[styles.stepLine, step >= 2 && styles.activeLine]} />
                                <View style={[styles.stepDot, step >= 2 && styles.activeDot]} />
                            </View>

                            <View style={styles.form}>
                                {/* STEP 1: Email Verification */}
                                <View>
                                    <Text style={styles.fieldLabel}>Operational Email</Text>
                                    <View style={styles.inputWrapper}>
                                        <TextInput
                                            style={[styles.input, step > 1 && styles.disabledInput]}
                                            placeholder="admin@yourcafe.com"
                                            placeholderTextColor="#94A3B8"
                                            keyboardType="email-address"
                                            autoCapitalize="none"
                                            value={form.ownerEmail}
                                            editable={step === 1}
                                            onChangeText={(val) => setForm({ ...form, ownerEmail: val })}
                                        />
                                        {step === 1 && (
                                            <TouchableOpacity 
                                                style={styles.inlineAction} 
                                                onPress={handleRequestOTP}
                                                disabled={verifying}
                                            >
                                                {verifying ? <ActivityIndicator size="small" color="#3B82F6" /> : <Text style={styles.inlineActionText}>Verify</Text>}
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                    {step > 1 && (
                                        <TouchableOpacity onPress={() => setStep(1)} style={styles.changeBtn}>
                                            <Text style={styles.changeText}>Edit Email</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>

                                {/* STEP 2: Full Form Sequence */}
                                {step >= 2 && (
                                    <View style={styles.stepTwoBox}>
                                        <Text style={styles.fieldLabel}>6-Digit Verification Code</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Ex: 123456"
                                            placeholderTextColor="#94A3B8"
                                            keyboardType="number-pad"
                                            maxLength={6}
                                            onChangeText={(val) => setForm({ ...form, otp: val })}
                                        />

                                        <View style={styles.formDivider} />

                                        <Text style={styles.fieldLabel}>Cafe Name</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="e.g. The Brew House"
                                            placeholderTextColor="#94A3B8"
                                            onChangeText={(val) => setForm({ ...form, cafeName: val })}
                                        />

                                        <Text style={styles.fieldLabel}>Desired URL Slug</Text>
                                        <View style={styles.slugWrapper}>
                                            <Text style={styles.slugPrefix}>cafeqr.com/</Text>
                                            <TextInput
                                                style={styles.slugTextInput}
                                                placeholder="my-cafe"
                                                placeholderTextColor="#94A3B8"
                                                autoCapitalize="none"
                                                onChangeText={(val) => setForm({ ...form, cafeSlug: val.toLowerCase().replace(/\s+/g, '-') })}
                                            />
                                        </View>

                                        <Text style={styles.fieldLabel}>Owner Full Name</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Your Name"
                                            placeholderTextColor="#94A3B8"
                                            onChangeText={(val) => setForm({ ...form, ownerName: val })}
                                        />

                                        <Text style={styles.fieldLabel}>Management Password</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Secure password"
                                            placeholderTextColor="#94A3B8"
                                            secureTextEntry
                                            onChangeText={(val) => setForm({ ...form, ownerPassword: val })}
                                        />

                                        {error && (
                                            <View style={styles.errorBanner}>
                                                <Text style={styles.errorText}>{error}</Text>
                                            </View>
                                        )}

                                        <TouchableOpacity
                                            style={styles.primaryBtn}
                                            onPress={handleRegister}
                                            disabled={loading}
                                        >
                                            {loading ? (
                                                <ActivityIndicator color="white" />
                                            ) : (
                                                <Text style={styles.primaryBtnText}>Launch My Cafe 🚀</Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        </View>
                    </View>
                </ResponsiveContainer>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    mainWrapper: { flex: 1 },
    scrollContent: { paddingBottom: 100 },
    container: { padding: 20, paddingTop: 40 },
    headerBox: { alignItems: 'center', marginBottom: 30 },
    badge: { color: '#3B82F6', fontWeight: '900', fontSize: 12, letterSpacing: 1.5, marginBottom: 10 },
    title: { fontSize: 36, fontWeight: '900', color: 'white', textAlign: 'center' },
    subtitle: { fontSize: 16, color: '#94A3B8', textAlign: 'center', marginTop: 8 },
    card: { 
        backgroundColor: 'rgba(255, 255, 255, 0.98)', 
        borderRadius: 30, 
        padding: 30, 
        shadowColor: '#000', 
        shadowOffset: { width: 0, height: 20 }, 
        shadowOpacity: 0.2, 
        shadowRadius: 40, 
        elevation: 10 
    },
    stepIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
    stepDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#E2E8F0' },
    activeDot: { backgroundColor: '#3B82F6', transform: [{ scale: 1.2 }] },
    stepLine: { width: 60, height: 3, backgroundColor: '#E2E8F0', marginHorizontal: 10 },
    activeLine: { backgroundColor: '#3B82F6' },
    form: { gap: 20 },
    fieldLabel: { fontSize: 13, fontWeight: '800', color: '#64748B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    inputWrapper: { flexDirection: 'row', alignItems: 'center' },
    input: { 
        flex: 1, 
        backgroundColor: 'white', 
        padding: 18, 
        borderRadius: 15, 
        borderWidth: 1.5, 
        borderColor: '#F1F5F9', 
        fontSize: 16, 
        color: '#0F172A',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10
    },
    disabledInput: { backgroundColor: '#F8FAFC', color: '#94A3B8' },
    inlineAction: { position: 'absolute', right: 15 },
    inlineActionText: { color: '#3B82F6', fontWeight: '800', fontSize: 14 },
    changeBtn: { marginTop: 8, paddingLeft: 5 },
    changeText: { color: '#3B82F6', fontWeight: '700', fontSize: 13 },
    stepTwoBox: { gap: 20, marginTop: 10 },
    formDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 15 },
    slugWrapper: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: 'white', 
        borderRadius: 15, 
        borderWidth: 1.5, 
        borderColor: '#F1F5F9',
        paddingHorizontal: 18
    },
    slugPrefix: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
    slugTextInput: { flex: 1, padding: 18, fontSize: 16, color: '#0F172A', fontWeight: '600' },
    primaryBtn: { 
        backgroundColor: '#0F172A', 
        padding: 22, 
        borderRadius: 18, 
        alignItems: 'center', 
        marginTop: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20
    },
    primaryBtnText: { color: 'white', fontWeight: '900', fontSize: 18 },
    errorBanner: { backgroundColor: '#FEF2F2', padding: 18, borderRadius: 15, borderWidth: 1, borderColor: '#FEE2E2', marginTop: 10 },
    errorText: { color: '#DC2626', fontSize: 14, fontWeight: '700', textAlign: 'center' }
});
