import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, useWindowDimensions } from 'react-native';
import client from '../api/client';
import { StatusBar } from 'expo-status-bar';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function AdminReportsWebScreen() {
    const [report, setReport] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [fromDate, setFromDate] = useState(getToday());
    const [toDate, setToDate] = useState(getToday());
    const { width } = useWindowDimensions();
    const isWide = width >= 980;

    function getToday() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function formatDate(d: Date) {
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

    const s = report?.summary;
    const summaryCards = [
        { label: 'Total orders', value: String(s?.totalOrders || 0), accent: '#3B82F6' },
        { label: 'Total revenue', value: `Rs. ${Number(s?.totalRevenue || 0).toFixed(2)}`, accent: '#10B981' },
        { label: 'Average order', value: `Rs. ${Number(s?.avgOrderValue || 0).toFixed(2)}`, accent: '#F59E0B' },
        { label: 'Tax collected', value: `Rs. ${Number(s?.totalTax || 0).toFixed(2)}`, accent: '#A855F7' },
    ];

    return (
        <View style={styles.screen}>
            <StatusBar style="dark" />
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <ResponsiveContainer maxWidth={1120}>
                    <View style={styles.page}>
                        <View style={styles.header}>
                            <Text style={styles.badge}>REPORTING</Text>
                            <Text style={styles.title}>Track sales and order behaviour with cleaner reporting</Text>
                            <Text style={styles.subtitle}>
                                Generate reports by date range, review order performance, and monitor the most important sales signals for the cafe.
                            </Text>
                        </View>

                        <View style={styles.filterPanel}>
                            <Text style={styles.panelLabel}>DATE RANGE</Text>
                            <View style={[styles.filterRow, isWide && styles.filterRowWide]}>
                                <View style={[styles.filterField, isWide && styles.filterFieldWide]}>
                                    <Text style={styles.fieldLabel}>From</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={fromDate}
                                        onChangeText={setFromDate}
                                        placeholder="YYYY-MM-DD"
                                        placeholderTextColor="#94A3B8"
                                    />
                                </View>
                                <View style={[styles.filterField, isWide && styles.filterFieldWide]}>
                                    <Text style={styles.fieldLabel}>To</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={toDate}
                                        onChangeText={setToDate}
                                        placeholder="YYYY-MM-DD"
                                        placeholderTextColor="#94A3B8"
                                    />
                                </View>
                                <TouchableOpacity style={styles.primaryButton} onPress={fetchReport}>
                                    <Text style={styles.primaryButtonText}>Generate report</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.quickRow}>
                                {[
                                    { label: 'Today', days: 0 },
                                    { label: '7 days', days: 7 },
                                    { label: '30 days', days: 30 },
                                ].map((range) => (
                                    <TouchableOpacity key={range.label} style={styles.quickButton} onPress={() => setQuickRange(range.days)}>
                                        <Text style={styles.quickButtonText}>{range.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {loading ? (
                            <View style={styles.loadingWrap}>
                                <ActivityIndicator size="large" color="#0F172A" />
                                <Text style={styles.loadingText}>Preparing report...</Text>
                            </View>
                        ) : report ? (
                            <>
                                <View style={styles.section}>
                                    <Text style={styles.sectionLabel}>SUMMARY</Text>
                                    <View style={[styles.summaryGrid, isWide && styles.summaryGridWide]}>
                                        {summaryCards.map((card) => (
                                            <View key={card.label} style={[styles.summaryCard, isWide && styles.summaryCardWide]}>
                                                <View style={[styles.accentBar, { backgroundColor: card.accent }]} />
                                                <Text style={styles.summaryLabel}>{card.label}</Text>
                                                <Text style={styles.summaryValue}>{card.value}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>

                                <View style={styles.section}>
                                    <Text style={styles.sectionLabel}>HOURLY ACTIVITY</Text>
                                    <View style={styles.sectionPanel}>
                                        <View style={styles.barChart}>
                                            {report.hourlyBreakdown
                                                .filter((h: any) => h.count > 0)
                                                .map((h: any) => {
                                                    const maxCount = Math.max(...report.hourlyBreakdown.map((x: any) => x.count), 1);
                                                    const barHeight = Math.max((h.count / maxCount) * 120, 8);
                                                    return (
                                                        <View key={h.hour} style={styles.barColumn}>
                                                            <Text style={styles.barValue}>{h.count}</Text>
                                                            <View style={[styles.bar, { height: barHeight }]} />
                                                            <Text style={styles.barLabel}>{h.label}</Text>
                                                        </View>
                                                    );
                                                })}
                                            {report.hourlyBreakdown.filter((h: any) => h.count > 0).length === 0 && (
                                                <Text style={styles.emptyText}>No orders recorded in this period.</Text>
                                            )}
                                        </View>
                                    </View>
                                </View>

                                <View style={styles.section}>
                                    <Text style={styles.sectionLabel}>TOP SELLING ITEMS</Text>
                                    <View style={styles.sectionPanel}>
                                        {report.topSelling?.length > 0 ? (
                                            report.topSelling.map((item: any, idx: number) => (
                                                <View key={item.name} style={[styles.listRow, idx < report.topSelling.length - 1 && styles.rowBorder]}>
                                                    <Text style={styles.rankBadge}>#{idx + 1}</Text>
                                                    <View style={styles.listMain}>
                                                        <Text style={styles.listTitle}>{item.name}</Text>
                                                        <Text style={styles.listMeta}>{item.count} sold · Rs. {Number(item.revenue || 0).toFixed(2)} revenue</Text>
                                                    </View>
                                                </View>
                                            ))
                                        ) : (
                                            <Text style={styles.emptyText}>No top-selling items in this period.</Text>
                                        )}
                                    </View>
                                </View>

                                <View style={styles.section}>
                                    <Text style={styles.sectionLabel}>ORDER STATUS BREAKDOWN</Text>
                                    <View style={[styles.statusGrid, isWide && styles.statusGridWide]}>
                                        {Object.entries(report.statusBreakdown || {}).map(([status, count]) => (
                                            <View key={status} style={[styles.statusCard, isWide && styles.statusCardWide]}>
                                                <Text style={styles.statusCount}>{String(count)}</Text>
                                                <Text style={styles.statusLabelText}>{status.replace(/_/g, ' ')}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>

                                <View style={styles.section}>
                                    <Text style={styles.sectionLabel}>RECENT ORDERS</Text>
                                    <View style={styles.sectionPanel}>
                                        {report.orders?.slice(0, 20).map((order: any, index: number) => (
                                            <View key={order.id} style={[styles.orderRow, index < Math.min(report.orders.length, 20) - 1 && styles.rowBorder]}>
                                                <View style={styles.orderMain}>
                                                    <Text style={styles.listTitle}>Table {order.tableNumber || '?'}</Text>
                                                    <Text style={styles.listMeta}>{new Date(order.createdAt).toLocaleTimeString()}</Text>
                                                </View>
                                                <View style={[styles.orderStatusTag, { backgroundColor: getStatusColor(order.status) }]}>
                                                    <Text style={styles.orderStatusText}>{order.status}</Text>
                                                </View>
                                                <Text style={styles.orderAmount}>Rs. {Number(order.totalAmount || 0).toFixed(2)}</Text>
                                            </View>
                                        ))}
                                        {(!report.orders || report.orders.length === 0) && (
                                            <Text style={styles.emptyText}>No recent orders available for this date range.</Text>
                                        )}
                                    </View>
                                </View>
                            </>
                        ) : null}
                    </View>
                </ResponsiveContainer>
            </ScrollView>
        </View>
    );
}

function getStatusColor(status: string) {
    switch (status) {
        case 'RECEIVED': return '#DBEAFE';
        case 'PREPARING': return '#FEF3C7';
        case 'READY': return '#DCFCE7';
        case 'DELIVERED': return '#F3E8FF';
        default: return '#E2E8F0';
    }
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#FFFFFF' },
    scroll: { paddingVertical: 28, backgroundColor: '#FFFFFF' },
    page: { paddingHorizontal: 20 },
    header: { paddingTop: 12, paddingBottom: 28, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 24 },
    badge: { alignSelf: 'flex-start', backgroundColor: '#FFF1EB', borderWidth: 1, borderColor: '#FFD7C8', color: '#C2410C', fontSize: 12, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
    title: { color: '#0F172A', fontSize: 40, fontWeight: '900', lineHeight: 46, marginBottom: 10, maxWidth: 760 },
    subtitle: { color: '#475569', fontSize: 16, lineHeight: 26, maxWidth: 800, fontWeight: '500' },
    filterPanel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', borderTopWidth: 4, borderTopColor: '#0F172A', padding: 24, marginBottom: 28 },
    panelLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '800', letterSpacing: 1.1, marginBottom: 12 },
    filterRow: { flexDirection: 'column' },
    filterRowWide: { flexDirection: 'row', alignItems: 'flex-end' },
    filterField: { marginBottom: 14 },
    filterFieldWide: { flex: 1, marginRight: 16, marginBottom: 0 },
    fieldLabel: { color: '#475569', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 8 },
    input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', color: '#0F172A', fontSize: 16, fontWeight: '500', paddingHorizontal: 16, paddingVertical: 16 },
    primaryButton: { borderWidth: 1, borderColor: '#0F172A', backgroundColor: '#0F172A', paddingHorizontal: 20, paddingVertical: 16, alignItems: 'center' },
    primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    quickRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 },
    quickButton: { borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 16, paddingVertical: 10, marginRight: 10, marginBottom: 10, backgroundColor: '#FFFFFF' },
    quickButtonText: { color: '#0F172A', fontSize: 13, fontWeight: '700' },
    loadingWrap: { alignItems: 'center', paddingVertical: 60 },
    loadingText: { marginTop: 14, color: '#64748B', fontSize: 15, fontWeight: '600' },
    section: { marginBottom: 28 },
    sectionLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '800', letterSpacing: 1.1, marginBottom: 14 },
    summaryGrid: { flexDirection: 'column' },
    summaryGridWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    summaryCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', padding: 20, marginBottom: 16 },
    summaryCardWide: { width: '48.5%' },
    accentBar: { width: 40, height: 4, marginBottom: 12 },
    summaryLabel: { color: '#64748B', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
    summaryValue: { color: '#0F172A', fontSize: 28, fontWeight: '900' },
    sectionPanel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', padding: 20 },
    barChart: { flexDirection: 'row', alignItems: 'flex-end', minHeight: 180, overflow: 'hidden' },
    barColumn: { alignItems: 'center', flex: 1, marginRight: 6 },
    barValue: { color: '#64748B', fontSize: 10, marginBottom: 6, fontWeight: '700' },
    bar: { width: '100%', backgroundColor: '#0F172A', minHeight: 8 },
    barLabel: { color: '#64748B', fontSize: 10, marginTop: 6, textAlign: 'center' },
    listRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    rankBadge: { width: 46, borderWidth: 1, borderColor: '#0F172A', paddingVertical: 8, textAlign: 'center', color: '#0F172A', fontSize: 12, fontWeight: '900', marginRight: 14 },
    listMain: { flex: 1 },
    listTitle: { color: '#0F172A', fontSize: 16, fontWeight: '800', marginBottom: 4 },
    listMeta: { color: '#64748B', fontSize: 14, lineHeight: 22, fontWeight: '500' },
    statusGrid: { flexDirection: 'column' },
    statusGridWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    statusCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DEE7', padding: 18, marginBottom: 12 },
    statusCardWide: { width: '32%' },
    statusCount: { color: '#0F172A', fontSize: 26, fontWeight: '900', marginBottom: 6 },
    statusLabelText: { color: '#475569', fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
    orderRow: { flexDirection: 'column', paddingVertical: 14 },
    orderMain: { marginBottom: 10 },
    orderStatusTag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 },
    orderStatusText: { color: '#0F172A', fontSize: 12, fontWeight: '800' },
    orderAmount: { color: '#0F172A', fontSize: 15, fontWeight: '800' },
    emptyText: { color: '#64748B', fontSize: 14, lineHeight: 22, textAlign: 'center', paddingVertical: 20 },
});
