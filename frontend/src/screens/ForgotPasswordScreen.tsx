import React, { useState } from 'react';
import { Text, StyleSheet, TextInput, TouchableOpacity, Alert, SafeAreaView, ActivityIndicator } from 'react-native';
import client from '../api/client';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function ForgotPasswordScreen({ navigation }: any) {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSend = async () => {
        if (!email) return;
        setLoading(true);
        try {
            const res = await client.post('/auth/forgot-password', { email });
            setSent(true);
            Alert.alert("Success", res.data.message);
        } catch (e: any) {
            // Error mapped by global toast interceptor
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ResponsiveContainer maxWidth={400} style={styles.inner}>
                <Text style={styles.title}>Forgot Password</Text>
                {sent ? (
                    <>
                        <Text style={styles.desc}>Check your email for the reset link. (For local development, check the backend console logs!)</Text>
                        <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('Login')}>
                            <Text style={styles.btnText}>Back to Login</Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <Text style={styles.desc}>Enter your email address and we'll send you a link to reset your password.</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Email Address"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            value={email}
                            onChangeText={setEmail}
                        />
                        <TouchableOpacity style={styles.btn} onPress={handleSend} disabled={loading}>
                            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send Reset Link</Text>}
                        </TouchableOpacity>
                        
                        <TouchableOpacity style={{marginTop: 20}} onPress={() => navigation.navigate('ResetPassword', { token: 'MANUAL_TEST' })}>
                            <Text style={styles.secondaryText}>I have a reset token</Text>
                        </TouchableOpacity>
                    </>
                )}
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
    btn: { backgroundColor: '#38BDF8', padding: 16, borderRadius: 12, alignItems: 'center' },
    btnText: { color: '#0F172A', fontWeight: 'bold', fontSize: 16 },
    secondaryText: { color: '#38BDF8', textAlign: 'center', fontWeight: '600' }
});
