import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, useWindowDimensions, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import client from '../api/client';
import ResponsiveContainer from '../components/ResponsiveContainer';

const ACTIVE_STATUSES = ['PENDING_APPROVAL', 'RECEIVED', 'PREPARING', 'READY', 'AWAITING_PICKUP'];
const PAST_STATUSES = ['DELIVERED', 'COMPLETED', 'REJECTED'];

export default function ManagerDashboardScreen({ navigation }: any) {
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [stats, setStats] = useState<any>(null);
    const [orders, setOrders] = useState<any[]>([]);
    const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
    const [menuItems, setMenuItems] = useState<any[]>([]);
    const [stockSavingId, setStockSavingId] = useState<string | null>(null);
    const { width } = useWindowDimensions();
    const isWide = width >= 980;

    const fetchData = useCallback(async (withLoader = false) => {
        if (withLoader) setSyncing(true);
        try {
            const [statsRes, ordersRes, pendingRes, menuRes] = await Promise.all([
                client.get('/admin/stats').catch(() => ({ data: null })),
                client.get('/admin/orders/all').catch(() => ({ data: [] })),
                client.get('/order/pending-approval').catch(() => ({ data: [] })),
                client.get('/menu').catch(() => ({ data: [] })),
            ]);
            setStats(statsRes.data);
            setOrders(ordersRes.data || []);
            setPendingApprovals(pendingRes.data || []);
            setMenuItems(menuRes.data || []);
        } catch (error: any) {
            Alert.alert('Error', error.response?.data?.error || 'Failed to load manager dashboard');
        } finally {
            setLoading(false);
            if (withLoader) setSyncing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            fetchData(false);
            const interval = setInterval(() => fetchData(false), 10000);
            return () => clearInterval(interval);
        }, [fetchData])
    );

    const handleLogout = async () => {
        await AsyncStorage.multiRemove(['userToken', 'refreshToken', 'userRole', 'cafeId', 'user']);
        navigation.replace('Login');
    };

    const handleApproval = async (order: any, approve: boolean) => {
        try {
            await client.post(`/order/${order.id}/approve`, { approve });
            fetchData(true);
        } catch (error: any) {
            if (error.response?.data?.code === 'PREORDER_SLOT_OCCUPIED') {
                Alert.alert(
                    'Slot occupied',
                    `${error.response?.data?.error || 'That slot is no longer free.'} Open the orders screen to change table or time before approving.`,
                    [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Open Orders', onPress: () => navigation.navigate('AdminOrders', { selectedOrderId: order.id }) },
                    ]
                );
                return;
            }
            Alert.alert('Action failed', error.response?.data?.error || 'Could not update approval');
        }
    };

    const callCustomer = async (phoneNumber?: string | null) => {
        if (!phoneNumber) {
            Alert.alert('Phone unavailable', 'This customer has no saved phone number.');
            return;
        }

        const dialable = `tel:${String(phoneNumber).replace(/[^\d+]/g, '')}`;
        try {
            const supported = await Linking.canOpenURL(dialable);
            if (!supported) {
                Alert.alert('Calling unavailable', `Use this number manually: ${phoneNumber}`);
                return;
            }
            await Linking.openURL(dialable);
        } catch {
            Alert.alert('Calling unavailable', `Use this number manually: ${phoneNumber}`);
        }
    };

    const toggleStock = async (item: any) => {
        try {
            setStockSavingId(item.id);
            await client.put(`/menu/${item.id}`, { isAvailable: !item.isAvailable });
            fetchData(true);
        } catch (error: any) {
            Alert.alert('Stock update failed', error.response?.data?.error || 'Could not update stock');
        } finally {
            setStockSavingId(null);
        }
    };

    const activeOrders = useMemo(() => orders.filter((o) => ACTIVE_STATUSES.includes(o.status)), [orders]);
    const pastOrders = useMemo(() => orders.filter((o) => PAST_STATUSES.includes(o.status)), [orders]);
    const outOfStockItems = useMemo(() => menuItems.filter((item) => item.isAvailable === false), [menuItems]);
    const inStockItems = useMemo(() => menuItems.filter((item) => item.isAvailable !== false).slice(0, 8), [menuItems]);

    const statusCounts = useMemo(() => {
        const map: Record<string, number> = {};
        orders.forEach((order) => {
            map[order.status] = (map[order.status] || 0) + 1;
        });
        return map;
    }, [orders]);

    if (loading) {
        return (
            <View style={styles.loadingScreen}>
                <ActivityIndicator size="large" color="#0F172A" />
                <Text style={styles.loadingText}>Loading manager dashboard...</Text>
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
                                <Text style={styles.badge}>MANAGER DASHBOARD</Text>
                                <Text style={styles.title}>Approve, control stock, and track earnings</Text>
                                <Text style={styles.subtitle}>Direct control center for approvals, active kitchen flow, and completed order earnings.</Text>
                            </View>
                            <View style={[styles.headerActions, isWide && styles.headerActionsWide]}>
                                <TouchableOpacity style={styles.secondaryButton} onPress={() => fetchData(true)}>
                                    <Text style={styles.secondaryButtonText}>{syncing ? 'Refreshing...' : 'Refresh data'}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.dangerButton} onPress={handleLogout}>
                                    <Text style={styles.dangerButtonText}>Logout</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>TODAY SUMMARY</Text>
                            <View style={[styles.statGrid, isWide && styles.statGridWide]}>
                                <SummaryCard label="Today Revenue" value={`Rs. ${Number(stats?.today?.revenue || 0).toFixed(2)}`} helper="Approved + delivered totals" accent="#10B981" />
                                <SummaryCard label="Pending Approvals" value={String(pendingApprovals.length)} helper="Orders waiting for manager/admin" accent="#F59E0B" />
                                <SummaryCard label="Active Orders" value={String(activeOrders.length)} helper="Live operational queue" accent="#3B82F6" />
                                <SummaryCard label="Past Orders" value={String(pastOrders.length)} helper="Delivered, completed, rejected" accent="#64748B" />
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>PENDING APPROVALS</Text>
                            <View style={styles.panel}>
                                {pendingApprovals.length === 0 ? (
                                    <Text style={styles.emptyText}>No pending approvals right now.</Text>
                                ) : (
                                    pendingApprovals.slice(0, 10).map((order) => (
                                        <View key={order.id} style={styles.approvalRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.rowTitle}>
                                                    {order.orderType === 'PRE_ORDER' ? 'Pre-order' : order.orderType === 'TAKEAWAY' ? 'Takeaway' : `Table ${order.session?.table?.number || '?'}`}
                                                </Text>
                                                <Text style={styles.rowMeta}>Rs. {Number(order.totalAmount || 0).toFixed(2)} | {new Date(order.createdAt).toLocaleTimeString()}</Text>
                                                {order.session?.customer?.name ? <Text style={styles.rowMeta}>Customer: {order.session.customer.name}</Text> : null}
                                                {order.session?.customer?.phoneNumber ? <Text style={styles.rowMeta}>Phone: {order.session.customer.phoneNumber}</Text> : null}
                                            </View>
                                            <View style={styles.rowActions}>
                                                {['PRE_ORDER', 'TAKEAWAY'].includes(order.orderType) && order.session?.customer?.phoneNumber ? (
                                                    <TouchableOpacity style={styles.callBtn} onPress={() => callCustomer(order.session.customer.phoneNumber)}>
                                                        <Text style={styles.callBtnText}>Call</Text>
                                                    </TouchableOpacity>
                                                ) : null}
                                                {order.orderType === 'PRE_ORDER' ? (
                                                    <TouchableOpacity style={styles.reviewBtn} onPress={() => navigation.navigate('AdminOrders', { selectedOrderId: order.id })}>
                                                        <Text style={styles.reviewBtnText}>Change Slot</Text>
                                                    </TouchableOpacity>
                                                ) : null}
                                                <TouchableOpacity style={styles.approveBtn} onPress={() => handleApproval(order, true)}>
                                                    <Text style={styles.approveBtnText}>Approve</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity style={styles.rejectBtn} onPress={() => handleApproval(order, false)}>
                                                    <Text style={styles.rejectBtnText}>Reject</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    ))
                                )}
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>ORDER STATUS MIX</Text>
                            <View style={[styles.statGrid, isWide && styles.statGridWide]}>
                                {Object.keys(statusCounts).length === 0 ? (
                                    <Text style={styles.emptyText}>No orders available.</Text>
                                ) : Object.entries(statusCounts).map(([status, count]) => (
                                    <SummaryCard
                                        key={status}
                                        label={status}
                                        value={String(count)}
                                        helper="orders"
                                        accent={statusColor(status)}
                                    />
                                ))}
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>STOCK CONTROL</Text>
                            <View style={styles.panel}>
                                <Text style={styles.stockTitle}>Out of Stock ({outOfStockItems.length})</Text>
                                {outOfStockItems.length === 0 ? (
                                    <Text style={styles.emptyText}>Everything is currently in stock.</Text>
                                ) : (
                                    outOfStockItems.slice(0, 12).map((item) => (
                                        <View key={item.id} style={styles.stockRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.rowTitle}>{item.name}</Text>
                                                <Text style={styles.rowMeta}>{item.category || 'General'}</Text>
                                            </View>
                                            <TouchableOpacity
                                                style={styles.stockBtn}
                                                onPress={() => toggleStock(item)}
                                                disabled={stockSavingId === item.id}
                                            >
                                                <Text style={styles.stockBtnText}>{stockSavingId === item.id ? 'Saving...' : 'Mark In Stock'}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    ))
                                )}
                                <View style={styles.divider} />
                                <Text style={styles.stockTitle}>Quick Out of Stock (Top In-Stock Items)</Text>
                                {inStockItems.map((item) => (
                                    <View key={item.id} style={styles.stockRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.rowTitle}>{item.name}</Text>
                                            <Text style={styles.rowMeta}>{item.category || 'General'}</Text>
                                        </View>
                                        <TouchableOpacity
                                            style={[styles.stockBtn, styles.stockBtnDanger]}
                                            onPress={() => toggleStock(item)}
                                            disabled={stockSavingId === item.id}
                                        >
                                            <Text style={styles.stockBtnDangerText}>{stockSavingId === item.id ? 'Saving...' : 'Mark Out'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>MANAGEMENT TOOLS</Text>
                            <View style={[styles.hubGrid, isWide && styles.hubGridWide]}>
                                <TouchableOpacity style={[styles.hubCard, isWide && styles.hubCardWide]} onPress={() => navigation.navigate('AdminMenuManagement')}>
                                    <Text style={styles.hubTitle}>Menu Management</Text>
                                    <Text style={styles.hubCount}>Update pricing and availability</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.hubCard, isWide && styles.hubCardWide]} onPress={() => navigation.navigate('AdminReports')}>
                                    <Text style={styles.hubTitle}>Reports</Text>
                                    <Text style={styles.hubCount}>Revenue and order analytics</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.hubCard, isWide && styles.hubCardWide]} onPress={() => navigation.navigate('AdminTableManagement')}>
                                    <Text style={styles.hubTitle}>Table Management</Text>
                                    <Text style={styles.hubCount}>Monitor and clear active sessions</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </ResponsiveContainer>
            </ScrollView>
        </View>
    );
}

