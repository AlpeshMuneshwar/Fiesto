import React, { useState } from 'react';
import { Text, StyleSheet, TextInput, TouchableOpacity, Alert, SafeAreaView, ActivityIndicator } from 'react-native';
import client from '../api/client';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function ResetPasswordScreen({ route, navigation }: any) {
    const { email: initialEmail } = route.params || {};
    const [email, setEmail] = useState(initialEmail || '');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleReset = async () => {
        if (!email || !otp || !newPassword) {
            Alert.alert("Error", "Please fill all fields");
            return;
        }
        setLoading(true);
        try {
            const res = await client.post('/auth/reset-password', { email, otp, newPassword });
            Alert.alert("Success", "Password reset successfully. You can now login with your new password.");
            navigation.replace('Login');
        } catch (e: any) {
            // Global toast handles error
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ResponsiveContainer maxWidth={400} style={styles.inner}>
                <Text style={styles.title}>Reset Password</Text>
                <Text style={styles.desc}>Enter the 6-digit code sent to your email and choose a new password.</Text>
                
                <TextInput
                    style={styles.input}
                    placeholder="Email Address"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                />

                <TextInput
                    style={styles.input}
                    placeholder="6-digit OTP"
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                />
                
                <TextInput
                    style={styles.input}
                    placeholder="New Password"
                    secureTextEntry
                    value={newPassword}
                    onChangeText={setNewPassword}
                />
                <TouchableOpacity style={styles.btn} onPress={handleReset} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Reset Password</Text>}
                </TouchableOpacity>

                <TouchableOpacity style={{marginTop: 20}} onPress={() => navigation.navigate('Login')}>
                    <Text style={{color: '#3B82F6', textAlign: 'center', fontWeight: '600'}}>Back to Login</Text>
                </TouchableOpacity>
            </ResponsiveContainer>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFA', justifyContent: 'center' },
    inner: { padding: 20 },
    title: { fontSize: 24, fontWeight: '800', marginBottom: 15, color: '#0F172A', textAlign: 'center' },
    desc: { fontSize: 16, color: '#64748B', marginBottom: 30, textAlign: 'center', lineHeight: 22 },
    input: { backgroundColor: 'white', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 16, marginBottom: 20 },
    btn: { backgroundColor: '#10B981', padding: 16, borderRadius: 12, alignItems: 'center' },
    btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});
