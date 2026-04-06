import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, useWindowDimensions, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function AdminDashboardScreen({ navigation }: any) {
    const [stats, setStats] = useState<any>(null);
    const [orders, setOrders] = useState<any[]>([]);
    const [tables, setTables] = useState<any[]>([]);
    const [menu, setMenu] = useState<any[]>([]);
    const [staff, setStaff] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { width } = useWindowDimensions();
    
    // Performance Tiers
    const isMobile = width < 768;
    const isDesktop = width >= 1024;

    const fetchData = useCallback(async () => {
        try {
            const [statsRes, ordersRes, tablesRes, menuRes, staffRes] = await Promise.all([
                client.get('/admin/stats').catch(() => ({ data: null })),
                client.get('/admin/orders/all').catch(() => ({ data: [] })),
                client.get('/session/tables').catch(() => ({ data: [] })),
                client.get('/menu').catch(() => ({ data: [] })),
                client.get('/admin/staff').catch(() => ({ data: [] }))
            ]);

            setStats(statsRes.data);
            setOrders(ordersRes.data || []);
            setTables(tablesRes.data || []);
            setMenu(menuRes.data || []);
            setStaff(staffRes.data || []);
        } catch (e) {
            console.error("Dashboard Sync Error:", e);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            fetchData();
            const interval = setInterval(fetchData, 10000);
            return () => clearInterval(interval);
        }, [fetchData])
    );

    const handleLogout = async () => {
        await AsyncStorage.multiRemove(['userToken', 'userRole', 'cafeId']);
        navigation.replace('Login');
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#10B981" />
                <Text style={styles.loadingText}>Syncing Systems...</Text>
            </View>
        );
    }

    return (
        <View style={styles.mainWrapper}>
            <StatusBar style="light" />
            <LinearGradient colors={['#020617', '#0F172A']} style={StyleSheet.absoluteFill} />
            
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <ResponsiveContainer maxWidth={1200}>
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.badge}>SYSTEMS ACTIVE</Text>
                            <Text style={styles.title}>Admin Hub</Text>
                            <Text style={styles.subtitle}>{stats?.cafeName || 'Operational Intelligence'}</Text>
                        </View>
                        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                            <Text style={styles.logoutBtnText}>SHUTDOWN</Text>
                        </TouchableOpacity>
                    </View>

                    {/* STATS OVERVIEW */}
                    <View style={[styles.statsGrid, isDesktop && styles.statsGridDesktop]}>
                        <StatCard label="TODAY'S REVENUE" value={`$${stats?.today?.revenue.toFixed(2)}`} subText="Real-time Tracking" color="#10B981" />
                        <StatCard label="TOTAL ORDERS" value={stats?.today?.totalOrders || 0} subText={`${stats?.activeSessions || 0} Open Sessions`} color="#3B82F6" />
                        <StatCard label="TABLES ACTIVE" value={tables.length} subText="Physical Zones" color="#F59E0B" />
                        <StatCard label="TOTAL STAFF" value={staff.length} subText="Online Personnel" color="#A855F7" />
                    </View>

                    {/* MAIN HUB GRID */}
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>COMMAND CENTER</Text>
                        <View style={styles.headerLine} />
                    </View>

                    <View style={[styles.managementGrid, isDesktop && styles.managementGridDesktop]}>
                        <HubItem icon="🪑" title="Tables" count={`${tables.length} Active`} color="#3B82F6" onPress={() => navigation.navigate('AdminTableManagement')} />
                        <HubItem icon="📖" title="Menu" count={`${menu.length} Items`} color="#A855F7" onPress={() => navigation.navigate('AdminMenuManagement')} />
                        <HubItem icon="👥" title="Staff" count={`${staff.length} Members`} color="#F59E0B" onPress={() => navigation.navigate('AdminStaffManagement')} />
                        <HubItem icon="📊" title="Reports" count="Sales Audit" color="#EF4444" onPress={() => navigation.navigate('AdminReports')} />
                        <HubItem icon="⚙️" title="Settings" count="Core Config" color="#10B981" onPress={() => navigation.navigate('AdminSettings')} />
                    </View>

                    {/* RECENT ACTIVITY */}
                    <View style={styles.activityContainer}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>LIVE ACTIVITY STREAM</Text>
                            <View style={styles.headerLine} />
                        </View>
                        
                        <View style={styles.activityCard}>
                            {orders.slice(0, 5).map((order) => (
                                <View key={order.id} style={styles.orderRow}>
                                    <View style={styles.orderMain}>
                                        <Text style={styles.orderTable}>TABLE {order.session?.table?.number || '??'}</Text>
                                        <Text style={styles.orderMeta}>{new Date(order.createdAt).toLocaleTimeString()} • ${order.totalAmount.toFixed(2)}</Text>
                                    </View>
                                    <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(order.status) }]}>
                                        <Text style={styles.statusText}>{order.status}</Text>
                                    </View>
                                </View>
                            ))}
                            {orders.length === 0 && (
                                <View style={styles.emptyActivity}>
                                    <Text style={styles.emptyText}>No Active Traffic Found</Text>
                                </View>
                            )}
                        </View>
                    </View>
                </ResponsiveContainer>
            </ScrollView>
        </View>
    );
}

