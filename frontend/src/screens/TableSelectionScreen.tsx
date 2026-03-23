import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView } from 'react-native';
import client from '../api/client';
import ResponsiveContainer from '../components/ResponsiveContainer';
import { Ionicons } from '@expo/vector-icons';

export default function TableSelectionScreen({ route, navigation }: any) {
    const { cafeId } = route.params;

    const [cafeName, setCafeName] = useState('');
    const [tables, setTables] = useState<any[]>([]);
    const [partySize, setPartySize] = useState(2);
    const [loading, setLoading] = useState(true);
    const [selectedTable, setSelectedTable] = useState<string | null>(null);

    useEffect(() => {
        fetchAvailableTables();
    }, [partySize]);

    const fetchAvailableTables = async () => {
        setLoading(true);
        setSelectedTable(null); // Reset selection when party size changes
        try {
            const res = await client.get(`/discover/cafes/${cafeId}/tables?partySize=${partySize}`);
            setCafeName(res.data.cafeName);
            setTables(res.data.tablesAvailable);
        } catch (error: any) {
            const msg = error.response?.data?.error || 'Failed to load tables.';
            Alert.alert('Error', msg);
        } finally {
            setLoading(false);
        }
    };

    const increasePartySize = () => {
        if (partySize < 20) setPartySize(prev => prev + 1);
    };

    const decreasePartySize = () => {
        if (partySize > 1) setPartySize(prev => prev - 1);
    };

    const handleProceedToMenu = () => {
        if (!selectedTable) {
            Alert.alert('Selection Required', 'Please select an available table to proceed.');
            return;
        }

        // Proceed to Customer Menu in "Pre-Order Mode"
        const table = tables.find(t => t.id === selectedTable);
        navigation.navigate('CustomerMenu', { 
            cafeId, 
            tableNumber: table.number,
            tableId: table.id,
            isPreOrderMode: true,
            partySize
        });
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <ResponsiveContainer maxWidth={800}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Reserve at {cafeName}</Text>
                        <Text style={styles.subtitle}>Select your party size to see available tables.</Text>
                    </View>

                    {/* Party Size Selector */}
                    <View style={styles.partyCard}>
                        <Text style={styles.partyLabel}>Party Size</Text>
                        <View style={styles.counterRow}>
                            <TouchableOpacity style={styles.counterBtn} onPress={decreasePartySize}>
                                <Ionicons name="remove" size={24} color="#FF3B30" />
                            </TouchableOpacity>
                            <Text style={styles.partyNumber}>{partySize}</Text>
                            <TouchableOpacity style={styles.counterBtn} onPress={increasePartySize}>
                                <Ionicons name="add" size={24} color="#FF3B30" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <Text style={styles.sectionTitle}>Available Tables</Text>
                    
                    {loading ? (
                        <ActivityIndicator style={{ marginTop: 20 }} size="large" color="#FF3B30" />
                    ) : tables.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyEmoji}>🪑</Text>
                            <Text style={styles.emptyText}>No available tables for a party of {partySize} right now. Try adjusting your party size or check back later.</Text>
                        </View>
                    ) : (
                        <View style={styles.tableGrid}>
                            {tables.map(table => (
                                <TouchableOpacity 
                                    key={table.id}
                                    style={[
                                        styles.tableCard,
                                        selectedTable === table.id && styles.tableCardSelected
                                    ]}
                                    activeOpacity={0.8}
                                    onPress={() => setSelectedTable(table.id)}
                                >
                                    <View style={[styles.cardTop, selectedTable === table.id && styles.cardTopSelected]}>
                                        <Text style={[styles.tableNumber, selectedTable === table.id && styles.textWhite]}>
                                            Table {table.number}
                                        </Text>
                                    </View>
                                    <View style={styles.cardBottom}>
                                        <View style={styles.capacityBadge}>
                                            <Ionicons name="people" size={14} color="#8E8E93" />
                                            <Text style={styles.capacityText}>Fits up to {table.capacity}</Text>
                                        </View>
                                    </View>
                                    {selectedTable === table.id && (
                                        <View style={styles.checkIcon}>
                                            <Ionicons name="checkmark-circle" size={24} color="#34C759" />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </ResponsiveContainer>
            </ScrollView>

            <View style={styles.footer}>
                <ResponsiveContainer maxWidth={800}>
                    <TouchableOpacity 
                        style={[styles.primaryBtn, !selectedTable && styles.primaryBtnDisabled]} 
                        activeOpacity={0.8}
                        onPress={handleProceedToMenu}
                        disabled={!selectedTable}
                    >
                        <Text style={styles.btnTextWhite}>Proceed to Menu</Text>
                        <Ionicons name="arrow-forward" size={20} color="#FFF" style={{ marginLeft: 8 }} />
                    </TouchableOpacity>
                </ResponsiveContainer>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFC' },
    scrollContent: { padding: 20, paddingBottom: 100 },
    header: { marginBottom: 30, marginTop: 10 },
    title: { fontSize: 32, fontWeight: '800', color: '#1C1C1E', letterSpacing: -0.5, marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#8E8E93', fontWeight: '500' },
    
    partyCard: {
        backgroundColor: '#FFFFFF', padding: 20, borderRadius: 20,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 30,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 3,
    },
    partyLabel: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
    counterRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F2F7', borderRadius: 12, padding: 4 },
    counterBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
    partyNumber: { fontSize: 20, fontWeight: '700', width: 40, textAlign: 'center', color: '#1C1C1E' },
    
    sectionTitle: { fontSize: 22, fontWeight: '700', color: '#1C1C1E', marginBottom: 15 },
    
    tableGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15 },
    tableCard: {
        width: '47%', backgroundColor: '#FFFFFF', borderRadius: 16,
        borderWidth: 2, borderColor: 'transparent',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
        overflow: 'hidden'
    },
    tableCardSelected: { borderColor: '#34C759', transform: [{ scale: 1.02 }] },
    cardTop: { padding: 20, alignItems: 'center', backgroundColor: '#F9F9FB', borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
    cardTopSelected: { backgroundColor: '#E2F7E9', borderBottomColor: '#C0EED0' },
    tableNumber: { fontSize: 24, fontWeight: '800', color: '#1C1C1E' },
    textWhite: { color: '#0A7A34' },
    cardBottom: { padding: 12, alignItems: 'center' },
    capacityBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F2F2F7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    capacityText: { fontSize: 12, color: '#8E8E93', fontWeight: '600' },
    checkIcon: { position: 'absolute', top: 10, right: 10 },
    
    emptyState: { alignItems: 'center', marginTop: 40 },
    emptyEmoji: { fontSize: 50, marginBottom: 15 },
    emptyText: { fontSize: 15, color: '#8E8E93', textAlign: 'center', paddingHorizontal: 30, lineHeight: 22 },
    
    footer: {
        position: 'absolute', bottom: 0, width: '100%',
        backgroundColor: '#FFFFFF', padding: 20, paddingBottom: 30,
        borderTopWidth: 1, borderTopColor: '#E5E5EA'
    },
    primaryBtn: { backgroundColor: '#FF3B30', padding: 16, borderRadius: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    primaryBtnDisabled: { backgroundColor: '#FFB3B0' },
    btnTextWhite: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' }
});
