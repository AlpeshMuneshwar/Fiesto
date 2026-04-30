import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, useWindowDimensions, Modal, TextInput, Linking } from 'react-native';
import { User, LogOut, RefreshCcw, Hash, MapPin, FileText, Calendar, Clock, Timer } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import client from '../api/client';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function CustomerProfileWebScreen({ navigation, route }: any) {
    const [user, setUser] = useState<any>(null);
    const [bookings, setBookings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'Active' | 'History'>(route?.params?.initialTab === 'History' ? 'History' : 'Active');
    const [editVisible, setEditVisible] = useState(false);
    const [editingBooking, setEditingBooking] = useState<any | null>(null);
    const [editingMenuItems, setEditingMenuItems] = useState<any[]>([]);
    const [editingItems, setEditingItems] = useState<Record<string, { id: string; name: string; price: number; quantity: number }>>({});
    const [editingInstructions, setEditingInstructions] = useState('');
    const [loadingEditor, setLoadingEditor] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [nowMs, setNowMs] = useState(Date.now());
    const { width } = useWindowDimensions();
    const isWide = width >= 980;

    useEffect(() => {
        if (route?.params?.initialTab === 'History') {
            setActiveTab('History');
        } else if (route?.params?.initialTab === 'Active') {
            setActiveTab('Active');
        }
    }, [route?.params?.initialTab]);

    useEffect(() => {
        const interval = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const userData = await AsyncStorage.getItem('user');
            if (userData) setUser(JSON.parse(userData));

            const res = await client.get('/customer/bookings');
            setBookings(res.data || []);
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
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadData();
            const interval = setInterval(() => {
                loadData();
            }, 15000);

            return () => clearInterval(interval);
        }, [loadData])
    );

    const handleLogout = async () => {
        await AsyncStorage.multiRemove(['userToken', 'user', 'activeSessionId', 'discoveryTrackers', 'customerName', 'customerEmail', 'customerPhone', 'discoveryOwnerId']);
        navigation.replace('Landing');
    };

    const handleCancel = async (sessionId: string) => {
        if (window.confirm('Are you sure you want to cancel this booking?')) {
            try {
                await client.post(`/customer/bookings/${sessionId}/cancel`);
                Alert.alert('Success', 'Booking cancelled successfully');
                loadData();
            } catch (error: any) {
                Alert.alert('Error', error.response?.data?.error || 'Failed to cancel booking');
            }
        }
    };

    const callPhone = async (phoneNumber?: string | null) => {
        if (!phoneNumber) {
            Alert.alert('Phone unavailable', 'No phone number is available for this booking.');
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

    const openEditOrder = async (booking: any) => {
        const targetOrder = booking.latestOrder;
        if (!targetOrder?.id || !booking.cafe?.id) {
            Alert.alert('Edit unavailable', 'This order cannot be edited right now.');
            return;
        }

        setLoadingEditor(true);
        setEditVisible(true);
        setEditingBooking(booking);

        try {
            const res = await client.get(`/menu?cafeId=${booking.cafe.id}`);
            const menu = (res.data || []).filter((item: any) => item.isActive !== false && item.isAvailable !== false);
            const initialItems = Array.isArray(targetOrder.parsedItems) ? targetOrder.parsedItems : [];
            const initialMap = initialItems.reduce((acc: any, item: any) => {
                if (!item?.id) return acc;
                acc[item.id] = {
                    id: item.id,
                    name: item.name,
                    price: Number(item.price || 0),
                    quantity: Number(item.quantity || 0),
                };
                return acc;
            }, {});

            setEditingMenuItems(menu);
            setEditingItems(initialMap);
            setEditingInstructions(targetOrder.specialInstructions || '');
        } catch (error: any) {
            setEditVisible(false);
            setEditingBooking(null);
            Alert.alert('Edit unavailable', error.response?.data?.error || 'Could not load the cafe menu for editing.');
        } finally {
            setLoadingEditor(false);
        }
    };

    const updateEditingQty = (item: any, delta: number) => {
        setEditingItems((prev) => {
            const existing = prev[item.id] || {
                id: item.id,
                name: item.name,
                price: Number(item.price || 0),
                quantity: 0,
            };
            const quantity = existing.quantity + delta;
            if (quantity <= 0) {
                const next = { ...prev };
                delete next[item.id];
                return next;
            }
            return {
                ...prev,
                [item.id]: {
                    ...existing,
                    quantity,
                },
            };
        });
    };

    const savePendingOrder = async () => {
        const orderId = editingBooking?.latestOrder?.id;
        const items = Object.values(editingItems).filter((item: any) => item.quantity > 0);
        if (!orderId) {
            Alert.alert('Edit unavailable', 'No pending order is selected.');
            return;
        }
        if (items.length === 0) {
            Alert.alert('No items selected', 'Keep at least one item in the order.');
            return;
        }

        setSavingEdit(true);
        try {
            await client.put(`/customer/orders/${orderId}`, {
                items: items.map((item: any) => ({ id: item.id, quantity: item.quantity })),
                specialInstructions: editingInstructions.trim() || null,
            });
            setEditVisible(false);
            setEditingBooking(null);
            await loadData();
            Alert.alert('Updated', 'Pending order updated successfully.');
        } catch (error: any) {
            Alert.alert('Update failed', error.response?.data?.error || 'Could not update the pending order.');
        } finally {
            setSavingEdit(false);
        }
    };

    const ensureRazorpayLoaded = async () => {
        if (typeof window === 'undefined') {
            throw new Error('Online deposit payment is only available in the web app right now.');
        }

        if ((window as any).Razorpay) {
            return (window as any).Razorpay;
        }

        await new Promise<void>((resolve, reject) => {
            const existing = document.querySelector('script[data-razorpay-checkout="true"]') as HTMLScriptElement | null;
            if (existing) {
                existing.addEventListener('load', () => resolve(), { once: true });
                existing.addEventListener('error', () => reject(new Error('Could not load Razorpay checkout.')), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.async = true;
            script.dataset.razorpayCheckout = 'true';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Could not load Razorpay checkout.'));
            document.body.appendChild(script);
        });

        if (!(window as any).Razorpay) {
            throw new Error('Razorpay checkout did not initialize correctly.');
        }

        return (window as any).Razorpay;
    };

    const payDeposit = async (booking: any) => {
        const orderId = booking?.latestOrder?.id;
        if (!orderId) {
            Alert.alert('Payment unavailable', 'No approved order is available for payment.');
            return;
        }

        try {
            const configRes = await client.get('/payment/razorpay/config');
            if (!configRes.data?.enabled) {
                Alert.alert('Payment unavailable', 'Razorpay is not configured on the server yet.');
                return;
            }

            const orderRes = await client.post('/payment/razorpay/create-order', { orderId });
            const Razorpay = await ensureRazorpayLoaded();

            await new Promise<void>((resolve, reject) => {
                const checkout = new Razorpay({
                    key: orderRes.data?.keyId,
                    amount: Math.round(Number(orderRes.data?.payableAmount || 0) * 100),
                    currency: orderRes.data?.order?.currency || 'INR',
                    order_id: orderRes.data?.order?.id,
                    name: booking?.cafe?.name || 'Cafe',
                    description: booking?.bookingType === 'TAKEAWAY' ? 'Takeaway deposit' : 'Preorder deposit',
                    prefill: {
                        name: user?.name || undefined,
                        email: user?.email || undefined,
                        contact: user?.phoneNumber || undefined,
                    },
                    handler: async (response: any) => {
                        try {
                            await client.post('/payment/razorpay/verify', response);
                            await loadData();
                            Alert.alert('Payment complete', 'Deposit payment captured successfully.');
                            resolve();
                        } catch (verifyError: any) {
                            reject(new Error(verifyError.response?.data?.error || 'Payment verification failed.'));
                        }
                    },
                    modal: {
                        ondismiss: () => reject(new Error('Payment was cancelled.')),
                    },
                    theme: {
                        color: '#0F172A',
                    },
                });

                checkout.open();
            });
        } catch (error: any) {
            Alert.alert('Payment failed', error?.message || error?.response?.data?.error || 'Could not start the deposit payment.');
        }
    };

    const activeBookings = useMemo(
        () => bookings.filter(isActiveBookingForCustomer),
        [bookings]
    );
    const historyBookings = useMemo(
        () => bookings.filter((b) => !isActiveBookingForCustomer(b)),
        [bookings]
    );

    const renderBookingCard = (booking: any) => {
        const slotStart = booking.slotStartAt || booking.scheduledAt || booking.createdAt;
        const slotWindow = formatSlotWindow(slotStart, booking.slotEndAt);
        const bookingType = formatBookingType(booking.bookingType || booking.orders?.[0]?.orderType);
        const totalAmount = booking.orders?.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0) || 0;
        const latestOrder = booking.latestOrder;
        const canCallCafe = booking.reservationStatus !== 'COMPLETED'
            && ['PRE_ORDER', 'TAKEAWAY'].includes(booking.bookingType)
            && Boolean(booking.cafe?.contactPhone);
        const canEditPending = Boolean(booking.canEditPendingOrder && latestOrder?.id);
        const paymentExpired = isPaymentWindowExpired(booking, nowMs);
        const canPayDeposit = Boolean(booking.canPayDeposit && latestOrder?.id && !paymentExpired);
        const approvalCallout = getApprovalCallout(booking, nowMs);

        return (
            <TouchableOpacity
                key={booking.id}
                style={styles.bookingCard}
                activeOpacity={0.8}
                onPress={() => {
                    if (booking.reservationStatus === 'COMPLETED') {
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
                    <View style={[styles.statusTag, getStatusTagStyle(booking.reservationStatus)]}>
                        <Text style={[styles.statusText, getStatusTextStyle(booking.reservationStatus)]}>
                            {formatReservationStatus(booking.reservationStatus)}
                        </Text>
                    </View>
                </View>

                <View style={styles.typePill}>
                    <Text style={styles.typePillText}>{bookingType}</Text>
                </View>

                <View style={[styles.detailGrid, isWide && styles.detailGridWide]}>
                    <View style={[styles.detailCard, isWide && styles.detailCardWide]}>
                        <Text style={styles.detailLabel}>Slot Window</Text>
                        <Text style={styles.detailValue}>{slotWindow}</Text>
                    </View>
                    <View style={[styles.detailCard, isWide && styles.detailCardWide]}>
                        <Text style={styles.detailLabel}>Table</Text>
                        <Text style={styles.detailValue}>T-{booking.table?.number || '--'}</Text>
                    </View>
                </View>

                <View style={[styles.detailGrid, isWide && styles.detailGridWide]}>
                    <View style={[styles.detailCard, isWide && styles.detailCardWide]}>
                        <Text style={styles.detailLabel}>Duration</Text>
                        <Text style={styles.detailValue}>{booking.slotDurationMinutes ? `${booking.slotDurationMinutes} min` : '--'}</Text>
                    </View>
                    <View style={[styles.detailCard, isWide && styles.detailCardWide]}>
                        <Text style={styles.detailLabel}>Queue Rank</Text>
                        <Text style={styles.detailValue}>{booking.queuePosition > 0 ? `#${booking.queuePosition}` : '--'}</Text>
                    </View>
                </View>

                {booking.orderQueueRank > 0 ? (
                    <View style={styles.summaryBox}>
                        <Timer color="#0F172A" size={16} />
                        <Text style={styles.summaryText}>Kitchen queue rank: #{booking.orderQueueRank}</Text>
                    </View>
                ) : null}

                {latestOrder ? (
                    <View style={styles.summaryBox}>
                        <FileText color="#0F172A" size={16} />
                        <Text style={styles.summaryText}>
                            Latest order: {formatOrderStatus(latestOrder.status)}
                            {latestOrder.payment?.status ? ` | Payment ${latestOrder.payment.status}` : ''}
                        </Text>
                    </View>
                ) : null}

                {approvalCallout ? (
                    <View style={[styles.noticeBox, { backgroundColor: approvalCallout.backgroundColor, borderColor: approvalCallout.borderColor }]}>
                        <Text style={[styles.noticeTitle, { color: approvalCallout.titleColor }]}>{approvalCallout.title}</Text>
                        <Text style={[styles.noticeText, { color: approvalCallout.textColor }]}>{approvalCallout.message}</Text>
                    </View>
                ) : null}

                {booking.reservationStatus !== 'COMPLETED' && booking.joinCode ? (
                    <View style={styles.codeBox}>
                        <Hash color="#0F172A" size={16} />
                        <Text style={styles.codeLabel}>{booking.reservationStatus === 'QUEUED' ? 'Booking code' : 'Session code'}</Text>
                        <Text style={styles.codeValue}>{booking.joinCode}</Text>
                    </View>
                ) : null}

                {(canEditPending || canCallCafe || canPayDeposit) ? (
                    <View style={styles.inlineActionRow}>
                        {canEditPending ? (
                            <TouchableOpacity style={styles.inlinePrimaryButton} onPress={() => openEditOrder(booking)}>
                                <Text style={styles.inlinePrimaryButtonText}>Edit Pending Order</Text>
                            </TouchableOpacity>
                        ) : null}
                        {canPayDeposit ? (
                            <TouchableOpacity style={styles.inlinePrimaryButton} onPress={() => payDeposit(booking)}>
                                <Text style={styles.inlinePrimaryButtonText}>Pay Deposit</Text>
                            </TouchableOpacity>
                        ) : null}
                        {canCallCafe ? (
                            <TouchableOpacity style={styles.inlineSecondaryButton} onPress={() => callPhone(booking.cafe?.contactPhone)}>
                                <Text style={styles.inlineSecondaryButtonText}>Call Cafe</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                ) : null}

                {booking.reservationStatus === 'QUEUED' ? (
                    <>
                        <View style={styles.summaryBox}>
                            <Calendar color="#0F172A" size={16} />
                            <Text style={styles.summaryText}>
                                Queue rank {booking.queuePosition > 0 ? `#${booking.queuePosition}` : 'pending'}.
                                {typeof booking.minutesUntilStart === 'number' ? ` Starts in about ${booking.minutesUntilStart} min.` : ''}
                                {' '}Scan table QR when status changes to READY.
                            </Text>
                        </View>
                        <TouchableOpacity 
                            style={{ marginTop: 10, backgroundColor: '#FFF1F2', paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' }}
                            onPress={() => handleCancel(booking.id)}
                        >
                            <Text style={{ color: '#B91C1C', fontWeight: '800' }}>Cancel Booking</Text>
                        </TouchableOpacity>
                    </>
                ) : null}

                {booking.reservationStatus === 'READY_FOR_CHECKIN' ? (
                    <View style={styles.summaryBox}>
                        <Clock color="#0F172A" size={16} />
                        <Text style={styles.summaryText}>
                            Table is ready. Scan the table QR and enter your session code to check in.
                        </Text>
                    </View>
                ) : null}

                {booking.orders?.length > 0 && booking.reservationStatus === 'COMPLETED' ? (
                    <View style={styles.summaryBox}>
                        <FileText color="#0F172A" size={16} />
                        <Text style={styles.summaryText}>
                            {booking.orders.length} order{booking.orders.length > 1 ? 's' : ''} | Rs. {totalAmount.toFixed(2)}
                        </Text>
                    </View>
                ) : null}
            </TouchableOpacity>
        );
    };

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
                                    <Text style={styles.badge}>CUSTOMER ACCOUNT</Text>
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

                        <View style={styles.summaryStatsRow}>
                            <View style={styles.statCard}>
                                <Text style={styles.statLabel}>Active</Text>
                                <Text style={styles.statValue}>{activeBookings.length}</Text>
                            </View>
                            <View style={styles.statCard}>
                                <Text style={styles.statLabel}>Completed</Text>
                                <Text style={styles.statValue}>{historyBookings.length}</Text>
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
                                            When you reserve a table, queue rank, slot window, and booking code will appear here.
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
                                        Completed dining sessions and order summaries will appear here.
                                    </Text>
                                </View>
                            ) : (
                                historyBookings.map(renderBookingCard)
                            )}
                        </View>
                    </View>
                </ResponsiveContainer>
            </ScrollView>

            <Modal visible={editVisible} transparent animationType="slide" onRequestClose={() => setEditVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={styles.modalTitle}>Edit Pending Order</Text>
                            <Text style={styles.modalSubtitle}>{editingBooking?.cafe?.name || 'Cafe'}</Text>

                            {loadingEditor ? (
                                <View style={styles.modalLoader}>
                                    <ActivityIndicator size="large" color="#0F172A" />
                                    <Text style={styles.loadingText}>Loading menu...</Text>
                                </View>
                            ) : (
                                <>
                                    {editingMenuItems.map((item) => {
                                        const quantity = editingItems[item.id]?.quantity || 0;
                                        return (
                                            <View key={item.id} style={styles.editorRow}>
                                                <View style={{ flex: 1, marginRight: 12 }}>
                                                    <Text style={styles.editorItemName}>{item.name}</Text>
                                                    <Text style={styles.editorItemMeta}>Rs. {Number(item.price || 0).toFixed(2)}</Text>
                                                </View>
                                                <View style={styles.editorQtyRow}>
                                                    <TouchableOpacity style={styles.editorQtyBtn} onPress={() => updateEditingQty(item, -1)}>
                                                        <Text style={styles.editorQtyBtnText}>-</Text>
                                                    </TouchableOpacity>
                                                    <Text style={styles.editorQtyValue}>{quantity}</Text>
                                                    <TouchableOpacity style={styles.editorQtyBtn} onPress={() => updateEditingQty(item, 1)}>
                                                        <Text style={styles.editorQtyBtnText}>+</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        );
                                    })}

                                    <Text style={styles.fieldLabel}>Special instructions</Text>
                                    <TextInput
                                        style={[styles.modalInput, styles.modalTextarea]}
                                        value={editingInstructions}
                                        onChangeText={setEditingInstructions}
                                        placeholder="Add or update instructions"
                                        placeholderTextColor="#94A3B8"
                                        multiline
                                    />

                                    <View style={styles.inlineActionRow}>
                                        <TouchableOpacity style={styles.inlinePrimaryButton} onPress={savePendingOrder} disabled={savingEdit}>
                                            <Text style={styles.inlinePrimaryButtonText}>{savingEdit ? 'Saving...' : 'Save Changes'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.inlineSecondaryButton} onPress={() => setEditVisible(false)} disabled={savingEdit}>
                                            <Text style={styles.inlineSecondaryButtonText}>Close</Text>
                                        </TouchableOpacity>
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

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#FFFFFF' },
    loadingScreen: { flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 14, color: '#64748B', fontSize: 15, fontWeight: '600' },
    scroll: { paddingVertical: 28, backgroundColor: '#FFFFFF' },
    page: { paddingHorizontal: 20 },
    header: { paddingTop: 12, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 18 },
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

    summaryStatsRow: { flexDirection: 'row', marginBottom: 14 },
    statCard: { flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, backgroundColor: '#F8FAFC', marginRight: 10 },
    statLabel: { color: '#64748B', fontWeight: '700', marginBottom: 4, fontSize: 12, textTransform: 'uppercase' },
    statValue: { color: '#0F172A', fontWeight: '900', fontSize: 22 },

    tabRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
    tabButton: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 16, paddingVertical: 14, marginRight: 12, marginBottom: 12, backgroundColor: '#FFFFFF' },
    tabButtonActive: { borderColor: '#0F172A', backgroundColor: '#FFF7F3' },
    tabButtonText: { color: '#475569', fontSize: 14, fontWeight: '700' },
    tabButtonTextActive: { color: '#0F172A' },
    countTag: { marginLeft: 8, color: '#0F172A', fontSize: 12, fontWeight: '800' },

    section: {},
    bookingCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', padding: 20, marginBottom: 18 },
    bookingHeader: { marginBottom: 14 },
    bookingHeaderCopy: { marginBottom: 10 },
    cafeName: { color: '#0F172A', fontSize: 22, fontWeight: '800', marginBottom: 6 },
    metaRow: { flexDirection: 'row', alignItems: 'center' },
    metaText: { color: '#64748B', fontSize: 14, marginLeft: 6, fontWeight: '500' },
    statusTag: { alignSelf: 'flex-start', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
    statusText: { fontSize: 12, fontWeight: '800' },
    typePill: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12, backgroundColor: '#F8FAFC' },
    typePillText: { color: '#334155', fontWeight: '800', fontSize: 12 },

    detailGrid: { flexDirection: 'column', marginBottom: 12 },
    detailGridWide: { flexDirection: 'row', justifyContent: 'space-between' },
    detailCard: { borderWidth: 1, borderColor: '#CBD5E1', padding: 14, marginBottom: 10, backgroundColor: '#FFFFFF' },
    detailCardWide: { width: '48.5%' },
    detailLabel: { color: '#64748B', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
    detailValue: { color: '#0F172A', fontSize: 16, fontWeight: '700' },

    codeBox: { borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', padding: 16, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
    codeLabel: { color: '#475569', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginLeft: 8, marginRight: 10 },
    codeValue: { color: '#0F172A', fontSize: 20, fontWeight: '900', letterSpacing: 2 },
    summaryBox: { borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    summaryText: { color: '#0F172A', fontSize: 14, fontWeight: '700', marginLeft: 10, flex: 1, lineHeight: 22 },
    noticeBox: { borderWidth: 1, padding: 16, marginBottom: 10 },
    noticeTitle: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
    noticeText: { fontSize: 14, fontWeight: '700', lineHeight: 22 },
    inlineActionRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2, marginBottom: 10 },
    inlinePrimaryButton: { backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#0F172A', paddingHorizontal: 16, paddingVertical: 12, marginRight: 10, marginBottom: 10 },
    inlinePrimaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
    inlineSecondaryButton: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 16, paddingVertical: 12, marginRight: 10, marginBottom: 10 },
    inlineSecondaryButtonText: { color: '#0F172A', fontSize: 13, fontWeight: '800' },

    emptyState: { borderWidth: 1, borderColor: '#D7DEE7', padding: 28, alignItems: 'center', backgroundColor: '#FFFFFF' },
    emptyTitle: { color: '#0F172A', fontSize: 22, fontWeight: '800', marginTop: 16, marginBottom: 10, textAlign: 'center' },
    emptyText: { color: '#64748B', fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 22, maxWidth: 460 },
    primaryButton: { borderWidth: 1, borderColor: '#0F172A', backgroundColor: '#0F172A', paddingHorizontal: 20, paddingVertical: 16, alignItems: 'center' },
    primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.68)', justifyContent: 'center', padding: 20 },
    modalCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', padding: 20, maxHeight: '88%' },
    modalTitle: { color: '#0F172A', fontSize: 28, fontWeight: '900', marginBottom: 4 },
    modalSubtitle: { color: '#475569', fontSize: 14, fontWeight: '600', marginBottom: 16 },
    modalLoader: { paddingVertical: 30, alignItems: 'center' },
    editorRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', padding: 14, marginBottom: 10, backgroundColor: '#FFFFFF' },
    editorItemName: { color: '#0F172A', fontSize: 15, fontWeight: '800', marginBottom: 4 },
    editorItemMeta: { color: '#64748B', fontSize: 13, fontWeight: '600' },
    editorQtyRow: { flexDirection: 'row', alignItems: 'center' },
    editorQtyBtn: { width: 30, height: 30, borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
    editorQtyBtnText: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
    editorQtyValue: { minWidth: 28, textAlign: 'center', color: '#0F172A', fontWeight: '800' },
    fieldLabel: { color: '#475569', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },
    modalInput: { borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 14, paddingVertical: 12, color: '#0F172A', backgroundColor: '#FFFFFF', marginBottom: 14 },
    modalTextarea: { minHeight: 96, textAlignVertical: 'top' },
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

function formatBookingType(type?: string) {
    switch (type) {
        case 'PRE_ORDER': return 'PREORDER';
        case 'TAKEAWAY': return 'TAKEAWAY';
        default: return 'DINE IN';
    }
}

function formatOrderStatus(status?: string) {
    if (!status) return 'Unknown';
    switch (status) {
        case 'PENDING_APPROVAL': return 'Awaiting approval';
        case 'RECEIVED': return 'Approved';
        case 'PREPARING': return 'Preparing';
        case 'READY': return 'Ready';
        case 'REJECTED': return 'Rejected';
        default: return status.replace(/_/g, ' ');
    }
}

function formatSlotWindow(startAt: string | Date, endAt?: string | Date | null) {
    const start = new Date(startAt);
    if (Number.isNaN(start.getTime())) return '--';
    const end = endAt ? new Date(endAt) : null;
    const endLabel = end && !Number.isNaN(end.getTime())
        ? end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '--';
    return `${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endLabel}`;
}

function formatDateTime(value?: string | Date | null) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString();
}

function isActiveBookingForCustomer(booking: any) {
    if (booking?.customerViewBucket) {
        return booking.customerViewBucket === 'ACTIVE';
    }

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

    return ['AWAITING_APPROVAL', 'APPROVED_PAYMENT_PENDING', 'APPROVED_PAYMENT_EXPIRED', 'APPROVED_PAYMENT_COMPLETED'].includes(booking?.approvalDisplayStatus);
}

function isPaymentWindowExpired(booking: any, nowMs: number) {
    if (booking?.approvalDisplayStatus === 'APPROVED_PAYMENT_EXPIRED' || booking?.paymentExpired) {
        return true;
    }

    if (!booking?.paymentDeadlineAt || booking?.approvalDisplayStatus !== 'APPROVED_PAYMENT_PENDING') {
        return false;
    }

    const deadline = new Date(booking.paymentDeadlineAt).getTime();
    return Number.isFinite(deadline) && deadline <= nowMs;
}

function formatCountdownMs(ms: number) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
    }

    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function getApprovalCallout(booking: any, nowMs: number) {
    const paymentExpired = isPaymentWindowExpired(booking, nowMs);
    const deadlineText = booking?.paymentDeadlineAt
        ? ` Complete payment before ${formatDateTime(booking.paymentDeadlineAt)}.`
        : '';
    const remainingMs = booking?.paymentDeadlineAt ? new Date(booking.paymentDeadlineAt).getTime() - nowMs : 0;
    const countdownText = remainingMs > 0 ? ` Time left: ${formatCountdownMs(remainingMs)}.` : '';

    switch (booking?.approvalDisplayStatus) {
        case 'AWAITING_APPROVAL':
            return {
                title: 'Awaiting Approval',
                message: booking?.paymentNotice || 'Owner or manager approval is still pending.',
                backgroundColor: '#FFF7ED',
                borderColor: '#FED7AA',
                titleColor: '#9A3412',
                textColor: '#9A3412',
            };
        case 'APPROVED_PAYMENT_PENDING':
            return {
                title: 'Approved, Deposit Pending',
                message: paymentExpired
                    ? 'Payment window expired. Call the restaurant to reopen the deposit window.'
                    : `${booking?.paymentNotice || 'Your booking is approved.'}${deadlineText}${countdownText}`,
                backgroundColor: '#EFF6FF',
                borderColor: '#BFDBFE',
                titleColor: '#1D4ED8',
                textColor: '#1E3A8A',
            };
        case 'APPROVED_PAYMENT_EXPIRED':
            return {
                title: 'Payment Window Expired',
                message: booking?.paymentNotice || 'Payment window expired. Call the restaurant to reopen the deposit window.',
                backgroundColor: '#FEF2F2',
                borderColor: '#FECACA',
                titleColor: '#B91C1C',
                textColor: '#991B1B',
            };
        case 'APPROVED_PAYMENT_COMPLETED':
            return {
                title: 'Deposit Paid',
                message: booking?.paymentNotice || 'Deposit payment has been received for this booking. Preorder confirmed.',
                backgroundColor: '#F0FDF4',
                borderColor: '#BBF7D0',
                titleColor: '#15803D',
                textColor: '#166534',
            };
        case 'REJECTED':
            return {
                title: 'Not Approved',
                message: booking?.paymentNotice || 'This booking request was not approved by the cafe.',
                backgroundColor: '#FEF2F2',
                borderColor: '#FECACA',
                titleColor: '#B91C1C',
                textColor: '#991B1B',
            };
        default:
            return null;
    }
}

function getStatusTagStyle(status: string) {
    switch (status) {
        case 'QUEUED':
            return { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' };
        case 'READY_FOR_CHECKIN':
            return { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' };
        case 'CHECKED_IN':
        case 'ACTIVE':
            return { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' };
        case 'MISSED':
            return { backgroundColor: '#FEF2F2', borderColor: '#FECACA' };
        default:
            return { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' };
    }
}

function getStatusTextStyle(status: string) {
    switch (status) {
        case 'QUEUED':
            return { color: '#C2410C' };
        case 'READY_FOR_CHECKIN':
            return { color: '#4338CA' };
        case 'CHECKED_IN':
        case 'ACTIVE':
            return { color: '#15803D' };
        case 'MISSED':
            return { color: '#B91C1C' };
        default:
            return { color: '#64748B' };
    }
}
