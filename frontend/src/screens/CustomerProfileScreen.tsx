import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Image, ActivityIndicator, Alert, Platform } from 'react-native';
import { User, LogOut, ChevronRight, Hash, MapPin, Clock, FileText, Calendar, RefreshCcw } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import client from '../api/client';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function CustomerProfileScreen({ navigation }: any) {
    const [user, setUser] = useState<any>(null);
    const [bookings, setBookings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'Active' | 'History'>('Active');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            // Get user info from local storage
            const userData = await AsyncStorage.getItem('user');
            if (userData) setUser(JSON.parse(userData));

            // Fetch bookings from backend
            const res = await client.get('/customer/bookings');
            setBookings(res.data);
        } catch (error: any) {
            console.error('Profile Load Error:', error);
            if (error.response?.status === 401) {
                handleLogout();
            } else {
                Alert.alert('Error', 'Failed to load your history.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await AsyncStorage.multiRemove(['userToken', 'user', 'activeSessionId']);
        navigation.replace('Landing');
    };

    const handleCancel = async (sessionId: string) => {
        try {
            await client.post(`/customer/bookings/${sessionId}/cancel`);
            Alert.alert('Success', 'Booking cancelled successfully');
            loadData();
        } catch (error: any) {
            Alert.alert('Error', error.response?.data?.error || 'Failed to cancel booking');
        }
    };

    const activeBookings = bookings.filter((b) => isActiveBooking(b));
    const historyBookings = bookings.filter((b) => !isActiveBooking(b));

    const renderBookingCard = (booking: any) => {
        const approvalCallout = getApprovalCallout(booking);

        return (
        <TouchableOpacity 
            key={booking.id} 
            style={styles.bookingCard}
            activeOpacity={0.8}
            onPress={() => {
                // For history, show receipt or details
                if (booking.reservationStatus === 'COMPLETED') {
                    navigation.navigate('CustomerMenu', { 
                        cafeId: booking.cafeId, 
                        sessionId: booking.id, 
                        isHistoryMode: true 
                    });
                }
            }}
        >
            <View style={styles.cardHeader}>
                <View style={styles.cafeInfo}>
                    <Text style={styles.cafeName}>{booking.cafe.name}</Text>
                    <View style={styles.metaRow}>
                        <MapPin color="#94A3B8" size={12} />
                        <Text style={styles.metaText}>{booking.cafe.address || 'Local Eatery'}</Text>
                    </View>
                </View>
                <View style={[styles.statusBadge, getStatusBadgeStyle(booking.reservationStatus)]}>
                    <Text style={[styles.statusText, getStatusTextStyle(booking.reservationStatus)]}>
                        {formatReservationStatus(booking.reservationStatus)}
                    </Text>
                </View>
            </View>

            <View style={styles.cardBody}>
                <View style={styles.row}>
                    <View style={styles.dataCol}>
                        <Text style={styles.dataLabel}>Date</Text>
                        <Text style={styles.dataValue}>{new Date(booking.scheduledAt || booking.createdAt).toLocaleDateString()}</Text>
                    </View>
                    <View style={styles.dataCol}>
                        <Text style={styles.dataLabel}>Table</Text>
                        <Text style={styles.dataValue}>T-{booking.table?.number || '--'}</Text>
                    </View>
                </View>

                {booking.reservationStatus !== 'COMPLETED' && (
                    <View style={styles.codeRow}>
                        <Hash color="#38BDF8" size={16} />
                        <Text style={styles.codeLabel}>{booking.reservationStatus === 'QUEUED' ? 'BOOKING CODE:' : 'SESSION CODE:'}</Text>
                        <Text style={styles.codeValue}>{booking.joinCode}</Text>
                    </View>
                )}

                {booking.reservationStatus === 'QUEUED' && (
                    <>
                        <View style={styles.orderSummary}>
                            <Clock color="#F59E0B" size={14} />
                            <Text style={styles.summaryText}>
                                Queued for {new Date(booking.scheduledAt || booking.createdAt).toLocaleString()}. Scan the QR later and enter this code.
                            </Text>
                        </View>
                        <TouchableOpacity 
                            style={{ marginTop: 15, backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}
                            onPress={() => {
                                Alert.alert('Cancel Booking', 'Are you sure you want to cancel this booking?', [
                                    { text: 'No', style: 'cancel' },
                                    { text: 'Yes, Cancel', style: 'destructive', onPress: () => handleCancel(booking.id) }
                                ]);
                            }}
                        >
                            <Text style={{ color: '#F87171', fontWeight: 'bold' }}>Cancel Booking</Text>
                        </TouchableOpacity>
                    </>
                )}

                {booking.reservationStatus === 'READY_FOR_CHECKIN' && (
                    <View style={styles.orderSummary}>
                        <Calendar color="#38BDF8" size={14} />
                        <Text style={styles.summaryText}>
                            Your reserved table is now ready. Scan the QR and enter this code to check in.
                        </Text>
                    </View>
                )}

                {approvalCallout ? (
                    <View style={[styles.noticeBox, { backgroundColor: approvalCallout.backgroundColor, borderColor: approvalCallout.borderColor }]}>
                        <Text style={[styles.noticeTitle, { color: approvalCallout.titleColor }]}>{approvalCallout.title}</Text>
                        <Text style={[styles.noticeText, { color: approvalCallout.textColor }]}>{approvalCallout.message}</Text>
                    </View>
                ) : null}

                {booking.orders.length > 0 && booking.reservationStatus === 'COMPLETED' && (
                    <View style={styles.orderSummary}>
                        <FileText color="#94A3B8" size={14} />
                        <Text style={styles.summaryText}>
                            {booking.orders.length} Order{booking.orders.length > 1 ? 's' : ''} • ₹{booking.orders.reduce((s: number, o: any) => s + o.totalAmount, 0).toFixed(2)}
                        </Text>
                        <ChevronRight color="#38BDF8" size={16} style={{ marginLeft: 'auto' }} />
                    </View>
                )}
            </View>
        </TouchableOpacity>
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#38BDF8" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <ResponsiveContainer maxWidth={800}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.profileRow}>
                            <View style={styles.avatarContainer}>
                                <User color="#38BDF8" size={32} />
                            </View>
                            <View style={styles.userInfo}>
                                <Text style={styles.userName}>{user?.name || 'Customer'}</Text>
                                <Text style={styles.userEmail}>{user?.email}</Text>
                            </View>
                            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                                <LogOut color="#F87171" size={20} />
                            </TouchableOpacity>
                        </View>
                        
                        <TouchableOpacity style={styles.refreshBtn} onPress={loadData}>
                            <RefreshCcw color="#64748B" size={14} />
                            <Text style={styles.refreshText}>Sync History</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Tabs */}
                    <View style={styles.tabs}>
                        <TouchableOpacity 
                            style={[styles.tabBtn, activeTab === 'Active' && styles.tabBtnActive]} 
                            onPress={() => setActiveTab('Active')}
                        >
                            <Text style={[styles.tabBtnText, activeTab === 'Active' && styles.tabBtnTextActive]}>Active Bookings</Text>
                            {activeBookings.length > 0 && (
                                <View style={styles.countBadge}><Text style={styles.countText}>{activeBookings.length}</Text></View>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.tabBtn, activeTab === 'History' && styles.tabBtnActive]} 
                            onPress={() => setActiveTab('History')}
                        >
                            <Text style={[styles.tabBtnText, activeTab === 'History' && styles.tabBtnTextActive]}>Past Dining</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Content */}
                    <View style={styles.list}>
                        {activeTab === 'Active' ? (
                            activeBookings.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Clock color="#1E293B" size={60} strokeWidth={1} style={{ marginBottom: 15 }} />
                                    <Text style={styles.emptyTitle}>Stay Hungry!</Text>
                                    <Text style={styles.emptyText}>You don't have any active reservations. Head to Discover to find your next meal.</Text>
                                    <TouchableOpacity style={styles.ctaBtn} onPress={() => navigation.navigate('DiscoveryPortal')}>
                                        <Text style={styles.ctaBtnText}>Discover Spots</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                activeBookings.map(renderBookingCard)
                            )
                        ) : (
                            historyBookings.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Calendar color="#1E293B" size={60} strokeWidth={1} style={{ marginBottom: 15 }} />
                                    <Text style={styles.emptyTitle}>History is Empty</Text>
                                    <Text style={styles.emptyText}>Once you complete a dining session, your detailed bills will appear here.</Text>
                                </View>
                            ) : (
                                historyBookings.map(renderBookingCard)
                            )
                        )}
                    </View>
                </ResponsiveContainer>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' },
    scrollContent: { paddingBottom: 40 },

    header: { padding: 24, paddingTop: 60, marginBottom: 20 },
    profileRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    avatarContainer: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(56, 189, 248, 0.1)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#38BDF8' },
    userInfo: { flex: 1 },
    userName: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
    userEmail: { fontSize: 14, color: '#64748B', fontWeight: '500' },
    logoutBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(239, 68, 68, 0.1)', justifyContent: 'center', alignItems: 'center' },
    
    refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 20, backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
    refreshText: { color: '#64748B', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },

    tabs: { flexDirection: 'row', paddingHorizontal: 24, gap: 16, marginBottom: 24 },
    tabBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: 'rgba(30, 41, 59, 0.5)', justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 },
    tabBtnActive: { backgroundColor: '#38BDF8' },
    tabBtnText: { color: '#94A3B8', fontSize: 14, fontWeight: '700' },
    tabBtnTextActive: { color: '#0F172A' },
    countBadge: { backgroundColor: '#F87171', minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, justifyContent: 'center', alignItems: 'center' },
    countText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },

    list: { paddingHorizontal: 24, gap: 20 },
    bookingCard: { backgroundColor: '#1E293B', borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, backgroundColor: 'rgba(30, 41, 59, 0.5)' },
    cafeInfo: { flex: 1 },
    cafeName: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', marginBottom: 6 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { color: '#64748B', fontSize: 12, fontWeight: '600' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText: { fontSize: 10, fontWeight: '900' },

    cardBody: { padding: 20 },
    row: { flexDirection: 'row', gap: 40, marginBottom: 15 },
    dataCol: { },
    dataLabel: { fontSize: 10, color: '#64748B', fontWeight: '800', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 1 },
    dataValue: { fontSize: 15, color: '#F8FAFC', fontWeight: '700' },

    codeRow: { backgroundColor: '#0F172A', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(56, 189, 248, 0.2)' },
    codeLabel: { fontSize: 11, color: '#38BDF8', fontWeight: '900', letterSpacing: 1 },
    codeValue: { fontSize: 22, color: '#FFFFFF', fontWeight: '900', letterSpacing: 4 },

    orderSummary: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 15, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
    summaryText: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
    noticeBox: { marginTop: 14, borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
    noticeTitle: { fontSize: 12, fontWeight: '800' },
    noticeText: { fontSize: 12, lineHeight: 18, fontWeight: '600' },

    emptyState: { alignItems: 'center', marginTop: 60, paddingHorizontal: 30 },
    emptyTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginBottom: 8 },
    emptyText: { color: '#64748B', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 25 },
    ctaBtn: { backgroundColor: '#38BDF8', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
    ctaBtnText: { color: '#0F172A', fontWeight: '800' }
});

