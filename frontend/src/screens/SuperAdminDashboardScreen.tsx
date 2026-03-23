import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, FlatList } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import { StatusBar } from 'expo-status-bar';
import { useWindowDimensions } from 'react-native';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function SuperAdminDashboardScreen({ navigation }: any) {
    const [stats, setStats] = useState<any>(null);
    const [cafes, setCafes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { width } = useWindowDimensions();
    const isWide = width > 768;

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [statsRes, cafesRes] = await Promise.all([
                client.get('/super-admin/stats'),
                client.get('/super-admin/cafes')
            ]);
            setStats(statsRes.data);
            setCafes(cafesRes.data);
        } catch (e) {
            console.error("Failed to fetch super admin data", e);
        } finally {
            setLoading(false);
        }
    };

    const toggleCafe = async (cafe: any) => {
        try {
            const res = await client.put(`/super-admin/cafes/${cafe.id}/toggle`);
            setCafes(prev => prev.map(c => c.id === cafe.id ? res.data : c));
            Alert.alert("Success", `Cafe ${cafe.name} is now ${res.data.isActive ? 'Active' : 'Suspended'}`);
        } catch (e) {
            Alert.alert("Error", "Failed to toggle cafe status");
        }
    };

    const handleLogout = async () => {
        await AsyncStorage.multiRemove(['userToken', 'userRole']);
        navigation.replace('Login');
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#38BDF8" />
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
            <StatusBar style="light" />
            <ResponsiveContainer maxWidth={1100}>
                {/* Header */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.greeting}>Platform Control</Text>
                        <Text style={styles.subGreeting}>Global SaaS Oversight</Text>
                    </View>
                    <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                        <Text style={styles.logoutText}>Logout</Text>
                    </TouchableOpacity>
                </View>

                {/* Global Stats */}
                <View style={[styles.statsContainer, isWide && { flexWrap: 'wrap', justifyContent: 'flex-start' }]}>
                    <View style={[styles.card, styles.glassCard, isWide && { width: '23%', margin: '1%' }]}>
                        <Text style={styles.cardLabel}>Global Revenue</Text>
                        <Text style={styles.cardValue}>${stats?.totalRevenue.toFixed(2)}</Text>
                    </View>
                    <View style={[styles.card, styles.glassCard, isWide && { width: '23%', margin: '1%' }]}>
                        <Text style={styles.cardLabel}>Total Cafes</Text>
                        <Text style={styles.cardValue}>{stats?.totalCafes}</Text>
                    </View>
                    <View style={[styles.card, styles.glassCard, isWide && { width: '23%', margin: '1%' }]}>
                        <Text style={styles.cardLabel}>All-Time Orders</Text>
                        <Text style={styles.cardValue}>{stats?.totalOrders}</Text>
                    </View>
                    <View style={[styles.card, styles.glassCard, isWide && { width: '23%', margin: '1%' }]}>
                        <Text style={styles.cardLabel}>Live Sessions</Text>
                        <Text style={styles.cardValue}>{stats?.activeSessions}</Text>
                    </View>
                </View>


                {/* Cafe List */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Tenant Management</Text>
                </View>

                <View style={[styles.listCard, styles.glassCard]}>
                    {cafes.map((cafe) => (
                        <View key={cafe.id} style={styles.listItem}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.itemName}>{cafe.name}</Text>
                                <Text style={{ color: '#94A3B8', fontSize: 12 }}>{cafe.slug} • {cafe._count.orders} orders</Text>
                            </View>
                            <TouchableOpacity
                                style={[styles.statusToggle, { backgroundColor: cafe.isActive ? 'rgba(45, 212, 191, 0.1)' : 'rgba(248, 113, 113, 0.1)' }]}
                                onPress={() => toggleCafe(cafe)}
                            >
                                <Text style={{ color: cafe.isActive ? '#2DD4BF' : '#F87171', fontWeight: '800', fontSize: 11 }}>
                                    {cafe.isActive ? 'ACTIVE' : 'SUSPENDED'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
            </ResponsiveContainer>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#020617' },
    loadingContainer: { flex: 1, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' },
    header: { padding: 30, paddingTop: 60, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    greeting: { color: 'white', fontSize: 28, fontWeight: '800' },
    subGreeting: { color: '#64748B', fontSize: 14, marginTop: 4 },
    logoutBtn: { backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12 },
    logoutText: { color: '#F87171', fontWeight: '600' },
    statsContainer: { flexDirection: 'row', paddingHorizontal: 20, justifyContent: 'space-between', marginBottom: 15 },
    card: { width: '48%', padding: 20, borderRadius: 24 },
    glassCard: { backgroundColor: 'rgba(30, 41, 59, 0.4)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
    cardLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
    cardValue: { color: 'white', fontSize: 22, fontWeight: '800', marginTop: 8 },
    sectionHeader: { paddingHorizontal: 30, marginTop: 25, marginBottom: 15 },
    sectionTitle: { color: 'white', fontSize: 18, fontWeight: '700' },
    listCard: { marginHorizontal: 20, paddingHorizontal: 20, borderRadius: 24, marginBottom: 40 },
    listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.03)' },
    itemName: { color: 'white', fontSize: 16, fontWeight: '600' },
    statusToggle: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12 },
});