function SummaryCard({ label, value, helper, accent }: { label: string; value: string; helper: string; accent: string }) {
    return (
        <View style={styles.statCard}>
            <View style={[styles.accentBar, { backgroundColor: accent }]} />
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statSubtext}>{helper}</Text>
        </View>
    );
}

function statusColor(status: string) {
    switch (status) {
        case 'PENDING_APPROVAL': return '#F59E0B';
        case 'RECEIVED': return '#3B82F6';
        case 'PREPARING': return '#F97316';
        case 'READY': return '#10B981';
        case 'DELIVERED': return '#0EA5E9';
        case 'COMPLETED': return '#22C55E';
        case 'REJECTED': return '#EF4444';
        default: return '#64748B';
    }
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#FFFFFF' },
    loadingScreen: { flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 14, color: '#64748B', fontSize: 15, fontWeight: '600' },
    scroll: { paddingVertical: 28, backgroundColor: '#FFFFFF' },
    page: { paddingHorizontal: 20 },
    header: { paddingTop: 12, paddingBottom: 28, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 24 },
    headerCopy: { marginBottom: 18 },
    badge: { alignSelf: 'flex-start', backgroundColor: '#EAFBF1', borderWidth: 1, borderColor: '#BBF7D0', color: '#166534', fontSize: 12, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
    title: { color: '#0F172A', fontSize: 36, fontWeight: '900', lineHeight: 42, marginBottom: 10, maxWidth: 780 },
    subtitle: { color: '#475569', fontSize: 16, lineHeight: 26, maxWidth: 840, fontWeight: '500' },
    headerActions: { flexDirection: 'column' },
    headerActionsWide: { flexDirection: 'row' },
    secondaryButton: { borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#FFFFFF', marginBottom: 12, marginRight: 12 },
    secondaryButtonText: { color: '#0F172A', fontSize: 14, fontWeight: '700' },
    dangerButton: { borderWidth: 1, borderColor: '#FECACA', paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#FFF1F2' },
    dangerButtonText: { color: '#B91C1C', fontSize: 14, fontWeight: '800' },
    section: { marginBottom: 28 },
    sectionLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '800', letterSpacing: 1.1, marginBottom: 14 },
    panel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', padding: 18 },
    statGrid: { flexDirection: 'column' },
    statGridWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    statCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', padding: 18, marginBottom: 14, width: '100%' },
    accentBar: { width: 42, height: 4, marginBottom: 14 },
    statLabel: { color: '#64748B', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
    statValue: { color: '#0F172A', fontSize: 26, fontWeight: '900', marginBottom: 8 },
    statSubtext: { color: '#475569', fontSize: 13, lineHeight: 20, fontWeight: '500' },
    approvalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    rowTitle: { color: '#0F172A', fontSize: 15, fontWeight: '800', marginBottom: 2 },
    rowMeta: { color: '#64748B', fontSize: 12, fontWeight: '600' },
    rowActions: { flexDirection: 'row', marginLeft: 12 },
    callBtn: { backgroundColor: '#DBEAFE', borderWidth: 1, borderColor: '#93C5FD', paddingVertical: 8, paddingHorizontal: 12, marginRight: 8 },
    callBtnText: { color: '#1D4ED8', fontSize: 12, fontWeight: '800' },
    reviewBtn: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', paddingVertical: 8, paddingHorizontal: 12, marginRight: 8 },
    reviewBtnText: { color: '#0F172A', fontSize: 12, fontWeight: '800' },
    approveBtn: { backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#86EFAC', paddingVertical: 8, paddingHorizontal: 12, marginRight: 8 },
    approveBtnText: { color: '#166534', fontSize: 12, fontWeight: '800' },
    rejectBtn: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5', paddingVertical: 8, paddingHorizontal: 12 },
    rejectBtnText: { color: '#991B1B', fontSize: 12, fontWeight: '800' },
    stockTitle: { color: '#0F172A', fontSize: 15, fontWeight: '800', marginBottom: 10 },
    stockRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
    stockBtn: { borderWidth: 1, borderColor: '#A7F3D0', backgroundColor: '#ECFDF5', paddingVertical: 8, paddingHorizontal: 10 },
    stockBtnText: { color: '#065F46', fontSize: 12, fontWeight: '800' },
    stockBtnDanger: { borderColor: '#FECACA', backgroundColor: '#FFF1F2' },
    stockBtnDangerText: { color: '#9F1239', fontSize: 12, fontWeight: '800' },
    divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 12 },
    emptyText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
    hubGrid: { flexDirection: 'column' },
    hubGridWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    hubCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', padding: 20, marginBottom: 12 },
    hubCardWide: { width: '31.8%' },
    hubTitle: { color: '#0F172A', fontSize: 18, fontWeight: '800', marginBottom: 6 },
    hubCount: { color: '#475569', fontSize: 14, lineHeight: 22, fontWeight: '500' },
});

