import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, Platform, StatusBar, Alert, ScrollView, RefreshControl, Modal } from 'react-native';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { 
    Bell, User, LogOut, CheckCircle, Clock, Flame, Receipt, Wifi, WifiOff, RefreshCw, 
    ShieldCheck, ShieldX, History, Activity, Users, ChevronRight 
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import client from '../api/client';

const getRelativeTime = (timestamp) => {
    const min = Math.round((new Date() - new Date(timestamp)) / 60000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
};

// --- Connectivity Banner ---
const ConnectivityBar = ({ isConnected, onReconnect, onRefresh }) => (
    <View style={[styles.connectBar, { backgroundColor: isConnected ? '#ECFDF5' : '#FEF2F2' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {isConnected ? <Wifi color="#059669" size={16} /> : <WifiOff color="#DC2626" size={16} />}
            <Text style={{ fontSize: 13, fontWeight: '700', color: isConnected ? '#059669' : '#DC2626' }}>
                {isConnected ? 'Live Connected' : 'Disconnected'}
            </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
            {!isConnected && (
                <TouchableOpacity onPress={onReconnect} style={styles.connectAction}>
                    <WifiOff color="#DC2626" size={14} />
                    <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 12 }}>Reconnect</Text>
                </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onRefresh} style={styles.connectAction}>
                <RefreshCw color={isConnected ? '#059669' : '#DC2626'} size={14} />
                <Text style={{ color: isConnected ? '#059669' : '#DC2626', fontWeight: '700', fontSize: 12 }}>Refresh</Text>
            </TouchableOpacity>
        </View>
    </View>
);

// --- Approval Card ---
const ApprovalCard = ({ order, onApprove, onReject }) => {
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    const tableNum = order.session?.table?.number || '?';

    return (
        <View style={styles.approvalCard}>
            <View style={styles.approvalHeader}>
                <Text style={styles.approvalTable}>Table {tableNum}</Text>
                <View style={styles.approvalBadge}>
                    <Text style={styles.approvalBadgeText}>NEEDS APPROVAL</Text>
                </View>
            </View>
            <View style={{ marginBottom: 12 }}>
                {items.map((food, idx) => (
                    <Text key={idx} style={styles.approvalItem}>{food.quantity}x {food.name}</Text>
                ))}
            </View>
            {order.specialInstructions && (
                <Text style={{ fontSize: 12, color: '#6B7280', fontStyle: 'italic', marginBottom: 10 }}>"{order.specialInstructions}"</Text>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={styles.approveBtn} onPress={() => onApprove(order.id)} activeOpacity={0.7}>
                    <ShieldCheck color="white" size={18} />
                    <Text style={styles.approveBtnText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.rejectBtn} onPress={() => onReject(order.id)} activeOpacity={0.7}>
                    <ShieldX color="white" size={18} />
                    <Text style={styles.rejectBtnText}>Reject</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

// --- History Item (Expandable) ---
const HistoryItem = ({ item, navigation }) => {
    const [expanded, setExpanded] = useState(false);
    const isCall = item.type === 'CALL';
    const isChef = item.callType === 'CHEF_CALL' || item.callType === 'PICKUP_CALL';
    const isBill = item.callType === 'BILL_REQUEST' || item.callType === 'PAYMENT_NOTICE';
    const isOrder = item.type === 'ORDER';

    const getStatusText = () => {
        if (isOrder) {
            if (item.status === 'DELIVERED') return 'Completed Delivery';
            if (item.status === 'REJECTED') return 'Rejected Order';
            return 'Approved Order';
        }
        if (isChef) return 'Kitchen Request';
        if (isBill) return 'Payment Request';
        return 'Table Assistance';
    };

    const getBadgeLabel = () => {
        if (isOrder) return 'ORDER';
        if (isChef) return 'KITCHEN';
        if (isBill) return 'BILL';
        return 'CUSTOMER';
    };

    const getIcon = () => {
        if (isOrder) return <CheckCircle color="#10B981" size={18} />;
        if (isChef) return <Flame color="#F97316" size={18} />;
        if (isBill) return <Receipt color="#3B82F6" size={18} />;
        return <Bell color="#8B5CF6" size={18} />; 
    };

    const getColors = () => {
        if (isOrder) return { bg: '#ECFDF5', text: '#065F46', border: '#D1FAE5' };
        if (isChef) return { bg: '#FFF7ED', text: '#9A3412', border: '#FFEDD5' };
        if (isBill) return { bg: '#EFF6FF', text: '#1E40AF', border: '#DBEAFE' };
        return { bg: '#F5F3FF', text: '#5B21B6', border: '#EDE9FE' };
    };

    const colors = getColors();

    let parsedItems = [];
    if (item.items) {
        try {
            parsedItems = typeof item.items === 'string' ? JSON.parse(item.items) : item.items;
        } catch (e) {}
    }

    return (
        <TouchableOpacity 
            style={[styles.historyCard, { borderLeftWidth: 4, borderLeftColor: colors.border }]} 
            activeOpacity={0.7} 
            onPress={() => !isCall && setExpanded(!expanded)}
            disabled={isCall && !item.message}
        >
            <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <View style={[styles.miniBadge, { backgroundColor: colors.bg }]}>
                                <Text style={[styles.miniBadgeText, { color: colors.text }]}>{getBadgeLabel()}</Text>
                            </View>
                            <Text style={styles.historyTime}>{getRelativeTime(item.timestamp)}</Text>
                        </View>
                        <Text style={styles.historyTitle}>{getStatusText()}</Text>
                        <Text style={styles.historySub}>Table {item.tableNumber}</Text>
                    </View>
                    <View style={[styles.historyIconCircle, { backgroundColor: colors.bg }]}>
                        {getIcon()}
                    </View>
                </View>
                
                {(!expanded && (item.message || item.orderNumber)) && (
                    <View style={styles.detailPreview}>
                        <Text style={styles.historyDetail} numberOfLines={1}>
                            {isCall ? (item.message || 'Assistance provided') : `Order #${item.orderNumber} • ${parsedItems.length} items`}
                        </Text>
                    </View>
                )}

                {expanded && isOrder && (
                    <View style={styles.expandedOrderBox}>
                        <View style={styles.expandedOrderHeader}>
                            <Text style={{fontWeight: '700', color: '#1E293B', fontSize: 13}}>Items List</Text>
                            <Text style={{fontWeight: '800', color: '#059669'}}>${item.totalAmount?.toFixed(2)}</Text>
                        </View>
                        {parsedItems.map((food, idx) => (
                            <View key={idx} style={{ flexDirection: 'row', marginTop: 6, gap: 8 }}>
                                <Text style={{fontWeight: '700', color: '#475569', fontSize: 13}}>{food.quantity}x</Text>
                                <Text style={{color: '#475569', flex: 1, fontSize: 13}}>{food.name}</Text>
                            </View>
                        ))}

                        <TouchableOpacity 
                            style={styles.auditBtn} 
                            onPress={() => navigation.navigate('OrderAudit', { orderId: item.id, orderNumber: item.orderNumber })}
                        >
                            <Activity color="#0EA5E9" size={16} />
                            <Text style={styles.auditBtnText}>View Detailed Timeline</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
};

// --- Call List Item ---
const CallListItem = ({ item, index, onAcknowledge }) => {
    const getSequenceLabel = (idx) => {
        if (idx === 0) return '1st';
        if (idx === 1) return '2nd';
        if (idx === 2) return '3rd';
        return `${idx + 1}th`;
    };

    const isKitchen = item.type === 'PICKUP_CALL';
    const isBill = item.type === 'BILL_REQUEST' || item.type === 'PAYMENT_NOTICE';

    const borderColor = isKitchen ? '#F97316' : isBill ? '#3B82F6' : '#8B5CF6';
    const Icon = isKitchen ? Flame : isBill ? Receipt : Bell;
    const badgeColor = isKitchen ? '#FFEDD5' : isBill ? '#DBEAFE' : '#EDE9FE';
    const textColor = isKitchen ? '#C2410C' : isBill ? '#1D4ED8' : '#7E22CE';
    const tagText = isKitchen ? 'KITCHEN' : isBill ? 'PAYMENT' : 'CUSTOMER';

    return (
        <View style={[styles.callCard, { borderLeftColor: borderColor }]}>
            <View style={styles.callHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.sequenceBadge, { backgroundColor: badgeColor, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                        <Icon color={textColor} size={14} />
                        <Text style={[styles.sequenceText, { color: textColor }]}>{getSequenceLabel(index)}</Text>
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: textColor, textTransform: 'uppercase' }}>
                        {tagText}
                    </Text>
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

// --- Main Dashboard Screen ---
export default function DashboardScreen(props) {
    const { logout, user } = useAuth();
    const { 
        calls, pendingOrders, isConnected, socket,
        historyLogs, fetchHistory,
        acknowledgeCall, approveOrder, rejectOrder, 
        manualReconnect, reFetch 
    } = useSocket();
    const { navigation } = props;
    
    const [readyOrders, setReadyOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [isHistoryVisible, setIsHistoryVisible] = useState(false);
    const [activeHistoryTab, setActiveHistoryTab] = useState('ALL'); // ALL, CUSTOMER, KITCHEN, ORDERS

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

    useEffect(() => {
        if (socket) {
            const handleOrderUpdate = (data) => {
                // If a Chef finalized an order, eagerly fetch the full "Ready for Pickup" card
                if (data.status === 'READY') {
                    fetchReadyOrders();
                } 
                // If it was delivered (or cancelled), rip it out of the local Ready view
                else if (data.status === 'DELIVERED' || data.status === 'REJECTED') {
                    setReadyOrders(prev => prev.filter(o => o.id !== data.orderId));
                }
            };

            socket.on('order_status_update', handleOrderUpdate);
            return () => socket.off('order_status_update', handleOrderUpdate);
        }
    }, [socket]);

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([fetchReadyOrders(), reFetch()]);
        setRefreshing(false);
    };

    const handleApprove = async (orderId) => {
        try {
            await approveOrder(orderId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {
            Alert.alert('Error', 'Failed to approve the order. Please try again.');
        }
    };

    const handleReject = async (orderId) => {
        Alert.alert(
            'Reject Order?',
            'Are you sure you want to reject this order? The customer will be notified.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reject',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await rejectOrder(orderId);
                        } catch (e) {
                            Alert.alert('Error', 'Failed to reject the order.');
                        }
                    }
                }
            ]
        );
    };

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

            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.welcomeText}>Hello, {user?.name || 'Staff'}</Text>
                    <Text style={styles.statusText}>Active & Online</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 15 }}>
                    <TouchableOpacity onPress={() => setIsHistoryVisible(true)} style={styles.iconBtn}>
                        <History color="#0EA5E9" size={24} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={logout} style={[styles.iconBtn, { backgroundColor: '#FEF2F2' }]}>
                        <LogOut color="#EF4444" size={24} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Socket Status */}
            <ConnectivityBar
                isConnected={isConnected}
                onReconnect={manualReconnect}
                onRefresh={onRefresh}
            />

            <ScrollView
                style={{ flex: 1 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0EA5E9" />}
            >
                {/* Table Management Quick Link */}
                <TouchableOpacity 
                    style={styles.tableMgmtBtn} 
                    onPress={() => navigation.navigate('TableManagement')}
                    activeOpacity={0.8}
                >
                    <View style={styles.tableMgmtIcon}>
                        <Users size={20} color="#7C3AED" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.tableMgmtTitle}>Table Management</Text>
                        <Text style={styles.tableMgmtSub}>View codes & clear tables</Text>
                    </View>
                    <ChevronRight size={20} color="#CBD5E1" />
                </TouchableOpacity>

                {/* Stats Row */}
                <View style={styles.statsRow}>
                    <View style={styles.statCard}>
                        <Bell color="#0EA5E9" size={24} />
                        <Text style={styles.statNumber}>{calls.length}</Text>
                        <Text style={styles.statLabel}>Pending Calls</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: '#FFF7ED' }]}>
                        <ShieldCheck color="#EA580C" size={24} />
                        <Text style={styles.statNumber}>{pendingOrders.length}</Text>
                        <Text style={styles.statLabel}>Approvals</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: '#ECFDF5' }]}>
                        <CheckCircle color="#059669" size={24} />
                        <Text style={styles.statNumber}>{readyOrders.length}</Text>
                        <Text style={styles.statLabel}>Ready</Text>
                    </View>
                </View>

                {/* --- Approvals Required Section --- */}
                {pendingOrders.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: '#EA580C' }]}>⚡ Approvals Required</Text>
                            <Text style={styles.sectionSub}>Verify these orders before kitchen starts</Text>
                        </View>
                        {pendingOrders.map((order) => (
                            <ApprovalCard
                                key={order.id}
                                order={order}
                                onApprove={handleApprove}
                                onReject={handleReject}
                            />
                        ))}
                    </View>
                )}

                {/* --- Ready for Pickup --- */}
                {readyOrders.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: '#10B981' }]}>🍽️ Ready for Pickup</Text>
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
                                        <Text style={styles.readyTable}>Table {item.session?.table?.number || '?'}</Text>
                                        <Clock color="#059669" size={14} />
                                    </View>
                                    <Text style={styles.readyItems} numberOfLines={2}>
                                        {JSON.parse(item.items).map(i => `${i.quantity}x ${i.name}`).join(', ')}
                                    </Text>
                                    <TouchableOpacity
                                        style={styles.deliverBtn}
                                        onPress={() => markAsDelivered(item.id)}
                                    >
                                        <Text style={styles.deliverBtnText}>Delivered ✓</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        />
                    </View>
                )}

                {/* --- Call Queue --- */}
                <View style={[styles.section, { paddingBottom: 40 }]}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>🔔 Call Queue</Text>
                        <Text style={styles.sectionSub}>Prioritized by arrival time</Text>
                    </View>

                    {calls.length === 0 ? (
                        <View style={styles.emptyState}>
                            <CheckCircle color="#CBD5E1" size={60} />
                            <Text style={styles.emptyText}>All tables are served!</Text>
                            <Text style={styles.emptySub}>Good job keeping the floor clear.</Text>
                        </View>
                    ) : (
                        calls.map((item, index) => (
                            <CallListItem
                                key={item.callId}
                                item={item}
                                index={index}
                                onAcknowledge={acknowledgeCall}
                            />
                        ))
                    )}
                </View>
            </ScrollView>

            {/* --- History Modal --- */}
            <Modal visible={isHistoryVisible} animationType="slide" presentationStyle="pageSheet">
                <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
                    <View style={styles.modalHeader}>
                        <Activity color="#0EA5E9" size={24} style={{ marginRight: 8 }} />
                        <Text style={styles.modalTitle}>My Activity Log</Text>
                        <TouchableOpacity onPress={() => setIsHistoryVisible(false)} style={styles.closeBtn}>
                            <Text style={styles.closeBtnText}>Done</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Filter Tabs */}
                    <View style={styles.filterTabs}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
                            {['ALL', 'CUSTOMER', 'KITCHEN', 'ORDERS'].map(tab => (
                                <TouchableOpacity 
                                    key={tab} 
                                    style={[styles.filterBtn, activeHistoryTab === tab && styles.filterBtnActive]}
                                    onPress={() => setActiveHistoryTab(tab)}
                                >
                                    <Text style={[styles.filterBtnText, activeHistoryTab === tab && styles.filterBtnTextActive]}>
                                        {tab.charAt(0) + tab.slice(1).toLowerCase()}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    <FlatList
                        data={historyLogs.filter(item => {
                            if (activeHistoryTab === 'ALL') return true;
                            if (activeHistoryTab === 'ORDERS') return item.type === 'ORDER';
                            if (activeHistoryTab === 'KITCHEN') return item.callType === 'CHEF_CALL' || item.callType === 'PICKUP_CALL';
                            if (activeHistoryTab === 'CUSTOMER') return item.type === 'CALL' && (item.callType === 'WAITER_CALL' || item.callType === 'BILL_REQUEST' || item.callType === 'PAYMENT_NOTICE' || !item.callType);
                            return true;
                        })}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={{ padding: 20, paddingTop: 10 }}
                        refreshing={refreshing}
                        onRefresh={() => {
                            setRefreshing(true);
                            fetchHistory().finally(() => setRefreshing(false));
                        }}
                        ListHeaderComponent={
                            <View style={styles.historyStats}>
                                <Text style={styles.historyStatsText}>
                                    Showing {historyLogs.length} recent activities
                                </Text>
                            </View>
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyText}>No History Found</Text>
                                <Text style={styles.emptySub}>Change filters or pull to refresh your recent tasks.</Text>
                            </View>
                        }
                        renderItem={({ item }) => (
                            <HistoryItem item={item} navigation={navigation} />
                        )}
                    />
                </SafeAreaView>
            </Modal>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 24, paddingVertical: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    historyTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B', marginBottom: 2, letterSpacing: -0.3 },
    historyTime: { fontSize: 11, color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    historySub: { fontSize: 13, color: '#64748B', fontWeight: '600' },
    historyDetail: { fontSize: 13, color: '#64748B', fontWeight: '500' },
    detailPreview: { marginTop: 10, padding: 10, backgroundColor: '#F8FAFC', borderRadius: 8, borderLeftWidth: 3, borderLeftColor: '#E2E8F0' },
    historyIconCircle: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    miniBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    miniBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
    expandedOrderBox: { marginTop: 16, backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9' },
    expandedOrderHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', marginBottom: 8 },

    filterTabs: { backgroundColor: '#FFFFFF', paddingBottom: 16, paddingTop: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    filterBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9' },
    filterBtnActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
    filterBtnText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
    filterBtnTextActive: { color: '#FFFFFF' },

    historyStats: { paddingBottom: 16, paddingTop: 8 },
    historyStatsText: { fontSize: 13, color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    welcomeText: { fontSize: 24, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
    statusText: { fontSize: 13, color: '#10B981', fontWeight: '700', marginTop: 4 },
    iconBtn: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },

    // Connectivity
    connectBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#ECFDF5', marginHorizontal: 20, marginTop: 20, borderRadius: 16 },
    connectAction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FFFFFF' },

    // Stats
    statsRow: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 20, paddingTop: 10, gap: 12 },
    statCard: { flex: 1, backgroundColor: 'white', padding: 16, borderRadius: 24, alignItems: 'flex-start', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 4 },
    statNumber: { fontSize: 28, fontWeight: '900', color: '#0F172A', marginTop: 12, letterSpacing: -0.5 },
    statLabel: { fontSize: 13, color: '#64748B', marginTop: 4, fontWeight: '600' },

    // Sections
    section: { paddingHorizontal: 20, marginBottom: 28 },
    sectionHeader: { marginBottom: 20 },
    sectionTitle: { fontSize: 20, fontWeight: '900', color: '#1E293B', letterSpacing: -0.5 },
    sectionSub: { fontSize: 14, color: '#94A3B8', marginTop: 4, fontWeight: '500' },

    // Approval Cards
    approvalCard: { backgroundColor: 'white', borderRadius: 24, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 5 },
    approvalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    approvalTable: { fontSize: 24, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
    approvalBadge: { backgroundColor: '#FFF7ED', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    approvalBadgeText: { fontSize: 11, fontWeight: '800', color: '#EA580C', letterSpacing: 0.5 },
    approvalItem: { fontSize: 16, color: '#334155', fontWeight: '600', marginBottom: 6 },
    approveBtn: { flex: 1, backgroundColor: '#0F172A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 16, gap: 8 },
    approveBtnText: { color: 'white', fontWeight: '800', fontSize: 15 },
    rejectBtn: { flex: 1, backgroundColor: '#FEF2F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 16, gap: 8 },
    rejectBtnText: { color: '#EF4444', fontWeight: '800', fontSize: 15 },

    // Ready Cards
    readyCard: { backgroundColor: '#ECFDF5', width: 260, padding: 20, borderRadius: 24, marginRight: 16, borderWidth: 2, borderColor: '#D1FAE5' },
    readyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    readyTable: { fontSize: 22, fontWeight: '900', color: '#065F46', letterSpacing: -0.5 },
    readyItems: { fontSize: 14, color: '#047857', marginBottom: 16, height: 40, fontWeight: '500' },
    deliverBtn: { backgroundColor: '#10B981', paddingVertical: 12, borderRadius: 14, alignItems: 'center', shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
    deliverBtnText: { color: 'white', fontWeight: '800', fontSize: 15 },

    // Call Cards
    callCard: { backgroundColor: 'white', borderRadius: 24, padding: 20, marginBottom: 16, borderLeftWidth: 6, borderLeftColor: '#CBD5E1', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
    callHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sequenceBadge: { backgroundColor: '#F8FAFC', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    sequenceText: { fontSize: 12, fontWeight: '800', color: '#475569' },
    timestamp: { fontSize: 13, color: '#94A3B8', fontWeight: '600' },
    callContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    tableNumber: { fontSize: 28, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
    callMessage: { fontSize: 15, color: '#64748B', marginTop: 6, fontWeight: '500' },
    ackButton: { backgroundColor: '#0EA5E9', flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 16, gap: 8, shadowColor: '#0EA5E9', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
    ackButtonText: { color: 'white', fontWeight: '800', fontSize: 15 },

    // Empty
    emptyState: { alignItems: 'center', marginTop: 40, marginBottom: 30 },
    emptyText: { fontSize: 20, fontWeight: '800', color: '#64748B', marginTop: 20, letterSpacing: -0.5 },
    emptySub: { fontSize: 15, color: '#94A3B8', marginTop: 8, fontWeight: '500' },
    tableMgmtBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        marginHorizontal: 20,
        marginTop: 20,
        marginBottom: 10,
        padding: 20,
        borderRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 20,
        elevation: 6
    },
    tableMgmtIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#F5F3FF', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    tableMgmtTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
    tableMgmtSub: { fontSize: 13, color: '#64748B', marginTop: 4, fontWeight: '500' },
    auditBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, paddingVertical: 14, backgroundColor: '#F0F9FF', borderRadius: 14 },
    auditBtnText: { color: '#0EA5E9', fontWeight: '800', fontSize: 14 },

    // Additional History Item Styles
    historyCard: { backgroundColor: 'white', borderRadius: 20, padding: 20, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 24, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    modalTitle: { flex: 1, fontSize: 20, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
    closeBtn: { backgroundColor: '#F8FAFC', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
    closeBtnText: { color: '#0F172A', fontWeight: '800', fontSize: 14 },
});
