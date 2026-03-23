import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { ChefHat } from 'lucide-react-native';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('Error', 'Please enter email and password');
            return;
        }
        setLoading(true);
        try {
            await login(email, password);
        } catch (e) {
            Alert.alert('Kitchen Login Failed', e.message || 'Check credentials');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <View style={styles.iconContainer}>
                    <ChefHat color="#F97316" size={45} />
                </View>
                <Text style={styles.title}>Kitchen Console</Text>
                <Text style={styles.subtitle}>Sign in to start receiving orders</Text>

                <TextInput
                    style={styles.input}
                    placeholder="Chef ID / Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                />
                <TextInput
                    style={styles.input}
                    placeholder="Kitchen Passcode"
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
                        <Text style={styles.buttonText}>Enter Kitchen</Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFF7ED', justifyContent: 'center', padding: 20 },
    card: { backgroundColor: 'white', padding: 30, borderRadius: 32, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 24 },
    iconContainer: { alignSelf: 'center', backgroundColor: '#FFEDD5', padding: 25, borderRadius: 35, marginBottom: 25 },
    title: { fontSize: 26, fontWeight: '900', textAlign: 'center', color: '#7C2D12', marginBottom: 8 },
    subtitle: { textAlign: 'center', color: '#9A3412', marginBottom: 35, fontSize: 15, opacity: 0.8 },
    input: { backgroundColor: '#FFF7ED', padding: 18, borderRadius: 16, marginBottom: 15, fontSize: 16, borderWith: 1, borderColor: '#FED7AA', color: '#7C2D12' },
    button: { backgroundColor: '#EA580C', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 15 },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: 'white', fontWeight: 'bold', fontSize: 18 }
});
