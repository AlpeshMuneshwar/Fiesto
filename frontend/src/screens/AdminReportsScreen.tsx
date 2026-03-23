import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView, Platform, TextInput } from 'react-native';
import client from '../api/client';
import { StatusBar } from 'expo-status-bar';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function AdminReportsScreen({ navigation }: any) {
    const [report, setReport] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [fromDate, setFromDate] = useState(getToday());
    const [toDate, setToDate] = useState(getToday());

    function getToday() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    useEffect(() => {
        fetchReport();
    }, []);

    const fetchReport = async () => {
        setLoading(true);
        try {
            const res = await client.get(`/admin/report?from=${fromDate}&to=${toDate}`);
            setReport(res.data);
        } catch (e) {
            // Global toast handles
        } finally {
            setLoading(false);
        }
    };

    const setQuickRange = (days: number) => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);
        setFromDate(formatDate(start));
        setToDate(formatDate(end));
    };

    function formatDate(d: Date) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    const s = report?.summary;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />
            <ScrollView contentContainerStyle={{ padding: 20 }}>
                <ResponsiveContainer maxWidth={900}>
                    <Text style={styles.title}>Sales Report</Text>

                    {/* Date Picker */}
                    <View style={styles.dateRow}>
                        <View style={styles.dateField}>
                            <Text style={styles.dateLabel}>From</Text>
                            <TextInput
                                style={styles.dateInput}
                                value={fromDate}
                                onChangeText={setFromDate}
                                placeholder="YYYY-MM-DD"
                                placeholderTextColor="#64748B"
                            />
                        </View>
                        <View style={styles.dateField}>
                            <Text style={styles.dateLabel}>To</Text>
                            <TextInput
                                style={styles.dateInput}
                                value={toDate}
                                onChangeText={setToDate}
                                placeholder="YYYY-MM-DD"
                                placeholderTextColor="#64748B"
                            />
                        </View>
                        <TouchableOpacity style={styles.goBtn} onPress={fetchReport}>
                            <Text style={styles.goBtnText}>Generate</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Quick Range */}
                    <View style={styles.quickRow}>
                        {[
                            { label: 'Today', days: 0 },
                            { label: '7 Days', days: 7 },
                            { label: '30 Days', days: 30 },
                        ].map(q => (
                            <TouchableOpacity key={q.label} style={styles.quickBtn} onPress={() => { setQuickRange(q.days); }}>
                                <Text style={styles.quickBtnText}>{q.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {loading ? (
                        <View style={styles.loadingWrap}>
                            <ActivityIndicator size="large" color="#38BDF8" />
                        </View>
                    ) : report ? (
                        <>
                            {/* Summary Cards */}
                            <View style={styles.summaryGrid}>
                                <View style={[styles.summaryCard, { borderLeftColor: '#38BDF8' }]}>
                                    <Text style={styles.summaryValue}>{s?.totalOrders || 0}</Text>
                                    <Text style={styles.summaryLabel}>Total Orders</Text>
                                </View>
                                <View style={[styles.summaryCard, { borderLeftColor: '#10B981' }]}>
                                    <Text style={styles.summaryValue}>₹{(s?.totalRevenue || 0).toFixed(2)}</Text>
                                    <Text style={styles.summaryLabel}>Total Revenue</Text>
                                </View>
                                <View style={[styles.summaryCard, { borderLeftColor: '#F59E0B' }]}>
                                    <Text style={styles.summaryValue}>₹{(s?.avgOrderValue || 0).toFixed(2)}</Text>
                                    <Text style={styles.summaryLabel}>Avg Order Value</Text>
                                </View>
                                <View style={[styles.summaryCard, { borderLeftColor: '#A855F7' }]}>
                                    <Text style={styles.summaryValue}>₹{(s?.totalTax || 0).toFixed(2)}</Text>
                                    <Text style={styles.summaryLabel}>Tax Collected</Text>
                                </View>
                            </View>

                            {/* Hourly Activity */}
                            <View style={styles.sectionCard}>
                                <Text style={styles.sectionTitle}>Hourly Activity</Text>
                                <View style={styles.barChart}>
                                    {report.hourlyBreakdown
                                        .filter((h: any) => h.count > 0)
                                        .map((h: any) => {
                                            const maxCount = Math.max(...report.hourlyBreakdown.map((x: any) => x.count), 1);
                                            const barHeight = Math.max((h.count / maxCount) * 100, 5);
                                            return (
                                                <View key={h.hour} style={styles.barCol}>
                                                    <Text style={styles.barValue}>{h.count}</Text>
                                                    <View style={[styles.bar, { height: barHeight }]} />
                                                    <Text style={styles.barLabel}>{h.label}</Text>
                                                </View>
                                            );
                                        })}
                                    {report.hourlyBreakdown.filter((h: any) => h.count > 0).length === 0 && (
                                        <Text style={styles.emptyText}>No orders in this period</Text>
                                    )}
                                </View>
                            </View>

                            {/* Top Selling Items */}
                            <View style={styles.sectionCard}>
                                <Text style={styles.sectionTitle}>Top Selling Items</Text>
                                {report.topSelling?.length > 0 ? (
                                    report.topSelling.map((item: any, idx: number) => (
                                        <View key={item.name} style={styles.topRow}>
                                            <View style={styles.topRank}>
                                                <Text style={styles.topRankText}>#{idx + 1}</Text>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.topName}>{item.name}</Text>
                                                <Text style={styles.topSub}>{item.count} sold • ₹{item.revenue.toFixed(2)} revenue</Text>
                                            </View>
                                        </View>
                                    ))
                                ) : (
                                    <Text style={styles.emptyText}>No items sold in this period</Text>
                                )}
                            </View>

                            {/* Status Breakdown */}
                            <View style={styles.sectionCard}>
                                <Text style={styles.sectionTitle}>Order Status Breakdown</Text>
                                <View style={styles.statusGrid}>
                                    {Object.entries(report.statusBreakdown || {}).map(([status, count]) => (
                                        <View key={status} style={styles.statusBadge}>
                                            <Text style={styles.statusCount}>{count as number}</Text>
                                            <Text style={styles.statusLabel}>{status.replace(/_/g, ' ')}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>

                            {/* Recent Orders Table */}
                            <View style={styles.sectionCard}>
                                <Text style={styles.sectionTitle}>Recent Orders ({report.orders?.length || 0})</Text>
                                {report.orders?.slice(0, 20).map((order: any) => (
                                    <View key={order.id} style={styles.orderRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.orderTable}>Table {order.tableNumber || '?'}</Text>
                                            <Text style={styles.orderTime}>{new Date(order.createdAt).toLocaleTimeString()}</Text>
                                        </View>
                                        <View style={[styles.orderStatusBadge, { backgroundColor: getStatusColor(order.status) }]}>
                                            <Text style={styles.orderStatusText}>{order.status}</Text>
                                        </View>
                                        <Text style={styles.orderAmount}>₹{order.totalAmount.toFixed(2)}</Text>
                                    </View>
                                ))}
                            </View>
                        </>
                    ) : null}
                </ResponsiveContainer>
            </ScrollView>
        </SafeAreaView>
    );
}

function getStatusColor(status: string) {
    switch (status) {
        case 'RECEIVED': return 'rgba(56,189,248,0.15)';
        case 'PREPARING': return 'rgba(245,158,11,0.15)';
        case 'READY': return 'rgba(16,185,129,0.15)';
        case 'DELIVERED': return 'rgba(168,85,247,0.15)';
        default: return 'rgba(100,116,139,0.15)';
    }
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
    title: { color: 'white', fontSize: 28, fontWeight: '800', marginBottom: 25 },
    dateRow: { flexDirection: 'row', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
    dateField: { flex: 1, minWidth: 120 },
    dateLabel: { color: '#94A3B8', fontSize: 12, marginBottom: 5 },
    dateInput: { backgroundColor: '#1E293B', color: 'white', padding: 12, borderRadius: 10, fontSize: 14 },
    goBtn: { backgroundColor: '#38BDF8', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, justifyContent: 'flex-end', alignSelf: 'flex-end' },
    goBtnText: { color: '#0F172A', fontWeight: '800' },
    quickRow: { flexDirection: 'row', gap: 10, marginBottom: 25 },
    quickBtn: { backgroundColor: '#1E293B', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    quickBtnText: { color: '#94A3B8', fontWeight: '600', fontSize: 13 },
    loadingWrap: { marginTop: 80, alignItems: 'center' },
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
    summaryCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 20, flex: 1, minWidth: 150, borderLeftWidth: 4 },
    summaryValue: { color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 5 },
    summaryLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
    sectionCard: { backgroundColor: '#1E293B', borderRadius: 20, padding: 20, marginBottom: 20 },
    sectionTitle: { color: 'white', fontSize: 18, fontWeight: '800', marginBottom: 15 },
    barChart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 6 },
    barCol: { alignItems: 'center', flex: 1 },
    bar: { width: '100%', backgroundColor: '#38BDF8', borderRadius: 4, minHeight: 4 },
    barValue: { color: '#94A3B8', fontSize: 10, marginBottom: 4 },
    barLabel: { color: '#64748B', fontSize: 9, marginTop: 4 },
    topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    topRank: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(56,189,248,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    topRankText: { color: '#38BDF8', fontWeight: '800', fontSize: 12 },
    topName: { color: 'white', fontWeight: '700', fontSize: 15 },
    topSub: { color: '#64748B', fontSize: 12, marginTop: 2 },
    statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statusBadge: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 12, alignItems: 'center', minWidth: 80 },
    statusCount: { color: 'white', fontSize: 20, fontWeight: '800' },
    statusLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '600', marginTop: 4, textTransform: 'capitalize' },
    orderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', gap: 10 },
    orderTable: { color: 'white', fontWeight: '600' },
    orderTime: { color: '#64748B', fontSize: 12 },
    orderStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    orderStatusText: { color: 'white', fontSize: 11, fontWeight: '700' },
    orderAmount: { color: '#10B981', fontWeight: '800', fontSize: 15, minWidth: 70, textAlign: 'right' },
    emptyText: { color: '#64748B', fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
});
