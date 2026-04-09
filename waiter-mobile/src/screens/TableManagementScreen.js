import React, { useState, useEffect, useCallback } from 'react';
import { 
    View, 
    Text, 
    StyleSheet, 
    FlatList, 
    TouchableOpacity, 
    ActivityIndicator, 
    Alert, 
    RefreshControl,
    Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { 
    ChevronLeft, 
    Users, 
    Hash, 
    Key, 
    Trash2, 
    RefreshCw, 
    CheckCircle2, 
    Circle
} from 'lucide-react-native';
import client from '../api/client';
import * as Haptics from 'expo-haptics';

const TableManagementScreen = ({ navigation }) => {
    const [tables, setTables] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);

    const fetchTables = useCallback(async () => {
        try {
            const response = await client.get('/table-management/status');
            setTables(response.data);
        } catch (error) {
            console.error('[Fetch Tables Error]', error);
            Alert.alert('Error', 'Failed to fetch table status');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchTables();
    }, [fetchTables]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchTables();
    };

    const handleClearTable = (tableId, tableNumber) => {
        Alert.alert(
            'Clear Table',
            `Are you sure you want to end all active sessions for Table ${tableNumber}? Any unpaid orders will remain recorded but the table will be marked as Available.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { 
                    text: 'Clear Table', 
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setActionLoading(tableId);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                            await client.post(`/table-management/clear/${tableId}`);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            fetchTables(); // Refresh list
                        } catch (error) {
                            Alert.alert('Error', 'Failed to clear table');
                        } finally {
                            setActionLoading(null);
                        }
                    }
                }
            ]
        );
    };

    const renderTableItem = ({ item }) => {
        const activeSession = item.sessions && item.sessions[0];
        const isOccupied = !!activeSession;

        return (
            <View style={[styles.tableCard, isOccupied ? styles.occupiedCard : styles.availableCard]}>
                <View style={styles.cardHeader}>
                    <View style={styles.tableNumBadge}>
                        <Text style={styles.tableNumText}>{item.number}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: isOccupied ? '#FDF4FF' : '#F3F4F6' }]}>
                        <Text style={[styles.statusText, { color: isOccupied ? '#A21CAF' : '#4B5563' }]}>
                            {isOccupied ? 'Occupied' : 'Available'}
                        </Text>
                    </View>
                </View>

                <View style={styles.capacityRow}>
                    <Users size={14} color="#6B7280" />
                    <Text style={styles.capacityText}>Seats {item.capacity}</Text>
                </View>

                {isOccupied ? (
                    <View style={styles.occupiedContent}>
                        <View style={styles.codeContainer}>
                            <Key size={14} color="#A21CAF" />
                            <Text style={styles.codeLabel}>Join Code:</Text>
                            <Text style={styles.codeValue}>{activeSession.joinCode || 'N/A'}</Text>
                        </View>
                        
                        <TouchableOpacity 
                            style={styles.clearBtn} 
                            onPress={() => handleClearTable(item.id, item.number)}
                            disabled={actionLoading === item.id}
                        >
                            {actionLoading === item.id ? (
                                <ActivityIndicator size="small" color="white" />
                            ) : (
                                <>
                                    <Trash2 size={14} color="white" />
                                    <Text style={styles.clearBtnText}>Clear Table</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.availableContent}>
                        <CheckCircle2 size={24} color="#10B981" style={{ opacity: 0.2, marginBottom: 8 }} />
                        <Text style={styles.availableMsg}>Ready for guests</Text>
                    </View>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
            <StatusBar style="dark" />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft size={24} color="#1E293B" />
                </TouchableOpacity>
                <View>
                    <Text style={styles.title}>Table Management</Text>
                    <Text style={styles.subtitle}>View passwords and clear tables</Text>
                </View>
                <TouchableOpacity onPress={onRefresh} style={styles.headerRefresh}>
                    <RefreshCw size={20} color="#64748B" />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#6366F1" />
                    <Text style={styles.loadingText}>Loading floor plan...</Text>
                </View>
            ) : (
                <FlatList
                    data={tables}
                    renderItem={renderTableItem}
                    keyExtractor={item => item.id}
                    numColumns={2}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />
                    }
                    ListEmptyComponent={
                        <View style={styles.centered}>
                            <Circle size={48} color="#CBD5E1" />
                            <Text style={styles.emptyText}>No tables found.</Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
    },
    headerRefresh: {
        marginLeft: 'auto',
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 20,
        fontWeight: '800',
        color: '#1E293B',
    },
    subtitle: {
        fontSize: 12,
        color: '#64748B',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    loadingText: {
        marginTop: 15,
        color: '#64748B',
        fontSize: 14,
    },
    listContent: {
        padding: 10,
    },
    tableCard: {
        flex: 1,
        margin: 8,
        borderRadius: 16,
        padding: 15,
        backgroundColor: 'white',
        minHeight: 160,
        // Shadow for premium feel
        ...Platform.select({
            ios: {
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
            },
            android: {
                elevation: 3,
            }
        }),
    },
    occupiedCard: {
        borderWidth: 1.5,
        borderColor: '#F0ABFC',
    },
    availableCard: {
        borderWidth: 1,
        borderColor: '#E2E8F0',
        opacity: 0.9,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    tableNumBadge: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    tableNumText: {
        fontSize: 16,
        fontWeight: '800',
        color: '#1E293B',
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    statusText: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    capacityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 15,
    },
    capacityText: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '500',
    },
    occupiedContent: {
        marginTop: 'auto',
    },
    codeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FDF4FF',
        padding: 8,
        borderRadius: 8,
        gap: 6,
        marginBottom: 12,
    },
    codeLabel: {
        fontSize: 11,
        color: '#A21CAF',
        fontWeight: '600',
    },
    codeValue: {
        fontSize: 14,
        fontWeight: '800',
        color: '#701A75',
    },
    clearBtn: {
        backgroundColor: '#EF4444',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 10,
        gap: 8,
    },
    clearBtnText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '700',
    },
    availableContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
    },
    availableMsg: {
        fontSize: 12,
        color: '#94A3B8',
        fontStyle: 'italic',
    },
    emptyText: {
        marginTop: 15,
        color: '#94A3B8',
        fontSize: 14,
    }
});

export default TableManagementScreen;
