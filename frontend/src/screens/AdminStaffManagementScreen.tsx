import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, SafeAreaView, Platform, useWindowDimensions } from 'react-native';
import client from '../api/client';
import { StatusBar } from 'expo-status-bar';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function AdminStaffManagementScreen({ navigation }: any) {
    const { width } = useWindowDimensions();
    const isDesktop = width > 768;
    
    const [staff, setStaff] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', password: '', role: 'WAITER', isActive: true });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [showInactive, setShowInactive] = useState(false);

    useEffect(() => {
        fetchStaff();
    }, []);

    const fetchStaff = async () => {
        try {
            const res = await client.get('/admin/staff');
            setStaff(res.data);
        } catch (e) {
            Alert.alert("Error", "Failed to fetch staff");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setFormError('');
        if (!form.name || !form.email || (!editingId && !form.password)) {
            setFormError("Please fill all required fields");
            return;
        }
        setSaving(true);
        try {
            const normalizedEmail = form.email.toLowerCase().trim();
            if (editingId) {
                // Strip empty password so backend doesn't receive it
                const updateData: any = { name: form.name, email: normalizedEmail, role: form.role, isActive: form.isActive };
                if (form.password) updateData.password = form.password;
                const res = await client.put(`/admin/staff/${editingId}`, updateData);
                setStaff(prev => prev.map(s => s.id === editingId ? { ...s, ...res.data } : s));
            } else {
                const res = await client.post('/admin/staff', { ...form, email: normalizedEmail });
                setStaff(prev => [...prev, res.data]);
                Alert.alert("Success", `Staff member ${form.name} created successfully.`);
            }
            closeModal();
        } catch (e: any) {
            const details = e.response?.data?.details;
            if (details && Array.isArray(details)) {
                const combinedMsg = details.map((d: any) => `${d.field}: ${d.message}`).join('\n');
                setFormError(combinedMsg);
            } else {
                setFormError(e.response?.data?.error || "Failed to save staff member");
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id: string) => {
        Alert.alert("Archive Staff", "This staff member will be removed from your active list but their past history and data will be safely preserved in your records.", [
            { text: "Cancel", style: "cancel" },
            { text: "Confirm Archive", style: "destructive", onPress: async () => {
                try {
                    await client.delete(`/admin/staff/${id}`);
                    fetchStaff(); 
                } catch (e: any) {
                    Alert.alert("Error", e.response?.data?.error || "Archive failed");
                }
            }}
        ]);
    };

    const openEditModal = (member: any) => {
        setEditingId(member.id);
        setForm({ name: member.name, email: member.email, password: '', role: member.role, isActive: member.isActive ?? true });
        setModalVisible(true);
    };

    const closeModal = () => {
        setModalVisible(false);
        setEditingId(null);
        setForm({ name: '', email: '', password: '', role: 'WAITER', isActive: true });
        setFormError('');
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#38BDF8" /></View>;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />
            <ScrollView contentContainerStyle={{ padding: 20 }}>
                <ResponsiveContainer maxWidth={800}>
                    <View style={[styles.headerRow, !isDesktop && { flexDirection: 'column', alignItems: 'flex-start', gap: 15 }]}>
                        <View>
                            <Text style={styles.title}>Staff Hub</Text>
                            <TouchableOpacity 
                                style={{ marginTop: 8 }} 
                                onPress={() => setShowInactive(!showInactive)}>
                                <Text style={{ color: '#38BDF8', fontWeight: '800', fontSize: 13 }}>
                                    {showInactive ? '↩ HIDE ARCHIVED' : '📋 VIEW ARCHIVED STAFF'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity style={[styles.addBtn, !isDesktop && { width: '100%', alignItems: 'center' }]} onPress={() => setModalVisible(true)}>
                            <Text style={styles.addBtnText}>+ New Staff</Text>
                        </TouchableOpacity>
                    </View>

                    {staff.filter(m => showInactive ? true : m.isActive !== false).length === 0 ? (
                        <View style={styles.empty}>
                            <Text style={styles.emptyText}>{showInactive ? 'No archived staff found.' : 'No active staff found.'}</Text>
                        </View>
                    ) : (
                        staff
                            .filter(m => showInactive ? true : m.isActive !== false)
                            .sort((a,b) => (a.isActive === false ? 1 : -1)) // Show inactive at bottom
                            .map(member => (
                            <View key={member.id} style={[styles.staffCard, member.isActive === false && { opacity: 0.5, borderStyle: 'dashed', borderColor: '#334155' }, !isDesktop && { flexDirection: 'column', alignItems: 'flex-start' }]}>
                                <View style={[styles.cardInfo, !isDesktop && { marginBottom: 15 }]}>
                                    <Text style={styles.memberName}>{member.name} {member.isActive === false ? '(Archived)' : ''}</Text>
                                    <Text style={styles.memberEmail}>{member.email}</Text>
                                    <View style={{ flexDirection: 'row', marginTop: 8, gap: 10 }}>
                                        <View style={[styles.roleBadge, member.role === 'CHEF' ? styles.chefBg : styles.waiterBg]}>
                                            <Text style={styles.roleText}>{member.role}</Text>
                                        </View>
                                        {member.isActive === false && (
                                            <View style={[styles.roleBadge, { backgroundColor: '#334155' }]}>
                                                <Text style={styles.roleText}>INACTIVE</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                                <View style={[styles.actionBlock, !isDesktop && { width: '100%', justifyContent: 'flex-start' }]}>
                                    <TouchableOpacity style={[styles.editBtn, !isDesktop && { flex: 1, alignItems: 'center' }]} onPress={() => openEditModal(member)}>
                                        <Text style={styles.editBtnText}>{member.isActive === false ? 'Reactivate' : 'Edit'}</Text>
                                    </TouchableOpacity>
                                    {member.isActive !== false && (
                                        <TouchableOpacity style={[styles.delBtn, !isDesktop && { flex: 1, alignItems: 'center' }]} onPress={() => handleDelete(member.id)}>
                                            <Text style={styles.delBtnText}>Archive</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        ))
                    )}
                </ResponsiveContainer>
            </ScrollView>

            <Modal visible={modalVisible} transparent animationType="slide">
                <View style={styles.modalBg}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{editingId ? 'Edit Staff Member' : 'Add Staff Member'}</Text>
                        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
                        <TextInput style={[styles.input, formError && !form.name ? styles.inputError : null]} placeholder="Full Name" placeholderTextColor="#64748B" value={form.name} onChangeText={v => { setForm({ ...form, name: v }); setFormError(''); }} />
                        <TextInput style={[styles.input, formError && !form.email ? styles.inputError : null]} placeholder="Email" placeholderTextColor="#64748B" keyboardType="email-address" value={form.email} onChangeText={v => { setForm({ ...form, email: v }); setFormError(''); }} autoCapitalize="none" />
                        <TextInput style={[styles.input, formError && !editingId && !form.password ? styles.inputError : null]} placeholder={editingId ? "Leave blank to keep same password" : "Password"} placeholderTextColor="#64748B" secureTextEntry value={form.password} onChangeText={v => { setForm({ ...form, password: v }); setFormError(''); }} />

                        <View style={styles.roleTabs}>
                            {['WAITER', 'CHEF'].map(r => (
                                <TouchableOpacity
                                    key={r}
                                    style={[styles.roleTab, form.role === r && styles.roleTabActive]}
                                    onPress={() => setForm({ ...form, role: r })}
                                >
                                    <Text style={[styles.roleTabText, form.role === r && styles.roleTabTextActive]}>{r}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {editingId && (
                            <View style={[styles.roleTabs, { marginTop: -10 }]}>
                                {[{ label: 'Active', val: true }, { label: 'Deactivated', val: false }].map(opt => (
                                    <TouchableOpacity
                                        key={opt.label}
                                        style={[styles.roleTab, form.isActive === opt.val && styles.roleTabActive]}
                                        onPress={() => setForm({ ...form, isActive: opt.val })}
                                    >
                                        <Text style={[styles.roleTabText, form.isActive === opt.val && styles.roleTabTextActive]}>{opt.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={closeModal} disabled={saving}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity style={[styles.createBtn, saving && {opacity: 0.7}]} onPress={handleSave} disabled={saving}>
                                <Text style={styles.createBtnText}>{saving ? 'Saving...' : (editingId ? 'Save Changes' : 'Create Account')}</Text>
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
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
    title: { color: 'white', fontSize: 28, fontWeight: '800' },
    addBtn: { backgroundColor: '#38BDF8', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12 },
    addBtnText: { color: '#0F172A', fontWeight: '800' },
    staffCard: { flexDirection: 'row', backgroundColor: '#1E293B', padding: 20, borderRadius: 20, marginBottom: 12, alignItems: 'center', justifyContent: 'space-between', ...Platform.select({ web: { boxShadow: '0 4px 6px rgba(0,0,0,0.1)' } }) },
    cardInfo: { flex: 1 },
    memberName: { color: 'white', fontSize: 18, fontWeight: '700' },
    memberEmail: { color: '#94A3B8', fontSize: 14, marginTop: 4 },
    roleBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
    waiterBg: { backgroundColor: 'rgba(56, 189, 248, 0.15)' },
    chefBg: { backgroundColor: 'rgba(168, 85, 247, 0.15)' },
    roleText: { color: 'white', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
    actionBlock: { flexDirection: 'row', gap: 10 },
    editBtn: { backgroundColor: '#334155', padding: 10, borderRadius: 8 },
    editBtnText: { color: 'white', fontWeight: 'bold' },
    delBtn: { backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: 10, borderRadius: 8 },
    delBtnText: { color: '#F87171', fontWeight: 'bold' },
    empty: { marginTop: 100, alignItems: 'center' },
    emptyText: { color: '#64748B', fontSize: 16, fontStyle: 'italic' },
    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: '#0F172A', padding: 25, borderRadius: 24, width: '90%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    modalTitle: { color: 'white', fontSize: 22, fontWeight: '800', marginBottom: 20 },
    errorText: { color: '#EF4444', marginBottom: 12, textAlign: 'center', fontWeight: '500', fontSize: 14 },
    input: { backgroundColor: '#1E293B', color: 'white', padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#1E293B' },
    inputError: { borderColor: '#EF4444' },
    roleTabs: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    roleTab: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#1E293B', alignItems: 'center' },
    roleTabActive: { backgroundColor: '#38BDF8' },
    roleTabText: { color: '#94A3B8', fontWeight: '700' },
    roleTabTextActive: { color: '#0F172A' },
    modalButtons: { flexDirection: 'row', gap: 10 },
    cancelBtn: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center' },
    cancelText: { color: '#94A3B8', fontWeight: '700' },
    createBtn: { flex: 2, padding: 15, borderRadius: 12, alignItems: 'center', backgroundColor: '#38BDF8' },
    createBtnText: { color: '#0F172A', fontWeight: '800' }
});
