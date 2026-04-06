import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { ChefHat, ArrowRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [isOtpMode, setIsOtpMode] = useState(false);
    const [showingVerification, setShowingVerification] = useState(false);
    const [loading, setLoading] = useState(false);
    
    const { login, loginWithOtp, requestOtp, verifyEmail } = useAuth();

    const handleLogin = async () => {
        if (!email) {
            Alert.alert('Error', 'Please enter your email address');
            return;
        }
        if (isOtpMode && !otp) {
            Alert.alert('Error', 'Please enter the 6-digit OTP');
            return;
        }
        if (!isOtpMode && !password) {
            Alert.alert('Error', 'Please enter your passcode');
            return;
        }
        setLoading(true);
        try {
            if (isOtpMode) {
                await loginWithOtp(email, otp);
            } else {
                await login(email, password);
            }
        } catch (e) {
            if (e.needsVerification) {
                setShowingVerification(true);
                Alert.alert('Verification Required', 'Please check your email for the OTP.');
            } else {
                Alert.alert('Kitchen Login Failed', e.message || 'Check credentials');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSendOtp = async () => {
        if (!email) {
            Alert.alert('Error', 'Please enter email first');
            return;
        }
        setLoading(true);
        try {
            await requestOtp(email, showingVerification ? 'VERIFY_EMAIL' : 'LOGIN');
            Alert.alert('Success', 'OTP sent to your email');
        } catch (e) {
            Alert.alert('Error', e.message || 'Failed to send OTP');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyEmail = async () => {
        if (!otp) {
            Alert.alert('Error', 'Please enter OTP');
            return;
        }
        setLoading(true);
        try {
            await verifyEmail(email, otp);
            Alert.alert('Success', 'Email verified! You can now login.');
            setShowingVerification(false);
            setOtp('');
        } catch (e) {
            Alert.alert('Verification Failed', e.message || 'Check OTP');
        } finally {
            setLoading(false);
        }
    };

    const renderVerificationUI = () => (
        <View style={styles.card}>
            <View style={styles.iconContainer}>
                <ChefHat color="#FFFFFF" size={36} />
            </View>
            <Text style={styles.title}>Verify Email</Text>
            <Text style={styles.subtitle}>Enter the 6-digit OTP sent to {email}</Text>

            <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>OTP CODE</Text>
                <TextInput
                    style={styles.input}
                    placeholder="• • • • • •"
                    placeholderTextColor="#94A3B8"
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                />
            </View>

            <TouchableOpacity 
                style={[styles.button, loading && styles.buttonDisabled]} 
                onPress={handleVerifyEmail}
                disabled={loading}
                activeOpacity={0.8}
            >
                {loading ? <ActivityIndicator color="white" /> : (
                    <>
                        <Text style={styles.buttonText}>Verify & Continue</Text>
                        <ArrowRight color="#FFFFFF" size={20} />
                    </>
                )}
            </TouchableOpacity>

            <View style={styles.footerLinksGrid}>
                <TouchableOpacity onPress={handleSendOtp} style={styles.linkButtonSecondary}>
                    <Text style={styles.linkTextSecondary}>Resend OTP</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowingVerification(false)} style={styles.linkButtonSecondary}>
                    <Text style={styles.linkTextSecondary}>Back to Login</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderLoginUI = () => (
        <View style={styles.card}>
            <View style={styles.iconContainer}>
                <ChefHat color="#FFFFFF" size={40} />
            </View>
            <Text style={styles.title}>Kitchen Console</Text>
            <Text style={styles.subtitle}>Enter your kitchen pass to start cooking</Text>

            <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>CHEF ID / EMAIL</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Enter your ID or Email"
                    placeholderTextColor="#94A3B8"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />
            </View>

            {!isOtpMode ? (
                <View style={styles.inputGroup}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.inputLabel}>KITCHEN PASSCODE</Text>
                        <TouchableOpacity onPress={() => Alert.alert('Forgot Passcode', 'Please contact your Admin to reset your passcode, or use Login with OTP.')}>
                            <Text style={styles.linkTextSmall}>Forgot?</Text>
                        </TouchableOpacity>
                    </View>
                    <TextInput
                        style={styles.input}
                        placeholder="••••••••"
                        placeholderTextColor="#94A3B8"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />
                </View>
            ) : (
                <View style={styles.inputGroup}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.inputLabel}>OTP CODE</Text>
                        <TouchableOpacity onPress={handleSendOtp}>
                            <Text style={styles.linkTextSmall}>Send OTP</Text>
                        </TouchableOpacity>
                    </View>
                    <TextInput
                        style={styles.input}
                        placeholder="• • • • • •"
                        placeholderTextColor="#94A3B8"
                        value={otp}
                        onChangeText={setOtp}
                        keyboardType="number-pad"
                        maxLength={6}
                    />
                </View>
            )}

            <TouchableOpacity 
                style={[styles.button, loading && styles.buttonDisabled]} 
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.8}
            >
                {loading ? (
                    <ActivityIndicator color="white" />
                ) : (
                    <>
                        <Text style={styles.buttonText}>{isOtpMode ? 'Sign In with OTP' : 'Enter Kitchen'}</Text>
                        <ArrowRight color="#FFFFFF" size={20} />
                    </>
                )}
            </TouchableOpacity>

            <View style={styles.footerLinks}>
                <TouchableOpacity onPress={() => setIsOtpMode(!isOtpMode)} style={styles.toggleModeBtn}>
                    <Text style={styles.linkTextSecondary}>{isOtpMode ? 'Use Passcode instead' : 'Login with OTP'}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <LinearGradient
            colors={['#7C2D12', '#9A3412', '#C2410C']}
            style={styles.container}
        >
            <SafeAreaView style={{ flex: 1 }}>
                <KeyboardAvoidingView 
                    style={{ flex: 1 }} 
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                        {showingVerification ? renderVerificationUI() : renderLoginUI()}
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    card: { 
        backgroundColor: 'rgba(255, 255, 255, 0.98)', 
        padding: 32, 
        borderRadius: 32, 
        shadowColor: '#000', 
        shadowOffset: { width: 0, height: 24 }, 
        shadowOpacity: 0.35, 
        shadowRadius: 36,
        elevation: 16,
    },
    iconContainer: { 
        alignSelf: 'flex-start', 
        backgroundColor: '#EA580C', 
        padding: 16, 
        borderRadius: 20, 
        marginBottom: 24,
        shadowColor: '#EA580C',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
    },
    title: { fontSize: 32, fontWeight: '900', color: '#431407', marginBottom: 6, letterSpacing: -1 },
    subtitle: { color: '#9A3412', marginBottom: 32, fontSize: 16, fontWeight: '600' },
    inputGroup: { marginBottom: 20 },
    inputLabel: { fontSize: 12, fontWeight: '800', color: '#B45309', paddingLeft: 4, marginBottom: 8, letterSpacing: 0.5 },
    input: { 
        backgroundColor: '#FFF7ED', 
        padding: 18, 
        borderRadius: 16, 
        fontSize: 16, 
        borderWidth: 1, 
        borderColor: '#FED7AA',
        fontWeight: '600',
        color: '#7C2D12'
    },
    button: { 
        backgroundColor: '#EA580C', 
        padding: 20, 
        borderRadius: 16, 
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center', 
        marginTop: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 15,
        elevation: 8,
    },
    buttonDisabled: { opacity: 0.7 },
    buttonText: { color: 'white', fontWeight: '800', fontSize: 16, marginRight: 8 },
    linkTextSmall: { color: '#EA580C', fontWeight: '700', fontSize: 13 },
    footerLinks: { marginTop: 24, paddingTop: 24, borderTopWidth: 1, borderTopColor: '#FFEDD5', alignItems: 'center' },
    toggleModeBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#FFF7ED' },
    linkTextSecondary: { color: '#B45309', fontWeight: '700', fontSize: 14 },
    footerLinksGrid: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 24, paddingTop: 24, borderTopWidth: 1, borderTopColor: '#FFEDD5' },
    linkButtonSecondary: { paddingVertical: 8 }
});
