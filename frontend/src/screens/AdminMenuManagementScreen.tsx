import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, SafeAreaView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import { StatusBar } from 'expo-status-bar';
import ResponsiveContainer from '../components/ResponsiveContainer';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

export default function AdminMenuManagementScreen({ navigation }: any) {
    const [menu, setMenu] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [form, setForm] = useState({ name: '', price: '', category: '', desc: '' });
    
    // Bulk Upload State
    const [bulkModalVisible, setBulkModalVisible] = useState(false);
    const [bulkItems, setBulkItems] = useState<any[]>([]);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        fetchMenu();
    }, []);

    const fetchMenu = async () => {
        try {
            const storedId = await AsyncStorage.getItem('cafeId');
            const res = await client.get('/menu', { params: { cafeId: storedId } });
            setMenu(res.data);
        } catch (e) {
            Alert.alert("Error", "Failed to fetch menu");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!form.name || !form.price || !form.category) {
            Alert.alert("Error", "Required fields missing");
            return;
        }
        try {
            const data = { ...form, price: parseFloat(form.price) };
            if (editingItem) {
                const res = await client.put(`/menu/${editingItem.id}`, data);
                setMenu(prev => prev.map(m => m.id === editingItem.id ? res.data : m));
                Alert.alert("Success", "Menu item updated successfully.");
            } else {
                const res = await client.post('/menu', data);
                setMenu(prev => [...prev, res.data]);
                Alert.alert("Success", "New menu item added successfully.");
            }
            setModalVisible(false);
            setEditingItem(null);
            setForm({ name: '', price: '', category: '', desc: '' });
        } catch (e: any) {
            const details = e.response?.data?.details;
            if (details && Array.isArray(details)) {
                const combinedMsg = details.map((d: any) => `${d.field}: ${d.message}`).join('\n');
                Alert.alert("Save Failed", combinedMsg);
            } else {
                Alert.alert("Error", e.response?.data?.error || "Save failed");
            }
        }
    };

    const toggleAvailability = async (item: any) => {
        try {
            const res = await client.put(`/menu/${item.id}`, { isAvailable: !item.isAvailable });
            setMenu(prev => prev.map(m => m.id === item.id ? res.data : m));
        } catch (e: any) {
            Alert.alert("Error", e.response?.data?.error || "Status update failed");
        }
    };

    const toggleCategory = async (category: string, currentStatus: boolean) => {
        try {
            await client.put(`/admin/menu/category/${category}/toggle`, { isAvailable: !currentStatus });
            fetchMenu();
        } catch (e) {
            Alert.alert("Error", "Category toggle failed");
        }
    };

    const deleteItem = (id: string) => {
        Alert.alert("Delete Item", "Are you sure?", [
            { text: "Cancel" },
            {
                text: "Delete", style: 'destructive', onPress: async () => {
                    await client.delete(`/menu/${id}`);
                    setMenu(prev => prev.filter(m => m.id !== id));
                }
            }
        ]);
    };
    
    const handleCSVUpload = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({ type: 'text/csv' });
            if (result.canceled) return;

            setProcessing(true);
            const formData = new FormData();
            formData.append('file', {
                uri: result.assets[0].uri,
                name: result.assets[0].name,
                type: 'text/csv',
            } as any);

            const res = await client.post('/menu/bulk-csv', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            setBulkItems(res.data.suggestedItems);
            setBulkModalVisible(true);
        } catch (e: any) {
            Alert.alert("Upload Error", e.response?.data?.error || "Failed to process CSV");
        } finally {
            setProcessing(false);
        }
    };

    const handleImageScan = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 1,
            });

            if (result.canceled) return;

            setProcessing(true);
            const formData = new FormData();
            formData.append('image', {
                uri: result.assets[0].uri,
                name: 'menu_scan.jpg',
                type: 'image/jpeg',
            } as any);

            const res = await client.post('/menu/extract-image', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            if (res.data.suggestedItems.length === 0) {
                Alert.alert("No Items Found", "Could not extract menu items from this image. Please ensure text is clear.");
                return;
            }

            setBulkItems(res.data.suggestedItems);
            setBulkModalVisible(true);
        } catch (e: any) {
            Alert.alert("Scan Error", e.response?.data?.error || "Failed to scan image");
        } finally {
            setProcessing(false);
        }
    };

    const saveBulkItems = async () => {
        try {
            setProcessing(true);
            await client.post('/menu/bulk-save', { items: bulkItems });
            setBulkModalVisible(false);
            Alert.alert("Success", `${bulkItems.length} items added to menu`);
            fetchMenu();
        } catch (e: any) {
            Alert.alert("Save Error", e.response?.data?.error || "Bulk save failed");
        } finally {
            setProcessing(false);
        }
    };

    const updateBulkItem = (index: number, field: string, value: string) => {
        const newItems = [...bulkItems];
        if (field === 'price') {
            newItems[index][field] = parseFloat(value) || 0;
        } else {
            newItems[index][field] = value;
        }
        setBulkItems(newItems);
    };

    const removeBulkItem = (index: number) => {
        setBulkItems(prev => prev.filter((_, i) => i !== index));
    };

    const categories = Array.from(new Set(menu.map(m => m.category)));

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#38BDF8" /></View>;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />
            <ScrollView contentContainerStyle={{ padding: 20 }}>
                <ResponsiveContainer maxWidth={800}>
                    <View style={styles.headerRow}>
                        <Text style={styles.title}>Menu Management</Text>
                        <TouchableOpacity style={styles.addBtn} onPress={() => { setEditingItem(null); setForm({ name: '', price: '', category: '', desc: '' }); setModalVisible(true); }}>
                            <Text style={styles.addBtnText}>+ New</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.bulkActions}>
                        <TouchableOpacity style={styles.bulkBtn} onPress={handleCSVUpload} disabled={processing}>
                            <Text style={styles.bulkBtnText}>📄 Upload CSV</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.bulkBtn} onPress={handleImageScan} disabled={processing}>
                            <Text style={styles.bulkBtnText}>📸 Scan Menu</Text>
                        </TouchableOpacity>
                    </View>

                    {processing && <ActivityIndicator style={{ marginBottom: 20 }} color="#38BDF8" />}

                    {categories.map(cat => {
                        const items = menu.filter(m => m.category === cat);
                        const allAvailable = items.every(i => i.isAvailable);
                        return (
                            <View key={cat} style={styles.catSection}>
                                <View style={styles.catHeader}>
                                    <Text style={styles.catTitle}>{cat}</Text>
                                    <TouchableOpacity
                                        style={[styles.catToggle, allAvailable ? styles.bgLive : styles.bgOff]}
                                        onPress={() => toggleCategory(cat, allAvailable)}
                                    >
                                        <Text style={styles.toggleText}>{allAvailable ? 'Category Live' : 'Category Off'}</Text>
                                    </TouchableOpacity>
                                </View>
                                {items.map(item => (
                                    <View key={item.id} style={styles.itemCard}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.itemName}>{item.name}</Text>
                                            <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>
                                        </View>
                                        <View style={styles.itemActions}>
                                            <TouchableOpacity
                                                style={[styles.statusBadge, item.isAvailable ? styles.bgLive : styles.bgOff]}
                                                onPress={() => toggleAvailability(item)}
                                            >
                                                <Text style={styles.statusText}>{item.isAvailable ? 'Live' : 'Out'}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.editBtn} onPress={() => { setEditingItem(item); setForm({ name: item.name, price: item.price.toString(), category: item.category, desc: item.desc || '' }); setModalVisible(true); }}>
                                                <Text style={styles.editText}>Edit</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => deleteItem(item.id)}>
                                                <Text style={styles.delText}>Del</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        );
                    })}
                </ResponsiveContainer>
            </ScrollView>

            <Modal visible={modalVisible} transparent animationType="slide">
                <View style={styles.modalBg}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{editingItem ? 'Edit Item' : 'New Menu Item'}</Text>
                        <TextInput style={styles.input} placeholder="Item Name" placeholderTextColor="#64748B" value={form.name} onChangeText={v => setForm({ ...form, name: v })} />
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Price" placeholderTextColor="#64748B" keyboardType="decimal-pad" value={form.price} onChangeText={v => setForm({ ...form, price: v })} />
                            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Category" placeholderTextColor="#64748B" value={form.category} onChangeText={v => setForm({ ...form, category: v })} />
                        </View>
                        <TextInput style={[styles.input, { height: 80 }]} placeholder="Description" placeholderTextColor="#64748B" multiline value={form.desc} onChangeText={v => setForm({ ...form, desc: v })} />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}><Text style={styles.saveText}>Save Item</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Bulk Review Modal */}
            <Modal visible={bulkModalVisible} transparent animationType="slide">
                <View style={styles.modalBg}>
                    <View style={[styles.modalContent, { maxHeight: '80%', width: '95%' }]}>
                        <Text style={styles.modalTitle}>Review Extracted Items</Text>
                        <Text style={styles.subText}>Confirm or edit the items found before saving.</Text>
                        
                        <ScrollView style={{ marginVertical: 15 }}>
                            {bulkItems.map((item, idx) => (
                                <View key={idx} style={styles.bulkItemRow}>
                                    <TextInput 
                                        style={[styles.input, { flex: 2, marginBottom: 0 }]} 
                                        value={item.name} 
                                        onChangeText={v => updateBulkItem(idx, 'name', v)} 
                                    />
                                    <TextInput 
                                        style={[styles.input, { flex: 0.8, marginBottom: 0 }]} 
                                        value={item.price.toString()} 
                                        keyboardType="decimal-pad"
                                        onChangeText={v => updateBulkItem(idx, 'price', v)} 
                                    />
                                    <TouchableOpacity onPress={() => removeBulkItem(idx)}>
                                        <Text style={{ color: '#F87171', fontWeight: '800', marginLeft: 10 }}>X</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </ScrollView>

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setBulkModalVisible(false)}>
                                <Text style={styles.cancelText}>Discard</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={saveBulkItems} disabled={processing}>
                                {processing ? <ActivityIndicator color="#0F172A" /> : <Text style={styles.saveText}>Save All ({bulkItems.length})</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
    center: { flex: 1, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center' },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
    title: { color: 'white', fontSize: 28, fontWeight: '800' },
    addBtn: { backgroundColor: '#38BDF8', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12 },
    addBtnText: { color: '#0F172A', fontWeight: '800' },
    catSection: { marginBottom: 30 },
    catHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    catTitle: { color: '#38BDF8', fontSize: 20, fontWeight: '800' },
    catToggle: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    itemCard: { flexDirection: 'row', backgroundColor: '#1E293B', padding: 15, borderRadius: 16, marginBottom: 10, alignItems: 'center' },
    itemName: { color: 'white', fontSize: 16, fontWeight: '600' },
    itemPrice: { color: '#94A3B8', fontSize: 14, marginTop: 2 },
    itemActions: { flexDirection: 'row', alignItems: 'center', gap: 15 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    bgLive: { backgroundColor: 'rgba(45, 212, 191, 0.1)' },
    bgOff: { backgroundColor: 'rgba(248, 113, 113, 0.1)' },
    statusText: { color: '#2DD4BF', fontSize: 12, fontWeight: '800' },
    toggleText: { color: '#2DD4BF', fontSize: 11, fontWeight: '700' },
    editBtn: { backgroundColor: 'rgba(56, 189, 248, 0.1)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
    editText: { color: '#38BDF8', fontWeight: '700', fontSize: 12 },
    delText: { color: '#F87171', fontWeight: '700', fontSize: 12 },
    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: '#0F172A', padding: 25, borderRadius: 24, width: '90%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    modalTitle: { color: 'white', fontSize: 22, fontWeight: '800', marginBottom: 20 },
    input: { backgroundColor: '#1E293B', color: 'white', padding: 15, borderRadius: 12, marginBottom: 15 },
    modalButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
    cancelBtn: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center', backgroundColor: '#334155' },
    cancelText: { color: '#94A3B8', fontWeight: '700' },
    saveBtn: { flex: 2, padding: 15, borderRadius: 12, alignItems: 'center', backgroundColor: '#38BDF8' },
    saveText: { color: '#0F172A', fontWeight: '800' },
    bulkActions: { flexDirection: 'row', gap: 10, marginBottom: 25 },
    bulkBtn: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center' },
    bulkBtnText: { color: '#CBD5E1', fontWeight: '600', fontSize: 13 },
    subText: { color: '#94A3B8', fontSize: 14, marginBottom: 10 },
    bulkItemRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.02)', padding: 5, borderRadius: 8 }
});
