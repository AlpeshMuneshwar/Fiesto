import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform, ScrollView, SafeAreaView } from 'react-native';
import { User, Mail, Lock, ArrowRight, ChevronLeft } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import client from '../api/client';
import useApi from '../hooks/useApi';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function RegisterScreen({ navigation }: any) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const { loading, execute: register } = useApi(
        (data) => client.post('/auth/register', { ...data, role: 'CUSTOMER' }, { 
            showSuccessToast: true, 
            successMessage: 'Account created! Please verify your email.' 
        })
    );

    const handleRegister = async () => {
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
            // Redirect to Login with verification prompt
            navigation.replace('Login', { email, showingVerification: true, loginMode: 'customer' });
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <ResponsiveContainer maxWidth={500}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                        <ChevronLeft color="#0F172A" size={28} />
                    </TouchableOpacity>

                    <View style={styles.header}>
                        <Text style={styles.title}>Create Account</Text>
                        <Text style={styles.subtitle}>Join our community and unlock premium dining perks.</Text>
                    </View>

                    <View style={styles.form}>
                        <View style={styles.inputContainer}>
                            <User color="#64748B" size={20} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="Full Name"
                                value={name}
                                onChangeText={setName}
                                placeholderTextColor="#94A3B8"
                            />
                        </View>

                        <View style={styles.inputContainer}>
                            <Mail color="#64748B" size={20} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="Email Address"
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                placeholderTextColor="#94A3B8"
                            />
                        </View>

                        <View style={styles.inputContainer}>
                            <Lock color="#64748B" size={20} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="Password"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry
                                placeholderTextColor="#94A3B8"
                            />
                        </View>

                        <View style={styles.inputContainer}>
                            <Lock color="#64748B" size={20} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="Confirm Password"
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                secureTextEntry
                                placeholderTextColor="#94A3B8"
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.button, loading && { opacity: 0.7 }]}
                            onPress={handleRegister}
                            disabled={loading}
                        >
                            <Text style={styles.buttonText}>{loading ? 'Creating Account...' : 'Sign Up'}</Text>
                            {!loading && <ArrowRight color="white" size={20} />}
                        </TouchableOpacity>
                    </View>

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Already have an account? </Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Login', { loginMode: 'customer' })}>
                            <Text style={styles.footerLink}>Log In</Text>
                        </TouchableOpacity>
                    </View>
                </ResponsiveContainer>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' },
    scrollContent: { padding: 24, paddingTop: Platform.OS === 'ios' ? 0 : 20 },
    backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginBottom: 30 },
    header: { marginBottom: 40 },
    title: { fontSize: 32, fontWeight: '900', color: '#0F172A', marginBottom: 12 },
    subtitle: { fontSize: 16, color: '#64748B', lineHeight: 24 },
    form: { gap: 20 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 16 },
    inputIcon: { marginRight: 12 },
    input: { flex: 1, height: 60, fontSize: 16, color: '#0F172A', fontWeight: '500' },
    button: { backgroundColor: '#0EA5E9', height: 64, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 10, shadowColor: '#0EA5E9', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 5 },
    buttonText: { color: 'white', fontWeight: '800', fontSize: 18 },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 40 },
    footerText: { color: '#64748B', fontSize: 15 },
    footerLink: { color: '#0EA5E9', fontSize: 15, fontWeight: '800' }
});
