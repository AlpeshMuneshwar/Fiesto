import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, useWindowDimensions, Linking, Alert, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import client from '../api/client';
import ResponsiveContainer from '../components/ResponsiveContainer';

type OrderTab = 'ALL' | 'PREORDER' | 'QR_ORDER' | 'TAKEAWAY';

const ORDER_TABS: Array<{ key: OrderTab; label: string }> = [
    { key: 'ALL', label: 'All' },
    { key: 'PREORDER', label: 'Preorders' },
    { key: 'QR_ORDER', label: 'QR Orders' },
    { key: 'TAKEAWAY', label: 'Takeaway' },
];

export default function AdminOrdersScreen({ navigation, route }: any) {
    const [orders, setOrders] = useState<any[]>([]);
    const [tables, setTables] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [approvalUpdatingId, setApprovalUpdatingId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<OrderTab>('ALL');
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
    const [approvalForm, setApprovalForm] = useState<{ tableId: string; scheduledAt: string; bookingDurationMinutes: number }>({
        tableId: '',
        scheduledAt: '',
        bookingDurationMinutes: 90,
    });
    const { width } = useWindowDimensions();
    const isWide = width >= 980;

    const fetchOrders = useCallback(async (withLoader = false) => {
        if (withLoader) setLoading(true);
        else setRefreshing(true);

        try {
            const [ordersRes, tablesRes] = await Promise.all([
                client.get('/admin/orders/all?limit=400'),
                client.get('/session/tables').catch(() => ({ data: [] })),
            ]);
            const nextOrders = Array.isArray(ordersRes.data) ? ordersRes.data : [];
            setOrders(nextOrders);
            setTables(Array.isArray(tablesRes.data) ? tablesRes.data : []);

            const selectedOrderId = route?.params?.selectedOrderId;
            if (selectedOrderId) {
                const match = nextOrders.find((order: any) => order.id === selectedOrderId);
                if (match) {
                    setSelectedOrder(match);
                    navigation.setParams({ selectedOrderId: undefined });
                }
            }
        } catch {
            setOrders([]);
            setTables([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [navigation, route?.params?.selectedOrderId]);

    useFocusEffect(
        useCallback(() => {
            fetchOrders(true);
            const interval = setInterval(() => fetchOrders(false), 10000);
            return () => clearInterval(interval);
        }, [fetchOrders])
    );

    const counts = useMemo(() => {
        const summary = {
            ALL: orders.length,
            PREORDER: 0,
            QR_ORDER: 0,
            TAKEAWAY: 0,
        } as Record<OrderTab, number>;

        orders.forEach((order) => {
            const type = getOrderTypeKey(order);
            summary[type] += 1;
        });

        return summary;
    }, [orders]);

    const filteredOrders = useMemo(() => {
        if (activeTab === 'ALL') return orders;
        return orders.filter((order) => getOrderTypeKey(order) === activeTab);
    }, [orders, activeTab]);

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

    useEffect(() => {
        if (!selectedOrder) {
            return;
        }

        setApprovalForm({
            tableId: selectedOrder.session?.table?.id || '',
            scheduledAt: toIsoInputValue(selectedOrder.session?.scheduledAt || selectedOrder.createdAt),
            bookingDurationMinutes: Number(selectedOrder.session?.slotDurationMinutes || 90),
        });
    }, [selectedOrder]);

    const handleApproval = async (orderId: string, approve: boolean) => {
        try {
            setApprovalUpdatingId(orderId);
            const payload: any = { approve };
            if (approve && selectedOrder && getOrderTypeKey(selectedOrder) === 'PREORDER') {
                payload.tableId = approvalForm.tableId;
                payload.scheduledAt = normalizeIsoInput(approvalForm.scheduledAt);
                payload.bookingDurationMinutes = approvalForm.bookingDurationMinutes;
            }
            await client.post(`/order/${orderId}/approve`, payload);
            setSelectedOrder(null);
            await fetchOrders(false);
        } catch (error: any) {
            if (error.response?.status === 409 && error.response?.data?.suggestedSlot) {
                const suggestion = error.response.data.suggestedSlot;
                setApprovalForm((previous) => ({
                    ...previous,
                    tableId: suggestion.tableId || previous.tableId,
                    scheduledAt: toIsoInputValue(suggestion.scheduledAt),
                    bookingDurationMinutes: Number(suggestion.slotDurationMinutes || previous.bookingDurationMinutes || 90),
                }));
            }
            Alert.alert('Action failed', error.response?.data?.error || 'Could not update approval');
        } finally {
            setApprovalUpdatingId(null);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingScreen}>
                <ActivityIndicator size="large" color="#0F172A" />
                <Text style={styles.loadingText}>Loading orders...</Text>
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
                            <Text style={styles.badge}>OWNER ORDERS</Text>
                            <Text style={styles.title}>Preorders, QR orders, and takeaway in one queue</Text>
                            <Text style={styles.subtitle}>Open any order to see full items, pricing, session code, customer info, timing, and payment state.</Text>
                            <TouchableOpacity style={styles.refreshBtn} onPress={() => fetchOrders(false)}>
                                <Text style={styles.refreshBtnText}>{refreshing ? 'Refreshing...' : 'Refresh orders'}</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.tabRow}>
                            {ORDER_TABS.map((tab) => (
                                <TouchableOpacity
                                    key={tab.key}
                                    style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
                                    onPress={() => setActiveTab(tab.key)}
                                >
                                    <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                                        {tab.label}
                                    </Text>
                                    <Text style={[styles.tabCount, activeTab === tab.key && styles.tabCountActive]}>
                                        {counts[tab.key]}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={styles.section}>
                            {filteredOrders.length === 0 ? (
                                <View style={styles.emptyCard}>
                                    <Text style={styles.emptyTitle}>No orders in this view</Text>
                                    <Text style={styles.emptyText}>Orders will appear here as soon as customers place them.</Text>
                                </View>
                            ) : (
                                filteredOrders.map((order) => {
                                    const orderType = getOrderTypeKey(order);
                                    const actionable = canApproveOrder(order);
                                    return (
                                        <View key={order.id} style={styles.orderCard}>
                                            <TouchableOpacity
                                                onPress={() => setSelectedOrder(order)}
                                                activeOpacity={0.85}
                                            >
                                                <View style={[styles.orderHeader, isWide && styles.orderHeaderWide]}>
                                                    <View style={styles.orderHeaderMain}>
                                                        <View style={[styles.typePill, { backgroundColor: `${typeColor(orderType)}20`, borderColor: `${typeColor(orderType)}66` }]}>
                                                            <Text style={[styles.typePillText, { color: typeColor(orderType) }]}>{typeLabel(orderType)}</Text>
                                                        </View>
                                                        <Text style={styles.orderCode}>Order {shortCode(order.id)}</Text>
                                                    </View>
                                                    <View style={[styles.statusPill, { backgroundColor: `${statusColor(order.status)}20`, borderColor: `${statusColor(order.status)}66` }]}>
                                                        <Text style={[styles.statusText, { color: statusColor(order.status) }]}>{(order.status || 'UNKNOWN').replace(/_/g, ' ')}</Text>
                                                    </View>
                                                </View>
                                                <Text style={styles.orderMeta}>
                                                    {orderType === 'TAKEAWAY'
                                                        ? 'Takeaway pickup'
                                                        : order.session?.table?.number
                                                            ? `Table ${order.session.table.number}`
                                                            : 'Table not linked'}
                                                    {' | '}
                                                    {formatDateTime(order.createdAt)}
                                                </Text>
                                                <Text style={styles.orderMeta}>
                                                    Items: {resolveItems(order).length} | Total: Rs. {Number(order.totalAmount || 0).toFixed(2)}
                                                </Text>
                                                {order.session?.customer?.name ? (
                                                    <Text style={styles.orderMeta}>Customer: {order.session.customer.name}</Text>
                                                ) : null}
                                            </TouchableOpacity>

                                            {actionable ? (
                                                <View style={styles.orderActionRow}>
                                                    {order.session?.customer?.phoneNumber ? (
                                                        <TouchableOpacity style={styles.callBtnInline} onPress={() => callCustomer(order.session?.customer?.phoneNumber)}>
                                                            <Text style={styles.callBtnInlineText}>Call Customer</Text>
                                                        </TouchableOpacity>
                                                    ) : null}
                                                    {orderType === 'PREORDER' ? (
                                                        <TouchableOpacity
                                                            style={styles.reviewSlotBtn}
                                                            onPress={() => setSelectedOrder(order)}
                                                        >
                                                            <Text style={styles.reviewSlotBtnText}>Review Slot</Text>
                                                        </TouchableOpacity>
                                                    ) : (
                                                        <TouchableOpacity
                                                            style={styles.approveBtn}
                                                            onPress={() => handleApproval(order.id, true)}
                                                            disabled={approvalUpdatingId === order.id}
                                                        >
                                                            <Text style={styles.approveBtnText}>
                                                                {approvalUpdatingId === order.id ? 'Updating...' : 'Approve'}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    )}
                                                    <TouchableOpacity
                                                        style={styles.rejectBtn}
                                                        onPress={() => handleApproval(order.id, false)}
                                                        disabled={approvalUpdatingId === order.id}
                                                    >
                                                        <Text style={styles.rejectBtnText}>Reject</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            ) : null}
                                        </View>
                                    );
                                })
                            )}
                        </View>
                    </View>
                </ResponsiveContainer>
            </ScrollView>

            <Modal visible={Boolean(selectedOrder)} transparent animationType="slide" onRequestClose={() => setSelectedOrder(null)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <ScrollView contentContainerStyle={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <View>
                                    <Text style={styles.modalTitle}>Order Details</Text>
                                    <Text style={styles.modalSubtitle}>{selectedOrder ? shortCode(selectedOrder.id) : ''}</Text>
                                </View>
                                <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedOrder(null)}>
                                    <Text style={styles.closeBtnText}>Close</Text>
                                </TouchableOpacity>
                            </View>

                            {selectedOrder && (
                                <>
                                    <View style={styles.detailSection}>
                                        <Text style={styles.detailTitle}>Order Snapshot</Text>
                                        <Text style={styles.detailLine}>Type: {typeLabel(getOrderTypeKey(selectedOrder))}</Text>
                                        <Text style={styles.detailLine}>Status: {(selectedOrder.status || 'UNKNOWN').replace(/_/g, ' ')}</Text>
                                        <Text style={styles.detailLine}>Created: {formatDateTime(selectedOrder.createdAt)}</Text>
                                        <Text style={styles.detailLine}>Approved: {formatDateTime(selectedOrder.approvedAt)}</Text>
                                        <Text style={styles.detailLine}>Approval Window End: {formatDateTime(selectedOrder.approvalExpiresAt)}</Text>
                                        <Text style={styles.detailLine}>Special Instructions: {selectedOrder.specialInstructions || '--'}</Text>
                                    </View>

                                    <View style={styles.detailSection}>
                                        <Text style={styles.detailTitle}>Pricing</Text>
                                        <Text style={styles.detailLine}>Subtotal: Rs. {Number(selectedOrder.subtotal || 0).toFixed(2)}</Text>
                                        <Text style={styles.detailLine}>Tax: Rs. {Number(selectedOrder.taxAmount || 0).toFixed(2)}</Text>
                                        <Text style={styles.detailLine}>Service Charge: Rs. {Number(selectedOrder.serviceCharge || 0).toFixed(2)}</Text>
                                        <Text style={styles.detailLine}>Platform Fee: Rs. {Number(selectedOrder.platformFee || 0).toFixed(2)}</Text>
                                        <Text style={styles.detailLine}>Advance Paid: Rs. {Number(selectedOrder.advancePaid || 0).toFixed(2)}</Text>
                                        <Text style={styles.detailLineStrong}>Grand Total: Rs. {Number(selectedOrder.totalAmount || 0).toFixed(2)}</Text>
                                    </View>

                                    <View style={styles.detailSection}>
                                        <Text style={styles.detailTitle}>Items Ordered</Text>
                                        {resolveItems(selectedOrder).length === 0 ? (
                                            <Text style={styles.detailLine}>No item payload found.</Text>
                                        ) : (
                                            resolveItems(selectedOrder).map((item: any, index: number) => (
                                                <Text key={`${item.id || item.name || 'item'}-${index}`} style={styles.detailLine}>
                                                    {index + 1}. {item.name || 'Item'} | Qty {Number(item.quantity || 0)} | Rs. {Number(item.price || 0).toFixed(2)} each
                                                </Text>
                                            ))
                                        )}
                                    </View>

                                    <View style={styles.detailSection}>
                                        <Text style={styles.detailTitle}>Session Details</Text>
                                        <Text style={styles.detailLine}>Session ID: {selectedOrder.sessionId || '--'}</Text>
                                        <Text style={styles.detailLine}>Session Code: {selectedOrder.session?.joinCode || '--'}</Text>
                                        <Text style={styles.detailLine}>Scheduled At: {formatDateTime(selectedOrder.session?.scheduledAt)}</Text>
                                        <Text style={styles.detailLine}>Table: {selectedOrder.session?.table?.number ? `Table ${selectedOrder.session.table.number}` : '--'}</Text>
                                        <Text style={styles.detailLine}>Table Description: {selectedOrder.session?.table?.desc || '--'}</Text>
                                        <Text style={styles.detailLine}>Table Capacity: {selectedOrder.session?.table?.capacity || '--'}</Text>
                                        <Text style={styles.detailLine}>Session Active: {selectedOrder.session?.isActive ? 'Yes' : 'No'}</Text>
                                        <Text style={styles.detailLine}>Prebooked Session: {selectedOrder.session?.isPrebooked ? 'Yes' : 'No'}</Text>
                                    </View>

                                    {canApproveOrder(selectedOrder) && getOrderTypeKey(selectedOrder) === 'PREORDER' ? (
                                        <View style={styles.detailSection}>
                                            <Text style={styles.detailTitle}>Approval Slot</Text>
                                            <Text style={styles.detailLine}>Change table, start time, or duration before approving if the original slot is no longer free.</Text>
                                            <TextInput
                                                style={styles.slotInput}
                                                value={approvalForm.scheduledAt}
                                                onChangeText={(value) => setApprovalForm((previous) => ({ ...previous, scheduledAt: value }))}
                                                placeholder="2026-04-29T19:00:00.000Z"
                                                placeholderTextColor="#94A3B8"
                                                autoCapitalize="none"
                                            />
                                            <View style={styles.durationRow}>
                                                {[40, 60, 90, 120].map((minutes) => (
                                                    <TouchableOpacity
                                                        key={minutes}
                                                        style={[styles.durationChip, approvalForm.bookingDurationMinutes === minutes && styles.durationChipActive]}
                                                        onPress={() => setApprovalForm((previous) => ({ ...previous, bookingDurationMinutes: minutes }))}
                                                    >
                                                        <Text style={[styles.durationChipText, approvalForm.bookingDurationMinutes === minutes && styles.durationChipTextActive]}>
                                                            {minutes}m
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                            <View style={styles.tablePickerWrap}>
                                                {tables.filter((table) => table.isActive !== false).map((table) => (
                                                    <TouchableOpacity
                                                        key={table.id}
                                                        style={[styles.tableChip, approvalForm.tableId === table.id && styles.tableChipActive]}
                                                        onPress={() => setApprovalForm((previous) => ({ ...previous, tableId: table.id }))}
                                                    >
                                                        <Text style={[styles.tableChipText, approvalForm.tableId === table.id && styles.tableChipTextActive]}>
                                                            T{table.number} | {table.capacity} seats
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>
                                    ) : null}

                                    <View style={styles.detailSection}>
                                        <Text style={styles.detailTitle}>Customer & Staff</Text>
                                        <Text style={styles.detailLine}>Customer: {selectedOrder.session?.customer?.name || '--'}</Text>
                                        <Text style={styles.detailLine}>Customer Email: {selectedOrder.session?.customer?.email || '--'}</Text>
                                        <Text style={styles.detailLine}>Customer Phone: {selectedOrder.session?.customer?.phoneNumber || '--'}</Text>
                                        <Text style={styles.detailLine}>Approved By: {selectedOrder.waiter?.name || '--'}</Text>
                                        <Text style={styles.detailLine}>Chef: {selectedOrder.chef?.name || '--'}</Text>
                                        {['PREORDER', 'TAKEAWAY'].includes(getOrderTypeKey(selectedOrder)) && selectedOrder.session?.customer?.phoneNumber ? (
                                            <TouchableOpacity style={styles.callBtn} onPress={() => callCustomer(selectedOrder.session?.customer?.phoneNumber)}>
                                                <Text style={styles.callBtnText}>Call Customer</Text>
                                            </TouchableOpacity>
                                        ) : null}
                                        {canApproveOrder(selectedOrder) ? (
                                            <View style={styles.modalApprovalRow}>
                                                <TouchableOpacity
                                                    style={styles.approveBtn}
                                                    onPress={() => handleApproval(selectedOrder.id, true)}
                                                    disabled={approvalUpdatingId === selectedOrder.id}
                                                >
                                                    <Text style={styles.approveBtnText}>
                                                        {approvalUpdatingId === selectedOrder.id ? 'Updating...' : 'Approve'}
                                                    </Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={styles.rejectBtn}
                                                    onPress={() => handleApproval(selectedOrder.id, false)}
                                                    disabled={approvalUpdatingId === selectedOrder.id}
                                                >
                                                    <Text style={styles.rejectBtnText}>Reject</Text>
                                                </TouchableOpacity>
                                            </View>
                                        ) : null}
                                    </View>

                                    <View style={styles.detailSection}>
                                        <Text style={styles.detailTitle}>Payment</Text>
                                        <Text style={styles.detailLine}>Payment Status: {selectedOrder.payment?.status || '--'}</Text>
                                        <Text style={styles.detailLine}>Stage: {selectedOrder.payment?.paymentStage || '--'}</Text>
                                        <Text style={styles.detailLine}>Provider: {selectedOrder.payment?.provider || '--'}</Text>
                                        <Text style={styles.detailLine}>Amount: Rs. {Number(selectedOrder.payment?.amount || 0).toFixed(2)}</Text>
                                        <Text style={styles.detailLine}>Transaction ID: {selectedOrder.payment?.transactionId || '--'}</Text>
                                        <Text style={styles.detailLine}>Provider Order ID: {selectedOrder.payment?.providerOrderId || '--'}</Text>
                                        <Text style={styles.detailLine}>Provider Payment ID: {selectedOrder.payment?.providerPaymentId || '--'}</Text>
                                        <Text style={styles.detailLine}>Captured At: {formatDateTime(selectedOrder.payment?.capturedAt)}</Text>
                                    </View>
                                </>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

function getOrderTypeKey(order: any): OrderTab {
    if (order?.orderType === 'PRE_ORDER' || order?.isPreorder) return 'PREORDER';
    if (order?.orderType === 'TAKEAWAY') return 'TAKEAWAY';
    return 'QR_ORDER';
}

function typeLabel(type: OrderTab): string {
    if (type === 'PREORDER') return 'Preorder';
    if (type === 'TAKEAWAY') return 'Takeaway';
    return 'QR Order';
}

function typeColor(type: OrderTab): string {
    if (type === 'PREORDER') return '#9333EA';
    if (type === 'TAKEAWAY') return '#EA580C';
    return '#2563EB';
}

function statusColor(status?: string): string {
    switch (status) {
        case 'PENDING_APPROVAL': return '#F59E0B';
        case 'RECEIVED': return '#3B82F6';
        case 'PREPARING': return '#F97316';
        case 'READY': return '#10B981';
        case 'DELIVERED': return '#0EA5E9';
        case 'COMPLETED': return '#15803D';
        case 'REJECTED': return '#DC2626';
        default: return '#64748B';
    }
}

function shortCode(id?: string): string {
    return id ? `#${id.split('-')[0].toUpperCase()}` : '#--';
}

function formatDateTime(value?: string | Date | null): string {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString();
}

function resolveItems(order: any): any[] {
    if (Array.isArray(order?.parsedItems)) return order.parsedItems;
    if (!order?.items) return [];
    try {
        const parsed = JSON.parse(order.items);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function canApproveOrder(order: any) {
    return order?.status === 'PENDING_APPROVAL';
}

function toIsoInputValue(value?: string | Date | null) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString();
}

function normalizeIsoInput(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#FFFFFF' },
    loadingScreen: { flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 14, color: '#64748B', fontSize: 15, fontWeight: '600' },
    scroll: { paddingVertical: 28, backgroundColor: '#FFFFFF' },
    page: { paddingHorizontal: 20 },
    header: { paddingTop: 12, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 20 },
    badge: { alignSelf: 'flex-start', backgroundColor: '#FFF1EB', borderWidth: 1, borderColor: '#FFD7C8', color: '#C2410C', fontSize: 12, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
    title: { color: '#0F172A', fontSize: 34, fontWeight: '900', marginBottom: 8, maxWidth: 780 },
    subtitle: { color: '#475569', fontSize: 15, lineHeight: 24, maxWidth: 860, fontWeight: '500', marginBottom: 14 },
    refreshBtn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#FFFFFF' },
    refreshBtnText: { color: '#0F172A', fontWeight: '700', fontSize: 13 },
    tabRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 18 },
    tabButton: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 14, paddingVertical: 12, marginRight: 10, marginBottom: 10, backgroundColor: '#FFFFFF' },
    tabButtonActive: { borderColor: '#0F172A', backgroundColor: '#FFF7F3' },
    tabText: { color: '#475569', fontSize: 13, fontWeight: '700' },
    tabTextActive: { color: '#0F172A' },
    tabCount: { marginLeft: 8, color: '#64748B', fontSize: 12, fontWeight: '800' },
    tabCountActive: { color: '#0F172A' },
    section: {},
    emptyCard: { borderWidth: 1, borderColor: '#D7DEE7', padding: 24, backgroundColor: '#FFFFFF' },
    emptyTitle: { color: '#0F172A', fontSize: 18, fontWeight: '800', marginBottom: 8 },
    emptyText: { color: '#64748B', fontSize: 14, lineHeight: 22 },
    orderCard: { borderWidth: 1, borderColor: '#D7DEE7', padding: 16, backgroundColor: '#FFFFFF', marginBottom: 12 },
    orderActionRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
    orderHeader: { flexDirection: 'column', marginBottom: 8 },
    orderHeaderWide: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    orderHeaderMain: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    typePill: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, marginRight: 10 },
    typePillText: { fontSize: 11, fontWeight: '800' },
    orderCode: { color: '#0F172A', fontSize: 15, fontWeight: '800' },
    statusPill: { alignSelf: 'flex-start', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
    statusText: { fontSize: 11, fontWeight: '800' },
    orderMeta: { color: '#64748B', fontSize: 13, fontWeight: '600', lineHeight: 20 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(2,6,23,0.65)', justifyContent: 'center', alignItems: 'center', padding: 14 },
    modalCard: { width: '100%', maxWidth: 920, maxHeight: '92%', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1' },
    modalContent: { padding: 20, paddingBottom: 28 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    modalTitle: { color: '#0F172A', fontSize: 26, fontWeight: '900' },
    modalSubtitle: { color: '#475569', fontSize: 13, fontWeight: '700', marginTop: 4 },
    closeBtn: { borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 12, paddingVertical: 10 },
    closeBtnText: { color: '#0F172A', fontSize: 12, fontWeight: '800' },
    detailSection: { borderWidth: 1, borderColor: '#E2E8F0', padding: 14, marginBottom: 12, backgroundColor: '#FFFFFF' },
    detailTitle: { color: '#0F172A', fontSize: 14, fontWeight: '900', textTransform: 'uppercase', marginBottom: 10 },
    detailLine: { color: '#334155', fontSize: 13, lineHeight: 21, fontWeight: '600', marginBottom: 4 },
    detailLineStrong: { color: '#0F172A', fontSize: 14, lineHeight: 22, fontWeight: '900', marginTop: 4 },
    slotInput: { borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', color: '#0F172A', paddingHorizontal: 12, paddingVertical: 10, marginTop: 8, marginBottom: 10 },
    durationRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
    durationChip: { borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, marginBottom: 8 },
    durationChipActive: { borderColor: '#0F172A', backgroundColor: '#0F172A' },
    durationChipText: { color: '#334155', fontSize: 12, fontWeight: '800' },
    durationChipTextActive: { color: '#FFFFFF' },
    tablePickerWrap: { flexDirection: 'row', flexWrap: 'wrap' },
    tableChip: { borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, marginBottom: 8 },
    tableChipActive: { borderColor: '#0F172A', backgroundColor: '#EFF6FF' },
    tableChipText: { color: '#334155', fontSize: 12, fontWeight: '700' },
    tableChipTextActive: { color: '#0F172A' },
    modalApprovalRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
    callBtn: { alignSelf: 'flex-start', marginTop: 10, borderWidth: 1, borderColor: '#BBF7D0', backgroundColor: '#ECFDF5', paddingHorizontal: 12, paddingVertical: 10 },
    callBtnText: { color: '#166534', fontSize: 12, fontWeight: '800' },
    callBtnInline: { borderWidth: 1, borderColor: '#93C5FD', backgroundColor: '#DBEAFE', paddingHorizontal: 12, paddingVertical: 10, marginRight: 8, marginBottom: 8 },
    callBtnInlineText: { color: '#1D4ED8', fontSize: 12, fontWeight: '800' },
    reviewSlotBtn: { borderWidth: 1, borderColor: '#C7D2FE', backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 10, marginRight: 8, marginBottom: 8 },
    reviewSlotBtnText: { color: '#3730A3', fontSize: 12, fontWeight: '800' },
    approveBtn: { borderWidth: 1, borderColor: '#86EFAC', backgroundColor: '#DCFCE7', paddingHorizontal: 12, paddingVertical: 10, marginRight: 8, marginBottom: 8 },
    approveBtnText: { color: '#166534', fontSize: 12, fontWeight: '800' },
    rejectBtn: { borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEE2E2', paddingHorizontal: 12, paddingVertical: 10, marginRight: 8, marginBottom: 8 },
    rejectBtnText: { color: '#991B1B', fontSize: 12, fontWeight: '800' },
});
