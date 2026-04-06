import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import { User, LogOut, RefreshCcw, Hash, MapPin, FileText, Calendar, Clock } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import client from '../api/client';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function CustomerProfileWebScreen({ navigation }: any) {
    const [user, setUser] = useState<any>(null);
    const [bookings, setBookings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'Active' | 'History'>('Active');
    const { width } = useWindowDimensions();
    const isWide = width >= 980;

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const userData = await AsyncStorage.getItem('user');
            if (userData) setUser(JSON.parse(userData));

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

    const activeBookings = bookings.filter((b) => b.isActive && b.isPrebooked);
    const historyBookings = bookings.filter((b) => !b.isActive);

    const renderBookingCard = (booking: any) => (
        <TouchableOpacity
            key={booking.id}
            style={styles.bookingCard}
            activeOpacity={0.8}
            onPress={() => {
                if (!booking.isActive) {
                    navigation.navigate('CustomerMenu', {
                        cafeId: booking.cafeId,
                        sessionId: booking.id,
                        isHistoryMode: true,
                    });
                }
            }}
        >
            <View style={styles.bookingHeader}>
                <View style={styles.bookingHeaderCopy}>
                    <Text style={styles.cafeName}>{booking.cafe.name}</Text>
                    <View style={styles.metaRow}>
                        <MapPin color="#64748B" size={14} />
                        <Text style={styles.metaText}>{booking.cafe.address || 'Local area'}</Text>
                    </View>
                </View>
                <View style={[styles.statusTag, { backgroundColor: booking.isActive ? '#F0FDF4' : '#F8FAFC', borderColor: booking.isActive ? '#BBF7D0' : '#CBD5E1' }]}>
                    <Text style={[styles.statusText, { color: booking.isActive ? '#15803D' : '#64748B' }]}>
                        {booking.isActive ? 'ACTIVE' : 'COMPLETED'}
                    </Text>
                </View>
            </View>

            <View style={[styles.detailGrid, isWide && styles.detailGridWide]}>
                <View style={[styles.detailCard, isWide && styles.detailCardWide]}>
                    <Text style={styles.detailLabel}>Date</Text>
                    <Text style={styles.detailValue}>{new Date(booking.createdAt).toLocaleDateString()}</Text>
                </View>
                <View style={[styles.detailCard, isWide && styles.detailCardWide]}>
                    <Text style={styles.detailLabel}>Table</Text>
                    <Text style={styles.detailValue}>T-{booking.table.number}</Text>
                </View>
            </View>

            {booking.isActive && (
                <View style={styles.codeBox}>
                    <Hash color="#0F172A" size={16} />
                    <Text style={styles.codeLabel}>Session code</Text>
                    <Text style={styles.codeValue}>{booking.joinCode}</Text>
                </View>
            )}

            {booking.orders.length > 0 && !booking.isActive && (
                <View style={styles.summaryBox}>
                    <FileText color="#0F172A" size={16} />
                    <Text style={styles.summaryText}>
                        {booking.orders.length} order{booking.orders.length > 1 ? 's' : ''} · Rs. {booking.orders.reduce((sum: number, order: any) => sum + order.totalAmount, 0).toFixed(2)}
                    </Text>
                </View>
            )}
        </TouchableOpacity>
    );

    if (loading) {
        return (
            <View style={styles.loadingScreen}>
                <ActivityIndicator size="large" color="#0F172A" />
                <Text style={styles.loadingText}>Loading your account...</Text>
            </View>
        );
    }

    return (
        <View style={styles.screen}>
            <StatusBar style="dark" />
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <ResponsiveContainer maxWidth={1120}>
                    <View style={styles.page}>
                        <View style={styles.header}>
                            <View style={styles.headerMain}>
                                <View style={styles.avatar}>
                                    <User color="#0F172A" size={28} />
                                </View>
                                <View style={styles.userBlock}>
                                    <Text style={styles.badge}>CLIENT ACCOUNT</Text>
                                    <Text style={styles.title}>{user?.name || 'Customer'}</Text>
                                    <Text style={styles.subtitle}>{user?.email || 'Signed-in account'}</Text>
                                </View>
                            </View>

                            <View style={[styles.headerActions, isWide && styles.headerActionsWide]}>
                                <TouchableOpacity style={styles.secondaryButton} onPress={loadData}>
                                    <RefreshCcw color="#0F172A" size={16} />
                                    <Text style={styles.secondaryButtonText}>Refresh</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.dangerButton} onPress={handleLogout}>
                                    <LogOut color="#B91C1C" size={16} />
                                    <Text style={styles.dangerButtonText}>Logout</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.tabRow}>
                            <TouchableOpacity style={[styles.tabButton, activeTab === 'Active' && styles.tabButtonActive]} onPress={() => setActiveTab('Active')}>
                                <Text style={[styles.tabButtonText, activeTab === 'Active' && styles.tabButtonTextActive]}>Active bookings</Text>
                                {activeBookings.length > 0 && <Text style={styles.countTag}>{activeBookings.length}</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.tabButton, activeTab === 'History' && styles.tabButtonActive]} onPress={() => setActiveTab('History')}>
                                <Text style={[styles.tabButtonText, activeTab === 'History' && styles.tabButtonTextActive]}>Past dining</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.section}>
                            {activeTab === 'Active' ? (
                                activeBookings.length === 0 ? (
                                    <View style={styles.emptyState}>
                                        <Clock color="#0F172A" size={44} />
                                        <Text style={styles.emptyTitle}>No active bookings right now</Text>
                                        <Text style={styles.emptyText}>
                                            When you reserve a table, your active session details and booking code will appear here.
                                        </Text>
                                        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('DiscoveryPortal')}>
                                            <Text style={styles.primaryButtonText}>Discover cafes</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    activeBookings.map(renderBookingCard)
                                )
                            ) : historyBookings.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Calendar color="#0F172A" size={44} />
                                    <Text style={styles.emptyTitle}>Your history is still empty</Text>
                                    <Text style={styles.emptyText}>
                                        Completed dining sessions and order summaries will appear here once you start using the platform.
                                    </Text>
                                </View>
                            ) : (
                                historyBookings.map(renderBookingCard)
                            )}
                        </View>
                    </View>
                </ResponsiveContainer>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#FFFFFF' },
    loadingScreen: { flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 14, color: '#64748B', fontSize: 15, fontWeight: '600' },
    scroll: { paddingVertical: 28, backgroundColor: '#FFFFFF' },
    page: { paddingHorizontal: 20 },
    header: { paddingTop: 12, paddingBottom: 28, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 24 },
    headerMain: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
    avatar: { width: 72, height: 72, borderWidth: 1, borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center', marginRight: 16, backgroundColor: '#F8FAFC' },
    userBlock: { flex: 1 },
    badge: { alignSelf: 'flex-start', backgroundColor: '#FFF1EB', borderWidth: 1, borderColor: '#FFD7C8', color: '#C2410C', fontSize: 12, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
    title: { color: '#0F172A', fontSize: 34, fontWeight: '900', marginBottom: 4 },
    subtitle: { color: '#475569', fontSize: 15, fontWeight: '500' },
    headerActions: { flexDirection: 'column' },
    headerActionsWide: { flexDirection: 'row' },
    secondaryButton: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFFFFF', marginBottom: 12, marginRight: 12 },
    secondaryButtonText: { color: '#0F172A', fontSize: 14, fontWeight: '700', marginLeft: 8 },
    dangerButton: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#FECACA', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF1F2' },
    dangerButtonText: { color: '#B91C1C', fontSize: 14, fontWeight: '800', marginLeft: 8 },
    tabRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 24 },
    tabButton: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 16, paddingVertical: 14, marginRight: 12, marginBottom: 12, backgroundColor: '#FFFFFF' },
    tabButtonActive: { borderColor: '#0F172A', backgroundColor: '#FFF7F3' },
    tabButtonText: { color: '#475569', fontSize: 14, fontWeight: '700' },
    tabButtonTextActive: { color: '#0F172A' },
    countTag: { marginLeft: 8, color: '#0F172A', fontSize: 12, fontWeight: '800' },
    section: {},
    bookingCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', padding: 20, marginBottom: 18 },
    bookingHeader: { marginBottom: 16 },
    bookingHeaderCopy: { marginBottom: 10 },
    cafeName: { color: '#0F172A', fontSize: 22, fontWeight: '800', marginBottom: 6 },
    metaRow: { flexDirection: 'row', alignItems: 'center' },
    metaText: { color: '#64748B', fontSize: 14, marginLeft: 6, fontWeight: '500' },
    statusTag: { alignSelf: 'flex-start', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
    statusText: { fontSize: 12, fontWeight: '800' },
    detailGrid: { flexDirection: 'column', marginBottom: 16 },
    detailGridWide: { flexDirection: 'row', justifyContent: 'space-between' },
    detailCard: { borderWidth: 1, borderColor: '#CBD5E1', padding: 14, marginBottom: 10, backgroundColor: '#FFFFFF' },
    detailCardWide: { width: '48.5%' },
    detailLabel: { color: '#64748B', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
    detailValue: { color: '#0F172A', fontSize: 16, fontWeight: '700' },
    codeBox: { borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', padding: 16, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
    codeLabel: { color: '#475569', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginLeft: 8, marginRight: 10 },
    codeValue: { color: '#0F172A', fontSize: 20, fontWeight: '900', letterSpacing: 2 },
    summaryBox: { borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', padding: 16, flexDirection: 'row', alignItems: 'center' },
    summaryText: { color: '#0F172A', fontSize: 14, fontWeight: '700', marginLeft: 10, flex: 1, lineHeight: 22 },
    emptyState: { borderWidth: 1, borderColor: '#D7DEE7', padding: 28, alignItems: 'center', backgroundColor: '#FFFFFF' },
    emptyTitle: { color: '#0F172A', fontSize: 22, fontWeight: '800', marginTop: 16, marginBottom: 10, textAlign: 'center' },
    emptyText: { color: '#64748B', fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 22, maxWidth: 460 },
    primaryButton: { borderWidth: 1, borderColor: '#0F172A', backgroundColor: '#0F172A', paddingHorizontal: 20, paddingVertical: 16, alignItems: 'center' },
    primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
