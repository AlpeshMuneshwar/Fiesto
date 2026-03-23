import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, SafeAreaView } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import client, { SOCKET_URL } from '../api/client';
import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWindowDimensions, Platform } from 'react-native';
import ResponsiveContainer from '../components/ResponsiveContainer';
import { useAudioPlayer } from 'expo-audio';

export default function WaiterDashboardScreen({ navigation }: any) {
    const [tables, setTables] = useState<any[]>([]);
    const [pendingOrders, setPendingOrders] = useState<any[]>([]);
    const [pendingPayments, setPendingPayments] = useState<any[]>([]);
    const [socket, setSocket] = useState<any>(null);

    const [isRinging, setIsRinging] = useState(false);
    const [incomingCallMsg, setIncomingCallMsg] = useState('');

    const [isCameraActive, setIsCameraActive] = useState(false);
    const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
    const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
    const cameraRef = React.useRef<any>(null);
    const { width } = useWindowDimensions();
    const isWide = width > 768;

    const alertPlayer = useAudioPlayer({
        uri: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'
    });

    const playNotification = () => {
        if (alertPlayer) {
            alertPlayer.play();
        }
    };

    useEffect(() => {
        const init = async () => {
            const userStr = await AsyncStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                fetchDashboardData();
                const newSocket = io(SOCKET_URL);
                setSocket(newSocket);
                newSocket.emit('join_room', { room: `WAITER_${user.cafeId}`, role: 'WAITER' });

                newSocket.on('call_waiter', (data: any) => {
                    if (data.type === 'FORGOT_CODE') {
                        setIncomingCallMsg(`Table ${data.tableNumber || '?'} forgot their code! It's: ${data.joinCode}`);
                    } else {
                        setIncomingCallMsg(data.message);
                    }
                    setIsRinging(true);
                    playNotification();
                });

                return () => { newSocket.disconnect(); }
            }
        };
        init();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const [tableRes, orderRes, paymentRes] = await Promise.all([
                client.get('/session/tables'),
                client.get('/order/pending-approval'),
                client.get('/payment/pending')
            ]);
            setTables(tableRes.data);
            setPendingOrders(orderRes.data);
            setPendingPayments(paymentRes.data);
        } catch (error: any) {
            const msg = error.response?.data?.error || "Check your network";
            console.error('Waiter Sync Error:', msg);
            Alert.alert("Sync Error", msg);
        }
    };

    const clearSession = async (sessionId: string) => {
        try {
            await client.post(`/session/${sessionId}/deactivate`);
            fetchDashboardData();
            Alert.alert('Session Cleared');
        } catch (e: any) {
            const msg = e.response?.data?.error || "Could not clear session";
            Alert.alert('Error', msg);
        }
    };

    const handleOrderApproval = async (orderId: string, approve: boolean) => {
        try {
            await client.post(`/order/${orderId}/approve`, { approve });
            fetchDashboardData();
        } catch (e: any) {
            const msg = e.response?.data?.error || "Action failed";
            Alert.alert('Error', msg);
        }
    };

    const startPaymentVerification = async (paymentId: string) => {
        const { status } = await Camera.requestCameraPermissionsAsync();
        setCameraPermission(status === 'granted');
        if (status === 'granted') {
            setActivePaymentId(paymentId);
            setIsCameraActive(true);
        } else {
            Alert.alert('Permission needed', 'Camera is required to scan receipts.');
        }
    };

    const takeReceiptPhotoAndVerify = async () => {
        if (cameraRef.current && activePaymentId) {
            const photo = await cameraRef.current.takePictureAsync();
            setIsCameraActive(false);

            const formData = new FormData();
            formData.append('receipt', {
                uri: photo.uri,
                name: 'receipt.jpg',
                type: 'image/jpeg'
            } as any);
            formData.append('status', 'DONE');

            try {
                await client.post(`/payment/${activePaymentId}/verify`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                Alert.alert('Payment Verified', 'Table session completed successfully.');
                fetchDashboardData();
            } catch (e: any) {
                const msg = e.response?.data?.error || "Failed to upload receipt";
                Alert.alert('Error', msg);
            }
        }
    };

    const handleLogout = async () => {
        await AsyncStorage.removeItem('userToken');
        navigation.replace('Login');
    };

    if (isCameraActive) {
        return (
            <View style={{ flex: 1, backgroundColor: '#000' }}>
                <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} />
                <View style={styles.cameraOverlay}>
                    <TouchableOpacity style={styles.captureBtn} activeOpacity={0.8} onPress={takeReceiptPhotoAndVerify}>
                        <View style={styles.captureInner} />
                    </TouchableOpacity>
                    <Text style={styles.cameraText}>Take a clear photo of the receipt</Text>
                    <TouchableOpacity style={styles.cancelCameraBtn} onPress={() => setIsCameraActive(false)}>
                        <Text style={{ color: 'white', fontWeight: 'bold' }}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (isRinging) {
        return (
            <View style={styles.ringingContainer}>
                <View style={styles.ringGlow} />
                <Text style={styles.ringTitle}>Incoming KDS Call</Text>
                <Text style={styles.ringMsg}>Chef says: "{incomingCallMsg}"</Text>
                <TouchableOpacity style={styles.answerBtn} activeOpacity={0.8} onPress={() => setIsRinging(false)}>
                    <Text style={styles.answerBtnText}>Answer / Dismiss</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const activeTables = tables.filter(t => t.sessions.length > 0);

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                <ResponsiveContainer maxWidth={1100}>
                    <View style={styles.headerRow}>
                        <Text style={styles.header}>Dashboard</Text>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity style={styles.refreshBtn} onPress={fetchDashboardData}>
                                <Text style={styles.refreshText}>↻ Refresh</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                                <Text style={styles.logoutText}>Logout</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {pendingPayments.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Pending Checkouts 💰</Text>
                            <View style={[isWide && { flexDirection: 'row', flexWrap: 'wrap', gap: 15 }]}>
                                {pendingPayments.map(item => (
                                    <View key={item.id} style={[styles.card, isWide && { width: '48.5%', marginBottom: 0 }]}>
                                        <View style={styles.cardInfo}>
                                            <Text style={styles.cardTitle}>Table {item.order?.session?.table?.number || '?'}</Text>
                                            <Text style={styles.cardSubtitle}>Checkout Request</Text>
                                        </View>
                                        <Text style={styles.priceLabel}>₹{item.amount.toFixed(2)}</Text>
                                        <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.8} onPress={() => startPaymentVerification(item.id)}>
                                            <Text style={styles.btnTextWhite}>Scan Receipt & Verify</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    {pendingOrders.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Location OFF Approvals 📍</Text>
                            <View style={[isWide && { flexDirection: 'row', flexWrap: 'wrap', gap: 15 }]}>
                                {pendingOrders.map(item => (
                                    <View key={item.id} style={[styles.card, isWide && { width: '48.5%', marginBottom: 0 }]}>
                                        <View style={styles.cardInfo}>
                                            <Text style={styles.cardTitle}>Table {item.session?.table?.number || '?'}</Text>
                                            <Text style={styles.cardSubtitle}>Order requires manual approval</Text>
                                        </View>
                                        <Text style={styles.priceLabel}>Total: ₹{item.totalAmount.toFixed(2)}</Text>

                                        <View style={styles.itemsList}>
                                            {JSON.parse(item.items).map((food: any, idx: number) => (
                                                <Text key={idx} style={styles.itemTextSmall}>• {food.quantity}x {food.name}</Text>
                                            ))}
                                        </View>

                                        <View style={styles.actionRow}>
                                            <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} activeOpacity={0.8} onPress={() => handleOrderApproval(item.id, true)}>
                                                <Text style={styles.btnTextWhite}>Approve</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} activeOpacity={0.8} onPress={() => handleOrderApproval(item.id, false)}>
                                                <Text style={styles.btnTextWhite}>Reject</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Active Tables (Ghost Check) 👀</Text>
                        <View style={[isWide && { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }]}>
                            {activeTables.length === 0 ? (
                                <Text style={styles.emptyText}>No active tables right now.</Text>
                            ) : (
                                activeTables.map(item => (
                                    <View key={item.id} style={[styles.tableCard, isWide && { width: '32%', marginBottom: 0 }]}>
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                <Text style={styles.cardTitle}>Table {item.number}</Text>
                                                {item.sessions[0]?.isPrebooked && (
                                                    <View style={styles.prebookBadge}>
                                                        <Text style={styles.prebookText}>⏰ Pre-booked</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={[styles.codeLabel, { marginTop: 4 }]}>
                                                Code: <Text style={styles.codeValue}>{item.sessions[0]?.joinCode || 'N/A'}</Text>
                                            </Text>
                                        </View>
                                        <TouchableOpacity style={styles.clearBtn} activeOpacity={0.8} onPress={() => clearSession(item.sessions[0].id)}>
                                            <Text style={styles.clearBtnText}>Clear</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))
                            )}
                        </View>
                    </View>
                </ResponsiveContainer>
                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFA' },
    scrollContent: { padding: 20 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
    header: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', letterSpacing: -0.5 },
    refreshBtn: { backgroundColor: '#E8F8F5', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    refreshText: { color: '#16A085', fontWeight: '700', fontSize: 13 },
    logoutBtn: { backgroundColor: '#FDEDEC', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    logoutText: { color: '#E74C3C', fontWeight: '700', fontSize: 13 },
    section: { marginBottom: 30 },
    sectionTitle: { fontSize: 20, fontWeight: '800', color: '#2C3E50', marginBottom: 15 },
    card: {
        backgroundColor: '#FFFFFF', padding: 18, borderRadius: 16, marginBottom: 15,
        ...Platform.select({
            web: { boxShadow: '0 4px 10px rgba(0,0,0,0.05)' },
            default: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 }
        })
    },
    cardInfo: { marginBottom: 10 },
    cardTitle: { fontSize: 18, fontWeight: '700', color: '#34495E' },
    cardSubtitle: { fontSize: 14, color: '#7F8C8D', marginTop: 2 },
    priceLabel: { fontSize: 22, fontWeight: '800', color: '#27AE60', marginBottom: 15 },
    primaryBtn: { backgroundColor: '#3498DB', padding: 15, borderRadius: 12, alignItems: 'center' },
    btnTextWhite: { color: '#FFF', fontWeight: '700', fontSize: 15 },
    actionRow: { flexDirection: 'row', gap: 10 },
    actionBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
    approveBtn: { backgroundColor: '#2ECC71' },
    rejectBtn: { backgroundColor: '#E74C3C' },
    tableCard: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 10,
        borderLeftWidth: 4, borderLeftColor: '#F39C12',
        ...Platform.select({
            web: { boxShadow: '0 2px 4px rgba(0,0,0,0.04)' },
            default: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 }
        })
    },
    prebookBadge: { backgroundColor: '#E2F7E9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#C0EED0' },
    prebookText: { color: '#0A7A34', fontSize: 11, fontWeight: '700' },
    clearBtn: { backgroundColor: '#FDEDEC', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
    clearBtnText: { color: '#C0392B', fontWeight: '700', fontSize: 13 },
    emptyText: { color: '#95A5A6', fontStyle: 'italic', fontSize: 15 },
    cameraOverlay: { position: 'absolute', bottom: 0, width: '100%', height: 200, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    captureBtn: { width: 70, height: 70, borderRadius: 35, borderWidth: 4, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    captureInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#FFF' },
    cameraText: { color: '#FFF', fontSize: 14, marginBottom: 20 },
    cancelCameraBtn: { position: 'absolute', top: 20, right: 20, backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: 8 },
    ringingContainer: { flex: 1, backgroundColor: '#E74C3C', justifyContent: 'center', alignItems: 'center' },
    ringGlow: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.2)' },
    ringTitle: { color: 'white', fontSize: 32, fontWeight: '900', marginBottom: 10, letterSpacing: 1 },
    ringMsg: { color: 'white', fontSize: 18, marginBottom: 60, opacity: 0.9, fontStyle: 'italic' },
    answerBtn: { backgroundColor: '#FFF', paddingVertical: 18, paddingHorizontal: 40, borderRadius: 30, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 5 },
    answerBtnText: { color: '#E74C3C', fontSize: 20, fontWeight: '800' },
    itemsList: { marginBottom: 15, padding: 10, backgroundColor: '#F8F9F9', borderRadius: 8 },
    itemTextSmall: { fontSize: 14, color: '#5D6D7E', marginBottom: 2 },
    codeLabel: { fontSize: 12, color: '#7F8C8D', fontWeight: '600' },
    codeValue: { color: '#E67E22', fontWeight: '800' }
});