const StatCard = ({ label, value, subText, color }: any) => (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statSub}>{subText}</Text>
    </View>
);

const HubItem = ({ icon, title, count, color, onPress }: any) => (
    <TouchableOpacity style={styles.hubItem} onPress={onPress} activeOpacity={0.7}>
        <View style={[styles.iconBox, { backgroundColor: `${color}20`, borderColor: color }]}>
            <Text style={styles.hubIcon}>{icon}</Text>
        </View>
        <View>
            <Text style={styles.hubTitle}>{title}</Text>
            <Text style={styles.hubCount}>{count}</Text>
        </View>
    </TouchableOpacity>
);

const getStatusColor = (status: string) => {
    switch (status) {
        case 'RECEIVED': return '#3B82F6';
        case 'PREPARING': return '#F59E0B';
        case 'READY': return '#10B981';
        case 'COMPLETED': return '#10B981';
        default: return '#334155';
    }
};

const styles = StyleSheet.create({
    mainWrapper: { flex: 1, backgroundColor: '#020617' },
    loadingContainer: { flex: 1, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' },
    loadingText: { color: '#64748B', marginTop: 15, fontWeight: '700', letterSpacing: 1 },
    scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 100 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 },
    badge: { color: '#10B981', fontWeight: '900', fontSize: 10, letterSpacing: 2, marginBottom: 8 },
    title: { color: 'white', fontSize: 32, fontWeight: '900' },
    subtitle: { color: '#64748B', fontSize: 16, fontWeight: '600' },
    logoutBtn: { backgroundColor: '#1E293B', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 4, borderWidth: 1, borderColor: '#334155' },
    logoutBtnText: { color: '#EF4444', fontWeight: '800', fontSize: 10, letterSpacing: 1 },
    
    // Stats
    statsGrid: { gap: 15, marginBottom: 40 },
    statsGridDesktop: { flexDirection: 'row', flexWrap: 'wrap' },
    statCard: { 
        backgroundColor: '#0F172A', 
        padding: 20, 
        borderRadius: 4, 
        borderWidth: 1, 
        borderColor: '#1E293B', 
        borderLeftWidth: 4,
        flex: 1,
        minWidth: 200
    },
    statLabel: { color: '#64748B', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    statValue: { color: 'white', fontSize: 28, fontWeight: '900', marginVertical: 8 },
    statSub: { color: '#334155', fontSize: 12, fontWeight: '700' },

    // Hub
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 20 },
    sectionTitle: { color: '#475569', fontSize: 12, fontWeight: '900', letterSpacing: 3 },
    headerLine: { flex: 1, height: 1, backgroundColor: '#1E293B' },
    managementGrid: { gap: 12, marginBottom: 40 },
    managementGridDesktop: { flexDirection: 'row', flexWrap: 'wrap' },
    hubItem: { 
        backgroundColor: '#0F172A', 
        padding: 15, 
        borderRadius: 4, 
        borderWidth: 1, 
        borderColor: '#1E293B', 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 15,
        minWidth: '24%',
        flexGrow: 1
    },
    iconBox: { width: 44, height: 44, borderRadius: 4, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
    hubIcon: { fontSize: 20 },
    hubTitle: { color: 'white', fontSize: 15, fontWeight: '800' },
    hubCount: { color: '#64748B', fontSize: 12, fontWeight: '600' },

    // Activity
    activityContainer: { },
    activityCard: { backgroundColor: '#0F172A', borderRadius: 4, borderWidth: 1, borderColor: '#1E293B' },
    orderRow: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: 20, 
        borderBottomWidth: 1, 
        borderBottomColor: '#1E293B' 
    },
    orderMain: { },
    orderTable: { color: 'white', fontWeight: '900', fontSize: 14 },
    orderMeta: { color: '#64748B', fontSize: 12, marginTop: 4 },
    statusIndicator: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 2 },
    statusText: { color: 'white', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
    emptyActivity: { padding: 40, alignItems: 'center' },
    emptyText: { color: '#334155', fontWeight: '800', letterSpacing: 1, fontSize: 12 }
});