function formatReservationStatus(status: string) {
    switch (status) {
        case 'QUEUED': return 'QUEUED';
        case 'READY_FOR_CHECKIN': return 'READY';
        case 'CHECKED_IN': return 'CHECKED IN';
        case 'ACTIVE': return 'ACTIVE';
        case 'MISSED': return 'MISSED';
        default: return 'COMPLETED';
    }
}

function isActiveBooking(booking: any) {
    if (['MISSED', 'COMPLETED'].includes(booking?.reservationStatus)) {
        return false;
    }

    if (['QUEUED', 'READY_FOR_CHECKIN', 'CHECKED_IN', 'ACTIVE'].includes(booking?.reservationStatus)) {
        return true;
    }

    const latestStatus = booking?.latestOrder?.status;
    if (['PENDING_APPROVAL', 'RECEIVED', 'PREPARING', 'READY', 'AWAITING_PICKUP'].includes(latestStatus)) {
        return true;
    }

    return ['AWAITING_APPROVAL', 'APPROVED_PAYMENT_PENDING', 'APPROVED_PAYMENT_COMPLETED'].includes(booking?.approvalDisplayStatus);
}

function formatDateTime(value?: string | Date | null) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString();
}

function getApprovalCallout(booking: any) {
    const deadlineText = booking?.paymentDeadlineAt
        ? ` Complete payment before ${formatDateTime(booking.paymentDeadlineAt)}.`
        : '';

    switch (booking?.approvalDisplayStatus) {
        case 'AWAITING_APPROVAL':
            return {
                title: 'Awaiting Approval',
                message: booking?.paymentNotice || 'Owner or manager approval is still pending.',
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                borderColor: 'rgba(245, 158, 11, 0.35)',
                titleColor: '#F59E0B',
                textColor: '#FCD34D',
            };
        case 'APPROVED_PAYMENT_PENDING':
            return {
                title: 'Approved, Deposit Pending',
                message: `${booking?.paymentNotice || 'Your booking is approved.'}${deadlineText}`,
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                borderColor: 'rgba(56, 189, 248, 0.35)',
                titleColor: '#38BDF8',
                textColor: '#7DD3FC',
            };
        case 'APPROVED_PAYMENT_COMPLETED':
            return {
                title: 'Deposit Paid',
                message: booking?.paymentNotice || 'Deposit payment has been received for this booking.',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                borderColor: 'rgba(16, 185, 129, 0.35)',
                titleColor: '#10B981',
                textColor: '#6EE7B7',
            };
        case 'REJECTED':
            return {
                title: 'Not Approved',
                message: booking?.paymentNotice || 'This booking request was not approved by the cafe.',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                borderColor: 'rgba(239, 68, 68, 0.35)',
                titleColor: '#EF4444',
                textColor: '#FCA5A5',
            };
        default:
            return null;
    }
}

function getStatusBadgeStyle(status: string) {
    switch (status) {
        case 'QUEUED':
            return { backgroundColor: 'rgba(245, 158, 11, 0.12)' };
        case 'READY_FOR_CHECKIN':
            return { backgroundColor: 'rgba(56, 189, 248, 0.14)' };
        case 'CHECKED_IN':
        case 'ACTIVE':
            return { backgroundColor: 'rgba(16, 185, 129, 0.1)' };
        case 'MISSED':
            return { backgroundColor: 'rgba(239, 68, 68, 0.12)' };
        default:
            return { backgroundColor: 'rgba(148, 163, 184, 0.1)' };
    }
}

function getStatusTextStyle(status: string) {
    switch (status) {
        case 'QUEUED':
            return { color: '#F59E0B' };
        case 'READY_FOR_CHECKIN':
            return { color: '#38BDF8' };
        case 'CHECKED_IN':
        case 'ACTIVE':
            return { color: '#10B981' };
        case 'MISSED':
            return { color: '#EF4444' };
        default:
            return { color: '#94A3B8' };
    }
}
