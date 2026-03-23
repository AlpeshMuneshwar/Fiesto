import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, Platform, StatusBar } from 'react-native';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { Bell, User, LogOut, CheckCircle, Clock } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import client from '../api/client';

const CallListItem = ({ item, index, onAcknowledge }) => {
    // Determine the sequence label
    const getSequenceLabel = (idx) => {
        if (idx === 0) return '1st Call';
        if (idx === 1) return '2nd Call';
        if (idx === 2) return '3rd Call';
        return `${idx + 1}th Call`;
    };

    return (
        <View style={styles.callCard}>
            <View style={styles.callHeader}>
                <View style={[styles.sequenceBadge, index === 0 && styles.firstCallBadge]}>
                    <Text style={styles.sequenceText}>{getSequenceLabel(index)}</Text>
                </View>
                <Text style={styles.timestamp}>
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>

            <View style={styles.callContent}>
                <View>
                    <Text style={styles.tableNumber}>Table {item.tableNumber}</Text>
                    <Text style={styles.callMessage}>{item.message || 'Needs assistance'}</Text>
                </View>
                
                <TouchableOpacity 
                    style={styles.ackButton} 
                    onPress={() => onAcknowledge(item.callId)}
                    activeOpacity={0.7}
                >
                    <CheckCircle color="white" size={20} />
                    <Text style={styles.ackButtonText}>I'm Coming</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

export default function DashboardScreen() {
    const { calls, acknowledgeCall } = useSocket();
    const { user, logout } = useAuth();
    const [readyOrders, setReadyOrders] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchReadyOrders = async () => {
        try {
            setLoading(true);
            const res = await client.get('/order-waiter/active-waiter');
            setReadyOrders(res.data);
        } catch (e) {
            console.error('Fetch Ready Orders Error', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReadyOrders();
    }, []);

    const markAsDelivered = async (orderId) => {
        try {
            await client.post(`/order-waiter/${orderId}/deliver`);
            setReadyOrders(prev => prev.filter(o => o.id !== orderId));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {
            Alert.alert('Error', 'Failed to mark as delivered');
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <View>
                    <Text style={styles.welcomeText}>Hello, {user?.name || 'Staff'}</Text>
                    <Text style={styles.statusText}>Active & Online</Text>
                </View>
                <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
                    <LogOut color="#EF4444" size={24} />
                </TouchableOpacity>
            </View>

            <View style={styles.statsRow}>
                <View style={styles.statCard}>
                    <Bell color="#0EA5E9" size={24} />
                    <Text style={styles.statNumber}>{calls.length}</Text>
                    <Text style={styles.statLabel}>Pending Calls</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#F0F9FF' }]}>
                    <Clock color="#0369A1" size={24} />
                    <Text style={styles.statLabel}>Response Target</Text>
                    <Text style={styles.statSub}>{'< 2 mins'}</Text>
                </View>
            </View>

            <View style={styles.listContainer}>
                {readyOrders.length > 0 && (
                    <View style={styles.readySection}>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: '#10B981' }]}>Ready for Pickup</Text>
                            <Text style={styles.sectionSub}>Pick these up from the kitchen</Text>
                        </View>
                        <FlatList
                            horizontal
                            data={readyOrders}
                            keyExtractor={o => o.id}
                            showsHorizontalScrollIndicator={false}
                            renderItem={({ item }) => (
                                <View style={styles.readyCard}>
                                    <View style={styles.readyHeader}>
                                        <Text style={styles.readyTable}>Table {item.session.table.number}</Text>
                                        <Clock color="#059669" size={14} />
                                    </View>
                                    <Text style={styles.readyItems} numberOfLines={2}>
                                        {JSON.parse(item.items).map(i => `${i.quantity}x ${i.name}`).join(', ')}
                                    </Text>
                                    <TouchableOpacity 
                                        style={styles.deliverBtn} 
                                        onPress={() => markAsDelivered(item.id)}
                                    >
                                        <Text style={styles.deliverBtnText}>Delivered</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        />
                    </View>
                )}

                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Call Queue</Text>
                    <Text style={styles.sectionSub}>Prioritized by arrival time</Text>
                </View>

                {calls.length === 0 ? (
                    <View style={styles.emptyState}>
                        <CheckCircle color="#CBD5E1" size={60} />
                        <Text style={styles.emptyText}>All tables are served!</Text>
                        <Text style={styles.emptySub}>Good job keeping the floor clear.</Text>
                    </View>
                ) : (
                    <FlatList
                        data={calls}
                        keyExtractor={(item) => item.callId}
                        renderItem={({ item, index }) => (
                            <CallListItem 
                                item={item} 
                                index={index} 
                                onAcknowledge={acknowledgeCall} 
                            />
                        )}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: 'white' },
    welcomeText: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
    statusText: { fontSize: 12, color: '#10B981', fontWeight: '600' },
    logoutBtn: { padding: 10, backgroundColor: '#FEF2F2', borderRadius: 12 },
    statsRow: { flexDirection: 'row', padding: 20, gap: 15 },
    statCard: { flex: 1, backgroundColor: 'white', padding: 15, borderRadius: 20, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10 },
    statNumber: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginTop: 8 },
    statLabel: { fontSize: 12, color: '#64748B', marginTop: 2 },
    statSub: { fontSize: 13, fontWeight: '700', color: '#0369A1', marginTop: 4 },
    listContainer: { flex: 1, paddingHorizontal: 20 },
    sectionHeader: { marginBottom: 15 },
    sectionTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
    sectionSub: { fontSize: 13, color: '#94A3B8' },
    readySection: { marginBottom: 30 },
    readyCard: { backgroundColor: '#ECFDF5', width: 220, padding: 15, borderRadius: 20, marginRight: 15, borderStyle: 'dashed', borderWidth: 1, borderColor: '#10B981' },
    readyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    readyTable: { fontSize: 18, fontWeight: '800', color: '#065F46' },
    readyItems: { fontSize: 13, color: '#047857', marginBottom: 12, height: 35 },
    deliverBtn: { backgroundColor: '#10B981', paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
    deliverBtnText: { color: 'white', fontWeight: '800', fontSize: 13 },
    listContent: { paddingBottom: 30 },
    callCard: { backgroundColor: 'white', borderRadius: 24, padding: 20, marginBottom: 15, borderLeftWidth: 6, borderLeftColor: '#CBD5E1' },
    callHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    sequenceBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    firstCallBadge: { backgroundColor: '#FEF3C7' },
    sequenceText: { fontSize: 11, fontWeight: '700', color: '#475569' },
    timestamp: { fontSize: 12, color: '#94A3B8' },
    callContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    tableNumber: { fontSize: 26, fontWeight: '900', color: '#0F172A' },
    callMessage: { fontSize: 14, color: '#64748B', marginTop: 4 },
    ackButton: { backgroundColor: '#10B981', flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16, gap: 8 },
    ackButtonText: { color: 'white', fontWeight: '700', fontSize: 14 },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50 },
    emptyText: { fontSize: 18, fontWeight: '700', color: '#64748B', marginTop: 15 },
    emptySub: { fontSize: 14, color: '#94A3B8', marginTop: 4 }
});
