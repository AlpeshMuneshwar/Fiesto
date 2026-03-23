import React, { useState } from 'react';
import { Text, StyleSheet, TextInput, TouchableOpacity, Alert, SafeAreaView, ActivityIndicator } from 'react-native';
import client from '../api/client';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function ResetPasswordScreen({ route, navigation }: any) {
    const { token } = route.params || {};
    const [manualToken, setManualToken] = useState(token === 'MANUAL_TEST' ? '' : token);
    const [newPassword, setNewPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleReset = async () => {
        if (!newPassword || (!manualToken && !token)) return;
        setLoading(true);
        try {
            const res = await client.post('/auth/reset-password', { token: manualToken || token, newPassword });
            Alert.alert("Success", res.data.message);
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
                <Text style={styles.title}>Set New Password</Text>
                <Text style={styles.desc}>Enter your new password to securely regain access to your account.</Text>
                
                {(!token || token === 'MANUAL_TEST') && (
                    <TextInput
                        style={styles.input}
                        placeholder="Paste Reset Token Here"
                        value={manualToken}
                        onChangeText={setManualToken}
                    />
                )}
                
                <TextInput
                    style={styles.input}
                    placeholder="New Password (min 8 chars, 1 uppercase, 1 number)"
                    secureTextEntry
                    value={newPassword}
                    onChangeText={setNewPassword}
                />
                <TouchableOpacity style={styles.btn} onPress={handleReset} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Reset Password</Text>}
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
