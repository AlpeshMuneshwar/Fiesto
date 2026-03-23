import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import client from '../api/client';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { ChefHat, LogOut, Flame, CheckCircle, Smartphone } from 'lucide-react-native';

const OrderItem = ({ item, onUpdateStatus, onCallWaiter }) => {
    const items = JSON.parse(item.items);

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
                <View style={[styles.statusBadge, item.status === 'PREPARING' ? styles.bgPrep : item.status === 'READY' ? styles.bgReady : styles.bgRec]}>
                    <Text style={styles.statusText}>{item.status}</Text>
                </View>
            </View>

            <View style={styles.itemsList}>
                {items.map((food, idx) => (
                    <View key={idx} style={styles.itemRow}>
                        <Text style={styles.itemQty}>{food.quantity}x</Text>
                        <Text style={styles.itemName}>{food.name}</Text>
                    </View>
                ))}
            </View>

            <View style={styles.divider} />

            <View style={styles.actionRow}>
                {item.status === 'RECEIVED' && (
                    <TouchableOpacity style={[styles.actionBtn, styles.prepBtn]} onPress={() => onUpdateStatus(item.id, 'PREPARING')}>
                        <Flame color="white" size={20} />
                        <Text style={styles.btnText}>Start Cooking</Text>
                    </TouchableOpacity>
                )}
                {item.status === 'PREPARING' && (
                    <TouchableOpacity style={[styles.actionBtn, styles.readyBtn]} onPress={() => onUpdateStatus(item.id, 'READY')}>
                        <CheckCircle color="white" size={20} />
                        <Text style={styles.btnText}>Finalize Order</Text>
                    </TouchableOpacity>
                )}
                {item.status === 'READY' && (
                    <TouchableOpacity 
                        style={[styles.actionBtn, styles.callBtn]} 
                        onPress={() => onCallWaiter({
                            tableId: item.session.tableId,
                            sessionId: item.sessionId,
                            tableNumber: item.session.table.number
                        })}
                    >
                        <Smartphone color="white" size={20} />
                        <Text style={styles.btnText}>Call Waiter</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

export default function DashboardScreen() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const { logout, user } = useAuth();
    const { socket, callWaiterForPickup } = useSocket();

    const fetchOrders = async () => {
        try {
            const res = await client.get('/order/active-chef');
            setOrders(res.data);
        } catch (e) {
            console.error('Fetch Orders Error', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
        if (socket) {
            socket.on('new_order', (order) => {
                setOrders(prev => [...prev, order]);
            });
            return () => socket.off('new_order');
        }
    }, [socket]);

    const updateStatus = async (orderId, status) => {
        try {
            await client.post(`/order/${orderId}/status`, { status });
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
        } catch (e) {
            Alert.alert('Error', 'Failed to update status');
        }
    };

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

            {loading ? (
                <View style={styles.centered}><ActivityIndicator color="#F97316" size="large" /></View>
            ) : (
                <FlatList
                    data={orders}
                    keyExtractor={o => o.id}
                    renderItem={({ item }) => (
                        <OrderItem 
                            item={item} 
                            onUpdateStatus={updateStatus} 
                            onCallWaiter={callWaiterForPickup}
                        />
                    )}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <ChefHat color="#E2E8F0" size={100} />
                            <Text style={styles.emptyText}>Kitchen is Clear</Text>
                            <Text style={styles.emptySub}>Awaiting new orders from customers...</Text>
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
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: 'white' },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerTitle: { fontSize: 22, fontWeight: '900', color: '#1E293B' },
    logoutBtn: { padding: 8 },
    listContent: { padding: 15 },
    orderCard: { backgroundColor: 'white', borderRadius: 24, padding: 20, marginBottom: 15, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12 },
    orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    tableLabel: { fontSize: 20, fontWeight: '900', color: '#0F172A', letterSpacing: 0.5 },
    statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    bgRec: { backgroundColor: '#FEF3C7' },
    bgPrep: { backgroundColor: '#DBEAFE' },
    bgReady: { backgroundColor: '#DCFCE7' },
    statusText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
    preorderBadge: { backgroundColor: '#F0F9FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#0EA5E9' },
    preorderText: { color: '#0EA5E9', fontSize: 10, fontWeight: '900' },
    itemsList: { marginBottom: 15 },
    itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    itemQty: { color: '#F97316', fontWeight: '800', width: 35, fontSize: 16 },
    itemName: { color: '#334155', fontSize: 16, fontWeight: '600' },
    divider: { height: 1, backgroundColor: '#F1F5F9', marginBottom: 15 },
    actionRow: { flexDirection: 'row', gap: 10 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 16, gap: 10 },
    prepBtn: { backgroundColor: '#3B82F6' },
    readyBtn: { backgroundColor: '#10B981' },
    callBtn: { backgroundColor: '#F97316' },
    btnText: { color: 'white', fontWeight: '700', fontSize: 15 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
    emptyText: { fontSize: 20, fontWeight: '800', color: '#94A3B8', marginTop: 20 },
    emptySub: { fontSize: 14, color: '#CBD5E1', marginTop: 8 }
});
