import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, SafeAreaView, Platform, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client, { API_BASE_URL } from '../api/client';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import ResponsiveContainer from '../components/ResponsiveContainer';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useWindowDimensions } from 'react-native';

export default function AdminMenuManagementScreen({ navigation }: any) {
    const { width } = useWindowDimensions();
    const isDesktop = width > 768;
    const isSmallMobile = width < 480;

    const [menu, setMenu] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [form, setForm] = useState({ name: '', price: '', category: '', desc: '', isAvailable: true, isActive: true });
    const [categorySearch, setCategorySearch] = useState('');
    const [catProcessing, setCatProcessing] = useState(false);
    const [isCatSelected, setIsCatSelected] = useState(false);
    const [sessionNewCategories, setSessionNewCategories] = useState<string[]>([]);
    
    // Bulk Upload State
    const [bulkModalVisible, setBulkModalVisible] = useState(false);
    const [bulkItems, setBulkItems] = useState<any[]>([]);
    const [processing, setProcessing] = useState(false);
    const [hideDuplicates, setHideDuplicates] = useState(false);
    
    // Global Search
    const [searchQuery, setSearchQuery] = useState('');

    const fetchMenu = useCallback(async () => {
        try {
            const storedId = await AsyncStorage.getItem('cafeId');
            const res = await client.get('/menu', { params: { cafeId: storedId } });
            setMenu(res.data);
        } catch (e) {
            console.error("Fetch menu failed");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMenu();
    }, [fetchMenu]);

    const handleSave = async () => {
        const finalCategory = categorySearch.trim();
        
        if (!form.name || !form.price || !finalCategory) {
            Alert.alert("Required Fields", "Item Name, Price, and Category are mandatory.");
            return;
        }
        
        try {
            setProcessing(true);
            const payload = {
                name: String(form.name).trim(),
                price: parseFloat(String(form.price)),
                category: finalCategory,
                desc: String(form.desc || '').trim(),
                isAvailable: form.isAvailable,
                isActive: form.isActive
            };

            if (isNaN(payload.price)) {
                Alert.alert("Invalid Price", "Please enter a valid numeric price.");
                return;
            }

            if (editingItem) {
                const res = await client.put(`/menu/${editingItem.id}`, payload);
                setMenu(prev => prev.map(m => m.id === editingItem.id ? res.data : m));
            } else {
                const res = await client.post('/menu', payload);
                setMenu(prev => [...prev, res.data]);
            }
            
            setModalVisible(false);
            setEditingItem(null);
            setForm({ name: '', price: '', category: '', desc: '', isAvailable: true, isActive: true });
            setCategorySearch('');
        } catch (e: any) {
            const details = e.response?.data?.details;
            if (details && Array.isArray(details)) {
                const msg = details.map((d: any) => `• ${d.field}: ${d.message}`).join('\n');
                Alert.alert("Validation Error", msg);
            } else {
                Alert.alert("Server Error", e.response?.data?.error || "Failed to save item.");
            }
        } finally {
            setProcessing(false);
        }
    };

    const setItemAvailability = async (item: any, newStatus: boolean) => {
        if (item.isAvailable === newStatus) return;
        try {
            setMenu(prev => prev.map(m => m.id === item.id ? { ...m, isAvailable: newStatus } : m));
            const res = await client.put(`/menu/${item.id}`, { isAvailable: newStatus });
            setMenu(prev => prev.map(m => m.id === item.id ? res.data : m));
        } catch (e: any) {
            fetchMenu();
            Alert.alert("Global Error", "Failed to update stock status.");
        }
    };

    const setItemVisibility = async (item: any, newStatus: boolean) => {
        if (item.isActive === newStatus) return;
        try {
            setMenu(prev => prev.map(m => m.id === item.id ? { ...m, isActive: newStatus } : m));
            await client.put(`/menu/${item.id}`, { isActive: newStatus });
        } catch (e: any) {
            fetchMenu();
            Alert.alert("Error", "Failed to update visibility.");
        }
    };

    const deleteItem = (id: string) => {
        Alert.alert("CRITICAL: Delete Item", "This item will be permanently removed. Continue?", [
            { text: "CANCEL", style: 'cancel' },
            {
                text: "DELETE", style: 'destructive', onPress: async () => {
                    try {
                        await client.delete(`/menu/${id}`);
                        setMenu(prev => prev.filter(m => m.id !== id));
                    } catch (e) {
                        Alert.alert("Error", "Delete failed.");
                    }
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
            formData.append('file', { uri: result.assets[0].uri, name: result.assets[0].name, type: 'text/csv' } as any);
            const res = await client.post('/menu/bulk-csv', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            setBulkItems(res.data.suggestedItems);
            setBulkModalVisible(true);
        } catch (e) { Alert.alert("Upload Error", "Failed to process CSV"); } finally { setProcessing(false); }
    };

    const handleImageScan = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 1 });
            if (result.canceled) return;
            setProcessing(true);
            const formData = new FormData();
            formData.append('image', { uri: result.assets[0].uri, name: 'menu.jpg', type: 'image/jpeg' } as any);
            const res = await client.post('/menu/extract-image', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            setBulkItems(prev => [...prev, ...res.data.suggestedItems]);
            setBulkModalVisible(true);
        } catch (e) { Alert.alert("Scan Error", "Failed to scan menu"); } finally { setProcessing(false); }
    };

    const saveBulkItems = async () => {
        try {
            setProcessing(true);
            const itemsToSave = hideDuplicates ? bulkItems.filter(i => !i.isDuplicate) : bulkItems;
            if (itemsToSave.length === 0) { setBulkModalVisible(false); return; }
            await client.post('/menu/bulk-save', { items: itemsToSave });
            setBulkModalVisible(false);
            setBulkItems([]);
            fetchMenu();
        } catch (e) { Alert.alert("Save Error", "Bulk save failed"); } finally { setProcessing(false); }
    };

    const menuCategories = Array.from(new Set(menu.map(m => m.category)));
    const existingCategories = Array.from(new Set([...menuCategories, ...sessionNewCategories])).sort();
    
    const filteredMenu = menu.filter(item => 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    const visibleCategories = Array.from(new Set(filteredMenu.map(m => m.category))).sort();

    // Modal Category Logic
    const matchingCategories = existingCategories.filter(cat => 
        cat.toLowerCase().includes(categorySearch.toLowerCase())
    );
    const showCreateNewPill = categorySearch.trim().length > 0 && !existingCategories.some(cat => cat.toLowerCase() === categorySearch.toLowerCase().trim());

    // 2.0 Hardened Category Selection
    const selectCategory = (cat: string) => {
        setCatProcessing(true);
        setTimeout(() => {
            const normalized = cat.trim();
            const matching = existingCategories.find(c => c.toLowerCase() === normalized.toLowerCase());
            
            const finalCat = matching || normalized;
            setCategorySearch(finalCat);
            setForm({ ...form, category: finalCat });
            
            // Add to session memory if it's actually new
            if (!matching) {
                setSessionNewCategories(prev => [...new Set([...prev, normalized])]);
            }

            setIsCatSelected(true);
            setCatProcessing(false);
        }, 300);
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#10B981" /></View>;

    return (
        <View style={styles.mainWrapper}>
            <StatusBar style="light" />
            <LinearGradient colors={['#020617', '#0F172A']} style={StyleSheet.absoluteFill} />
            
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <ResponsiveContainer maxWidth={900}>
                    <View style={styles.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.badge}>INVENTORY MANAGEMENT</Text>
                            <Text style={styles.title}>Menu Editor</Text>
                            <View style={[styles.statsBar, !isDesktop && { flexWrap: 'wrap' }]}>
                                <View style={styles.statItem}>
                                    <Text style={styles.statVal}>{menu.length}</Text>
                                    <Text style={styles.statLab}>ITEMS</Text>
                                </View>
                                <View style={styles.statDivider} />
                                <View style={styles.statItem}>
                                    <Text style={styles.statVal}>{existingCategories.length}</Text>
                                    <Text style={styles.statLab}>CATEGORIES</Text>
                                </View>
                                <View style={styles.statDivider} />
                                <View style={styles.statItem}>
                                    <Text style={[styles.statVal, { color: '#10B981' }]}>{menu.filter(m => m.isAvailable).length}</Text>
                                    <Text style={styles.statLab}>IN STOCK</Text>
                                </View>
                            </View>
                        </View>
                        <TouchableOpacity style={styles.addBtn} onPress={() => { 
                            setEditingItem(null); 
                            setForm({ name: '', price: '', category: '', desc: '', isAvailable: true, isActive: true }); 
                            setCategorySearch('');
                            setModalVisible(true); 
                        }}>
                            <Text style={styles.addBtnText}>+ ADD NEW ITEM</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.toolGrid, !isDesktop && { flexWrap: 'wrap' }]}>
                        <ToolCard icon="📤" label="CSV" onPress={handleCSVUpload} />
                        <ToolCard icon="📸" label="SCAN" onPress={handleImageScan} />
                        <ToolCard icon="📄" label="TEMP" onPress={() => Linking.openURL(`${API_BASE_URL}/api/menu/csv-template`)} />
                    </View>

                    <View style={styles.searchRow}>
                        <View style={styles.searchBox}>
                            <Text style={styles.searchIcon}>🔍</Text>
                            <TextInput 
                                style={styles.searchInput} 
                                placeholder="Search items or categories..." 
                                placeholderTextColor="#475569"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')}>
                                    <Text style={styles.clearBtn}>✕</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickNavScroll}>
                        <TouchableOpacity 
                            style={[styles.navPill, searchQuery === '' && styles.navPillActive]} 
                            onPress={() => setSearchQuery('')}
                        >
                            <Text style={[styles.navPillText, searchQuery === '' && styles.navPillTextActive]}>ALL ({menu.length})</Text>
                        </TouchableOpacity>
                        {existingCategories.map(cat => (
                            <TouchableOpacity 
                                key={cat} 
                                style={[styles.navPill, searchQuery === cat && styles.navPillActive]} 
                                onPress={() => setSearchQuery(cat)}
                            >
                                <Text style={[styles.navPillText, searchQuery === cat && styles.navPillTextActive]}>
                                    {cat.toUpperCase()} ({menu.filter(m => m.category === cat).length})
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {processing && <ActivityIndicator style={{ marginBottom: 20 }} color="#10B981" />}

                    {visibleCategories.map(cat => (
                        <View key={cat} style={styles.categorySection}>
                            <View style={styles.catHeader}>
                                <Text style={styles.catTitle}>{cat.toUpperCase()}</Text>
                                <View style={styles.catLine} />
                                <Text style={styles.catCount}>{filteredMenu.filter(m => m.category === cat).length} ITEMS</Text>
                            </View>
                            
                            {filteredMenu.filter(m => m.category === cat).map(item => (
                                <View key={item.id} style={[styles.itemCard, !item.isActive && { opacity: 0.6 }, !isDesktop && { flexDirection: 'column', alignItems: 'flex-start' }]}>
                                    <View style={[styles.itemInfo, !isDesktop && { marginBottom: 15 }]}>
                                        <Text style={styles.itemName}>{item.name}</Text>
                                        <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>
                                    </View>
                                    
                                    <View style={[styles.itemActions, { gap: 15 }, !isDesktop && { width: '100%', justifyContent: 'space-between' }]}>
                                        <View style={{ flexDirection: 'column', gap: 10, marginRight: 10 }}>
                                            <ModernSwitch
                                                value={item.isAvailable}
                                                onChange={(v: boolean) => setItemAvailability(item, v)}
                                                labelOn="IN STOCK"
                                                labelOff="OUT STOCK"
                                                isCompact={!isDesktop}
                                            />
                                            <ModernSwitch
                                                value={item.isActive}
                                                onChange={(v: boolean) => setItemVisibility(item, v)}
                                                labelOn="ACTIVE"
                                                labelOff="HIDDEN"
                                                isCompact={!isDesktop}
                                            />
                                        </View>
                                        
                                        <View style={{ flexDirection: 'row', gap: 10 }}>
                                            <TouchableOpacity style={styles.editIcon} onPress={() => { 
                                                setEditingItem(item); 
                                                setForm({ name: item.name, price: item.price.toString(), category: item.category, desc: item.desc || '', isAvailable: item.isAvailable, isActive: item.isActive ?? true }); 
                                                setCategorySearch(item.category);
                                                setModalVisible(true); 
                                            }}>
                                                <Text style={styles.iconTxt}>EDIT</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity onPress={() => deleteItem(item.id)} style={styles.delIcon}>
                                                <Text style={styles.delTxt}>DEL</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            ))}
                        </View>
                    ))}
                    
                    {filteredMenu.length === 0 && searchQuery !== '' && (
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyTitle}>NO ITEMS FOUND</Text>
                            <Text style={styles.emptySub}>Adjust your search or add a new menu item.</Text>
                        </View>
                    )}
                </ResponsiveContainer>
            </ScrollView>

            {/* CREATE/EDIT MODAL */}
            <Modal visible={modalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <Text style={styles.modalTitle}>{editingItem ? 'EDIT MENU ITEM' : 'ADD NEW ITEM'}</Text>
                        
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>ITEM NAME</Text>
                            <TextInput style={styles.input} placeholder="e.g. Double Truffle Burger" placeholderTextColor="#334155" value={form.name} onChangeText={v => setForm({ ...form, name: v })} />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>PRICE</Text>
                            <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#334155" keyboardType="decimal-pad" value={form.price} onChangeText={v => setForm({ ...form, price: v })} />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>CATEGORY (TYPE OR SELECT)</Text>
                            <TextInput 
                                style={[styles.input, { borderColor: '#38BDF8', backgroundColor: 'rgba(56,189,248,0.02)', marginBottom: 5 }]} 
                                placeholder="e.g. STARTERS, MAIN, DRINKS" 
                                placeholderTextColor="#334155" 
                                value={categorySearch} 
                                onChangeText={v => { 
                                    setCategorySearch(v); 
                                    setForm({ ...form, category: v }); 
                                    setIsCatSelected(false);
                                }} 
                            />
                            
                            {categorySearch.length > 0 && !isCatSelected && (
                                <View style={styles.dropdownList}>
                                    {catProcessing ? (
                                        <ActivityIndicator size="small" color="#38BDF8" style={{ marginVertical: 10 }} />
                                    ) : (
                                        <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled={true}>
                                            {matchingCategories.map(cat => (
                                                <TouchableOpacity 
                                                    key={cat} 
                                                    style={[styles.dropdownRow, categorySearch.toLowerCase() === cat.toLowerCase() && styles.dropdownRowActive]} 
                                                    onPress={() => selectCategory(cat)}
                                                >
                                                    <Text style={[styles.dropdownRowText, categorySearch.toLowerCase() === cat.toLowerCase() && styles.dropdownRowTextActive]}>
                                                        {cat.toUpperCase()}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}

                                            {showCreateNewPill && (
                                                <TouchableOpacity 
                                                    style={styles.dropdownRowNew} 
                                                    onPress={() => selectCategory(categorySearch)}
                                                >
                                                    <Text style={styles.dropdownRowTextNew}>+ CREATE NEW: "{categorySearch.toUpperCase()}"</Text>
                                                </TouchableOpacity>
                                            )}
                                        </ScrollView>
                                    )}
                                </View>
                            )}
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>DESCRIPTION (OPTIONAL)</Text>
                            <TextInput style={[styles.input, { height: 80 }]} placeholder="Ingredients, notes..." placeholderTextColor="#334155" multiline value={form.desc} onChangeText={v => setForm({ ...form, desc: v })} />
                        </View>

                        <View style={[styles.inputGroup, { marginBottom: 25 }]}>
                            <Text style={styles.inputLabel}>STOCK & VISIBILITY</Text>
                            <View style={{ gap: 15, padding: 15, backgroundColor: '#0F172A', borderRadius: 4, borderWidth: 1, borderColor: '#1E293B' }}>
                                <ModernSwitch
                                    value={form.isAvailable}
                                    onChange={(v: boolean) => setForm({ ...form, isAvailable: v })}
                                    labelOn="IN STOCK"
                                    labelOff="OUT OF STOCK"
                                />
                                <ModernSwitch
                                    value={form.isActive}
                                    onChange={(v: boolean) => setForm({ ...form, isActive: v })}
                                    labelOn="ACTIVE"
                                    labelOff="INACTIVE"
                                />
                            </View>
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setModalVisible(false)} disabled={processing}>
                                <Text style={styles.secondaryBtnText}>DISCARD</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.primaryBtn} onPress={handleSave} disabled={processing}>
                                {processing ? <ActivityIndicator color="#020617" /> : <Text style={styles.primaryBtnText}>CONFIRM & SAVE</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* BULK REVIEW MODAL Restored */}
            <Modal visible={bulkModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, { width: '95%', maxHeight: '80%' }]}>
                        <Text style={styles.modalTitle}>REVIEW STREAM</Text>
                        <ScrollView style={{ width: '100%', marginBottom: 20 }}>
                            {bulkItems.map((item, idx) => {
                                if (hideDuplicates && item.isDuplicate) return null;
                                return (
                                    <View key={idx} style={[styles.bulkRow, item.isDuplicate && styles.duplicateRow]}>
                                        <View style={{ flex: 3 }}>
                                            <TextInput 
                                                style={[styles.input, { marginBottom: 5 }]} 
                                                placeholder="Name"
                                                value={item.name} 
                                                onChangeText={v => { const n = [...bulkItems]; n[idx].name = v; setBulkItems(n); }} 
                                            />
                                            <TextInput 
                                                style={[styles.input, { fontSize: 12, color: '#38BDF8' }]} 
                                                placeholder="Category"
                                                value={item.category} 
                                                onChangeText={v => { const n = [...bulkItems]; n[idx].category = v; setBulkItems(n); }} 
                                            />
                                        </View>
                                        <TextInput 
                                            style={[styles.input, styles.bulkPrice]} 
                                            value={item.price.toString()} 
                                            keyboardType="decimal-pad" 
                                            onChangeText={v => { const n = [...bulkItems]; n[idx].price = v; setBulkItems(n); }} 
                                        />
                                        <TouchableOpacity style={styles.bulkDel} onPress={() => setBulkItems(bulkItems.filter((_,i) => i !== idx))}>
                                            <Text style={styles.bulkDelTxt}>X</Text>
                                        </TouchableOpacity>
                                    </View>
                                );
                            })}
                        </ScrollView>
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setBulkModalVisible(false)}><Text style={styles.secondaryBtnText}>CANCEL</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.primaryBtn} onPress={saveBulkItems}><Text style={styles.primaryBtnText}>FINALIZE ALL</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const ToolCard = ({ icon, label, onPress }: any) => (
    <TouchableOpacity style={styles.toolCard} onPress={onPress}>
        <Text style={styles.toolIcon}>{icon}</Text>
        <Text style={styles.toolLabel}>{label}</Text>
    </TouchableOpacity>
);

const ModernSwitch = ({ value, onChange, labelOn, labelOff, activeColor = '#10B981', inactiveColor = '#1E293B', isCompact }: any) => (
    <TouchableOpacity 
        style={{ flexDirection: 'row', alignItems: 'center', gap: isCompact ? 6 : 12 }}
        onPress={() => onChange(!value)}
        activeOpacity={0.8}
    >
        <View style={{ 
            width: isCompact ? 40 : 50, height: isCompact ? 22 : 26, borderRadius: 13, 
            backgroundColor: value ? activeColor : inactiveColor,
            justifyContent: 'center',
            paddingHorizontal: 3,
        }}>
            <View style={{
                width: isCompact ? 16 : 20, height: isCompact ? 16 : 20, borderRadius: 10, backgroundColor: '#FFFFFF',
                alignSelf: value ? 'flex-end' : 'flex-start',
                shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }
            }} />
        </View>
        <Text style={{ color: value ? activeColor : '#64748B', fontSize: isCompact ? 9 : 11, fontWeight: '900', letterSpacing: 1 }}>
            {value ? labelOn : labelOff}
        </Text>
    </TouchableOpacity>
);

const styles = StyleSheet.create({
    mainWrapper: { flex: 1, backgroundColor: '#020617' },
    center: { flex: 1, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' },
    scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 100 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40, gap: 15 },
    badge: { color: '#38BDF8', fontWeight: '900', fontSize: 10, letterSpacing: 2, marginBottom: 8 },
    title: { color: 'white', fontSize: 32, fontWeight: '900' },
    addBtn: { backgroundColor: '#10B981', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 4, minWidth: 140, alignItems: 'center' },
    addBtnText: { color: '#020617', fontWeight: '900', fontSize: 11, letterSpacing: 1 },

    statsBar: { flexDirection: 'row', alignItems: 'center', marginTop: 15, gap: 15 },
    statItem: { alignItems: 'flex-start' },
    statVal: { color: 'white', fontSize: 16, fontWeight: '900' },
    statLab: { color: '#475569', fontSize: 8, fontWeight: '900', letterSpacing: 1, marginTop: 2 },
    statDivider: { width: 1, height: 20, backgroundColor: '#1E293B' },

    toolGrid: { flexDirection: 'row', gap: 12, marginBottom: 40 },
    toolCard: { flex: 1, backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#1E293B', padding: 15, borderRadius: 4, alignItems: 'center' },
    toolIcon: { fontSize: 20, marginBottom: 8 },
    toolLabel: { color: '#64748B', fontSize: 10, fontWeight: '900', letterSpacing: 1 },

    categorySection: { marginBottom: 35 },
    catHeader: { flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 15 },
    catTitle: { color: '#334155', fontSize: 12, fontWeight: '900', letterSpacing: 3 },
    catLine: { flex: 1, height: 1, backgroundColor: '#1E293B' },
    catCount: { color: '#1E293B', fontSize: 10, fontWeight: '900' },

    itemCard: { backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#1E293B', borderRadius: 4, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    itemInfo: { flex: 1 },
    itemName: { color: 'white', fontSize: 16, fontWeight: '800' },
    itemPrice: { color: '#64748B', fontSize: 14, fontWeight: '600', marginTop: 4 },

    itemActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    stockToggle: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 2, borderWidth: 1, minWidth: 100, alignItems: 'center' },
    bgInStock: { backgroundColor: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.2)' },
    bgOutStock: { backgroundColor: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.2)' },
    stockText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
    
    editIcon: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#1E293B', borderRadius: 2 },
    iconTxt: { color: '#38BDF8', fontSize: 10, fontWeight: '900' },
    delIcon: { paddingHorizontal: 10, paddingVertical: 6 },
    delTxt: { color: '#EF4444', fontSize: 10, fontWeight: '900' },

    emptyContainer: { padding: 60, alignItems: 'center', backgroundColor: '#0F172A', borderRadius: 4, borderWidth: 1, borderColor: '#1E293B' },
    emptyTitle: { color: '#334155', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
    emptySub: { color: '#475569', fontSize: 12, marginTop: 10, textAlign: 'center' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.9)', justifyContent: 'center', alignItems: 'center' },
    modalBox: { backgroundColor: '#020617', width: '90%', maxWidth: 500, padding: 30, borderRadius: 4, borderWidth: 1, borderColor: '#1E293B' },
    modalTitle: { color: 'white', fontSize: 20, fontWeight: '900', letterSpacing: 1, marginBottom: 25 },
    inputGroup: { marginBottom: 20 },
    inputLabel: { color: '#475569', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
    input: { backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#1E293B', borderRadius: 4, padding: 15, color: 'white', fontWeight: '600' },
    
    miniLabel: { color: '#475569', fontSize: 8, fontWeight: '900', letterSpacing: 1, marginBottom: 12 },
    dropdownList: { backgroundColor: '#0F172A', borderRadius: 4, borderWidth: 1, borderColor: '#1E293B', overflow: 'hidden' },
    dropdownRow: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#1E293B', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    dropdownRowActive: { backgroundColor: 'rgba(56, 189, 248, 0.05)' },
    dropdownRowText: { color: '#64748B', fontSize: 11, fontWeight: '800' },
    dropdownRowTextActive: { color: '#38BDF8' },
    dropdownRowNew: { padding: 15, backgroundColor: 'rgba(16, 185, 129, 0.05)', borderBottomWidth: 1, borderBottomColor: '#10B981' },
    dropdownRowTextNew: { color: '#10B981', fontSize: 11, fontWeight: '900' },

    row: { flexDirection: 'row', gap: 15 },
    modalActions: { flexDirection: 'row', gap: 15, marginTop: 10 },
    primaryBtn: { flex: 2, backgroundColor: '#10B981', padding: 16, borderRadius: 4, alignItems: 'center' },
    primaryBtnText: { color: '#020617', fontWeight: '900', letterSpacing: 1 },
    secondaryBtn: { flex: 1, backgroundColor: 'transparent', padding: 16, borderRadius: 4, borderWidth: 1, borderColor: '#1E293B', alignItems: 'center' },
    secondaryBtnText: { color: '#64748B', fontWeight: '800' },
    
    // Search & Filter
    searchRow: { marginBottom: 25 },
    searchBox: { 
        backgroundColor: '#0F172A', 
        borderWidth: 1, 
        borderColor: '#1E293B', 
        borderRadius: 4, 
        flexDirection: 'row', 
        alignItems: 'center', 
        paddingHorizontal: 15,
        height: 50
    },
    searchIcon: { fontSize: 16, marginRight: 10 },
    searchInput: { flex: 1, color: 'white', fontWeight: '600' },
    clearBtn: { color: '#475569', fontSize: 16, padding: 5 },

    // Quick Nav
    quickNavScroll: { marginBottom: 30, flexDirection: 'row' },
    navPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#1E293B', marginRight: 10 },
    navPillActive: { borderColor: '#38BDF8', backgroundColor: 'rgba(56, 189, 248, 0.05)' },
    navPillText: { color: '#64748B', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
    navPillTextActive: { color: '#38BDF8' },

    // Bulk Row Enhanced
    bulkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.02)', padding: 10, borderRadius: 4, borderWidth: 1, borderColor: '#1E293B' },
    duplicateRow: { borderColor: '#F59E0B', borderLeftWidth: 4, opacity: 0.8 },
    bulkPrice: { width: 80, textAlign: 'right' },
    bulkDel: { padding: 10, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 4 },
    bulkDelTxt: { color: '#EF4444', fontWeight: '900' },

    pillToggle: { flex: 1, padding: 12, borderRadius: 4, borderWidth: 1, alignItems: 'center' },
    pillActive: { backgroundColor: 'rgba(16, 185, 129, 0.05)', borderColor: '#10B981' },
    pillInactive: { backgroundColor: 'rgba(239, 68, 68, 0.05)', borderColor: '#EF4444' },
    pillActiveVis: { backgroundColor: 'rgba(56, 189, 248, 0.05)', borderColor: '#38BDF8' },
    pillInactiveVis: { backgroundColor: 'rgba(100, 116, 139, 0.05)', borderColor: '#64748B' },
    pillText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    pillTextActive: { color: '#10B981' },
    pillTextInactive: { color: '#EF4444' },
    pillTextActiveVis: { color: '#38BDF8' },
    pillTextInactiveVis: { color: '#64748B' },
});
