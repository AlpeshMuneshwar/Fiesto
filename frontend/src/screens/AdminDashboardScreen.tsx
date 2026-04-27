import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function AdminDashboardScreen({ navigation }: any) {
    const [stats, setStats] = useState<any>(null);
    const [cafeStatus, setCafeStatus] = useState<any>(null);
    const [orders, setOrders] = useState<any[]>([]);
    const [tables, setTables] = useState<any[]>([]);
    const [menu, setMenu] = useState<any[]>([]);
    const [staff, setStaff] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { width } = useWindowDimensions();

    const isWide = width >= 980;

    const fetchData = useCallback(async () => {
        try {
            const [statsRes, cafeStatusRes, ordersRes, tablesRes, menuRes, staffRes] = await Promise.all([
                client.get('/admin/stats').catch(() => ({ data: null })),
                client.get('/admin/cafe-status').catch(() => ({ data: null })),
                client.get('/admin/orders/all').catch(() => ({ data: [] })),
                client.get('/session/tables').catch(() => ({ data: [] })),
                client.get('/menu').catch(() => ({ data: [] })),
                client.get('/admin/staff').catch(() => ({ data: [] })),
            ]);

            setStats(statsRes.data);
            setCafeStatus(cafeStatusRes.data);
            setOrders(ordersRes.data || []);
            setTables(tablesRes.data || []);
            setMenu(menuRes.data || []);
            setStaff(staffRes.data || []);
        } catch (e) {
            console.error('Dashboard Sync Error:', e);
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

    const toggleCafeStatus = async () => {
        if (!cafeStatus) return;
        const nextValue = !cafeStatus.isActive;
        try {
            const res = await client.patch('/admin/cafe-status', { isActive: nextValue });
            setCafeStatus(res.data.cafe);
        } catch (error) {
            console.error('Cafe Status Update Error:', error);
        }
    };

    const statCards = [
        {
            label: "Today's revenue",
            value: `Rs. ${Number(stats?.today?.revenue || 0).toFixed(2)}`,
            subText: 'Live order value today',
            accent: '#10B981',
        },
        {
            label: 'Total orders',
            value: String(stats?.today?.totalOrders || 0),
            subText: `${stats?.activeSessions || 0} active sessions`,
            accent: '#3B82F6',
        },
        {
            label: 'Tables',
            value: String(tables.length),
            subText: 'Tables currently configured',
            accent: '#F59E0B',
        },
        {
            label: 'Staff',
            value: String(staff.length),
            subText: 'Team members available',
            accent: '#A855F7',
        },
    ];

    const hubItems = [
        { title: 'Tables', count: `${tables.length} configured`, accent: '#3B82F6', onPress: () => navigation.navigate('AdminTableManagement') },
        { title: 'Menu', count: `${menu.length} items`, accent: '#A855F7', onPress: () => navigation.navigate('AdminMenuManagement') },
        { title: 'Staff', count: `${staff.length} members`, accent: '#F59E0B', onPress: () => navigation.navigate('AdminStaffManagement') },
        { title: 'Reports', count: 'Sales and activity', accent: '#EF4444', onPress: () => navigation.navigate('AdminReports') },
        { title: 'Settings', count: 'Cafe configuration', accent: '#10B981', onPress: () => navigation.navigate('AdminSettings') },
    ];

    if (loading) {
        return (
            <View style={styles.loadingScreen}>
                <ActivityIndicator size="large" color="#0F172A" />
                <Text style={styles.loadingText}>Loading admin dashboard...</Text>
            </View>
        );
    }

    return (
        <View style={styles.screen}>
            <StatusBar style="dark" />
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <ResponsiveContainer maxWidth={1180}>
                    <View style={styles.page}>
                        <View style={styles.header}>
                            <View style={styles.headerCopy}>
                                <Text style={styles.badge}>ADMIN DASHBOARD</Text>
                                <Text style={styles.title}>Run the cafe from one clear control layer</Text>
                                <Text style={styles.subtitle}>
                                    {stats?.cafeName || 'Operational overview'} with live stats, management shortcuts, and recent order activity.
                                </Text>
                            </View>

                            <View style={[styles.headerActions, isWide && styles.headerActionsWide]}>
                                <TouchableOpacity style={styles.secondaryButton} onPress={fetchData}>
                                    <Text style={styles.secondaryButtonText}>Refresh data</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.dangerButton} onPress={handleLogout}>
                                    <Text style={styles.dangerButtonText}>Logout</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>CAFE STATUS</Text>
                            <View style={styles.statusPanel}>
                                <View>
                                    <Text style={styles.statusTitle}>{cafeStatus?.isActive ? 'Open on discovery' : 'Closed on discovery'}</Text>
                                    <Text style={styles.statusSubtitle}>
                                        {cafeStatus?.isActive
                                            ? 'Customers can currently find and book your cafe.'
                                            : 'Discovery, booking, and preorder entry points are paused.'}
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    style={[styles.statusButton, cafeStatus?.isActive ? styles.statusButtonDanger : styles.statusButtonPrimary]}
                                    onPress={toggleCafeStatus}
                                >
                                    <Text style={[styles.statusButtonText, cafeStatus?.isActive ? styles.statusButtonTextDanger : styles.statusButtonTextPrimary]}>
                                        {cafeStatus?.isActive ? 'Close Cafe' : 'Open Cafe'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>TODAY AT A GLANCE</Text>
                            <View style={[styles.statGrid, isWide && styles.statGridWide]}>
                                {statCards.map((card) => (
                                    <View key={card.label} style={[styles.statCard, isWide && styles.statCardWide]}>
                                        <View style={[styles.accentBar, { backgroundColor: card.accent }]} />
                                        <Text style={styles.statLabel}>{card.label}</Text>
                                        <Text style={styles.statValue}>{card.value}</Text>
                                        <Text style={styles.statSubtext}>{card.subText}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>MANAGEMENT SHORTCUTS</Text>
                            <View style={[styles.hubGrid, isWide && styles.hubGridWide]}>
                                {hubItems.map((item) => (
                                    <TouchableOpacity key={item.title} style={[styles.hubCard, isWide && styles.hubCardWide]} onPress={item.onPress}>
                                        <View style={[styles.hubAccent, { backgroundColor: item.accent }]} />
                                        <Text style={styles.hubTitle}>{item.title}</Text>
                                        <Text style={styles.hubCount}>{item.count}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>RECENT ORDER ACTIVITY</Text>
                            <View style={styles.activityPanel}>
                                {orders.slice(0, 6).map((order, index) => (
                                    <View key={order.id} style={[styles.orderRow, index < Math.min(orders.length, 6) - 1 && styles.orderRowBorder]}>
                                        <View style={styles.orderMain}>
                                            <Text style={styles.orderTable}>Table {order.session?.table?.number || '--'}</Text>
                                            <Text style={styles.orderMeta}>
                                                {new Date(order.createdAt).toLocaleTimeString()} · Rs. {Number(order.totalAmount || 0).toFixed(2)}
                                            </Text>
                                        </View>
                                        <View style={[styles.statusTag, { backgroundColor: `${getStatusColor(order.status)}18`, borderColor: `${getStatusColor(order.status)}40` }]}>
                                            <Text style={[styles.statusText, { color: getStatusColor(order.status) }]}>{order.status}</Text>
                                        </View>
                                    </View>
                                ))}
                                {orders.length === 0 && (
                                    <View style={styles.emptyState}>
                                        <Text style={styles.emptyTitle}>No recent order activity</Text>
                                        <Text style={styles.emptyText}>New orders will appear here as soon as sessions start placing them.</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    </View>
                </ResponsiveContainer>
            </ScrollView>
        </View>
    );
}

const getStatusColor = (status: string) => {
    switch (status) {
        case 'RECEIVED': return '#3B82F6';
        case 'PREPARING': return '#F59E0B';
        case 'READY': return '#10B981';
        case 'COMPLETED': return '#10B981';
        default: return '#64748B';
    }
};

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#FFFFFF' },
    loadingScreen: { flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 14, color: '#64748B', fontSize: 15, fontWeight: '600' },
    scroll: { paddingVertical: 28, backgroundColor: '#FFFFFF' },
    page: { paddingHorizontal: 20 },
    header: { paddingTop: 12, paddingBottom: 28, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 24 },
    headerCopy: { marginBottom: 18 },
    badge: { alignSelf: 'flex-start', backgroundColor: '#FFF1EB', borderWidth: 1, borderColor: '#FFD7C8', color: '#C2410C', fontSize: 12, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
    title: { color: '#0F172A', fontSize: 40, fontWeight: '900', lineHeight: 46, marginBottom: 10, maxWidth: 780 },
    subtitle: { color: '#475569', fontSize: 16, lineHeight: 26, maxWidth: 840, fontWeight: '500' },
    headerActions: { flexDirection: 'column' },
    headerActionsWide: { flexDirection: 'row' },
    secondaryButton: { borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#FFFFFF', marginBottom: 12, marginRight: 12 },
    secondaryButtonText: { color: '#0F172A', fontSize: 14, fontWeight: '700' },
    dangerButton: { borderWidth: 1, borderColor: '#FECACA', paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#FFF1F2' },
    dangerButtonText: { color: '#B91C1C', fontSize: 14, fontWeight: '800' },
    section: { marginBottom: 28 },
    sectionLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '800', letterSpacing: 1.1, marginBottom: 14 },
    statusPanel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', padding: 20 },
    statusTitle: { color: '#0F172A', fontSize: 22, fontWeight: '800', marginBottom: 8 },
    statusSubtitle: { color: '#475569', fontSize: 14, lineHeight: 22, fontWeight: '500', marginBottom: 18 },
    statusButton: { alignSelf: 'flex-start', borderWidth: 1, paddingHorizontal: 18, paddingVertical: 14 },
    statusButtonPrimary: { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
    statusButtonDanger: { borderColor: '#FECACA', backgroundColor: '#FFF1F2' },
    statusButtonText: { fontSize: 14, fontWeight: '800' },
    statusButtonTextPrimary: { color: '#166534' },
    statusButtonTextDanger: { color: '#B91C1C' },
    statGrid: { flexDirection: 'column' },
    statGridWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    statCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', padding: 20, marginBottom: 16 },
    statCardWide: { width: '48.5%' },
    accentBar: { width: 42, height: 4, marginBottom: 14 },
    statLabel: { color: '#64748B', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
    statValue: { color: '#0F172A', fontSize: 30, fontWeight: '900', marginBottom: 8 },
    statSubtext: { color: '#475569', fontSize: 14, lineHeight: 22, fontWeight: '500' },
    hubGrid: { flexDirection: 'column' },
    hubGridWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    hubCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', padding: 20, marginBottom: 16 },
    hubCardWide: { width: '31.8%' },
    hubAccent: { width: 36, height: 4, marginBottom: 14 },
    hubTitle: { color: '#0F172A', fontSize: 20, fontWeight: '800', marginBottom: 6 },
    hubCount: { color: '#475569', fontSize: 14, lineHeight: 22, fontWeight: '500' },
    activityPanel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7' },
    orderRow: { flexDirection: 'column', padding: 18 },
    orderRowBorder: { borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    orderMain: { marginBottom: 10 },
    orderTable: { color: '#0F172A', fontSize: 17, fontWeight: '800', marginBottom: 4 },
    orderMeta: { color: '#64748B', fontSize: 14, lineHeight: 21, fontWeight: '500' },
    statusTag: { alignSelf: 'flex-start', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
    statusText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
    emptyState: { padding: 28, alignItems: 'center' },
    emptyTitle: { color: '#0F172A', fontSize: 18, fontWeight: '800', marginBottom: 8 },
    emptyText: { color: '#64748B', fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 420 },
});
