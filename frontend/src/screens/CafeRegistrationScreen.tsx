import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import client from '../api/client';
import { LinearGradient } from 'expo-linear-gradient';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function CafeRegistrationScreen({ navigation }: any) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState({
        cafeName: '',
        cafeSlug: '',
        ownerName: '',
        ownerEmail: '',
        ownerPassword: '',
    });

    const handleRegister = async () => {
        const { cafeName, cafeSlug, ownerName, ownerEmail, ownerPassword } = form;
        if (!cafeName || !cafeSlug || !ownerName || !ownerEmail || !ownerPassword) {
            Alert.alert('Error', 'Please fill all fields');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const res = await client.post('/tenant/register', form);
            Alert.alert('Success', 'Cafe registered! Please login to manage your dashboard.', [
                { text: 'Login', onPress: () => navigation.navigate('Login') }
            ]);
        } catch (err: any) {
            const errorMsg = err.response?.data?.error || 'Something went wrong. Please try again.';
            setError(errorMsg);
            console.error('[Registration Error]', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
            <ResponsiveContainer maxWidth={650}>
                <View style={{ padding: 30, paddingTop: 60 }}>
                    <Text style={styles.title}>Partner with CafeQR</Text>
                    <Text style={styles.subtitle}>Launch your digital menu in less than 2 minutes.</Text>

                    <View style={styles.form}>
                        <Text style={styles.label}>Cafe Name</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. Blue Tokai Coffee"
                            onChangeText={(val) => setForm({ ...form, cafeName: val })}
                        />

                        <Text style={styles.label}>Desired URL Slug</Text>
                        <View style={styles.slugInputContainer}>
                            <Text style={styles.slugPrefix}>cafeqr.com/cafe/</Text>
                            <TextInput
                                style={styles.slugInput}
                                placeholder="blue-tokai"
                                autoCapitalize="none"
                                onChangeText={(val) => setForm({ ...form, cafeSlug: val.toLowerCase().replace(/\s+/g, '-') })}
                            />
                        </View>

                        <View style={styles.divider} />

                        <Text style={styles.label}>Owner Name</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Full Name"
                            onChangeText={(val) => setForm({ ...form, ownerName: val })}
                        />

                        <Text style={styles.label}>Operational Email</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="admin@yourcafe.com"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            onChangeText={(val) => setForm({ ...form, ownerEmail: val })}
                        />

                        <Text style={styles.label}>Create Password</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Min 8 characters"
                            secureTextEntry
                            onChangeText={(val) => setForm({ ...form, ownerPassword: val })}
                        />

                        {error && (
                            <View style={styles.errorContainer}>
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        )}

                        <TouchableOpacity
                            style={styles.submitBtn}
                            onPress={handleRegister}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={styles.submitBtnText}>Create My Cafe profile</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </ResponsiveContainer>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' },
    title: { fontSize: 32, fontWeight: '800', color: '#0F172A' },
    subtitle: { fontSize: 16, color: '#64748B', marginTop: 10, marginBottom: 40 },
    form: { gap: 20 },
    label: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: -10 },
    input: { backgroundColor: '#F8FAFC', padding: 18, borderRadius: 15, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 16 },
    slugInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 15, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 15 },
    slugPrefix: { color: '#94A3B8', fontSize: 14 },
    slugInput: { flex: 1, padding: 18, fontSize: 16, paddingLeft: 5 },
    divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 20 },
    submitBtn: { backgroundColor: '#0F172A', padding: 20, borderRadius: 15, alignItems: 'center', marginTop: 20 },
    submitBtnText: { color: 'white', fontWeight: '800', fontSize: 18 },
    errorContainer: { backgroundColor: '#FEF2F2', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#FEE2E2' },
    errorText: { color: '#DC2626', fontSize: 14, fontWeight: '600', textAlign: 'center' }
});
