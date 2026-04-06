import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, SafeAreaView, Platform, Share, TextInput, useWindowDimensions } from 'react-native';
import client from '../api/client';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import ResponsiveContainer from '../components/ResponsiveContainer';

export default function AdminTableManagementScreen({ navigation }: any) {
    const [tables, setTables] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [qrModalVisible, setQrModalVisible] = useState(false);
    const [selectedTable, setSelectedTable] = useState<any>(null);
    const [newTableNumber, setNewTableNumber] = useState('');
    const [newTableDesc, setNewTableDesc] = useState('');
    const [newTableCapacity, setNewTableCapacity] = useState('');
    const [showAddInput, setShowAddInput] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const qrRef = useRef<any>(null);
    const { width } = useWindowDimensions();
    const isDesktop = width > 768;

    const [statusMsg, setStatusMsg] = useState('');
    const [confirmModal, setConfirmModal] = useState<{ visible: boolean; title: string; message: string; onConfirm: () => void }>({ visible: false, title: '', message: '', onConfirm: () => {} });

    const fetchTables = useCallback(async () => {
        try {
            const res = await client.get('/session/tables');
            setTables(res.data);
        } catch (e: any) {
            console.error("Fetch tables failed");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTables();
    }, [fetchTables]);

    const showStatus = (msg: string) => {
        setStatusMsg(msg);
        setTimeout(() => setStatusMsg(''), 3000);
    };

    const askConfirm = (title: string, message: string, onConfirm: () => void) => {
        setConfirmModal({ visible: true, title, message, onConfirm });
    };

    const addTable = async () => {
        const numText = String(newTableNumber).replace(/[^0-9]/g, '').trim();
        const num = parseInt(numText);
        
        if (!numText || isNaN(num)) {
            showStatus('⚠ Enter a valid table number (digits only)');
            return;
        }
        
        try {
            setSubmitting(true);
            const cap = parseInt(newTableCapacity) || 4;
            const payload: any = { 
                number: num,
                capacity: cap
            };
            if (newTableDesc.trim()) {
                payload.desc = newTableDesc.trim();
            }
            const res = await client.post('/session/tables', payload);
            setTables(prev => [...prev, res.data].sort((a,b) => a.number - b.number));
            setNewTableNumber('');
            setNewTableDesc('');
            setNewTableCapacity('');
            setShowAddInput(false);
            showStatus(`✅ Table ${num} created successfully`);
        } catch (e: any) {
            showStatus(`❌ ${e.response?.data?.error || 'Failed to create table'}`);
        } finally {
            setSubmitting(false);
        }
    };

    const deleteTable = (id: string, number: number) => {
        askConfirm(
            'Delete Table?',
            `Table ${number} and all its active sessions will be permanently removed.`,
            async () => {
                try {
                    await client.delete(`/session/tables/${id}`);
                    setTables(prev => prev.filter(t => t.id !== id));
                    showStatus(`✅ Table ${number} deleted`);
                } catch (e: any) {
                    showStatus('❌ Could not delete table');
                }
            }
        );
    };

    const showQr = (table: any) => {
        setSelectedTable(table);
        setQrModalVisible(true);
    };

    const handleRegenerateQR = () => {
        if (!selectedTable) return;
        askConfirm(
            'Change QR Code?',
            'This will invalidate ALL physical QR codes for this table. Old codes become dead instantly.',
            async () => {
                try {
                    setSubmitting(true);
                    const res = await client.post(`/session/tables/${selectedTable.id}/regenerate-qr`);
                    setTables(prev => prev.map(t => t.id === selectedTable.id ? res.data.table : t));
                    setSelectedTable(res.data.table);
                    showStatus('✅ QR changed — old codes are now dead');
                } catch (e: any) {
                    showStatus('❌ Failed to change QR');
                } finally {
                    setSubmitting(false);
                }
            }
        );
    };

    const handleDownloadQR = () => {
        if (Platform.OS === 'web' && qrRef.current) {
            qrRef.current.toDataURL((data: string) => {
                const link = document.createElement('a');
                link.download = `Table_${selectedTable?.number}_QR.png`;
                // toDataURL returns raw base64, need proper data URI prefix for valid PNG
                link.href = data.startsWith('data:') ? data : `data:image/png;base64,${data}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        } else if (qrRef.current) {
            qrRef.current.toDataURL((data: string) => {
                Share.share({ message: `Table ${selectedTable?.number} QR`, url: `data:image/png;base64,${data}` });
            });
        }
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#10B981" /></View>;

    return (
        <View style={styles.mainWrapper}>
            <StatusBar style="light" />
            <LinearGradient colors={['#020617', '#0F172A']} style={StyleSheet.absoluteFill} />
            
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <ResponsiveContainer maxWidth={1000}>
                    <View style={[styles.header, !isDesktop && { flexDirection: 'column', gap: 20 }]}>
                        <View>
                            <Text style={styles.badge}>SPACE MANAGEMENT</Text>
                            <Text style={styles.title}>Table Control</Text>
                        </View>
                        {!showAddInput ? (
                            <TouchableOpacity style={[styles.addBtn, !isDesktop && { width: '100%', alignItems: 'center' }]} onPress={() => setShowAddInput(true)}>
                                <Text style={styles.addBtnText}>+ ADD TABLE</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={[styles.cancelBtn, !isDesktop && { width: '100%', alignItems: 'center' }]} onPress={() => setShowAddInput(false)}>
                                <Text style={styles.cancelBtnText}>DISCARD</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Inline status message */}
                    {statusMsg !== '' && (
                        <View style={{ backgroundColor: '#0F172A', borderWidth: 1, borderColor: statusMsg.includes('✅') ? '#10B981' : statusMsg.includes('⚠') ? '#F59E0B' : '#EF4444', borderRadius: 4, padding: 14, marginBottom: 20 }}>
                            <Text style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>{statusMsg}</Text>
                        </View>
                    )}

                    {showAddInput && (
                        <View style={styles.addInputBox}>
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>INITIALIZE TABLE NUMBER</Text>
                                <View style={[styles.inputRow, !isDesktop && { flexDirection: 'column', gap: 15 }]}>
                                    <View style={{ flex: 1, gap: 10 }}>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Table No. (Digits only)"
                                            placeholderTextColor="#334155"
                                            keyboardType="numeric"
                                            value={newTableNumber}
                                            onChangeText={(text) => setNewTableNumber(text.replace(/[^0-9]/g, ''))}
                                            autoFocus
                                        />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Desc (e.g. Window Seat)"
                                            placeholderTextColor="#334155"
                                            value={newTableDesc}
                                            onChangeText={setNewTableDesc}
                                        />
                                    </View>
                                    <View style={[isDesktop ? { flexDirection: 'row', gap: 12, flex: 0.8 } : { flexDirection: 'column', gap: 12 }]}>
                                        <TextInput
                                            style={[styles.input, isDesktop ? { flex: 0.5 } : { width: '100%' }]}
                                            placeholder="Seats (e.g. 4)"
                                            placeholderTextColor="#334155"
                                            keyboardType="numeric"
                                            value={newTableCapacity}
                                            onChangeText={(text) => setNewTableCapacity(text.replace(/[^0-9]/g, ''))}
                                        />
                                        <TouchableOpacity style={[styles.confirmBtn, !isDesktop && { paddingVertical: 18 }]} onPress={addTable} disabled={submitting}>
                                            {submitting ? <ActivityIndicator color="#020617" /> : <Text style={styles.confirmBtnText}>CREATE TABLE</Text>}
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        </View>
                    )}

                    <View style={styles.grid}>
                        {tables.map(table => (
                            <View key={table.id} style={[styles.tableCard, { width: width < 480 ? '100%' : width < 768 ? '47%' : '23%' }]}>
                                <View style={styles.tableHead}>
                                    <View>
                                        <Text style={styles.tableNum}>T-{table.number}</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                            <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '800' }}>SEATS: {table.capacity || 4}</Text>
                                            {table.desc ? <Text style={{ color: '#475569', fontSize: 10 }}>•</Text> : null}
                                            {table.desc ? <Text style={{ color: '#64748B', fontSize: 10, fontWeight: '700' }}>{table.desc}</Text> : null}
                                        </View>
                                    </View>
                                    <View style={styles.statusDot} />
                                </View>
                                
                                <View style={styles.cardActions}>
                                    <TouchableOpacity style={styles.actionBtn} onPress={() => showQr(table)}>
                                        <Text style={styles.actionBtnText}>QR CODE</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.delBtn} onPress={() => deleteTable(table.id, table.number)}>
                                        <Text style={styles.delBtnText}>DEL</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>

                    {tables.length === 0 && !showAddInput && (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyTxt}>NO TABLES INITIALIZED</Text>
                            <Text style={styles.emptySub}>Start by adding your first table to generate QR codes.</Text>
                        </View>
                    )}
                </ResponsiveContainer>
            </ScrollView>

            {/* QR MODAL */}
            <Modal visible={qrModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <Text style={styles.modalTitle}>T-{selectedTable?.number} — QR CODE</Text>
                        
                        <View style={styles.qrContainer}>
                            <QRCode
                                value={selectedTable?.qrCodeUrl || 'N/A'}
                                size={220}
                                getRef={(ref: any) => (qrRef.current = ref)}
                            />
                        </View>
                        
                        <View style={styles.qrMeta}>
                            <Text style={styles.metaLabel}>ACCESS URL</Text>
                            <Text style={styles.metaValue} numberOfLines={1}>{selectedTable?.qrCodeUrl}</Text>
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.downloadBtn} onPress={handleDownloadQR}>
                                <Text style={styles.downloadBtnText}>⬇ DOWNLOAD QR</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.regenBtn} onPress={handleRegenerateQR} disabled={submitting}>
                                {submitting ? <ActivityIndicator color="#020617" /> : <Text style={styles.regenBtnText}>CHANGE QR & DEACTIVATE EARLIER</Text>}
                            </TouchableOpacity>
                            
                            <TouchableOpacity style={styles.closeBtn} onPress={() => setQrModalVisible(false)}>
                                <Text style={styles.closeBtnText}>CLOSE</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* CUSTOM CONFIRM MODAL — replaces all native alerts */}
            <Modal visible={confirmModal.visible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, { maxWidth: 400 }]}>
                        <Text style={styles.modalTitle}>{confirmModal.title}</Text>
                        <Text style={{ color: '#94A3B8', fontSize: 14, lineHeight: 22, marginBottom: 30, textAlign: 'center' }}>{confirmModal.message}</Text>
                        <View style={{ width: '100%', gap: 12 }}>
                            <TouchableOpacity 
                                style={{ backgroundColor: '#EF4444', paddingVertical: 15, borderRadius: 4, alignItems: 'center' }} 
                                onPress={() => { setConfirmModal(prev => ({ ...prev, visible: false })); confirmModal.onConfirm(); }}
                            >
                                <Text style={{ color: 'white', fontWeight: '900', letterSpacing: 1 }}>YES, PROCEED</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={styles.closeBtn} 
                                onPress={() => setConfirmModal(prev => ({ ...prev, visible: false }))}
                            >
                                <Text style={styles.closeBtnText}>CANCEL</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    mainWrapper: { flex: 1, backgroundColor: '#020617' },
    center: { flex: 1, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' },
    scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 100 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 },
    badge: { color: '#F59E0B', fontWeight: '900', fontSize: 10, letterSpacing: 2, marginBottom: 8 },
    title: { color: 'white', fontSize: 32, fontWeight: '900' },
    addBtn: { backgroundColor: '#10B981', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 4 },
    addBtnText: { color: '#020617', fontWeight: '900', fontSize: 11 },
    cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#334155', borderRadius: 4 },
    cancelBtnText: { color: '#64748B', fontWeight: '800', fontSize: 11 },

    addInputBox: { backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#1E293B', padding: 25, borderRadius: 4, marginBottom: 30 },
    inputGroup: { },
    inputLabel: { color: '#475569', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 12 },
    inputRow: { flexDirection: 'row', gap: 12 },
    input: { flex: 1, backgroundColor: '#020617', borderWidth: 1, borderColor: '#1E293B', borderRadius: 4, padding: 15, color: 'white', fontWeight: '700', fontSize: 18 },
    confirmBtn: { backgroundColor: '#10B981', paddingHorizontal: 25, justifyContent: 'center', borderRadius: 4 },
    confirmBtnText: { color: '#020617', fontWeight: '900', fontSize: 12 },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15 },
    tableCard: { backgroundColor: '#0F172A', width: '47%', borderWidth: 1, borderColor: '#1E293B', borderRadius: 4, padding: 20 },
    tableHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    tableNum: { color: 'white', fontSize: 24, fontWeight: '900' },
    statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
    
    cardActions: { gap: 8 },
    actionBtn: { backgroundColor: '#1E293B', padding: 10, borderRadius: 2, alignItems: 'center' },
    actionBtnText: { color: '#38BDF8', fontWeight: '800', fontSize: 10 },
    delBtn: { padding: 10, alignItems: 'center' },
    delBtnText: { color: '#475569', fontSize: 10, fontWeight: '900' },

    emptyState: { padding: 80, alignItems: 'center' },
    emptyTxt: { color: '#1E293B', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
    emptySub: { color: '#334155', fontSize: 12, marginTop: 10, textAlign: 'center' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.95)', justifyContent: 'center', alignItems: 'center' },
    modalBox: { backgroundColor: '#020617', width: '90%', maxWidth: 450, padding: 30, borderRadius: 4, borderWidth: 1, borderColor: '#1E293B', alignItems: 'center' },
    modalTitle: { color: 'white', fontSize: 16, fontWeight: '900', letterSpacing: 1, marginBottom: 30 },
    qrContainer: { backgroundColor: 'white', padding: 15, borderRadius: 4, marginBottom: 30 },
    qrMeta: { width: '100%', marginBottom: 30 },
    metaLabel: { color: '#334155', fontSize: 10, fontWeight: '900', marginBottom: 8 },
    metaValue: { color: '#64748B', fontSize: 11, fontStyle: 'italic' },
    
    modalActions: { width: '100%', gap: 12 },
    downloadBtn: { backgroundColor: '#38BDF8', paddingVertical: 15, borderRadius: 4, alignItems: 'center' },
    downloadBtnText: { color: '#020617', fontWeight: '900', letterSpacing: 1 },
    regenBtn: { backgroundColor: '#F59E0B', paddingVertical: 15, borderRadius: 4, alignItems: 'center' },
    regenBtnText: { color: '#020617', fontWeight: '900', letterSpacing: 1 },
    closeBtn: { paddingVertical: 15, borderRadius: 4, borderWidth: 1, borderColor: '#1E293B', alignItems: 'center' },
    closeBtnText: { color: '#64748B', fontWeight: '800' }
});
