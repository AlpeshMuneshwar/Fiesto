import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import QRCode from 'react-native-qrcode-svg';
import { useWindowDimensions, Platform } from 'react-native';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function AdminDashboardScreen({ navigation }: any) {
    const [stats, setStats] = useState<any>(null);
    const [orders, setOrders] = useState<any[]>([]);
    const [tables, setTables] = useState<any[]>([]);
    const [menu, setMenu] = useState<any[]>([]);
    const [staff, setStaff] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { width } = useWindowDimensions();
    const isWide = width > 768;

    // Modals visibility
    const [qrModalVisible, setQrModalVisible] = useState(false);
    const [menuModalVisible, setMenuModalVisible] = useState(false);
    const [staffModalVisible, setStaffModalVisible] = useState(false);
    const [profileModalVisible, setProfileModalVisible] = useState(false);

    // Selection state for editing
    const [selectedQr, setSelectedQr] = useState('');
    const [selectedTable, setSelectedTable] = useState<any>(null);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [editingStaff, setEditingStaff] = useState<any>(null);

    // Form states
    const [itemForm, setItemForm] = useState({ name: '', price: '', category: '', desc: '' });
    const [staffForm, setStaffForm] = useState({ name: '', email: '', password: '', role: 'WAITER' });
    const [profileForm, setProfileForm] = useState({ name: '', address: '' });

    const fetchData = useCallback(async () => {
        try {
            const storedId = await AsyncStorage.getItem('cafeId');

            // Fetch everything individually to prevent one failure from blocking all
            const wrap = (promise: Promise<any>) => promise.catch(e => {
                const errorMsg = e.response?.data?.error || e.message;
                console.warn("Fetch segment failed:", errorMsg);
                return { data: null, error: errorMsg };
            });

            const [statsRes, ordersRes, tablesRes, menuRes, staffRes] = await Promise.all([
                wrap(client.get('/admin/stats')),
                wrap(client.get('/admin/orders/all')),
                wrap(client.get('/session/tables')),
                wrap(client.get('/menu', { params: { cafeId: storedId } })),
                wrap(client.get('/admin/staff'))
            ]);

            if (statsRes.data) setStats(statsRes.data);
            if (ordersRes.data) setOrders(ordersRes.data || []);
            if (tablesRes.data) setTables(tablesRes.data || []);
            if (menuRes.data) setMenu(menuRes.data || []);
            if (staffRes.data) setStaff(staffRes.data || []);
            
            // If any critical segment failed, we could show a subtle hint, 
            // but for now we focus on the ones that DID succeed.
        } catch (e: any) {
            console.error("Dashboard Sync Fatal Error:", e);
            Alert.alert("Sync Error", "Could not refresh dashboard data. Please check your connection.");
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            fetchData();
            const interval = setInterval(fetchData, 15000); // Background refresh
            return () => clearInterval(interval);
        }, [fetchData])
    );

    const handleSaveProfile = async () => {
        try {
            const res = await client.put('/admin/cafe-profile', profileForm);
            Alert.alert("Success", "Cafe profile updated");
            setProfileModalVisible(false);
            fetchData();
        } catch (e: any) {
            const msg = e.response?.data?.error || "Failed to update profile";
            Alert.alert("Error", msg);
        }
    };

    const toggleCategory = async (category: string, isAvailable: boolean) => {
        try {
            await client.put(`/admin/menu/category/${category}/toggle`, { isAvailable });
            fetchData(); // Refresh everything
            Alert.alert("Success", `${category} is now ${isAvailable ? 'Enabled' : 'Disabled'}`);
        } catch (e: any) {
            const msg = e.response?.data?.error || "Failed to update category status";
            Alert.alert("Error", msg);
        }
    };

    const toggleMenu = async (item: any) => {
        try {
            const res = await client.put(`/menu/${item.id}`, { isAvailable: !item.isAvailable });
            setMenu(prev => prev.map(m => m.id === item.id ? res.data : m));
        } catch (e: any) {
            const msg = e.response?.data?.error || "Failed to update menu status";
            Alert.alert("Error", msg);
        }
    };

    const deleteTable = (id: string) => {
        Alert.alert("Delete Table", "Are you sure? This cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    try {
                        await client.delete(`/session/tables/${id}`);
                        setTables(prev => prev.filter(t => t.id !== id));
                    } catch (e: any) {
                        Alert.alert("Error", e.response?.data?.error || "Failed to delete table");
                    }
                }
            }
        ]);
    };

    const handleSaveItem = async () => {
        try {
            if (!itemForm.name || !itemForm.price || !itemForm.category) {
                Alert.alert("Error", "Please fill all required fields");
                return;
            }

            const data = { ...itemForm, price: parseFloat(itemForm.price) };
            if (editingItem) {
                const res = await client.put(`/menu/${editingItem.id}`, data);
                setMenu(prev => prev.map(m => m.id === editingItem.id ? res.data : m));
            } else {
                const res = await client.post('/menu', data);
                setMenu(prev => [...prev, res.data]);
            }
            setMenuModalVisible(false);
            setEditingItem(null);
            setItemForm({ name: '', price: '', category: '', desc: '' });
        } catch (e: any) {
            const msg = e.response?.data?.error || "Failed to save menu item";
            Alert.alert("Error", msg);
        }
    };

    const deleteMenuItem = (id: string) => {
        Alert.alert("Delete Item", "Are you sure?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    try {
                        await client.delete(`/menu/${id}`);
                        setMenu(prev => prev.filter(m => m.id !== id));
                    } catch (e: any) {
                        const msg = e.response?.data?.error || "Failed to delete item";
                        Alert.alert("Error", msg);
                    }
                }
            }
        ]);
    };

    const handleSaveStaff = async () => {
        try {
            if (!staffForm.name || !staffForm.email || (!editingStaff && !staffForm.password)) {
                Alert.alert("Error", "Please fill all required fields");
                return;
            }

            if (editingStaff) {
                // Future implementation: Update staff
                Alert.alert("Coming Soon", "Staff profile editing will be available soon.");
            } else {
                const res = await client.post('/admin/staff', staffForm);
                setStaff(prev => [...prev, res.data]);
            }
            setStaffModalVisible(false);
            setEditingStaff(null);
            setStaffForm({ name: '', email: '', password: '', role: 'WAITER' });
        } catch (e: any) {
            const msg = e.response?.data?.error || "Failed to save staff member";
            Alert.alert("Error", msg);
        }
    };

    const showQr = (table: any) => {
        if (!table.qrCodeUrl) {
            Alert.alert("No QR", "Regenerate QR for this table first.");
            return;
        }
        setSelectedTable(table);
        setSelectedQr(table.qrCodeUrl);
        setQrModalVisible(true);
    };

    const handleLogout = async () => {
        await AsyncStorage.multiRemove(['userToken', 'userRole', 'cafeId']);
        navigation.replace('Login');
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FFD700" />
                <Text style={styles.loadingText}>Loading Insights...</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
            <StatusBar style="light" />
            <ResponsiveContainer maxWidth={1100}>
                {/* Header */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.greeting}>Admin Hub</Text>
                        <Text style={styles.subGreeting}>Real-time Cafe Insights</Text>
                    </View>
                    <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                        <Text style={styles.logoutText}>Logout</Text>
                    </TouchableOpacity>
                </View>

                {/* Stats Cards */}
                <View style={[styles.statsContainer, isWide && { flexWrap: 'wrap', justifyContent: 'flex-start' }]}>
                    <View style={[styles.card, styles.glassCard, isWide && { width: '23%', margin: '1%' }]}>
                        <Text style={styles.cardLabel}>Today's Revenue</Text>
                        <Text style={styles.cardValue}>${stats?.today?.revenue.toFixed(2)}</Text>
                        <View style={styles.trendContainer}>
                            <Text style={styles.trendText}>Tracking Daily Revenue</Text>
                        </View>
                    </View>

                    <View style={[styles.card, styles.glassCard, isWide && { width: '23%', margin: '1%' }]}>
                        <Text style={styles.cardLabel}>Orders Today</Text>
                        <Text style={styles.cardValue}>{stats?.today?.totalOrders}</Text>
                        <View style={styles.trendContainer}>
                            <Text style={styles.trendText}>Active Sessions: {stats?.activeSessions}</Text>
                        </View>
                    </View>

                    {isWide && (
                        <>
                            <View style={[styles.card, styles.glassCard, { width: '23%', margin: '1%' }]}>
                                <Text style={styles.cardLabel}>Tables Active</Text>
                                <Text style={styles.cardValue}>{tables.length}</Text>
                                <Text style={styles.trendText}>Across all zones</Text>
                            </View>
                            <View style={[styles.card, styles.glassCard, { width: '23%', margin: '1%' }]}>
                                <Text style={styles.cardLabel}>Staff Online</Text>
                                <Text style={styles.cardValue}>{staff.length}</Text>
                                <Text style={styles.trendText}>Ready to serve</Text>
                            </View>
                        </>
                    )}
                </View>


                {/* Top Selling Section */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Top Selling Items</Text>
                </View>
                <View style={stats?.topSelling?.length > 0 ? [styles.listCard, styles.glassCard] : {}}>
                    {stats?.topSelling?.map((item: any, index: number) => (
                        <View key={item.name} style={[styles.listItem, index === stats.topSelling.length - 1 && { borderBottomWidth: 0 }]}>
                            <Text style={styles.itemName}>{item.name}</Text>
                            <View style={styles.itemBadge}>
                                <Text style={styles.itemCount}>{item.count} orders</Text>
                            </View>
                        </View>
                    ))}
                </View>


                {/* Management Grid */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Management Hub</Text>
                </View>
                <View style={styles.managementGrid}>
                    <TouchableOpacity
                        style={[styles.manageCard, styles.glassCard]}
                        onPress={() => navigation.navigate('AdminTableManagement')}
                    >
                        <View style={styles.iconCircle}><Text style={styles.iconText}>🪑</Text></View>
                        <Text style={styles.manageTitle}>Tables</Text>
                        <Text style={styles.manageSub}>{tables.length} Active</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.manageCard, styles.glassCard]}
                        onPress={() => navigation.navigate('AdminMenuManagement')}
                    >
                        <View style={[styles.iconCircle, { backgroundColor: '#A855F7' }]}><Text style={styles.iconText}>📖</Text></View>
                        <Text style={styles.manageTitle}>Menu</Text>
                        <Text style={styles.manageSub}>{menu.length} Items</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.manageCard, styles.glassCard]}
                        onPress={() => navigation.navigate('AdminStaffManagement')}
                    >
                        <View style={[styles.iconCircle, { backgroundColor: '#F59E0B' }]}><Text style={styles.iconText}>👥</Text></View>
                        <Text style={styles.manageTitle}>Staff</Text>
                        <Text style={styles.manageSub}>{staff.length} Members</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.manageCard, styles.glassCard]}
                        onPress={() => navigation.navigate('AdminSettings')}
                    >
                        <View style={[styles.iconCircle, { backgroundColor: '#10B981' }]}><Text style={styles.iconText}>⚙️</Text></View>
                        <Text style={styles.manageTitle}>Settings</Text>
                        <Text style={styles.manageSub}>Configure</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.manageCard, styles.glassCard]}
                        onPress={() => navigation.navigate('AdminReports')}
                    >
                        <View style={[styles.iconCircle, { backgroundColor: '#EF4444' }]}><Text style={styles.iconText}>📊</Text></View>
                        <Text style={styles.manageTitle}>Reports</Text>
                        <Text style={styles.manageSub}>Sales & Analytics</Text>
                    </TouchableOpacity>
                </View>

                {/* Cafe Profile */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Cafe Profile</Text>
                    <TouchableOpacity onPress={() => {
                        setProfileForm({ name: stats?.cafeName || '', address: stats?.cafeAddress || '' });
                        setProfileModalVisible(true);
                    }}>
                        <Text style={styles.refreshText}>Edit Settings</Text>
                    </TouchableOpacity>
                </View>
                <View style={[styles.listCard, styles.glassCard, { padding: 20 }]}>
                    <Text style={styles.itemName}>{stats?.cafeName || 'Cafe Name Not Set'}</Text>
                    <Text style={{ color: '#94A3B8', marginTop: 5 }}>{stats?.cafeAddress || 'Address not set'}</Text>
                </View>

                {/* Recent Global Orders */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Recent Orders</Text>
                    <TouchableOpacity onPress={fetchData}>
                        <Text style={styles.refreshText}>Refresh</Text>
                    </TouchableOpacity>
                </View>

                <View style={[styles.listCard, styles.glassCard]}>
                    {orders.slice(0, 5).map((order: any) => (
                        <View key={order.id} style={styles.orderItem}>
                            <View style={styles.orderHeader}>
                                <Text style={styles.tableLabel}>Table {order.session.table.number}</Text>
                                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) }]}>
                                    <Text style={styles.statusText}>{order.status}</Text>
                                </View>
                            </View>
                            <Text style={styles.orderTime}>{new Date(order.createdAt).toLocaleTimeString()} • ${order.totalAmount.toFixed(2)}</Text>
                        </View>
                    ))}
                    {orders.length === 0 && <Text style={{ color: '#64748B', padding: 20, textAlign: 'center' }}>No orders yet today</Text>}
                </View>

                {/* Modals */}
                <Modal visible={qrModalVisible} transparent animationType="slide">
                    <View style={styles.modalBg}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Table {selectedTable?.number} QR Code</Text>
                            <View style={styles.qrContainer}>
                                <QRCode value={selectedQr} size={220} />
                            </View>
                            <Text style={styles.qrUrl}>{selectedQr}</Text>
                            <TouchableOpacity style={styles.closeBtn} onPress={() => setQrModalVisible(false)}>
                                <Text style={styles.closeBtnText}>Close</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                {/* Menu Item Modal */}
                <Modal visible={menuModalVisible} transparent animationType="slide">
                    <View style={styles.modalBg}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>{editingItem ? 'Edit Item' : 'New Menu Item'}</Text>
                            <TextInput style={styles.input} placeholder="Item Name" placeholderTextColor="#64748B" value={itemForm.name} onChangeText={(val) => setItemForm({ ...itemForm, name: val })} />
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <TextInput style={[styles.input, { width: '48%' }]} placeholder="Price" placeholderTextColor="#64748B" keyboardType="decimal-pad" value={itemForm.price} onChangeText={(val) => setItemForm({ ...itemForm, price: val })} />
                                <TextInput style={[styles.input, { width: '48%' }]} placeholder="Category" placeholderTextColor="#64748B" value={itemForm.category} onChangeText={(val) => setItemForm({ ...itemForm, category: val })} />
                            </View>
                            <TextInput style={[styles.input, { height: 80 }]} placeholder="Description" placeholderTextColor="#64748B" multiline value={itemForm.desc} onChangeText={(val) => setItemForm({ ...itemForm, desc: val })} />

                            <View style={styles.modalActions}>
                                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMenuModalVisible(false)}>
                                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveItem}>
                                    <Text style={styles.primaryBtnText}>Save Item</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* Staff Modal */}
                <Modal visible={staffModalVisible} transparent animationType="slide">
                    <View style={styles.modalBg}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>New Staff Member</Text>
                            <TextInput style={styles.input} placeholder="Name" placeholderTextColor="#64748B" value={staffForm.name} onChangeText={(val) => setStaffForm({ ...staffForm, name: val })} />
                            <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#64748B" keyboardType="email-address" value={staffForm.email} onChangeText={(val) => setStaffForm({ ...staffForm, email: val })} />
                            <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#64748B" secureTextEntry value={staffForm.password} onChangeText={(val) => setStaffForm({ ...staffForm, password: val })} />

                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                                {['WAITER', 'CHEF'].map(role => (
                                    <TouchableOpacity
                                        key={role}
                                        style={[styles.roleTab, staffForm.role === role && styles.roleTabActive]}
                                        onPress={() => setStaffForm({ ...staffForm, role })}
                                    >
                                        <Text style={[styles.roleTabText, staffForm.role === role && styles.roleTabTextActive]}>{role}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={styles.modalActions}>
                                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStaffModalVisible(false)}>
                                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveStaff}>
                                    <Text style={styles.primaryBtnText}>Create Account</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* Profile Modal */}
                <Modal visible={profileModalVisible} transparent animationType="slide">
                    <View style={styles.modalBg}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Edit Cafe Profile</Text>
                            <TextInput style={styles.input} placeholder="Cafe Name" placeholderTextColor="#64748B" value={profileForm.name} onChangeText={(val) => setProfileForm({ ...profileForm, name: val })} />
                            <TextInput style={[styles.input, { height: 80 }]} placeholder="Address" placeholderTextColor="#64748B" multiline value={profileForm.address} onChangeText={(val) => setProfileForm({ ...profileForm, address: val })} />

                            <View style={styles.modalActions}>
                                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setProfileModalVisible(false)}>
                                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveProfile}>
                                    <Text style={styles.primaryBtnText}>Update Profile</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </ResponsiveContainer>
        </ScrollView>
    );
}

