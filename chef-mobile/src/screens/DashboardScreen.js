import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, Switch } from 'react-native';
import client from '../api/client';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { ChefHat, LogOut, Flame, CheckCircle, Smartphone, Lock, Wifi, WifiOff, RefreshCw, History, User } from 'lucide-react-native';

const OrderItem = ({ item, onUpdateStatus, onCallWaiter, isPastOrder }) => {
    const items = JSON.parse(item.items);
    const specialInstructions = item.specialInstructions;

    return (
        <View style={styles.orderCard}>
            <View style={styles.orderHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                   <Text style={styles.tableLabel}>TABLE {item.session.table.number}</Text>
                   {item.isPreorder && (
                       <View style={styles.preorderBadge}>
                           <Text style={styles.preorderText}>PRE-ORDER</Text>
                       </View>
                   )}
                </View>
                <View style={[
                    styles.statusBadge, 
                    item.status === 'PREPARING' ? styles.bgPrep : 
                    item.status === 'READY' ? styles.bgReady : 
                    item.status === 'AWAITING_PICKUP' ? styles.bgPickup :
                    styles.bgDelivered
                ]}>
                    <Text style={styles.statusText}>
                        {item.status === 'PREPARING' ? 'Preparing' : 
                         item.status === 'READY' ? 'Ready' : 
                         item.status === 'AWAITING_PICKUP' ? 'Waiter Called' :
                         'Delivered'}
                    </Text>
                </View>
            </View>

            {item.chef && (
                <View style={styles.assignmentRow}>
                    <User color="#64748B" size={14} />
                    <Text style={styles.assignmentText}>Assigned to: {item.chef.name}</Text>
                </View>
            )}

            <View style={styles.itemsList}>
                {items.map((food, idx) => (
                    <View key={idx} style={styles.itemRow}>
                        <Text style={styles.itemQty}>{food.quantity}x</Text>
                        <Text style={styles.itemName}>{food.name}</Text>
                    </View>
                ))}
            </View>

            {specialInstructions && (
                <View style={styles.instructionsBox}>
                    <Text style={styles.instructionsLabel}>📝 Special Instructions:</Text>
                    <Text style={styles.instructionsText}>{specialInstructions}</Text>
                </View>
            )}

            {!isPastOrder && <View style={styles.divider} />}

            {!isPastOrder && (
                <View style={styles.actionRow}>
                    {item.status === 'RECEIVED' && (
                        <TouchableOpacity style={[styles.actionBtn, styles.prepBtn]} onPress={() => onUpdateStatus(item.id, 'PREPARING')}>
                            <Flame color="white" size={20} />
                            <Text style={styles.btnText}>Start Cooking</Text>
                        </TouchableOpacity>
                    )}
                    {item.status === 'PREPARING' && (
                        <TouchableOpacity 
                            style={[styles.actionBtn, styles.readyBtn]} 
                            onPress={() => onUpdateStatus(item.id, 'READY')}
                        >
                            <CheckCircle color="white" size={20} />
                            <Text style={styles.btnText}>Ready to Serve</Text>
                        </TouchableOpacity>
                    )}
                    {item.status === 'READY' && (
                        <TouchableOpacity 
                            style={[styles.actionBtn, styles.callBtn]} 
                            onPress={() => onCallWaiter(item.id)}
                        >
                            <Smartphone color="white" size={20} />
                            <Text style={styles.btnText}>Call Waiter</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>
    );
};

export default function DashboardScreen() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('ACTIVE'); // ACTIVE, PAST
    const { logout, user } = useAuth();
    const { socket, isConnected, callWaiterViaAPI, manualReconnect } = useSocket();

    const fetchOrders = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await client.get('/order/active-chef');
            setOrders(response.data);
        } catch (e) {
            console.error('Fetch Data Error', e);
            setError('Failed to load orders. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
        if (socket) {
            socket.on('new_order', (order) => {
                setOrders(prev => {
                    if (prev.some(o => o.id === order.id)) return prev;
                    return [...prev, order];
                });
            });

            socket.on('order_status_update', (data) => {
                setOrders(prev => 
                    prev.map(o => o.id === data.orderId ? { ...o, status: data.status } : o)
                );
            });

            return () => {
                socket.off('new_order');
                socket.off('order_status_update');
            };
        }
    }, [socket]);

    // Re-sync orders when socket reconnects
    useEffect(() => {
        if (isConnected) {
            fetchOrders();
        }
    }, [isConnected]);

    const updateStatus = async (orderId, status) => {
        try {
            const res = await client.post(`/order/${orderId}/status`, { status });
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...res.data.order } : o));
        } catch (e) {
            const errorMsg = e.response?.data?.error || 'Failed to update order status';
            Alert.alert('Kitchen Error', errorMsg);
            fetchOrders();
        }
    };

    const callWaiter = async (orderId) => {
        try {
            const res = await client.post(`/order/${orderId}/call-waiter`);
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'AWAITING_PICKUP' } : o));
            Alert.alert('Success', 'Waiter has been called!');
        } catch (e) {
            const errorMsg = e.response?.data?.error || 'Failed to call waiter';
            Alert.alert('Error', errorMsg);
        }
    };

    // Filter orders: ACTIVE (PREPARING, READY, AWAITING_PICKUP) and PAST (DELIVERED)
    const activeOrders = orders.filter(o => 
        ['RECEIVING', 'RECEIVED', 'PREPARING', 'READY', 'AWAITING_PICKUP'].includes(o.status)
    );
    
    const pastOrders = orders.filter(o => o.status === 'DELIVERED');

    const filteredOrders = activeTab === 'ACTIVE' ? activeOrders : pastOrders;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerTitleRow}>
                    <ChefHat color="#F97316" size={30} />
                    <Text style={styles.headerTitle}>Kitchen Live</Text>
                </View>
                <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
                    <LogOut color="#94A3B8" size={24} />
                </TouchableOpacity>
            </View>

            <View style={[styles.connectBar, { backgroundColor: isConnected ? '#ECFDF5' : '#FEF2F2' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {isConnected ? <Wifi color="#059669" size={16} /> : <WifiOff color="#DC2626" size={16} />}
                    <Text style={{ fontSize: 13, fontWeight: '700', color: isConnected ? '#059669' : '#DC2626' }}>
                        {isConnected ? 'Live Connected' : 'Disconnected'}
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    {!isConnected && (
                        <TouchableOpacity onPress={manualReconnect} style={styles.connectAction}>
                            <WifiOff color="#DC2626" size={14} />
                            <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 12 }}>Reconnect</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={fetchOrders} style={styles.connectAction}>
                        <RefreshCw color={isConnected ? '#059669' : '#DC2626'} size={14} />
                        <Text style={{ color: isConnected ? '#059669' : '#DC2626', fontWeight: '700', fontSize: 12 }}>Refresh</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.tabsContainer}>
                {['ACTIVE', 'PAST'].map(tab => (
                    <TouchableOpacity 
                        key={tab} 
                        style={[styles.tab, activeTab === tab && styles.activeTab]}
                        onPress={() => setActiveTab(tab)}
                    >
                        <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                            {tab === 'ACTIVE' ? 'Active Orders' : 'Completed'}
                            {` (${tab === 'ACTIVE' ? activeOrders.length : pastOrders.length})`}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {error ? (
                <View style={styles.errorState}>
                    <Flame color="#EF4444" size={50} />
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={fetchOrders}>
                        <Text style={styles.retryBtnText}>Retry Connection</Text>
                    </TouchableOpacity>
                </View>
            ) : loading ? (
                <View style={styles.centered}><ActivityIndicator color="#F97316" size="large" /></View>
            ) : (
                    <FlatList
                    data={filteredOrders}
                    keyExtractor={o => o.id}
                    renderItem={({ item }) => (
                        <OrderItem 
                            item={item} 
                            onUpdateStatus={updateStatus} 
                            onCallWaiter={callWaiter}
                            isPastOrder={activeTab === 'PAST'}
                        />
                    )}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <ChefHat color="#E2E8F0" size={100} />
                            <Text style={styles.emptyText}>
                                {activeTab === 'ACTIVE' ? "No active orders" : "No completed orders yet"}
                            </Text>
                            <Text style={styles.emptySub}>Awaiting updates...</Text>
                        </View>
                    }
                    refreshing={loading}
                    onRefresh={fetchOrders}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFF7ED' }, // Warm kitchen tint
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#FFEDD5' },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerTitle: { fontSize: 26, fontWeight: '900', color: '#7C2D12', letterSpacing: -0.5 },
    logoutBtn: { padding: 12, backgroundColor: '#FFF7ED', borderRadius: 12 },
    connectBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, backgroundColor: '#FFEDD5', marginHorizontal: 20, marginTop: 20, borderRadius: 16 },
    connectAction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FFFFFF' },
    settingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: 'white' },
    tabsContainer: { flexDirection: 'row', backgroundColor: 'white', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#FFEDD5' },
    tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 16, marginRight: 8 },
    activeTab: { backgroundColor: '#EA580C' },
    tabText: { fontSize: 15, fontWeight: '800', color: '#B45309' },
    activeTabText: { color: '#FFFFFF' },
    listContent: { padding: 20 },
    orderCard: { backgroundColor: 'white', borderRadius: 28, padding: 24, marginBottom: 20, shadowColor: '#EA580C', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 24, elevation: 6, borderWidth: 1, borderColor: '#FFEDD5' },
    orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    tableLabel: { fontSize: 28, fontWeight: '900', color: '#431407', letterSpacing: -0.5 },
    statusBadge: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
    bgRec: { backgroundColor: '#DBEAFE' },
    bgReady: { backgroundColor: '#DCFCE7' }, 
    bgPrep: { backgroundColor: '#FFEDD5' },
    bgPickup: { backgroundColor: '#FEF3C7' },
    bgPending: { backgroundColor: '#F8FAFC' },
    bgDelivered: { backgroundColor: '#ECFDF5' },
    statusText: { fontSize: 13, fontWeight: '900', textTransform: 'uppercase', color: '#431407' },
    preorderBadge: { backgroundColor: '#FFF7ED', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#EA580C' },
    preorderText: { color: '#EA580C', fontSize: 11, fontWeight: '800' },
    itemsList: { marginBottom: 20 },
    itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    itemQty: { color: '#EA580C', fontWeight: '900', width: 40, fontSize: 18 },
    itemName: { color: '#431407', fontSize: 18, fontWeight: '700' },
    instructionsBox: { backgroundColor: '#FEF2F2', borderLeftWidth: 4, borderLeftColor: '#DC2626', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, marginBottom: 20 },
    instructionsLabel: { fontSize: 13, fontWeight: '800', color: '#DC2626', marginBottom: 4, letterSpacing: 0.5 },
    instructionsText: { fontSize: 16, color: '#7F1D1D', fontWeight: '600' },
    divider: { height: 1, backgroundColor: '#FFEDD5', marginBottom: 20 },
    actionRow: { flexDirection: 'row', gap: 12 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 20, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10 },
    prepBtn: { backgroundColor: '#3B82F6', shadowColor: '#3B82F6' },
    readyBtn: { backgroundColor: '#10B981', shadowColor: '#10B981' },
    callBtn: { backgroundColor: '#EA580C', shadowColor: '#EA580C' },
    btnText: { color: 'white', fontWeight: '800', fontSize: 16 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    errorState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    errorText: { fontSize: 18, color: '#DC2626', textAlign: 'center', marginTop: 20, marginBottom: 24, fontWeight: '700' },
    retryBtn: { backgroundColor: '#EA580C', paddingHorizontal: 30, paddingVertical: 16, borderRadius: 16 },
    retryBtnText: { color: 'white', fontWeight: '900', fontSize: 16 },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
    emptyText: { fontSize: 24, fontWeight: '900', color: '#9A3412', marginTop: 24, letterSpacing: -0.5 },
    emptySub: { fontSize: 16, color: '#FDBA74', marginTop: 8, fontWeight: '600' },
    assignmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, backgroundColor: '#FFF7ED', padding: 12, borderRadius: 12 },
    assignmentText: { fontSize: 14, color: '#9A3412', fontWeight: '700' }
});
