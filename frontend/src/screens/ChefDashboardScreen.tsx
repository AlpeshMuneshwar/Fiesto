import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, SafeAreaView } from 'react-native';
import client, { SOCKET_URL } from '../api/client';
import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWindowDimensions, Platform } from 'react-native';
import ResponsiveContainer from '../components/ResponsiveContainer';
import { useAudioPlayer } from 'expo-audio';

export default function ChefDashboardScreen({ navigation }: any) {
    const [orders, setOrders] = useState<any[]>([]);
    const [socket, setSocket] = useState<any>(null);
    const [cafeId, setCafeId] = useState<string | null>(null);
    const { width } = useWindowDimensions();
    const isWide = width > 768;

    const notificationPlayer = useAudioPlayer({
        uri: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3'
    });

    const playNotification = () => {
        if (notificationPlayer) {
            notificationPlayer.play();
        }
    };

    useEffect(() => {
        const init = async () => {
            const userStr = await AsyncStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                setCafeId(user.cafeId);
                fetchOrders();
                const newSocket = io(SOCKET_URL);
                setSocket(newSocket);
                // Join room specific to this cafe's kitchen
                newSocket.emit('join_room', { room: `CHEF_${user.cafeId}`, role: 'CHEF' });

                newSocket.on('new_order', (order: any) => {
                    if (order.status === 'RECEIVED') {
                        setOrders(prev => [...prev, order]);
                        playNotification();
                    }
                });
                return () => { newSocket.disconnect(); }
            }
        };
        init();
    }, []);

    const fetchOrders = async () => {
        try {
            const res = await client.get('/order/active-chef');
            setOrders(res.data);
        } catch (error: any) {
            const msg = error.response?.data?.error || "Check your server connection";
            console.error("Chef Fetch Error:", msg);
            Alert.alert("Sync Error", msg);
        }
    };

    const updateStatus = async (orderId: string, status: string) => {
        try {
            await client.post(`/order/${orderId}/status`, { status });
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
        } catch (error: any) {
            const msg = error.response?.data?.error || "Failed to update order status";
            Alert.alert('Action Error', msg);
        }
    };

    const callWaiter = () => {
        if (socket && cafeId) {
            socket.emit('call_waiter', {
                message: 'Food is ready for pickup!',
                type: 'voip_ring',
                room: `WAITER_${cafeId}`
            });
            Alert.alert('Calling Waiter...', 'Ringing Waiter dashboard now.');
        }
    };

    const handleLogout = async () => {
        await AsyncStorage.removeItem('userToken');
        navigation.replace('Login');
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                <ResponsiveContainer maxWidth={1200}>
                    <View style={styles.headerRow}>
                        <Text style={styles.header}>Kitchen Display</Text>
                        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                            <Text style={styles.logoutText}>Logout</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={[isWide && { flexDirection: 'row', flexWrap: 'wrap', gap: 15 }]}>
                        {orders.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyText}>No active orders. Kitchen is clear! 🎉</Text>
                            </View>
                        ) : (
                            orders.map(item => (
                                <View key={item.id} style={[styles.card, isWide && { width: '48.5%', marginBottom: 0 }]}>
                                    <View style={styles.cardHeader}>
                                        <View>
                                            <Text style={styles.orderIdLabel}>TABLE {item.session.table.number}</Text>
                                            <View style={styles.statusBadgeRow}>
                                                <View style={[styles.statusBadge, item.status === 'PREPARING' ? styles.bgPreparing : item.status === 'READY' ? styles.bgReady : styles.bgReceived]}>
                                                    <Text style={styles.statusText}>{item.status}</Text>
                                                </View>
                                                {!item.isLocationVerified && (
                                                    <View style={[styles.statusBadge, { backgroundColor: '#E74C3C', marginLeft: 8 }]}>
                                                        <Text style={styles.statusText}>UNVERIFIED</Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                        <Text style={styles.timeTag}>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                    </View>

                                    <View style={styles.divider} />

                                    <View style={styles.itemsList}>
                                        {JSON.parse(item.items).map((food: any, idx: number) => (
                                            <View key={idx} style={styles.itemRow}>
                                                <Text style={styles.itemQty}>{food.quantity}x</Text>
                                                <Text style={styles.itemName}>{food.name}</Text>
                                            </View>
                                        ))}
                                    </View>

                                    <View style={styles.divider} />

                                    <View style={styles.actionRow}>
                                        {item.status === 'RECEIVED' && (
                                            <TouchableOpacity style={[styles.actionBtn, styles.prepBtn]} activeOpacity={0.8} onPress={() => updateStatus(item.id, 'PREPARING')}>
                                                <Text style={styles.btnTextWhite}>Start Preparing</Text>
                                            </TouchableOpacity>
                                        )}
                                        {item.status === 'PREPARING' && (
                                            <TouchableOpacity style={[styles.actionBtn, styles.readyBtn]} activeOpacity={0.8} onPress={() => updateStatus(item.id, 'READY')}>
                                                <Text style={styles.btnTextWhite}>Mark Ready</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    {item.status === 'READY' && (
                                        <TouchableOpacity style={styles.callWaiterBtn} activeOpacity={0.8} onPress={callWaiter}>
                                            <Text style={styles.callBtnText}>📞 In-App Call Waiter</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ))
                        )}
                    </View>
                </ResponsiveContainer>
                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    scrollContent: { padding: 20 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
    header: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
    logoutBtn: { backgroundColor: '#333', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    logoutText: { color: '#FFF', fontWeight: 'bold' },
    emptyState: { alignItems: 'center', marginTop: 50 },
    emptyText: { color: '#7F8C8D', fontSize: 18, fontStyle: 'italic' },
    card: {
        backgroundColor: '#1E1E1E', padding: 20, borderRadius: 16, marginBottom: 15,
        borderWidth: 1, borderColor: '#2A2A2A',
        ...Platform.select({
            web: { boxShadow: '0 6px 10px rgba(0,0,0,0.3)' },
            default: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 }
        })
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    orderIdLabel: { fontSize: 18, fontWeight: '800', color: '#E0E0E0', letterSpacing: 1 },
    statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    bgReceived: { backgroundColor: '#F39C12' },
    bgPreparing: { backgroundColor: '#3498DB' },
    bgReady: { backgroundColor: '#2ECC71' },
    statusText: { color: '#FFF', fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
    divider: { height: 1, backgroundColor: '#2C2C2C', marginVertical: 12 },
    statusBadgeRow: { flexDirection: 'row', marginTop: 4 },
    timeTag: { color: '#7F8C8D', fontSize: 13, fontWeight: '600' },
    itemsList: { marginBottom: 15 },
    itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    itemQty: { color: '#F1C40F', fontWeight: '800', width: 35, fontSize: 16 },
    itemName: { color: '#E0E0E0', fontSize: 16, fontWeight: '500' },
    actionRow: { flexDirection: 'row', gap: 10 },
    actionBtn: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center' },
    prepBtn: { backgroundColor: '#3498DB' },
    readyBtn: { backgroundColor: '#2ECC71' },
    btnTextWhite: { color: '#FFF', fontWeight: '700', fontSize: 16 },
    callWaiterBtn: { backgroundColor: '#E74C3C', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 15 },
    callBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 }
});
