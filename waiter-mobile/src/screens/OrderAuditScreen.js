import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Clock, User, CheckCircle, Package, Flame, ShieldCheck, ShieldX } from 'lucide-react-native';
import client from '../api/client';

const getRelativeTime = (timestamp) => {
    const min = Math.round((new Date() - new Date(timestamp)) / 60000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
};

const AuditItem = ({ log, isLast }) => {
    const isSuccess = ['ORDER_PLACED', 'ORDER_APPROVED', 'ORDER_READY', 'ORDER_DELIVERED', 'SESSION_CLOSED'].includes(log.action);
    const isWarning = ['ORDER_REJECTED', 'CANCELLED'].includes(log.action);

    const getIcon = () => {
        switch(log.action) {
            case 'ORDER_PLACED': return <Package color="#3B82F6" size={20} />;
            case 'ORDER_APPROVED': return <ShieldCheck color="#10B981" size={20} />;
            case 'ORDER_REJECTED': return <ShieldX color="#EF4444" size={20} />;
            case 'ORDER_PREPARING': return <Flame color="#F97316" size={20} />;
            case 'ORDER_READY': return <CheckCircle color="#10B981" size={20} />;
            case 'ORDER_DELIVERED': return <CheckCircle color="#059669" size={20} />;
            default: return <Clock color="#94A3B8" size={20} />;
        }
    };

    return (
        <View style={styles.logRow}>
            <View style={styles.timelineSidebar}>
                <View style={[styles.iconCircle, { backgroundColor: isWarning ? '#FEF2F2' : '#F1F5F9' }]}>
                    {getIcon()}
                </View>
                {!isLast && <View style={styles.timelineLine} />}
            </View>
            <View style={styles.logContent}>
                <View style={styles.logHeader}>
                    <Text style={[styles.logTitle, isWarning && { color: '#EF4444' }]}>{log.message}</Text>
                    <Text style={styles.logTime}>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
                <View style={styles.logMeta}>
                    <User size={12} color="#94A3B8" />
                    <Text style={styles.logStaff}>By {log.staffName}</Text>
                    <Text style={styles.logRelative}>- {getRelativeTime(log.timestamp)}</Text>
                </View>
            </View>
        </View>
    );
};

export default function OrderAuditScreen({ route, navigation }) {
    const { orderId, orderNumber } = route.params;
    const [loading, setLoading] = useState(true);
    const [auditData, setAuditData] = useState(null);

    const fetchAudit = async () => {
        try {
            setLoading(true);
            const res = await client.get(`/admin/orders/${orderId}/audit`);
            setAuditData(res.data);
        } catch (e) {
            console.error('Audit Fetch Error', e);
            Alert.alert('Error', 'Failed to fetch order history');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAudit();
    }, [orderId]);

    if (loading) {
        return (
            <SafeAreaView style={styles.centered} edges={['top', 'bottom', 'left', 'right']}>
                <StatusBar style="dark" />
                <ActivityIndicator size="large" color="#0EA5E9" />
                <Text style={styles.loadingText}>Retracing Order Lifecycle...</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
            <StatusBar style="dark" />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ArrowLeft color="#1E293B" size={24} />
                </TouchableOpacity>
                <View>
                    <Text style={styles.headerTitle}>Order Audit</Text>
                    <Text style={styles.headerSub}>#{orderNumber || orderId.split('-')[0].toUpperCase()}</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {auditData?.order && (
                    <View style={styles.orderSummary}>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Current Status:</Text>
                            <View style={styles.statusBadge}>
                                <Text style={styles.statusText}>{auditData.order.status}</Text>
                            </View>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Total Amount:</Text>
                            <Text style={styles.summaryValue}>${auditData.order.totalAmount.toFixed(2)}</Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Table Number:</Text>
                            <Text style={styles.summaryValue}>{auditData.order.session?.table?.number || 'N/A'}</Text>
                        </View>
                    </View>
                )}

                <Text style={styles.timelineTitle}>Activity Timeline</Text>
                
                <View style={styles.timelineContainer}>
                    {auditData?.timeline.map((log, index) => (
                        <AuditItem 
                            key={log.id} 
                            log={log} 
                            isLast={index === auditData.timeline.length - 1} 
                        />
                    ))}
                    {auditData?.timeline.length === 0 && (
                        <View style={styles.emptyState}>
                            <Clock size={40} color="#E2E8F0" />
                            <Text style={styles.emptyText}>No activity logs found for this order.</Text>
                        </View>
                    )}
                </View>

                <TouchableOpacity style={styles.refreshBtn} onPress={fetchAudit}>
                    <Text style={styles.refreshBtnText}>Refresh Timeline</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
    loadingText: { marginTop: 15, fontSize: 14, color: '#64748B', fontWeight: '600' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    backBtn: { padding: 8, marginRight: 15, borderRadius: 12, backgroundColor: '#F1F5F9' },
    headerTitle: { fontSize: 20, fontWeight: '900', color: '#1E293B' },
    headerSub: { fontSize: 13, color: '#94A3B8', fontWeight: '700' },
    scrollContent: { padding: 20 },
    orderSummary: { backgroundColor: 'white', borderRadius: 20, padding: 20, marginBottom: 25, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    summaryLabel: { fontSize: 14, color: '#64748B', fontWeight: '600' },
    summaryValue: { fontSize: 14, fontWeight: '800', color: '#1E293B' },
    statusBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText: { fontSize: 11, fontWeight: '900', color: '#1E293B', textTransform: 'uppercase' },
    timelineTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B', marginBottom: 15 },
    timelineContainer: { backgroundColor: 'white', borderRadius: 24, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 },
    logRow: { flexDirection: 'row', minHeight: 70 },
    timelineSidebar: { alignItems: 'center', marginRight: 15, width: 40 },
    iconCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    timelineLine: { flex: 1, width: 2, backgroundColor: '#F1F5F9', marginVertical: 4 },
    logContent: { flex: 1, paddingTop: 2, paddingBottom: 20 },
    logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
    logTitle: { fontSize: 14, fontWeight: '700', color: '#1E293B', flex: 1, marginRight: 10 },
    logTime: { fontSize: 11, color: '#94A3B8', fontWeight: '700' },
    logMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    logStaff: { fontSize: 12, color: '#64748B', fontWeight: '600' },
    logRelative: { fontSize: 11, color: '#94A3B8' },
    emptyState: { padding: 40, alignItems: 'center' },
    emptyText: { marginTop: 15, color: '#94A3B8', textAlign: 'center', fontSize: 14 },
    refreshBtn: { marginTop: 25, backgroundColor: '#F1F5F9', paddingVertical: 15, borderRadius: 16, alignItems: 'center' },
    refreshBtnText: { color: '#64748B', fontWeight: '700', fontSize: 14 }
});
