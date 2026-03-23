import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { LogIn } from 'lucide-react-native';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('Error', 'Please enter both email and password');
            return;
        }
        setLoading(true);
        try {
            await login(email, password);
        } catch (e) {
            Alert.alert('Login Failed', e.message || 'Check credentials');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <View style={styles.iconContainer}>
                    <LogIn color="#0EA5E9" size={40} />
                </View>
                <Text style={styles.title}>Waiter Portal</Text>
                <Text style={styles.subtitle}>Enter your credentials to manage table calls</Text>

                <TextInput
                    style={styles.input}
                    placeholder="Email Address"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />
                <TextInput
                    style={styles.input}
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                <TouchableOpacity 
                    style={[styles.button, loading && styles.buttonDisabled]} 
                    onPress={handleLogin}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.buttonText}>Sign In</Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F0F9FF', justifyContent: 'center', padding: 20 },
    card: { backgroundColor: 'white', padding: 30, borderRadius: 24, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20 },
    iconContainer: { alignSelf: 'center', backgroundColor: '#E0F2FE', padding: 20, borderRadius: 30, marginBottom: 20 },
    title: { fontSize: 24, fontWeight: '800', textAlign: 'center', color: '#0F172A', marginBottom: 8 },
    subtitle: { textAlign: 'center', color: '#64748B', marginBottom: 30, fontSize: 14 },
    input: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, marginBottom: 15, fontSize: 16, borderWith: 1, borderColor: '#E2E8F0' },
    button: { backgroundColor: '#0EA5E9', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10 },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});