const getStatusColor = (status: string) => {
    switch (status) {
        case 'RECEIVED': return '#3498DB';
        case 'PREPARING': return '#F1C40F';
        case 'READY': return '#2ECC71';
        case 'COMPLETED': return '#27AE60';
        case 'REJECTED': return '#E74C3C';
        default: return '#95A5A6';
    }
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
    loadingContainer: { flex: 1, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center' },
    loadingText: { color: '#94A3B8', marginTop: 10, fontSize: 16 },
    header: { padding: 30, paddingTop: 60, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    greeting: { color: 'white', fontSize: 32, fontWeight: '800' },
    subGreeting: { color: '#94A3B8', fontSize: 16, marginTop: 4 },
    logoutBtn: { backgroundColor: 'rgba(239, 68, 68, 0.2)', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    logoutText: { color: '#F87171', fontWeight: '600' },
    statsContainer: { flexDirection: 'row', paddingHorizontal: 20, justifyContent: 'space-between' },
    card: { width: '47%', padding: 20, borderRadius: 24 },
    glassCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.7)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)',
        ...Platform.select({
            web: { boxShadow: '0 4px 6px rgba(0,0,0,0.1)' },
            default: {}
        })
    },
    cardLabel: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
    cardValue: { color: 'white', fontSize: 24, fontWeight: '800', marginTop: 10 },
    trendContainer: { marginTop: 15 },
    trendText: { color: '#2DD4BF', fontSize: 12, fontWeight: '500' },
    sectionHeader: { paddingHorizontal: 30, marginTop: 40, marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { color: 'white', fontSize: 20, fontWeight: '700' },
    refreshText: { color: '#38BDF8', fontWeight: '600' },
    listCard: { marginHorizontal: 20, paddingHorizontal: 20, borderRadius: 24 },
    listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.05)' },
    itemName: { color: '#F1F5F9', fontSize: 16, fontWeight: '600' },
    itemBadge: { backgroundColor: 'rgba(56, 189, 248, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    itemCount: { color: '#38BDF8', fontSize: 12, fontWeight: '700' },
    orderItem: { paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.05)' },
    orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    tableLabel: { color: 'white', fontSize: 16, fontWeight: '700' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText: { color: 'white', fontSize: 10, fontWeight: '800' },
    orderTime: { color: '#64748B', fontSize: 13, marginTop: 4 },
    orderAmount: { color: '#94A3B8', fontSize: 14, marginTop: 4, fontWeight: '600' },
    managementContainer: { flexDirection: 'row', padding: 20, marginTop: 20, justifyContent: 'space-between' },
    manageBtn: { backgroundColor: '#334155', width: '48%', padding: 20, borderRadius: 20, alignItems: 'center' },
    manageBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
    qrBtn: { backgroundColor: 'transparent', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#38BDF8' },
    qrBtnText: { color: '#38BDF8', fontWeight: '700', fontSize: 12 },
    toggleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    input: { backgroundColor: 'rgba(30, 41, 59, 0.5)', color: 'white', padding: 15, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: '#0F172A', width: '90%', padding: 25, borderRadius: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    modalTitle: { color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 20 },
    modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
    primaryBtn: { backgroundColor: '#38BDF8', paddingVertical: 15, paddingHorizontal: 25, borderRadius: 16, flex: 1, marginLeft: 10, alignItems: 'center' },
    primaryBtnText: { color: '#0F172A', fontWeight: '800', fontSize: 16 },
    secondaryBtn: { backgroundColor: 'rgba(148, 163, 184, 0.1)', paddingVertical: 15, paddingHorizontal: 25, borderRadius: 16, flex: 1, alignItems: 'center' },
    secondaryBtnText: { color: '#94A3B8', fontWeight: '700', fontSize: 16 },
    qrContainer: { padding: 20, backgroundColor: 'white', borderRadius: 24, marginBottom: 20, alignSelf: 'center' },
    qrUrl: { color: '#64748B', fontSize: 11, textAlign: 'center', marginBottom: 25 },
    closeBtn: { backgroundColor: '#1E293B', paddingHorizontal: 40, paddingVertical: 15, borderRadius: 20, alignSelf: 'center' },
    closeBtnText: { color: 'white', fontWeight: '700' },
    roleTab: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: 'rgba(148, 163, 184, 0.05)', alignItems: 'center' },
    roleTabActive: { backgroundColor: 'rgba(56, 189, 248, 0.15)', borderWidth: 1, borderColor: 'rgba(56, 189, 248, 0.3)' },
    roleTabText: { color: '#64748B', fontWeight: '700' },
    roleTabTextActive: { color: '#38BDF8' },
    categoryBadge: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12, marginRight: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    managementGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, justifyContent: 'space-between' },
    manageCard: { width: '48%', padding: 20, borderRadius: 24, alignItems: 'center', marginBottom: 15 },
    iconCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#38BDF8', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    iconText: { fontSize: 24 },
    manageTitle: { color: 'white', fontSize: 16, fontWeight: '700' },
    manageSub: { color: '#94A3B8', fontSize: 12, marginTop: 4 }
});
