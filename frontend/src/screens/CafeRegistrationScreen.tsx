import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import client from '../api/client';
import useCooldownTimer from '../hooks/useCooldownTimer';
import ResponsiveContainer from '../components/ResponsiveContainer';

const trialHighlights = [
    { label: 'Trial period', value: '1 month free' },
    { label: 'Included usage', value: '100 order sessions' },
    { label: 'Base fee after trial', value: 'Rs. 159 / month' },
    { label: 'Extra usage', value: 'Rs. 1 per extra order session' },
];

const pricingRules = [
    'Every new cafe gets the full application free for the first month.',
    'We send an email or call 5 days before the trial ends to ask if you want to continue.',
    'After the trial, the monthly base fee is Rs. 159 and it includes 100 order sessions.',
    'Above 100 order sessions, each extra order session is charged at Rs. 1.',
    'Daytime support during working hours is included.',
];

export default function CafeRegistrationScreen({ navigation }: any) {
    const { width } = useWindowDimensions();
    const isWide = width > 980;

    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState(1);
    const {
        secondsLeft: verificationCooldownSeconds,
        isCoolingDown: isVerificationCooldownActive,
        startCooldown: startVerificationCooldown,
    } = useCooldownTimer();
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
        if (isVerificationCooldownActive) {
            return;
        }

        setVerifying(true);
        setError(null);

        try {
            await client.post('/auth/request-registration-otp', {
                email: form.ownerEmail,
                purpose: 'VERIFY_EMAIL',
            }, {
                showSuccessToast: true,
                successMessage: 'Verification code sent to your inbox!',
            });
            setStep(2);
            startVerificationCooldown(60);
        } catch (err: any) {
            if (err.response?.data?.retryAfterSeconds) {
                startVerificationCooldown(err.response.data.retryAfterSeconds);
            }
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
                successMessage: 'Welcome to the future of dining!',
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
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <ResponsiveContainer maxWidth={1180}>
                    <View style={styles.page}>
                        <View style={styles.headerBlock}>
                            <Text style={styles.eyebrow}>FOR BUSINESS OWNERS</Text>
                            <Text style={styles.title}>Set up your cafe on Fiesto</Text>
                            <Text style={styles.subtitle}>
                                Clean onboarding, a 1-month free trial, and pricing your team can understand in one look.
                            </Text>
                        </View>

                        <View style={[styles.contentGrid, isWide && styles.contentGridWide]}>
                            <View style={[styles.infoColumn, isWide && styles.infoColumnWide]}>
                                <View style={styles.infoBlock}>
                                    <Text style={styles.blockLabel}>TRIAL SNAPSHOT</Text>
                                    <Text style={styles.blockTitle}>Straight pricing, no guesswork</Text>
                                    <Text style={styles.blockCopy}>
                                        Start free, review the product with your team, and decide after we reach out before the trial ends.
                                    </Text>

                                    <View style={styles.statGrid}>
                                        {trialHighlights.map((item) => (
                                            <View key={item.label} style={styles.statCard}>
                                                <Text style={styles.statLabel}>{item.label}</Text>
                                                <Text style={styles.statValue}>{item.value}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>

                                <View style={styles.infoBlock}>
                                    <Text style={styles.blockLabel}>HOW BILLING WORKS</Text>
                                    <Text style={styles.blockTitle}>What happens after signup</Text>

                                    {pricingRules.map((rule, index) => (
                                        <View key={rule} style={[styles.ruleRow, index < pricingRules.length - 1 && styles.ruleRowBorder]}>
                                            <View style={styles.ruleIndex}>
                                                <Text style={styles.ruleIndexText}>{String(index + 1).padStart(2, '0')}</Text>
                                            </View>
                                            <Text style={styles.ruleText}>{rule}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>

                            <View style={[styles.formColumn, isWide && styles.formColumnWide]}>
                                <View style={styles.formShell}>
                                    <View style={styles.stepHeader}>
                                        <View style={[styles.stepCard, step >= 1 && styles.stepCardActive]}>
                                            <Text style={[styles.stepNumber, step >= 1 && styles.stepNumberActive]}>01</Text>
                                            <Text style={[styles.stepName, step >= 1 && styles.stepNameActive]}>Verify email</Text>
                                        </View>
                                        <View style={[styles.stepCard, step >= 2 && styles.stepCardActive]}>
                                            <Text style={[styles.stepNumber, step >= 2 && styles.stepNumberActive]}>02</Text>
                                            <Text style={[styles.stepName, step >= 2 && styles.stepNameActive]}>Cafe details</Text>
                                        </View>
                                    </View>

                                    <Text style={styles.formTitle}>
                                        {step === 1 ? 'Start with your operational email' : 'Complete your cafe setup'}
                                    </Text>
                                    <Text style={styles.formSubtitle}>
                                        {step === 1
                                            ? 'We will send a verification code first, then unlock the rest of the setup form.'
                                            : 'Finish the registration details below to create your cafe workspace.'}
                                    </Text>

                                    <View style={styles.formSection}>
                                        <Text style={styles.fieldLabel}>Operational email</Text>
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

                                        {step === 1 ? (
                                            <TouchableOpacity
                                                style={[styles.secondaryButton, (verifying || isVerificationCooldownActive) && styles.buttonDisabled]}
                                                onPress={handleRequestOTP}
                                                disabled={verifying || isVerificationCooldownActive}
                                            >
                                                {verifying ? (
                                                    <ActivityIndicator size="small" color="#0F172A" />
                                                ) : (
                                                    <Text style={styles.secondaryButtonText}>
                                                        {isVerificationCooldownActive ? `Resend in ${verificationCooldownSeconds}s` : 'Send verification code'}
                                                    </Text>
                                                )}
                                            </TouchableOpacity>
                                        ) : (
                                            <View style={styles.inlineActionRow}>
                                                <TouchableOpacity onPress={() => setStep(1)} style={styles.inlineTextButton}>
                                                    <Text style={styles.inlineTextButtonLabel}>Change email</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={handleRequestOTP}
                                                    style={[styles.inlineTextButton, isVerificationCooldownActive && styles.buttonDisabled]}
                                                    disabled={verifying || isVerificationCooldownActive}
                                                >
                                                    <Text style={styles.inlineTextButtonLabel}>
                                                        {verifying ? 'Sending...' : isVerificationCooldownActive ? `Resend in ${verificationCooldownSeconds}s` : 'Resend code'}
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                        <Text style={styles.helperText}>
                                            {step === 1
                                                ? `We send one verification code at a time. ${isVerificationCooldownActive ? `Try again in ${verificationCooldownSeconds}s.` : 'You can request a new code every 60 seconds.'}`
                                                : `We sent the code to ${form.ownerEmail || 'your email'}. Check inbox and spam. ${isVerificationCooldownActive ? `Resend available in ${verificationCooldownSeconds}s.` : 'You can resend if needed.'}`}
                                        </Text>
                                    </View>

                                    {step >= 2 && (
                                        <View style={styles.stepTwoSection}>
                                            <View style={styles.divider} />

                                            <View style={styles.formSection}>
                                                <Text style={styles.fieldLabel}>6-digit verification code</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    placeholder="123456"
                                                    placeholderTextColor="#94A3B8"
                                                    keyboardType="number-pad"
                                                    maxLength={6}
                                                    value={form.otp}
                                                    onChangeText={(val) => setForm({ ...form, otp: val })}
                                                />
                                            </View>

                                            <View style={styles.formSection}>
                                                <Text style={styles.fieldLabel}>Cafe name</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    placeholder="The Brew House"
                                                    placeholderTextColor="#94A3B8"
                                                    value={form.cafeName}
                                                    onChangeText={(val) => setForm({ ...form, cafeName: val })}
                                                />
                                            </View>

                                            <View style={styles.formSection}>
                                                <Text style={styles.fieldLabel}>Desired URL slug</Text>
                                                <View style={styles.slugWrapper}>
                                                    <Text style={styles.slugPrefix}>cafeqr.com/</Text>
                                                    <TextInput
                                                        style={styles.slugInput}
                                                        placeholder="my-cafe"
                                                        placeholderTextColor="#94A3B8"
                                                        autoCapitalize="none"
                                                        value={form.cafeSlug}
                                                        onChangeText={(val) => setForm({ ...form, cafeSlug: val.toLowerCase().replace(/\s+/g, '-') })}
                                                    />
                                                </View>
                                            </View>

                                            <View style={styles.formSection}>
                                                <Text style={styles.fieldLabel}>Owner full name</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    placeholder="Your name"
                                                    placeholderTextColor="#94A3B8"
                                                    value={form.ownerName}
                                                    onChangeText={(val) => setForm({ ...form, ownerName: val })}
                                                />
                                            </View>

                                            <View style={styles.formSection}>
                                                <Text style={styles.fieldLabel}>Management password</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    placeholder="Secure password"
                                                    placeholderTextColor="#94A3B8"
                                                    secureTextEntry
                                                    value={form.ownerPassword}
                                                    onChangeText={(val) => setForm({ ...form, ownerPassword: val })}
                                                />
                                            </View>

                                            {error && (
                                                <View style={styles.errorBanner}>
                                                    <Text style={styles.errorText}>{error}</Text>
                                                </View>
                                            )}

                                            <TouchableOpacity
                                                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                                                onPress={handleRegister}
                                                disabled={loading}
                                            >
                                                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Create cafe workspace</Text>}
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {step === 1 && error && (
                                        <View style={styles.errorBanner}>
                                            <Text style={styles.errorText}>{error}</Text>
                                        </View>
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
    mainWrapper: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    scrollContent: {
        paddingVertical: 28,
        backgroundColor: '#FFFFFF',
    },
    page: {
        paddingHorizontal: 20,
    },
    headerBlock: {
        paddingTop: 12,
        paddingBottom: 28,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        marginBottom: 24,
    },
    eyebrow: {
        alignSelf: 'flex-start',
        backgroundColor: '#FFF1EB',
        borderWidth: 1,
        borderColor: '#FFD7C8',
        color: '#C2410C',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: 16,
    },
    title: {
        color: '#0F172A',
        fontSize: 42,
        fontWeight: '900',
        lineHeight: 48,
        marginBottom: 10,
        maxWidth: 700,
    },
    subtitle: {
        color: '#475569',
        fontSize: 16,
        lineHeight: 26,
        maxWidth: 780,
        fontWeight: '500',
    },
    contentGrid: {
        flexDirection: 'column',
    },
    contentGridWide: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    infoColumn: {
        width: '100%',
        marginBottom: 20,
    },
    infoColumnWide: {
        width: 380,
        marginBottom: 0,
        marginRight: 28,
    },
    formColumn: {
        width: '100%',
    },
    formColumnWide: {
        flex: 1,
        minWidth: 0,
    },
    infoBlock: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#D7DEE7',
        borderTopWidth: 4,
        borderTopColor: '#FF6B35',
        padding: 22,
        marginBottom: 20,
        width: '100%',
        maxWidth: '100%',
    },
    blockLabel: {
        color: '#94A3B8',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1.2,
        marginBottom: 10,
    },
    blockTitle: {
        color: '#0F172A',
        fontSize: 24,
        fontWeight: '900',
        lineHeight: 30,
        marginBottom: 10,
    },
    blockCopy: {
        color: '#475569',
        fontSize: 14,
        lineHeight: 22,
        fontWeight: '500',
        marginBottom: 20,
    },
    statGrid: {
        flexDirection: 'column',
    },
    statCard: {
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 16,
        marginBottom: 12,
    },
    statLabel: {
        color: '#64748B',
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 8,
    },
    statValue: {
        color: '#0F172A',
        fontSize: 18,
        fontWeight: '900',
        lineHeight: 24,
    },
    ruleRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 14,
    },
    ruleRowBorder: {
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    ruleIndex: {
        width: 42,
        borderWidth: 1,
        borderColor: '#0F172A',
        paddingVertical: 8,
        alignItems: 'center',
        marginRight: 14,
    },
    ruleIndexText: {
        color: '#0F172A',
        fontSize: 12,
        fontWeight: '900',
    },
    ruleText: {
        flex: 1,
        color: '#334155',
        fontSize: 14,
        lineHeight: 22,
        fontWeight: '500',
    },
    formShell: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#D7DEE7',
        borderTopWidth: 4,
        borderTopColor: '#0F172A',
        padding: 24,
        width: '100%',
        maxWidth: '100%',
    },
    stepHeader: {
        flexDirection: 'row',
        marginBottom: 22,
    },
    stepCard: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#D7DEE7',
        padding: 14,
        marginRight: 12,
        backgroundColor: '#FFFFFF',
    },
    stepCardActive: {
        borderColor: '#0F172A',
        backgroundColor: '#FFF7F3',
    },
    stepNumber: {
        color: '#94A3B8',
        fontSize: 12,
        fontWeight: '900',
        marginBottom: 6,
    },
    stepNumberActive: {
        color: '#C2410C',
    },
    stepName: {
        color: '#64748B',
        fontSize: 15,
        fontWeight: '700',
    },
    stepNameActive: {
        color: '#0F172A',
    },
    formTitle: {
        color: '#0F172A',
        fontSize: 30,
        fontWeight: '900',
        lineHeight: 36,
        marginBottom: 8,
    },
    formSubtitle: {
        color: '#475569',
        fontSize: 15,
        lineHeight: 24,
        marginBottom: 24,
        fontWeight: '500',
    },
    formSection: {
        marginBottom: 18,
    },
    stepTwoSection: {
        marginTop: 4,
    },
    divider: {
        height: 1,
        backgroundColor: '#E5E7EB',
        marginBottom: 20,
    },
    fieldLabel: {
        color: '#475569',
        fontSize: 12,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.9,
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#CBD5E1',
        color: '#0F172A',
        fontSize: 16,
        fontWeight: '500',
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    disabledInput: {
        backgroundColor: '#F8FAFC',
        color: '#64748B',
    },
    slugWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#CBD5E1',
        backgroundColor: '#FFFFFF',
    },
    slugPrefix: {
        color: '#64748B',
        fontSize: 14,
        fontWeight: '700',
        backgroundColor: '#F8FAFC',
        borderRightWidth: 1,
        borderRightColor: '#CBD5E1',
        paddingHorizontal: 14,
        paddingVertical: 17,
    },
    slugInput: {
        flex: 1,
        color: '#0F172A',
        fontSize: 16,
        fontWeight: '600',
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    secondaryButton: {
        marginTop: 12,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#0F172A',
        paddingVertical: 16,
        alignItems: 'center',
    },
    secondaryButtonText: {
        color: '#0F172A',
        fontSize: 15,
        fontWeight: '800',
    },
    inlineTextButton: {
        alignSelf: 'flex-start',
        marginTop: 12,
        borderWidth: 1,
        borderColor: '#CBD5E1',
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    inlineActionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: 12,
    },
    inlineTextButtonLabel: {
        color: '#0F172A',
        fontSize: 13,
        fontWeight: '700',
    },
    helperText: {
        color: '#64748B',
        fontSize: 13,
        lineHeight: 20,
        fontWeight: '500',
        marginTop: 12,
        width: '100%',
        flexShrink: 1,
    },
    primaryButton: {
        marginTop: 8,
        backgroundColor: '#0F172A',
        borderWidth: 1,
        borderColor: '#0F172A',
        paddingVertical: 18,
        alignItems: 'center',
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    errorBanner: {
        borderWidth: 1,
        borderColor: '#FECACA',
        backgroundColor: '#FFF1F2',
        padding: 16,
        marginTop: 6,
        width: '100%',
        maxWidth: '100%',
        alignSelf: 'stretch',
    },
    errorText: {
        color: '#B91C1C',
        fontSize: 14,
        fontWeight: '700',
        lineHeight: 20,
        width: '100%',
        flexShrink: 1,
    },
});
