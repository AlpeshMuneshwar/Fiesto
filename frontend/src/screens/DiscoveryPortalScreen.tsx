import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function DiscoveryPortalScreen({ navigation }: any) {
    const [cafes, setCafes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchCafes();
    }, []);

    const fetchCafes = async () => {
        try {
            const res = await client.get('/discover/cafes');
            setCafes(res.data);
        } catch (error: any) {
            Alert.alert('Error', 'Failed to load cafes.');
        } finally {
            setLoading(false);
        }
    };

    const handleCafeSelect = async (cafeId: string) => {
        // Enforce login for reservations
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
            Alert.alert(
                'Login Required',
                'You must be logged in to reserve a table.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Login', onPress: () => navigation.navigate('Login') }
                ]
            );
            return;
        }
        navigation.navigate('TableSelection', { cafeId });
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#FF3B30" />
                <Text style={styles.loadingText}>Finding nearby cafes...</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <ResponsiveContainer maxWidth={800}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Discover & Reserve</Text>
                        <Text style={styles.subtitle}>Find your perfect spot and skip the wait.</Text>
                    </View>

                    {cafes.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyEmoji}>🏪</Text>
                            <Text style={styles.emptyText}>No cafes are currently accepting reservations near you.</Text>
                        </View>
                    ) : (
                        <View style={styles.grid}>
                            {cafes.map((cafe) => (
                                <TouchableOpacity 
                                    key={cafe.id} 
                                    style={styles.card} 
                                    activeOpacity={0.8}
                                    onPress={() => handleCafeSelect(cafe.id)}
                                >
                                    <View style={styles.imagePlaceholder}>
                                        {cafe.logoUrl ? (
                                            <Image source={{ uri: cafe.logoUrl }} style={styles.logo} resizeMode="cover" />
                                        ) : (
                                            <Text style={styles.emoji}>☕</Text>
                                        )}
                                    </View>
                                    <View style={styles.cardContent}>
                                        <Text style={styles.cafeName}>{cafe.name}</Text>
                                        <Text style={styles.cafeAddress}>{cafe.address || 'Local Cafe'}</Text>
                                        
                                        <View style={styles.statusRow}>
                                            <View style={[styles.statusDot, { backgroundColor: cafe.hasAvailableTables ? '#34C759' : '#FF3B30' }]} />
                                            <Text style={[styles.statusText, { color: cafe.hasAvailableTables ? '#34C759' : '#FF3B30' }]}>
                                                {cafe.hasAvailableTables ? 'Tables Available' : 'Currently Full'}
                                            </Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </ResponsiveContainer>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFC' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAFC' },
    loadingText: { marginTop: 15, fontSize: 16, color: '#8E8E93', fontWeight: '500' },
    scrollContent: { padding: 20 },
    header: { marginBottom: 30, marginTop: 10 },
    title: { fontSize: 34, fontWeight: '800', color: '#1C1C1E', letterSpacing: -0.5, marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#8E8E93', fontWeight: '500' },
    grid: { gap: 16 },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        flexDirection: 'row',
        padding: 16,
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 3,
    },
    imagePlaceholder: {
        width: 80, height: 80, borderRadius: 16, backgroundColor: '#F2F2F7',
        justifyContent: 'center', alignItems: 'center', marginRight: 16, overflow: 'hidden'
    },
    logo: { width: '100%', height: '100%' },
    emoji: { fontSize: 40 },
    cardContent: { flex: 1 },
    cafeName: { fontSize: 20, fontWeight: '700', color: '#1C1C1E', marginBottom: 4 },
    cafeAddress: { fontSize: 14, color: '#8E8E93', marginBottom: 12 },
    statusRow: { flexDirection: 'row', alignItems: 'center' },
    statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    statusText: { fontSize: 13, fontWeight: '600' },
    emptyState: { alignItems: 'center', marginTop: 100 },
    emptyEmoji: { fontSize: 60, marginBottom: 20 },
    emptyText: { fontSize: 16, color: '#8E8E93', textAlign: 'center', paddingHorizontal: 40, lineHeight: 24 }
});
