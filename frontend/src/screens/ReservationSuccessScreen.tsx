import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Animated, Share, Platform } from 'react-native';
import { CheckCircle, Share2, Clipboard, ChevronRight, Home, Calendar } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function ReservationSuccessScreen({ route, navigation }: any) {
    const { session, preOrder, cafeName } = route.params;
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true })
        ]).start();
    }, []);

    const handleShare = async () => {
        try {
            await Share.share({
                message: `Hey! I've booked a table at ${cafeName}. Join me using Session Code: ${session.joinCode}`,
            });
        } catch (error) {
            console.log(error);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />
            <ResponsiveContainer maxWidth={600}>
                <View style={styles.content}>
                    {/* Animated Icon */}
                    <Animated.View style={[styles.iconContainer, { transform: [{ scale: scaleAnim }] }]}>
                        <View style={styles.iconBg}>
                            <CheckCircle color="#10B981" size={80} strokeWidth={2.5} />
                        </View>
                    </Animated.View>

                    <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
                        <Text style={styles.successTitle}>Reservation Locked!</Text>
                        <Text style={styles.successSubtitle}>Your table at <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>{cafeName}</Text> is ready for your arrival.</Text>

                        {/* Session Code Card */}
                        <View style={styles.codeCard}>
                            <Text style={styles.codeLabel}>YOUR SESSION CODE</Text>
                            <View style={styles.codeRow}>
                                {session.joinCode.split('').map((char: string, i: number) => (
                                    <View key={i} style={styles.codeBox}>
                                        <Text style={styles.codeChar}>{char}</Text>
                                    </View>
                                ))}
                            </View>
                            <Text style={styles.codeInstruction}>Scan the table QR and enter this code to start your session.</Text>
                            
                            <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                                <Share2 color="#38BDF8" size={18} />
                                <Text style={styles.shareTxt}>Invite Friends</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Booking Details */}
                        <View style={styles.detailsList}>
                            <View style={styles.detailItem}>
                                <Calendar color="#94A3B8" size={18} />
                                <View style={styles.detailTextCol}>
                                    <Text style={styles.detailLabel}>Date & Time</Text>
                                    <Text style={styles.detailValue}>{new Date(session.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</Text>
                                </View>
                            </View>
                            
                            {preOrder && (
                                <View style={[styles.detailItem, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 16 }]}>
                                    <View style={styles.preOrderBadge}>
                                        <Text style={styles.preOrderBadgeText}>Pre-Ordered</Text>
                                    </View>
                                    <View style={styles.detailTextCol}>
                                        <Text style={styles.detailLabel}>Advance Paid</Text>
                                        <Text style={styles.detailValue}>₹{preOrder.totalPaidNow.toFixed(2)}</Text>
                                    </View>
                                </View>
                            )}
                        </View>

                        {/* Actions */}
                        <TouchableOpacity 
                            style={styles.historyBtn} 
                            onPress={() => navigation.navigate('CustomerProfile')}
                        >
                            <Text style={styles.historyBtnText}>View in My Bookings</Text>
                            <ChevronRight color="#38BDF8" size={20} />
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={styles.homeBtn} 
                            onPress={() => navigation.navigate('Landing')}
                        >
                            <Home color="#94A3B8" size={20} />
                            <Text style={styles.homeBtnText}>Back to Home</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </ResponsiveContainer>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
    content: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
    iconContainer: { marginBottom: 30 },
    iconBg: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(16, 185, 129, 0.1)', justifyContent: 'center', alignItems: 'center' },
    successTitle: { fontSize: 32, fontWeight: '900', color: '#FFFFFF', marginBottom: 12, letterSpacing: -0.5 },
    successSubtitle: { fontSize: 16, color: '#94A3B8', textAlign: 'center', lineHeight: 24, paddingHorizontal: 20, marginBottom: 40 },
    
    codeCard: { 
        width: '100%', backgroundColor: '#1E293B', borderRadius: 32, padding: 32, alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 30,
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20
    },
    codeLabel: { fontSize: 13, fontWeight: '800', color: '#38BDF8', letterSpacing: 2, marginBottom: 20 },
    codeRow: { flexDirection: 'row', gap: 12, marginBottom: 25 },
    codeBox: { 
        width: 54, height: 64, backgroundColor: '#0F172A', borderRadius: 16, 
        justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(56, 189, 248, 0.3)' 
    },
    codeChar: { fontSize: 32, fontWeight: '900', color: '#FFFFFF' },
    codeInstruction: { fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 25, lineHeight: 20 },
    shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(56, 189, 248, 0.1)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16 },
    shareTxt: { color: '#38BDF8', fontWeight: '700', fontSize: 15 },

    detailsList: { width: '100%', backgroundColor: 'rgba(30, 41, 59, 0.5)', borderRadius: 24, padding: 20, marginBottom: 30 },
    detailItem: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
    detailTextCol: { flex: 1 },
    detailLabel: { fontSize: 12, color: '#64748B', fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
    detailValue: { fontSize: 15, color: '#F1F5F9', fontWeight: '700' },
    preOrderBadge: { backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, position: 'absolute', right: 0, top: 0 },
    preOrderBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },

    historyBtn: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, marginBottom: 15 },
    historyBtnText: { color: '#38BDF8', fontSize: 16, fontWeight: '700' },
    
    homeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 15 },
    homeBtnText: { color: '#94A3B8', fontSize: 15, fontWeight: '600' }
});
